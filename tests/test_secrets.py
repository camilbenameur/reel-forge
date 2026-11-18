import os

from reelforge import secrets


def write(path, content: bytes | str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content if isinstance(content, bytes) else content.encode())
    return path


def test_nothing_loaded_at_import():
    import importlib
    importlib.reload(secrets)
    assert "RUNPOD_API_KEY" not in os.environ


def test_parsing_quotes_comments_export_crlf_bom(tmp_path):
    f = write(tmp_path / "x.env", b"\xef\xbb\xbf# c\r\nA=1\r\nexport B = 'two words'\r\nC=\"3\" \r\nD=4 # trailing\r\n\r\nbad line\r\n")
    assert secrets.read_env_file(f) == {"A": "1", "B": "two words", "C": "3", "D": "4"}
    assert secrets.read_env_file(tmp_path / "absent.env") == {}


def test_crlf_never_ends_up_in_a_value(tmp_path):
    env: dict[str, str] = {}
    secrets.load(write(tmp_path / ".env", b"RUNPOD_API_KEY=rpa_abc\r\n"), shared=False, environ=env)
    assert env["RUNPOD_API_KEY"] == "rpa_abc"


def test_precedence_environment_then_repo_then_shared_then_legacy(tmp_path, isolated_env):
    repo = write(tmp_path / ".env", "A=repo\nB=repo\n")
    write(secrets.shared_file(), "A=shared\nB=shared\nC=shared\n")
    write(secrets.legacy_file(), "A=legacy\nB=legacy\nC=legacy\nD=legacy\n")
    env = {"A": "process"}
    added = secrets.load(repo, environ=env)
    assert env == {"A": "process", "B": "repo", "C": "shared", "D": "legacy"}
    assert sorted(added) == ["B", "C", "D"]          # names only, never values


def test_shared_file_override_and_default_location(tmp_path, monkeypatch, isolated_env):
    assert secrets.shared_file() == isolated_env / ".config" / "reelforge" / "secrets.env"
    custom = write(tmp_path / "custom.env", "X=1\n")
    monkeypatch.setenv("REELFORGE_SECRETS", str(custom))
    env: dict[str, str] = {}
    secrets.load(environ=env)
    assert env == {"X": "1"}


def test_legacy_key_name_is_mapped(isolated_env):
    write(secrets.legacy_file(), "USINE_ANTHROPIC_API_KEY=sk-legacy-value\n")
    env: dict[str, str] = {}
    secrets.load(environ=env)
    assert env == {"REELFORGE_ANTHROPIC_API_KEY": "sk-legacy-value"}


def test_empty_value_never_overrides(tmp_path):
    env = {"A": ""}
    secrets.load(write(tmp_path / ".env", "A=\nB=\n"), shared=False, environ=env)
    assert env == {"A": ""}
    secrets.load(write(tmp_path / "2.env", "A=filled\n"), shared=False, environ=env)
    assert env["A"] == "filled"


def test_mask_and_redact_never_leak():
    key = "rpa_SUPERSECRETVALUE1234567890"
    assert secrets.mask(None) == "(absent)"
    assert key not in secrets.mask(key) and secrets.mask(key).endswith(f"({len(key)})")
    env = {"RUNPOD_API_KEY": key, "REELFORGE_ANTHROPIC_API_KEY": "sk-ant-zzzzzzzzzzzz", "MODE": "plain-value-visible"}
    out = secrets.redact(f"HTTP error with {key} and sk-ant-zzzzzzzzzzzz and plain-value-visible", env)
    assert key not in out and "sk-ant-zzzzzzzzzzzz" not in out and "plain-value-visible" in out
    assert secrets.is_sensitive("RUNPOD_API_KEY") and not secrets.is_sensitive("REELFORGE_LLM")
