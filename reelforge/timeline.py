"""The ``timeline`` step: assembles timeline.json (contract of studio/src/core/types.ts, documented in
docs/timeline-contract.md) and copies voice.wav and timeline.json into studio/public/reels/<reel>/.

Mapping with types.ts (all times in absolute seconds, except durationInFrames):

    Timeline {version: 1, fps, width, height, durationInFrames, theme, language, audio, words, captions, sections, scenes, avatar}
    Word {text, start, end, emphasis} ; CaptionPage {start, end, words: indices} ; Section {start, label, counter?}
    SceneSpec {id, type, start, end, props, cues: {name: time of the trigger word}, theme?}
    AvatarTrack {visible, poses: [{t, pose, expression}], mouth: [{t, shape}], seed}

When types.ts changes, this module and docs/timeline-contract.md change in the same commit.
"""

from __future__ import annotations

import hashlib
import logging
import math
import shutil
from typing import Any

import numpy as np

from . import catalog as catalog_mod
from . import config
from .reel import Reel, ReelError
from .script import find_cue, load
from .text import base

log = logging.getLogger("reelforge.timeline")

VERSION = 1
TAIL_S = 0.6                   # tail after the last syllable: the mascot winks, no black screen
LINE_MAX = 25                  # characters per caption line at ~70 px in 900 px (the studio breaks lines itself)
MAX_LINES = 3
PAGE_CHARACTERS = 66           # budget of a page (about 3 lines)
PAGE_WORDS = 9
MIN_PAGE_WORDS = 3             # no orphan page of one or two words
THEMES = ("paper", "night")
POSES = ("neutral", "point-up", "point-scene", "wave", "thumbs-up", "thinking", "facepalm", "arms-open", "celebrate",
         "point-down", "point-self")
EXPRESSIONS = ("neutral", "smile", "surprised", "skeptical", "laugh", "wink")
SHAPES = tuple("ABCDEFGHX")
SMALL_WORDS = {
    "en": {"the", "a", "an", "of", "to", "and", "or", "but", "nor", "so", "yet", "in", "on", "at", "by", "for", "with", "from",
           "as", "into", "onto", "over", "off", "up", "than", "if", "is", "it", "its", "i", "my", "your", "our", "his", "her",
           "their", "this", "that", "these", "those", "we", "you", "he", "she", "they", "be", "do", "no", "not"},
    "fr": {"le", "la", "les", "un", "une", "des", "de", "du", "d", "l", "à", "a", "au", "aux", "en", "et", "ou", "ni", "mais",
           "donc", "or", "car", "que", "qu", "ce", "cet", "cette", "ces", "mon", "ton", "son", "ma", "ta", "sa", "mes", "tes",
           "ses", "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "me", "te", "se", "ne", "n", "y", "si",
           "sur", "dans", "par", "pour", "avec", "sans", "sous", "avant", "après", "vers", "chez", "entre", "c", "j", "m", "s",
           "t"},
}


def _small(text: str, language: str) -> bool:
    """Small word (article, preposition, pronoun) that must not end a page. Elided French words ("l'idée") are one word in
    the script, so the elision stays glued to its word."""
    if base.sentence_end(text) or text.rstrip().endswith((",", ";", ":")):
        return False
    toks = base.tokens(text, language)
    return len(toks) == 1 and toks[0] in SMALL_WORDS[language]


def estimated_lines(texts: list[str], page: list[int], width: int = LINE_MAX) -> int:
    n, current = 1, 0
    for i in page:
        length = len(texts[i])
        if current and current + 1 + length > width:
            n += 1
            current = length
        else:
            current += (1 if current else 0) + length
    return n


def _size(texts: list[str], idx: list[int]) -> int:
    return sum(len(texts[i]) for i in idx) + max(0, len(idx) - 1)


