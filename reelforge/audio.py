"""Audio in numpy: read and write, resampling, edge and internal silences, peak, fades, time remapping.

Everything works on mono float32 signals in [-1, 1]. Loudness (LUFS) and format conversions are in ``media`` (ffmpeg).
The silence thresholds (-45 / -50 dB) and the peak floor were measured on cloned-voice takes.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import numpy as np
import soundfile as sf

log = logging.getLogger("reelforge.audio")

MIN_PEAK = 200 / 32768.0        # below this (about -44 dBFS) a take is considered silent
EDGE_DB = -50.0                 # threshold for trimming edge silences
GAP_DB = -45.0                  # threshold of a silence in the middle of a take


class AudioError(RuntimeError):
    pass


def read_bytes(data: bytes) -> tuple[np.ndarray, int]:
    """WAV, FLAC, OGG... (anything libsndfile reads) -> (mono float32 samples, sample rate)."""
    try:
        samples, sr = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception as exc:  # noqa: BLE001 - libsndfile raises several types
        raise AudioError(f"unreadable audio ({exc})") from exc
    return np.ascontiguousarray(samples.mean(axis=1)), int(sr)


def read(path: Path | str) -> tuple[np.ndarray, int]:
    try:
        data = Path(path).read_bytes()
    except OSError as exc:
        raise AudioError(f"audio not found: {path} ({exc})") from exc
    return read_bytes(data)


def write(path: Path | str, x: np.ndarray, sr: int, subtype: str = "PCM_16") -> None:
    """Write a WAV (or the format of the extension); the signal is clipped to [-1, 1]."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.clip(x, -1.0, 1.0), sr, subtype=subtype)


def resample(x: np.ndarray, sr: int, target: int) -> np.ndarray:
    """High-quality resampling: soxr when installed, else scipy (polyphase), else linear interpolation (logged)."""
    if sr == target or x.size == 0:
        return x
    try:
        import soxr
        return soxr.resample(x.astype(np.float32), sr, target, quality="VHQ").astype(np.float32)
    except ImportError:
        pass
    try:
        from math import gcd

        from scipy.signal import resample_poly
        g = gcd(int(sr), int(target))
        return resample_poly(x, target // g, sr // g).astype(np.float32)
    except ImportError:
        pass
    log.warning("neither soxr nor scipy: linear resampling (lower quality)")
    n = int(round(x.size * target / sr))
    return np.interp(np.linspace(0, x.size - 1, n), np.arange(x.size), x).astype(np.float32)


def duration(x: np.ndarray, sr: int) -> float:
    return x.size / float(sr)


def trim_edges(x: np.ndarray, sr: int, margin: float = 0.04, threshold_db: float = EDGE_DB) -> np.ndarray:
    """Remove the silence at the start and at the end (keeps ``margin`` seconds on each side)."""
    if x.size == 0:
        return x
    threshold = 10 ** (threshold_db / 20)
    active = np.flatnonzero(np.abs(x) > threshold)
    if active.size == 0:
        return x
    m = int(margin * sr)
    return x[max(0, active[0] - m): min(x.size, active[-1] + m + 1)]


def silence(seconds: float, sr: int) -> np.ndarray:
    return np.zeros(int(round(seconds * sr)), dtype=np.float32)


def fade(x: np.ndarray, sr: int, seconds: float = 0.015) -> np.ndarray:
    """Linear fade in and out (15 ms): no click at joins, no end cut off abruptly."""
    n = min(int(sr * seconds), x.size // 2)
    if n <= 0:
        return x
    y = x.astype(np.float32, copy=True)
    ramp = np.linspace(0.0, 1.0, n, dtype=np.float32)
    y[:n] *= ramp
    y[-n:] *= ramp[::-1]
    return y


def peak(x: np.ndarray) -> float:
    """Maximum absolute value (0 to 1); 0 for an empty signal."""
    return float(np.max(np.abs(x))) if x.size else 0.0


def gaps(x: np.ndarray, sr: int, threshold_db: float = GAP_DB, minimum: float = 1.2) -> list[float]:
    """Silences of at least ``minimum`` seconds in the middle of a take (edges excluded)."""
    x = trim_edges(x, sr, margin=0.0, threshold_db=threshold_db)
    threshold = 10 ** (threshold_db / 20)
    step = max(1, int(0.02 * sr))
    n = x.size // step
    if n == 0:
        return []
    env = np.abs(x[: n * step]).reshape(n, step).max(axis=1)
    out, run = [], 0
    for quiet in env < threshold:
        if quiet:
            run += 1
        else:
            if run * step / sr >= minimum:
                out.append(run * step / sr)
            run = 0
    return out


def target_length(length: float, max_s: float, threshold_s: float = 0.5, span_s: float = 0.6) -> float:
    """Kept length of a silence: untouched below ``threshold_s``, else brought between ``threshold_s`` and ``max_s`` in an
    increasing way (a long pause stays longer than a short one). A fixed cap made every pause identical, hence robotic."""
    if length <= threshold_s:
        return length
    return threshold_s + (max_s - threshold_s) * min(1.0, (length - threshold_s) / span_s)


def compress_silences(x: np.ndarray, sr: int, max_s: float = 0.5, threshold_db: float = -40.0, window_s: float = 0.01,
                      tail_margin_s: float = 0.5) -> tuple[np.ndarray, list[tuple[float, float]]]:
    """Shorten internal silences according to ``target_length`` (at most ``max_s``, graded, order of pauses kept) by removing
    their middle. The start and the final tail (``tail_margin_s``) are untouched. Returns the signal and the cuts (time of
    the cut in the original signal, removed duration), to remap marks with ``remap``."""
    n = max(1, int(sr * window_s))
    count = len(x) // n
    if count < 3:
        return x, []
    frames = x[: count * n].reshape(count, n).astype(np.float64)
    db = 10 * np.log10(np.mean(frames ** 2, axis=1) + 1e-12)
    quiet = db < threshold_db
    cuts: list[tuple[float, float]] = []
    kept = []
    i, voice_start = 0, int(np.argmax(~quiet)) if (~quiet).any() else count
    useful_end = count - int(tail_margin_s / window_s)
    cursor = 0
    while i < count:
        if quiet[i] and voice_start < i < useful_end:
            j = i
            while j < count and quiet[j]:
                j += 1
            length = (j - i) * window_s
            target = target_length(length, max_s)
            if length - target >= 2 * window_s and j < useful_end:
                half = int(round(target / 2 / window_s))
                a, b = (i + half) * n, (j - half) * n
                kept.append(x[cursor:a])
                cuts.append((a / sr, (b - a) / sr))
                cursor = b
            i = j
        else:
            i += 1
    kept.append(x[cursor:])
    return np.concatenate(kept), cuts


def remap(t: float, cuts: list[tuple[float, float]]) -> float:
    """Time ``t`` of the original signal, expressed in the signal after ``compress_silences``."""
    shift = 0.0
    for start, removed in cuts:
        if t >= start + removed:
            shift += removed
        elif t > start:
            shift += t - start
    return t - shift
