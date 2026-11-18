"""A reel is a folder ``reels/<YYYY-MM-DD>-<slug>/``; its state lives in ``state.json``.

Writes are atomic (a reader sees the old content or the new one, never a fragment). Step freshness uses sha256 fingerprints:
a step is skipped when its output exists and the fingerprint of its inputs is the one recorded the last time, kept in
``state.json["fingerprints"]`` (key: path relative to the reel folder).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import unicodedata
from datetime import date
from pathlib import Path
from typing import Any

from . import config
from .costs import Ledger

__all__ = ["Reel", "ReelError", "create", "find", "slugify", "fingerprint", "write_json", "read_json",
           "write_text_atomic", "write_bytes_atomic"]

_CHUNK = 1 << 20
_MISSING = object()


class ReelError(RuntimeError):
    """A user-facing error: a step is impossible, a file is missing, a reference is ambiguous."""


def slugify(text: str, max_len: int = 48, default: str = "reel") -> str:
    """Lowercase ASCII, accents removed, everything else turned into single hyphens; ``default`` if nothing is left."""
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    t = re.sub(r"[^a-z0-9]+", "-", t).strip("-")
    return t[:max_len].rstrip("-") or default


# --- atomic writes and fingerprints -------------------------------------------------------------------------------------

def write_bytes_atomic(path: Path | str, data: bytes) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise
    return path


def write_text_atomic(path: Path | str, text: str) -> Path:
    return write_bytes_atomic(path, text.encode("utf-8"))


def write_json(path: Path | str, obj: Any) -> Path:
    """Indented UTF-8 JSON, keys in insertion order, trailing newline, atomic."""
    return write_text_atomic(path, json.dumps(obj, ensure_ascii=False, indent=2) + "\n")


def read_json(path: Path | str, default: Any = _MISSING) -> Any:
    """Read a JSON file. With ``default``, a missing or unreadable file gives the default; without, the error is raised."""
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        if default is _MISSING:
            raise
        return default


def fingerprint(*items: Path | str | bytes | None) -> str:
    """sha256 hex of the items. A ``Path`` counts by its content (a missing file by an 'absent' mark, so an input that
    appears or disappears changes the fingerprint); ``str`` and ``bytes`` count as text or bytes. Items are typed and
    length-prefixed: fingerprint(b"ab", b"c") != fingerprint(b"a", b"bc")."""
    h = hashlib.sha256()
    for item in items:
        if isinstance(item, Path):
            if item.is_file():
                h.update(b"F")
                with item.open("rb") as f:
                    while block := f.read(_CHUNK):
                        h.update(block)
            else:
                h.update(b"A")
        elif item is None:
            h.update(b"N")
        else:
            data = item.encode("utf-8") if isinstance(item, str) else bytes(item)
            h.update(b"B" + str(len(data)).encode() + b":")
            h.update(data)
        h.update(b"\x00")
    return h.hexdigest()


def _newer_or_equal(output: Path, inputs: tuple[Path, ...]) -> bool:
    """Rule used for a reel that has no fingerprint yet: the output is at least as recent as its existing inputs."""
    if not output.exists():
        return False
    t = output.stat().st_mtime
    return all(i.stat().st_mtime <= t + 1e-6 for i in inputs if i.exists())


# --- the reel --------------------------------------------------------------------------------------------------------------

class Reel:
    def __init__(self, folder: Path):
        self.folder = Path(folder)
        self.name = self.folder.name

    def path(self, *parts: str) -> Path:
        return self.folder.joinpath(*parts)

    def exists(self, *parts: str) -> bool:
        return self.path(*parts).exists()

    def read(self, *parts: str) -> Any:
        p = self.path(*parts)
        if not p.exists():
            raise ReelError(f"{p.name} not found in {self.folder}: run the step that produces it first "
                            f"(`python -m reelforge status {self.name}` shows the progress)")
        return read_json(p)

    def write(self, data: Any, *parts: str) -> Path:
        return write_json(self.path(*parts), data)

    @property
    def ledger(self) -> Ledger:
        """The reel's own cost ledger, ``costs.jsonl``."""
        return Ledger(self.path("costs.jsonl"))

    # --- freshness ---
    def _key(self, output: Path) -> str:
        try:
            return Path(output).resolve().relative_to(self.folder.resolve()).as_posix()
        except ValueError:
            return str(output)

    def is_fresh(self, output: Path, *inputs: Path) -> bool:
        """True if ``output`` exists and its inputs are those of its last production (the step can be skipped)."""
        output = Path(output)
        if not output.is_file():
            return False
        known = (self.state.get("fingerprints") or {}).get(self._key(output))
        if known is None:                      # reel without fingerprints: compare dates, then adopt
            if not _newer_or_equal(output, inputs):
                return False
            self.mark(output, *inputs)
            return True
        return known == fingerprint(*inputs)

    def mark(self, output: Path, *inputs: Path) -> None:
        """Record the fingerprint of the inputs that just produced ``output`` (call it after writing the output)."""
        fps = dict(self.state.get("fingerprints") or {})
        fps[self._key(output)] = fingerprint(*inputs)
        self.update_state(fingerprints=fps)

    # --- state ---
    @property
    def state(self) -> dict[str, Any]:
        p = self.path("state.json")
        return read_json(p, {}) if p.exists() else {}

    def update_state(self, **fields: Any) -> None:
        s = self.state
        s.update(fields)
        write_json(self.path("state.json"), s)

    def mark_subscription(self, step: str) -> None:
        """A step was written through the claude-code test mode: the reel is no longer publishable."""
        steps = list(self.state.get("llm_subscription") or [])
        if step not in steps:
            steps.append(step)
        self.update_state(llm_subscription=steps)

    @property
    def subscription(self) -> bool:
        return bool(self.state.get("llm_subscription"))

    @property
    def language(self) -> str:
        return config.language(self.state.get("language"))


def create(topic: str, slug: str | None = None, today: date | None = None) -> Reel:
    """The Reel object for a new topic (nothing is written)."""
    day = (today or date.today()).isoformat()
    return Reel(config.paths().reels / f"{day}-{slugify(slug or topic)}")


def _candidates(folder: Path) -> list[Path]:
    return sorted(d for d in folder.iterdir() if d.is_dir()) if folder.is_dir() else []


def find(ref: str | None = None) -> Reel:
    """Resolve ``ref``: a folder path, an exact name, the unique end of a name (the slug), or ``latest`` (or nothing)."""
    reels = config.paths().reels
    names = _candidates(reels)
    if ref in (None, "", "latest"):
        if not names:
            raise ReelError(f"no reel under {reels}")
        return Reel(names[-1])
    p = Path(ref)
    if p.is_dir() and (p / "brief.md").exists():
        return Reel(p.resolve())
    if not p.is_absolute() and (reels / ref).is_dir():
        return Reel(reels / ref)
    matches = [d for d in names if d.name.endswith(ref)] or [d for d in names if ref in d.name]
    if len(matches) == 1:
        return Reel(matches[0])
    if matches:
        raise ReelError(f"{ref!r} is ambiguous: {', '.join(d.name for d in matches)}")
    raise ReelError(f"reel not found: {ref} (expected under {reels})")
