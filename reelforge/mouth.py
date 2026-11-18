"""The ``mouth`` step: visemes (Rhubarb mouth shapes A-H, X) from the text of the script and the energy of the audio.

1. Every word of the script is turned into a sequence of shapes by approximate grapheme -> sound rules, one set per language
   (English: ``ENGLISH_PATTERNS``, French: ``FRENCH_PATTERNS``: nasal vowels, digraphs, silent e, silent final letters).
2. The shapes are spread over the duration of the word (words.json) in proportion to weights (a vowel lasts longer than a
   consonant).
3. The RMS envelope of voice.wav modulates: outside words, silence -> X; low energy -> more closed shapes.
4. Smoothing: minimum duration of MIN_FRAMES frames, repetitions merged.
5. Silences: any run of at least 150 ms where the energy of a frame is under -40 dB forces X; a voiced frame (> -40 dB) is
   never at rest (B at least). The lead of the mouth over the sound (1 frame) is added by the studio, not here.

Output mouth.json: {"fps": 30, "keys": [{"t": seconds, "shape": "A".."X"}]} (MouthKey of studio/src/core/types.ts).
"""

from __future__ import annotations

import logging
import re
import unicodedata

import numpy as np

from . import audio, config
from .reel import Reel

log = logging.getLogger("reelforge.mouth")

VOWELS = {"en": "aeiouy", "fr": "aeiouyàâäéèêëîïôöùûüœ"}
SHAPES = "ABCDEFGHX"
MIN_FRAMES = 3
LEAD_FRAMES = 0               # mouth.json follows the sound exactly; the one-frame lead is added by the studio (avatar/anim.ts)
SILENCE_DB = -40.0            # energy of a frame under which the voice is silent
SILENCE_MIN_FRAMES = 5        # 150 ms: from there, closed mouth (X) whatever the aligner says
SILENCE_RELATIVE = 0.08       # energy < 8 % of the speech reference: silence
LOW_RELATIVE = 0.25           # energy < 25 %: closed shapes
WORD_MARGIN_S = 0.05

# grapheme (pattern on the rest of the word) -> shapes; order matters: longest first
_FR_NASAL_END = r"(?![aeiouyàâéèêëîïôùûnm])"
FRENCH_PATTERNS: list[tuple[str, list[str]]] = [
    (r"eau", ["E"]), (r"oeu|œu|œ", ["E"]), (r"eu", ["E"]), (r"ou", ["F"]), (r"oi", ["F", "D"]), (r"oy", ["F", "B"]),
    (r"au", ["E"]), (r"(?:ai|ei)[nm]" + _FR_NASAL_END, ["C"]), (r"ai|ei|aî", ["C"]),
    (r"(?:y|i|u)[nm]" + _FR_NASAL_END, ["C"]),
    (r"[ae][nm]" + _FR_NASAL_END, ["D"]), (r"o[nm]" + _FR_NASAL_END, ["E"]),
    (r"ch|gn|th|sh|qu|ill", ["B"]), (r"ph", ["G"]), (r"gu(?=[eiéèêy])", ["B"]),
    (r"[àâä]|a", ["D"]), (r"[éèêë]", ["C"]), (r"[ôö]|o", ["E"]), (r"[ùûü]|u", ["F"]), (r"[îï]|[iy]", ["B"]), (r"e", ["C"]),
    (r"[mbp]", ["A"]), (r"[fv]", ["G"]), (r"l", ["H"]), (r"w", ["F"]), (r"h", []), (r"[cdgjknqrstxz]", ["B"]),
]

