import json
import subprocess

import pytest

from reelforge import align, check, config, design_voice, media, mouth, package, render, timeline, voice
from reelforge import __main__ as cli
from reelforge.recognition import Word
from reelforge.reel import ReelError


@pytest.fixture
def aligned(made_script):
    voice.run(made_script)
    align.run(made_script)
    return made_script


def test_align_stub_covers_script(aligned):
    w = aligned.read("words.json")
    assert w["mode"] == "stub" and len(w["beats"]) == 6
    starts = [x["start"] for x in w["words"]]
    assert starts == sorted(starts) and all(x["end"] > x["start"] for x in w["words"])
    assert 3 <= sum(x["emphasis"] for x in w["words"]) <= 6
    assert w["words"][0]["text"] == "Nine"


def test_align_with_recognition(aligned, fake_whisper):
    truth = aligned.read("words.json")["words"]
    takes = aligned.read("voice", "takes.json")
    takes["provider"] = "stub-checked"
    aligned.write(takes, "voice", "takes.json")
    fake_whisper.fixed = [Word(x["text"].strip(".,!?"), x["start"], x["end"]) for x in truth]
    out = align.run(aligned, force=True)
    assert out["mode"] == "whisper" and out["wer"] == 0
    assert all(x["source"] == "recognized" for x in out["words"])
    assert fake_whisper.calls == 1
    align.run(aligned, force=True)
    assert fake_whisper.calls == 1          # transcription cached


def test_beat_boundaries():
    rec = [Word("one", 0, .4), Word("two", .5, .9), Word("three", 1.5, 1.9), Word("four", 2.0, 2.4)]
    w, share, mode = align.beat_boundaries(["one two", "three four"], rec, 2.5)
    assert mode == "words" and w[0][1] == pytest.approx(1.2) and w[1][1] == 2.5
    w, share, mode = align.beat_boundaries(["one two", "three four"], [], 2.0)
    assert mode == "proportional" and w[0][1] == pytest.approx(2.0 * 7 / 17) and w[1][1] == 2.0


def test_timeline_contract(aligned, monkeypatch):
    mouth.run(aligned)
    tl = timeline.run(aligned)
    assert timeline.validate(tl, None) == []
    assert tl["version"] == 1 and tl["theme"] == "paper" and tl["language"] == "en" and (tl["width"], tl["height"]) == (1080, 1920)
    assert tl["avatar"]["poses"][0]["t"] == 0 and tl["avatar"]["poses"][-1]["expression"] == "wink"
    assert tl["scenes"][-1]["end"] <= tl["durationInFrames"] / 30 + 1e-3
    assert all(len(p["words"]) >= 1 for p in tl["captions"])
    pub = config.paths().public_reels / aligned.name
    assert (pub / "voice.wav").exists() and json.loads((pub / "timeline.json").read_text()) == tl
    # cues resolve to the word start
    stamp = next(s for s in tl["scenes"] if s["cues"])
    assert all(stamp["start"] - 0.01 <= t for t in stamp["cues"].values())


def test_timeline_validation_catches_errors(aligned):
    mouth.run(aligned)
    tl = timeline.run(aligned)
    cat = {"stop-stamp": {}}
    assert any("unknown to the catalog" in e for e in timeline.validate(tl, cat))
    bad = json.loads(json.dumps(tl))
    bad["scenes"][0]["end"] = 999
    bad["captions"][0]["words"] = [10 ** 6]
    bad["avatar"]["poses"][0]["t"] = 0.5
    bad["avatar"]["mouth"].reverse()
    errs = " | ".join(timeline.validate(bad, None))
    for needle in ("after the end", "invalid word indices", "first pose", "avatar.mouth is not sorted"):
        assert needle in errs


def test_caption_pages_rules():
    texts = "Why? Because you start by introducing yourself and the of".split()
    pages = timeline.split_pages(texts, "en")
    assert [i for p in pages for i in p] == list(range(len(texts)))
    assert all(not timeline._small(texts[p[-1]], "en") or len(p) <= 2 for p in pages[:-1])


