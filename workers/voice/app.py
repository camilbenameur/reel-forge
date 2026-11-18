"""Voice GPU functions of reelforge (RunPod SDK 2, application "reelforge-voice"), billed per second.

Module sent as is to the RunPod workers: it must stay SELF-CONTAINED (standard library, numpy; torch, qwen_tts and
soundfile are imported inside the functions, they only exist on the worker).

    voice(request)          cloning, Qwen3-TTS 1.7B Base (Apache-2.0)
    voice_design(request)   inventing a voice from a description, Qwen3-TTS 1.7B VoiceDesign (Apache-2.0)

Only the text to say and the reference voice excerpt are sent (no key, no personal data). Every response is a dict with
`ok`; on failure `{"ok": false, "error": ..., "correctable": bool}`, where `correctable` means the request itself is wrong.
Deploy with `python -m reelforge.gpu deploy`.
"""

from __future__ import annotations

import base64
import hashlib
import io
import os
import time
from typing import Any

import runpod

VERSION = "2026-11-18.3"

app = runpod.App("reelforge-voice")

QWEN_BASE = runpod.Model("Qwen/Qwen3-TTS-12Hz-1.7B-Base")
QWEN_DESIGN = runpod.Model("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")

# Qwen3-TTS 1.7B: 4.4 GB for one segment, ~1.8 GB more per segment of a batch (9.8 GB measured for 4). 16 GB cards (0.58 USD/h)
# first, then 24 GB. Cards are named one by one: RunPod pools include MIG slices of RTX PRO 6000 on which the PyTorch CUDA
# allocator fails (NVML unavailable under MIG, observed on 2026-11-18).
GPU_VOICE = [g for g in (os.environ.get("REELFORGE_GPU_VOICE") or ",".join([
    "NVIDIA RTX A4000", "NVIDIA RTX A4500", "NVIDIA RTX 4000 Ada Generation", "NVIDIA RTX A5000", "NVIDIA GeForce RTX 3090",
    "NVIDIA L4", "NVIDIA GeForce RTX 4090"])).split(",") if g]
# A second worker only starts when a job has been waiting for more than 60 s: a cold start takes ~1 to 2 min, there is no
# point launching three for a single job (observed in development: 4 workers started for 1 job).
SCALING = {"scaler_type": "QUEUE_DELAY", "scaler_value": 60}
DEPENDENCIES = ["qwen-tts==0.1.1", "soundfile", "numpy"]
EXCLUDED_FROM_DEPLOYMENT = ["sox"]      # no Linux wheel; replaced by an empty module (see _without_sox)

LANGUAGES = {"fr": "French", "de": "German", "en": "English", "es": "Spanish", "it": "Italian", "pt": "Portuguese",
             "ru": "Russian", "zh": "Chinese", "ja": "Japanese", "ko": "Korean"}
TEXT_MAX = 2000              # characters per segment
SEGMENTS_MAX = 64            # segments per request
BATCH_MAX = 8                # segments generated together on the card (same pass): ~6 on 16 GB, 8 on 24 GB
REF_MIN_S, REF_MAX_S = 1.0, 60.0
CANDIDATES_MAX = 8
TOKENS_PER_S = 12.5          # the 12 Hz Qwen3-TTS codec emits 12.5 steps per second of audio
CHARS_PER_S = 12.0           # cautious rate (French ~14-15, German ~13): the expected duration is rather over-estimated
DURATION_MARGIN = 2.2        # a take longer than 2.2 times the expected duration is refused by the pipeline anyway
# Maximum size of a response: beyond it RunPod refuses the job result (HTTP 400 on job-done, observed on 2026-11-18 with 4
# run-on takes of 163 s). The audio of takes stopped at the cap is dropped first.
RESPONSE_MAX_BYTES = 9_000_000


class RequestError(ValueError):
    """Invalid request: the caller must fix it, retrying is pointless."""


def _b64(text: str, field: str) -> bytes:
    try:
        return base64.b64decode(text, validate=True)
    except Exception as exc:
        raise RequestError(f"{field}: invalid base64 ({exc})") from None


def _mono(audio: Any):
    import numpy as np
    a = np.asarray(audio, dtype=np.float32)
    if a.ndim == 2:
        a = a.mean(axis=1) if a.shape[0] >= a.shape[1] else a.mean(axis=0)
    return np.ascontiguousarray(a.reshape(-1))


