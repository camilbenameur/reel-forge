"""LLM access for the script step, with three providers chosen by ``REELFORGE_LLM`` (default ``stub``: never a paid call by
accident):

- ``stub``: answers read from the fixtures shipped with the package (``reelforge/fixtures``), no key, no network.
- ``api``: the Anthropic Messages API, with the dedicated key ``REELFORGE_ANTHROPIC_API_KEY`` (commercial terms, billed per
  use). This is the publishable mode.
- ``claude-code``: TEST ONLY. The unmodified ``claude`` binary run as a subprocess (``claude -p``), connected to the account
  of the person who runs it. This code never reads the login token, never sends it in a header, never calls the Messages API
  with it and does not imitate the identity of the binary: the token only travels in the environment of the child process.
  API keys are removed from that environment (a key present would take precedence over the login). The consumer terms forbid
  commercial use, so every call is flagged ``subscription`` in the reel's cost ledger and the reel is marked unpublishable in
  ``state.json``.

Every call is logged to ``<reel>/costs.jsonl`` with a per-reel spending cap (``REELFORGE_LLM_BUDGET``). The ``anthropic`` SDK is
imported on the first API call only. Errors never contain a secret.
"""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Callable

from . import config, secrets
from .costs import BudgetExceeded, Ledger, llm_cost

__all__ = ["LLM", "LLMError", "LLMRefusal", "SubscriptionLimit", "LoginError", "BudgetExceeded", "extract_json",
           "find_claude", "claude_env", "FIXTURES"]

log = logging.getLogger("reelforge.llm")

FIXTURES = config.PACKAGE / "fixtures"
API_KEY_VAR = "REELFORGE_ANTHROPIC_API_KEY"
MAX_TOKENS = 16000

CLAUDE_BIN_VAR = "CLAUDE_BIN"
CLAUDE_TIMEOUT_VAR = "REELFORGE_CLAUDE_TIMEOUT"
CLAUDE_TIMEOUT_S = 900
OAUTH_TOKEN_VAR = "CLAUDE_CODE_OAUTH_TOKEN"      # never read: only tested for presence
# Never passed to the claude process: API keys and tokens, cloud-provider switches (CLAUDE_CODE_USE_*), state of a parent session.
STRIPPED_PREFIXES = ("ANTHROPIC_", "CLAUDE_CODE_", "CLAUDE_AGENT_SDK", "CLAUDECODE")
STRIPPED = (API_KEY_VAR,)
KEPT = (OAUTH_TOKEN_VAR,)
ISOLATION = {"CLAUDE_CODE_DISABLE_CLAUDE_MDS": "1", "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"}
CLAUDE_TURNS = 6
FORBIDDEN_AUTH = ("api_key", "api_key_helper", "third_party")     # `claude auth status`: not the login account
TOKEN_RE = re.compile(r"sk-ant-[A-Za-z0-9_\-]+")
LIMIT_RE = re.compile(r"hit your .{0,40}limit|usage limit|spend limit|rate.?limit|too many requests|\(429\)", re.I)
LOGIN_RE = re.compile(r"not logged in|/login|login expired|failed to authenticate|oauth|invalid api key|"
                      r"authentication|unauthorized", re.I)
INSTALL_HINT = f"install the claude binary or set {CLAUDE_BIN_VAR}=<path>"

CORRECTION = ("\n\n---\nYour previous answer was rejected for these reasons:\n- {errors}\nAnswer again with ONE complete, "
              "corrected JSON object, with no text, comment or code fence around it.")

_WARNED = False
_VERIFIED_LOGINS: set[tuple[str, ...]] = set()


class LLMError(RuntimeError):
    pass


class LLMRefusal(LLMError):
    """The model refused to answer."""


class SubscriptionLimit(LLMError):
    """Usage limit of the account reached in claude-code mode: wait for the reset, do not loop."""


class LoginError(LLMError):
    """The claude binary is not logged in to an account (never retried: someone has to act)."""


class _InvalidOutput(LLMError):
    """Output rejected by the binary (a new try is possible)."""


def _short(text: str, limit: int = 400) -> str:
    return secrets.redact(TOKEN_RE.sub("[token hidden]", " ".join(text.split())))[:limit]


