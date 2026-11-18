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


@pytest.fixture
def reference_voice(root):
    """A reference voice (1 s sine) and its transcript in the throw-away repository root."""
    import numpy as np
    import soundfile as sf
    folder = root / "voice-reference"
    folder.mkdir()
    sf.write(folder / "reference.wav", (0.1 * np.sin(np.arange(24000) / 9.0)).astype("float32"), 24000, subtype="PCM_16")
    (folder / "reference.txt").write_text("This is the reference sentence.\n", encoding="utf-8")
    return folder


@pytest.fixture
def made_script(root):
    """A reel with brief and script written by the stub LLM."""
    from reelforge import script as script_mod
    reel = script_mod.new("A test topic", "test-topic")
    script_mod.run(reel)
    return reel
