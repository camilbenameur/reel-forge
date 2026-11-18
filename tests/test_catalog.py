import json
import shutil

import pytest

from reelforge import catalog, config

pytestmark_node = pytest.mark.skipif(shutil.which("node") is None, reason="node absent")


def test_load_and_describe(root):
    cat = catalog.load()
    assert "stop-stamp" in cat and cat["stop-stamp"]["cues"]
    assert "stop-stamp" in catalog.describe(cat)


def test_load_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("REELFORGE_ROOT", str(tmp_path))
    assert catalog.load() is None


def test_load_accepts_plain_list(tmp_path):
    p = tmp_path / "c.json"
    p.write_text(json.dumps([{"type": "a", "description": "d", "exampleProps": {}, "cues": []}]))
    assert list(catalog.load(p)) == ["a"]


@pytestmark_node
def test_export_readme_fallback(tmp_path, monkeypatch):
    scenes = tmp_path / "studio" / "src" / "scenes"
    (scenes / "a").mkdir(parents=True)
    (scenes / "a" / "README.md").write_text("- `step-card` — Numbered step card\n| `stop-stamp` | A STOP stamp |\n",
                                            encoding="utf-8")
    monkeypatch.setenv("REELFORGE_ROOT", str(tmp_path))
    catalog.export()
    data = json.loads(config.paths().catalog.read_text(encoding="utf-8"))
    assert data["source"] == "readme"
    assert [s["type"] for s in data["scenes"]] == ["step-card", "stop-stamp"]


@pytestmark_node
def test_export_without_any_source_fails_clearly(tmp_path, monkeypatch):
    (tmp_path / "studio").mkdir()
    monkeypatch.setenv("REELFORGE_ROOT", str(tmp_path))
    with pytest.raises(catalog.ReelError, match="catalog export failed"):
        catalog.export()
