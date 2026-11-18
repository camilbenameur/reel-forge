"""Speech recognition: word-level transcription (faster-whisper on CPU, int8), word error rate (WER), and matching of the
words of a script to the recognized words.

faster-whisper is imported on first use only. The engine is interchangeable: a function ``(path, language, model) ->
list[Word]`` (a fake in tests). Transcriptions are cached on disk, keyed by the audio content, the model and the language.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable, Mapping, Sequence

from . import config
from .text import base

MIN_WORD_S = 0.04
MATCH_THRESHOLD = 0.30         # minimum share of script words found, else proportional fallback
LOCAL_ENGINE = "faster-whisper"

_MODELS: dict[str, object] = {}


class RecognitionError(RuntimeError):
    pass


@dataclass(frozen=True)
class Word:
    text: str
    start: float
    end: float


Engine = Callable[[Path, str, str], "list[Word]"]


def _load_model(name: str):
    """faster-whisper model kept in memory for the whole process (reloading costs several seconds)."""
    if name not in _MODELS:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RecognitionError("faster-whisper is not installed: pip install faster-whisper") from exc
        try:
            _MODELS[name] = WhisperModel(name, device="cpu", compute_type="int8", local_files_only=True)
        except Exception:  # noqa: BLE001 - model not in the local cache: downloaded once
            _MODELS[name] = WhisperModel(name, device="cpu", compute_type="int8")
    return _MODELS[name]


def local_engine(path: Path, language: str, model: str) -> list[Word]:
    """Default engine: faster-whisper on CPU. Word timestamps, silence filter, no conditioning on the previous text (on a
    long narration it produces repetition loops)."""
    segments, _ = _load_model(model).transcribe(str(path), language=language, word_timestamps=True, vad_filter=True,
                                                condition_on_previous_text=False)
    return [Word(w.word.strip(), float(w.start), float(w.end)) for seg in segments for w in (seg.words or [])
            if w.word.strip()]


def _sha1(path: Path) -> str:
    h = hashlib.sha1()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def cache_key(path: Path, language: str, model: str, engine: str = LOCAL_ENGINE) -> str:
    key = f"{_sha1(path)}|{model}|{language}"
    return key if engine == LOCAL_ENGINE else f"{key}|{engine}"


def transcribe(path: Path | str, language: str = "en", model: str | None = None, engine: Engine | None = None,
               cache: Path | str | None = None) -> list[Word]:
    """Timed words of an audio file. ``cache``: a JSON file (written atomically), valid while the audio, the model, the
    language and the engine do not change."""
    path = Path(path)
    name = model or config.whisper_model()
    engine_name = LOCAL_ENGINE if engine is None else getattr(engine, "__name__", "engine")
    key = cache_key(path, language, name, engine_name) if cache is not None else ""
    if cache is not None and Path(cache).exists():
        try:
            data = json.loads(Path(cache).read_text(encoding="utf-8"))
            if data.get("key") == key:
                return [Word(*w) for w in data["words"]]
        except (ValueError, TypeError, OSError):
            pass                                              # unreadable cache: transcribe again
    words = (engine or local_engine)(path, language, name)
    if cache is not None:
        cache = Path(cache)
        cache.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache.with_suffix(cache.suffix + ".tmp")
        tmp.write_text(json.dumps({"key": key, "model": name, "language": language,
                                   "words": [[w.text, w.start, w.end] for w in words]}, ensure_ascii=False),
                       encoding="utf-8")
        os.replace(tmp, cache)
    return words


# --- word error rate ----------------------------------------------------------------------------------------------------------

def distance(a: Sequence[str], b: Sequence[str]) -> int:
    """Word-level Levenshtein distance (insertion, deletion, substitution at cost 1)."""
    previous = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        current = [i]
        for j, y in enumerate(b, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x != y)))
        previous = current
    return previous[-1]


def wer(reference: Sequence[str], hypothesis: Sequence[str]) -> float:
    """Distance over the number of reference words (can exceed 1). Token lists, see ``tokens``."""
    ref, hyp = list(reference), list(hypothesis)
    if not ref:
        return 0.0 if not hyp else 1.0
    return distance(ref, hyp) / len(ref)


def tokens(text: str, language: str = "en") -> list[str]:
    """Comparison tokens of a text (numbers read in words, accents and punctuation removed)."""
    return base.tokens(text, language)


def recognized_tokens(words: Sequence[str], language: str = "en") -> list[str]:
    """Tokens of a transcription (list of word texts); "l'" + "ai" is glued back to "l'ai", as in the script."""
    text = ""
    for w in words:
        text += w if (text.endswith(("'", "’")) or w.startswith(("'", "’"))) else (" " + w)
    return base.tokens(text.replace("'", "").replace("’", ""), language)


def phonetic_key(word: str, language: str = "en") -> str:
    """Rough phonetic key so homophones are not counted as voice errors (the recognizer can only guess): NOT a
    phonetization, only frequent cases."""
    if language == "fr":
        from .text import fr
        return fr.phonetic_key(word)
    t = base.normalize(word)
    if len(t) <= 2:
        return t
    t = t.replace("ph", "f").replace("ck", "k").replace("wh", "w").replace("kn", "n")
    t = re.sub(r"(.)\1+", r"\1", t)                        # doubled letters: ll -> l
    if len(t) > 3 and t.endswith("s") and not t.endswith("ss"):
        t = t[:-1]                                         # plural / third person
    return t


def apply_aliases(tokens_: Sequence[str], aliases: Mapping[str, str] | None = None) -> list[str]:
    return [(aliases or {}).get(t, t) for t in tokens_]


def wer_phonetic(ref: Sequence[str], hyp: Sequence[str], aliases: Mapping[str, str] | None = None,
                 language: str = "en") -> float:
    """The reference measure: a homophone (its / it's) is not a mistake of the voice. Compares phonetic keys after
    applying the alias dictionary (variant -> canonical form: acronyms, proper names)."""
    return wer([phonetic_key(w, language) for w in apply_aliases(ref, aliases)],
               [phonetic_key(w, language) for w in apply_aliases(hyp, aliases)])


# Variants a recognizer commonly writes for names and acronyms the voice says correctly: canonical -> variants.
ALIASES_BASE = {
    "en": {"ai": {"ai", "ay", "aye"}, "api": {"api", "apis"}, "llm": {"llm", "llms", "elelem"}, "gpu": {"gpu", "gpus"},
           "claude": {"claude", "clod", "clawed", "cloud", "claud"}, "n8n": {"n8n", "nhuitn"}},
    "fr": {"ia": {"ia", "ya", "iya", "ea", "hia"}, "api": {"api", "apei", "apis"}, "llm": {"llm", "elelem", "lelelem"},
           "gpu": {"gpu", "gepeu", "gepu", "jepeu"}, "claude": {"claude", "clode", "clod", "claud", "cloud"},
           "n8n": {"n8n", "nhuitn", "enhuitn"}},
}


def aliases(language: str = "en") -> dict[str, str]:
    """variant (normalized) -> canonical form; completed by ``brand/pronunciation_aliases.json`` when it exists
    ({"canonical": ["variant", ...]})."""
    maps = {k: set(v) for k, v in ALIASES_BASE.get(language, {}).items()}
    extra = config.paths().root / "brand" / "pronunciation_aliases.json"
    if extra.is_file():
        try:
            for k, v in json.loads(extra.read_text(encoding="utf-8")).items():
                maps.setdefault(base.normalize(k), set()).update(base.normalize(x) for x in v)
        except (ValueError, AttributeError):
            pass
    return {var: canon for canon, variants in maps.items() for var in variants | {canon}}


# --- matching ---------------------------------------------------------------------------------------------------------------------

def spread(weights: Sequence[int], start: float, end: float) -> list[tuple[float, float]]:
    """Cut [start, end] into contiguous parts proportional to the weights (a zero weight counts as 1)."""
    w = [max(int(x), 1) for x in weights]
    total = sum(w)
    out, cumulative = [], 0
    for x in w:
        out.append((start + (end - start) * cumulative / total, start + (end - start) * (cumulative + x) / total))
        cumulative += x
    return out


def word_key(word: str, language: str = "en") -> str:
    """Comparison form of a script word or a transcription word (numbers read in words, accents and punctuation removed)."""
    return "".join(base.tokens(base.spoken_text(word, language), language))


def _monotone(spans: list[tuple[float, float, str]], start: float, end: float) -> list[tuple[float, float, str]]:
    """Increasing starts, no overlap, minimum duration, everything inside [start, end]."""
    out, previous = [], start
    for s, e, source in spans:
        s = min(max(s, previous), end)
        e = min(max(e, s + MIN_WORD_S), max(end, s + MIN_WORD_S))
        out.append((s, e, source))
        previous = e
    return out


def match(script_words: Sequence[str], recognized: Sequence[Word], start: float, end: float,
          language: str = "en") -> tuple[list[tuple[float, float, str]], float]:
    """Times of ``script_words`` (displayed texts) in [start, end] from the recognized words.

    Word-by-word matching with difflib; replaced blocks (numbers, split or merged words) share the recognized interval in
    proportion to their letters; unmatched words are interpolated between their neighbours. Returns ([(start, end, source)],
    share of exactly matched words), source being "recognized", "approx", "interpolated" or "proportional" (full fallback when
    fewer than MATCH_THRESHOLD of the words are found)."""
    n = len(script_words)
    if n == 0:
        return [], 1.0
    weights = [max(len(w), 1) for w in script_words]
    a = [word_key(w, language) for w in script_words]
    b = [word_key(r.text, language) for r in recognized]
    result: list[tuple[float, float, str] | None] = [None] * n
    exact = 0
    if recognized:
        for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if tag == "equal":
                for k in range(i2 - i1):
                    r = recognized[j1 + k]
                    result[i1 + k] = (r.start, r.end, "recognized")
                    exact += 1
            elif tag == "replace":
                bounds = spread(weights[i1:i2], recognized[j1].start, recognized[j2 - 1].end)
                for (s, e), i in zip(bounds, range(i1, i2)):
                    result[i] = (s, e, "approx")
    share = exact / n
    if share < MATCH_THRESHOLD:
        return [(s, e, "proportional") for s, e in spread(weights, start, end)], share
    i = 0
    while i < n:
        if result[i] is not None:
            i += 1
            continue
        j = i
        while j < n and result[j] is None:
            j += 1
        left = result[i - 1][1] if i > 0 else start
        right = result[j][0] if j < n else end
        if right < left:
            right = left
        for (s, e), k in zip(spread(weights[i:j], left, right), range(i, j)):
            result[k] = (s, e, "interpolated")
        i = j
    return _monotone([r for r in result if r is not None], start, end), share
