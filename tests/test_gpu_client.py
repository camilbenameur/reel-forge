"""GPU client, voice client and management CLI, with no network: the fake RunPod of reelforge.testing."""

import base64
import importlib.util
import io
import json
import sys
import types
import urllib.error
from pathlib import Path

import numpy as np
import pytest
import soundfile as sf

from reelforge import costs
from reelforge.gpu import __main__ as gpu_cli
from reelforge.gpu import voice as gv
from reelforge.gpu.client import GPUClient, GPUError
from reelforge.testing import KEY, FakeRunPod, client, fixed_voice_output, flac, voice_output


def make(output=voice_output, **kw):
    fake = FakeRunPod(output, **{k: v for k, v in kw.items() if k in ("steps", "http_failures", "stuck", "failure_code", "final_status")})
    return fake, client(fake)


def write_reference(folder: Path, text="Hello, this is an invented voice for the tests."):
    folder.mkdir(parents=True, exist_ok=True)
    x = (0.2 * np.sin(2 * np.pi * 200 * np.arange(24000) / 24000)).astype(np.float32)
    sf.write(folder / "reference.wav", x, 24000, subtype="PCM_16")
    (folder / "reference.txt").write_text(text + "\n", encoding="utf-8")
    return types.SimpleNamespace(ref=gv.Reference.from_files(folder / "reference.wav", folder / "reference.txt"))


# --- HTTP client --------------------------------------------------------------------------------------------------------

def test_routing_headers_and_payload():
    fake, c = make()
    res = c.call("voice", {"segments": [{"text": "one two", "seed": 1}]})
    assert res.output["ok"] and res.job == "job-0" and res.queue_s == 1.5 and res.compute_s == 4.2
    run = fake.requests[0]
    assert run.full_url == "https://api.runpod.ai/v2/flash/run" and run.get_method() == "POST"
    h = {k.lower(): v for k, v in run.header_items()}
    assert h["x-flash-app"] == "reelforge-voice" and h["x-flash-endpoint"] == "voice"
    assert h["x-flash-environment"] == "default" and h["authorization"] == f"Bearer {KEY}"
    assert json.loads(run.data) == {"input": {"request": {"segments": [{"text": "one two", "seed": 1}]}}}
    assert fake.requests[1].full_url.endswith("/flash/status/job-0")


def test_app_override_and_environment(monkeypatch):
    monkeypatch.setenv("REELFORGE_GPU_APP_VOICE", "copy-app")
    monkeypatch.setenv("REELFORGE_GPU_ENV", "staging")
    fake, c = make()
    c.call("voice", {"segments": [{"text": "a"}]})
    h = {k.lower(): v for k, v in fake.requests[0].header_items()}
    assert h["x-flash-app"] == "copy-app" and h["x-flash-environment"] == "staging"


def test_missing_key_is_a_fixable_error():
    with pytest.raises(GPUError, match="RUNPOD_API_KEY") as e:
        GPUClient()
    assert e.value.fixable


def test_transient_errors_are_retried():
    fake, c = make(http_failures=2, failure_code=429)              # submission: only 429 is repeated
    assert c.call("voice", {"segments": [{"text": "a"}]}).output["ok"]


def test_polling_retries_5xx():
    fake = FakeRunPod(voice_output)
    c = client(fake)
    job = c.submit("voice", {"segments": [{"text": "a"}]})
    fake.http_failures, fake.failure_code = 2, 503
    assert c.wait("voice", job).output["ok"]


def test_submission_is_not_repeated_after_a_5xx_or_a_timeout():
    for code in (500, 502, 503, 504):
        fake = FakeRunPod(voice_output, http_failures=1, failure_code=code)
        with pytest.raises(GPUError, match=f"HTTP {code}"):
            client(fake).submit("voice", {})
        assert len(fake.requests) == 1 and not fake.jobs               # no second POST: no duplicate job

    calls = []

    def timed_out(req, timeout=None):
        calls.append(1)
        raise TimeoutError("read timed out")
    with pytest.raises(GPUError, match="unreachable"):
        GPUClient(KEY, opener=timed_out, sleep=lambda s: None).submit("voice", {})
    assert len(calls) == 1