def split_pages(texts: list[str], language: str = "en", characters: int = PAGE_CHARACTERS,
                max_words: int = PAGE_WORDS) -> list[list[int]]:
    """Group the words (indices) into caption pages.

    Rules: cuts at sentence ends; never a page ending on a small word (of, the, that, I, and...): it moves to the next page;
    soft cut at a comma; at most 3 lines (estimated); at least MIN_PAGE_WORDS words per page: an orphan page (1-2 words) is
    attached to the previous (or next) page if the whole fits in 3 lines, else it borrows words from the previous page. The only
    exception is a page no grouping can fill out."""
    pages: list[list[int]] = []
    current: list[int] = []

    def close() -> None:
        nonlocal current
        if not current:
            return
        rest: list[int] = []
        while len(current) > 2 and _small(texts[current[-1]], language):
            rest.insert(0, current.pop())
        pages.append(current)
        current = rest

    for i, t in enumerate(texts):
        if current and (_size(texts, current + [i]) > characters or len(current) >= max_words
                        or estimated_lines(texts, current + [i]) > MAX_LINES):
            close()
        current.append(i)
        if base.sentence_end(t):
            close()
        elif t.rstrip().endswith((",", ";", ":")) and (len(current) >= 5 or _size(texts, current) >= 28):
            close()
    if current:
        pages.append(current)

    def fits(idx: list[int]) -> bool:
        return (estimated_lines(texts, idx) <= MAX_LINES and len(idx) <= max_words + 3
                and _size(texts, idx) <= characters + LINE_MAX)

    k = 0
    while k < len(pages):
        p = pages[k]
        if len(p) >= MIN_PAGE_WORDS:
            k += 1
            continue
        if k > 0 and fits(pages[k - 1] + p) and (k == len(pages) - 1 or not _small(texts[p[-1]], language)):
            pages[k - 1] = pages[k - 1] + p
            del pages[k]
            k = max(0, k - 1)
            continue
        if k + 1 < len(pages) and fits(p + pages[k + 1]):
            pages[k + 1] = p + pages[k + 1]
            del pages[k]
            continue
        if k > 0:
            previous = pages[k - 1]
            for n in range(1, len(previous)):
                if len(previous) - n < MIN_PAGE_WORDS:
                    break
                new_end = previous[-n - 1]
                if len(p) + n >= MIN_PAGE_WORDS and not _small(texts[new_end], language) and fits(previous[-n:] + p):
                    pages[k - 1], pages[k] = previous[:-n], previous[-n:] + p
                    break
        k += 1
    return pages


TARGET_CPS = 16.5              # target reading speed (characters/s); a 95th percentile of 17 is the limit
FADE_GAP_S = 1.0               # silence above which the page disappears (else it stays until the next page)
HOLD_AFTER_S = 0.4             # hold of a page before a long silence (empty screen afterwards >= 0.6 s, never 3 to 14 frames)


def page_windows(texts: list[str], pages: list[list[int]], words: list[dict], reel_end: float) -> list[tuple[float, float]]:
    """Display window (start, end) of each page. A page whose next word comes less than FADE_GAP_S later stays until the next
    page (no hole of 3 to 14 frames); the boundary between two pages sits anywhere between the last word of one and the first
    of the other, so as to equalize their reading speeds (the next page may show a little before it is said: its words are
    grey, they take colour while speaking)."""
    n = len(pages)
    a = [words[p[0]]["start"] for p in pages]
    b = [words[p[-1]]["end"] for p in pages]
    c = [_size(texts, p) for p in pages]
    s = list(a)
    s[0] = 0.0 if a[0] < 0.5 else a[0]
    e = [0.0] * n
    glued = [k < n - 1 and a[k + 1] - b[k] < FADE_GAP_S for k in range(n)]
    for k in range(n - 1):
        e[k] = s[k + 1] if glued[k] else b[k] + HOLD_AFTER_S
    e[-1] = max(reel_end, b[-1] + 0.3)
    for _ in range(80):
        for k in range(n - 1):
            if not glued[k]:
                continue
            boundary = (c[k] * e[k + 1] + c[k + 1] * s[k]) / (c[k] + c[k + 1])
            s[k + 1] = e[k] = min(max(boundary, b[k]), a[k + 1])
    return list(zip(s, e))


