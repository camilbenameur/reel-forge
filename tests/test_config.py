import pytest

from reelforge import config


def test_defaults_are_safe():
    assert config.llm_provider() == "stub"
    assert config.voice_provider() == "stub"
    assert config.language() == "en"
    assert config.llm_budget() == 5.0


def test_environment_overrides(monkeypatch):
    monkeypatch.setenv("REELFORGE_LLM", "API")
    monkeypatch.setenv("REELFORGE_LANGUAGE", "fr")
    monkeypatch.setenv("REELFORGE_LLM_BUDGET", "off")
    assert config.llm_provider() == "api"
    assert config.language() == "fr"
    assert config.llm_budget() is None
    assert config.language("en") == "en"


@pytest.mark.parametrize("name,value,call", [("REELFORGE_LLM", "gpt", config.llm_provider),
                                              ("REELFORGE_LANGUAGE", "de", config.language),
                                              ("REELFORGE_LLM_BUDGET", "lots", config.llm_budget),
                                              ("REELFORGE_VOICE", "sapi", config.voice_provider)])
def test_bad_values_name_the_setting(monkeypatch, name, value, call):
    monkeypatch.setenv(name, value)
    with pytest.raises(config.ConfigError):
        call()


def test_paths_follow_root(root):
    p = config.paths()
    assert p.root == root.resolve()
    assert p.catalog == root.resolve() / "studio" / "scenes.catalog.json"
    assert p.brand.name == "brand.yaml"


def test_init_env_is_explicit(root, monkeypatch):
    (root / ".env").write_text("REELFORGE_LLM=api\r\n", encoding="utf-8")
    assert config.llm_provider() == "stub"          # nothing loaded at import or by reading a setting
    assert config.init_env() == ["REELFORGE_LLM"]
    assert config.llm_provider() == "api"


def test_llm_budget_zero_forbids_spend_and_only_off_removes_the_cap(monkeypatch):
    monkeypatch.setenv("REELFORGE_LLM_BUDGET", "0")
    assert config.llm_budget() == 0.0
    for off in ("off", "no", "none"):
        monkeypatch.setenv("REELFORGE_LLM_BUDGET", off)
        assert config.llm_budget() is None
    for bad in ("-1", "-0.5", "nan", "inf"):
        monkeypatch.setenv("REELFORGE_LLM_BUDGET", bad)
        with pytest.raises(config.ConfigError):
            config.llm_budget()