def fake_render(monkeypatch, reel_dir_holder):
    real = subprocess.run

    def run(cmd, *a, **kw):
        if cmd[0].endswith("npx") or cmd[0] == "npx":
            out = [c for c in cmd if c.endswith("render.mp4")][0]
            ff = media.find_binary("ffmpeg")
            real([ff, "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=40",
                  "-f", "lavfi", "-i", "sine=frequency=300:duration=40", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "35",
                  "-pix_fmt", "yuv420p", "-c:a", "aac", out], check=True)
            return subprocess.CompletedProcess(cmd, 0, "ok", "")
        return real(cmd, *a, **kw)

    monkeypatch.setattr(render.subprocess, "run", run)


def test_render_command(aligned, monkeypatch):
    monkeypatch.setenv("REELFORGE_RENDER_CONCURRENCY", "3")
    cmd = render.command(aligned)
    assert cmd[1:4] == ["remotion", "render", "src/index.ts"] and "--concurrency=3" in cmd and "Reel" in cmd


def test_render_requires_node_modules(aligned):
    mouth.run(aligned)
    timeline.run(aligned)
    with pytest.raises(ReelError, match="node_modules"):
        render.run(aligned)


def test_render_check_package(aligned, root, monkeypatch):
    mouth.run(aligned)
    timeline.run(aligned)
    (root / "studio" / "node_modules").mkdir()
    fake_render(monkeypatch, None)
    render.run(aligned)
    assert aligned.path("render.mp4").exists() and aligned.state["render"]["size"] > 0
    res = check.run(aligned, review=True)
    assert aligned.path("qa", "report.md").exists() and aligned.path("qa", "contact-sheet.jpg").exists()
    assert any("frozen" in e for e in res.errors) is False
    assert res.measures["width"] == 1080 and res.measures["frames"] >= 1190
    assert "Visual review" in aligned.path("qa", "report.md").read_text()
    out = package.run(aligned)
    txt = aligned.path("caption.txt").read_text()
    assert "Made with the help of AI: generated voice and animation." in txt and "#" in txt
    assert aligned.path("cover.jpg").exists() and out["disclosure"] == "unknown"
    assert aligned.path("qa", "compliance.md").exists()


def test_check_detects_frozen_and_empty():
    import numpy as np
    frames = np.zeros((60, 96, 54), dtype=np.uint8)
    frames[30:] = (np.arange(30)[:, None, None] * 7 % 255).astype(np.uint8)
    runs = check.frozen_runs(frames)
    assert runs and runs[0][0] == 0
    assert check.empty_runs(frames)


def test_disclosure_follows_reference(root, reference_voice):
    assert package.disclosure("en") == package.DISCLOSURES["en"]["cloned"]
    (reference_voice / "reference.source").write_text("INVENTED VOICE\n")
    assert "AI-invented" in package.disclosure("en")
    assert "inventée" in package.disclosure("fr")


def test_design_voice(root, fake_voice, tmp_path):
    folder = root / "voice-reference"
    rep = design_voice.run("a calm voice", None, "5,6")
    assert [c["seed"] for c in rep["candidates"]] == [5, 6]
    src = (folder / "reference.source").read_text()
    assert "INVENTED VOICE" in src and "Description: a calm voice" in src and "Seed:" in src
    assert (folder / "reference.wav").exists() and (folder / "reference.txt").read_text().strip()
    assert package.reference_kind() == "invented"
    with pytest.raises(ReelError):
        design_voice.parse_seeds("a,b")


def run_cli(capsys, *argv):
    code = cli.main(list(argv))
    o = capsys.readouterr()
    return code, o.out, o.err


def test_cli_all_with_approval_stub(root, capsys, monkeypatch):
    (root / "studio" / "node_modules").mkdir()
    fake_render(monkeypatch, None)
    code, out, err = run_cli(capsys, "all", "Cli topic", "--approve-script", "--provider", "stub")
    assert code == 0, err
    folder = next((root / "reels").iterdir())
    for name in ("voice.wav", "words.json", "mouth.json", "timeline.json", "render.mp4", "qa/report.md", "caption.txt", "cover.jpg"):
        assert (folder / name).exists(), name
    code, out, _ = run_cli(capsys, "status")
    assert "[x] package" in out