def _page_cost(texts: list[str], pages: list[list[int]], words: list[dict], reel_end: float) -> float:
    windows = page_windows(texts, pages, words, reel_end)
    cps = np.array([_size(texts, p) / max(e - s, 1e-3) for p, (s, e) in zip(pages, windows)])
    return float(np.percentile(cps, 95)) * 100 + float((np.maximum(cps - TARGET_CPS, 0) ** 2).sum())


def optimize_pages(texts: list[str], pages: list[list[int]], words: list[dict], reel_end: float,
                   language: str = "en") -> list[list[int]]:
    """Move words from a page to its neighbour as long as the reading speed (characters per second of real display, windows of
    ``page_windows``) goes down. Keeps the splitting rules: 3 lines, 3 words at least, no page ending on a small word, no new
    sentence end in the middle of a page."""
    def valid(p: list[int]) -> bool:
        return (len(p) >= MIN_PAGE_WORDS and estimated_lines(texts, p) <= MAX_LINES and not _small(texts[p[-1]], language)
                and _size(texts, p) <= PAGE_CHARACTERS + LINE_MAX and len(p) <= PAGE_WORDS + 3)

    def inner_sentences(p: list[int]) -> int:
        return sum(base.sentence_end(texts[i]) for i in p[:-1])

    if len(pages) < 2:
        return pages
    best = _page_cost(texts, pages, words, reel_end)
    improved = True
    for _ in range(200):
        if not improved:
            break
        improved = False
        for k in range(len(pages) - 1):
            for direction in (1, -1):
                trial = [list(p) for p in pages]
                if direction == 1:
                    trial[k + 1].insert(0, trial[k].pop())
                else:
                    trial[k].append(trial[k + 1].pop(0))
                if not (valid(trial[k]) and valid(trial[k + 1])):
                    continue
                if inner_sentences(trial[k]) > inner_sentences(pages[k]) or inner_sentences(trial[k + 1]) > inner_sentences(pages[k + 1]):
                    continue
                cost = _page_cost(texts, trial, words, reel_end)
                if cost < best - 1e-6:
                    best, pages, improved = cost, trial, True
    return pages


def _seed(name: str) -> int:
    return int.from_bytes(hashlib.sha256(name.encode("utf-8")).digest()[:4], "big") & 0x7FFFFFFF


def _cue_time(trigger: str, words: list[dict], indices: list[int], name: str, beat: int, language: str) -> float:
    """Start of the word (or of the first word of a phrase) that triggers a cue, among the words of the beat. Same search as the
    script validation (``script.find_cue``): flattened tokens, hyphenated words and numbers included."""
    k = find_cue(trigger, [words[i]["text"] for i in indices], language)
    if k is None:
        raise ReelError(f"beat {beat}: trigger word \"{trigger}\" of cue \"{name}\" not found in the aligned text")
    return words[indices[k]]["start"]


