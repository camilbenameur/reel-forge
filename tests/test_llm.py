import json
import os
import stat
import sys
from types import SimpleNamespace

import pytest

from reelforge import llm, reel as reel_mod
from reelforge.costs import BudgetExceeded


@pytest.fixture
def reel(root):
    r = reel_mod.create("t")
    r.folder.mkdir(parents=True)
    return r


# --- stub ---------------------------------------------------------------------------------------------------------------

def test_stub_reads_fixture(reel):
    obj = llm.LLM(reel, "script").json(system="s", prompt="p", stub="script_stub.en.json")
    assert obj["cta_word"] == "GUIDE"


def test_stub_errors(reel):
    c = llm.LLM(reel, "script")
    with pytest.raises(llm.LLMError, match="fixture missing"):
        c.json(system="s", prompt="p", stub="nope.json")
    with pytest.raises(llm.LLMError, match="without a fixture name"):
        c.json(system="s", prompt="p")
    with pytest.raises(llm.LLMError, match="outside"):
        c.json(system="s", prompt="p", stub="../config.py")
    with pytest.raises(llm.LLMError, match="invalid JSON output"):
        c.json(system="s", prompt="p", stub="script_stub.en.json", validate=lambda o: ["always wrong"])


def test_extract_json_tolerates_fences_and_prose():
    assert llm.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.extract_json('Here you go: {"a": 1} done') == {"a": 1}
    with pytest.raises(ValueError):
        llm.extract_json("no json")


def test_unknown_provider(monkeypatch):
    with pytest.raises(llm.LLMError):
        llm.LLM(provider="gpt").provider


# --- api ----------------------------------------------------------------------------------------------------------------

class FakeStream:
    def __init__(self, msg):
        self.msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self.msg


class FakeClient:
    def __init__(self, answers, stop="end_turn"):
        self.answers = list(answers)
        self.stop = stop
        self.calls = []
        self.messages = self

    def stream(self, **params):
        self.calls.append(params)
        usage = SimpleNamespace(input_tokens=1000, output_tokens=500, cache_read_input_tokens=0,
                                cache_creation_input_tokens=0)
        msg = SimpleNamespace(content=[SimpleNamespace(type="text", text=self.answers.pop(0))], usage=usage,
                              stop_reason=self.stop, model="claude-opus-5-5")
        return FakeStream(msg)


def test_api_logs_cost_and_retries_with_errors(reel):
    fake = FakeClient(['{"n": 1}', '{"n": 2}'])
    c = llm.LLM(reel, "script", provider="api", client=fake)
    seen = []

    def validate(o):
        seen.append(o["n"])
        return [] if o["n"] == 2 else ["n must be 2"]

    assert c.json(system="sys", prompt="p", validate=validate) == {"n": 2}
    assert seen == [1, 2]
    assert "n must be 2" in fake.calls[1]["messages"][0]["content"]
    lines = reel.ledger.lines()
    assert len(lines) == 2 and all(l["type"] == "llm" and l["cost_usd"] > 0 for l in lines)
    assert not reel.subscription


def test_api_budget_cap(reel):
    fake = FakeClient(['{"n": 1}'] * 3)
    c = llm.LLM(reel, "script", provider="api", client=fake, budget_usd=0.001)
    c.text(system="s", prompt="p")
    with pytest.raises(BudgetExceeded):
        c.text(system="s", prompt="p")


def test_api_stop_reasons(reel):
    with pytest.raises(llm.LLMRefusal):
        llm.LLM(reel, "s", provider="api", client=FakeClient(["x"], "refusal")).text(system="s", prompt="p")
    with pytest.raises(llm.LLMError, match="truncated"):
        llm.LLM(reel, "s", provider="api", client=FakeClient(["x"], "max_tokens")).text(system="s", prompt="p")


def test_api_requires_key(reel):
    with pytest.raises(llm.LLMError, match="REELFORGE_ANTHROPIC_API_KEY"):
        llm.LLM(reel, "s", provider="api").text(system="s", prompt="p")


def test_api_errors_never_leak_the_key(reel, monkeypatch):
    key = "sk-ant-secretsecretsecret123"
    monkeypatch.setenv("REELFORGE_ANTHROPIC_API_KEY", key)

    class Boom(FakeClient):
        def stream(self, **params):
            raise RuntimeError(f"bad auth with {key}")

    with pytest.raises(llm.LLMError) as e:
        llm.LLM(reel, "s", provider="api", client=Boom([])).text(system="s", prompt="p")
    assert key not in str(e.value)


