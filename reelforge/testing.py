"""Shared test helpers: a fake RunPod with no network, and pytest fixtures.

In a conftest.py:    pytest_plugins = ["reelforge.testing"]

Fixtures: isolated_env (autouse), fake_runpod, fake_voice. None of them touches the network. This module imports pytest, so
the package itself never imports it.
"""

from __future__ import annotations

import base64
import io
import json
import urllib.error
from typing import Callable

import numpy as np
import pytest
import soundfile as sf

KEY = "rpa_TESTFAKEKEY0123456789"
SECONDS_PER_WORD = 0.35


class Response:
    def __init__(self, body):
        self._body = json.dumps(body).encode()

    def read(self, n=-1):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class FakeRunPod:
    """Each job goes IN_QUEUE, then IN_PROGRESS, then COMPLETED; `output(function, request)` builds the output."""

    def __init__(self, output, steps=2, http_failures=0, stuck=False, key=KEY):
        self.output, self.steps, self.http_failures, self.stuck, self.key = output, steps, http_failures, stuck, key
        self.jobs: dict[str, dict] = {}
        self.requests: list = []
        self.cancelled: list[str] = []

    def __call__(self, req, timeout=None):
        self.requests.append(req)
        assert req.headers["Authorization"] == f"Bearer {self.key}"
        if self.http_failures:
            self.http_failures -= 1
            raise urllib.error.HTTPError(req.full_url, 503, "busy", {}, io.BytesIO(b"overloaded"))
        path = req.full_url.split("/flash/")[1]
        function = req.headers["X-flash-endpoint"]
        if path == "run":
            request = json.loads(req.data)["input"]["request"]
            jid = f"job-{len(self.jobs)}"
            self.jobs[jid] = {"n": 0, "function": function, "request": request}
            return Response({"id": jid, "status": "IN_QUEUE"})
        if path.startswith("cancel/"):
            self.cancelled.append(path.split("/")[1])
            return Response({"status": "CANCELLED"})
        jid = path.split("/")[1]
        j = self.jobs[jid]
        j["n"] += 1
        if self.stuck or j["n"] <= self.steps:
            return Response({"id": jid, "status": "IN_PROGRESS" if j["n"] > 1 else "IN_QUEUE"})
        return Response({"id": jid, "status": "COMPLETED", "delayTime": 1500, "executionTime": 4200,
                         "output": self.output(j["function"], j["request"])})


def client(fake, **kw):
    """GPUClient wired to `fake`, with a simulated clock (no real waiting)."""
    from .gpu.client import GPUClient
    t = [0.0]

    def clock():
        return t[0]

    def sleep(s):
        t[0] += s

    return GPUClient(kw.pop("key", getattr(fake, "key", KEY)), opener=fake, sleep=sleep, clock=clock, **kw)


def flac(duration=0.5, rate=24000):
    buf = io.BytesIO()
    sf.write(buf, 0.1 * np.sin(np.arange(int(duration * rate)) / 9.0), rate, format="FLAC", subtype="PCM_16")
    return buf.getvalue()


def _segment(request_segment: dict, duration: float) -> dict:
    return {"audio_b64": base64.b64encode(flac(duration)).decode(), "sample_rate": 24000, "duration_s": duration,
            "compute_s": 1.0, "seed": request_segment.get("seed"), "cap_reached": False, "audio_dropped": False}


def duration_for_text(text: str) -> float:
    """Simulated duration of a text: SECONDS_PER_WORD per word, at least 0.2 s."""
    return max(0.2, len(text.split()) * SECONDS_PER_WORD)


def fixed_voice_output(duration: float = 0.5) -> Callable[[str, dict], dict]:
    def output(function, request):
        return {"ok": True, "segments": [_segment(s, duration) for s in request["segments"]], "gpu": "NVIDIA RTX A4500"}
    return output


