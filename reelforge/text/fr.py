"""French text: numbers in words, spoken text, comparison tokens, French typography, rough phonetic key.

Convention and mark-up helpers (keywords, word splitting) are in ``base``.
"""

from __future__ import annotations

import re

from .base import NBSP, NNBSP, ORDINARY_SPACES, normalize, strip_marks

_UNITS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze",
          "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"]
_TENS = {20: "vingt", 30: "trente", 40: "quarante", 50: "cinquante", 60: "soixante"}
_SPACES = "   "           # ordinary, no-break, narrow no-break


def number_to_words(n: int) -> str:
    """Integer (0 to 999 999 999) in French words ("quatre-vingt-un", "mille deux cents")."""
    if n < 0:
        return "moins " + number_to_words(-n)
    if n < 20:
        return _UNITS[n]
    if n < 70:
        d, u = divmod(n, 10)
        base = _TENS[d * 10]
        if u == 0:
            return base
        return f"{base} et un" if u == 1 else f"{base}-{_UNITS[u]}"
    if n < 80:
        r = n - 60
        return "soixante et onze" if r == 11 else f"soixante-{_UNITS[r]}"
    if n < 100:
        r = n - 80
        return "quatre-vingts" if r == 0 else f"quatre-vingt-{_UNITS[r]}"
    if n < 1000:
        c, r = divmod(n, 100)
        head = "cent" if c == 1 else f"{_UNITS[c]} cent" + ("s" if r == 0 else "")
        return head if r == 0 else f"{head} {number_to_words(r)}"
    if n < 1_000_000:
        m, r = divmod(n, 1000)
        # "cents" and "quatre-vingts" lose their s before "mille" ("deux cent mille")
        factor = number_to_words(m)
        if factor.endswith(("cents", "quatre-vingts")):
            factor = factor[:-1]
        head = "mille" if m == 1 else f"{factor} mille"
        return head if r == 0 else f"{head} {number_to_words(r)}"
    if n < 1_000_000_000:
        m, r = divmod(n, 1_000_000)
        head = f"{number_to_words(m)} million" + ("s" if m > 1 else "")
        return head if r == 0 else f"{head} {number_to_words(r)}"
    return str(n)


def numbers_to_words(text: str) -> str:
    """Replace numbers written in digits by their reading ("3,5" -> "trois virgule cinq", "20 %" -> "vingt pour cent")."""
    def decimal(m: re.Match) -> str:
        whole, frac = m.group(1), m.group(2)
        return f"{number_to_words(int(whole))} virgule {' '.join(number_to_words(int(c)) for c in frac)}"

    text = re.sub(r"(\d+(?:[,.]\d+)?)[" + _SPACES + r"]*%", r"\1 pour cent", text)
    text = re.sub(r"(\d+(?:[,.]\d+)?)[" + _SPACES + r"]*€", r"\1 euros", text)
    text = re.sub(r"(\d+)[,.](\d+)", decimal, text)
    text = re.sub(r"\b1er\b", "premier", text)
    text = re.sub(r"(?<![\d,.])\d{1,3}(?:[" + _SPACES + r"]\d{3})+(?!\d)",
                  lambda m: str(int(re.sub(r"\D", "", m.group(0)))), text)
    return re.sub(r"\d+", lambda m: number_to_words(int(m.group(0))), text)


def spoken_text(text: str) -> str:
    """What the voice must read: no asterisks, no-break spaces as spaces, numbers in words, normalized spaces."""
    t = strip_marks(text).replace(NBSP, " ").replace(NNBSP, " ").replace("&", " et ")
    t = numbers_to_words(t)
    return ORDINARY_SPACES.sub(" ", t).strip()


def tokens(text: str) -> list[str]:
    """Normalized words of a text (non-empty), for WER and matching; a hyphen separates two words.

    Numbers in digits are brought to their reading in words: a script that writes "12" and a transcript that says "douze"
    (or the reverse) give the same tokens."""
    text = re.sub(r"\d+", lambda m: " " + number_to_words(int(m.group(0))) + " ", text)
    t = text.replace(NBSP, " ").replace(NNBSP, " ").replace("-", " ").replace("'", "").replace("’", "")
    return [n for n in (normalize(m) for m in t.split()) if n]


def typography(text: str) -> str:
    """French typography: narrow no-break space before ; ? !, no-break space before : and inside guillemets."""
    t = re.sub(r"[" + _SPACES + r"]*([?!;])", NNBSP + r"\1", text)
    t = re.sub(r"[" + _SPACES + r"]*:", NBSP + ":", t)
    t = re.sub("«[" + _SPACES + "]*", "«" + NBSP, t)
    t = re.sub("[" + _SPACES + "]*»", NBSP + "»", t)
    t = re.sub(r"(\d)[ ]+(%|€)", r"\1" + NNBSP + r"\2", t)
    return t


def typography_ok(text: str) -> bool:
    """False if a ? ! ; : is preceded by an ordinary space (French typography not respected)."""
    return not re.search(r" [?!;:](?!\w)", text)


def phonetic_key(word: str) -> str:
    """Rough phonetic key of French, so homophones are not counted as voice errors ("voie" / "vois", "montre" / "montrent"):
    speech recognition cannot tell them apart by ear. NOT a phonetization: only the frequent cases."""
    t = normalize(word)
    if len(t) <= 1:
        return t
    t = t.replace("ph", "f").replace("qu", "k").replace("eau", "o").replace("au", "o")
    t = re.sub(r"c(?=[aou])", "k", t)
    t = re.sub(r"(ent|es|s|x|t|d)$", "", t) if len(t) > 3 else re.sub(r"(s|x|t|d)$", "", t)
    t = re.sub(r"(ai|ei|ee|er|ez|et)", "e", t)
    t = re.sub(r"(.)\1+", r"\1", t)          # doubled letters: nn -> n
    t = re.sub(r"e$", "", t) if len(t) > 1 else t
    return t
