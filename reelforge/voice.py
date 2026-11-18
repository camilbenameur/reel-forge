"""The ``voice`` step: synthesis, check of every take, assembly, loudness -> voice.wav + voice/takes.json.

Two splits (``--split`` or REELFORGE_VOICE_SPLIT, default: the provider's own):

- ``continuous`` (default of the gpu provider): consecutive beats are grouped into blocks as large as possible under
  REELFORGE_VOICE_BLOCK_MAX characters (600), joined by a line break and strong punctuation, so the model places its own
  pauses and keeps a prosody that lives over several sentences. One request per block, checks per block. The beat boundaries
  INSIDE a block are found on the word-by-word transcription of the check (``align.beat_boundaries``).
- ``beat`` (default of the stub provider): one request per beat, glued with PAUSE_BEATS_S of silence.

Take check (``take_defect``, then WER): silent audio, duration far under or over what the word count predicts, a silence in
the middle; then the faster-whisper WER against the spoken text (provider threshold), with pronunciation aliases (a brand name
the recognizer misspells must not refuse a correct take). A refused take is redone with another seed, 4 attempts at most (useless
for a deterministic voice: one attempt, the defect is only reported). A take flagged ``cap_reached`` by the GPU worker is
refused without recomputation. If no take is good, the lowest-WER one is kept and flagged in takes.json (``ok: false``).

Best of N takes (``--takes N`` or REELFORGE_VOICE_TAKES, default 1; only in continuous split with a multi-take provider): for
each block, N VALID takes (different seeds, each passing the check above; a refused take does not count and is redone, at most
ATTEMPTS_PER_TAKE attempts per missing take) are kept in voice/block-XX-take-K.wav, scored, and the best is retained: lowest
WER first, then highest score, then smallest K. ``--rechoose`` re-scores the cached takes and reassembles without any GPU.

Takes are cached in voice/cache.json under the key provider|model|reference fingerprint|settings|text: changing the reference
voice, the model or a sampling setting invalidates them, changing nothing reuses them without any GPU call.

takes.json: one ``beats`` element per beat with its real ``start``/``duration`` in voice.wav (read by ``align``) and its
``block``; ``blocks`` details every request (and ``takes`` / ``retained`` when several takes were made).
"""

from __future__ import annotations

import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any, Callable

import numpy as np

from . import audio, config, media, recognition
from .costs import BudgetExceeded
from .providers import PROVIDERS, ProviderError, VoiceProvider, choose  # noqa: F401
from .recognition import Word
from .reel import Reel, ReelError, read_json, write_json
from .script import load_validated
from .text import base

log = logging.getLogger("reelforge.voice")

ATTEMPTS_PER_TAKE = 4
PAUSE_BEATS_S = 0.22            # between two takes in beat split
PAUSE_BLOCKS_S = 0.25           # between two blocks in continuous split
TAIL_S = 0.3                    # silence after the last take (without it the last syllable touched the end of the file)
MAX_SILENCE_S = 0.7             # maximum internal silence (graded compression above 0.5 s: audio.target_length)
WORDS_PER_MINUTE = 165
RATIO_MIN, RATIO_MAX, MAX_MARGIN_S = 0.45, 2.2, 2.0
MIN_TAKE_S = 0.25
READABLE_WER = 0.03             # reference for the score: above it a take is not ranked by score (see ``choice_key``)
SAMPLE_RATE = media.DEFAULT_RATE
LUFS = -14.0

Score = Callable[[Path, str], dict]


def expected_duration(n_words: int) -> float:
    return max(0.4, n_words * 60.0 / WORDS_PER_MINUTE)


