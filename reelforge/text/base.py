"""Language-independent text tools: normalization, the script mark-up (``*keyword*``), sentence and chunk splitting,
pronunciation lexicon. Language-specific parts (numbers, typography) live in ``en`` and ``fr``; the dispatchers here call
them according to the ``language`` argument.

Script convention: keywords are wrapped in asterisks (``*example*``, or ``*two words*`` for a phrase). Non-breaking spaces
(U+00A0, U+202F) glue punctuation to the word before it, so words are split on ORDINARY whitespace only: ``really ?`` with a
non-breaking space is one word (punctuation attached, as ``studio/src/core/types.ts`` expects).
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Callable, Iterable

LANGUAGES = ("en", "fr")
NBSP = " "
NNBSP = " "
ORDINARY_SPACES = re.compile(r"[ \t\r\n]+")
SENTENCE_END = ".!?…"

# End of sentence followed by a capital, an opening quote or a digit.
_SENTENCE_BREAK = re.compile(r"(?<=[.!?…])\s+(?=[A-ZÀ-ÖØ-Þ\"«“0-9])")
_ABBREVIATIONS = {
    "en": ("Mr", "Mrs", "Ms", "Dr", "Prof", "St", "Sr", "Jr", "vs", "etc", "e.g", "i.e", "approx"),
    "fr": ("M", "MM", "Mme", "Mmes", "Mlle", "Dr", "Pr", "St", "Ste", "cf"),
}


def check_language(language: str) -> str:
    if language not in LANGUAGES:
        raise ValueError(f"unknown language: {language!r} (expected: {', '.join(LANGUAGES)})")
    return language


def normalize(word: str) -> str:
    """Comparison form of a word: lowercase, no accents, no apostrophes or punctuation ("L'idea!" -> "lidea")."""
    t = unicodedata.normalize("NFKD", word.lower().replace("œ", "oe").replace("æ", "ae"))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]", "", t)


# --- script mark-up -----------------------------------------------------------------------------------------------------

@dataclass(frozen=True)
class ScriptWord:
    text: str           # as displayed (asterisks removed), attached punctuation included
    emphasis: bool      # keyword


def strip_marks(text: str) -> str:
    """The text without keyword asterisks."""
    return text.replace("*", "")


def beat_words(text: str) -> list[ScriptWord]:
    """Displayed words of a beat with the keyword flag. Asterisks may wrap several words."""
    words: list[ScriptWord] = []
    state = False
    for chunk in ORDINARY_SPACES.split(text.strip()):
        if not chunk:
            continue
        start_state = state
        for ch in chunk:
            if ch == "*":
                state = not state
        clean = chunk.replace("*", "")
        if clean:
            words.append(ScriptWord(clean, start_state or "*" in chunk))
    return words


def keywords(text: str) -> list[str]:
    """Keyword groups (between asterisks) of a text."""
    return [m.strip() for m in re.findall(r"\*([^*]+)\*", text)]


def sentence_end(word: str) -> bool:
    return word.rstrip(" »\"”)*").endswith(tuple(SENTENCE_END)) or word.rstrip().endswith(("?", "!", "."))


# --- dispatch to the language modules -------------------------------------------------------------------------------------

def _module(language: str):
    check_language(language)
    if language == "fr":
        from . import fr
        return fr
    from . import en
    return en


def spoken_text(text: str, language: str = "en") -> str:
    """The text as the voice must read it: no asterisks, non-breaking spaces as spaces, numbers in words."""
    return _module(language).spoken_text(text)


def tokens(text: str, language: str = "en") -> list[str]:
    """Comparison tokens (WER, word matching) of a text: numbers brought to the same form, a hyphen separates two words."""
    return _module(language).tokens(text)


def numbers_to_words(text: str, language: str = "en") -> str:
    return _module(language).numbers_to_words(text)


def typography(text: str, language: str = "en") -> str:
    return _module(language).typography(text)


def typography_ok(text: str, language: str = "en") -> bool:
    return _module(language).typography_ok(text)


# --- sentences and chunks ---------------------------------------------------------------------------------------------------

def _false_break(previous: str, language: str) -> bool:
    abbreviations = _ABBREVIATIONS[language]
    return bool(re.search(r"(?<!\w)(?:" + "|".join(re.escape(a) for a in abbreviations) + r")\.$", previous))


def split_sentences(text: str, language: str = "en") -> list[str]:
    """Sentences of a text. No break after an abbreviation."""
    check_language(language)
    out: list[str] = []
    for fragment in (s.strip() for s in _SENTENCE_BREAK.split(text.replace("\n", " "))):
        if not fragment:
            continue
        if out and _false_break(out[-1], language):
            out[-1] += " " + fragment
        else:
            out.append(fragment)
    return out


def stack(pieces: Iterable[str], limit: int) -> list[str]:
    """Group consecutive pieces into chunks of at most ``limit`` characters."""
    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + 1 + len(piece) > limit:
            chunks.append(current)
            current = piece
        else:
            current = f"{current} {piece}".strip()
    if current:
        chunks.append(current)
    return chunks


def _split_words(text: str, limit: int) -> list[str]:
    """Last resort: cut at spaces (and, for an oversized word, at the limit)."""
    words: list[str] = []
    for word in text.split():
        while len(word) > limit:
            words.append(word[:limit])
            word = word[limit:]
        words.append(word)
    return stack(words, limit)


def _split_long(sentence: str, limit: int) -> list[str]:
    """A sentence longer than the limit: cut at commas and semicolons, then at spaces."""
    pieces: list[str] = []
    for segment in re.split(r"(?<=[,;:])\s+", sentence):
        pieces += [segment] if len(segment) <= limit else _split_words(segment, limit)
    return stack(pieces, limit)


def split_chunks(text: str, max_chars: int = 300, *, language: str = "en",
                 convert: Callable[[str], str] | None = None) -> list[str]:
    """Cut a text into chunks of at most ``max_chars`` characters at sentence ends.

    ``convert`` (numbers to words) is applied to each sentence once sentences are found: a number at the start of a sentence
    becomes a lowercase word and the end of the previous sentence would no longer be visible. The limit is measured on the
    converted text."""
    text = text.strip()
    if convert is None and len(text) <= max_chars:
        return [text] if text else []
    sentences = split_sentences(text, language)
    if convert is not None:
        sentences = [convert(s) for s in sentences]
    pieces: list[str] = []
    for s in sentences:
        pieces += [s] if len(s) <= max_chars else _split_long(s, max_chars)
    return stack(pieces, max_chars)


# --- pronunciation lexicon -----------------------------------------------------------------------------------------------------

def apply_lexicon(text: str, lexicon: dict[str, str]) -> str:
    """Replace each name of the lexicon (whole word, case respected, longest first) by its pronunciation spelling."""
    names = sorted((n for n in lexicon if n), key=len, reverse=True)
    if not names:
        return text
    pattern = re.compile(r"(?<!\w)(?:" + "|".join(re.escape(n) for n in names) + r")(?!\w)")
    return pattern.sub(lambda m: lexicon[m.group(0)], text)


def lexicon_used(text: str, lexicon: dict[str, str]) -> dict[str, str]:
    """The part of the lexicon that applies to this text (used in cache keys)."""
    return {n: s for n, s in sorted(lexicon.items()) if apply_lexicon(text, {n: s}) != text}