def _encode(audio: Any, sample_rate: int, format_: str) -> str:
    """FLAC (lossless, ~2 times lighter) or WAV, mono 16-bit at the model rate; peaks are clipped, never renormalised (the
    level is the model's)."""
    import numpy as np
    import soundfile as sf
    buf = io.BytesIO()
    sf.write(buf, np.clip(_mono(audio), -1.0, 1.0), sample_rate, format="FLAC" if format_ == "flac" else "WAV",
             subtype="PCM_16")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _seed(seed: int | None) -> None:
    if seed is None:
        return
    import random

    import numpy as np
    import torch
    random.seed(seed)
    np.random.seed(seed % (2**32))
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def _language(code: str | None) -> str:
    code = (code or "en").strip()
    if code in LANGUAGES.values():
        return code
    if code.lower() in LANGUAGES:
        return LANGUAGES[code.lower()]
    raise RequestError(f"unknown language: {code!r} (codes: {', '.join(LANGUAGES)})")


def _hardware() -> dict[str, Any]:
    try:
        import torch
        p = torch.cuda.get_device_properties(0)
        return {"gpu": p.name, "vram_gb": round(p.total_memory / 2**30, 1),
                "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 2**30, 2)}
    except Exception:
        return {"gpu": "?"}


def _path(model: "runpod.Model") -> str:
    """Weights pre-loaded by RunPod on the host if present, else the Hugging Face id (download)."""
    try:
        if model.path.exists() and any(model.path.iterdir()):
            return str(model.path)
        snaps = sorted((model.hf_cache_path / "snapshots").glob("*"))
        if snaps:
            return str(snaps[-1])
    except OSError:
        pass
    return f"{model.owner}/{model.name}"


def _error(exc: BaseException) -> dict[str, Any]:
    return {"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:500]}",
            "correctable": isinstance(exc, RequestError), "version": VERSION}


_STATE: dict[str, Any] = {}


def _without_sox() -> None:
    """qwen_tts imports `sox` (a package without a Linux wheel, excluded from the deployment) for its 25 Hz tokenizer alone,
    which the 12 Hz models do not use: an empty module is enough for the import; a real call would raise AttributeError,
    never silently."""
    import sys
    import types
    try:
        import sox  # noqa: F401
    except ImportError:
        sys.modules["sox"] = types.ModuleType("sox")


def _qwen(key: str, model: "runpod.Model"):
    """A model loaded once per worker (the weights are already on the host: ~3 s)."""
    if key not in _STATE:
        import torch
        _without_sox()
        from qwen_tts import Qwen3TTSModel
        t0 = time.monotonic()
        _STATE[key] = Qwen3TTSModel.from_pretrained(_path(model), device_map="cuda:0", dtype=torch.bfloat16,
                                                    attn_implementation=os.environ.get("VOICE_ATTN") or "sdpa")
        _STATE[f"{key}_s"] = round(time.monotonic() - t0, 2)
    return _STATE[key]


def _options(seg: dict[str, Any], tokens: int) -> dict[str, Any]:
    o: dict[str, Any] = {"max_new_tokens": tokens}
    for key, name in (("temperature", "temperature"), ("top_p", "top_p"), ("top_k", "top_k"),
                      ("repetition_penalty", "repetition_penalty")):
        if seg.get(key) is not None:
            o[name] = float(seg[key]) if key != "top_k" else int(seg[key])
    if any(k in o for k in ("temperature", "top_p", "top_k")):
        o["do_sample"] = True
    return o


def token_cap(text: str) -> int:
    """Token cap of a segment, proportional to its text length: a "run-on" take (the model does not emit the end, a known
    flaw of cloned voices) stops at ~2.2 times the expected duration instead of running for 163 s and holding the whole batch."""
    expected = max(1.5, len(text) / CHARS_PER_S)
    return int(min(2048, max(96, TOKENS_PER_S * expected * DURATION_MARGIN + 40)))


def _groups(segments: list[dict[str, Any]], batch: int) -> list[list[int]]:
    """Segment indices grouped by batch: same sampling settings, at most `batch`, original order.

    In a batch, a single seed (that of the first segment) fixes the draw of the whole pass: N takes of one text in a batch
    give N different draws, reproducible for the same batch composition."""
    if batch <= 1:
        return [[i] for i in range(len(segments))]
    groups: list[list[int]] = []
    open_: dict[tuple, list[int]] = {}
    for i, s in enumerate(segments):
        key = tuple(s.get(k) for k in ("temperature", "top_p", "top_k", "repetition_penalty"))
        g = open_.get(key)
        if g is None or len(g) >= batch:
            g = []
            groups.append(g)
            open_[key] = g
        g.append(i)
    return groups


def _lighten(outputs: list[dict[str, Any] | None]) -> None:
    """Keep the response under RESPONSE_MAX_BYTES: drop the audio of takes stopped at the cap first (the pipeline refuses
    them anyway), then of the longest ones; a dropped take keeps its duration and carries `audio_dropped: true`."""
    def size() -> int:
        return sum(len(s["audio_b64"] or "") for s in outputs if s)
    order = sorted((s for s in outputs if s), key=lambda s: (not s["cap_reached"], -s["duration_s"]))
    for s in order:
        if size() <= RESPONSE_MAX_BYTES:
            break
        s["audio_b64"], s["audio_dropped"] = None, True


@app.queue(name="voice", gpu=GPU_VOICE, workers=(0, 2), idle_timeout=90, execution_timeout_ms=900_000,
           model=QWEN_BASE, dependencies=DEPENDENCIES, **SCALING)
def voice(request: dict) -> dict:
    """Say each segment with the voice of the reference excerpt.

    request  = {"reference": {"audio_b64": WAV/FLAC, "text": exact transcript},
                "language": "en" | "fr" | ..., "format": "flac" | "wav", "batch": 1..8, "max_new_tokens": 2048,
                "segments": [{"text", "seed", "temperature", "top_p", "top_k", "repetition_penalty"}, ...]}
    response = {"ok": true, "segments": [{"audio_b64", "sample_rate", "duration_s", "seed", "batch", "token_cap",
                "cap_reached", "audio_dropped"}], "compute_s", "gpu", ...}
    """
    try:
        import tempfile

        import numpy as np
        import soundfile as sf

        t0 = time.monotonic()
        ref = request.get("reference") or {}
        ref_text = (ref.get("text") or "").strip()
        if not ref_text:
            raise RequestError("reference.text (exact transcript of the excerpt) is required")
        ref_audio = _b64(ref.get("audio_b64") or "", "reference.audio_b64")
        segments = request.get("segments") or []
        if not 1 <= len(segments) <= SEGMENTS_MAX:
            raise RequestError(f"segments: 1 to {SEGMENTS_MAX} expected, {len(segments)} received")
        for i, s in enumerate(segments):
            if not (s.get("text") or "").strip() or len(s["text"]) > TEXT_MAX:
                raise RequestError(f"segment {i}: text empty or longer than {TEXT_MAX} characters")
        language = _language(request.get("language"))
        format_ = "wav" if request.get("format") == "wav" else "flac"
        max_tokens = request.get("max_new_tokens")
        batch = max(1, min(BATCH_MAX, int(request.get("batch") or 1)))

        model = _qwen("base", QWEN_BASE)
        ref_key = hashlib.sha256(ref_audio + ref_text.encode("utf-8")).hexdigest()
        prompts = _STATE.setdefault("prompts", {})
        if ref_key not in prompts:          # voice traits extracted once per reference and per worker
            wave, sr = sf.read(io.BytesIO(ref_audio), dtype="float32", always_2d=False)
            ref_duration = len(wave) / sr if sr else 0.0
            if not REF_MIN_S <= ref_duration <= REF_MAX_S:
                raise RequestError(f"reference excerpt of {ref_duration:.1f} s: {REF_MIN_S:g} to {REF_MAX_S:g} s expected")
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                path = f.name
            sf.write(path, _mono(wave), sr, subtype="PCM_16")
            prompts[ref_key] = model.create_voice_clone_prompt(ref_audio=path, ref_text=ref_text, x_vector_only_mode=False)
            os.unlink(path)
        prompt = prompts[ref_key]

        outputs: list[dict[str, Any] | None] = [None] * len(segments)
        for n, group in enumerate(_groups(segments, batch)):
            first = segments[group[0]]
            _seed(first.get("seed"))
            t = time.monotonic()
            texts = [segments[i]["text"].strip() for i in group]
            tokens = int(max_tokens) if max_tokens else max(token_cap(x) for x in texts)
            waves, rate = model.generate_voice_clone(text=texts if len(texts) > 1 else texts[0], language=language,
                                                     voice_clone_prompt=prompt, **_options(first, tokens))
            compute = round(time.monotonic() - t, 3)
            for i, wave in zip(group, waves):
                mono = _mono(wave)
                if mono.size == 0 or not np.all(np.isfinite(mono)):
                    raise RuntimeError(f"segment {i}: empty or non-finite audio")
                duration = mono.size / int(rate)
                outputs[i] = {"audio_b64": _encode(mono, int(rate), format_), "sample_rate": int(rate),
                              "duration_s": round(duration, 3), "seed": segments[i].get("seed"), "batch": n,
                              "batch_compute_s": compute, "token_cap": tokens,
                              "cap_reached": duration >= tokens / TOKENS_PER_S - 0.6, "audio_dropped": False}
        _lighten(outputs)
        return {"ok": True, "segments": outputs, "model": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "language": language,
                "format": format_, "batch": batch, "version": VERSION, "load_s": _STATE.get("base_s"),
                "compute_s": round(time.monotonic() - t0, 3), **_hardware()}
    except Exception as exc:
        return _error(exc)


@app.queue(name="voice_design", gpu=GPU_VOICE, workers=(0, 1), idle_timeout=60, execution_timeout_ms=900_000,
           model=QWEN_DESIGN, dependencies=DEPENDENCIES, **SCALING)
def voice_design(request: dict) -> dict:
    """Invent voices without cloning anyone: one candidate per seed, which then serves as the reference for `voice`.

    request  = {"description": str, "text": str (read by the voice, becomes the transcript of the reference),
                "language": "en", "seeds": [int, ...] (at most 8), "format": "flac" | "wav"}
    response = {"ok": true, "candidates": [{"seed", "audio_b64", "sample_rate", "duration_s", "compute_s"}], ...}
    """
    try:
        t0 = time.monotonic()
        description = (request.get("description") or "").strip()
        text = (request.get("text") or "").strip()
        if not description or not text or len(text) > TEXT_MAX:
            raise RequestError(f"description and text (at most {TEXT_MAX} characters) are required")
        seeds = [int(g) for g in (request.get("seeds") or [0])][:CANDIDATES_MAX]
        language = _language(request.get("language"))
        format_ = "wav" if request.get("format") == "wav" else "flac"
        model = _qwen("design", QWEN_DESIGN)
        candidates = []
        for seed in seeds:
            _seed(seed)
            t = time.monotonic()
            waves, rate = model.generate_voice_design(text=text, language=language, instruct=description)
            mono = _mono(waves[0])
            candidates.append({"seed": seed, "audio_b64": _encode(mono, int(rate), format_), "sample_rate": int(rate),
                               "duration_s": round(mono.size / int(rate), 3), "compute_s": round(time.monotonic() - t, 3)})
        return {"ok": True, "candidates": candidates, "model": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
                "language": language, "format": format_, "version": VERSION, "load_s": _STATE.get("design_s"),
                "compute_s": round(time.monotonic() - t0, 3), **_hardware()}
    except Exception as exc:
        return _error(exc)


@runpod.local_entrypoint
def bench():
    """Speed bench: 4 takes of one block, sequential then in one batch (rp flash dev workers/voice/app.py --once)."""
    import json
    import pathlib

    out = pathlib.Path(os.environ.get("REELFORGE_GPU_TRIALS") or "trials")
    out.mkdir(parents=True, exist_ok=True)
    ref = (out / "reference.flac").read_bytes()
    ref_text = (out / "reference.txt").read_text(encoding="utf-8").strip()
    block = ("Three tasks an AI already does better than you. The first will surprise you: sorting your mail. "
             "The second? Following up with your clients, without forgetting anyone.")
    common = {"reference": {"audio_b64": base64.b64encode(ref).decode(), "text": ref_text}, "language": "en"}
    results = {}
    for batch in (1, 4):
        t = time.monotonic()
        r = voice.remote({**common, "batch": batch,
                          "segments": [{"text": block, "seed": 100 + k, "temperature": 0.9} for k in range(4)]})
        results[f"batch{batch}"] = {"wall_s": round(time.monotonic() - t, 1), **{k: v for k, v in r.items() if k != "segments"},
                                    "durations": [s["duration_s"] for s in r.get("segments") or []]}
        print(batch, json.dumps(results[f"batch{batch}"], ensure_ascii=False))
        for k, s in enumerate(r.get("segments") or []):
            (out / f"bench-batch{batch}-take{k}.flac").write_bytes(base64.b64decode(s["audio_b64"]))
    (out / "bench.json").write_text(json.dumps(results, indent=1, ensure_ascii=False))
