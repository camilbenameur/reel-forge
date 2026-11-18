"""The ``check`` step: technical check of render.mp4 (ffprobe), detection of frozen frames and empty screens, contact sheet
(one frame per second) in qa/, report qa/report.md, optional visual review by a vision model (``--review``).

Objective measurements first (blocking), the model's review next (advisory).
"""

from __future__ import annotations

import json
import logging
import math
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import config, media
from .llm import LLM, LLMError
from .reel import Reel, ReelError, write_json, write_text_atomic

log = logging.getLogger("reelforge.check")

ANALYSIS_W, ANALYSIS_H = 54, 96
FROZEN_DIFF = 0.03         # mean gap (grey levels 0-255) between two consecutive frames under which they are "identical"
FROZEN_MAX_FRAMES = 15     # more than 0.5 s without motion: defect
EMPTY_STD = 2.0            # standard deviation (grey levels) of the central area under which it is "empty"
EMPTY_MAX_FRAMES = 20
DURATION_MIN_S, DURATION_MAX_S = 36.0, 58.0
LUFS_TARGET, LUFS_TOLERANCE = -14.0, 2.0
CENTER_ROWS = (28, 66)     # rows of the analysis image (96 rows) matching SCENE_BOX (y 560 to 1320 out of 1920)


@dataclass
class Result:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    measures: dict = field(default_factory=dict)


def probe(video: Path) -> dict:
    try:
        return media.probe(video)
    except (media.MediaError, ValueError) as exc:
        raise ReelError(f"ffprobe failed: {str(exc)[:300]}") from exc


def _fps(value: str) -> float:
    a, _, b = value.partition("/")
    try:
        return float(a) / float(b or 1)
    except (ValueError, ZeroDivisionError):
        return 0.0


def check_technical(info: dict, res: Result) -> None:
    video = next((s for s in info["streams"] if s["codec_type"] == "video"), None)
    sound = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    if video is None:
        res.errors.append("no video track")
        return
    fps = _fps(video.get("avg_frame_rate") or video.get("r_frame_rate", "0/1"))
    duration = float(info["format"].get("duration") or video.get("duration") or 0)
    res.measures.update({"width": video["width"], "height": video["height"], "fps": round(fps, 3), "duration": round(duration, 3),
                         "codec": video.get("codec_name"), "audio": bool(sound)})
    if (video["width"], video["height"]) != (config.WIDTH, config.HEIGHT):
        res.errors.append(f"dimensions {video['width']}x{video['height']} instead of {config.WIDTH}x{config.HEIGHT}")
    if abs(fps - config.FPS) > 0.01:
        res.errors.append(f"{fps:.2f} frames/s instead of {config.FPS}")
    if not DURATION_MIN_S <= duration <= DURATION_MAX_S:
        res.warnings.append(f"duration {duration:.1f} s outside {DURATION_MIN_S:.0f}-{DURATION_MAX_S:.0f} s")
    if sound is None:
        res.errors.append("no audio track")


def analysis_frames(video: Path) -> np.ndarray:
    """All the frames in grey 54x96 -> array (n, 96, 54) uint8."""
    cmd = [media.find_binary("ffmpeg"), "-v", "error", "-i", str(video), "-an", "-vf",
           f"scale={ANALYSIS_W}:{ANALYSIS_H}:flags=area", "-pix_fmt", "gray", "-f", "rawvideo", "-"]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        raise ReelError(f"ffmpeg (decoding) failed: {proc.stderr.decode('utf-8', 'replace')[:300]}")
    size = ANALYSIS_W * ANALYSIS_H
    n = len(proc.stdout) // size
    return np.frombuffer(proc.stdout[: n * size], dtype=np.uint8).reshape(n, ANALYSIS_H, ANALYSIS_W)


def long_runs(mask: list[bool] | np.ndarray, maximum: int) -> list[tuple[int, int]]:
    """Consecutive runs of True longer than ``maximum``: [(first frame, length)]."""
    out, start = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start > maximum:
                out.append((start, i - start))
            start = None
    return out


def frozen_runs(frames: np.ndarray, threshold: float = FROZEN_DIFF, maximum: int = FROZEN_MAX_FRAMES) -> list[tuple[int, int]]:
    """Runs of consecutive nearly identical frames (mean gap < threshold) longer than ``maximum``."""
    if len(frames) < 2:
        return []
    gaps = np.abs(np.diff(frames.astype(np.int16), axis=0)).mean(axis=(1, 2))
    return long_runs(gaps < threshold, maximum)


def empty_runs(frames: np.ndarray, threshold: float = EMPTY_STD, maximum: int = EMPTY_MAX_FRAMES) -> list[tuple[int, int]]:
    """Runs of frames whose central area (where scenes appear) is uniform."""
    zone = frames[:, CENTER_ROWS[0]:CENTER_ROWS[1], :].astype(np.float32)
    return long_runs(zone.std(axis=(1, 2)) < threshold, maximum)


def contact_sheet(video: Path, output: Path, columns: int = 10) -> int:
    """One frame per second, 216x384, in a grid. Returns the number of frames."""
    info = probe(video)
    duration = float(info["format"].get("duration") or 0)
    n = max(1, int(math.ceil(duration)))
    rows = int(math.ceil(n / columns))
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [media.find_binary("ffmpeg"), "-y", "-v", "error", "-i", str(video), "-an", "-vf",
           f"fps=1,scale=216:384,tile={columns}x{rows}", "-frames:v", "1", "-q:v", "3", str(output)]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if proc.returncode != 0 or not output.exists():
        raise ReelError(f"contact sheet failed: {proc.stderr.strip()[:300]}")
    return n