def take_defect(duration: float, peak: float, gaps: list[float], n_words: int, *, stub: bool = False) -> str | None:
    """Reason why a take is refused (silent, truncated, run-on, holed), None when acceptable. ``stub``: test voice (only
    silence is refused)."""
    expected = expected_duration(n_words)
    if duration <= 0 or peak < audio.MIN_PEAK:
        return "silent or empty audio"
    if stub:
        return None
    if duration < max(MIN_TAKE_S, RATIO_MIN * expected):
        return f"take too short ({duration:.1f} s for about {expected:.1f} s expected)"
    if duration > RATIO_MAX * expected + MAX_MARGIN_S:
        return f"take too long ({duration:.1f} s for about {expected:.1f} s expected, run-on)"
    if gaps:
        return f"silence of {max(gaps):.1f} s in the middle of the take"
    return None


# --- blocks ----------------------------------------------------------------------------------------------------------------------

def punctuate(text: str) -> str:
    """Text of a beat ended by strong punctuation (the model then marks a real end of sentence)."""
    t = text.strip()
    if t and t[-1] in ",;:":
        t = t[:-1].rstrip()
    if t and t.rstrip(" »\"”)'’")[-1:] not in (".", "!", "?", "…"):
        t += "."
    return t


def _greedy(lengths: list[int], limit: int) -> list[list[int]]:
    blocks: list[list[int]] = []
    size = 0
    for i, n in enumerate(lengths):
        if blocks and size + 1 + n <= limit:
            blocks[-1].append(i)
            size += 1 + n
        else:
            blocks.append([i])
            size = n
    return blocks


def group_beats(texts: list[str], limit: int = config.DEFAULT_VOICE_BLOCK_MAX) -> list[list[int]]:
    """Beat indices per block: as few blocks as possible under ``limit`` characters (a longer beat stays alone), then the limit
    is lowered as long as the number of blocks does not change, for balanced blocks (no tiny last block)."""
    lengths = [len(punctuate(t)) for t in texts]
    if not lengths:
        return []
    count = len(_greedy(lengths, limit))
    low, high = max(lengths), max(limit, max(lengths))
    while low < high:
        mid = (low + high) // 2
        if len(_greedy(lengths, mid)) == count:
            high = mid
        else:
            low = mid + 1
    return _greedy(lengths, high)


def block_text(texts: list[str]) -> str:
    return "\n".join(punctuate(t) for t in texts)


# --- one controlled attempt ----------------------------------------------------------------------------------------------------

def _attempt(provider: VoiceProvider, text: str, attempt: int, language: str):
    """One checked synthesis: (samples, rate, info, recognized words or None, WER or None)."""
    n_words = len(text.split())
    data = provider.synthesize(text, attempt)
    x, sr = audio.read_bytes(data)
    x = audio.trim_edges(x, sr)
    defect = provider.known_defect(text, attempt) or take_defect(
        audio.duration(x, sr), audio.peak(x), audio.gaps(x, sr), n_words, stub=not provider.whisper_check)
    w, words = None, None
    if defect is None and provider.whisper_check:
        with tempfile.TemporaryDirectory(prefix="reelforge-take-") as tmp:
            f = Path(tmp) / "take.wav"
            audio.write(f, x, sr)
            words = recognition.transcribe(f, language)
        heard = " ".join(m.text for m in words)
        # same pronunciation aliases as the rest of the pipeline ("cloud" for "Claude"...): without them a brand name
        # misspelled by the recognizer would refuse correct takes
        w = recognition.wer_phonetic(recognition.tokens(text, language), recognition.recognized_tokens([m.text for m in words], language),
                                     recognition.aliases(language), language)
        if w > provider.wer_threshold:
            defect = f"WER {w:.0%} against the text (heard: \"{heard[:80]}\")"
    info = {"attempts": attempt + 1, "wer": None if w is None else round(w, 3), "defect": defect, "ok": defect is None}
    return x, sr, info, words, w


