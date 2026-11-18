"""HTTP client for the serverless GPU functions (RunPod app "reelforge-voice", deployed by `python -m reelforge.gpu deploy`).

Standard library only: the pipeline needs neither the RunPod SDK nor torch. The SDK is only used to deploy (workers/).

Routing: RunPod resolves the endpoint of a deployed function from three headers (application, environment, function name)
on the fixed id "flash"; no endpoint id is stored here.

    POST {base}/flash/run            {"input": {"request": {...}}}   -> {"id": job, "status": "IN_QUEUE"}
    GET  {base}/flash/status/{job}                                   -> {"status", "output", "delayTime", "executionTime"}
    POST {base}/flash/cancel/{job}

Guarantees:
- a job that exceeds its time limit, or whose polling fails, or that is interrupted (Ctrl-C), is CANCELLED before the error is
  raised (never an orphan billed computation);
- every job that ends (completed, failed, timed out, cancelled) is journaled, with an estimate when RunPod gave no timing;
- transient errors (network, 429, 5xx) are retried with growing waits; errors in the request itself are never retried. A
  submission (POST /run) is NOT retried after a 5xx or a timeout, since the job may exist already (a duplicate would be billed
  and never cancelled): only 429 and connection refusals, where the job cannot have been created, are retried;
- the key only ever leaves in the Authorization header; every error message goes through `secrets.redact`.
"""

from __future__ import annotations

import json
import os
import socket
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

from ..secrets import redact

DEFAULT_BASE = "https://api.runpod.ai/v2"
DEFAULT_ENV = "default"
# RunPod application of each function. REELFORGE_GPU_APP_<FUNCTION> overrides one (trials on a copy).
APPS = {"voice": "reelforge-voice", "voice_design": "reelforge-voice"}
FINAL = {"COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"}
TRANSIENT = {408, 425, 429, 500, 502, 503, 504}
HTTP_ATTEMPTS = 5


class GPUError(RuntimeError):
    """A GPU call failed. `fixable`: the request is wrong (retrying is pointless); `job`: the RunPod job id."""

    def __init__(self, message: str, *, fixable: bool = False, job: str | None = None, status: int | None = None):
        super().__init__(redact(message))
        self.fixable, self.job, self.status = fixable, job, status


@dataclass
class Result:
    """Output of a GPU function and what RunPod says about it (waiting time, billed compute time)."""

    output: dict[str, Any]
    job: str
    queue_s: float                # queue + cold start (delayTime)
    compute_s: float              # execution of the function (executionTime)
    total_s: float                # measured client side, upload and download included
    function: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


Journal = Callable[[str, Result], None]


