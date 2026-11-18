"""Configuration: repository paths, settings read from the environment, external binaries.

Environment variables (all optional):

    REELFORGE_ROOT                 repository root (default: the parent of the package); mostly for tests
    REELFORGE_LANGUAGE             default reel language, ``en`` (default) or ``fr``
    REELFORGE_LLM                  stub (default, fixtures) | api | claude-code (test only, reels are flagged unpublishable)
    REELFORGE_ANTHROPIC_API_KEY    key of the Anthropic API (``api`` mode, the publishable one)
    REELFORGE_LLM_BUDGET           LLM spending cap per reel in USD (default 5; 0: no spend allowed; ``off``: no cap)
    REELFORGE_MODEL_WRITE          model that writes the script (default claude-opus-5-5)
    REELFORGE_EFFORT               optional effort level passed to the model
    REELFORGE_CLAUDE_TIMEOUT       seconds allowed to one ``claude -p`` call (default 900)
    CLAUDE_BIN                     path of the ``claude`` binary (``claude-code`` mode)
    REELFORGE_VOICE                gpu | stub (default stub)
    REELFORGE_GPU_DAILY_CAP        daily GPU spending cap in USD (default 3), see ``costs``
    RUNPOD_API_KEY                 RunPod key: repository .env or ~/.config/reelforge/secrets.env
    REELFORGE_VOICE_SPLIT          continuous | beat (default: the provider's own: continuous for gpu, beat for stub)
    REELFORGE_VOICE_BLOCK_MAX      characters per voice block in continuous mode (default 600)
    REELFORGE_VOICE_TAKES          valid takes kept per block, best one retained (default 1; 3 or 4 on the GPU)
    REELFORGE_VOICE_BATCH          takes generated in the same pass on the card (default 6)
    REELFORGE_VOICE_TEMPERATURE / REELFORGE_VOICE_TOP_P    sampling settings of the cloned voice (default: the model's)
    REELFORGE_WHISPER_MODEL        faster-whisper model used for alignment (default small)
    REELFORGE_RENDER_CONCURRENCY   browser tabs used by the render (default 2)
    REELFORGE_FFMPEG / REELFORGE_FFPROBE   binaries (default: found on the PATH)

Nothing is read at import time except the package location; every setting is evaluated when asked for.
"""

from __future__ import annotations

import math
import os
import shutil
from dataclasses import dataclass
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent
DEFAULT_ROOT = PACKAGE.parent

FPS = 30
WIDTH = 1080
HEIGHT = 1920
LANGUAGES = ("en", "fr")
DEFAULT_LANGUAGE = "en"
LLM_PROVIDERS = ("stub", "api", "claude-code")
VOICE_PROVIDERS = ("gpu", "stub")
VOICE_SPLITS = ("continuous", "beat")
DEFAULT_VOICE_BLOCK_MAX = 600
DEFAULT_LLM_BUDGET_USD = 5.0
DEFAULT_MODEL_WRITE = "claude-opus-5-5"


class ConfigError(ValueError):
    """A setting has an unusable value (message names the variable)."""


def root() -> Path:
    return Path(os.environ.get("REELFORGE_ROOT") or DEFAULT_ROOT).resolve()


@dataclass(frozen=True)
class Paths:
    root: Path

    @property
    def reels(self) -> Path:
        return self.root / "reels"

    @property
    def studio(self) -> Path:
        return self.root / "studio"

    @property
    def public_reels(self) -> Path:
        return self.studio / "public" / "reels"

    @property
    def catalog(self) -> Path:
        return self.studio / "scenes.catalog.json"

    @property
    def brand(self) -> Path:
        return self.root / "brand" / "brand.yaml"

    @property
    def brand_example(self) -> Path:
        return self.root / "brand" / "brand.example.yaml"

    @property
    def voice_reference(self) -> Path:
        return self.root / "voice-reference"


def paths() -> Paths:
    return Paths(root())


def init_env() -> list[str]:
    """Complete the environment: process environment > repository .env > ~/.config/reelforge/secrets.env > legacy file.

    Called explicitly at CLI start, never at import. Returns the NAMES that were added, never the values."""
    from . import secrets
    return secrets.load(root() / ".env")


