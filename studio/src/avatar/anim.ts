// Mascot animation: pure functions of the current frame and of the seed (no Math.random,
// no clock). Everything the rig needs to know at frame N comes out of computeState().
import { interpolate, random, spring } from 'remotion';
import type { AvatarTrack, Expression, MouthShape, Pose, Word } from '../core/types';

export interface FigureState {
  pose: Pose;
  prevPose: Pose | null;     // previous pose, still visible during the 3-frame fade
  poseMix: number;           // 0 to 1: opacity of the current pose over the previous one
  bounce: number;            // 10-frame spring on pose change (1 = at rest, overshoots slightly)
  expression: Expression;
  mouthA: MouthShape;        // previous shape
  mouthB: MouthShape;        // current shape (anticipated by one frame)
  mouthMix: number;          // 0 to 1: A to B fade over 2 frames
  blink: number;             // 0 open to 1 closed
  gaze: { x: number; y: number };
  brow: number;              // 0 to 1: raised eyebrows (emphasis word)
  nod: number;               // 0 to 1 to 0: head nod (emphasis word)
  smile: number;             // 0 to 1: slight smile on emphasis words
  smirk: number;             // 0 to 1: smirk + raised eyebrows (point-self pose)
  breathe: number;           // -1 → 1
  sway: number;              // degrees
  slide: number;             // 0 (out of frame, below) to 1 (in place)
  t: number;                 // seconds, for the continuous hand movements
}

export const REST_STATE: FigureState = {
  pose: 'neutral',
  prevPose: null,
  poseMix: 1,
  bounce: 1,
  expression: 'neutral',
  mouthA: 'X',
  mouthB: 'X',
  mouthMix: 1,
  blink: 0,
  gaze: { x: 0, y: 0 },
  brow: 0,
  nod: 0,
  smile: 0,
  smirk: 0,
  breathe: 0,
  sway: 0,
  slide: 1,
  t: 0,
};

// Mouth lead over the sound, in frames. Measured on the render pixels by the MS4 metric (target: -33 ms).
export const MOUTH_LEAD_FRAMES = 0;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---- Blinks: 5 frames, sometimes doubled, every 2 to 6 s ----------------------------------
const BLINK_PROFILE = [0.4, 1, 1, 0.55, 0.15];
const MAX_FRAMES = 12000; // 400 s at 30 fps, far above 55 s
const blinkCache = new Map<number, number[]>();

const blinkStarts = (seed: number): number[] => {
  const cached = blinkCache.get(seed);
  if (cached) return cached;
  const starts: number[] = [];
  let f = 36 + Math.floor(random(`blink-first-${seed}`) * 50);
  for (let i = 0; f < MAX_FRAMES; i++) {
    starts.push(f);
    if (random(`blink-double-${seed}-${i}`) < 0.22) starts.push(f + 9);
    f += 60 + Math.floor(random(`blink-gap-${seed}-${i}`) * 121); // 2 to 6 s
  }
  blinkCache.set(seed, starts);
  return starts;
};

// Last index i such that arr[i] <= value, or -1.
const lastLE = (arr: number[], value: number): number => {
  let lo = 0;
  let hi = arr.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) {
      res = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return res;
};

export const blinkAmount = (frame: number, seed: number): number => {
  const starts = blinkStarts(seed);
  const i = lastLE(starts, frame);
  if (i < 0) return 0;
  const k = frame - starts[i];
  return k < BLINK_PROFILE.length ? BLINK_PROFILE[k] : 0;
};

// ---- Gaze saccades: a new target every 0.6 to 2.2 s ------------------------------
interface GazeKey {
  f: number;
  x: number;
  y: number;
}
const gazeCache = new Map<number, GazeKey[]>();

const gazeKeys = (seed: number): GazeKey[] => {
  const cached = gazeCache.get(seed);
  if (cached) return cached;
  const keys: GazeKey[] = [{ f: 0, x: -1.5, y: 0 }];
  let f = 0;
  for (let i = 0; f < MAX_FRAMES; i++) {
    f += 18 + Math.floor(random(`gaze-gap-${seed}-${i}`) * 49);
    // slight bias to the left: the scene is to the left of the mascot
    keys.push({
      f,
      x: (random(`gaze-x-${seed}-${i}`) - 0.5) * 8 - 1.5,
      y: (random(`gaze-y-${seed}-${i}`) - 0.5) * 4,
    });
  }
  gazeCache.set(seed, keys);
  return keys;
};

