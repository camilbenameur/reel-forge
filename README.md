# reelforge

reelforge turns a one-line brief into a vertical short video (1080x1920, 30 fps, 38 to 55 seconds) in a fixed, recognisable
format, with a human review before anything is spent or published.

A Python package (`reelforge`) orchestrates the work; a Remotion project (`studio/`) renders the pixels. The only contract
between the two is one file, `timeline.json` ([docs/timeline-contract.md](docs/timeline-contract.md)).

## The format

- Cream dotted-paper background (`#F5F3EF`).
- A mono section label at the top left (`// 01 — the hook`) and a counter at the top right.
- Word-by-word captions near the top, with 3 to 6 emphasised keywords in an italic serif, accent colour `#FF4A20`.
- One flat illustration scene in the centre, appearing on its cue word.
- A 2D SVG mascot at the bottom right, lip-synced (about 10 mouth shapes per second).
- A "night" variant of the look, used only for a reveal.
- A comment-a-word call to action in the last 6 seconds.

Reel language is configurable: `en` (default) or `fr`. French keeps its full typography rules (non-breaking spaces before
`; : ! ?`, guillemets, French mouth-shape rules and script rules).

## Quick start (Linux)

Requirements: Python 3.11+, Node 20+, ffmpeg.

    python -m venv .venv && . .venv/bin/activate
    pip install -e '.[quality,recognition,llm,test]'     # add ',deploy' to deploy the GPU worker
    (cd studio && npm ci --ignore-scripts)
    cp .env.example .env                                 # then fill in only the names you need

With the defaults (`REELFORGE_LLM=stub`, `REELFORGE_VOICE=stub`) the whole pipeline runs offline, for free, on fixtures and
deterministic beeps. That is the way to try it first:

    python -m reelforge all "How freelancers automate invoicing"      # new -> script, then STOPS for review
    $EDITOR reels/<date>-<slug>/script.json                           # human gate 1: review the script
    python -m reelforge continue                                      # voice -> align -> mouth -> timeline -> render -> check -> package
    python -m reelforge status                                        # what exists, what is missing

`all --approve-script` skips the stop and goes straight to `package`; use it for tests, not for publishing.

## Human gates

reelforge never publishes anything. Two points always need a person:

1. **Script review.** `all` stops after `script` so the text can be read and edited before any paid step. `continue`
   revalidates the (possibly hand-edited) script in full before spending anything.
2. **Render review.** `check` runs objective measurements (dimensions, audio present, frozen frames, empty screens; errors
   block `package`) and writes a contact sheet to `qa/`. `--review` adds an advisory visual review by a vision model. A person
   still watches `render.mp4` with sound before posting.

`package` writes `caption.txt` and `cover.jpg` and a `qa/compliance.md` listing what the publisher must tick by hand (AI label,
voice consent, licences, caption). Publishing is manual.

## Secrets

Read when asked for, never at import. The CLI loads them once at start (`reelforge.secrets.load(".env")`). First source that
defines a variable wins:

1. the process environment
2. the repository `.env` (git-ignored)
3. `~/.config/reelforge/secrets.env` (mode 600), or the file named by `REELFORGE_SECRETS`
4. `~/.config/usine/secrets.env` (legacy fallback)

CRLF and BOM files are read correctly. A secret value is never printed, logged or written; errors redact it.

| Variable | Meaning |
|---|---|
| `REELFORGE_LLM` | `stub` (default, fixtures) / `api` (publishable) / `claude-code` (test only: reel flagged not publishable) |
| `REELFORGE_ANTHROPIC_API_KEY` | key for `api` mode |
| `REELFORGE_LLM_BUDGET` | LLM cap per reel in USD (default 5; `0` forbids spending; `off` removes the cap) |
| `REELFORGE_VOICE` | `stub` (default) / `gpu` |
| `RUNPOD_API_KEY` | RunPod key for the GPU voice |
| `REELFORGE_GPU_DAILY_CAP` | daily GPU cap in USD, all reels together (default 3) |
| `REELFORGE_LANGUAGE` | default reel language (`en` or `fr`) |

`.env.example` lists every name; the docstring of `reelforge/config.py` documents the tuning variables.

## GPU voice

