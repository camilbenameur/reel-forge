"""English text: numbers in words, spoken text, comparison tokens, typography.

Convention and mark-up helpers (keywords, word splitting) are in ``base``.
"""

from __future__ import annotations

import re

from .base import NBSP, NNBSP, ORDINARY_SPACES, normalize, strip_marks

_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
         "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
_ORDINAL_IRREGULAR = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth",
                      "nine": "ninth", "twelve": "twelfth"}
_CURRENCIES = {"$": ("dollar", "dollars"), "€": ("euro", "euros"), "£": ("pound", "pounds")}
_SPACES = "   "


def number_to_words(n: int) -> str:
    """Integer (0 to 999 999 999) in English words ("one hundred twenty-three", "two thousand twenty-six")."""
    if n < 0:
        return "minus " + number_to_words(-n)
    if n < 20:
        return _ONES[n]
    if n < 100:
        tens, unit = divmod(n, 10)
        return _TENS[tens] if unit == 0 else f"{_TENS[tens]}-{_ONES[unit]}"
    if n < 1000:
        hundreds, rest = divmod(n, 100)
        head = f"{_ONES[hundreds]} hundred"
        return head if rest == 0 else f"{head} {number_to_words(rest)}"
    for size, name in ((1_000_000, "million"), (1000, "thousand")):
        if n >= size:
            high, rest = divmod(n, size)
            head = f"{number_to_words(high)} {name}"
            return head if rest == 0 else f"{head} {number_to_words(rest)}"
    return str(n)


def ordinal_to_words(n: int) -> str:
    """"twenty-first", "hundredth": the last word of the cardinal takes its ordinal form."""
    words = number_to_words(n)
    head, space, last = words.rpartition(" ")
    prefix, dash, final = last.rpartition("-")
    if final in _ORDINAL_IRREGULAR:
        final = _ORDINAL_IRREGULAR[final]
    elif final.endswith("y"):
        final = final[:-1] + "ieth"
    else:
        final += "th"
    return f"{head}{space}{prefix}{dash}{final}"


def numbers_to_words(text: str) -> str:
    """Replace numbers written in digits by their reading ("3.5" -> "three point five", "20%" -> "twenty percent",
    "$5" -> "five dollars", "1,200" -> "one thousand two hundred", "21st" -> "twenty-first")."""
    def decimal(m: re.Match) -> str:
        whole, frac = m.group(1), m.group(2)
        return f"{number_to_words(int(whole))} point {' '.join(number_to_words(int(c)) for c in frac)}"

    def money(m: re.Match) -> str:
        singular, plural = _CURRENCIES[m.group(1)]
        amount = m.group(2).replace(",", "")
        word = singular if amount == "1" else plural
        return f"{amount} {word}"

    text = re.sub(r"(\d+(?:\.\d+)?)[" + _SPACES + r"]*%", r"\1 percent", text)
    text = re.sub(r"([$€£])[" + _SPACES + r"]*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)", money, text)
    text = re.sub(r"(\d+(?:\.\d+)?)[" + _SPACES + r"]*€", r"\1 euros", text)
    text = re.sub(r"(?<![\d,.])\d{1,3}(?:,\d{3})+(?![\d,])", lambda m: m.group(0).replace(",", ""), text)
    text = re.sub(r"(\d+)\.(\d+)", decimal, text)
    text = re.sub(r"\b(\d+)(?:st|nd|rd|th)\b", lambda m: ordinal_to_words(int(m.group(1))), text)
    return re.sub(r"\d+", lambda m: number_to_words(int(m.group(0))), text)


def spoken_text(text: str) -> str:
    """What the voice must read: no asterisks, no-break spaces as spaces, numbers in words, normalized spaces."""
    t = strip_marks(text).replace(NBSP, " ").replace(NNBSP, " ").replace("&", " and ")
    t = numbers_to_words(t)
    return ORDINARY_SPACES.sub(" ", t).strip()


def tokens(text: str) -> list[str]:
    """Normalized words of a text (non-empty), for WER and matching; a hyphen separates two words.

    Digits are brought to their reading in words, so "12" in a script and "twelve" in a transcript give the same tokens."""
    text = numbers_to_words(text.replace(NBSP, " ").replace(NNBSP, " "))
    t = text.replace("-", " ").replace("'", "").replace("’", "")
    return [n for n in (normalize(m) for m in t.split()) if n]


def typography(text: str) -> str:
    """English typography: no space before , . ; : ? ! (ordinary or no-break), ellipsis as one character, single spaces."""
    t = re.sub(r"[" + _SPACES + r"]+([,.;:?!])", r"\1", text)
    t = t.replace("...", "…")
    return re.sub(r"[ \t]{2,}", " ", t)


def typography_ok(text: str) -> bool:
    """False if a , ; : ? ! is preceded by a space (a no-break or narrow no-break space counts too)."""
    return not re.search(r"[" + _SPACES + r"][,;:?!]", text)
