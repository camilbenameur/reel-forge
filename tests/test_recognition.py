from reelforge import recognition as r
from reelforge.recognition import Word


def test_wer_and_phonetic():
    assert r.wer(["a", "b", "c", "d"], ["a", "x", "c", "d"]) == 0.25
    assert r.wer([], []) == 0.0
    assert r.wer_phonetic(["the", "cats"], ["the", "cat"], language="en") == 0
    assert r.wer_phonetic(["claude", "code"], ["cloud", "code"], r.aliases("en"), "en") == 0
    assert r.wer_phonetic(["claude", "code"], ["cloud", "code"], None, "en") > 0


def test_match_recognized_and_fallback():
    script = ["Hello", "there,", "twenty-two", "friends."]
    heard = [Word("hello", 0.0, 0.4), Word("there", 0.4, 0.8), Word("twenty", 0.9, 1.2), Word("two", 1.2, 1.5),
             Word("friends", 1.6, 2.0)]
    spans, share = r.match(script, heard, 0.0, 2.0)
    assert share >= 0.75 and spans[0][2] == "recognized" and spans[2][2] == "approx"
    assert all(a[1] <= b[0] + 1e-9 for a, b in zip(spans, spans[1:]))
    spans, share = r.match(script, [], 0.0, 4.0)
    assert {s[2] for s in spans} == {"proportional"} and spans[-1][1] == 4.0


def test_transcribe_cache(tmp_path):
    import numpy as np
    import soundfile as sf
    f = tmp_path / "a.wav"
    sf.write(f, np.zeros(1600, dtype="float32"), 16000)
    calls = []

    def engine(path, lang, model):
        calls.append(lang)
        return [Word("hi", 0.0, 0.1)]

    c = tmp_path / "c.json"
    assert r.transcribe(f, "en", "tiny", engine, c) == [Word("hi", 0.0, 0.1)]
    r.transcribe(f, "en", "tiny", engine, c)
    assert calls == ["en"]
    r.transcribe(f, "fr", "tiny", engine, c)
    assert calls == ["en", "fr"]