# English: approximate grapheme -> viseme rules (A closed m b p; B teeth, ee / consonants; C open eh; D wide ah; E rounded oh;
# F pushed forward oo w; G teeth on lip f v; H tongue l). Not a phonetization: the mouth only has to look right.
ENGLISH_PATTERNS: list[tuple[str, list[str]]] = [
    (r"tion|sion|cian", ["B", "C"]), (r"igh", ["D", "B"]), (r"eigh", ["C"]), (r"ough|augh", ["E"]),
    (r"oo", ["F"]), (r"ou|ow", ["D", "F"]), (r"oi|oy", ["E", "B"]), (r"ew|ue|ui", ["F"]),
    (r"ee|ea|ie", ["B"]), (r"ai|ay|ei|ey", ["C"]), (r"au|aw", ["E"]), (r"oa|oe", ["E"]),
    (r"ar", ["D"]), (r"or", ["E"]), (r"er|ir|ur|yr", ["E"]),
    (r"ph", ["G"]), (r"qu", ["B", "F"]), (r"wh", ["F"]), (r"wr", ["E"]), (r"kn", ["B"]), (r"gh", []),
    (r"th|sh|ch|ng|ck", ["B"]),
    (r"a", ["C"]), (r"e", ["C"]), (r"i", ["B"]), (r"o", ["E"]), (r"u", ["C"]), (r"y", ["B"]),
    (r"[mbp]", ["A"]), (r"[fv]", ["G"]), (r"l", ["H"]), (r"w", ["F"]), (r"r", ["E"]), (r"h", []),
    (r"[cdgjknqstxz]", ["B"]),
]
# Very frequent words whose spelling misleads the rules.
ENGLISH_EXCEPTIONS: dict[str, list[str]] = {
    "the": ["B", "C"], "you": ["F"], "your": ["E"], "to": ["B", "F"], "do": ["B", "F"], "two": ["B", "F"], "who": ["F"],
    "of": ["D", "G"], "one": ["F", "C", "B"], "once": ["F", "C", "B"], "was": ["F", "C", "B"], "said": ["B", "C", "B"],
    "are": ["D"], "what": ["F", "C", "B"], "have": ["B", "C", "G"], "give": ["B", "B", "G"], "come": ["B", "C", "A"],
    "some": ["B", "C", "A"], "people": ["A", "B", "A", "H"], "could": ["B", "F", "B"], "would": ["F", "F", "B"],
    "should": ["B", "F", "B"], "my": ["A", "D", "B"], "by": ["A", "D", "B"], "why": ["F", "D", "B"], "i": ["D", "B"],
}


def _compile(patterns):
    return [(re.compile(p), shapes) for p, shapes in patterns]


_PATTERNS = {"en": _compile(ENGLISH_PATTERNS), "fr": _compile(FRENCH_PATTERNS)}
_WEIGHTS = {"A": 1.0, "B": 0.8, "C": 1.5, "D": 1.8, "E": 1.6, "F": 1.5, "G": 1.0, "H": 1.0}


def _letters(word: str) -> str:
    t = unicodedata.normalize("NFC", word.lower().replace("’", "'"))
    return "".join(c for c in t if c.isalpha() or c in "'")


def _merge(shapes: list[str]) -> list[tuple[str, float]]:
    merged: list[tuple[str, float]] = []
    for f in shapes:
        if merged and merged[-1][0] == f:
            merged[-1] = (f, merged[-1][1] + _WEIGHTS[f] * 0.5)
        else:
            merged.append((f, _WEIGHTS[f]))
    return merged


def _scan(s: str, language: str) -> list[str]:
    shapes: list[str] = []
    i = 0
    while i < len(s):
        for pattern, forms in _PATTERNS[language]:
            m = pattern.match(s, i)
            if m and m.end() > i:
                shapes += forms
                i = m.end()
                break
        else:
            i += 1
    return shapes


def _french_ending(s: str) -> tuple[str, list[str]]:
    """er/ez pronounced "é", silent final e, silent final letters."""
    vowels = VOWELS["fr"]
    tail: list[str] = []
    if len(s) > 2 and re.search(r"(er|ez)$", s):
        return s[:-2], ["C"]
    if len(s) > 4 and s.endswith("ent") and not s.endswith(("ment", "vent", "tent", "dent")):
        s = s[:-2]                                  # third person plural: silent "ent"
    while len(s) > 2 and s[-1] in "sxdtzp" and any(c in vowels for c in s[:-1]):
        s = s[:-1]
    if len(s) > 1 and s.endswith("e") and any(c in vowels for c in s[:-1]):
        s = s[:-1]                                  # silent final e
    return s, tail