def _take(provider: VoiceProvider, text: str, language: str) -> tuple[np.ndarray, int, dict, list[Word] | None]:
    """Best take of ``text``: (samples, rate, info, recognized words or None without whisper check)."""
    best = None
    attempts = 1 if provider.deterministic else ATTEMPTS_PER_TAKE
    last = 0
    for attempt in range(attempts):
        last = attempt
        x, sr, info, words, w = _attempt(provider, text, attempt, language)
        defect = info["defect"]
        score = 0.0 if defect is None else (1.0 + (w if w is not None else 1.0))
        if best is None or score < best[0]:
            best = (score, x, sr, info, words)
        if defect is None:
            break
        log.warning("take refused (attempt %d/%d): %s", attempt + 1, attempts, defect)
    assert best is not None
    _, x, sr, info, words = best
    info["attempts"] = last + 1
    return x, sr, info, words


# --- best of N takes ---------------------------------------------------------------------------------------------------------------

def heuristic_score(x: np.ndarray, sr: int, text: str) -> float:
    """Score 0-100 of a take from the audio alone (no model): pace close to natural speech (50), no long internal pause (30),
    no clipping (20). It only ranks takes whose WER is the same."""
    seconds = audio.duration(x, sr)
    if seconds <= 0:
        return 0.0
    wpm = len(text.split()) * 60.0 / seconds
    pace = max(0.0, 1.0 - abs(wpm - WORDS_PER_MINUTE) / WORDS_PER_MINUTE)
    longest = max(audio.gaps(x, sr, minimum=0.5), default=0.0)
    pauses = max(0.0, 1.0 - longest / 1.2)
    clipping = 0.0 if audio.peak(x) >= 0.999 else 1.0
    return round(50 * pace + 30 * pauses + 20 * clipping, 2)


def score_take(path: Path, text: str) -> dict:
    """Default scorer: {"score": float, "wer": None} (the WER is already measured by the check)."""
    x, sr = audio.read(path)
    return {"score": heuristic_score(x, sr, text), "wer": None}


def choice_key(p: dict) -> tuple:
    """Order of the best take: valid first, then the lowest WER, then the highest score, then the smallest K."""
    wer = p.get("wer")
    if wer is None:
        wer = p["info"].get("wer")
    score = p.get("score")
    return (not p["info"]["ok"], 1.0 if wer is None else wer, -(score if score is not None else -1e9), p["k"])


def _words_json(words: list[Word] | None):
    return None if words is None else [[w.text, w.start, w.end] for w in words]


def _take_file(reel: Reel, j: int, k: int) -> Path:
    return reel.path("voice", f"block-{j:02d}-take-{k}.wav")


def _cached_takes(reel: Reel, j: int, entry: dict, key: str) -> tuple[list[dict], bool]:
    """Takes of block j already cached for this key: (takes, legacy_to_copy). ``legacy_to_copy``: cache of a single-take run
    (block-XX.wav alone), to copy to block-XX-take-1.wav."""
    takes: list[dict] = []
    if entry.get("key") != key:
        return takes, False
    for p in entry.get("takes", []):
        if _take_file(reel, j, p["k"]).exists():
            takes.append({"k": p["k"], "attempt": p.get("attempt", 0), "info": p["info"], "words": p.get("words"),
                          "score": p.get("score"), "wer": p.get("wer")})
    if not takes and entry.get("info") and reel.path("voice", f"block-{j:02d}.wav").exists():
        takes.append({"k": 1, "attempt": entry["info"].get("attempts", 1) - 1, "info": entry["info"],
                      "words": entry.get("words"), "score": None, "wer": None})
        return takes, True
    return takes, False


