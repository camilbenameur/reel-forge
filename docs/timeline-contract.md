# Timeline contract

`timeline.json` is written by the Python package (`reelforge/timeline.py`) and read by the Remotion studio. Its type is defined in `studio/src/core/types.ts`, which is the source of truth. This document is an annotated copy of it. When `types.ts` changes, this file and `reelforge/timeline.py` change in the same commit.

The studio ships a working example in `studio/src/fixtures/demo-timeline.json`; it is the default props of the `Reel` composition.

## General rules

- **Times are in seconds**, absolute from the start of the reel (not relative to a scene), unless stated otherwise. The studio converts them to frames with `fps`.
- **Lists are sorted** by increasing time: `avatar.poses`, `avatar.mouth`, `captions`, `sections`, `scenes`.
- **A key's value is held** until the next key (pose, mouth shape).
- **Text is UTF-8** in the reel language (`language`). For `fr`, the non-breaking spaces (U+00A0 or U+202F) are already in place before `; : ! ?` and inside guillemets.
- **The file is deterministic**: the same content gives the same video. The renderer never uses `Math.random` or the clock.
- Unknown fields are ignored by the studio; missing required fields are a contract error.

## Fields

### `Timeline` (root)

| Field | Type | Meaning |
|---|---|---|
| `version` | `1` | Contract version. Bumped on any breaking change. |
| `fps` | number | Frames per second, always `30`. |
| `width` | number | Canvas width in pixels, always `1080`. |
| `height` | number | Canvas height in pixels, always `1920`. |
| `durationInFrames` | number | Voice duration plus 0.6 s of tail (`TAIL_S` in `reelforge/timeline.py`), in frames. The `Reel` composition takes its length, `fps`, `width` and `height` from the timeline (`calculateMetadata`). Target reels last 38 to 55 s. |
| `theme` | `Theme` | Base theme of the reel. A scene may force the other one. |
| `language` | `'en' \| 'fr'`, optional | Reel language, default `'en'`. Selects the caption line-breaking rules (see `Word`). |
| `audio` | `string \| null` | Path relative to `studio/public`, for example `reels/2026-10-30-my-topic/voice.wav`. The render step copies the voice there. `null` renders silently. |
| `words` | `Word[]` | Every word of the script with its timing. |
| `captions` | `CaptionPage[]` | Caption pages, built from `words`. |
| `sections` | `Section[]` | Top-left label and top-right counter, one entry per beat. |
| `scenes` | `SceneSpec[]` | Illustration scenes shown in the center. |
| `avatar` | `AvatarTrack` | Mascot track (poses, expressions, mouth shapes). |

### `Theme`

`'paper' | 'night'`.

- `paper`: cream background `#F5F3EF`, accent `#FF4A20`, black ink `#0A0A0A`.
- `night`: black background `#0A0A0A`, yellow accent `#FEED66`. Used only for a reveal.

The reel theme is `Timeline.theme`. A scene can force the other one with `SceneSpec.theme`; the studio animates the switch over 7 frames and returns to the base theme when the scene ends.

### `Word`

| Field | Type | Meaning |
|---|---|---|
| `text` | string | As displayed: the spelling of the **script** (correct punctuation attached to the word), not the speech recognizer's output. |
| `start`, `end` | number | Seconds, from forced alignment of the voice. |
| `emphasis` | boolean | Keyword: shown in serif italic in the accent color, slightly larger. Three to six per reel. |

Caption line breaking never separates a word from the previous one when the next word starts with `? ! : ; % ) ] ...` or the previous one ends with an opening quote or parenthesis, nor across a non-breaking space. A short function word stays glued to the following word; the list depends on `language`: English (the, a, of, to, and, ...) or French (le, la, de, que, je, ...).

### `CaptionPage`

| Field | Type | Meaning |
|---|---|---|
| `start`, `end` | number | Seconds. The page appears at `start` and is held 0.25 s after `end`. |
| `words` | `number[]` | Indices into `Timeline.words`, 1 to about 12 words, at most 3 lines. |

A page is a block of text shown near the top. All its words are visible from the first frame; words already said are in full ink, upcoming words in light grey. A page usually lasts 1 to 4 s. The studio shrinks the font (70 px down to 36 px) so the page fits in three lines.

### `Section`

| Field | Type | Meaning |
|---|---|---|
| `start` | number | Seconds at which the label changes (typing effect). |
| `label` | string | For example `01 — the hook`; displayed as `// 01 — the hook`, in mono type, top left. |
| `counter` | `{ label: string; value: string }`, optional | Top-right corner, for example `STEPS 2`; the value is shown in the accent color. |

