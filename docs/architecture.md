# Architecture

## Two halves, one contract

- **`reelforge/`** (Python) does everything that is judgement, I/O or money: writing the script, synthesising and checking the
  voice, aligning words, deriving mouth shapes, building the timeline, calling the renderer, checking the result, packaging.
- **`studio/`** (Remotion, React, TypeScript) does one thing: turn a `timeline.json` into frames. It has no network access, no
  randomness and no clock, so the same timeline always gives the same video.

The only interface is `timeline.json`. Its type lives in `studio/src/core/types.ts` (source of truth), is mirrored by
`reelforge/timeline.py`, and is annotated in [timeline-contract.md](timeline-contract.md). A change to one changes all three in
the same commit.

## Pipeline

    new -> script -> [human review] -> voice -> align -> mouth -> timeline -> render -> check -> package

| Step | Reads | Writes | Notes |
|---|---|---|---|
| `new` | topic | `brief.md` | never overwrites an existing brief |
| `script` | brief, scene catalog, language rules | `script.json` | LLM (`stub`/`api`/`claude-code`), validated against `schemas/script.schema.json` |
| `voice` | script, reference voice | `voice.wav`, `voice/takes.json` | providers `gpu` and `stub`; takes cached by reference fingerprint, model, settings and text |
| `align` | `voice.wav`, script | `words.json` | faster-whisper, matched beat by beat to the script words, so spelling and keywords are the script's |
| `mouth` | `words.json`, audio | `mouth.json` | grapheme-to-shape rules per language, modulated by the audio envelope |
| `timeline` | all of the above | `timeline.json` | the contract |
| `render` | `timeline.json` | `render.mp4` | `npx remotion render`, h264 crf 18 |
| `check` | `render.mp4` | `qa/report.md`, contact sheet | objective errors block `package`; model review is advisory |
| `package` | script, render | `caption.txt`, `cover.jpg`, `qa/compliance.md` | AI disclosure computed from the reference voice provenance |

Each step is idempotent and skips itself when its output is newer than its inputs; `--force` redoes it. Steps are modules
`reelforge.<step>` exposing `run(reel, force=False)`, driven by `reelforge/__main__.py`. Step state is kept in the reel's
state file and shown by `status`.

## Gates and spending

- `all` stops after `script`. `continue` revalidates the script fully before any spend.
- The paid step is the GPU voice. It is guarded by the daily cap (`REELFORGE_GPU_DAILY_CAP`, default 3 USD), checked before a
  call is submitted, and by the LLM budget (`REELFORGE_LLM_BUDGET`, default 5 USD per reel).
- Reels written in `claude-code` test mode are flagged not publishable in their state and in `status`.
- Nothing is ever published by the tool.

## Studio

- `core/`: composition (`Reel.tsx`), background, captions, section label, scene host, theme and fonts.
- `scenes/`: the flat illustration library; `scenes.catalog.json` (exported with `catalog --export`) is what the script writer
  may choose from, each scene with its props and cue.
- `avatar/`: the SVG mascot with its poses and mouth shapes (Rhubarb A to H, X).
- `fixtures/demo-timeline.json`: a working example, default props of the `Reel` composition.

Rendering uses fixed IPv4 ports (4310/4311) and `REELFORGE_RENDER_CONCURRENCY` browser tabs (default 2, memory-bound).

## Secrets and configuration

Settings are evaluated when asked for, never at import (`reelforge/config.py`). Secrets are loaded once at CLI start from the
environment, the repository `.env`, `~/.config/reelforge/secrets.env`, then a legacy file; no value is ever printed, logged or
written, and error messages redact them (`reelforge/secrets.py`).

## Costs

Two append-only JSON-lines ledgers: the reel's `costs.jsonl` (per step) and the machine-wide
`~/.config/reelforge/gpu-spend.jsonl` (`REELFORGE_GPU_LEDGER`), which carries the daily cap. GPU costs are estimates: compute
time x card rate x the measured billing factor 1.9 (`reelforge/gpu/pricing.py`). The real bill is read with
`python -m reelforge gpu balance`.

## Tests

The suite is offline: GPU, LLM and recognition are replaced by fakes (`reelforge/testing.py`). Run one pytest at a time.