REVIEW_SYSTEM = (
    "You review a vertical Instagram reel (1080x1920) made by a reel factory, in the established format: cream paper "
    "background with a dot grid (black 'night' variant with yellow accent for a reveal); mono label \"// 03 - title\" top left and "
    "counter top right; word-by-word captions near the top (spoken words in black, upcoming words in grey, keywords in orange "
    "serif italic); in the center a flat, sharp illustration (window, numbered card, stamp, graph...); bottom right a 2D vector "
    "mascot that changes pose; everything moves all the time. You receive the contact sheet (1 frame per second, left to right "
    "then top to bottom). Answer with ONE JSON object: {\"verdict\": \"ok\" | \"needs_fixes\", \"problems\": [{\"second\": number, "
    "\"severity\": \"blocking\" | \"minor\", \"description\": \"...\"}], \"strengths\": [\"...\"]}. Look for: text cut off or "
    "outside the frame, captions/illustration/mascot overlapping, empty center area, missing or frozen mascot, inconsistent "
    "background or theme, unreadable illustration, captions without keyword styling."
)


def visual_review(reel: Reel, sheet: Path) -> dict:
    def validate(obj) -> list[str]:
        if not isinstance(obj, dict) or obj.get("verdict") not in ("ok", "needs_fixes") or not isinstance(obj.get("problems"), list):
            return ["expected: {verdict: ok|needs_fixes, problems: [...], strengths: [...]}"]
        return []

    script = reel.path("script.json").read_text(encoding="utf-8") if reel.exists("script.json") else ""
    prompt = f"Contact sheet of the reel \"{reel.name}\". Script (to know what should appear):\n{script[:6000]}"
    return LLM(reel, "check").json(system=REVIEW_SYSTEM, prompt=prompt, validate=validate, stub="review_stub.json",
                                   images=[sheet])


def run(reel: Reel, force: bool = False, review: bool = False, frozen_threshold: float = FROZEN_DIFF) -> Result:
    video = reel.path("render.mp4")
    if not video.exists():
        raise ReelError(f"render.mp4 not found in {reel.folder}: run `render` (or `all`)")
    report_md = reel.path("qa", "report.md")
    if reel.is_fresh(report_md, video) and not force and not review:
        log.info("qa/report.md is up to date: skipped")
        r = reel.read("qa", "result.json")
        return Result(r["errors"], r["warnings"], r["measures"])
    res = Result()
    info = probe(video)
    check_technical(info, res)
    try:
        loud = media.measure_loudness(video)
    except media.MediaError:
        loud = None
    if loud is None:
        res.warnings.append("loudness not measurable")
    else:
        res.measures["lufs"] = loud["lufs"]
        res.measures["true_peak_db"] = loud["true_peak_db"]
        if abs(loud["lufs"] - LUFS_TARGET) > LUFS_TOLERANCE:
            res.warnings.append(f"loudness {loud['lufs']:.1f} LUFS (target {LUFS_TARGET:.0f} +/- {LUFS_TOLERANCE:.0f})")
    frames = analysis_frames(video)
    res.measures["frames"] = int(len(frames))
    for start, n in frozen_runs(frames, frozen_threshold):
        res.errors.append(f"frozen image: {n} consecutive frames ({n / config.FPS:.1f} s) from {start / config.FPS:.1f} s")
    for start, n in empty_runs(frames):
        res.warnings.append(f"empty central area for {n / config.FPS:.1f} s from {start / config.FPS:.1f} s")
    sheet = reel.path("qa", "contact-sheet.jpg")
    res.measures["sheet_frames"] = contact_sheet(video, sheet)
    review_result = None
    if review:
        try:
            review_result = visual_review(reel, sheet)
            for p in review_result.get("problems", []):
                msg = f"visual review (~{p.get('second', '?')} s): {p.get('description', '')}"
                (res.errors if p.get("severity") == "blocking" else res.warnings).append(msg)
        except LLMError as exc:
            res.warnings.append(f"visual review unavailable: {exc}")
    write_report(reel, res, review_result)
    write_json(reel.path("qa", "result.json"), {"errors": res.errors, "warnings": res.warnings, "measures": res.measures})
    reel.mark(report_md, video)
    reel.update_state(check={"ok": not res.errors, "errors": len(res.errors), "warnings": len(res.warnings)})
    return res


def write_report(reel: Reel, res: Result, review: dict | None) -> None:
    lines = [f"# Check of {reel.name}", "", f"**Verdict: {'OK' if not res.errors else 'NEEDS FIXES'}**", "", "## Measures", ""]
    lines += [f"- {k}: {v}" for k, v in res.measures.items()]
    lines += ["", "## Errors", ""] + ([f"- {e}" for e in res.errors] or ["- none"])
    lines += ["", "## Warnings", ""] + ([f"- {w}" for w in res.warnings] or ["- none"])
    lines += ["", "## Contact sheet", "", "![contact sheet](contact-sheet.jpg)", ""]
    if review:
        lines += ["## Visual review", "", f"Verdict: {review.get('verdict')}", ""]
        lines += [f"- strength: {p}" for p in review.get("strengths", [])]
    write_text_atomic(reel.path("qa", "report.md"), "\n".join(lines) + "\n")
