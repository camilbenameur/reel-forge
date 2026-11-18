"""Cost ledger (append only, one JSON line per expense) and the daily GPU spending cap.

Two ledgers:
- the reel's own ledger, ``<reel dir>/costs.jsonl``: what that reel cost, step by step;
- the machine-wide GPU ledger, ``~/.config/reelforge/gpu-spend.jsonl`` (or ``REELFORGE_GPU_LEDGER``), which carries the DAILY
  CAP (``REELFORGE_GPU_DAILY_CAP``, 3 USD by default): beyond it, no GPU job is submitted that UTC day. The check is made BEFORE a call with a conservative estimate of the whole
  call (gpu.pricing.plan_estimate), not only against what is already spent.

GPU costs are estimates: job compute time times the card rate times the measured billing factor (see gpu/pricing.py).
Nothing written here ever contains a secret.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import secrets
from .gpu.pricing import BILLING_FACTOR, estimate  # noqa: F401  (re-exported: the factor lives with the prices)

DEFAULT_DAILY_CAP_USD = 3.0
# USD per million tokens: input, output, cache read. An unknown model is counted at the most expensive rate.
LLM_PRICES: dict[str, tuple[float, float, float]] = {
    "claude-opus-5-5": (4.00, 20.00, 0.20),
    "claude-sonnet-5-5": (2.00, 10.00, 0.20),
    "claude-haiku-5-5": (0.10, 0.50, 0.01),
}
CACHE_WRITE_FACTOR = 1.25


class BudgetExceeded(RuntimeError):
    pass


def llm_cost(model: str, usage: Any) -> float:
    p_in, p_out, p_cache = LLM_PRICES.get(model, LLM_PRICES["claude-opus-5-5"])
    read = getattr(usage, "cache_read_input_tokens", 0) or 0
    written = getattr(usage, "cache_creation_input_tokens", 0) or 0
    cost = (usage.input_tokens * p_in + written * p_in * CACHE_WRITE_FACTOR + read * p_cache
            + usage.output_tokens * p_out) / 1_000_000
    return round(cost, 6)


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def gpu_ledger_path() -> Path:
    """The machine-wide GPU ledger, evaluated at call time (tests move HOME)."""
    override = os.environ.get("REELFORGE_GPU_LEDGER")
    return Path(override).expanduser() if override else secrets.config_dir() / "gpu-spend.jsonl"


@dataclass
class Ledger:
    path: Path

    def add(self, *, step: str, type_: str, cost_usd: float = 0.0, **details: Any) -> dict[str, Any]:
        line = {"ts": now(), "step": step, "type": type_, "cost_usd": round(float(cost_usd), 6), **details}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
        return line

    def lines(self) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        out = []
        for line in self.path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue            # line truncated by a hard stop: ignored, never fatal
        return out

    def total(self, type_: str | None = None, *, since: str | None = None) -> float:
        return round(sum(l.get("cost_usd", 0.0) for l in self.lines()
                         if (type_ is None or l.get("type") == type_) and (since is None or l.get("ts", "") >= since)), 6)

    def subscription_calls(self) -> list[dict[str, Any]]:
        """LLM calls made through the claude-code test mode: a reel with any of them is never publishable."""
        return [l for l in self.lines() if l.get("subscription")]


def daily_cap() -> float:
    raw = (os.environ.get("REELFORGE_GPU_DAILY_CAP") or "").strip()
    try:
        value = float(raw) if raw else DEFAULT_DAILY_CAP_USD
    except ValueError:
        return DEFAULT_DAILY_CAP_USD
    return value if value >= 0 else DEFAULT_DAILY_CAP_USD


def gpu_spend_today(ledger: Ledger | None = None) -> float:
    ledger = ledger or Ledger(gpu_ledger_path())
    start = datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00")
    return ledger.total("gpu", since=start)


def check_gpu_budget(estimate_usd: float = 0.0, ledger: Ledger | None = None) -> None:
    """Raise BudgetExceeded if today's GPU spend plus the estimate goes over the daily cap."""
    spent = gpu_spend_today(ledger)
    cap = daily_cap()
    if spent + estimate_usd > cap:
        raise BudgetExceeded(f"daily GPU cap reached: {spent:.3f} USD spent + {estimate_usd:.3f} USD estimated > "
                             f"{cap:.2f} USD (REELFORGE_GPU_DAILY_CAP)")


def gpu_journal(reel_ledger: Ledger | None = None, step: str = "?") -> Callable[[str, Any], None]:
    """Callable for GPUClient(journal=...): every ended job (completed, failed, timed out, cancelled) is written to the machine
    ledger and the reel ledger."""
    from .gpu import pricing

    def record(function: str, res: Any) -> None:
        gpu = str(res.output.get("gpu") or "?")
        cost = pricing.estimate(gpu, res.compute_s)
        details = {"function": function, "job": res.job, "gpu": gpu, "compute_s": res.compute_s,
                   "queue_s": res.queue_s, "estimated": True}
        status = (getattr(res, "extra", None) or {}).get("status")
        if status:
            details["status"] = status
        Ledger(gpu_ledger_path()).add(step=step, type_="gpu", cost_usd=cost, **details)
        if reel_ledger is not None:
            reel_ledger.add(step=step, type_="gpu", cost_usd=cost, **details)

    return record
