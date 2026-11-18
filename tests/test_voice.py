import json

import pytest

from reelforge import config, providers, voice
from reelforge import script as script_mod
from reelforge.reel import ReelError
from reelforge.text import base


def spoken_blocks(reel):
    s = script_mod.load(reel)
    beats = [base.spoken_text(b["text"], "en") for b in s["beats"]]
    return [voice.block_text([beats[i] for i in g]) for g in voice.group_beats(beats)]


def test_seed_deterministic():
    assert providers.seed("a", 0) == providers.seed("a", 0) != providers.seed("a", 1)
    assert 0 <= providers.seed("a") < 2 ** 31


def test_stub_voice_pipeline(made_script):
    rep = voice.run(made_script)
    assert rep["provider"] == "stub" and rep["split"] == "beat" and len(rep["beats"]) == 6
    starts = [b["start"] for b in rep["beats"]]
    assert starts == sorted(starts) and rep["beats"][-1]["start"] + rep["beats"][-1]["duration"] <= rep["duration"]
    assert made_script.path("voice.wav").exists()
    from reelforge import media
    assert abs(media.measure_loudness(made_script.path("voice.wav"))["lufs"] + 14) < 1.5
    # second run: skipped
    stamp = made_script.path("voice.wav").stat().st_mtime_ns
    assert voice.run(made_script)["fingerprint"] == rep["fingerprint"]
    assert made_script.path("voice.wav").stat().st_mtime_ns == stamp


def test_take_defect_rules():
    assert voice.take_defect(0, 0, [], 5) == "silent or empty audio"
    assert "too short" in voice.take_defect(0.5, 0.5, [], 20)
    assert "too long" in voice.take_defect(30, 0.5, [], 5)
    assert "silence of" in voice.take_defect(2, 0.5, [1.5], 5)
    assert voice.take_defect(1.9, 0.5, [], 5) is None
    assert voice.take_defect(0.1, 0.5, [], 20, stub=True) is None


def test_group_beats_balanced():
    texts = ["x" * 200] * 5
    groups = voice.group_beats(texts, 450)
    assert sum(len(g) for g in groups) == 5 and len(groups) == 3
    assert voice.group_beats([], 600) == []


def test_gpu_voice_one_call_for_all_takes(made_script, reference_voice, fake_voice, fake_whisper):
    fake_whisper.texts = spoken_blocks(made_script)
    rep = voice.run(made_script, provider="gpu", takes=2)
    assert rep["provider"] == "gpu" and rep["split"] == "continuous"
    assert "warning" not in rep
    jobs = [j for j in fake_voice.jobs.values() if j["function"] == "voice"]
    n_blocks = len(rep["blocks"])
    assert len(jobs) >= 1 and sum(len(j["request"]["segments"]) for j in jobs) == 2 * n_blocks
    assert all(b["ok"] and len(b["takes"]) == 2 for b in rep["blocks"])
    assert made_script.ledger.total("gpu") > 0
    before = len(fake_voice.jobs)
    # cached: a forced redo of the step uses the take cache, no new job
    voice.run(made_script, force=False, provider="gpu", takes=2)
    voice.run(made_script, provider="gpu", takes=2, rechoose=True)
    assert len(fake_voice.jobs) == before


def test_reference_change_invalidates_cache(made_script, reference_voice, fake_voice, fake_whisper):
    fake_whisper.texts = spoken_blocks(made_script)
    voice.run(made_script, provider="gpu")
    n = len(fake_voice.jobs)
    (reference_voice / "reference.txt").write_text("Another transcript entirely.\n")
    voice.run(made_script, provider="gpu")
    assert len(fake_voice.jobs) > n


def test_invented_reference_warns(made_script, reference_voice, fake_voice, fake_whisper):
    (reference_voice / "reference.source").write_text("INVENTED\nDescription: x\n")
    fake_whisper.texts = spoken_blocks(made_script)
    assert "INVENTED" in voice.run(made_script, provider="gpu")["warning"]


def test_cap_reached_take_refused(made_script, reference_voice, fake_voice, fake_whisper):
    from reelforge.testing import voice_output
    fake_whisper.texts = spoken_blocks(made_script)
    state = {"first": True}

    def output(function, request):
        out = voice_output(function, request)
        if state["first"]:
            state["first"] = False
            for s in out["segments"]:
                s["cap_reached"] = True
        return out

    fake_voice.output = output
    rep = voice.run(made_script, provider="gpu")
    assert all(b["ok"] for b in rep["blocks"])
    assert all(b["attempts"] == 2 for b in rep["blocks"])      # the run-on take was refused, redone with another seed


def test_wer_refuses_bad_take(made_script, reference_voice, fake_voice, fake_whisper):
    from reelforge.recognition import Word
    fake_whisper.fixed = [Word("nonsense", 0, 1), Word("words", 1, 2)]
    rep = voice.run(made_script, provider="gpu")
    assert not any(b["ok"] for b in rep["blocks"]) and rep["rejected_beats"]
    assert "WER" in rep["blocks"][0]["defect"]


def test_missing_reference_and_key(made_script, root, monkeypatch):
    with pytest.raises(ReelError, match="reference"):
        voice.run(made_script, provider="gpu")


def test_rechoose_requires_gpu_split(made_script):
    with pytest.raises(ReelError, match="rechoose"):
        voice.run(made_script, rechoose=True)


def test_config_values(monkeypatch):
    monkeypatch.setenv("REELFORGE_VOICE_TAKES", "99")
    with pytest.raises(config.ConfigError):
        config.voice_takes()
    assert config.render_concurrency() == 2
