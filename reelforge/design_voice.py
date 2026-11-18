"""The ``design-voice`` command: invents the reference voice (Qwen3-TTS VoiceDesign, GPU function ``voice_design``).

No person is cloned: the model creates a voice from a description. Several seeds give several candidates (written to
voice-reference/candidates/), the best one is copied to voice-reference/reference.wav; reference.txt keeps the spoken text and
reference.source keeps the description, the seed, the date and the model (hence the fact that the voice is invented, which the
caption's AI disclosure is computed from).

Default description and text: those of voice-reference/reference.source (line "Description: ...") and reference.txt, else the
built-in ones. Choice of the best candidate: the heuristic take score (no model needed); WER is not used (no reference to read).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from . import audio, config, costs
from .gpu.client import GPUError
from .reel import ReelError

log = logging.getLogger("reelforge.design_voice")

DEFAULT_SEEDS = [11, 23, 37, 41]
MAX_SEEDS = 8
RATE = 48000
DEFAULT_DESCRIPTION = ("A warm, clear voice of an adult speaker, mid-range pitch, calm and friendly, natural conversational "
                       "pace, like a teacher explaining something simple to a friend.")
DEFAULT_TEXT = ("Most people think making a short video is about the editing. It is not. It is about the first second, the "
                "promise you make, and whether you keep it before the end.")
_DESCRIPTION = re.compile(r"^\s*Description\s*:\s*(.+?)\s*$", re.I | re.M)
_SEED = re.compile(r"^\s*Seed\s*:\s*(\d+)", re.I | re.M)
Scorer = Callable[[Path, str], "float | None"]


def read_source(folder: Path) -> dict[str, str]:
    """Description and seed of reference.source (free format: lines "Description: ..." and "Seed: N")."""
    path = folder / "reference.source"
    if not path.is_file():
        return {}
    text = path.read_text(encoding="utf-8")
    out: dict[str, str] = {}
    if m := _DESCRIPTION.search(text):
        out["description"] = m.group(1)
    if m := _SEED.search(text):
        out["seed"] = m.group(1)
    return out


def parse_seeds(raw: str | None) -> list[int]:
    if not raw:
        return list(DEFAULT_SEEDS)
    try:
        seeds = [int(x) for x in raw.replace(";", ",").split(",") if x.strip()]
    except ValueError:
        raise ReelError(f"design-voice: --seeds expects integers separated by commas, not {raw!r}") from None
    if not 1 <= len(seeds) <= MAX_SEEDS:
        raise ReelError(f"design-voice: from 1 to {MAX_SEEDS} seeds (got {len(seeds)})")
    return seeds


def score_candidate(path: Path, text: str) -> float | None:
    """Heuristic score of a candidate (pace, pauses, clipping), see ``voice.heuristic_score``."""
    from .voice import heuristic_score
    x, sr = audio.read(path)
    return heuristic_score(x, sr, text)


def design(description: str | None = None, text: str | None = None, seeds: list[int] | None = None, *, client=None,
           folder: Path | None = None, score: Scorer | None = score_candidate,
           now: Callable[[], datetime] | None = None) -> dict:
    """Write the candidates, choose the best and write reference.wav / .txt / .source. Returns a report (dict).
    ``client``: a VoiceClient (tests: over a fake transport); ``score=None``: take the first candidate."""
    folder = folder or config.paths().voice_reference
    source = read_source(folder)
    description = (description or source.get("description") or DEFAULT_DESCRIPTION).strip()
    text_path = folder / "reference.txt"
    if text is None and text_path.is_file():
        text = text_path.read_text(encoding="utf-8")
    text = (text or DEFAULT_TEXT).strip()
    seeds = seeds or list(DEFAULT_SEEDS)
    if client is None:
        from .gpu.voice import VoiceClient
        try:
            costs.check_gpu_budget()
            client = VoiceClient(reel_dir=folder, step="design-voice")
        except (GPUError, costs.BudgetExceeded) as exc:
            raise ReelError(f"design-voice: {exc}") from exc
    try:
        candidates = client.design(description, text, language="en", seeds=seeds)
    except (GPUError, costs.BudgetExceeded) as exc:
        raise ReelError(f"design-voice: {exc}") from exc
    if not candidates:
        raise ReelError("design-voice: the GPU function returned no candidate")
    folder_candidates = folder / "candidates"
    folder_candidates.mkdir(parents=True, exist_ok=True)
    results = []
    for i, c in enumerate(candidates):
        seed = c.seed if c.seed is not None else seeds[min(i, len(seeds) - 1)]
        path = folder_candidates / f"candidate-{seed}.wav"
        path.write_bytes(c.wav(RATE))
        value = score(path, text) if score else None
        results.append({"seed": seed, "file": path, "score": value, "duration_s": round(c.duration_s, 2)})
        log.info("candidate seed %s: %.1f s, score %s", seed, c.duration_s, "?" if value is None else f"{value:.1f}")
    scored = [r for r in results if r["score"] is not None]
    best = max(scored, key=lambda r: r["score"]) if scored else results[0]
    (folder / "reference.wav").write_bytes(best["file"].read_bytes())
    text_path.write_text(text + "\n", encoding="utf-8")
    from .gpu.voice import VoiceClient
    day = (now or (lambda: datetime.now(timezone.utc)))().date().isoformat()
    (folder / "reference.source").write_text(
        "INVENTED VOICE (Qwen3-TTS VoiceDesign): no person is cloned.\n"
        f"Description: {description}\n"
        f"Seed: {best['seed']}\n"
        f"Date: {day}\n"
        f"Model: {getattr(client, 'DESIGN_MODEL', 'Qwen3-TTS-12Hz-1.7B-VoiceDesign')} "
        f"(reference then cloned by {VoiceClient.MODEL})\n"
        + (f"Score: {best['score']:.1f}/100\n" if best["score"] is not None else ""), encoding="utf-8")
    return {"candidates": results, "retained": best, "description": description}


def run(description: str | None = None, text: str | None = None, seeds: str | None = None) -> dict:
    """Entry point of the CLI command."""
    return design(description, text, parse_seeds(seeds))