# --- claude-code (a fake binary: nothing real is run) ------------------------------------------------------------------------

FAKE_BIN = """#!{python}
import json, os, sys
mode = os.environ.get("FAKE_MODE", "ok")
if sys.argv[1] == "auth":
    print(json.dumps({{"authMethod": os.environ.get("FAKE_AUTH", "claude.ai")}}))
    sys.exit(0)
prompt = sys.stdin.read()
open(os.environ["FAKE_DUMP"], "w").write(json.dumps({{"env": sorted(os.environ), "argv": sys.argv, "prompt": prompt}}))
if mode == "limit":
    print(json.dumps({{"is_error": True, "subtype": "success", "result": "You hit your usage limit"}}))
elif mode == "login":
    print(json.dumps({{"is_error": True, "subtype": "success", "result": "Not logged in"}}))
else:
    print(json.dumps({{"subtype": "success", "result": '{{"n": 7}}', "usage": {{"input_tokens": 10, "output_tokens": 5}},
                      "total_cost_usd": 0.01}}))
"""


@pytest.fixture
def fake_claude(tmp_path, monkeypatch):
    path = tmp_path / "claude"
    path.write_text(FAKE_BIN.format(python=sys.executable))
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    dump = tmp_path / "dump.json"
    monkeypatch.setenv("CLAUDE_BIN", str(path))
    monkeypatch.setenv("FAKE_DUMP", str(dump))
    monkeypatch.setattr(llm, "_VERIFIED_LOGINS", set())
    return dump


def test_claude_code_flags_the_reel_and_strips_keys(reel, fake_claude, monkeypatch):
    monkeypatch.setenv("REELFORGE_ANTHROPIC_API_KEY", "sk-ant-aaaaaaaaaaaa")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-bbbbbbbbbbbb")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", "tok-login")
    assert llm.LLM(reel, "script", provider="claude-code").json(system="SYS", prompt="hello") == {"n": 7}
    seen = json.loads(fake_claude.read_text())
    assert "REELFORGE_ANTHROPIC_API_KEY" not in seen["env"] and "ANTHROPIC_API_KEY" not in seen["env"]
    assert "CLAUDE_CODE_OAUTH_TOKEN" in seen["env"]            # the login token goes to the binary only
    assert seen["prompt"] == "hello" and "-p" in seen["argv"]
    assert reel.subscription and reel.state["llm_subscription"] == ["script"]
    line = reel.ledger.lines()[0]
    assert line["subscription"] is True and line["cost_usd"] == 0.0 and line["estimated_cost_usd"] == 0.01


def test_claude_code_limit_and_login_errors(reel, fake_claude, monkeypatch):
    c = llm.LLM(reel, "script", provider="claude-code")
    monkeypatch.setenv("FAKE_MODE", "limit")
    with pytest.raises(llm.SubscriptionLimit):
        c.text(system="s", prompt="p")
    monkeypatch.setenv("FAKE_MODE", "login")
    with pytest.raises(llm.LoginError):
        c.text(system="s", prompt="p")
    assert not reel.subscription                                  # nothing consumed, nothing flagged


def test_claude_code_refuses_api_key_login(reel, fake_claude, monkeypatch):
    monkeypatch.setenv("FAKE_AUTH", "api_key")
    with pytest.raises(llm.LLMError, match="not with a login account"):
        llm.LLM(reel, "script", provider="claude-code").text(system="s", prompt="p")


def test_claude_binary_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("CLAUDE_BIN", str(tmp_path / "absent"))
    with pytest.raises(llm.LLMError, match="file not found"):
        llm.find_claude()


def test_claude_env_strips_prefixes(monkeypatch):
    monkeypatch.setenv("CLAUDECODE", "1")
    monkeypatch.setenv("CLAUDE_CODE_USE_BEDROCK", "1")
    monkeypatch.setenv("CLAUDE_CODE_OAUTH_TOKEN", " ")
    env = llm.claude_env()
    assert not [k for k in env if k.startswith(("CLAUDECODE", "CLAUDE_CODE_USE"))]
    assert "CLAUDE_CODE_OAUTH_TOKEN" not in env and env["CLAUDE_CODE_DISABLE_AUTO_MEMORY"] == "1"
