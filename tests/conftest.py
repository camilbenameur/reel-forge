"""Common fixtures: fake RunPod and isolated environment (no network, no key or file of the machine)."""

pytest_plugins = ["reelforge.testing"]

import shutil
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[1]


@pytest.fixture
def root(tmp_path, monkeypatch):
    """A throw-away repository root holding a copy of the real scene catalog."""
    (tmp_path / "studio").mkdir()
    shutil.copy(REPO / "studio" / "scenes.catalog.json", tmp_path / "studio" / "scenes.catalog.json")
    monkeypatch.setenv("REELFORGE_ROOT", str(tmp_path))
    return tmp_path
