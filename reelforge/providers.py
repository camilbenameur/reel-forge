"""Voice providers: ``gpu`` (serverless GPU function, voice cloned by Qwen3-TTS) and ``stub`` (beeps, for tests).

Synthesis goes through ``reelforge.gpu.voice.VoiceClient``: the reference excerpt (``voice-reference/reference.wav``) and its
exact transcript (``reference.txt``) travel with every request; the GPU function returns 24 kHz FLAC, converted here to
48 kHz WAV. Judgement (seeds, take checks, WER, best of N, cache) stays in ``voice.py``: the GPU only makes sound.

The GPU is the only thing that costs money, so all the takes a step needs are sent TOGETHER (``prefetch``: one clone call,
several texts, takes of the same text side by side): a batch of 4 is about 3.5 times faster overall than 4 takes one by one
(measured on an RTX 4090). Retries (a take refused by the checks) go one at a time. Takes the model ran away on
(``cap_reached``: no end token before the token cap) are flagged as defects and refused by the checks.

Settings: REELFORGE_VOICE (gpu | stub), REELFORGE_VOICE_BATCH, REELFORGE_VOICE_TEMPERATURE, REELFORGE_VOICE_TOP_P,
REELFORGE_GPU_DAILY_CAP. RUNPOD_API_KEY is loaded at CLI start by ``secrets.load``, never here.
"""

from __future__ import annotations

import io
import logging
import math
import os
from pathlib import Path

import numpy as np

from . import config, costs
from .gpu.client import GPUError
from .text import base

log = logging.getLogger("reelforge.providers")

TEMPERATURE_VAR = "REELFORGE_VOICE_TEMPERATURE"
TOP_P_VAR = "REELFORGE_VOICE_TOP_P"
OUTPUT_RATE = 48000
STUB_RATE = 24000
WER_THRESHOLD_TEST = 0.30        # test voice (beeps: no check)
WER_THRESHOLD_CLONED = 0.06      # cloned voice: above 6 % wrong words (homophones excluded) the take is redone
REFERENCE_MAX_BYTES = 3_000_000  # larger excerpts are transcoded to 24 kHz FLAC (/run requests are limited to ~10 MB of base64)
SEED_SALT = "reelforge-tts"
PROVIDERS = config.VOICE_PROVIDERS


class ProviderError(RuntimeError):
    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def seed(text: str, attempt: int = 0, base_seed: int = 0) -> int:
    """Deterministic 31-bit seed of a text and its attempt number: sha256("<salt>\\0<base>\\0<attempt>\\0<text>"), 4 bytes."""
    import hashlib
    digest = hashlib.sha256(f"{SEED_SALT}\0{base_seed}\0{attempt}\0{text}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") & 0x7FFFFFFF


def _env_float(var: str) -> float | None:
    raw = (os.environ.get(var) or "").strip()
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        raise ProviderError(f"{var} must be a number, not {raw!r}") from None


class VoiceProvider:
    name = "?"
    deterministic = False          # True: redoing a take gives the same audio (no point retrying)
    whisper_check = True           # False: no WER check (beeps)
    cloned = False                 # True: voice cloned from a reference (warning if the reference is invented)
    wer_threshold = WER_THRESHOLD_TEST
    default_split = "beat"         # ``continuous`` for a voice that holds prosody over a block
    multi_take = False             # True: can produce N takes of one block (best of N)
    probe_before_take = False      # True: voice.py calls probe() before the first real synthesis
    model: str | None = None       # voice model name (report)

    def synthesize(self, text: str, attempt: int = 0) -> bytes:
        raise NotImplementedError

    def prefetch(self, requests: list[tuple[str, int]]) -> None:
        """Prepare in advance the takes (text, attempt) that voice.py will need: nothing by default."""

    def known_defect(self, text: str, attempt: int) -> str | None:
        """Defect reported by the provider itself for this take (e.g. model stopped at the token cap), else None."""
        return None

    def probe(self) -> str:
        return "ok"

    def settings(self) -> str:
        """Settings that change the audio (part of the take cache key); empty if none."""
        return ""

    def fingerprint(self) -> str:
        """Everything that changes the audio: provider, model, reference. Key of the take cache and of the "up to date" skip."""
        return self.name


class Stub(VoiceProvider):
    """Beeps: one per word (about 0.3 s each), a longer pause after the end of a sentence. Deterministic, for tests."""

    name = "stub"
    deterministic = True
    whisper_check = False

    @staticmethod
    def layout(text: str) -> list[tuple[float, float]]:
        """(start, duration) of each word in the take."""
        t, out = 0.0, []
        for word in text.split():
            d = 0.22 + 0.025 * min(len(word), 10)
            out.append((t, d))
            t += d + (0.30 if base.sentence_end(word) else 0.10 if word.endswith(",") else 0.06)
        return out

    def synthesize(self, text: str, attempt: int = 0) -> bytes:
        words = self.layout(text)
        if not words:
            raise ProviderError("empty text")
        total = words[-1][0] + words[-1][1] + 0.1
        x = np.zeros(int(total * STUB_RATE), dtype=np.float32)
        for i, (start, d) in enumerate(words):
            n = int(d * STUB_RATE)
            t = np.arange(n) / STUB_RATE
            freq = 180 + 40 * (i % 3)
            env = np.minimum(1.0, np.minimum(t / 0.02, (d - t) / 0.03)).clip(0, 1)
            a = int(start * STUB_RATE)
            x[a:a + n] = 0.35 * env * np.sin(2 * math.pi * freq * t)
        import soundfile as sf
        buf = io.BytesIO()
        sf.write(buf, x, STUB_RATE, format="WAV", subtype="PCM_16")
        return buf.getvalue()


