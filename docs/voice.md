# Voice

The narration is made by Qwen3-TTS (Apache-2.0) running on RunPod serverless. The GPU only makes sound; every judgement
(seeds, take checks, word error rate, best of N, caching) stays in `reelforge/voice.py`.

## Providers

| Provider | Use | Notes |
|---|---|---|
| `gpu` | production | Qwen3-TTS 12Hz 1.7B Base cloning of the reference voice |
| `stub` | tests | deterministic beeps sized to the words; no reference voice, no network |

Select with `REELFORGE_VOICE` or `voice --provider`. The default is `stub`.

## Reference voice

`voice-reference/reference.wav` (1 to 60 s, mono) and `reference.txt` (its exact transcript) travel with every request.
`reference.source` describes an invented voice (description, seed, date, model); `reference.consent` exists only for a real
person's voice and says who consented, when, and where the written consent is kept. Without it the caption says "generated
voice" and never claims a consent. Audio is never committed.

Invent a voice (no person cloned):

    python -m reelforge gpu deploy
    python -m reelforge design-voice                       # default description and text
    python -m reelforge design-voice --seeds 11,23,37,41   # 1 to 8 seeds; one candidate per seed
    python -m reelforge design-voice --force               # replace; old files go to previous/

Candidates are written to `voice-reference/candidates/`; the best-scoring one becomes the reference. Judge them by ear.

## The GPU app

`workers/voice/app.py` defines the RunPod app `reelforge-voice` (SDK 2, `@app.queue`):

- `voice`: cloning. Takes several texts and several takes of the same text in one request and generates them in one batched
  pass. The token cap is proportional to the text length; a take that hits the cap without an end token is flagged
  `cap_reached` and refused by the pipeline. The response is capped at about 9 MB (audio of capped takes is dropped first).
- `voice_design`: invents a voice from a text description (Qwen3-TTS VoiceDesign).
- Cards are named one by one (16 GB first, then 24 GB), never MIG slices, where the PyTorch allocator fails.
- Scaling: 0 to 2 workers, second worker only after a job waited 60 s (queue delay scaler), idle timeout 90 s.
- The model is staged with `runpod.Model`; the `sox` package has no Linux wheel and is replaced by an empty stub module.

Only the text and the reference excerpt are sent: no key, no personal data.

## Client

`reelforge/gpu/client.py` calls `https://api.runpod.ai/v2/flash/run|status|cancel` with the headers `X-Flash-App`,
`X-Flash-Environment`, `X-Flash-Endpoint`, using only the standard library. It cancels jobs on timeout, polling failure and
Ctrl-C, retries transient errors, bounds job size (all segments counted), redacts secrets in errors, and logs each job.

## Strategy: takes and splitting

- `continuous` split (default for `gpu`): consecutive beats are grouped into blocks up to `REELFORGE_VOICE_BLOCK_MAX`
  characters (600), so the model keeps prosody across sentences. Beat boundaries inside a block are found on the transcription.
- `beat` split (default for `stub`): one request per beat, joined by short silences.
- `--takes N` (or `REELFORGE_VOICE_TAKES`, 3 or 4 suggested on the GPU): N valid takes per block with different seeds; the best
  is kept (lowest word error rate, then highest score). `--rechoose` re-scores cached takes without any GPU call.
- Every take is checked: silence, duration against word count, silence in the middle, faster-whisper word error rate. A refused
  take is redone with another seed, up to 4 attempts.
- Takes are cached under provider, model, reference fingerprint, settings and text.

## Costs

- Batch of 4 takes of 10 s: 20 s compute in one pass, against 67 s sequentially, on an RTX 4090.
- Cold start: 1.5 to 2.5 minutes, billed until the worker is ready.
- Real bill is about 1.9x the logged compute (cold starts and idle time).
- Daily cap `REELFORGE_GPU_DAILY_CAP` (default 3 USD) across all reels; `gpu costs` shows spend, `gpu balance` the account.

## Known limitations

- French prosody has an audible foreign final-syllable stress.
- Voice quality must be judged by ear.
- Mispronounced words: write them as they should sound in the script's spoken text; the subtitles keep the spelling.
- The reference voice must be a voice you have the right to use; the caption disclosure follows the provenance files.

## Troubleshooting

| Symptom | Check |
|---|---|
| `RUNPOD_API_KEY` missing | put it in `.env` or `~/.config/reelforge/secrets.env` (mode 600) |
| reference excerpt missing | `python -m reelforge design-voice` |
| daily GPU cap reached | review `gpu costs`, then raise `REELFORGE_GPU_DAILY_CAP` |
| very slow first take | cold start, expected |
