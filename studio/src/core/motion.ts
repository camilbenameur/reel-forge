// Motion presets shared by all scenes. Everything is a pure function of the current frame
// (never Math.random nor the clock: the render must be identical from one run to the next).
import { Easing, interpolate, spring } from 'remotion';

export const SPRINGS = {
  snap: { damping: 14, stiffness: 180, mass: 0.7 },  // object entrance, slight overshoot
  pop: { damping: 9, stiffness: 220, mass: 0.6 },    // stamp, number, badge: pronounced overshoot
  soft: { damping: 26, stiffness: 240, mass: 0.7 },  // window, phone: no bounce, about 9 frames (a slower spring reads as a crossfade: RY6)
} as const;

export type SpringName = keyof typeof SPRINGS;

// Elements appear 2 frames BEFORE their word (perceptual anticipation).
export const LEAD_FRAMES = 2;

// Progress 0 to 1 (overshoot possible) of a spring that starts at `at` (frames).
export const springAt = (frame: number, fps: number, at: number, kind: SpringName = 'snap') =>
  spring({ frame: frame - (at - LEAD_FRAMES), fps, config: SPRINGS[kind] });

// Standard entrance: opacity, rise and scale. To be applied as a CSS style.
export const enter = (
  frame: number,
  fps: number,
  at: number,
  kind: SpringName = 'snap',
  distance = 40,
): React.CSSProperties => {
  const p = springAt(frame, fps, at, kind);
  return {
    opacity: interpolate(p, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
    transform: `translateY(${(1 - p) * distance}px) scale(${0.85 + 0.15 * p})`,
  };
};

// Fast exit (ease-in, no spring) over `frames` frames before `end`.
export const exitOpacity = (frame: number, end: number, frames = 5) =>
  interpolate(frame, [end - frames, end], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });

// Letter-by-letter typing: number of visible characters at frame `frame`.
export const typed = (frame: number, fps: number, at: number, text: string, cps = 30) =>
  text.slice(0, Math.max(0, Math.floor(((frame - at) / fps) * cps)));

// Small continuous oscillation (drift, float), in pixels.
export const drift = (frame: number, fps: number, amplitude = 4, periodS = 3, phase = 0) =>
  Math.sin(((frame / fps) * 2 * Math.PI) / periodS + phase) * amplitude;