def _block_takes(provider: VoiceProvider, reel: Reel, j: int, spoken: str, n: int, entry: dict, key: str, rechoose: bool,
                 probe, record, score: Score, language: str):
    """Takes of block j (generated if needed, read from the cache otherwise), scored, the best chosen.
    Returns (samples, rate, info, words, cache entry, takes summary, retained k)."""
    takes, legacy = _cached_takes(reel, j, entry, key)
    if legacy:
        shutil.copyfile(reel.path("voice", f"block-{j:02d}.wav"), _take_file(reel, j, 1))
    if rechoose and not takes:
        raise ReelError(f"voice --rechoose: block {j} has no cached take (run voice --takes N first)")
    if not rechoose:
        missing = n - sum(1 for p in takes if p["info"]["ok"])
        if missing > 0:
            probe()
            attempt = max((p["attempt"] for p in takes), default=-1) + 1
            k = max((p["k"] for p in takes), default=0) + 1
            budget, refused = missing * ATTEMPTS_PER_TAKE, None
            while missing > 0 and budget > 0:
                x, sr, info, words, w = _attempt(provider, spoken, attempt, language)
                budget -= 1
                if info["ok"]:
                    audio.write(_take_file(reel, j, k), x, sr)
                    takes.append({"k": k, "attempt": attempt, "info": info, "words": _words_json(words), "score": None,
                                  "wer": None})
                    k += 1
                    missing -= 1
                else:
                    log.warning("block %d: take refused (seed attempt %d): %s", j, attempt, info["defect"])
                    rank = 1.0 + (w if w is not None else 1.0)
                    if refused is None or rank < refused[0]:
                        refused = (rank, x, sr, info, words, attempt)
                attempt += 1
            if not any(p["info"]["ok"] for p in takes) and refused is not None:      # no valid take: the least bad one
                _, x, sr, info, words, a = refused
                audio.write(_take_file(reel, j, k), x, sr)
                takes.append({"k": k, "attempt": a, "info": info, "words": _words_json(words), "score": None, "wer": None})
            elif missing > 0:
                log.warning("block %d: only %d valid take(s) out of %d requested", j, sum(p["info"]["ok"] for p in takes), n)
            record(j, {"key": key, "info": takes[-1]["info"], "words": takes[-1]["words"],
                       "takes": [dict(p) for p in takes]})                              # GPU paid for: keep the takes at once
    if len(takes) > 1 or rechoose:
        for p in takes:
            if rechoose or p.get("score") is None:
                r = score(_take_file(reel, j, p["k"]), spoken)
                p["score"], p["wer"] = r.get("score"), r.get("wer")
    takes.sort(key=lambda p: p["k"])
    chosen = min(takes, key=choice_key)
    path = _take_file(reel, j, chosen["k"])
    shutil.copyfile(path, reel.path("voice", f"block-{j:02d}.wav"))
    x, sr = audio.read(path)
    words = [Word(*w) for w in chosen["words"]] if chosen.get("words") is not None else None
    new = {"key": key, "info": chosen["info"], "words": chosen["words"], "retained": chosen["k"],
           "takes": [dict(p) for p in takes]}
    summary = [{"k": p["k"], "file": _take_file(reel, j, p["k"]).name, "score": p.get("score"),
                "wer": p.get("wer") if p.get("wer") is not None else p["info"].get("wer"),
                "ok": p["info"]["ok"], "retained": p["k"] == chosen["k"]} for p in takes]
    return x, sr, chosen["info"], words, new, summary, chosen["k"]


def _requests_to_prefetch(plan: list[dict], cache: dict, reel: Reel, multi: bool, n: int, rechoose: bool) -> list[tuple[str, int]]:
    """(text, attempt) of the takes to synthesize (not on disk): the provider prepares them in a single call."""
    requests: list[tuple[str, int]] = []
    if rechoose:
        return requests
    for b in plan:
        entry = cache.get(b["label"], {})
        if multi:
            takes, _ = _cached_takes(reel, b["j"], entry, b["key"])
            missing = n - sum(1 for p in takes if p["info"]["ok"])
            first = max((p["attempt"] for p in takes), default=-1) + 1
            requests += [(b["spoken"], first + i) for i in range(max(missing, 0))]
        elif not (entry.get("key") == b["key"] and b["file"].exists()):
            requests.append((b["spoken"], 0))
    return requests


