import copy
import json

import pytest

from reelforge import catalog, config, script
from reelforge import reel as reel_mod
from reelforge.reel import ReelError

FIX = config.PACKAGE / "fixtures"


def fixture(lang):
    return json.loads((FIX / f"script_stub.{lang}.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("lang", ["en", "fr"])
def test_fixtures_are_valid_against_the_current_catalog(root, lang):
    r = script.validate(fixture(lang), catalog.load())
    assert r.errors == [] and r.warnings == []
    assert 38 <= r.estimated_duration <= 50


def test_schema_errors():
    s = fixture("en")
    del s["cta_word"]
    s["beats"][0]["pose"] = "salut"
    s["extra"] = 1
    s["hashtags"] = ["nohash", "#a", "#b"]
    errs = " | ".join(script.schema_errors(s))
    assert "missing 'cta_word'" in errs and "pose" in errs and "unexpected property 'extra'" in errs and "hashtags/0" in errs
    assert script.schema_errors("nope")


def test_duration_errors_and_warnings():
    s = fixture("en")
    short = copy.deepcopy(s)
    for b in short["beats"]:
        b["text"] = "Short *text* here, comment GUIDE" if b is short["beats"][-1] else "Short text here"
        b["scene"]["cues"] = {}
    assert any("estimated duration" in e for e in script.validate(short).errors)
    assert script.validate(short, duration=False).errors == []


def test_cta_is_required_in_last_beat():
    s = fixture("en")
    s["cta_word"] = "OTHER"
    assert any("call to action" in e for e in script.validate(s).errors)
    s = fixture("fr")
    s["beats"][-1]["text"] = "Teste ça sur ton prochain réel et dis-moi ce qui change, GUIDE."
    assert any("call to action" in e for e in script.validate(s).errors)


def test_unknown_scene_is_error_or_warning(root):
    s = fixture("en")
    s["beats"][0]["scene"]["type"] = "no-such-scene"
    cat = catalog.load()
    assert any("unknown scene type" in e for e in script.validate(s, cat).errors)
    r = script.validate(s, cat, unknown_scenes_are_errors=False)
    assert not r.errors and any("unknown scene type" in w for w in r.warnings)


def test_missing_cue_word_is_an_error():
    s = fixture("en")
    s["beats"][0]["scene"]["cues"] = {"stamp": "absent"}
    assert any("not in the beat text" in e for e in script.validate(s).errors)


def test_cue_hyphen_and_number_fix():
    words = ["It", "took", "twenty-two", "seconds", "and", "22", "more"]
    assert script.find_cue("twenty-two", words) == 2
    assert script.find_cue("twenty", words) == 2            # a part of a hyphenated word
    assert script.find_cue("two seconds", words) == 2       # across the word boundary
    assert script.find_cue("22", words) == 2                # digits match the spelled number
    assert script.find_cue("22 more", words) == 2 or script.find_cue("22 more", words) == 5
    assert script.find_cue("seconds and", words) == 3
    assert script.find_cue("nothing", words) is None
    assert script.find_cue("...", words) is None
    assert script.find_cue("deux", ["vingt-deux", "fois"], "fr") == 0
    assert script.find_cue("22", ["vingt-deux"], "fr") == 0


def test_warnings_for_typography_digits_sections_and_catalog_mismatch(root):
    s = fixture("fr")
    s["beats"][1]["text"] = "Pourquoi ? Parce que 3 raisons."
    s["beats"][1]["scene"]["cues"] = {}
    s["beats"][2]["section"] = "method"
    s["beats"][0]["scene"]["cues"] = {"unlisted": "meurent"}
    s["beats"][0]["scene"]["props"]["bogus"] = 1
    w = " | ".join(script.validate(s, catalog.load()).warnings)
    assert "punctuation" in w and "digits" in w and "section label" in w and "cue(s) unlisted" in w and "bogus" in w


def test_two_night_beats_warn():
    s = fixture("en")
    s["beats"][0]["theme"] = "night"
    assert any("night" in w for w in script.validate(s).warnings)


# --- steps --------------------------------------------------------------------------------------------------------------

def test_new_never_overwrites_brief(root):
    r = script.new("My topic", language="fr")
    r.path("brief.md").write_text("my notes")
    again = script.new("My topic")
    assert again.folder == r.folder and r.path("brief.md").read_text() == "my notes"
    assert r.state["language"] == "fr"


def test_brief_is_english_with_language_line(root):
    r = script.new("Topic")
    text = r.path("brief.md").read_text(encoding="utf-8")
    assert "# Reel brief" in text and "**Language**: English" in text


@pytest.mark.parametrize("lang", ["en", "fr"])
def test_run_stub_writes_validated_script(root, lang):
    r = script.new("Topic", language=lang)
    obj = script.run(r)
    assert obj["language"] == lang and r.path("script.json").is_file()
    assert r.state["script"]["provider"] == "stub" and r.state["script"]["words"] > 100
    assert script.load(r)["title"] == obj["title"]
    script.load_validated(r)


def test_run_skips_when_fresh_and_redoes_when_brief_changes(root):
    r = script.new("Topic")
    script.run(r)
    r.path("script.json").write_text(json.dumps({**fixture("en"), "title": "Edited by hand"}), encoding="utf-8")
    assert script.run(r)["title"] == "Edited by hand"          # fresh: kept
    assert script.run(r, force=True)["title"] != "Edited by hand"
    r.path("brief.md").write_text("new notes")
    r.path("script.json").write_text("{}")                       # stale now
    assert script.run(r)["title"] != "Edited by hand"


def test_run_without_brief(root):
    with pytest.raises(ReelError, match="brief.md missing"):
        script.run(reel_mod.create("x"))


def test_load_validated_refuses_hand_edited_script(root):
    r = script.new("Topic")
    script.run(r)
    s = script.load(r)
    s["beats"][0]["scene"]["cues"] = {"stamp": "not there"}
    r.write(s, "script.json")
    with pytest.raises(ReelError, match="before any spending"):
        script.load_validated(r)
    r.write({"title": "x"}, "script.json")
    with pytest.raises(ReelError, match="invalid"):
        script.load(r)


def test_prompts_are_english_and_filled(root, tmp_path):
    cat = catalog.load()
    system, user = script.build_prompts("BRIEF TEXT", cat, "en", feedback="FEEDBACK\n\n")
    assert "{{" not in system + user
    assert "English" in system and "stop-stamp" in system and "Comment WORD" in system
    assert "BRIEF TEXT" in user and "FEEDBACK" in user
    sys_fr, _ = script.build_prompts("b", None, "fr")
    assert "French" in sys_fr and "U+202F" in sys_fr and "catalog missing" in sys_fr


def test_brand_file_is_optional_and_passed_as_is(root):
    s1, _ = script.build_prompts("b", None, "en")
    assert "brand/brand.yaml is absent" in s1
    (root / "brand").mkdir()
    (root / "brand" / "brand.yaml").write_text("name: Acme\ntone: dry\n", encoding="utf-8")
    s2, _ = script.build_prompts("b", None, "en")
    assert "name: Acme" in s2 and "absent" not in s2


def test_example_brand_is_valid_yaml():
    import yaml
    data = yaml.safe_load((config.DEFAULT_ROOT / "brand" / "brand.example.yaml").read_text(encoding="utf-8"))
    assert data["call_to_action"]["words"]