The production voice is Qwen3-TTS (12Hz 1.7B Base, voice cloning) on RunPod serverless, one app `reelforge-voice`
(`workers/voice/app.py`) with two functions: `voice` and `voice_design`. Details: [docs/voice.md](docs/voice.md).

    python -m reelforge gpu deploy            # needs '.[deploy]' and RUNPOD_API_KEY; starts no GPU
    python -m reelforge design-voice          # invent the reference voice (no real person cloned)
    python -m reelforge voice --provider gpu
    python -m reelforge gpu status | balance | costs | stop

Measured numbers (RunPod serverless, 2026-11-18):

| Measure | Value |
|---|---|
| Batch of 4 takes of 10 s in one pass (RTX 4090) | 20 s compute, against 67 s run sequentially |
| Cold start | 1.5 to 2.5 minutes, billed |
| Billing vs logged compute | about 1.9x (cold starts and idle time included) |
| Cards used | 16 GB cards first (0.58 USD/h), then 24 GB (up to 1.34 USD/h for a 4090) |
| Scale | 0 to 2 workers; nothing runs and nothing is billed at rest |

The client uses only the standard library, cancels jobs on timeout, polling failure or Ctrl-C, retries transient errors, and
bounds job size. Every finished job is logged to the reel's `costs.jsonl` and to a machine-wide ledger
(`~/.config/reelforge/gpu-spend.jsonl`) that carries the daily cap: a call is refused before submission if its conservative
estimate would pass `REELFORGE_GPU_DAILY_CAP`.

## Commands

`python -m reelforge <command> [reel]`; `reel` defaults to the latest. Every step is idempotent; `--force` redoes it.

| Command | What it does |
|---|---|
| `new <topic>` | create `reels/<date>-<slug>/brief.md` (never overwrites a brief) |
| `script` | write and validate `script.json` with the LLM |
| `voice` | `voice.wav`: synthesis, take checks, best of N, assembly, loudness (`--provider`, `--split`, `--takes`, `--rechoose`) |
| `align` | `words.json`: every script word with start and end (faster-whisper) |
| `mouth` | `mouth.json`: mouth shapes from text and audio energy |
| `timeline` | `timeline.json`: the contract read by the studio |
| `render` | `render.mp4` with Remotion (h264) |
| `check` | technical check, frozen frames, contact sheet, `qa/report.md` (`--review` adds a vision-model review) |
| `package` | `caption.txt`, `cover.jpg`, `qa/compliance.md` |
| `all <topic>` | `new` to `package`, STOPS after `script` unless `--approve-script` |
| `continue` | `voice` to `package` on a reviewed script |
| `status` | progress of a reel |
| `catalog` | list the scene catalog (`--export` regenerates it) |
| `design-voice` | invent the reference voice and keep the best candidate |
| `gpu deploy\|status\|balance\|stop\|costs` | manage the serverless voice app |

## Reel folder

    reels/<YYYY-MM-DD>-<slug>/
      brief.md  script.json  voice.wav  words.json  mouth.json  timeline.json
      render.mp4  qa/report.md  caption.txt  cover.jpg  costs.jsonl

`reels/` is git-ignored. `voice-reference/reference.wav` and `reference.txt` (plus `reference.source` describing an invented
voice) hold the reference voice; audio is never committed.

## Languages

`en` is the default. `fr` is fully supported: script rules, typography, mouth-shape rules and text normalisation exist per
language. Choose per reel with `--language`, or set `REELFORGE_LANGUAGE`.

## Known limitations

- French prosody of Qwen3-TTS has an audible foreign final-syllable stress. It is a property of the model, not something the
  pipeline can remove.
- Voice quality must be judged by ear. The automatic checks (duration, silences, word error rate, take scoring) catch broken
  takes, not a voice that sounds wrong.
- The first call after idle pays a cold start of 1.5 to 2.5 minutes.
- Mouth shapes come from approximate grapheme-to-sound rules, not a phoneme recogniser.

## Tests

    OMP_NUM_THREADS=2 python -m pytest -q -p no:cacheprovider --timeout=300
    (cd studio && npx tsc --noEmit)

No test touches the network.

## Layout

    reelforge/     Python package (CLI, steps, GPU client, LLM client, text tools)
    studio/        Remotion project (composition, scenes, mascot)
    workers/voice/ RunPod worker source
    voice-reference/  reference voice (audio git-ignored)
    docs/          timeline contract, architecture, voice
    tests/         offline test suite