def reference_warning() -> str | None:
    if not (config.paths().voice_reference / "reference.source").is_file():
        return None
    return ("INVENTED reference voice (Qwen3 VoiceDesign, see voice-reference/reference.source): no person is cloned; "
            "replace it with another reference before publishing if a specific voice is wanted")


# --- the step ----------------------------------------------------------------------------------------------------------------------------

def run(reel: Reel, force: bool = False, provider: str | None = None, split: str | None = None, takes: int | None = None,
        rechoose: bool = False, score: Score | None = None) -> dict:
    """``takes``: N takes per block (default REELFORGE_VOICE_TAKES, else 1). ``rechoose``: re-score the cached takes and
    reassemble, with no synthesis (no GPU). ``score``: function (wav, text) -> {"score", "wer"} (default: ``score_take``)."""
    output = reel.path("voice.wav")
    n_takes = config.voice_takes(takes)
    language = reel.language
    try:
        prov = choose(provider, language=language, reel_dir=reel.folder)
    except ProviderError as exc:
        raise ReelError(f"voice: {exc}") from exc
    settings = prov.settings()
    # everything that changes the audio (provider, model, reference, batch, sampling): key of the take cache and of the skip
    fingerprint = prov.fingerprint() + (f"|{settings}" if settings else "")
    if not force and not rechoose and reel.is_fresh(output, reel.path("script.json")) and reel.exists("voice", "takes.json"):
        previous = reel.read("voice", "takes.json")
        if n_takes <= previous.get("takes_requested", 1) and previous.get("fingerprint") == fingerprint:
            log.info("voice.wav is up to date: skipped")
            return previous
    script = load_validated(reel)
    try:
        mode = config.voice_split(split, prov.default_split)
        multi = mode == "continuous" and prov.multi_take and (n_takes > 1 or rechoose)
        if rechoose and not multi:
            raise ReelError("voice --rechoose: only in continuous split with a multi-take provider (gpu)")
        if n_takes > 1 and not multi:
            log.warning("%d takes requested ignored: only in continuous split with a multi-take provider (gpu)", n_takes)
            n_takes = 1
        scorer = score or score_take
        spoken_beats = [base.spoken_text(b["text"], language) for b in script["beats"]]
        if mode == "continuous":
            groups = group_beats(spoken_beats, config.voice_block_max())
            pause = PAUSE_BLOCKS_S
        else:
            groups = [[i] for i in range(len(spoken_beats))]
            pause = PAUSE_BEATS_S
        probed = False                  # the probe happens before the first real take only: reassembly from cache needs no GPU

        def probe() -> None:
            nonlocal probed
            if prov.probe_before_take and not probed:
                log.info("voice: %s", prov.probe())
                probed = True

        cache_path = reel.path("voice", "cache.json")
        cache = read_json(cache_path, {}) if cache_path.exists() and not force else {}

        def record(j_: int, entry: dict) -> None:
            cache[f"block-{j_}"] = entry
            write_json(cache_path, cache)

        plan = []
        for j, group in enumerate(groups):
            texts = [spoken_beats[i] for i in group]
            spoken = block_text(texts) if mode == "continuous" else texts[0]
            plan.append({"j": j, "group": group, "texts": texts, "spoken": spoken,
                         "label": f"block-{j}" if mode == "continuous" else str(group[0]),
                         "file": reel.path("voice", f"block-{j:02d}.wav" if mode == "continuous" else f"beat-{group[0]:02d}.wav"),
                         "key": f"{fingerprint}|{spoken}"})
        # all takes leave together (one GPU call: a batch is much faster than takes one by one)
        requests = _requests_to_prefetch(plan, cache, reel, multi, n_takes, rechoose)
        if requests:
            probe()
            prov.prefetch(requests)
        from .align import beat_boundaries
        beat_entries, blocks, pieces, t = [], [], [], 0.0
        for b in plan:
            j, group, texts, spoken, label, file, key = (b[k] for k in ("j", "group", "texts", "spoken", "label", "file", "key"))
            entry = cache.get(label, {})
            summary = retained = None
            if multi:
                x, sr, info, words, new, summary, retained = _block_takes(prov, reel, j, spoken, n_takes, entry, key, rechoose,
                                                                         probe, record, scorer, language)
                record(j, new)
            elif entry.get("key") == key and file.exists():
                x, sr = audio.read(file)
                info = entry["info"]
                words = [Word(*m) for m in entry["words"]] if entry.get("words") is not None else None
                log.info("%s: take from cache", label)
            else:
                probe()
                x, sr, info, words = _take(prov, spoken, language)
                audio.write(file, x, sr)
                cache[label] = {"key": key, "info": info, "words": _words_json(words)}
                write_json(cache_path, cache)
            x48 = audio.fade(audio.resample(x, sr, SAMPLE_RATE), SAMPLE_RATE)
            if j > 0:
                pieces.append(audio.silence(pause, SAMPLE_RATE))
                t += pause
            block_duration = audio.duration(x48, SAMPLE_RATE)
            if len(group) > 1:
                windows, share, marks = beat_boundaries(texts, words or [], block_duration, language)
                if marks == "proportional":
                    log.warning("%s: beat boundaries spread in proportion to the characters", label)
            else:
                windows, share, marks = [(0.0, block_duration)], 1.0, "words"
            for i, (d, end) in zip(group, windows):
                beat_entries.append({"index": i, "text": spoken_beats[i], "start": round(t + d, 4),
                                     "duration": round(end - d, 4), "block": j, **info})
            blocks.append({"index": j, "beats": group, "characters": len(spoken), "start": round(t, 4),
                           "duration": round(block_duration, 4), "boundaries": marks, "matching": round(share, 3), **info,
                           **({"takes": summary, "retained": retained} if summary is not None else {})})
            pieces.append(x48)
            t += block_duration
        pieces.append(audio.silence(TAIL_S, SAMPLE_RATE))
        # internal silences shortened (graded, MAX_SILENCE_S at most: a fixed cap made every pause identical); beat and block
        # bounds are remapped onto the shortened signal
        signal, cuts = audio.compress_silences(np.concatenate(pieces), SAMPLE_RATE, max_s=MAX_SILENCE_S)
        if cuts:
            for item in (*beat_entries, *blocks):
                end = audio.remap(item["start"] + item["duration"], cuts)
                item["start"] = round(audio.remap(item["start"], cuts), 4)
                item["duration"] = round(end - item["start"], 4)
            log.info("silences shortened: %d cut(s), %.2f s removed", len(cuts), sum(r for _, r in cuts))
        raw = reel.path("voice", "voice-raw.wav")
        audio.write(raw, signal, SAMPLE_RATE)
        media.normalize_loudness(raw, output, lufs=LUFS)
        final_duration = audio.duration(*audio.read(output))
    except (ProviderError, audio.AudioError, media.MediaError, config.ConfigError, BudgetExceeded) as exc:
        raise ReelError(f"voice: {exc}") from exc
    report = {"provider": prov.name, "model": prov.model, "fingerprint": fingerprint, "split": mode, "language": language,
              "takes_requested": n_takes, "pause_beats": PAUSE_BEATS_S if mode == "beat" else None,
              "pause_blocks": PAUSE_BLOCKS_S if mode == "continuous" else None, "duration": round(final_duration, 4),
              "raw_duration": round(t, 4), "lufs_target": LUFS, "sample_rate": SAMPLE_RATE,
              "rejected_beats": [p["index"] for p in beat_entries if not p["ok"]], "blocks": blocks, "beats": beat_entries}
    if prov.cloned and (warning := reference_warning()):
        report["warning"] = warning
    reel.write(report, "voice", "takes.json")
    reel.mark(output, reel.path("script.json"))
    reel.update_state(voice={"provider": prov.name, "duration": report["duration"], "rejected_beats": report["rejected_beats"]})
    return report
