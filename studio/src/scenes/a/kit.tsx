// Toolkit shared by the library A scenes: frame, cards, badges, icons, cursor.
// Everything is a pure function of the current frame (no randomness, no clock).
import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { FONTS, palette, type Palette } from '../../core/theme';
import { drift, springAt, type SpringName } from '../../core/motion';
import { SCENE_BOX, type SceneContext } from '../contract';

export interface Scene {
  frame: number;
  fps: number;
  p: Palette;
  night: boolean;
  edge: string; // color of the thin borders
  at: (name?: string, fallback?: number) => number;
  // spring 0 → 1 (with overshoot) starting on the cue
  spr: (at: number, kind?: SpringName) => number;
  // progress 0 → 1 between `from` and `from + dur` frames
  prog: (from: number, dur: number, easing?: (t: number) => number) => number;
}

export const useScene = (ctx: SceneContext): Scene => {
  const frame = useCurrentFrame();
  const p = palette(ctx.theme);
  const night = ctx.theme === 'night';
  return {
    frame,
    fps: ctx.fps,
    p,
    night,
    edge: night ? 'rgba(244,242,238,0.30)' : '#0A0A0A',
    at: (name, fallback = 0) => ctx.cue(name, fallback),
    spr: (at, kind = 'snap') => springAt(frame, ctx.fps, at, kind),
    prog: (from, dur, easing = Easing.out(Easing.cubic)) =>
      interpolate(frame, [from, from + Math.max(1, dur)], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing,
      }),
  };
};

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Entrance opacity tied to a spring.
export const fade = (p: number) => clamp01(p / 0.4);

// Scene frame: 960 x 760 px local coordinate space placed in SCENE_BOX.
export const Frame: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      position: 'absolute',
      left: SCENE_BOX.x,
      top: SCENE_BOX.y,
      width: SCENE_BOX.width,
      height: SCENE_BOX.height,
      ...style,
    }}
  >
    {children}
  </div>
);

export const W = SCENE_BOX.width;
export const H = SCENE_BOX.height;

export const cardStyle = (s: Scene, extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: s.p.card,
  border: `3px solid ${s.edge}`,
  borderRadius: 28,
  boxShadow: `0 22px 44px ${s.p.shadow}`,
  boxSizing: 'border-box',
  ...extra,
});

// Absolute position centered on (cx, cy).
export const at2 = (cx: number, cy: number, w: number, h: number): React.CSSProperties => ({
  position: 'absolute',
  left: cx - w / 2,
  top: cy - h / 2,
  width: w,
  height: h,
});

export const Badge: React.FC<{ n: number | string; size?: number; s: Scene; color?: string }> = ({
  n,
  size = 84,
  s,
  color,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.2,
      background: color ?? (s.night ? s.p.accent : '#0A0A0A'),
      color: s.night && !color ? '#0A0A0A' : '#FFFFFF',
      fontFamily: FONTS.display,
      fontSize: size * 0.62,
      lineHeight: `${size}px`,
      textAlign: 'center',
      boxShadow: `0 8px 18px ${s.p.shadow}`,
    }}
  >
    {n}
  </div>
);

export const Mono: React.FC<{
  children: React.ReactNode;
  s: Scene;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, s, size = 24, color, style }) => (
  <span
    style={{
      fontFamily: FONTS.mono,
      fontSize: size,
      color: color ?? s.p.muted,
      letterSpacing: 0.5,
      ...style,
    }}
  >
    {children}
  </span>
);

// ---------- icons ----------

export const CheckIcon: React.FC<{ size?: number; color?: string; draw?: number; stroke?: number }> = ({
  size = 40,
  color = '#1F9D55',
  draw = 1,
  stroke = 6,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: 'block' }}>
    <path
      d="M7 21 L17 31 L34 10"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={50}
      strokeDashoffset={50 * (1 - clamp01(draw))}
    />
  </svg>
);

export const CrossIcon: React.FC<{ size?: number; color?: string; draw?: number; stroke?: number }> = ({
  size = 40,
  color = '#FF4A20',
  draw = 1,
  stroke = 6,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none" style={{ display: 'block' }}>
    <path d="M9 9 L31 31" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={32} strokeDashoffset={32 * (1 - clamp01(draw * 2))} />
    <path d="M31 9 L9 31" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={32} strokeDashoffset={32 * (1 - clamp01(draw * 2 - 1))} />
  </svg>
);

export const Spinner: React.FC<{ size?: number; color: string; frame: number }> = ({ size = 32, color, frame }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ display: 'block', transform: `rotate(${frame * 14}deg)` }}>
    <circle cx="20" cy="20" r="14" stroke={color} strokeOpacity={0.25} strokeWidth={5} fill="none" />
    <path d="M20 6 A14 14 0 0 1 34 20" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none" />
  </svg>
);

// Mouse cursor (black arrow with a white outline). The tip is at (x, y).
export const Cursor: React.FC<{ x: number; y: number; scale?: number }> = ({ x, y, scale = 1 }) => (
  <svg
    width={56}
    height={64}
    viewBox="0 0 28 32"
    style={{
      position: 'absolute',
      left: x - 2 * 2,
      top: y - 2 * 2,
      overflow: 'visible',
      transform: `scale(${scale})`,
      transformOrigin: '4px 4px',
      filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.35))',
      zIndex: 50,
    }}
  >
    <path d="M2 2 L2 24 L8 18.5 L12.5 28.5 L17 26.5 L12.6 16.8 L21 16.5 Z" fill="#0A0A0A" stroke="#FFFFFF" strokeWidth={2} strokeLinejoin="round" />
  </svg>
);

// Click ripple: a ring that grows and fades out. `t` in frames since the click.
export const Ripple: React.FC<{ x: number; y: number; t: number; color: string; size?: number }> = ({
  x,
  y,
  t,
  color,
  size = 150,
}) => {
  if (t < 0 || t > 22) return null;
  const k = t / 22;
  const r = 12 + size * Easing.out(Easing.cubic)(k);
  return (
    <svg
      style={{ position: 'absolute', left: x - size, top: y - size, width: size * 2, height: size * 2, overflow: 'visible', zIndex: 40 }}
      viewBox={`${-size} ${-size} ${size * 2} ${size * 2}`}
    >
      <circle r={r} fill="none" stroke={color} strokeWidth={6 * (1 - k) + 1} opacity={1 - k} />
      <circle r={r * 0.55} fill={color} opacity={0.25 * (1 - k)} />
    </svg>
  );
};

// Number formatted in English: 2,396,686 (comma thousands separator, dot decimals).
export const fmtNum = (n: number, decimals = 0): string => {
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '−' : '') + grouped + (dec ? '.' + dec : '');
};

// Constant slight vertical float of the main object.
export const float = (s: Scene, amp = 6, period = 3.4, phase = 0) => drift(s.frame, s.fps, amp, period, phase);

// Title bar with 3 dots (application window).
export const TitleBar: React.FC<{ title: string; dark?: boolean; s: Scene; height?: number }> = ({
  title,
  dark,
  s,
  height = 56,
}) => (
  <div
    style={{
      height,
      display: 'flex',
      alignItems: 'center',
      padding: '0 22px',
      gap: 10,
      borderBottom: `2px solid ${dark ? 'rgba(255,255,255,0.10)' : s.night ? 'rgba(244,242,238,0.15)' : 'rgba(10,10,10,0.12)'}`,
    }}
  >
    {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
      <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
    ))}
    <div style={{ marginLeft: 14, fontFamily: FONTS.mono, fontSize: 22, color: dark ? 'rgba(255,255,255,0.55)' : s.p.muted }}>{title}</div>
  </div>
);