def build(name: str, script: dict, words_json: dict, mouth_json: dict, audio_rel: str | None,
          language: str = "en") -> dict[str, Any]:
    words_in = words_json["words"]
    fps, duration = config.FPS, words_json["duration"]
    windows = [(b["start"], b["end"]) for b in words_json["beats"]]
    if len(windows) != len(script["beats"]):
        raise ReelError("words.json does not match script.json (different number of beats): run `align --force`")
    words = [{"text": m["text"], "start": m["start"], "end": m["end"], "emphasis": bool(m["emphasis"])} for m in words_in]
    texts = [m["text"] for m in words_in]
    total_frames = int(math.ceil(duration * fps)) + int(round(TAIL_S * fps))
    reel_end = round(total_frames / fps, 3)
    limit = min(reel_end, duration + TAIL_S)
    pages = optimize_pages(texts, split_pages(texts, language), words_in, limit, language)
    windows_p = page_windows(texts, pages, words_in, limit)
    captions = [{"start": round(d, 3), "end": round(f, 3), "words": p} for p, (d, f) in zip(pages, windows_p)]
    sections, scenes, poses = [], [], []
    counter = None
    label = None
    for i, beat in enumerate(script["beats"]):
        d, f = windows[i]
        new_counter = beat.get("counter")
        if beat["section"] != label or new_counter:
            if new_counter:
                counter = new_counter
            label = beat["section"]
            section = {"start": round(d, 3), "label": label}
            if counter:
                section["counter"] = {"label": counter["label"], "value": counter["value"]}
            sections.append(section)
        indices = [k for k, m in enumerate(words_in) if m["beat"] == i]
        sc = beat["scene"]
        cues = {n: round(_cue_time(w, words_in, indices, n, i, language), 3) for n, w in (sc.get("cues") or {}).items()}
        spec = {"id": f"s{i + 1:02d}-{sc['type']}", "type": sc["type"], "start": round(d, 3), "end": round(f, 3),
                "props": sc.get("props") or {}, "cues": cues}
        if beat.get("theme"):
            spec["theme"] = beat["theme"]
        scenes.append(spec)
        key = {"t": round(d, 3) if i else 0.0, "pose": beat["pose"], "expression": beat["expression"]}
        if not poses or (poses[-1]["pose"], poses[-1]["expression"]) != (key["pose"], key["expression"]):
            poses.append(key)
    # A scene stays on screen until the start of the next one (no hole), the last one until the end of the reel (tail included).
    for a, b in zip(scenes, scenes[1:]):
        a["end"] = b["start"]
    scenes[0]["start"] = 0.0
    scenes[-1]["end"] = max(scenes[-1]["end"], reel_end)
    # Tail: the mascot keeps its pose and winks right after the last word.
    if poses and poses[-1]["expression"] != "wink":
        poses.append({"t": round(min(duration + 0.05, reel_end - 0.3), 3), "pose": poses[-1]["pose"], "expression": "wink"})
    return {
        "version": VERSION, "fps": fps, "width": config.WIDTH, "height": config.HEIGHT, "durationInFrames": total_frames,
        "theme": "paper", "language": language, "audio": audio_rel, "words": words, "captions": captions,
        "sections": sections, "scenes": scenes,
        "avatar": {"visible": True, "poses": poses, "mouth": [{"t": k["t"], "shape": k["shape"]} for k in mouth_json["keys"]],
                   "seed": _seed(name)},
    }


# --- validation of the contract (docs/timeline-contract.md, "Validation") ----------------------------------------------------

def _sorted(values: list[float]) -> bool:
    return all(a <= b + 1e-9 for a, b in zip(values, values[1:]))