def test_submission_is_repeated_when_the_connection_was_refused():
    calls = []

    def refused(req, timeout=None):
        calls.append(1)
        raise urllib.error.URLError(ConnectionRefusedError("refused"))
    with pytest.raises(GPUError, match="unreachable"):
        GPUClient(KEY, opener=refused, sleep=lambda s: None).submit("voice", {})
    assert len(calls) == 5


def test_request_errors_are_never_retried():
    def refuse(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 401, "no", {}, io.BytesIO(b"bad key"))
    c = GPUClient(KEY, opener=refuse, sleep=lambda s: None)
    calls = []
    c._open = lambda req, timeout=None: calls.append(1) or refuse(req)
    with pytest.raises(GPUError, match="HTTP 401") as e:
        c.call("voice", {})
    assert e.value.fixable and e.value.status == 401 and len(calls) == 1


def test_persistent_transient_failure_gives_up():
    fake = FakeRunPod(voice_output, http_failures=99, failure_code=429)
    c = client(fake)
    with pytest.raises(GPUError, match="HTTP 429"):
        c.call("voice", {})
    assert len(fake.requests) == 5


def test_timeout_cancels_the_job_before_raising():
    fake = FakeRunPod(voice_output, stuck=True)
    c = client(fake)
    with pytest.raises(GPUError, match="cancelled") as e:
        c.call("voice", {"segments": [{"text": "a"}]}, timeout_s=30)
    assert fake.cancelled == ["job-0"] and e.value.job == "job-0"


def test_worker_failure_carries_correctable_flag():
    fake, c = make(lambda f, r: {"ok": False, "error": "bad ref", "correctable": True})
    with pytest.raises(GPUError, match="bad ref") as e:
        c.call("voice", {})
    assert e.value.fixable


def test_failed_job_status_and_unexpected_output():
    fake = FakeRunPod(lambda f, r: "not a dict")
    with pytest.raises(GPUError, match="unexpected output"):
        client(fake).call("voice", {})


def test_errors_never_contain_the_key():
    def leaky(req, timeout=None):
        raise urllib.error.HTTPError(req.full_url, 400, "x", {}, io.BytesIO(f"invalid token {KEY}".encode()))
    import os
    os.environ["RUNPOD_API_KEY"] = KEY
    c = GPUClient(KEY, opener=leaky, sleep=lambda s: None)
    with pytest.raises(GPUError) as e:
        c.call("voice", {})
    assert KEY not in str(e.value) and "rpa_" in str(e.value)


def test_call_many_keeps_order_and_cancels_the_rest_on_failure():
    fake, c = make()
    res = c.call_many("voice", [{"segments": [{"text": f"w{i}"}]} for i in range(3)])
    assert [r.job for r in res] == ["job-0", "job-1", "job-2"]

    def sometimes(f, r):
        return {"ok": False, "error": "boom"} if r["segments"][0]["text"] == "bad" else voice_output(f, r)
    fake = FakeRunPod(sometimes)
    c = client(fake)
    with pytest.raises(GPUError, match="boom"):
        c.call_many("voice", [{"segments": [{"text": t}]} for t in ("ok", "bad", "ok2")])
    assert fake.cancelled == ["job-2"]               # job-0 completed and job-1 failed: only the one still running is cancelled


def test_journal_gets_every_job():
    seen = []
    fake = FakeRunPod(voice_output)
    c = client(fake, journal=lambda fn, res: seen.append((fn, res.job, res.output["gpu"])))
    c.call("voice", {"segments": [{"text": "a"}]})
    assert seen == [("voice", "job-0", "NVIDIA RTX A4500")]


class Journal:
    def __init__(self):
        self.lines = []

    def __call__(self, function, res):
        self.lines.append((function, res.job, res.extra.get("status"), res.compute_s, res.output.get("gpu")))


@pytest.mark.parametrize("status", ["FAILED", "TIMED_OUT", "CANCELLED"])
def test_journal_gets_failed_timed_out_and_cancelled_jobs(status):
    journal = Journal()
    fake = FakeRunPod(lambda f, r: {"error": "boom"}, final_status=status)
    with pytest.raises(GPUError, match=status):
        client(fake, journal=journal).call("voice", {"segments": [{"text": "a"}]})
    assert journal.lines == [("voice", "job-0", status, 4.2, None)]           # executionTime reported by RunPod


