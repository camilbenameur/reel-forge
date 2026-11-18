# Library A scenes

16 scenes, one file each, registered in `index.ts` (`SCENES_A`). Every scene draws everything in SVG/HTML/CSS (no external image), works in both the `paper` and `night` themes, stays inside `SCENE_BOX` (except `halftone-burst`, which is full screen) and keeps a permanent micro-motion (float, needle, blinking cursor...).

Cue convention: every scene accepts `cue` (name of the cue that triggers its entrance; by default the cue named `enter`, otherwise frame 0). Secondary elements carry an optional `cue` field; without a cue they spread out automatically after the entrance (fallback values in frames). The cue names specific to a scene are listed in `SceneDefinition.cues`.

Shared files: `kit.tsx` (frame, cards, badges, icons, cursor, click ripple, number formatting). `preview/`: temporary preview composition (see below).

| type | role | main props |
|---|---|---|
| `step-card` | numbered step card | `number`, `title` (Anton capitals), `subtitle?`, `label?`, `illustration?` (`clock`, `bolt`, `target`, `magnifier`, `none`), `cue?`, `cueIllustration?` |
| `step-grid` | grid of 2 to 6 cards that light up one by one | `title`, `cards[]` (`title`, `number?`, `cue?`), `cue?` |
| `app-window` | application window or terminal, lines typed out | `title`, `variant?` (`light`, `terminal`), `lines[]` (`text`, `cue?`, `tone?` `normal`/`accent`/`ok`/`muted`, `prefix?`), `prompt?`, `badge?`, `cue?` |
| `phone` | tilted phone | `screen` (`reel`, `chat`, `notification`), `tilt?`; reel: `caption`, `keyword?`, `author`, `views?`, `likes?`; chat: `contact`, `messages[]` (`from` `me`/`them`, `text`, `cue?`); notification: `time?`, `date?`, `notifications[]` (`app`, `title`, `text`, `time?`, `cue?`) |
| `chat-claude` | AI chat ("What do you want to build?"), typed message then checked steps | `title`, `message`, `intro?`, `steps[]` (`text`, `detail?`, `cue?`), `model?`, `cue?`, `cueMessage?`, `cueSend?` |
| `checklist` | title, 0/N counter, boxes checked on their word | `title`, `items[]` (`text`, `cue?`, `struck?`), `cue?` |
| `stop-stamp` | item + stamp that slams down with a shake | `item` (`title`, `subtitle?`, `icon?` `camera`/`document`/`bell`/`dollar`), `stamp` (`STOP`, `ERROR`, `NO`...), `cue?`, `cueStamp?` |
| `big-number` | giant counting number | `value`, `start?`, `decimals?`, `prefix?`, `suffix?`, `caption`, `arrow?` (`up`, `down`, `none`), `countDuration?` (s), `cue?`, `cueCaption?` |
| `retention-graph` | falling curve against a holding curve, playback cursor, thumbnails | `title?`, `averageLabel`, `ownLabel`, `duration?`, `drop?`, `hold?`, `cue?`, `cueAverage?`, `cueOwn?`, `cueCursor?` |
| `view-counter` | Insights card: views, rising curve, period | `label`, `value`, `period`, `tabs?`, `active?`, `delta?`, `curve[]`, `tiles?[]` (`label`, `value`, `cue?`), `cue?`, `cueCurve?` |
| `comment-cta` | comment whose keyword is typed, click on Post | `word`, `placeholder?`, `button?`, `username?`, `title?`, `total?`, `existing?[]` (`author`, `text`), `cue?`, `cueWord?`, `cueClick?` |
| `cursor-click` | cursor following a path and clicking, with a ripple | `title?`, `button`, `result?`, `secondary?[]`, `path?[]` (`x`, `y` between 0 and 1), `cue?`, `cueStart?`, `cueClick?` |
| `folder` | blue folder that opens, files popping out | `name`, `files[]` (`name`, `detail?`, `type?` `skill`/`doc`/`folder`, `cue?`), `cue?`, `cueOpen?` |
| `versus` | before / after in two columns (cross / check mark) | `left` and `right` (`title`, `lines[]` with `text`, `cue?`), `cue?` |
| `quote-card` | quotation in curly quotes with source and highlighted word | `quote`, `source`, `highlight?`, `cue?`, `cueHighlight?` |
| `halftone-burst` | burst or wave of dots, full screen | `pattern` (`burst`, `wave`), `color?` (`accent`, `ink`, `yellow`), `word?`, `center?` (`x`, `y` between 0 and 1), `cue?` |

Numbers are formatted in English (`2,396,686`, `12.4k`).

## Temporary preview

`preview/` holds a `PreviewA` composition (1080x1920, cream background and dot grid) that displays one scene chosen through props (`type`, `theme`, `props`, `cues`). It renders still images before the studio core is ready, and can be removed afterwards:

```
npx remotion still src/scenes/a/preview/index.ts PreviewA out/scene-a-step-card.png --frame=70 --props='{"type":"step-card","theme":"paper"}'
```

If the Headless Shell download fails, add `--browser-executable=/usr/bin/chromium` (or the path of an installed Chrome).