def extract_json(text: str) -> Any:
    """First JSON object of an answer (a code fence or prose around it is tolerated). Raises ValueError if unreadable."""
    t = text.strip()
    m = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", t, re.S)
    if m:
        t = m.group(1)
    if not t.startswith(("{", "[")) and "{" in t and "}" in t:
        t = t[t.index("{"):t.rindex("}") + 1]
    return json.loads(t)


# --- claude binary and child environment ------------------------------------------------------------------------------------

def find_claude() -> list[str]:
    """The ``claude`` binary: CLAUDE_BIN, then the PATH, then ~/.local/bin/claude. Never modified or copied."""
    explicit = os.environ.get(CLAUDE_BIN_VAR)
    if explicit:
        found = shutil.which(explicit) or (explicit if Path(explicit).is_file() else None)
        if not found:
            raise LLMError(f"{CLAUDE_BIN_VAR}={explicit}: file not found")
        return [found]
    found = shutil.which("claude")
    if not found:
        local = Path.home() / ".local" / "bin" / "claude"
        found = str(local) if local.is_file() else None
    if not found:
        raise LLMError(f"claude binary not found: {INSTALL_HINT}")
    return [found]


def _stripped(name: str, value: str) -> bool:
    upper = name.upper()
    if upper == OAUTH_TOKEN_VAR:
        return not value.strip()                 # empty variable: as if it did not exist
    if upper in KEPT:
        return False
    # every other secret (RunPod key, other tokens loaded from .env) stays out of the child process too
    return upper in STRIPPED or upper.startswith(STRIPPED_PREFIXES) or secrets.is_sensitive(name)


def claude_env() -> dict[str, str]:
    """Environment of the claude process: no API key and no other secret (any variable whose name says KEY, TOKEN, SECRET or
    PASSWORD), no inherited session state, with isolation (no CLAUDE.md, no memory). Only the login token, if any, is copied
    as is: the binary reads it, never this code."""
    env = {n: v for n, v in os.environ.items() if not _stripped(n, v)}
    env.update(ISOLATION)
    return env


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _int(source: dict[str, Any], key: str) -> int:
    v = source.get(key)
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        return 0
    return int(v)


def _float(value: Any) -> float:
    try:
        n = float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return n if math.isfinite(n) else 0.0


def _timeout() -> float:
    raw = os.environ.get(CLAUDE_TIMEOUT_VAR) or CLAUDE_TIMEOUT_S
    try:
        return float(raw)
    except ValueError:
        raise LLMError(f"{CLAUDE_TIMEOUT_VAR}={raw!r}: a number of seconds is expected") from None


# --- the client ---------------------------------------------------------------------------------------------------------------