class GPUVoice(VoiceProvider):
    """Voice cloned on the serverless GPU function ``voice`` (Qwen3-TTS 1.7B Base, Apache-2.0)."""

    name = "gpu"
    cloned = True
    wer_threshold = WER_THRESHOLD_CLONED
    default_split = "continuous"
    multi_take = True
    probe_before_take = True

    def __init__(self, language: str = "en", *, reference_dir: Path | None = None, reel_dir: Path | None = None,
                 client=None, reference=None):
        """``client``: a VoiceClient (tests: over a fake transport); else created on first call with the environment key.
        ``reel_dir``: where costs.jsonl lives (cost of every GPU job of this reel)."""
        from .gpu.voice import VoiceClient
        self.model = VoiceClient.MODEL
        self.language = language
        self.reel_dir = reel_dir
        self._client = client
        self.temperature = _env_float(TEMPERATURE_VAR)
        self.top_p = _env_float(TOP_P_VAR)
        self.reference_dir = reference_dir or config.paths().voice_reference
        self.reference = reference or self._read_reference()
        self._memory: dict[tuple[str, int], bytes] = {}
        self._defects: dict[tuple[str, int], str] = {}

    # --- reference ---
    def _read_reference(self):
        from .gpu.voice import Reference
        try:
            ref = Reference.from_files(self.reference_dir / "reference.wav", self.reference_dir / "reference.txt")
        except GPUError as exc:
            raise ProviderError(f"{exc} (reference voice: voice-reference/reference.wav and reference.txt; "
                                "`python -m reelforge design-voice` invents one)") from exc
        if len(ref.audio) > REFERENCE_MAX_BYTES:
            ref = type(ref)(_transcode_flac(ref.audio), ref.text)
        return ref

    def settings(self) -> str:
        return "|".join(f"{k}={v:g}" for k, v in (("temperature", self.temperature), ("top_p", self.top_p)) if v is not None)

    def fingerprint(self) -> str:
        return f"{self.name}|{self.model}|ref={self.reference.fingerprint}|lang={self.language}"

    def probe(self) -> str:
        """No network call: the GPU function starts cold (1.5 to 2.5 minutes) at the first take."""
        if not (os.environ.get("RUNPOD_API_KEY") or "").strip() and self._client is None:
            raise ProviderError("RUNPOD_API_KEY is missing: put it in ~/.config/reelforge/secrets.env (mode 600) "
                                "or in the repository .env")
        return "serverless GPU function (cold start: 1.5 to 2.5 minutes at the first take)"

    # --- client ---
    def _voice_client(self):
        if self._client is None:
            from .gpu.voice import VoiceClient
            try:
                self._client = VoiceClient(reel_dir=self.reel_dir, step="voice")
            except GPUError as exc:
                raise ProviderError(str(exc)) from exc
        return self._client

    def _clone(self, segments, batch: int):
        try:
            return self._voice_client().clone(segments, self.reference, language=self.language, batch=batch)
        except (GPUError, costs.BudgetExceeded) as exc:
            raise ProviderError(str(exc)) from exc

    def _segment(self, text: str, attempt: int):
        from .gpu.voice import Segment
        return Segment(text, seed=seed(text, attempt), temperature=self.temperature, top_p=self.top_p)

    # --- synthesis ---
    def prefetch(self, requests: list[tuple[str, int]]) -> None:
        """One single ``clone`` request for all the takes (text, attempt): takes of the same text are neighbours (batch =
        their number), several texts share the call. Results wait in memory until ``synthesize`` asks for them."""
        fresh = [r for r in dict.fromkeys(requests) if r not in self._memory]
        if not fresh:
            return
        by_text: dict[str, list[int]] = {}
        for text, attempt in fresh:
            by_text.setdefault(text, []).append(attempt)
        batch = max(len(v) for v in by_text.values())
        order = [(t, a) for t, attempts in by_text.items() for a in attempts]
        log.info("GPU voice: %d take(s) of %d text(s) in one call (batch %d)", len(order), len(by_text), batch)
        takes = self._clone([self._segment(t, a) for t, a in order], batch)
        for (text, attempt), take in zip(order, takes):
            self._memory[(text, attempt)] = take.wav(OUTPUT_RATE)
            self._note_defect(text, attempt, take)

    def _note_defect(self, text: str, attempt: int, take) -> None:
        if take.cap_reached or take.audio_dropped:
            self._defects[(text, attempt)] = ("run-on take: the model emitted no end token before the token cap "
                                              f"({take.duration_s:.1f} s generated)")
        else:
            self._defects.pop((text, attempt), None)

    def known_defect(self, text: str, attempt: int) -> str | None:
        return self._defects.get((text, attempt))

    def synthesize(self, text: str, attempt: int = 0) -> bytes:
        already = self._memory.pop((text, attempt), None)
        if already is not None:
            return already
        takes = self._clone([self._segment(text, attempt)], 1)
        self._note_defect(text, attempt, takes[0])
        return takes[0].wav(OUTPUT_RATE)


def _transcode_flac(data: bytes) -> bytes:
    import soundfile as sf

    from .gpu.voice import resample
    x, rate = sf.read(io.BytesIO(data), dtype="float32", always_2d=False)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = resample(np.ascontiguousarray(x), int(rate), 24000)
    buf = io.BytesIO()
    sf.write(buf, x, 24000, format="FLAC", subtype="PCM_16")
    return buf.getvalue()


def choose(name: str | None = None, *, language: str = "en", reel_dir: Path | None = None) -> VoiceProvider:
    """``gpu`` (production) or ``stub`` (tests); without configuration, stub."""
    name = config.voice_provider(name)
    if name == "stub":
        return Stub()
    return GPUVoice(language, reel_dir=reel_dir)
