"""Configuration: repository paths, settings read from the environment, external binaries.

Environment variables (all optional):

    REELFORGE_ROOT                 repository root (default: the parent of the package); mostly for tests
    REELFORGE_LANGUAGE             default reel language, ``en`` (default) or ``fr``
    REELFORGE_LLM                  stub (default, fixtures) | api | claude-code (test only, reels are flagged unpublishable)
    REELFORGE_ANTHROPIC_API_KEY    key of the Anthropic API (``api`` mode, the publishable one)
    REELFORGE_LLM_BUDGET           LLM spending cap per reel in USD (default 5; ``off``: no cap)
    REELFORGE_MODEL_WRITE          model that writes the script (default claude-opus-5-5)
    REELFORGE_EFFORT               optional effort level passed to the model
    REELFORGE_CLAUDE_TIMEOUT       seconds allowed to one ``claude -p`` call (default 900)
    CLAUDE_BIN                     path of the ``claude`` binary (``claude-code`` mode)
    REELFORGE_VOICE                gpu | stub (default stub)
    REELFORGE_GPU_DAILY_CAP        daily GPU spending cap in USD (default 3), see ``costs``
    RUNPOD_API_KEY                 RunPod key: repository .env or ~/.config/reelforge/secrets.env
    REELFORGE_WHISPER_MODEL        faster-whisper model used for alignment (default small)
    REELFORGE_FFMPEG / REELFORGE_FFPROBE   binaries (default: found on the PATH)

Nothing is read at import time except the package location; every setting is evaluated when asked for.
"""

from __future__ import annotations

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
    """LLM spending cap per reel in USD; None means no cap."""
    raw = (os.environ.get("REELFORGE_LLM_BUDGET") or "").strip().lower()
    if not raw:
        return DEFAULT_LLM_BUDGET_USD
    if raw in ("0", "off", "no", "none"):
        return None
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"REELFORGE_LLM_BUDGET={raw!r}: a number of dollars (or 'off') is expected") from None
    return value if value > 0 else None


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
