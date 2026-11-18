"""Voice on serverless GPU: cloning (Qwen3-TTS 1.7B Base) and voice invention (Qwen3-TTS VoiceDesign), Apache-2.0.

Text splitting, seed choice and take checks (duration, silences, word error rate) stay in the pipeline: this module only
carries already split segments and returns the audio as the model produced it.

    client = VoiceClient(GPUClient())
    ref = Reference.from_files(Path("voice-reference/reference.wav"), Path("voice-reference/reference.txt"))
    takes = client.clone([Segment("Hello there.", seed=1, temperature=0.9)], ref, language="en")
    takes[0].wav(48_000)   # mono 16-bit WAV bytes, resampled
"""

from __future__ import annotations

import base64
import hashlib
import io
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .. import costs
from .client import GPUClient, GPUError, Result

MAX_BATCH_SEGMENTS = 12             # segments per job: ~12 x 15 s of FLAC audio fits well under the response limit
MAX_BATCH_CHARS = 2000              # ALL segments counted: ~140 s of speech per job (~6 MB of base64 FLAC), under RunPod's
                                    # response limit (~9 MB kept on the worker) even when takes run long
# Segments generated in the same pass on the card (measured on 2026-11-18 on an RTX 4090: 4 takes of 10 s in 20 s of compute
# instead of 67 s one by one). 6 fits on a 16 GB card (~1.8 GB per segment). In a batch, the seed of the first segment fixes
# the draw of the whole pass: N takes of one text in a batch are N different draws.
DEFAULT_BATCH = 6
MAX_DESIGN_SEEDS = 8


@dataclass(frozen=True)
class Segment:
    text: str
    seed: int | None = None
    temperature: float | None = None
    top_p: float | None = None

    def request(self) -> dict[str, Any]:
        d: dict[str, Any] = {"text": self.text, "seed": self.seed}
        if self.temperature is not None:
            d["temperature"] = self.temperature
        if self.top_p is not None:
            d["top_p"] = self.top_p
        return d


@dataclass(frozen=True)
class Reference:
    """Reference voice excerpt (1 to 60 s) and its exact transcript."""

    audio: bytes
    text: str

    @classmethod
    def from_files(cls, audio: Path, text: Path | str) -> "Reference":
        if not audio.exists():
            raise GPUError(f"reference excerpt missing: {audio}", fixable=True)
        t = text.read_text(encoding="utf-8").strip() if isinstance(text, Path) else text.strip()
        if not t:
            raise GPUError(f"reference transcript is empty ({text})", fixable=True)
        return cls(audio.read_bytes(), t)

    @property
    def fingerprint(self) -> str:
        """Changes as soon as the excerpt or its transcript changes: part of the cache keys."""
        return hashlib.sha256(self.audio + b"\0" + self.text.encode("utf-8")).hexdigest()[:16]


@dataclass
class Take:
    """One synthesized segment: the model's exact audio (FLAC or WAV), its sample rate and what it cost."""

    data: bytes
    sample_rate: int
    duration_s: float
    seed: int | None
    compute_s: float
    gpu: str = "?"
    job: str = ""
    cap_reached: bool = False           # the model emitted no end token: a "run-on" take, to be refused
    audio_dropped: bool = False         # audio removed by the worker to fit the response (0.1 s of silence instead)

    def signal(self):
        import numpy as np
        import soundfile as sf
        x, sr = sf.read(io.BytesIO(self.data), dtype="float32", always_2d=False)
        if x.ndim == 2:
            x = x.mean(axis=1)
        return np.ascontiguousarray(x), int(sr)

    def wav(self, sample_rate: int | None = None) -> bytes:
        """Mono 16-bit WAV at the model rate or resampled (soxr, else scipy)."""
        import numpy as np
        import soundfile as sf
        x, sr = self.signal()
        if sample_rate and sample_rate != sr:
            x = resample(x, sr, sample_rate)
            sr = sample_rate
        buf = io.BytesIO()
        sf.write(buf, np.clip(x, -1.0, 1.0), sr, format="WAV", subtype="PCM_16")
        return buf.getvalue()


