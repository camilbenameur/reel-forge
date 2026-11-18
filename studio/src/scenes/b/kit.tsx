// Small kit shared by the scenes of library B (cards, badges, labels, common icons).
import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { FONTS, palette, type Palette } from '../../core/theme';
import { drift, enter, springAt, type SpringName } from '../../core/motion';
import { SCENE_BOX, type SceneContext } from '../contract';

export interface Kit {
  frame: number;
  fps: number;
  p: Palette;
  night: boolean;
  onAccent: string;                 // text color readable on an accent background
  border: string;                   // card border color
  cue: (name: string | undefined, fallback: number) => number;
  sp: (at: number, kind?: SpringName) => number;
  ent: (at: number, kind?: SpringName, dist?: number) => React.CSSProperties;
  dr: (amp?: number, period?: number, phase?: number) => number;
}

export const useKit = (ctx: SceneContext): Kit => {
  const frame = useCurrentFrame();
  const fps = ctx.fps;
  const p = palette(ctx.theme);
  const night = ctx.theme === 'night';
  return {
    frame,
    fps,
    p,
    night,
    onAccent: night ? '#0A0A0A' : '#FFFFFF',
    border: night ? 'rgba(244,242,238,0.38)' : p.line,
    cue: (name, fb) => ctx.cue(name, fb),
    sp: (at, kind = 'snap') => springAt(frame, fps, at, kind),
    ent: (at, kind = 'snap', dist = 40) => enter(frame, fps, at, kind, dist),
    dr: (amp = 4, period = 3, phase = 0) => drift(frame, fps, amp, period, phase),
  };
};

// Root: places the scene in the usable area (coordinates of the 1080×1920 frame).
export const SceneRoot: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      left: SCENE_BOX.x,
      top: SCENE_BOX.y,
      width: SCENE_BOX.width,
      height: SCENE_BOX.height,
      fontFamily: FONTS.sans,
    }}
  >
    {children}
  </div>
);

export const cardStyle = (k: Kit, extra: React.CSSProperties = {}): React.CSSProperties => ({
  background: k.p.card,
  color: k.p.cardInk,
  border: `2.5px solid ${k.border}`,
  borderRadius: 24,
  boxShadow: `0 22px 40px -12px ${k.p.shadow}`,
  boxSizing: 'border-box',
  ...extra,
});

// Mono label in small caps.
export const Mono: React.FC<{ k: Kit; children?: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({
  k, children, size = 24, color, style,
}) => (
  <div style={{ fontFamily: FONTS.mono, fontSize: size, letterSpacing: 1.5, textTransform: 'uppercase', color: color ?? k.p.muted, fontWeight: 600, ...style }}>
    {children}
  </div>
);

// Numbered square badge (black, light text).
export const Badge: React.FC<{ k: Kit; children?: React.ReactNode; size?: number; fill?: string; color?: string; style?: React.CSSProperties }> = ({
  k, children, size = 64, fill, color, style,
}) => (
  <div
    style={{
      width: size, height: size, borderRadius: size * 0.2, background: fill ?? k.p.ink, color: color ?? k.p.bg,
      fontFamily: FONTS.display, fontSize: size * 0.62, display: 'flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, boxShadow: `0 8px 16px -6px ${k.p.shadow}`, ...style,
    }}
  >
    {children}
  </div>
);

export const CheckIcon: React.FC<{ size?: number; color: string; stroke?: number; progress?: number }> = ({ size = 40, color, stroke = 7, progress = 1 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <path d="M7 21 L17 31 L34 10" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
      pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, Math.max(0, progress))} />
  </svg>
);

// Stylized key (ring at the top, shaft pointing down), centered on the ring.
export const KeyGlyph: React.FC<{ fill: string; stroke: string; hole: string; width?: number }> = ({ fill, stroke, hole, width = 70 }) => (
  <svg width={width} height={width * 2.9} viewBox="-40 -40 80 232" fill="none" style={{ overflow: 'visible' }}>
    <path d="M-9 26 H9 V150 H27 V164 H9 V176 H-9 Z M9 112 H30 V126 H9 Z" fill={fill} stroke={stroke} strokeWidth={5} strokeLinejoin="round" />
    <circle cx={0} cy={0} r={34} fill={fill} stroke={stroke} strokeWidth={5} />
    <circle cx={0} cy={0} r={11} fill={hole} stroke={stroke} strokeWidth={4} />
  </svg>
);

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const prog = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

export { useCurrentFrame };