def _english_ending(s: str) -> str:
    """Silent final e, "-ed" and "-es" endings that add no syllable, final y of one-syllable words."""
    vowels = VOWELS["en"]
    if len(s) > 4 and s.endswith("ed") and s[-3] not in "td" and s[-3] not in vowels:
        s = s[:-2] + "d"
    elif len(s) > 3 and s.endswith("es") and s[-3] not in "sxzcgh" and s[-3] not in vowels:
        s = s[:-2] + "s"
    elif len(s) > 3 and s.endswith("e") and not s.endswith(("ee", "ie", "ye", "oe")) and any(c in vowels for c in s[:-1]):
        s = s[:-1]
    return s


def word_shapes(word: str, language: str = "en") -> list[tuple[str, float]]:
    """Sequence (shape, weight) of a word; at least one shape for any word that contains a letter."""
    if language not in _PATTERNS:
        raise ValueError(f"unknown language: {language!r}")
    s = _letters(word).replace("'", "")
    if not s:
        return []
    if language == "en" and s in ENGLISH_EXCEPTIONS:
        return _merge(ENGLISH_EXCEPTIONS[s])
    tail: list[str] = []
    if language == "fr":
        s, tail = _french_ending(s)
    else:
        s = _english_ending(s)
        if s.endswith("y") and not any(c in "aeiou" for c in s[:-1]):
            return _merge(_scan(s[:-1], "en") + ["D", "B"])
    shapes = _scan(s, language) + tail
    if not shapes:
        shapes = ["B"]
    return _merge(shapes)


def word_segments(word: str, start: float, end: float, language: str = "en") -> list[tuple[float, float, str]]:
    shapes = word_shapes(word, language)
    if not shapes:
        return []
    total = sum(p for _, p in shapes)
    t, out = start, []
    for f, p in shapes:
        d = (end - start) * p / total
        out.append((t, t + d, f))
        t += d
    return out


_CLASS = {"B": 0, "X": 2, "C": 1, "D": 1, "E": 1, "F": 1, "A": 2, "G": 2, "H": 2}


def smooth(frames: list[str]) -> list[str]:
    """Minimum duration MIN_FRAMES per shape. A run that is too short is removed in favour of its longest neighbour, starting
    with neutral consonants (B) and brief silences, then vowels; visible shapes (A closed, G teeth, H tongue) first borrow a frame
    from a neighbour of at least 4 frames before being sacrificed."""
    runs: list[list] = []
    for f in frames:
        if runs and runs[-1][0] == f:
            runs[-1][1] += 1
        else:
            runs.append([f, 1])
    while len(runs) > 1:
        short = [k for k, (_, n) in enumerate(runs) if n < MIN_FRAMES]
        if not short:
            break
        k = min(short, key=lambda j: (_CLASS[runs[j][0]], runs[j][1], j))
        neighbours = [v for v in (k - 1, k + 1) if 0 <= v < len(runs)]
        if _CLASS[runs[k][0]] == 2:
            donor = max((v for v in neighbours if runs[v][1] >= MIN_FRAMES + 1), key=lambda v: runs[v][1], default=None)
            if donor is not None:
                runs[donor][1] -= 1
                runs[k][1] += 1
                continue
        target = max(neighbours, key=lambda v: runs[v][1])
        runs[target][1] += runs[k][1]
        del runs[k]
        j = 1
        while j < len(runs):                       # merge repetitions that became neighbours
            if runs[j][0] == runs[j - 1][0]:
                runs[j - 1][1] += runs[j][1]
                del runs[j]
            else:
                j += 1
    return [f for f, n in runs for _ in range(n)]


def frame_energy_db(x: np.ndarray, sr: int, n: int, fps: int = config.FPS) -> np.ndarray:
    """RMS energy (dB) of each video frame i over [i/fps, (i+1)/fps]."""
    cs = np.concatenate([[0.0], np.cumsum(x.astype(np.float64) ** 2)])
    out = np.full(n, -180.0)
    for i in range(n):
        a = int(min(x.size, max(0, i / fps * sr)))
        b = int(min(x.size, max(0, (i + 1) / fps * sr)))
        if b > a:
            out[i] = 10 * np.log10(max((cs[b] - cs[a]) / (b - a), 1e-18))
    return out


