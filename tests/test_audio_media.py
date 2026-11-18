import numpy as np
import pytest

from reelforge import audio, media


def tone(seconds, sr=16000, amp=0.3):
    return (amp * np.sin(np.arange(int(seconds * sr)) / 7.0)).astype(np.float32)


def test_trim_edges_and_gaps():
    sr = 16000
    x = np.concatenate([audio.silence(1, sr), tone(1, sr), audio.silence(1.5, sr), tone(1, sr), audio.silence(1, sr)])
    t = audio.trim_edges(x, sr, margin=0.0)
    assert abs(audio.duration(t, sr) - 3.5) < 0.01
    assert audio.gaps(t, sr) == pytest.approx([1.5], abs=0.05)
    assert audio.gaps(tone(1, sr), sr) == []


def test_target_length_graded():
    assert audio.target_length(0.3, 0.7) == 0.3
    assert audio.target_length(1.1, 0.7) == pytest.approx(0.7)
    assert audio.target_length(0.6, 0.7) < audio.target_length(0.9, 0.7)


def test_compress_silences_and_remap():
    sr = 16000
    x = np.concatenate([tone(1, sr), audio.silence(2.0, sr), tone(1, sr), audio.silence(1.0, sr)])
    y, cuts = audio.compress_silences(x, sr, max_s=0.7)
    assert cuts and len(y) < len(x)
    removed = sum(r for _, r in cuts)
    assert audio.duration(y, sr) == pytest.approx(5.0 - removed, abs=0.02)
    assert audio.remap(5.0, cuts) == pytest.approx(5.0 - removed, abs=0.02)
    assert audio.remap(0.5, cuts) == 0.5


def test_fade_resample_roundtrip(tmp_path):
    x = audio.fade(tone(0.5), 16000)
    assert x[0] == 0 and abs(x[-1]) < 1e-3
    assert len(audio.resample(x, 16000, 48000)) == pytest.approx(len(x) * 3, abs=2)
    audio.write(tmp_path / "a.wav", x, 16000)
    y, sr = audio.read(tmp_path / "a.wav")
    assert sr == 16000 and len(y) == len(x)
    with pytest.raises(audio.AudioError):
        audio.read(tmp_path / "missing.wav")


def test_normalize_loudness(tmp_path):
    audio.write(tmp_path / "in.wav", tone(3, 48000, 0.05), 48000)
    info = media.normalize_loudness(tmp_path / "in.wav", tmp_path / "out.wav", lufs=-14.0)
    assert info["linear"]
    got = media.measure_loudness(tmp_path / "out.wav")
    assert abs(got["lufs"] + 14.0) < 1.5
    assert media.duration(tmp_path / "out.wav") == pytest.approx(3.0, abs=0.1)


def test_missing_binary(monkeypatch):
    monkeypatch.setenv("REELFORGE_FFMPEG", "no-such-binary-xyz")
    with pytest.raises(media.MediaError):
        media.find_binary("ffmpeg")
