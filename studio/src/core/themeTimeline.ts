// Current theme of a reel: base theme, forced by SceneSpec.theme during a scene, with an
// animated switch (BLEND_FRAMES frames). Pure functions of the frame: deterministic render.
import { interpolate, interpolateColors } from 'remotion';
import { PALETTES, type Palette } from './theme';
import type { SceneSpec, Theme } from './types';

export const BLEND_FRAMES = 7;

interface ThemeEvent {
  frame: number;
  theme: Theme;
}

export const sceneFrames = (spec: SceneSpec, fps: number) => {
  const from = Math.round(spec.start * fps);
  const to = Math.max(from + 1, Math.round(spec.end * fps));
  return { from, duration: to - from };
};

// Theme change events, sorted by frame.
export const themeEvents = (base: Theme, scenes: SceneSpec[], fps: number): ThemeEvent[] => {
  const events: ThemeEvent[] = [{ frame: 0, theme: base }];
  const sorted = [...scenes].sort((a, b) => a.start - b.start);
  for (const s of sorted) {
    const { from, duration } = sceneFrames(s, fps);
    events.push({ frame: from, theme: s.theme ?? base });
    events.push({ frame: from + duration, theme: base });
  }
  // A scene-end event on the same frame as the start of the next one is overwritten by it
  // (stable sort: the start of the next scene is inserted after).
  const out: ThemeEvent[] = [];
  for (const e of events.sort((a, b) => a.frame - b.frame)) {
    const last = out[out.length - 1];
    if (last && last.frame === e.frame) out[out.length - 1] = e;
    else if (!last || last.theme !== e.theme) out.push(e);
  }
  return out;
};

// 0 = paper, 1 = night, intermediate values during the switch.
export const nightAt = (events: ThemeEvent[], frame: number): number => {
  let i = 0;
  for (let k = 0; k < events.length; k++) if (events[k].frame <= frame) i = k;
  const cur = events[i];
  const curV = cur.theme === 'night' ? 1 : 0;
  if (i === 0) return curV;
  const prevV = events[i - 1].theme === 'night' ? 1 : 0;
  return interpolate(frame, [cur.frame, cur.frame + BLEND_FRAMES], [prevV, curV], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

export const themeOfNight = (night: number): Theme => (night > 0.5 ? 'night' : 'paper');

// Interpolated palette (CSS colors) between paper and night.
export const blendPalette = (night: number): Palette => {
  if (night <= 0) return PALETTES.paper;
  if (night >= 1) return PALETTES.night;
  const out = {} as Record<keyof Palette, string>;
  (Object.keys(PALETTES.paper) as (keyof Palette)[]).forEach((k) => {
    out[k] = interpolateColors(night, [0, 1], [PALETTES.paper[k], PALETTES.night[k]]);
  });
  return out;
};
