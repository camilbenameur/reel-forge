// Contract between the Python factory (which writes timeline.json) and the Remotion studio (which renders it).
// Any change here must be mirrored in reelforge/timeline.py and docs/timeline-contract.md.
// Times are ABSOLUTE SECONDS from the start of the reel, unless stated otherwise.

export type Theme = 'paper' | 'night';

// Reel language: drives the caption line-breaking rules (French typography for 'fr').
export type Language = 'en' | 'fr';

export type Pose =
  | 'neutral'       // arms along the body, light sway
  | 'point-up'      // index finger raised (idea, "listen")
  | 'point-scene'   // points at the scene in the center-left
  | 'wave'          // raised hand, open palm (hello / soft stop)
  | 'thumbs-up'     // thumb up
  | 'thinking'      // hand on chin
  | 'facepalm'      // hand on forehead
  | 'arms-open'     // both hands open ("and there you go")
  | 'celebrate'     // raised fists / confetti
  | 'point-down'    // points down ("comment", link)
  | 'point-self';   // index finger pointed at its own chest ("that's me")

export type Expression = 'neutral' | 'smile' | 'surprised' | 'skeptical' | 'laugh' | 'wink';

// Mouth shapes (Rhubarb Lip Sync convention):
// A closed (m b p) · B slightly open, teeth (consonants) · C open (eh, e)
// D wide open (ah) · E rounded (oh) · F very rounded / pushed forward (oo, u, w)
// G teeth on lip (f, v) · H tongue visible (l) · X rest (silence)
export type MouthShape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'X';

export interface Word {
  text: string;        // as displayed (script spelling, attached punctuation included)
  start: number;
  end: number;
  emphasis: boolean;   // keyword: serif italic in the accent color
}

export interface CaptionPage {
  start: number;
  end: number;
  words: number[];     // indices into Timeline.words, 1 to ~12 words, at most 3 lines
}

export interface Section {
  start: number;
  label: string;                               // "01 — the hook" (displayed as "// 01 — the hook")
  counter?: { label: string; value: string };  // top-right corner: "STEPS 2"
}

export interface SceneSpec {
  id: string;
  type: string;                    // key of the scene registry (studio/src/scenes)
  start: number;
  end: number;
  props: Record<string, unknown>;  // props specific to the scene type (see the README.md of the scene family in studio/src/scenes/, or `python -m reelforge catalog`)
  cues: Record<string, number>;    // cue name -> absolute time of the word that triggers it
  theme?: Theme;                   // forces the theme during the scene (e.g. "night" switch on the reveal)
}

export interface PoseKey {
  t: number;
  pose: Pose;
  expression: Expression;
}

export interface MouthKey {
  t: number;
  shape: MouthShape;
}

export interface AvatarTrack {
  visible: boolean;
  poses: PoseKey[];     // sorted by t; the first one at t = 0
  mouth: MouthKey[];    // sorted by t; shape held until the next key
  seed: number;         // seed of the micro-animations (blinks, breathing)
}

export interface Timeline {
  version: 1;
  fps: number;            // 30
  width: number;          // 1080
  height: number;         // 1920
  durationInFrames: number;
  theme: Theme;
  language?: Language;    // reel language, default 'en'
  audio: string | null;   // path relative to studio/public, e.g. "reels/2026-10-30-my-topic/voice.wav"
  words: Word[];
  captions: CaptionPage[];
  sections: Section[];
  scenes: SceneSpec[];
  avatar: AvatarTrack;
}