def language(value: str | None = None) -> str:
    """The reel language: the given value, else REELFORGE_LANGUAGE, else ``en``. Validated."""
    lang = (value or os.environ.get("REELFORGE_LANGUAGE") or DEFAULT_LANGUAGE).strip().lower()
    if lang not in LANGUAGES:
        raise ConfigError(f"unknown language {lang!r} (expected: {', '.join(LANGUAGES)})")
    return lang


def llm_provider() -> str:
    name = (os.environ.get("REELFORGE_LLM") or "").strip().lower() or "stub"
    if name not in LLM_PROVIDERS:
        raise ConfigError(f"REELFORGE_LLM={name!r} is unknown (expected: {', '.join(LLM_PROVIDERS)})")
    return name


def llm_budget() -> float | None:
    """LLM spending cap per reel in USD; None means no cap (only the explicit 'off'). 0 allows no spend at all; a negative
    value is a configuration error."""
    raw = (os.environ.get("REELFORGE_LLM_BUDGET") or "").strip().lower()
    if not raw:
        return DEFAULT_LLM_BUDGET_USD
    if raw in ("off", "no", "none"):
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"REELFORGE_LLM_BUDGET={raw!r}: a number of dollars (or 'off') is expected") from None
    if not math.isfinite(value) or value < 0:
        raise ConfigError(f"REELFORGE_LLM_BUDGET={raw!r}: a number of dollars >= 0 (0 forbids any spend) or 'off' is expected")
    return value


def model(role: str = "write") -> str:
    if role != "write":
        raise ConfigError(f"unknown model role {role!r}")
    return os.environ.get("REELFORGE_MODEL_WRITE") or DEFAULT_MODEL_WRITE


def voice_provider(value: str | None = None) -> str:
    name = (value or os.environ.get("REELFORGE_VOICE") or "").strip().lower() or "stub"
    if name not in VOICE_PROVIDERS:
        raise ConfigError(f"voice provider {name!r} is unknown (expected: {', '.join(VOICE_PROVIDERS)})")
    return name


def whisper_model() -> str:
    return os.environ.get("REELFORGE_WHISPER_MODEL") or "small"


def _binary(name: str) -> str:
    explicit = os.environ.get(f"REELFORGE_{name.upper()}")
    if explicit:
        return shutil.which(explicit) or explicit
    return shutil.which(name) or name


def ffmpeg() -> str:
    return _binary("ffmpeg")


def ffprobe() -> str:
    return _binary("ffprobe")


def voice_split(value: str | None = None, default: str = "beat") -> str:
    """``continuous`` or ``beat``: the given value, else REELFORGE_VOICE_SPLIT, else the provider's default."""
    name = (value or os.environ.get("REELFORGE_VOICE_SPLIT") or default).strip().lower()
    if name not in VOICE_SPLITS:
        raise ConfigError(f"voice split {name!r} is unknown (expected: {', '.join(VOICE_SPLITS)})")
    return name


def voice_block_max() -> int:
    raw = (os.environ.get("REELFORGE_VOICE_BLOCK_MAX") or "").strip()
    if not raw:
        return DEFAULT_VOICE_BLOCK_MAX
    try:
        n = int(raw)
    except ValueError:
        n = 0
    if n < 50:
        raise ConfigError(f"REELFORGE_VOICE_BLOCK_MAX must be an integer of at least 50, not {raw!r}")
    return n


def voice_takes(value: int | None = None) -> int:
    """Takes per block: the given value, else REELFORGE_VOICE_TAKES, else 1 (between 1 and 10)."""
    raw = value if value is not None else ((os.environ.get("REELFORGE_VOICE_TAKES") or "").strip() or 1)
    try:
        n = int(raw)
    except (TypeError, ValueError):
        n = 0
    if not 1 <= n <= 10:
        raise ConfigError(f"REELFORGE_VOICE_TAKES / --takes must be an integer from 1 to 10, not {raw!r}")
    return n


def render_concurrency() -> int:
    """Browser tabs of the render: with 4 tabs the ffmpeg assembly runs out of memory on a machine with 4 GB free."""
    raw = (os.environ.get("REELFORGE_RENDER_CONCURRENCY") or "").strip()
    if not raw:
        return 2
    try:
        n = int(raw)
    except ValueError:
        n = 0
    if n < 1:
        raise ConfigError(f"REELFORGE_RENDER_CONCURRENCY must be a positive integer, not {raw!r}")
    return n
