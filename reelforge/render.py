"""The ``render`` step: renders the reel with Remotion (studio/), h264, crf 18, props = timeline.json.

Command run in studio/:

    npx remotion render src/index.ts Reel <reels/.../render.mp4> --props=<reels/.../timeline.json> --codec h264 --crf 18

with NODE_OPTIONS=--dns-result-order=ipv4first (ports and IPv4 fixed by studio/remotion.config.ts: 4310/4311, never ::1).
Concurrency: REELFORGE_RENDER_CONCURRENCY (default 2: at 4 tabs the ffmpeg assembly runs out of memory on a machine with
4 GB free).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess

from . import config
from .reel import Reel, ReelError

log = logging.getLogger("reelforge.render")


def command(reel: Reel) -> list[str]:
    npx = shutil.which("npx") or "npx"
    return [npx, "remotion", "render", "src/index.ts", "Reel", str(reel.path("render.mp4")),
            f"--props={reel.path('timeline.json')}", "--codec", "h264", "--crf", "18",
            f"--concurrency={config.render_concurrency()}"]


def run(reel: Reel, force: bool = False) -> str:
    output = reel.path("render.mp4")
    inputs = (reel.path("timeline.json"), reel.path("voice.wav"))
    if reel.is_fresh(output, *inputs) and not force:
        log.info("render.mp4 is up to date: skipped")
        return str(output)
    reel.read("timeline.json")
    studio = config.paths().studio
    if not (studio / "node_modules").is_dir():
        raise ReelError(f"{studio}/node_modules is missing: run `npm install --ignore-scripts` in studio/")
    public = config.paths().public_reels / reel.name
    if not (public / "voice.wav").is_file():
        raise ReelError(f"{public}/voice.wav is missing: run `python -m reelforge timeline {reel.name} --force`")
    env = dict(os.environ)
    env["NODE_OPTIONS"] = (env.get("NODE_OPTIONS", "") + " --dns-result-order=ipv4first").strip()
    cmd = command(reel)
    log.info("render: %s", " ".join(cmd))
    proc = subprocess.run(cmd, cwd=str(studio), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
    reel.path("qa").mkdir(exist_ok=True)
    reel.path("qa", "render.log").write_text((proc.stdout or "") + "\n" + (proc.stderr or ""), encoding="utf-8")
    if proc.returncode != 0 or not output.exists():
        raise ReelError(f"Remotion render failed (code {proc.returncode}): {(proc.stderr or proc.stdout).strip()[-600:]}")
    reel.mark(output, *inputs)
    reel.update_state(render={"file": "render.mp4", "size": output.stat().st_size})
    return str(output)