class GPUClient:
    def __init__(self, key: str | None = None, *, apps: dict[str, str] | None = None, environment: str | None = None,
                 base: str | None = None, opener: Callable[..., Any] = urllib.request.urlopen,
                 sleep: Callable[[float], None] = time.sleep, clock: Callable[[], float] = time.monotonic,
                 journal: Journal | None = None):
        self._key = (key or os.environ.get("RUNPOD_API_KEY") or "").strip()
        if not self._key:
            raise GPUError("RUNPOD_API_KEY is missing: put it in ~/.config/reelforge/secrets.env (mode 600) "
                           "or in the repository .env", fixable=True)
        self.apps = {**APPS, **(apps or {})}
        self.environment = environment or os.environ.get("REELFORGE_GPU_ENV") or DEFAULT_ENV
        self.base = (base or os.environ.get("RUNPOD_ENDPOINT_BASE_URL") or DEFAULT_BASE).rstrip("/")
        self._open, self._sleep, self._clock = opener, sleep, clock
        self._journal = journal
        self._settled: set[str] = set()       # jobs that ended or were cancelled: journaled once, cancelled once

    # --- HTTP -------------------------------------------------------------------------------------------------------------

    def app_of(self, function: str) -> str:
        return os.environ.get(f"REELFORGE_GPU_APP_{function.upper()}") or self.apps.get(function) or function

    def _headers(self, function: str) -> dict[str, str]:
        return {"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "reelforge/1",
                "Authorization": f"Bearer {self._key}", "X-Flash-App": self.app_of(function),
                "X-Flash-Environment": self.environment, "X-Flash-Endpoint": function}

    @staticmethod
    def _never_created(exc: BaseException) -> bool:
        """True if the request cannot have reached RunPod (connection refused, DNS failure): a submission may be repeated."""
        reason = getattr(exc, "reason", exc)
        return isinstance(reason, (ConnectionRefusedError, socket.gaierror))

    def _http(self, method: str, path: str, function: str, body: Any = None, timeout: float = 60.0, *,
              safe_to_repeat: bool = True) -> dict[str, Any]:
        """`safe_to_repeat=False` (job submission): retry only when the job cannot have been created."""
        data = None if body is None else json.dumps(body).encode("utf-8")
        last: GPUError | None = None
        for attempt in range(HTTP_ATTEMPTS):
            req = urllib.request.Request(f"{self.base}/flash/{path}", data=data, method=method,
                                         headers=self._headers(function))
            try:
                with self._open(req, timeout=timeout) as r:
                    raw = r.read()
                return json.loads(raw.decode("utf-8") or "{}")
            except urllib.error.HTTPError as exc:
                detail = exc.read(400).decode("utf-8", "replace").strip()
                last = GPUError(f"RunPod {method} {path.split('/')[0]}: HTTP {exc.code} {detail}", status=exc.code,
                                fixable=exc.code in (400, 401, 403, 404, 413, 422))
                if exc.code not in TRANSIENT or (not safe_to_repeat and exc.code != 429):
                    raise last from None
            except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
                last = GPUError(f"RunPod unreachable ({type(exc).__name__}: {exc})")
                if not safe_to_repeat and not self._never_created(exc):
                    raise last from None
            if attempt < HTTP_ATTEMPTS - 1:
                self._sleep(min(30.0, 1.5 * 2 ** attempt))
        assert last is not None
        raise last

    # --- jobs -------------------------------------------------------------------------------------------------------------

    def submit(self, function: str, request: dict[str, Any], *, job_timeout_s: int | None = None) -> str:
        body: dict[str, Any] = {"input": {"request": request}}
        if job_timeout_s:
            body["policy"] = {"executionTimeout": int(job_timeout_s * 1000)}
        rep = self._http("POST", "run", function, body, timeout=120.0, safe_to_repeat=False)
        job = rep.get("id")
        if not job:
            raise GPUError(f"RunPod returned no job id for {function}: {str(rep)[:300]}")
        return job

    def cancel(self, function: str, job: str) -> None:
        try:
            self._http("POST", f"cancel/{job}", function, {}, timeout=30.0)
        except GPUError:
            pass

    def _record(self, function: str, job: str, status: str, output: dict[str, Any], queue_s: float, compute_s: float,
                start: float) -> Result:
        """Journal a job that ended (once): the billing time RunPod reports, or the caller's estimate."""
        res = Result(output=output, job=job, queue_s=queue_s, compute_s=compute_s,
                     total_s=round(self._clock() - start, 3), function=function, extra={"status": status})
        if job not in self._settled:
            self._settled.add(job)
            if self._journal is not None:
                self._journal(function, res)
        return res

    def _abandon(self, function: str, job: str, start: float, status: str = "CANCELLED") -> None:
        """Cancel a job that is still billing and journal a conservative estimate: the whole time since `start` at the
        card rate (unknown card: the default rate). No-op for a job that already ended or was already abandoned."""
        if job in self._settled:
            return
        self.cancel(function, job)
        elapsed = round(max(0.0, self._clock() - start), 3)
        self._record(function, job, status, {"gpu": "?", "estimated_from_elapsed": True}, 0.0, elapsed, start)

    def wait(self, function: str, job: str, *, timeout_s: float = 1800.0, t0: float | None = None) -> Result:
        start = self._clock() if t0 is None else t0
        step = 1.0
        try:
            while True:
                state = self._http("GET", f"status/{job}", function, timeout=60.0)
                status = state.get("status")
                if status in FINAL:
                    break
                if self._clock() - start > timeout_s:
                    self._abandon(function, job, start, "TIMED_OUT")
                    raise GPUError(f"{function}: job {job} not finished after {timeout_s:.0f} s (last state {status}); "
                                   "cancelled", job=job)
                self._sleep(step)
                step = min(step * 1.4, 5.0)
        except GPUError as exc:
            if exc.job is None:                    # the polling itself failed: the job may still be running
                self._abandon(function, job, start)
            raise
        except BaseException:                      # Ctrl-C and the like
            self._abandon(function, job, start)
            raise
        output = state.get("output")
        queue_s = round((state.get("delayTime") or 0) / 1000, 3)
        compute_s = round((state.get("executionTime") or 0) / 1000, 3)
        if status != "COMPLETED":
            self._record(function, job, status, output if isinstance(output, dict) else {}, queue_s, compute_s, start)
            raise GPUError(f"{function}: job {job} {status}: {str(state.get('error') or output)[:600]}", job=job)
        if not isinstance(output, dict):
            self._record(function, job, status, {}, queue_s, compute_s, start)
            raise GPUError(f"{function}: unexpected output ({type(output).__name__})", job=job)
        res = self._record(function, job, status, output, queue_s, compute_s, start)
        if not output.get("ok", False):
            raise GPUError(f"{function}: {output.get('error') or 'failure without a message'}",
                           fixable=bool(output.get("correctable")), job=job)
        return res

    def call(self, function: str, request: dict[str, Any], *, timeout_s: float = 1800.0) -> Result:
        t0 = self._clock()
        job = self.submit(function, request)
        return self.wait(function, job, timeout_s=timeout_s, t0=t0)

    def call_many(self, function: str, requests: list[dict[str, Any]], *, timeout_s: float = 1800.0) -> list[Result]:
        """Submit every request at once (RunPod spreads them over its workers), then wait for each; order kept.

        If one fails, the jobs still running are cancelled (and journaled with an estimate) before the error is raised."""
        t0 = self._clock()
        jobs: list[str] = []
        try:
            for r in requests:
                jobs.append(self.submit(function, r))
            return [self.wait(function, j, timeout_s=timeout_s, t0=t0) for j in jobs]
        except BaseException:
            for j in jobs:
                self._abandon(function, j, t0)
            raise