def resample(x, source: int, target: int):
    import numpy as np
    if source == target or x.size == 0:
        return x
    try:
        import soxr
        return soxr.resample(x, source, target).astype(np.float32)
    except ImportError:
        from math import gcd

        from scipy.signal import resample_poly
        g = gcd(source, target)
        return resample_poly(x, target // g, source // g).astype(np.float32)


def split_jobs(segments: list[Segment]) -> list[list[Segment]]:
    """Split into jobs. Two constraints:
    - consecutive takes of the same text stay in the same job as much as possible (that is what gives the batch its gain);
    - the audio volume of a job stays bounded: MAX_BATCH_CHARS counts ALL segments (each take produces its own audio),
      otherwise the response exceeds what RunPod accepts (14 MB for 8 takes of 40 s: result refused, job lost).
    A group that is too big is cut into pieces that each fit the limit."""
    groups: list[list[Segment]] = []
    for s in segments:
        if groups and groups[-1][0].text == s.text:
            groups[-1].append(s)
        else:
            groups.append([s])
    jobs: list[list[Segment]] = [[]]
    size = 0
    for g in groups:
        per_piece = max(1, min(MAX_BATCH_SEGMENTS, MAX_BATCH_CHARS // max(1, len(g[0].text))))
        for i in range(0, len(g), per_piece):
            piece = g[i:i + per_piece]
            chars = sum(len(x.text) for x in piece)
            if jobs[-1] and (len(jobs[-1]) + len(piece) > MAX_BATCH_SEGMENTS or size + chars > MAX_BATCH_CHARS):
                jobs.append([])
                size = 0
            jobs[-1].extend(piece)
            size += chars
    return [j for j in jobs if j]


class VoiceClient:
    MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-Base"

    def __init__(self, client: GPUClient | None = None, *, function: str = "voice", design_function: str = "voice_design",
                 reel_dir: Path | None = None, step: str = "voice", check_budget: bool = True):
        """`reel_dir`: where the per-reel costs.jsonl lives. `check_budget`: refuse to submit when the daily cap is reached
        (the check runs before any job is sent)."""
        if client is None:
            reel_ledger = costs.Ledger(Path(reel_dir) / "costs.jsonl") if reel_dir is not None else None
            client = GPUClient(journal=costs.gpu_journal(reel_ledger, step))
        self.client = client
        self.function, self.design_function = function, design_function
        self.check_budget = check_budget

    def clone(self, segments: list[Segment], reference: Reference, language: str = "en", batch: int | None = None, *,
              format_: str = "flac", max_tokens: int | None = None, timeout_s: float = 1800.0) -> list[Take]:
        """One job per batch of segments, all submitted at once (several workers in parallel); segment order kept."""
        if not segments:
            return []
        if self.check_budget:
            costs.check_gpu_budget()
        ref = {"audio_b64": base64.b64encode(reference.audio).decode("ascii"), "text": reference.text}
        batch_size = int(batch or os.environ.get("REELFORGE_VOICE_BATCH") or DEFAULT_BATCH)
        requests = []
        for group in split_jobs(segments):
            d: dict[str, Any] = {"reference": ref, "language": language, "format": format_, "batch": batch_size,
                                 "segments": [s.request() for s in group]}
            if max_tokens:
                d["max_new_tokens"] = int(max_tokens)
            requests.append(d)
        results = self.client.call_many(self.function, requests, timeout_s=timeout_s)
        takes: list[Take] = []
        for res in results:
            takes.extend(_takes(res, "segments"))
        if len(takes) != len(segments):
            raise GPUError(f"voice: {len(takes)} takes returned for {len(segments)} segments")
        return takes

    def design(self, description: str, text: str, language: str = "en", seeds: list[int] | None = None, *,
               format_: str = "wav", timeout_s: float = 1800.0) -> list[Take]:
        """One invented-voice candidate per seed (at most 8 per call)."""
        if self.check_budget:
            costs.check_gpu_budget()
        res = self.client.call(self.design_function,
                               {"description": description, "text": text, "language": language,
                                "seeds": list(seeds or [0])[:MAX_DESIGN_SEEDS], "format": format_}, timeout_s=timeout_s)
        return _takes(res, "candidates")


def _takes(res: Result, key: str) -> list[Take]:
    gpu = str(res.output.get("gpu") or "?")
    out = []
    for s in res.output.get(key) or []:
        dropped = not s.get("audio_b64")
        rate = int(s["sample_rate"])
        data = _silence(rate) if dropped else base64.b64decode(s["audio_b64"])
        out.append(Take(data=data, sample_rate=rate, duration_s=float(s["duration_s"]), seed=s.get("seed"),
                        compute_s=float(s.get("compute_s") or s.get("batch_compute_s") or 0), gpu=gpu, job=res.job,
                        cap_reached=bool(s.get("cap_reached")), audio_dropped=dropped))
    return out


def _silence(sample_rate: int, duration_s: float = 0.1) -> bytes:
    """Take dropped by the worker: a short silence, which any take check refuses ("silent audio") and has redone."""
    import numpy as np
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, np.zeros(int(sample_rate * duration_s), dtype=np.float32), sample_rate, format="FLAC", subtype="PCM_16")
    return buf.getvalue()
