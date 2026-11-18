import numpy as np

from reelforge import mouth


def shapes(word, lang="en"):
    return [s for s, _ in mouth.word_shapes(word, lang)]


def test_english_rules():
    assert shapes("map") == ["A", "C", "A"]
    assert shapes("fun")[0] == "G"
    assert shapes("hello") == ["C", "H", "E"]
    assert shapes("boot")[1] == "F"
    assert shapes("the") == ["B", "C"]
    assert shapes("123") == []


def test_french_rules():
    assert shapes("bonjour", "fr")[:2] == ["A", "E"]
    assert shapes("pourquoi", "fr")[1] == "F"
    assert mouth.word_shapes("mangent", "fr")


def test_smooth_min_frames():
    out = mouth.smooth(list("XXXXXXBXXXXXX"))
    runs = [len(list(g)) for _, g in __import__("itertools").groupby(out)]
    assert min(runs) >= mouth.MIN_FRAMES or len(runs) == 1


def test_calculate_follows_words_and_silence():
    sr = 16000
    x = np.zeros(sr * 3, dtype=np.float32)
    x[sr // 2: sr * 2] = 0.3 * np.sin(np.arange(sr * 3 // 2) / 5.0)
    keys = mouth.calculate([{"text": "hello", "start": 0.5, "end": 2.0}], x, sr, "en")
    assert keys[0] == {"t": 0.0, "shape": "X"} and keys[-1]["shape"] == "X"
    assert any(k["shape"] not in "X" for k in keys)
    assert all(a["t"] < b["t"] for a, b in zip(keys, keys[1:]))