class LLM:
    """One client per step of a reel: ``LLM(reel, "script").json(...)``. Without a reel (experiments) there is no ledger and
    no unpublishable mark."""

    def __init__(self, reel=None, step: str = "?", *, provider: str | None = None, client: Any = None,
                 fixtures: Path | str | None = None, budget_usd: float | None | str = "env"):
        self.reel = reel
        self.step = step
        self._provider = provider
        self._client = client
        self.fixtures = Path(fixtures) if fixtures is not None else FIXTURES
        self.budget_usd = config.llm_budget() if budget_usd == "env" else budget_usd
        self._spent = 0.0                       # without a reel: spending of this client only

    @property
    def provider(self) -> str:
        name = (self._provider or "").strip().lower() or config.llm_provider()
        if name not in config.LLM_PROVIDERS:
            raise LLMError(f"[{self.step}] unknown LLM provider {name!r} (expected: {', '.join(config.LLM_PROVIDERS)})")
        return name

    @property
    def ledger(self) -> Ledger | None:
        return self.reel.ledger if self.reel is not None else None

    # --- public API ---
    def text(self, *, system: str, prompt: str, stub: str | None = None, max_tokens: int = MAX_TOKENS) -> str:
        name = self.provider
        if name == "stub":
            return self._stub(stub, (".md", ".txt"))
        if name == "claude-code":
            data = self._claude(system, prompt)
            text = str(data.get("result") or "").strip()
            if not text:
                raise LLMError(f"[{self.step}] empty answer from claude")
            return text
        msg = self._api(system, prompt, max_tokens)
        return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text").strip()

    def json(self, *, system: str, prompt: str, validate: Callable[[Any], list[str]] | None = None,
             stub: str | None = None, tries: int = 2, max_tokens: int = MAX_TOKENS,
             images: list[Path] | None = None) -> Any:
        """A JSON answer. ``validate(obj)`` returns the list of errors (empty when good); a rejected answer is sent back to
        the model with its errors for another try (not in stub mode, where the fixture would not change). ``images``: image
        files shown to the model (``api`` and ``stub`` modes only)."""
        name = self.provider
        if images and name == "claude-code":
            raise LLMError(f"[{self.step}] images are not supported in claude-code mode (use REELFORGE_LLM=api)")
        errors: list[str] = []
        request = prompt
        for attempt in range(max(1, tries)):
            try:
                obj = self._json_once(name, system, request, stub, max_tokens, images)
                errors = list(validate(obj)) if validate else []
                if not errors:
                    return obj
            except _InvalidOutput as exc:
                errors = [_short(str(exc), 300)]
            except ValueError as exc:                      # unreadable JSON
                errors = [_short(f"invalid JSON: {exc}", 300)]
            if name == "stub":
                break
            request = prompt + CORRECTION.format(errors="\n- ".join(errors[:20]))
        raise LLMError(f"[{self.step}] invalid JSON output: " + " ; ".join(errors[:8]))

    # --- internals ---
    def _json_once(self, name: str, system: str, request: str, stub: str | None, max_tokens: int,
                   images: list[Path] | None = None) -> Any:
        if name == "stub":
            return extract_json(self._stub(stub, (".json",)))
        if name == "claude-code":
            data = self._claude(system, request)
            return extract_json(str(data.get("result") or ""))
        msg = self._api(system, request, max_tokens, images)
        return extract_json("".join(b.text for b in msg.content if getattr(b, "type", "") == "text"))

    def _stub(self, key: str | None, extensions: tuple[str, ...]) -> str:
        if not key:
            raise LLMError(f"[{self.step}] stub mode without a fixture name")
        base = (self.fixtures / key).resolve()
        if self.fixtures.resolve() not in base.parents:
            raise LLMError(f"[{self.step}] fixture name outside the fixtures folder: {key}")
        for path in [base, *(base.with_name(base.name + e) for e in extensions)]:
            if path.is_file():
                return path.read_text(encoding="utf-8")
        raise LLMError(f"[{self.step}] fixture missing: {base}")

    def _total_spent(self) -> float:
        return self.ledger.total("llm") if self.ledger is not None else self._spent

    def _check_budget(self) -> None:
        if self.budget_usd is None:
            return
        spent = self._total_spent()
        if spent >= self.budget_usd:
            raise BudgetExceeded(f"[{self.step}] LLM budget exceeded: {spent:.4f} USD >= {self.budget_usd:.2f} USD "
                                 "(REELFORGE_LLM_BUDGET)")

    def _record(self, cost: float, **details: Any) -> None:
        self._spent += cost
        if self.ledger is not None:
            self.ledger.add(step=self.step, type_="llm", cost_usd=cost, **details)

    # --- api mode ---
    @property
    def client(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError:
                raise LLMError("the anthropic package is missing: pip install 'reelforge[llm]'") from None
            key = os.environ.get(API_KEY_VAR)
            if not key:
                raise LLMError(f"{API_KEY_VAR} is missing (see .env.example); or run with REELFORGE_LLM=stub")
            self._client = anthropic.Anthropic(api_key=key)
        return self._client

    @staticmethod
    def _content(prompt: str, images: list[Path] | None) -> str | list[dict[str, Any]]:
        """User message content: the text alone, or the images (base64) followed by the text."""
        if not images:
            return prompt
        import base64
        blocks: list[dict[str, Any]] = []
        for path in images:
            media = "image/png" if str(path).lower().endswith(".png") else "image/jpeg"
            blocks.append({"type": "image", "source": {"type": "base64", "media_type": media,
                                                       "data": base64.b64encode(Path(path).read_bytes()).decode("ascii")}})
        return [*blocks, {"type": "text", "text": prompt}]

    def _api(self, system: str, prompt: str, max_tokens: int, images: list[Path] | None = None):
        self._check_budget()
        model = config.model("write")
        params: dict[str, Any] = {"model": model, "max_tokens": max_tokens,
                                  "system": [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                                  "messages": [{"role": "user", "content": self._content(prompt, images)}]}
        effort = os.environ.get("REELFORGE_EFFORT")
        if effort:
            params["output_config"] = {"effort": effort}
        try:
            with self.client.messages.stream(**params) as stream:
                msg = stream.get_final_message()
        except LLMError:
            raise
        except Exception as exc:                          # SDK errors: never let a key reach the message
            raise LLMError(f"[{self.step}] API call failed: {_short(f'{type(exc).__name__}: {exc}')}") from None
        usage = msg.usage
        served = getattr(msg, "model", None) or model
        self._record(llm_cost(served, usage), model=served, input_tokens=usage.input_tokens,
                     output_tokens=usage.output_tokens, cache_read=getattr(usage, "cache_read_input_tokens", 0) or 0)
        if msg.stop_reason == "refusal":
            raise LLMRefusal(f"[{self.step}] the model refused to answer")
        if msg.stop_reason == "max_tokens":
            raise LLMError(f"[{self.step}] answer truncated (max_tokens reached)")
        return msg

    # --- claude-code mode (test only) ---
    def _claude(self, system: str, prompt: str) -> dict[str, Any]:
        global _WARNED
        self._check_budget()
        if not _WARNED:
            _WARNED = True
            log.warning("REELFORGE_LLM=claude-code: calls go through a login account, TEST ONLY; nothing produced is publishable")
        model = config.model("write")
        base = find_claude()
        with tempfile.TemporaryDirectory(prefix="reelforge-claude-", ignore_cleanup_errors=True) as tmp:
            root = Path(tmp)
            work = root / "work"                          # empty working directory: nothing to load around it
            work.mkdir()
            env = claude_env()
            with_token = OAUTH_TOKEN_VAR in env           # presence only: the value is never read
            if with_token:
                (root / "config").mkdir()
                env["CLAUDE_CONFIG_DIR"] = str(root / "config")
            self._refuse_api_key_login(base, env, work, "token" if with_token else "login")
            argv = [*base, "-p", "--model", model, "--output-format", "json"]
            if system.strip():
                (root / "system.md").write_text(system, encoding="utf-8")
                argv += ["--system-prompt-file", str(root / "system.md")]
            effort = os.environ.get("REELFORGE_EFFORT")
            if effort:
                argv += ["--effort", effort]
            argv += ["--max-turns", str(CLAUDE_TURNS), "--tools", ""]
            if self.budget_usd is not None:
                argv += ["--max-budget-usd", f"{max(self.budget_usd - self._total_spent(), 0.01):.2f}"]
            argv += ["--disallowedTools", "mcp__*", "--strict-mcp-config", "--disable-slash-commands",
                     "--setting-sources", "", "--permission-mode", "dontAsk", "--no-session-persistence"]
            timeout = _timeout()
            try:
                proc = subprocess.run(argv, input=prompt.encode("utf-8"), capture_output=True, cwd=str(work), env=env,
                                      timeout=timeout)
            except subprocess.TimeoutExpired:
                raise LLMError(f"[{self.step}] claude -p: timeout of {timeout:g} s exceeded "
                               f"({CLAUDE_TIMEOUT_VAR} to lengthen it)") from None
            except OSError as exc:
                raise LLMError(f"[{self.step}] claude -p could not be started ({_short(str(exc))}): {INSTALL_HINT}") from None
        data = self._read_output(proc)
        self._record_subscription(data, model)
        self._check_result(data)
        return data

    def _refuse_api_key_login(self, base: list[str], env: dict[str, str], work: Path, mode: str) -> None:
        """``claude auth status`` (no model call) must not announce an API key: only the login account is accepted."""
        key = (*base, mode)
        if key in _VERIFIED_LOGINS:
            return
        try:
            proc = subprocess.run([*base, "auth", "status"], capture_output=True, cwd=str(work), env=env, timeout=60)
            info = json.loads(proc.stdout.decode("utf-8", "replace"))
        except (OSError, subprocess.SubprocessError, ValueError):
            return
        method = str(info.get("authMethod") or "") if isinstance(info, dict) else ""
        if method in FORBIDDEN_AUTH:
            raise LLMError(f"[{self.step}] claude authenticates with {method!r}, not with a login account: remove the key "
                           f"from claude's login, or use {OAUTH_TOKEN_VAR}")
        _VERIFIED_LOGINS.add(key)

    def _read_output(self, proc) -> dict[str, Any]:
        out = (proc.stdout or b"").decode("utf-8", "replace").strip()
        err = (proc.stderr or b"").decode("utf-8", "replace").strip()
        data = None
        for raw in (out, out.splitlines()[-1] if out else ""):
            try:
                data = json.loads(raw)
                break
            except ValueError:
                continue
        if not isinstance(data, dict):
            raise LLMError(f"[{self.step}] unreadable output from claude (code {proc.returncode}): "
                           f"{_short(err or out) or 'nothing on the output'}")
        return data

    def _check_result(self, data: dict[str, Any]) -> None:
        """``subtype`` alone is not enough: "Not logged in" arrives with subtype "success" and is_error true."""
        subtype = str(data.get("subtype") or "success")
        if data.get("is_error") or subtype != "success":
            message = _short(str(data.get("result") or "; ".join(map(str, data.get("errors") or [])) or subtype))
            status = data.get("api_error_status")
            if status == 429 or LIMIT_RE.search(message):
                raise SubscriptionLimit(f"[{self.step}] usage limit of the account reached ({message}): wait for the reset "
                                        "then run again, or switch to REELFORGE_LLM=api")
            if status in (401, 403) or LOGIN_RE.search(message):
                raise LoginError(f"[{self.step}] claude is not logged in ({message}): run `claude setup-token` "
                                 f"({OAUTH_TOKEN_VAR} in .env, never committed) or `claude` then /login")
            if "credit balance is too low" in message.lower():
                raise LLMError(f"[{self.step}] claude bills an API key and not the login account ({message})")
            if subtype == "error_max_structured_output_retries":
                raise _InvalidOutput(f"[{self.step}] structured output rejected by claude ({message})")
            raise LLMError(f"[{self.step}] claude -p failed ({subtype}): {message}")
        stop = data.get("stop_reason")
        if stop == "refusal":
            raise LLMRefusal(f"[{self.step}] the model refused to answer: {_short(str(data.get('result') or ''), 200)}")
        if stop == "max_tokens":
            raise LLMError(f"[{self.step}] answer truncated (max_tokens reached)")

    def _record_subscription(self, data: dict[str, Any], model: str) -> None:
        """One ledger line per model used, cost 0 (flat plan), ``subscription: true``, an API-price estimate for information.
        Fails closed: any usable result is flagged, even without a readable token count (``tokens_unreadable``). Only a
        failure that consumed no token ("Not logged in") writes nothing."""
        usage, by_model = _dict(data.get("usage")), _dict(data.get("modelUsage"))

        def line(name: str, source: dict[str, Any], keys: tuple[str, str, str], cost: Any) -> dict[str, Any]:
            return {"model": name, "input_tokens": _int(source, keys[0]), "output_tokens": _int(source, keys[1]),
                    "cache_read": _int(source, keys[2]), "estimated_cost_usd": round(_float(cost), 6)}

        def used(l: dict[str, Any]) -> bool:
            return bool(l["input_tokens"] or l["output_tokens"] or l["cache_read"])

        model_lines = [line(n, _dict(u), ("inputTokens", "outputTokens", "cacheReadInputTokens"), _dict(u).get("costUSD"))
                       for n, u in by_model.items()]
        usage_line = line(model, usage, ("input_tokens", "output_tokens", "cache_read_input_tokens"),
                          data.get("total_cost_usd"))
        lines = [l for l in model_lines if used(l)] or ([usage_line] if used(usage_line) else [])
        if not lines:
            usable = not data.get("is_error") and str(data.get("subtype") or "success") == "success"
            if not usable:
                return
            lines = [{**usage_line, "model": next(iter(by_model), model), "tokens_unreadable": True}]
        for l in lines:
            self._record(0.0, subscription=True, **l)
        if self.reel is not None:
            self.reel.mark_subscription(self.step)
