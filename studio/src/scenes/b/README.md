# Scene library B (16 scenes)

Registry: `studio/src/scenes/b/index.ts` exports `SCENES_B: SceneDefinition[]`.
Each scene is a `.tsx` file exporting a `SceneDefinition` (kebab-case type, description, `exampleProps`, `cues`, `Component`).

Common conventions
- The component positions itself in the usable area (`SCENE_BOX`, coordinates of the 1080x1920 frame) through `SceneRoot` (`kit.tsx`): the core must therefore mount it full-frame (`AbsoluteFill`), with no extra offset.
- Every secondary element appears on `ctx.cue(item.cue, fallback)`; an item's `cue` field is optional (the fallback is in frames, spread over roughly the first 3 seconds).
- Two themes (`paper`, `night`) through `palette(ctx.theme)`. No external image, no emoji. Expected fonts: Inter Tight, Instrument Serif (italic), Anton, JetBrains Mono.
- Permanent micro-motion (`drift`) on cards and objects.
- Props are in English; the text values you pass (labels, captions) are in the reel language.

## keys
Ring of API keys (`keyring` variant) or a golden key that unlocks cards (`golden` variant).
Props: `variant: 'keyring' | 'golden'`, `title?`, `keys: { label, detail?, cue? }[]`, `multiplier?: number` (xN badge, keyring).
Cues: `ring`, `multiplier`, `key` (golden) + each key's `cue` (golden: moment the card unlocks).

## api-hub
Central card wired by cables to 1 to 5 service cards that go from "missing" to checked.
Props: `hub: { title, sub? }`, `services: { name, detail?, cue? }[]`, `missingLabel?`.
Cues: `hub` + each service's `cue` (moment the cable plugs in and the card is checked).

## calendar
Calendar page: the previous day's sheet turns, today's date appears, days get checked.
Props: `month`, `year`, `day`, `label` ("TODAY"), `firstWeekday` (0 = Monday), `daysInMonth`, `checkedDays: { day, cue? }[]`.
Cues: `page`, `turn`, `label` + each checked day's `cue`.

## envelope
Wax-sealed envelope whose seal breaks, the flap opens and the letter comes out.
Props: `question` ("HOW?"), `lines?: string[]` (3 lines of text, empty = gray bar), `seal` (initial), `label?`.
Cues: `envelope`, `open`.

## question-mark
Giant question mark in red/black volume + a condensed word that types in letter by letter.
Props: `word` ("WHY?"), `symbol?` ("?").
Cues: `symbol`, `word`.

## corkboard
Cork board: annotated polaroids (up to 4), pushpins, red yarn, yellow sticky note, magnifier.
Props: `title?`, `photos: { caption, variant: 'hills' | 'portrait' | 'city' | 'graph', cue? }[]`, `note?`, `cueNote?`, `magnifier?` (default true), `magnifierOn?` (index).
Cues: `board`, `yarn`, `note`, `magnifier` + each photo's `cue`.

## chart-bars
Comparative bars that grow (counting values), one highlighted bar and a bubble.
Props: `title`, `unit?`, `bars: { label, value, cue?, highlight? }[]`, `bubble?` ("x4"), `cueBubble?`.
Cues: `card`, `bubble` + each bar's `cue`.

## timeline-steps
Horizontal timeline of milestones with a progress line and a travelling dot.
Props: `milestones: { label, title, detail?, cue? }[]` (3 to 5 recommended).
Cues: each milestone's `cue` (the line advances toward it during the 14 preceding frames).

## code-snippet
Colored code block whose lines are typed out (coloring: comments, strings, keywords, numbers, calls).
Props: `file`, `lines: { text, highlight?, cue? }[]`, `speed?` (characters/second, default 46).
Cues: `window` + each line's `cue` (start of typing).

## toggle
Settings card whose switches flip; one row is emphasized, plus a stamp.
Props: `title`, `rows: { label, hint?, cue?, focus?, active? }[]`, `stamp?` ("ENABLED").
Cues: `card`, `stamp` + each row's `cue` (moment of the flip).

## loading-bar
Progress bar, large percentage, checked steps, final stamp.
Props: `title`, `steps: { label, cue? }[]` (the cue = end of the step), `final?` ("READY").
Cues: `card` + each step's `cue`.

## price-tag
Hanging price tag that drops in and swings, or a perforated ticket with a barcode.
Props: `variant: 'tag' | 'ticket'`, `price` ("$9", "FREE"), `oldPrice?` (struck through), `note?`, `heading?` (top word).
Cues: `price`, `strike`, `stamp`.

## browser-page
Web page in a browser: typed URL, title, button clicked by the cursor, then scroll to 3 cards.
Props: `url`, `title`, `subtitle?`, `button`, `cards: { title, cue? }[]` (3 max), `cueClick?`.
Cues: `window`, `click` (or `cueClick`) + each card's `cue`.

## stack-cards
Stack of numbered cards that drop in, then fan out.
Props: `cards: { title, sub?, tag?, cue? }[]` (6 max), `cueFan?`.
Cues: `fan` + each card's `cue`.

## icon-row
Row of drawn tool icons that appear one by one with a label.
Props: `tools: { icon: 'mic' | 'film' | 'brush' | 'gear' | 'magnifier' | 'file' | 'text' | 'player', label, sub?, cue? }[]` (8 max, 2 rows beyond 4).
Cues: each tool's `cue`.

## arrow-annotate
Large sentence in which one word is circled / underlined / highlighted (drawn stroke), with an arrow and a typed handwritten note.
Props: `before`, `word`, `after?`, `note`, `shape: 'circle' | 'underline' | 'highlight'`.
Cues: `card`, `stroke`, `arrow`.