def test_timeout_cancels_and_journals_an_elapsed_time_estimate():
    journal = Journal()
    fake = FakeRunPod(voice_output, stuck=True)
    with pytest.raises(GPUError, match="cancelled"):
        client(fake, journal=journal).call("voice", {"segments": [{"text": "a"}]}, timeout_s=30)
    (function, job, status, compute_s, gpu), = journal.lines
    assert (function, job, status, gpu) == ("voice", "job-0", "TIMED_OUT", "?") and compute_s > 30
    assert fake.cancelled == ["job-0"]


def test_journal_estimate_reaches_the_ledgers(tmp_path):
    reel = costs.Ledger(tmp_path / "costs.jsonl")
    fake = FakeRunPod(voice_output, stuck=True)
    c = client(fake, journal=costs.gpu_journal(reel, "voice"))
    with pytest.raises(GPUError):
        c.call("voice", {"segments": [{"text": "a"}]}, timeout_s=30)
    line = reel.lines()[0]
    assert line["status"] == "TIMED_OUT" and line["cost_usd"] > 0 and line["gpu"] == "?"
    assert costs.gpu_spend_today() == line["cost_usd"]


def test_call_many_journals_the_cancelled_siblings_once():
    journal = Journal()

    def sometimes(f, r):
        return {"ok": False, "error": "boom"} if r["segments"][0]["text"] == "bad" else voice_output(f, r)
    fake = FakeRunPod(sometimes)
    c = client(fake, journal=journal)
    with pytest.raises(GPUError, match="boom"):
        c.call_many("voice", [{"segments": [{"text": t}]} for t in ("ok", "bad", "ok2", "ok3")])
    by_job = {j: st for _, j, st, _, _ in journal.lines}
    assert by_job == {"job-0": "COMPLETED", "job-1": "COMPLETED", "job-2": "CANCELLED", "job-3": "CANCELLED"}
    assert len(journal.lines) == 4 and sorted(fake.cancelled) == ["job-2", "job-3"]


def test_polling_failure_cancels_the_job_and_journals_it():
    journal = Journal()
    fake = FakeRunPod(voice_output)
    c = client(fake, journal=journal)
    job = c.submit("voice", {"segments": [{"text": "a"}]})
    fake.http_failures, fake.failure_code = 99, 503          # the network goes down while polling
    with pytest.raises(GPUError, match="HTTP 503") as e:
        c.wait("voice", job)
    assert e.value.job is None and journal.lines[0][1:3] == ("job-0", "CANCELLED")
    # (the cancel request itself failed too: it is best effort, the error raised is the polling one)
    assert len(journal.lines) == 1


def test_keyboard_interrupt_cancels_the_job():
    journal = Journal()
    fake = FakeRunPod(voice_output)
    c = client(fake, journal=journal)

    def interrupted(seconds):
        raise KeyboardInterrupt
    c._sleep = interrupted
    with pytest.raises(KeyboardInterrupt):
        c.call("voice", {"segments": [{"text": "a"}]})
    assert fake.cancelled == ["job-0"] and journal.lines[0][1:3] == ("job-0", "CANCELLED")

    fake2 = FakeRunPod(voice_output)
    c2 = client(fake2)
    c2._sleep = interrupted
    with pytest.raises(KeyboardInterrupt):
        c2.call_many("voice", [{"segments": [{"text": "a"}]}, {"segments": [{"text": "b"}]}])
    assert sorted(fake2.cancelled) == ["job-0", "job-1"]


# --- voice client -------------------------------------------------------------------------------------------------------

def test_job_size_counts_every_segment():
    segs = [gv.Segment("x" * 900, seed=i) for i in range(5)]          # one text, 5 takes
    jobs = gv.split_jobs(segs)
    assert [len(j) for j in jobs] == [2, 2, 1]
    assert all(sum(len(s.text) for s in j) <= gv.MAX_BATCH_CHARS for j in jobs)
    many = [gv.Segment("a", seed=i) for i in range(30)]
    assert [len(j) for j in gv.split_jobs(many)] == [12, 12, 6]
    mixed = [gv.Segment("t" * 1500), gv.Segment("u" * 1500)]
    assert len(gv.split_jobs(mixed)) == 2
    assert gv.split_jobs([]) == []


