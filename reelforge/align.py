"""The ``align`` step: words.json = every word of the SCRIPT (spelling and keywords kept) with its start and end.

Method: faster-whisper (word_timestamps) transcribes voice.wav; the recognized words are matched with difflib to the script
words, beat by beat (the time window of each beat comes from voice/takes.json, so a mistake cannot cross from one beat to
another). "Replaced" blocks (numbers, split or merged words) share the recognized interval in proportion to their letters;
unrecognized words are interpolated between their neighbours. Global WER = script words against recognized words.

``stub`` voice (beeps): no recognition, proportional spread over the letters inside the window of each beat.
"""

from __future__ import annotations

import logging
import os
from difflib import SequenceMatcher

from . import audio, recognition
from .recognition import MATCH_THRESHOLD, MIN_WORD_S, Word, match, spread, transcribe, wer, word_key
from .reel import Reel, ReelError
from .script import load
from .text import base

log = logging.getLogger("reelforge.align")

WER_WARNING = 0.15
BOUNDARY_THRESHOLD = 0.5       # minimum share of a block's words found to place the beat boundaries from the voice


def beat_boundaries(texts: list[str], recognized: list[Word], duration: float,
                    language: str = "en") -> tuple[list[tuple[float, float]], float, str]:
    """Interval [start, end] of each beat INSIDE a voice block of ``duration`` seconds (continuous synthesis of several beats).

    The words of each beat (``texts``, spoken texts) are matched with difflib to the ``recognized`` words of the whole block.
    The boundary between beats k and k+1 is the middle of the interval between the end of the last word found up to beat k and
    the start of the first word found from beat k+1. If fewer than BOUNDARY_THRESHOLD of the words are found (or there is no
    transcription), fallback: spread in proportion to the characters. Returns (contiguous intervals from 0 to ``duration``,
    share found, mode) with mode "words" or "proportional"."""
    n = len(texts)
    weights = [len(t) for t in texts]
    if n <= 1:
        return [(0.0, duration)] * n, 1.0, "words" if recognized else "proportional"
    keys, owner = [], []
    for k, t in enumerate(texts):
        for word in t.split():
            c = word_key(word, language)
            if c:
                keys.append(c)
                owner.append(k)
    heard = [word_key(r.text, language) for r in recognized]
    matched: dict[int, int] = {}
    if keys and heard:
        for tag, i1, i2, j1, _ in SequenceMatcher(None, keys, heard, autojunk=False).get_opcodes():
            if tag == "equal":
                for d in range(i2 - i1):
                    matched[i1 + d] = j1 + d
    share = len(matched) / len(keys) if keys else 0.0
    if share < BOUNDARY_THRESHOLD:
        return spread(weights, 0.0, duration), share, "proportional"
    bounds = [0.0]
    for k in range(n - 1):
        left = [j for i, j in matched.items() if owner[i] <= k]
        right = [j for i, j in matched.items() if owner[i] > k]
        t_left = recognized[max(left)].end if left else 0.0
        t_right = recognized[min(right)].start if right else duration
        bounds.append(min(max((t_left + t_right) / 2, bounds[-1]), duration))
    bounds.append(duration)
    return list(zip(bounds[:-1], bounds[1:])), share, "words"


def beat_windows(takes: dict, total_duration: float) -> list[tuple[float, float]]:
    """Interval of each beat: from the middle of the previous pause to the middle of the next one (contiguous)."""
    beats = takes["beats"]
    bounds = [0.0]
    for previous, following in zip(beats, beats[1:]):
        end_previous = previous["start"] + previous["duration"]
        bounds.append(round((end_previous + following["start"]) / 2, 4))
    bounds.append(round(total_duration, 4))
    return list(zip(bounds[:-1], bounds[1:]))


def _transcription(reel: Reel, language: str) -> list[Word]:
    """Recognized words of voice.wav, cached on disk (key: audio content, model, language)."""
    return transcribe(reel.path("voice.wav"), language, None, cache=reel.path("align", "transcription.json"))


def run(reel: Reel, force: bool = False) -> dict:
    output = reel.path("words.json")
    if reel.is_fresh(output, reel.path("voice.wav"), reel.path("script.json")) and not force:
        log.info("words.json is up to date: skipped")
        return reel.read("words.json")
    script = load(reel)
    takes = reel.read("voice", "takes.json")
    language = reel.language
    try:
        x, sr = audio.read(reel.path("voice.wav"))
    except audio.AudioError as exc:
        raise ReelError(f"voice.wav is unreadable: {exc}") from exc
    total = audio.duration(x, sr)
    windows = beat_windows(takes, total)
    if len(takes["beats"]) != len(script["beats"]):
        raise ReelError("voice/takes.json does not match script.json (different number of beats): run `voice --force`")
    stub = takes.get("provider") == "stub" or os.environ.get("REELFORGE_ALIGN") == "stub"
    recognized = [] if stub else _transcription(reel, language)
    words_out, script_tokens = [], []
    for i, beat in enumerate(script["beats"]):
        words = base.beat_words(beat["text"])
        w0, w1 = windows[i]
        take = takes["beats"][i]
        if stub:
            spans = [(s, e, "proportional") for s, e in spread([len(w.text) for w in words], take["start"],
                                                               take["start"] + take["duration"])]
            share = 1.0
        else:
            inside = [r for r in recognized if w0 <= (r.start + r.end) / 2 < w1]      # middle of the word inside the window
            spans, share = match([w.text for w in words], inside, take["start"], take["start"] + take["duration"], language)
            if share < MATCH_THRESHOLD:
                log.warning("beat %d: only %.0f %% of the words found, proportional spread", i, share * 100)
        for w, (s, e, source) in zip(words, spans):
            words_out.append({"text": w.text, "start": round(s, 3), "end": round(e, 3), "emphasis": w.emphasis, "beat": i,
                              "source": source})
        script_tokens += base.tokens(base.spoken_text(beat["text"], language), language)
    previous = 0.0                        # growth guaranteed globally
    for w in words_out:
        w["start"] = round(max(w["start"], previous), 3)
        w["end"] = round(min(max(w["end"], w["start"] + MIN_WORD_S), max(total, w["start"] + MIN_WORD_S)), 3)
        previous = w["end"]
    global_wer = None
    if not stub:
        heard = recognition.recognized_tokens([r.text for r in recognized], language)
        global_wer = round(wer(script_tokens, heard), 4)
        if global_wer > WER_WARNING:
            log.warning("global WER %.0f %%: the voice departs from the script (see voice/takes.json)", global_wer * 100)
    report = {"version": 1, "duration": round(total, 4), "mode": "stub" if stub else "whisper", "language": language,
              "wer": global_wer, "beats": [{"index": i, "start": s, "end": e} for i, (s, e) in enumerate(windows)],
              "words": words_out}
    reel.write(report, "words.json")
    reel.mark(output, reel.path("voice.wav"), reel.path("script.json"))
    reel.update_state(align={"mode": report["mode"], "wer": global_wer, "words": len(words_out)})
    return report
