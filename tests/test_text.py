import pytest

from reelforge.text import base, en, fr


@pytest.mark.parametrize("n,words", [(0, "zero"), (13, "thirteen"), (21, "twenty-one"), (100, "one hundred"),
                                     (2026, "two thousand twenty-six"), (1_200_000, "one million two hundred thousand")])
def test_en_numbers(n, words):
    assert en.number_to_words(n) == words


@pytest.mark.parametrize("n,words", [(0, "zéro"), (21, "vingt et un"), (71, "soixante et onze"), (80, "quatre-vingts"),
                                     (81, "quatre-vingt-un"), (200, "deux cents"), (200_000, "deux cent mille"),
                                     (2026, "deux mille vingt-six")])
def test_fr_numbers(n, words):
    assert fr.number_to_words(n) == words


def test_en_digits_in_text():
    out = en.spoken_text("Cut *3.5* hours, 20% of $1,200 on the 3rd & 21st")
    assert out == "Cut three point five hours, twenty percent of one thousand two hundred dollars on the third and twenty-first"
    assert en.ordinal_to_words(40) == "fortieth" and en.ordinal_to_words(100) == "one hundredth"


def test_fr_digits_in_text():
    assert fr.spoken_text("Il y a 22 % de *chance*, 3,5 et 1 500 €, le 1er") == \
        "Il y a vingt-deux pour cent de chance, trois virgule cinq et mille cinq cents euros, le premier"


def test_tokens_unify_digits_and_hyphens():
    assert en.tokens("twenty-two") == en.tokens("22") == ["twenty", "two"]
    assert en.tokens("Don't stop") == ["dont", "stop"]
    assert fr.tokens("vingt-deux") == fr.tokens("22") == ["vingt", "deux"]
    assert fr.tokens("L’idée") == ["lidee"]
    assert base.tokens("Twelve", "en") == ["twelve"]


def test_french_typography():
    t = fr.typography("Vraiment ? « oui » : ok ; non !")
    assert "Vraiment ?" in t and "« oui »" in t and " :" in t
    assert fr.typography_ok(t) and not fr.typography_ok("Vraiment ?")
    assert fr.typography("20 %") == "20 %"


def test_english_typography():
    assert en.typography("Really ?  Yes ... ok") == "Really? Yes… ok"
    assert en.typography_ok("Really? Yes.") and not en.typography_ok("Really ?")
    assert not en.typography_ok("Really ?")


def test_beat_words_and_keywords():
    words = base.beat_words("One *two three* four *five*")
    assert [(w.text, w.emphasis) for w in words] == [("One", False), ("two", True), ("three", True), ("four", False),
                                                      ("five", True)]
    assert base.keywords("a *b c* d *e*") == ["b c", "e"]
    # a no-break space glues punctuation to the word
    assert [w.text for w in base.beat_words("Vraiment ? oui")] == ["Vraiment ?", "oui"]


def test_sentences_keep_abbreviations():
    assert base.split_sentences("Ask Dr. Smith. Then leave!", "en") == ["Ask Dr. Smith.", "Then leave!"]
    assert base.split_sentences("Voir M. Dupont. Ensuite.", "fr") == ["Voir M. Dupont.", "Ensuite."]


def test_chunks_respect_limit_and_convert():
    text = "First sentence here. " * 10
    chunks = base.split_chunks(text, 60)
    assert all(len(c) <= 60 for c in chunks) and " ".join(chunks).split() == text.split()
    assert base.split_chunks("", 10) == []
    assert base.split_chunks("It costs 5. Then 7 more.", 100, convert=en.numbers_to_words) == ["It costs five. Then seven more."]
    assert all(len(c) <= 10 for c in base.split_chunks("a" * 25 + " bb", 10))


def test_lexicon():
    lex = {"GPU": "gee pee you", "GPUs": "gee pee yous"}
    assert base.apply_lexicon("GPUs and GPU, not GPUx", lex) == "gee pee yous and gee pee you, not GPUx"
    assert base.lexicon_used("only GPU", lex) == {"GPU": "gee pee you"}


def test_unknown_language():
    with pytest.raises(ValueError):
        base.spoken_text("x", "de")