def test_clone_returns_ordered_takes_and_resamples(tmp_path):
    fake, c = make()
    ref = write_reference(tmp_path).ref
    vc = gv.VoiceClient(c)
    segs = [gv.Segment("one two three", seed=1, temperature=0.9), gv.Segment("four five", seed=2),
            gv.Segment("six", seed=3, top_p=0.8)]
    takes = vc.clone(segs, ref, "en", 3)
    assert [t.seed for t in takes] == [1, 2, 3] and [round(t.duration_s, 2) for t in takes] == [1.05, 0.7, 0.35]
    req = next(iter(fake.jobs.values()))["request"]
    assert req["language"] == "en" and req["batch"] == 3 and req["format"] == "flac"
    assert req["reference"]["text"].startswith("Hello") and req["reference"]["audio_b64"]
    assert req["segments"][0] == {"text": "one two three", "seed": 1, "temperature": 0.9}
    assert req["segments"][2] == {"text": "six", "seed": 3, "top_p": 0.8}
    assert not any(t.cap_reached or t.audio_dropped for t in takes)
    x, sr = sf.read(io.BytesIO(takes[0].wav(48000)))
    assert sr == 48000 and abs(len(x) / sr - 1.05) < 0.01 and sf.info(io.BytesIO(takes[0].wav(48000))).subtype == "PCM_16"
    assert sf.info(io.BytesIO(takes[0].wav())).samplerate == 24000


def test_clone_defaults_to_english_and_batch_from_env(tmp_path, monkeypatch):
    fake, c = make()
    ref = write_reference(tmp_path).ref
    gv.VoiceClient(c).clone([gv.Segment("hello")], ref)
    req = next(iter(fake.jobs.values()))["request"]
    assert req["language"] == "en" and req["batch"] == gv.DEFAULT_BATCH
    monkeypatch.setenv("REELFORGE_VOICE_BATCH", "2")
    gv.VoiceClient(c).clone([gv.Segment("hello again")], ref)
    assert list(fake.jobs.values())[1]["request"]["batch"] == 2


def test_clone_flags_run_on_and_dropped_takes(tmp_path):
    def out(f, r):
        segs = voice_output(f, r)["segments"]
        segs[0]["cap_reached"] = True
        segs[1]["audio_b64"], segs[1]["audio_dropped"] = None, True
        return {"ok": True, "segments": segs, "gpu": "x"}
    fake, c = make(out)
    ref = write_reference(tmp_path).ref
    takes = gv.VoiceClient(c).clone([gv.Segment("a b"), gv.Segment("c d"), gv.Segment("e f")], ref)
    assert takes[0].cap_reached and not takes[0].audio_dropped
    assert takes[1].audio_dropped and takes[1].signal()[0].size == 2400        # 0.1 s of silence at 24 kHz
    assert not takes[1].signal()[0].any()


def test_clone_count_mismatch_is_an_error(tmp_path):
    fake, c = make(lambda f, r: {"ok": True, "segments": [], "gpu": "x"})
    with pytest.raises(GPUError, match="0 takes returned for 1"):
        gv.VoiceClient(c).clone([gv.Segment("a")], write_reference(tmp_path).ref)


def test_clone_with_no_segment_makes_no_call(tmp_path):
    fake, c = make()
    assert gv.VoiceClient(c).clone([], write_reference(tmp_path).ref) == [] and not fake.requests


def test_large_job_is_split_in_several_parallel_jobs(tmp_path):
    fake, c = make(fixed_voice_output(0.3))
    ref = write_reference(tmp_path).ref
    takes = gv.VoiceClient(c).clone([gv.Segment("w", seed=i) for i in range(30)], ref)
    assert len(takes) == 30 and len(fake.jobs) == 3
    assert [t.seed for t in takes] == list(range(30))


def test_design_sends_at_most_eight_seeds(tmp_path):
    fake, c = make()
    cands = gv.VoiceClient(c).design("A calm low voice.", "Some text to say.", seeds=list(range(12)))
    req = next(iter(fake.jobs.values()))["request"]
    assert req["seeds"] == list(range(8)) and req["language"] == "en" and req["format"] == "wav"
    assert req["description"] == "A calm low voice." and len(cands) == 8
    assert fake.jobs["job-0"]["function"] == "voice_design"
    assert gv.VoiceClient(c).design("d", "t")[0].seed == 0