def validate(tl: dict[str, Any], catalog: dict[str, dict[str, Any]] | None = None, *,
             unknown_scenes_are_errors: bool = True) -> list[str]:
    """Errors of a timeline against the contract: unsorted lists, times outside the audio, invalid caption indices, scene type
    unknown to the catalog, scene overflowing the duration, first pose not at t = 0, values outside the enumerations."""
    errors: list[str] = []
    for key in ("version", "fps", "width", "height", "durationInFrames", "theme", "audio", "words", "captions", "sections",
                "scenes", "avatar"):
        if key not in tl:
            errors.append(f"missing field '{key}'")
    if errors:
        return errors
    if tl["version"] != VERSION:
        errors.append(f"version {tl['version']} (expected {VERSION})")
    if tl["fps"] <= 0 or tl["durationInFrames"] <= 0:
        errors.append("fps and durationInFrames must be positive")
        return errors
    end = tl["durationInFrames"] / tl["fps"]
    eps = 1e-3                           # times are rounded to the millisecond
    if tl["theme"] not in THEMES:
        errors.append(f"unknown theme {tl['theme']!r}")
    if tl.get("language", "en") not in base.LANGUAGES:
        errors.append(f"unknown language {tl.get('language')!r}")
    words = tl["words"]
    if not _sorted([w["start"] for w in words]):
        errors.append("words are not sorted by start")
    for i, w in enumerate(words):
        if w["end"] < w["start"] or w["start"] < -eps or w["end"] > end + eps:
            errors.append(f"words/{i}: times {w['start']}-{w['end']} outside the reel (0-{end:.3f} s)")
            break
    caps = tl["captions"]
    if not _sorted([c["start"] for c in caps]):
        errors.append("captions are not sorted by start")
    for i, c in enumerate(caps):
        if c["end"] < c["start"] or c["end"] > end + eps:
            errors.append(f"captions/{i}: times {c['start']}-{c['end']} outside the reel")
        if not c["words"] or any(not isinstance(k, int) or not 0 <= k < len(words) for k in c["words"]):
            errors.append(f"captions/{i}: invalid word indices")
    if not _sorted([s["start"] for s in tl["sections"]]):
        errors.append("sections are not sorted by start")
    for i, s in enumerate(tl["sections"]):
        if not 0 <= s["start"] <= end + eps:
            errors.append(f"sections/{i}: start {s['start']} outside the reel")
    scenes = tl["scenes"]
    if not _sorted([s["start"] for s in scenes]):
        errors.append("scenes are not sorted by start")
    seen: set[str] = set()
    for i, s in enumerate(scenes):
        if s["id"] in seen:
            errors.append(f"scenes/{i}: duplicate id {s['id']}")
        seen.add(s["id"])
        if s["end"] < s["start"] or s["start"] < -eps:
            errors.append(f"scenes/{i}: invalid interval {s['start']}-{s['end']}")
        if s["end"] > end + eps:
            errors.append(f"scenes/{i}: ends at {s['end']} s, after the end of the reel ({end:.3f} s)")
        if s.get("theme") is not None and s["theme"] not in THEMES:
            errors.append(f"scenes/{i}: unknown theme {s['theme']!r}")
        for cue, t in (s.get("cues") or {}).items():
            if not s["start"] - eps <= t <= end + eps:
                errors.append(f"scenes/{i}: cue '{cue}' at {t} s is outside the reel")
        if catalog is not None and s["type"] not in catalog:
            msg = f"scenes/{i}: scene type '{s['type']}' is unknown to the catalog"
            if unknown_scenes_are_errors:
                errors.append(msg)
            else:
                log.warning("timeline: %s", msg)
    avatar = tl["avatar"]
    poses, mouth = avatar["poses"], avatar["mouth"]
    if not poses or poses[0]["t"] != 0:
        errors.append("the first pose must be at t = 0")
    if not _sorted([p["t"] for p in poses]):
        errors.append("avatar.poses are not sorted by t")
    for i, p in enumerate(poses):
        if p["pose"] not in POSES or p["expression"] not in EXPRESSIONS:
            errors.append(f"avatar.poses/{i}: unknown pose or expression ({p['pose']}, {p['expression']})")
        if p["t"] > end + eps:
            errors.append(f"avatar.poses/{i}: t {p['t']} outside the reel")
    if not _sorted([m["t"] for m in mouth]):
        errors.append("avatar.mouth is not sorted by t")
    for i, m in enumerate(mouth):
        if m["shape"] not in SHAPES:
            errors.append(f"avatar.mouth/{i}: unknown shape {m['shape']!r}")
            break
        if m["t"] > end + eps:
            errors.append(f"avatar.mouth/{i}: t {m['t']} outside the reel")
            break
    return errors


def run(reel: Reel, force: bool = False) -> dict:
    output = reel.path("timeline.json")
    inputs = [reel.path(n) for n in ("script.json", "words.json", "mouth.json", "voice.wav")]
    public = config.paths().public_reels / reel.name
    if reel.is_fresh(output, *inputs) and (public / "timeline.json").exists() and not force:
        log.info("timeline.json is up to date: skipped")
        return reel.read("timeline.json")
    script = load(reel)
    language = reel.language
    tl = build(reel.name, script, reel.read("words.json"), reel.read("mouth.json"), f"reels/{reel.name}/voice.wav", language)
    lenient = (reel.state.get("script") or {}).get("provider") == "stub"
    errors = validate(tl, catalog_mod.load(), unknown_scenes_are_errors=not lenient)
    if errors:
        raise ReelError("timeline refused: " + " ; ".join(errors[:6]))
    reel.write(tl, "timeline.json")
    public.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(reel.path("voice.wav"), public / "voice.wav")
    shutil.copyfile(output, public / "timeline.json")
    reel.mark(output, *inputs)
    reel.update_state(timeline={"durationInFrames": tl["durationInFrames"], "pages": len(tl["captions"]),
                                "scenes": len(tl["scenes"]), "public": str(public)})
    return tl
