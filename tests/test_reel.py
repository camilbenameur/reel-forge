import json
from datetime import date

import pytest

from reelforge import reel as r


def test_slugify():
    assert r.slugify("Pourquoi l'été ? Ça dépend !") == "pourquoi-l-ete-ca-depend"
    assert r.slugify("???") == "reel"
    assert len(r.slugify("a" * 100)) == 48


def test_atomic_json_roundtrip(tmp_path):
    p = tmp_path / "sub" / "a.json"
    r.write_json(p, {"é": 1})
    assert p.read_text(encoding="utf-8") == '{\n  "é": 1\n}\n'
    assert r.read_json(p) == {"é": 1}
    assert not [f for f in p.parent.iterdir() if f.name.endswith(".tmp")]
    assert r.read_json(tmp_path / "nope.json", default=None) is None
    with pytest.raises(OSError):
        r.read_json(tmp_path / "nope.json")


def test_fingerprint_is_typed_and_tracks_content(tmp_path):
    assert r.fingerprint(b"ab", b"c") != r.fingerprint(b"a", b"bc")
    f = tmp_path / "x"
    absent = r.fingerprint(f)
    f.write_text("1")
    one = r.fingerprint(f)
    f.write_text("2")
    assert len({absent, one, r.fingerprint(f)}) == 3


def test_create_and_find(root):
    a = r.create("Topic A", today=date(2026, 1, 2))
    b = r.create("Topic B", today=date(2026, 1, 3))
    for x in (a, b):
        x.folder.mkdir(parents=True)
        x.path("brief.md").write_text("b")
    assert a.name == "2026-01-02-topic-a"
    assert r.find().name == b.name and r.find("latest").name == b.name
    assert r.find("topic-a").name == a.name
    assert r.find(a.name).name == a.name
    assert r.find(str(a.folder)).folder == a.folder.resolve()
    with pytest.raises(r.ReelError, match="ambiguous"):
        r.find("topic")
    with pytest.raises(r.ReelError, match="not found"):
        r.find("zzz")


def test_find_without_reels(root):
    with pytest.raises(r.ReelError):
        r.find()


def test_freshness_by_fingerprint(root):
    reel = r.create("t")
    reel.folder.mkdir(parents=True)
    src, out = reel.path("brief.md"), reel.path("script.json")
    src.write_text("one")
    out.write_text("{}")
    reel.mark(out, src)
    assert reel.is_fresh(out, src)
    src.write_text("two")
    assert not reel.is_fresh(out, src)
    assert json.loads(reel.path("state.json").read_text())["fingerprints"]["script.json"]


def test_freshness_adopts_reel_without_fingerprints(root):
    reel = r.create("t")
    reel.folder.mkdir(parents=True)
    src, out = reel.path("brief.md"), reel.path("script.json")
    src.write_text("one")
    out.write_text("{}")
    assert reel.is_fresh(out, src)                 # dates rule, then adopted
    assert reel.state["fingerprints"]["script.json"]


def test_subscription_mark(root):
    reel = r.create("t")
    reel.folder.mkdir(parents=True)
    assert not reel.subscription
    reel.mark_subscription("script")
    reel.mark_subscription("script")
    assert reel.state["llm_subscription"] == ["script"] and reel.subscription


def test_slugify_cuts_on_a_word_boundary():
    slug = r.slugify("comment les freelances automatisent la facturation")
    assert slug == "comment-les-freelances-automatisent-la"
    assert len(slug) <= 48
    assert r.slugify("x" * 60 + " tail") == "x" * 48          # no boundary to cut on: hard cut
    assert r.slugify("a" * 47 + " b") == "a" * 47              # exact boundary
