"""ffmpeg and ffprobe: binary lookup, execution with a readable error, probing, conversions, loudness (LUFS).

Loudness measurement uses a single filter (ebur128); normalization is the two-pass linear loudnorm.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Sequence

DEFAULT_RATE = 48000
DEFAULT_TIMEOUT_S = 600.0
TARGET_LUFS = -14.0
TARGET_PEAK_DB = -1.5
_VARIABLES = {"ffmpeg": "REELFORGE_FFMPEG", "ffprobe": "REELFORGE_FFPROBE"}


class MediaError(RuntimeError):
    """A ffmpeg/ffprobe command failed, or a binary is missing."""


def find_binary(name: str) -> str:
    """Path of ``ffmpeg`` or ``ffprobe``: REELFORGE_FFMPEG / REELFORGE_FFPROBE, else the PATH."""
    if name not in _VARIABLES:
        raise ValueError(f"unknown binary: {name!r} (expected: ffmpeg or ffprobe)")
    wanted = (os.environ.get(_VARIABLES[name]) or "").strip()
    if wanted:
        found = shutil.which(wanted)
        if not found:
            raise MediaError(f"{_VARIABLES[name]}={wanted!r} was not found; fix the variable or remove it to use the PATH")
        return found
    found = shutil.which(name)
    if not found:
        raise MediaError(f"{name} not found on the PATH; install it (apt install ffmpeg) or set {_VARIABLES[name]}")
    return found


def run(cmd: Sequence[str | Path], timeout: float | None = DEFAULT_TIMEOUT_S) -> subprocess.CompletedProcess:
    """Run the command; a failure (non-zero code, timeout, missing binary) raises MediaError with the end of stderr."""
    argv = [str(c) for c in cmd]
    short = " ".join(argv[:6]) + (" ..." if len(argv) > 6 else "")
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise MediaError(f"timeout of {timeout:.0f} s exceeded: {short}") from exc
    except OSError as exc:
        raise MediaError(f"command could not be started ({exc}): {short}") from exc
    if proc.returncode != 0:
        raise MediaError(f"failed ({proc.returncode}): {short}\n{proc.stderr[-2000:]}")
    return proc


def _ffmpeg(*args: str | Path, timeout: float | None = DEFAULT_TIMEOUT_S) -> subprocess.CompletedProcess:
    return run([find_binary("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", *args], timeout)


def probe(path: Path | str) -> dict[str, Any]:
    """JSON output of ffprobe (format and streams)."""
    proc = run([find_binary("ffprobe"), "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
                str(path)], 60)
    return json.loads(proc.stdout)


def duration(path: Path | str) -> float:
    """Duration in seconds of an audio or video file."""
    try:
        return float(probe(path)["format"]["duration"])
    except (KeyError, ValueError) as exc:
        raise MediaError(f"unreadable duration for {path}") from exc


def silence(seconds: float, output: Path | str, rate: int = DEFAULT_RATE) -> Path:
    """Mono 16-bit PCM WAV of silence."""
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-f", "lavfi", "-i", f"anullsrc=r={rate}:cl=mono", "-t", f"{seconds:.3f}", "-c:a", "pcm_s16le", str(output))
    return Path(output)


def to_wav(source: Path | str, output: Path | str, rate: int = DEFAULT_RATE, mono: bool = True) -> Path:
    """Convert an audio file (or the audio track of a video) to 16-bit PCM WAV."""
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    args: list[str] = ["-i", str(source), "-vn"]
    if mono:
        args += ["-ac", "1"]
    _ffmpeg(*args, "-ar", str(rate), "-c:a", "pcm_s16le", str(output))
    return Path(output)


def concat_wav(parts: Sequence[Path | str], output: Path | str) -> Path:
    """Concatenate WAV files of the same format (rate, channels, 16-bit PCM)."""
    if not parts:
        raise MediaError("concat_wav: nothing to concatenate")
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    listing = output.with_suffix(".list.txt")

    def quote(p: Path | str) -> str:
        return Path(p).resolve().as_posix().replace("'", "'\\''")

    listing.write_text("".join(f"file '{quote(p)}'\n" for p in parts), encoding="utf-8")
    try:
        _ffmpeg("-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(output))
    finally:
        listing.unlink(missing_ok=True)
    return output


def slice_wav(source: Path | str, start: float, length_s: float, output: Path | str, rate: int = DEFAULT_RATE) -> Path:
    """Slice [start, start + length_s) as mono WAV; padded with silence if the source ends earlier."""
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    _ffmpeg("-i", str(source), "-af", f"atrim=start={start:.6f},asetpts=PTS-STARTPTS,apad=whole_dur={length_s:.6f}",
            "-t", f"{length_s:.6f}", "-ar", str(rate), "-ac", "1", "-c:a", "pcm_s16le", str(output))
    return Path(output)


# --- loudness -------------------------------------------------------------------------------------------------------------

_NUMBER = r"(-?(?:\d+(?:\.\d+)?|inf))"


def measure_loudness(path: Path | str) -> dict[str, float]:
    """Integrated loudness (LUFS), true peak (dBTP) and loudness range (LU) of an audio or video file, with one ebur128
    filter. A silent file gives lufs = -70 (the ebur128 floor) or -inf."""
    proc = run([find_binary("ffmpeg"), "-hide_banner", "-nostats", "-i", str(path), "-vn", "-af",
                "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], DEFAULT_TIMEOUT_S)
    summary = proc.stderr.rsplit("Summary:", 1)[-1]
    lufs = re.search(r"\bI:\s+" + _NUMBER + r"\s+LUFS", summary)
    lra = re.search(r"\bLRA:\s+" + _NUMBER + r"\s+LU\b", summary)
    true_peak = re.search(r"True peak:\s*Peak:\s+" + _NUMBER + r"\s+dBFS", summary)
    if not (lufs and lra and true_peak):
        raise MediaError(f"unreadable loudness for {path} (no ebur128 summary)\n{proc.stderr[-800:]}")
    return {"lufs": float(lufs.group(1)), "true_peak_db": float(true_peak.group(1)), "lra": float(lra.group(1))}


def normalize_loudness(source: Path | str, output: Path | str, lufs: float = TARGET_LUFS, peak: float = TARGET_PEAK_DB,
                       rate: int | None = DEFAULT_RATE, mono: bool = True) -> dict[str, Any]:
    """Two-pass loudness normalization (linear loudnorm) -> 16-bit PCM WAV.

    First pass: measure. Second: linear correction with the measured values (no pumping). A silent file is only converted.
    Returns {"before": measures, "target_lufs", "target_peak", "linear": bool}."""
    Path(output).parent.mkdir(parents=True, exist_ok=True)
    base = f"loudnorm=I={lufs}:TP={peak}:LRA=11"
    measure = run([find_binary("ffmpeg"), "-hide_banner", "-nostats", "-i", str(source), "-vn", "-af",
                   base + ":print_format=json", "-f", "null", "-"], DEFAULT_TIMEOUT_S)
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", measure.stderr, re.S)
    if not m:
        raise MediaError(f"loudnorm measured nothing for {source}\n{measure.stderr[-800:]}")
    d = json.loads(m.group(0))
    out_args = ["-c:a", "pcm_s16le"]
    if rate:
        out_args = ["-ar", str(rate), *out_args]
    if mono:
        out_args = ["-ac", "1", *out_args]
    silent = d["input_i"] in ("-inf", "inf") or float(d["input_i"]) <= -69.9
    if silent:
        _ffmpeg("-i", str(source), "-vn", *out_args, str(output), timeout=DEFAULT_TIMEOUT_S)
        return {"before": {"lufs": -70.0}, "target_lufs": lufs, "target_peak": peak, "linear": False}
    chain = (f"{base}:measured_I={d['input_i']}:measured_TP={d['input_tp']}:measured_LRA={d['input_lra']}"
             f":measured_thresh={d['input_thresh']}:offset={d['target_offset']}:linear=true")
    _ffmpeg("-i", str(source), "-vn", "-af", chain, *out_args, str(output))
    return {"before": {"lufs": float(d["input_i"]), "true_peak_db": float(d["input_tp"]), "lra": float(d["input_lra"])},
            "target_lufs": lufs, "target_peak": peak, "linear": True}