export const gazeAt = (frame: number, seed: number) => {
  const keys = gazeKeys(seed);
  const i = lastLE(keys.map((k) => k.f), frame);
  const cur = keys[Math.max(0, i)];
  const prev = keys[Math.max(0, i - 1)];
  const p = clamp01((frame - cur.f + 1) / 3); // fast saccade, 2-3 frames
  return { x: prev.x + (cur.x - prev.x) * p, y: prev.y + (cur.y - prev.y) * p };
};

// ---- Keywords: raised eyebrows and small nod ------------------------------------------------
export const emphasisAt = (words: Word[], t: number) => {
  let brow = 0;
  let nod = 0;
  let smile = 0;
  for (const w of words) {
    if (!w.emphasis) continue;
    if (t < w.start - 0.15 || t > w.end + 0.4) continue;
    const up = clamp01((t - (w.start - 0.1)) / 0.1);
    const down = clamp01((w.end + 0.3 - t) / 0.2);
    brow = Math.max(brow, Math.min(up, down));
    smile = Math.max(smile, Math.min(up, down)); // the smile follows the same envelope as the eyebrows
    const u = (t - w.start) / 0.32;
    if (u >= 0 && u <= 1) nod = Math.max(nod, Math.sin(Math.PI * u));
  }
  return { brow, nod, smile };
};

// ---- Full state at frame `frame` ---------------------------------------------------------------
export const computeState = (
  track: AvatarTrack,
  words: Word[],
  frame: number,
  fps: number,
  opts: { still?: boolean } = {},
): FigureState => {
  const seed = track.seed ?? 0;
  const t = frame / fps;

  // current pose: last key whose time has been reached
  const poses = track.poses;
  let idx = -1;
  for (let i = 0; i < poses.length; i++) {
    if (Math.round(poses[i].t * fps) <= frame) idx = i;
    else break;
  }
  const first = idx <= 0; // no key or first key: no bounce nor fade
  const cur = poses[Math.max(0, idx)] ?? { t: 0, pose: 'neutral' as Pose, expression: 'neutral' as Expression };
  const prev = !first ? poses[idx - 1] : null;
  const keyFrame = Math.round(cur.t * fps);
  const age = Math.max(0, frame - keyFrame);
  const poseMix = first ? 1 : clamp01(age / 3);
  const bounce = first
    ? 1
    : spring({ frame: age, fps, config: { damping: 7, stiffness: 260, mass: 0.6 }, durationInFrames: 10 });

  // mouth: key in force at the frame + MOUTH_LEAD_FRAMES (the mouth slightly precedes the sound, target -33 ms at the pixel).
  // mouth.json follows the sound with no lead (ANTICIPATION_FRAMES = 0): the lead is applied only here, never twice.
  const look = frame + MOUTH_LEAD_FRAMES;
  const mouth = track.mouth;
  let mi = -1;
  for (let lo = 0, hi = mouth.length - 1; lo <= hi; ) {
    const mid = (lo + hi) >> 1;
    if (Math.round(mouth[mid].t * fps) <= look) {
      mi = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const mouthB: MouthShape = mi >= 0 ? mouth[mi].shape : 'X';
  const mouthA: MouthShape = mi > 0 ? mouth[mi - 1].shape : mouthB;
  const mAge = mi >= 0 ? look - Math.round(mouth[mi].t * fps) : 9;
  const mouthMix = clamp01((mAge + 1) / 2);

  if (opts.still) {
    return { ...REST_STATE, pose: cur.pose, prevPose: null, expression: cur.expression, mouthA, mouthB, mouthMix, t };
  }

  const emph = emphasisAt(words, t);
  const ph1 = random(`breath-${seed}`) * Math.PI * 2;
  const ph2 = random(`sway-${seed}`) * Math.PI * 2;
  const slide = spring({ frame, fps, config: { damping: 16, stiffness: 90, mass: 1 }, durationInFrames: 24 });

  return {
    pose: cur.pose,
    prevPose: prev ? prev.pose : null,
    poseMix,
    bounce,
    expression: cur.expression,
    mouthA,
    mouthB,
    mouthMix,
    blink: blinkAmount(frame, seed),
    gaze: gazeAt(frame, seed),
    brow: emph.brow,
    nod: emph.nod,
    smile: emph.smile,
    smirk: (cur.pose === 'point-self' ? poseMix : 0) + (prev && prev.pose === 'point-self' ? 1 - poseMix : 0),
    breathe: Math.sin((2 * Math.PI * t) / 3.5 + ph1),
    sway: Math.sin((2 * Math.PI * t) / 6.4 + ph2),
    slide: interpolate(slide, [0, 1], [0, 1]),
    t,
  };
};
