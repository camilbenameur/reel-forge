# Reference voice

The GPU voice clones the voice found here. Audio is never committed (`.gitignore`); this folder is empty on a fresh clone.

Files, all written next to each other:

- `reference.wav`: the excerpt (1 to 60 s, mono).
- `reference.txt`: the exact transcript of the excerpt.
- `reference.source`: provenance of an INVENTED voice (description, seed, date, model). Written by `design-voice`.
- `reference.consent`: only for a real person's voice: a short note saying who consented, when, and where the written consent
  is kept. Without it the caption says "generated voice" and never claims a consent.

Get a reference with no person cloned:

    python -m reelforge design-voice                 # needs RUNPOD_API_KEY and a deployed app (python -m reelforge gpu deploy)
    python -m reelforge design-voice --force         # replace the reference (the old files go to previous/)

`voice --provider gpu` fails with a clear message while `reference.wav` and `reference.txt` are missing.
The `stub` voice provider needs none of this.