def test_reference_validation_and_fingerprint(tmp_path):
    with pytest.raises(GPUError, match="missing") as e:
        gv.Reference.from_files(tmp_path / "none.wav", "text")
    assert e.value.fixable
    r = write_reference(tmp_path).ref
    (tmp_path / "empty.txt").write_text("  \n")
    with pytest.raises(GPUError, match="empty"):
        gv.Reference.from_files(tmp_path / "reference.wav", tmp_path / "empty.txt")
    other = write_reference(tmp_path / "o", "A different transcript entirely.").ref
    assert r.fingerprint != other.fingerprint and len(r.fingerprint) == 16
    assert r.fingerprint == gv.Reference(r.audio, r.text).fingerprint


def test_jobs_are_logged_per_reel_and_machine_wide_without_secrets(tmp_path, fake_voice):
    reel = tmp_path / "reels" / "2026-11-18-demo"
    ref = write_reference(tmp_path).ref
    vc = gv.VoiceClient(reel_dir=reel, step="voice")           # real GPUClient, fake transport via the fixture
    vc.clone([gv.Segment("one two three four", seed=1)], ref)
    line = json.loads((reel / "costs.jsonl").read_text().splitlines()[0])
    assert line["type"] == "gpu" and line["step"] == "voice" and line["gpu"] == "NVIDIA RTX A4500" and line["cost_usd"] > 0
    assert costs.gpu_spend_today() == line["cost_usd"]
    assert "rpa_" not in (reel / "costs.jsonl").read_text() and "rpa_" not in costs.gpu_ledger_path().read_text()


def test_daily_cap_blocks_before_any_job(tmp_path, fake_voice, monkeypatch):
    costs.Ledger(costs.gpu_ledger_path()).add(step="x", type_="gpu", cost_usd=5.0)
    ref = write_reference(tmp_path).ref
    with pytest.raises(costs.BudgetExceeded):
        gv.VoiceClient(reel_dir=tmp_path).clone([gv.Segment("a")], ref)
    with pytest.raises(costs.BudgetExceeded):
        gv.VoiceClient(reel_dir=tmp_path).design("d", "t")
    assert not fake_voice.jobs
    monkeypatch.setenv("REELFORGE_GPU_DAILY_CAP", "10")
    gv.VoiceClient(reel_dir=tmp_path).clone([gv.Segment("a")], ref)
    assert len(fake_voice.jobs) == 1


def test_daily_cap_counts_the_estimated_cost_of_the_whole_call(tmp_path, fake_voice, monkeypatch):
    ref = write_reference(tmp_path).ref
    spent = costs.gpu_ledger_path()
    costs.Ledger(spent).add(step="x", type_="gpu", cost_usd=2.99)             # 0.01 USD left under the 3 USD cap
    with pytest.raises(costs.BudgetExceeded, match="estimated"):
        gv.VoiceClient(reel_dir=tmp_path).clone([gv.Segment("a")], ref)
    with pytest.raises(costs.BudgetExceeded, match="estimated"):
        gv.VoiceClient(reel_dir=tmp_path).design("d", "t")
    assert not fake_voice.jobs
    many = [gv.Segment("w", seed=i) for i in range(30)]                       # 3 jobs: the estimate grows with the call
    from reelforge.gpu import pricing
    assert pricing.plan_estimate(3, 30) > pricing.plan_estimate(1, 1) > 0 and pricing.plan_estimate(0) == 0
    monkeypatch.setenv("REELFORGE_GPU_LEDGER", str(tmp_path / "other-ledger.jsonl"))
    costs.Ledger(costs.gpu_ledger_path()).add(step="x", type_="gpu", cost_usd=2.80)    # one small call fits, a big one not
    gv.VoiceClient(reel_dir=tmp_path).clone([gv.Segment("a")], ref)
    with pytest.raises(costs.BudgetExceeded):
        gv.VoiceClient(reel_dir=tmp_path).clone(many, ref)


# --- management CLI -----------------------------------------------------------------------------------------------------

