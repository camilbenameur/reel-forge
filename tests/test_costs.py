import json
from datetime import datetime, timedelta, timezone

import pytest

from reelforge import costs
from reelforge.gpu import pricing
from reelforge.gpu.client import Result


def test_ledger_append_read_total_and_truncated_line(tmp_path):
    led = costs.Ledger(tmp_path / "a" / "costs.jsonl")
    assert led.lines() == [] and led.total() == 0.0
    led.add(step="voice", type_="gpu", cost_usd=0.25, job="j1")
    led.add(step="script", type_="llm", cost_usd=0.1, subscription=True)
    with led.path.open("a") as f:
        f.write('{"ts": "2026-01-01", "cost_usd": 9')            # truncated by a hard stop
    assert len(led.lines()) == 2
    assert led.total() == 0.35 and led.total("gpu") == 0.25
    assert [l["step"] for l in led.subscription_calls()] == ["script"]


def test_daily_cap_default_env_and_garbage(monkeypatch):
    assert costs.daily_cap() == 3.0
    monkeypatch.setenv("REELFORGE_GPU_DAILY_CAP", "1.5")
    assert costs.daily_cap() == 1.5
    for bad in ("lots", "-2"):
        monkeypatch.setenv("REELFORGE_GPU_DAILY_CAP", bad)
        assert costs.daily_cap() == 3.0


def test_cap_counts_today_only_and_gpu_only(tmp_path, monkeypatch):
    monkeypatch.setenv("REELFORGE_GPU_LEDGER", str(tmp_path / "ledger.jsonl"))
    led = costs.Ledger(costs.gpu_ledger_path())
    old = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(timespec="seconds")
    led.path.write_text(json.dumps({"ts": old, "type": "gpu", "cost_usd": 50.0}) + "\n")
    led.add(step="x", type_="llm", cost_usd=50.0)
    assert costs.gpu_spend_today() == 0.0
    costs.check_gpu_budget(2.9)
    with pytest.raises(costs.BudgetExceeded, match="REELFORGE_GPU_DAILY_CAP"):
        costs.check_gpu_budget(3.1)
    led.add(step="voice", type_="gpu", cost_usd=2.5)
    with pytest.raises(costs.BudgetExceeded):
        costs.check_gpu_budget(0.6)
    costs.check_gpu_budget(0.4)


def test_default_ledger_lives_in_the_config_dir(isolated_env):
    assert costs.gpu_ledger_path() == isolated_env / ".config" / "reelforge" / "gpu-spend.jsonl"


def test_billing_factor_and_pricing():
    assert pricing.BILLING_FACTOR == 1.9 and costs.BILLING_FACTOR == 1.9
    assert pricing.dollars_per_hour("NVIDIA RTX A4500") == 0.58
    assert pricing.dollars_per_hour("NVIDIA GeForce RTX 4090") == 1.34
    assert pricing.dollars_per_hour("?") == pricing.DEFAULT_RATE == pricing.dollars_per_hour("")
    assert pricing.estimate("NVIDIA RTX A4500", 3600) == round(0.58 * 1.9, 5)
    assert pricing.estimate("NVIDIA RTX A4500", 3600, factor=1.0) == 0.58


def test_gpu_journal_writes_both_ledgers_without_secrets(tmp_path, monkeypatch):
    monkeypatch.setenv("REELFORGE_GPU_LEDGER", str(tmp_path / "machine.jsonl"))
    reel = costs.Ledger(tmp_path / "reel" / "costs.jsonl")
    res = Result(output={"gpu": "NVIDIA RTX A4500"}, job="job-1", queue_s=1.5, compute_s=36.0, total_s=40.0, function="voice")
    costs.gpu_journal(reel, "voice")("voice", res)
    expected = pricing.estimate("NVIDIA RTX A4500", 36.0)
    for led in (reel, costs.Ledger(tmp_path / "machine.jsonl")):
        (line,) = led.lines()
        assert line["type"] == "gpu" and line["step"] == "voice" and line["cost_usd"] == expected
        assert line["job"] == "job-1" and line["estimated"] is True and line["function"] == "voice"
    costs.gpu_journal(None, "x")("voice", res)                   # no reel ledger: machine ledger only
    assert len(costs.Ledger(tmp_path / "machine.jsonl").lines()) == 2
    assert len(reel.lines()) == 1


def test_llm_cost_unknown_model_is_priced_highest():
    class U:
        input_tokens, output_tokens = 1_000_000, 1_000_000
    assert costs.llm_cost("claude-haiku-5-5", U) == 0.6
    assert costs.llm_cost("some-future-model", U) == 24.0