def force_silences(frames: list[str], energy_db: np.ndarray) -> list[str]:
    """Real silence (energy < SILENCE_DB over at least SILENCE_MIN_FRAMES frames) -> X; real speech -> never X."""
    n = len(frames)
    quiet = energy_db[:n] < SILENCE_DB
    quiet = np.concatenate([quiet, np.zeros(n - len(quiet), dtype=bool)])
    out = list(frames)
    f = 0
    while f < n:
        g = f
        while g < n and quiet[g]:
            g += 1
        if g - f >= SILENCE_MIN_FRAMES:
            for k in range(f, g):
                out[k] = "X"
        f = max(g, f + 1)
    for k in range(n):
        if not quiet[k] and out[k] == "X":
            out[k] = "B"                      # voiced frame: mouth slightly open at least
    return out


def rms_envelope(x: np.ndarray, sr: int, fps: int = config.FPS) -> np.ndarray:
    """RMS energy per video frame (window of 1/fps centred on the frame), values >= 0."""
    n = int(np.ceil(x.size / sr * fps)) + 1
    out = np.zeros(n, dtype=np.float32)
    window = sr / fps
    for i in range(n):
        a = int(max(0, (i - 0.5) * window))
        b = int(min(x.size, (i + 0.5) * window))
        if b > a:
            seg = x[a:b]
            out[i] = float(np.sqrt(np.mean(seg * seg)))
    return out


def calculate(words: list[dict], x: np.ndarray, sr: int, language: str = "en", fps: int = config.FPS) -> list[dict]:
    """Mouth keys [{t, shape}] for a list of words {text, start, end} and the matching audio."""
    rms = rms_envelope(x, sr, fps)
    n = len(rms)
    active = rms[rms > 0]
    ref = float(np.percentile(active, 80)) if active.size else 0.0
    segments: list[tuple[float, float, str]] = []
    zones: list[tuple[float, float]] = []
    for w in words:
        segments += word_segments(w["text"], w["start"], w["end"], language)
        zones.append((w["start"] - WORD_MARGIN_S, w["end"] + WORD_MARGIN_S))
    starts = np.array([s[0] for s in segments]) if segments else np.array([])
    frames: list[str] = []
    for f in range(n):
        tc = (f + 0.5) / fps
        shape = "X"
        if segments:
            k = int(np.searchsorted(starts, tc, side="right")) - 1
            if k >= 0 and tc < segments[k][1]:
                shape = segments[k][2]
        in_word = any(a <= tc <= b for a, b in zones) if zones else False
        if shape == "X" and in_word:
            shape = "B"                      # small gap between two shapes of a word: slightly open mouth
        e = rms[f] / ref if ref > 0 else 0.0
        if not in_word and e < SILENCE_RELATIVE * 2:
            shape = "X"
        elif in_word and e < LOW_RELATIVE:
            shape = {"D": "C", "C": "B", "E": "B"}.get(shape, shape)
        if not in_word:
            shape = "X"
        frames.append(shape)
    frames = smooth(frames)
    frames = force_silences(frames, frame_energy_db(x, sr, len(frames), fps))
    keys: list[dict] = []
    f = 0
    while f < len(frames):
        g = f
        while g < len(frames) and frames[g] == frames[f]:
            g += 1
        t = max(0.0, (f - LEAD_FRAMES) / fps) if f > 0 else 0.0
        if not keys or keys[-1]["shape"] != frames[f]:
            keys.append({"t": round(t, 4), "shape": frames[f]})
        f = g
    if not keys or keys[0]["t"] > 0:
        keys.insert(0, {"t": 0.0, "shape": "X"})
    return keys


def run(reel: Reel, force: bool = False) -> dict:
    output = reel.path("mouth.json")
    if reel.is_fresh(output, reel.path("words.json"), reel.path("voice.wav")) and not force:
        log.info("mouth.json is up to date: skipped")
        return reel.read("mouth.json")
    words = reel.read("words.json")
    x, sr = audio.read(reel.path("voice.wav"))
    keys = calculate(words["words"], x, sr, reel.language)
    duration = audio.duration(x, sr)
    report = {"version": 1, "fps": config.FPS, "duration": round(duration, 4), "language": reel.language,
              "shapes_per_second": round(len(keys) / max(duration, 1e-6), 2), "keys": keys}
    reel.write(report, "mouth.json")
    reel.mark(output, reel.path("words.json"), reel.path("voice.wav"))
    reel.update_state(mouth={"keys": len(keys), "shapes_per_second": report["shapes_per_second"]})
    return report