def test_cli_deploy_and_stop_use_rp_flash_from_the_worker_dir(monkeypatch):
    calls = []
    monkeypatch.setattr(gpu_cli, "_rp", lambda: "/bin/rp")
    monkeypatch.setattr(gpu_cli.subprocess, "call", lambda cmd, cwd=None: calls.append((cmd, cwd)) or 0)
    assert gpu_cli.main(["deploy"]) == 0 and gpu_cli.main(["stop"]) == 0
    assert calls[0] == (["/bin/rp", "flash", "deploy", "--python-version", "3.12", "--exclude", "sox"], gpu_cli.WORKER_DIR)
    assert calls[1] == (["/bin/rp", "flash", "undeploy", "--app", "reelforge-voice"], gpu_cli.WORKER_DIR)
    assert gpu_cli.WORKER_DIR.name == "voice" and (gpu_cli.WORKER_DIR / "app.py").exists()


def test_cli_balance_and_status_use_graphql(monkeypatch, capsys):
    monkeypatch.setenv("RUNPOD_API_KEY", KEY)
    sent = []

    def opener(req, timeout=None):
        sent.append(json.loads(req.data)["query"])
        data = ({"myself": {"clientBalance": 12.345}} if "currentSpendPerHr" not in sent[-1] else
                {"myself": {"clientBalance": 12.0, "currentSpendPerHr": 0.0, "pods": [
                    {"id": "p1", "name": "forgotten", "desiredStatus": "RUNNING", "costPerHr": 0.5}],
                    "endpoints": [{"id": "e", "name": "reelforge-voice", "workersMin": 0, "workersMax": 2,
                                   "idleTimeout": 90, "gpuIds": "A4000"}]}})
        return _Ctx(data)
    monkeypatch.setattr(gpu_cli.urllib.request, "urlopen", opener)
    assert gpu_cli.main(["balance"]) == 0
    assert capsys.readouterr().out.strip() in ("12.35 USD", "12.34 USD")
    assert gpu_cli.main(["status"]) == 0
    out = capsys.readouterr().out
    assert "balance: 12.00 USD" in out and "WARNING pod forgotten" in out and "cap 3.00 USD" in out


class _Ctx:
    def __init__(self, data):
        self.data = data

    def read(self):
        return json.dumps({"data": self.data}).encode()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_cli_graphql_error_redacts_the_key(monkeypatch):
    monkeypatch.setenv("RUNPOD_API_KEY", KEY)

    def boom(req, timeout=None):
        raise OSError(f"proxy said {KEY}")
    monkeypatch.setattr(gpu_cli.urllib.request, "urlopen", boom)
    with pytest.raises(SystemExit) as e:
        gpu_cli.main(["balance"])
    assert KEY not in str(e.value) and "rpa_" in str(e.value)


def test_cli_needs_a_key_for_balance():
    with pytest.raises(SystemExit, match="RUNPOD_API_KEY"):
        gpu_cli.main(["balance"])


def test_cli_costs_report(capsys, tmp_path):
    led = costs.Ledger(costs.gpu_ledger_path())
    led.add(step="voice", type_="gpu", cost_usd=0.25, function="voice")
    led.add(step="voice", type_="gpu", cost_usd=0.05, function="voice_design")
    assert gpu_cli.main(["costs", "--days", "3"]) == 0
    out = capsys.readouterr().out
    assert "0.3000 USD" in out and "voice " in out and "0.2500 USD" in out


def test_cli_loads_the_repo_root_env_whatever_the_current_directory(tmp_path, monkeypatch):
    import os
    repo, elsewhere = tmp_path / "repo", tmp_path / "elsewhere"
    repo.mkdir()
    elsewhere.mkdir()
    (repo / ".env").write_text("RUNPOD_API_KEY=rpa_from_repo_env\n")
    (elsewhere / ".env").write_text("RUNPOD_API_KEY=rpa_from_cwd_env\n")
    monkeypatch.setenv("REELFORGE_ROOT", str(repo))
    monkeypatch.chdir(elsewhere)
    assert "RUNPOD_API_KEY" not in os.environ
    gpu_cli.main(["costs"])
    assert os.environ["RUNPOD_API_KEY"] == "rpa_from_repo_env"
    monkeypatch.delenv("RUNPOD_API_KEY")


