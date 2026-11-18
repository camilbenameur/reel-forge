# reelforge

Turns a brief into a vertical short video (1080x1920, 30 fps, 38 to 55 s): cream dotted paper background, a mono section label
and counter, word-by-word captions with 3 to 6 accent keywords, one flat illustration per beat, a 2D SVG mascot with lip-sync,
and a "comment a word" call to action in the last seconds. Reel language is `en` (default) or `fr`.

A Python package (`reelforge`) orchestrates; a Remotion project (`studio/`) renders. The only contract between them is
`timeline.json` ([docs/timeline-contract.md](docs/timeline-contract.md)).

## Install

Linux, Python 3.11+, Node 20+, ffmpeg.

    python -m venv .venv && . .venv/bin/activate
    pip install -e '.[quality,recognition,llm,test]'     # add ',deploy' to deploy the GPU worker
    (cd studio && npm ci --ignore-scripts)
    cp .env.example .env                                 # then fill in the names you need

## Settings

Environment variables, read when asked for (see `.env.example` and the docstring of `reelforge/config.py`). Secrets come from
the environment, then the repository `.env`, then `~/.config/reelforge/secrets.env`; they are never printed or logged.

| Variable | Meaning |
|---|---|
| `REELFORGE_LLM` | `stub` (default, fixtures) / `api` (publishable) / `claude-code` (test only, reel flagged not publishable) |
| `REELFORGE_ANTHROPIC_API_KEY` | key for `api` mode |
| `REELFORGE_LLM_BUDGET` | LLM cap per reel in USD (default 5; `0` forbids spending; `off` removes the cap) |
| `REELFORGE_VOICE` | `stub` (default) / `gpu` |
| `RUNPOD_API_KEY` | RunPod key for the GPU voice |
| `REELFORGE_GPU_DAILY_CAP` | daily GPU cap in USD (default 3); a call is refused BEFORE submission if its estimate would pass it |
| `REELFORGE_LANGUAGE` | default reel language |

## Flow

    python -m reelforge all "How freelancers automate invoicing"     # new -> script, then STOPS for review
    $EDITOR reels/<date>-<slug>/script.json                          # the human review gate
    python -m reelforge continue                                     # voice -> align -> mouth -> timeline -> render -> check -> package

`all --approve-script` does not stop. Every step is idempotent (`--force` redoes it) and can be run alone:
`new`, `script`, `voice`, `align`, `mouth`, `timeline`, `render`, `check`, `package`, `status`, `catalog`.
Each reel lives in `reels/<date>-<slug>/` (`brief.md`, `script.json`, `voice.wav`, `words.json`, `mouth.json`, `timeline.json`,
`render.mp4`, `qa/report.md`, `caption.txt`, `cover.jpg`, `costs.jsonl`).

`check` errors (frozen image, wrong dimensions, no audio) are blocking: `continue` stops before `package` and `check` exits non-zero.
The generated `qa/compliance.md` lists what the publisher must tick by hand (AI label, voice consent, licences, caption).

## GPU voice

One RunPod serverless app, `reelforge-voice` (`workers/voice/app.py`): `voice` (Qwen3-TTS 12Hz 1.7B Base cloning) and
`voice_design` (Qwen3-TTS VoiceDesign).

    python -m reelforge gpu deploy      # needs the RunPod SDK ('.[deploy]') and RUNPOD_API_KEY
    python -m reelforge design-voice    # invent the reference voice, see voice-reference/README.md
    python -m reelforge voice --provider gpu
    python -m reelforge gpu status | balance | costs | stop

Jobs are cancelled on timeout, polling failure or Ctrl-C. Every job that ends (completed, failed, timed out, cancelled) is logged
to the reel's `costs.jsonl` and to the machine-wide ledger (`~/.config/reelforge/gpu-spend.jsonl`) that carries the daily cap.

## Tests

    OMP_NUM_THREADS=2 python -m pytest -q -p no:cacheprovider --timeout=300
    (cd studio && npx tsc --noEmit)

No test touches the network.
