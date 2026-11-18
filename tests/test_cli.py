import json

import pytest

from reelforge import __main__ as cli


def test_step_dispatch_calls_run(root, capsys, monkeypatch):
    run(capsys, "new", "Topic")
    calls = []
    fake = type("M", (), {"run": staticmethod(lambda reel, force, **kw: calls.append((reel.name, force, kw)))})
    monkeypatch.setattr(cli.importlib, "import_module", lambda name, *a, **k: fake)
    assert run(capsys, "align", "topic", "--force")[0] == 0
    assert run(capsys, "voice", "topic", "--provider", "stub")[0] == 0
    assert calls[0][1] is True and calls[1][2] == {"provider": "stub", "split": None, "takes": None, "rechoose": False}


def run(capsys, *argv):
    code = cli.main(list(argv))
    out = capsys.readouterr()
    return code, out.out, out.err


def test_new_script_status(root, capsys):
    code, out, _ = run(capsys, "new", "My first topic", "--language", "fr")
    assert code == 0 and out.strip().endswith("my-first-topic")
    code, _, _ = run(capsys, "script", "my-first-topic")
    assert code == 0
    code, out, _ = run(capsys, "status")
    assert code == 0 and "[x] script" in out and "[ ] voice" in out and "Language: fr" in out
    assert json.loads(next((root / "reels").iterdir()).joinpath("script.json").read_text(encoding="utf-8"))["language"] == "fr"


def test_all_stops_after_script_without_approval(root, capsys):
    code, out, _ = run(capsys, "all", "Topic")
    assert code == 0 and "Review it" in out and "continue" in out
    assert not list((root / "reels").glob("*/voice.wav"))


def test_continue_validates_script_first(root, capsys):
    run(capsys, "new", "Topic")
    code, _, err = run(capsys, "continue", "topic")
    assert code == 2 and "script.json" in err


def _fake_steps(monkeypatch, check_errors):
    """Every step is a recording fake; `check` reports `check_errors`."""
    from reelforge.check import Result
    calls = []

    def fake_import(name, *a, **k):
        step = name.split(".")[1]
        return type("M", (), {"run": staticmethod(
            lambda reel, force=False, **kw: calls.append(step) or (Result(errors=list(check_errors)) if step == "check" else None))})

    monkeypatch.setattr(cli.importlib, "import_module", fake_import)
    return calls


def test_check_errors_block_packaging(root, capsys, monkeypatch):
    run(capsys, "new", "Topic")
    run(capsys, "script", "topic")
    calls = _fake_steps(monkeypatch, ["frozen image: 40 consecutive frames (1.3 s) from 2.0 s"])
    code, _, err = run(capsys, "continue", "topic")
    assert code == 2 and "check failed" in err and "frozen image" in err
    assert calls[-1] == "check" and "package" not in calls
    code, _, err = run(capsys, "check", "topic")
    assert code == 2 and "check failed" in err


def test_clean_check_lets_the_pipeline_reach_package(root, capsys, monkeypatch):
    run(capsys, "new", "Topic")
    run(capsys, "script", "topic")
    calls = _fake_steps(monkeypatch, [])
    assert run(capsys, "continue", "topic")[0] == 0 and calls[-1] == "package"
    assert run(capsys, "check", "topic")[0] == 0


def test_catalog_lists(root, capsys):
    code, out, _ = run(capsys, "catalog")
    assert code == 0 and "stop-stamp" in out


def test_catalog_missing(tmp_path, monkeypatch, capsys):
    monkeypatch.setenv("REELFORGE_ROOT", str(tmp_path))
    code, _, err = run(capsys, "catalog")
    assert code == 2 and "--export" in err


def test_errors_are_one_line_and_redacted(root, capsys, monkeypatch):
    monkeypatch.setenv("REELFORGE_LLM", "nonsense")
    run(capsys, "new", "Topic")
    code, _, err = run(capsys, "script", "topic")
    assert code == 2 and err.startswith("Error:") and "Traceback" not in err


def test_usage_errors(capsys):
    code, _, _ = run(capsys, "bogus")
    assert code == 2
    code, _, _ = run(capsys)
    assert code == 2


def test_gpu_delegates(root, capsys, monkeypatch):
    seen = []
    import reelforge.gpu.__main__ as gm
    monkeypatch.setattr(gm, "main", lambda argv: seen.append(argv) or 0)
    code, _, _ = run(capsys, "gpu", "costs", "--days", "3")
    assert code == 0 and seen == [["costs", "--days", "3"]]


def test_secrets_loaded_at_cli_start_not_import(root, capsys, monkeypatch):
    (root / ".env").write_text("REELFORGE_LANGUAGE=fr\n")
    run(capsys, "new", "Topic")
    assert json.loads(next((root / "reels").iterdir()).joinpath("state.json").read_text())["language"] == "fr"