# --- worker (runpod stubbed: only the pure logic runs) ---------------------------------------------------------------------

@pytest.fixture(scope="module")
def worker():
    stub = types.ModuleType("runpod")

    class App:
        def __init__(self, name):
            self.name = name

        def queue(self, **kw):
            return lambda fn: fn

    class Model:
        def __init__(self, ref):
            self.owner, self.name = ref.split("/")

    stub.App, stub.Model, stub.local_entrypoint = App, Model, lambda fn: fn
    sys.modules["runpod"] = stub
    try:
        spec = importlib.util.spec_from_file_location("voice_worker", gpu_cli.WORKER_DIR / "app.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        yield mod
    finally:
        sys.modules.pop("runpod", None)


def test_worker_app_name_matches_the_client(worker):
    from reelforge.gpu.client import APPS
    assert worker.app.name == APPS["voice"] == APPS["voice_design"]
    assert worker.voice.__name__ == "voice" and worker.voice_design.__name__ == "voice_design"
    assert "NVIDIA RTX A4000" in worker.GPU_VOICE and not any("MIG" in g or "PRO 6000" in g for g in worker.GPU_VOICE)
    assert worker.SCALING == {"scaler_type": "QUEUE_DELAY", "scaler_value": 60} and worker.EXCLUDED_FROM_DEPLOYMENT == gpu_cli.EXCLUDED


def test_worker_token_cap_is_proportional_to_text_and_bounded(worker):
    short, mid, long_ = worker.token_cap("Hi."), worker.token_cap("x" * 120), worker.token_cap("x" * 100000)
    assert short == 96 < mid < long_ == 2048
    assert mid == int(12.5 * 10 * 2.2 + 40)


def test_worker_groups_by_sampling_settings_and_batch_size(worker):
    segs = [{"temperature": 0.9}, {"temperature": 0.9}, {"temperature": 0.5}, {"temperature": 0.9}, {"temperature": 0.9}]
    assert worker._groups(segs, 2) == [[0, 1], [2], [3, 4]]
    assert worker._groups(segs, 1) == [[0], [1], [2], [3], [4]]
    assert worker._options({"temperature": 0.9, "top_k": 40}, 100) == {"max_new_tokens": 100, "temperature": 0.9, "top_k": 40,
                                                                       "do_sample": True}
    assert worker._options({}, 100) == {"max_new_tokens": 100}


def test_worker_lightens_oversized_responses_dropping_run_on_takes_first(worker, monkeypatch):
    monkeypatch.setattr(worker, "RESPONSE_MAX_BYTES", 250)
    mk = lambda dur, cap: {"audio_b64": "a" * 100, "duration_s": dur, "cap_reached": cap, "audio_dropped": False}
    outs = [mk(5, False), mk(30, False), mk(9, True)]
    worker._lighten(outs)
    assert [o["audio_dropped"] for o in outs] == [False, False, True] and outs[2]["audio_b64"] is None
    outs = [mk(5, False), mk(30, False), mk(9, False)]
    worker._lighten(outs)
    assert [o["audio_dropped"] for o in outs] == [False, True, False]


def test_worker_validates_requests_without_a_gpu(worker):
    r = worker.voice({"reference": {"audio_b64": "", "text": ""}, "segments": [{"text": "a"}]})
    assert r["ok"] is False and r["correctable"] is True and "reference.text" in r["error"]
    r = worker.voice({"reference": {"audio_b64": "!!notb64", "text": "t"}, "segments": [{"text": "a"}]})
    assert r["correctable"] and "base64" in r["error"]
    ok_b64 = base64.b64encode(flac()).decode()
    assert "segments" in worker.voice({"reference": {"audio_b64": ok_b64, "text": "t"}, "segments": []})["error"]
    assert "text empty" in worker.voice({"reference": {"audio_b64": ok_b64, "text": "t"}, "segments": [{"text": " "}]})["error"]
    r = worker.voice_design({"description": "", "text": "x"})
    assert r["correctable"] and "required" in r["error"]
    assert worker._language("en") == "English" and worker._language(None) == "English" and worker._language("fr") == "French"
    with pytest.raises(worker.RequestError):
        worker._language("xx")
