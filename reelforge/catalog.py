"""The scene catalog: ``studio/scenes.catalog.json``, generated from the studio's scene registry by
``reelforge/node/export-catalog.mjs`` and read by the script step (scene types, example props, cue names)."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

from . import config
from .reel import ReelError

EXPORT_SCRIPT = config.PACKAGE / "node" / "export-catalog.mjs"


def export(output: Path | None = None) -> str:
    """Regenerate the catalog file with node and return the tool's report line."""
    node = shutil.which("node")
    if not node:
        raise ReelError("node not found on the PATH (Node 24 is needed to export the scene catalog)")
    p = config.paths()
    out = Path(output) if output else p.catalog
    proc = subprocess.run([node, str(EXPORT_SCRIPT), str(p.root), str(out)], capture_output=True, text=True,
                          encoding="utf-8", cwd=str(p.root), timeout=180)
    if proc.returncode != 0:
        raise ReelError(f"catalog export failed (code {proc.returncode}): {(proc.stderr or proc.stdout).strip()[:600]}")
    return (proc.stdout + proc.stderr).strip()


def load(path: Path | None = None) -> dict[str, dict[str, Any]] | None:
    """The catalog ``{type: {description, exampleProps, cues}}``; None if it has not been generated yet."""
    path = Path(path) if path else config.paths().catalog
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    scenes = data["scenes"] if isinstance(data, dict) and "scenes" in data else data
    return {s["type"]: s for s in scenes}


def describe(catalog: dict[str, dict[str, Any]]) -> str:
    """One line per scene for the ``catalog`` command: type, cue names, description."""
    lines = []
    for scene in catalog.values():
        cues = ",".join(scene.get("cues") or []) or "-"
        lines.append(f"{scene['type']:<18} cues: {cues:<28} {scene.get('description', '')[:90]}")
    return "\n".join(lines)