### `SceneSpec`

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Unique id within the reel. |
| `type` | string | Key of the scene registry (`studio/src/scenes`). Must exist in the catalog (`python -m reelforge catalog`); an unknown type renders a red error card. |
| `start`, `end` | number | Seconds. The scene stays mounted until the start of the next one; its 3-frame exit overlaps the next entrance. The last scene holds until the end of the reel. |
| `props` | object | Props specific to the scene type. Their keys are defined by each scene, not by this contract. |
| `cues` | `Record<string, number>` | Cue name known by the scene mapped to the **absolute time of the word** that triggers it. Inside the scene, `ctx.cue(name)` returns the matching frame relative to the scene start. Elements appear 2 frames before their word. |
| `theme` | `Theme`, optional | Forces the theme during the scene. |

The scene on screen pulses slightly (3.5 %) on each keyword group.

### `Pose`

Eleven bust poses:

| Value | Meaning |
|---|---|
| `neutral` | Arms along the body, light sway. |
| `point-up` | Index finger raised (idea, "listen"). |
| `point-scene` | Points at the scene in the center-left. |
| `wave` | Raised hand, open palm (hello, soft stop). |
| `thumbs-up` | Thumb up. |
| `thinking` | Hand on chin. |
| `facepalm` | Hand on forehead. |
| `arms-open` | Both hands open ("and there you go"). |
| `celebrate` | Raised fists, confetti. |
| `point-down` | Points down ("comment", link). |
| `point-self` | Index finger at its own chest ("that's me"). |

Suggested use: `point-scene` when an illustration appears, `facepalm` for the mistake, `point-down` for the call to action, `point-self` for "that's me", `wave` only at the end.

### `Expression`

`'neutral' | 'smile' | 'surprised' | 'skeptical' | 'laugh' | 'wink'`. The expression drives eyebrows, eyelids and the resting mouth, independently of the pose.

### `MouthShape`

Nine shapes, Rhubarb Lip Sync vocabulary:

| Shape | Meaning |
|---|---|
| `A` | Closed (m, b, p). |
| `B` | Slightly open, teeth (consonants). |
| `C` | Open (eh, e). |
| `D` | Wide open (ah). |
| `E` | Rounded (oh). |
| `F` | Very rounded, pushed forward (oo, u, w). |
| `G` | Teeth on lip (f, v). |
| `H` | Tongue visible (l). |
| `X` | Rest (silence). |

### `AvatarTrack`

| Field | Type | Meaning |
|---|---|---|
| `visible` | boolean | Whether the mascot is drawn (bottom right). |
| `poses` | `PoseKey[]` | `{ t, pose, expression }`, sorted by `t`, the first one at `t = 0`. A change fades over 3 frames with a short spring. |
| `mouth` | `MouthKey[]` | `{ t, shape }`, sorted by `t`; the shape is held until the next key. About 10 changes per second, smoothed (minimum 80 to 100 ms). `mouth.json` follows the sound with no lead and the studio adds none (`MOUTH_LEAD_FRAMES = 0` in `studio/src/avatar/anim.ts`); a lead, if one is ever wanted, is applied there only, never twice. |
| `seed` | number | Seed of the micro-animations (blinks, breathing, gaze): same seed, same blinks. |

## Minimal example

```json
{
  "version": 1,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "durationInFrames": 90,
  "theme": "paper",
  "language": "en",
  "audio": "reels/2026-10-30-example/voice.wav",
  "words": [
    { "text": "You", "start": 0.10, "end": 0.25, "emphasis": false },
    { "text": "follow-up", "start": 0.25, "end": 0.80, "emphasis": true }
  ],
  "captions": [{ "start": 0.10, "end": 1.20, "words": [0, 1] }],
  "sections": [{ "start": 0, "label": "01 — the hook", "counter": { "label": "FOLLOW-UPS", "value": "3" } }],
  "scenes": [
    {
      "id": "s01",
      "type": "step-card",
      "start": 0.10,
      "end": 2.90,
      "props": { "number": 1, "title": "HOOK" },
      "cues": { "cue": 0.25 }
    }
  ],
  "avatar": {
    "visible": true,
    "poses": [{ "t": 0, "pose": "point-up", "expression": "smile" }],
    "mouth": [{ "t": 0, "shape": "X" }, { "t": 0.10, "shape": "C" }],
    "seed": 7
  }
}
```

## Validation

The `timeline` step must refuse a file that breaks these rules: unsorted lists, times outside the audio duration, invalid `captions[].words` indices, a scene `type` unknown to the catalog, a scene overflowing the duration, a first pose not at `t = 0`. Type checking of the studio side: `cd studio && npx tsc --noEmit`.