def voice_output(function, request):
    """Output of the voice functions: one 24 kHz FLAC per segment, duration proportional to the number of words."""
    if function == "voice_design":
        cands = [_segment({"seed": g}, duration_for_text(request["text"])) for g in request.get("seeds") or [0]]
        return {"ok": True, "candidates": cands, "gpu": "NVIDIA RTX A4500"}
    segs = [_segment(s, duration_for_text(s["text"])) for s in request["segments"]]
    return {"ok": True, "segments": segs, "gpu": "NVIDIA RTX A4500"}


# --- pytest fixtures ---------------------------------------------------------------------------------------------------

def _to_clear(name: str) -> bool:
    return name.startswith(("REELFORGE_", "ANTHROPIC", "USINE_")) or name in ("RUNPOD_API_KEY", "RUNPOD_ENDPOINT_BASE_URL")


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch, tmp_path_factory):
    """No REELFORGE_*, RUNPOD_*, ANTHROPIC* variable of the machine leaks into a test; the home directory is a fake one
    (the real ~/.config/reelforge is never read, the real GPU ledger never written)."""
    import os
    for name in [n for n in os.environ if _to_clear(n)]:
        monkeypatch.delenv(name, raising=False)
    home = tmp_path_factory.mktemp("home")
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(home / ".config"))
    return home


@pytest.fixture
def fake_runpod(monkeypatch, isolated_env):
    """Install a FakeRunPod (fake voice outputs) and a fake key: every GPUClient() created during the test talks to the
    fake, without waiting. `fake_runpod.output` can be replaced; `.requests/.jobs/.cancelled` tell what happened."""
    from .gpu.client import GPUClient
    fake = FakeRunPod(voice_output)
    monkeypatch.setenv("RUNPOD_API_KEY", KEY)
    original = GPUClient.__init__

    def init(self, *args, **kw):
        t = [0.0]
        kw.setdefault("opener", fake)
        kw.setdefault("sleep", lambda s: t.__setitem__(0, t[0] + s))
        kw.setdefault("clock", lambda: t[0])
        original(self, *args, **kw)

    monkeypatch.setattr(GPUClient, "__init__", init)
    return fake


@pytest.fixture
def fake_voice(fake_runpod):
    """The voice functions return 24 kHz FLACs whose duration is proportional to the word count (SECONDS_PER_WORD)."""
    fake_runpod.output = voice_output
    return fake_runpod


# --- fake speech recognition -----------------------------------------------------------------------------------------------

class FakeWhisper:
    """Stands for the recognition engine (no model, no download). Given the texts the audio can contain, it answers with the
    words of the text whose simulated duration (SECONDS_PER_WORD per word, as in ``voice_output``) is the closest to the
    duration of the audio file, or of all the texts together, spread evenly over the file. ``fixed``: words returned as they
    are (a list of ``recognition.Word``), whatever the audio. ``calls`` counts the transcriptions."""

    def __init__(self, texts: list[str] | None = None, fixed: list | None = None):
        self.texts = list(texts or [])
        self.fixed = fixed
        self.calls = 0

    def __call__(self, path, language, model):
        from .recognition import Word
        self.calls += 1
        if self.fixed is not None:
            return list(self.fixed)
        info = sf.info(str(path))
        duration = info.frames / info.samplerate
        candidates = [t.split() for t in self.texts]
        if len(candidates) > 1:
            candidates.append([w for c in candidates for w in c])
        if not candidates:
            return []
        words = min(candidates, key=lambda c: abs(len(c) * SECONDS_PER_WORD - duration))
        step = duration / max(len(words), 1)
        return [Word(w, i * step, (i + 1) * step) for i, w in enumerate(words)]


@pytest.fixture
def fake_whisper(monkeypatch):
    """Replace the local recognition engine by a ``FakeWhisper`` (set ``.texts`` or ``.fixed`` in the test)."""
    from . import recognition
    fake = FakeWhisper()
    monkeypatch.setattr(recognition, "local_engine", fake)
    return fake
