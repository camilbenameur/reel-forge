"""Secret and setting loading, without ever showing a value.

Order (the first source that defines a variable wins; the process environment always comes first):

1. the process environment;
2. the repository ``.env`` file (git-ignored), passed explicitly by the caller;
3. the shared user file ``~/.config/reelforge/secrets.env`` (mode 600), or the file named by ``REELFORGE_SECRETS``;
4. the legacy file ``~/.config/usine/secrets.env`` (fallback for machines set up before the rename).

Nothing is loaded at import time: the CLI calls ``load(".env")`` once at startup.

Files written on Windows (CRLF line ends, BOM) are read correctly: a stray carriage return left in a key used to end up
in the HTTP header and made the HTTP library print the key in its error message.
"""

from __future__ import annotations

import os
import re
from pathlib import Path

_LINE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$")
_SENSITIVE = re.compile(r"(KEY|TOKEN|SECRET|PASSWORD)", re.I)
# Variables of the legacy file that were renamed: legacy name -> current name.
LEGACY_NAMES = {"USINE_ANTHROPIC_API_KEY": "REELFORGE_ANTHROPIC_API_KEY"}


def config_dir() -> Path:
    """``$XDG_CONFIG_HOME/reelforge`` (default ``~/.config/reelforge``), evaluated at call time."""
    base = os.environ.get("XDG_CONFIG_HOME") or "~/.config"
    return Path(base).expanduser() / "reelforge"


def shared_file() -> Path:
    """The shared secrets file: ``REELFORGE_SECRETS`` if set, else ``<config dir>/secrets.env``."""
    override = os.environ.get("REELFORGE_SECRETS")
    return Path(override).expanduser() if override else config_dir() / "secrets.env"


def legacy_file() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or "~/.config"
    return Path(base).expanduser() / "usine" / "secrets.env"


def read_env_file(path: Path | str) -> dict[str, str]:
    """NAME=value pairs of a .env file: comments and blank lines ignored, quotes removed, CR and BOM stripped."""
    try:
        raw = Path(path).read_bytes()
    except OSError:
        return {}
    text = raw.decode("utf-8-sig", errors="replace").replace("\r\n", "\n").replace("\r", "\n")
    out: dict[str, str] = {}
    for line in text.split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = _LINE.match(line)
        if not m:
            continue
        name, value = m.group(1), m.group(2)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        elif " #" in value:                          # trailing comment outside quotes
            value = value.split(" #", 1)[0].rstrip()
        out[name] = value
    return out


def load(*files: Path | str, shared: bool = True, environ: dict[str, str] | None = None) -> list[str]:
    """Complete the environment from the given files, then the shared and legacy files.

    Returns the NAMES that were added (never the values). An empty value never overrides anything."""
    env = os.environ if environ is None else environ
    sources: list[tuple[Path, bool]] = [(Path(f), False) for f in files]
    if shared:
        sources += [(shared_file(), False), (legacy_file(), True)]
    added: list[str] = []
    for path, legacy in sources:
        for name, value in read_env_file(path).items():
            if legacy:
                name = LEGACY_NAMES.get(name, name)
            if value and not env.get(name):
                env[name] = value
                added.append(name)
    return added


def mask(value: str | None) -> str:
    """'rpa_...(66)': enough to recognise a key in a diagnostic, never enough to reuse it."""
    if not value:
        return "(absent)"
    return f"{value[:4]}...({len(value)})"


def is_sensitive(name: str) -> bool:
    return bool(_SENSITIVE.search(name))


def redact(text: str, environ: dict[str, str] | None = None) -> str:
    """Replace, in a text (error message, log line), every value of a sensitive variable by its masked form."""
    env = os.environ if environ is None else environ
    for name, value in env.items():
        if value and len(value) >= 8 and is_sensitive(name) and value in text:
            text = text.replace(value, mask(value))
    return text
