// Scene "cursor-click": a cursor follows a path and clicks (ripple) a button, which changes state.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Cursor, Frame, Mono, Ripple, cardStyle, fade, float, useScene } from './kit';

interface Point {
  x: number; // 0 to 1 within the scene box
  y: number;
}

interface Props {
  title?: string;          // title of the interface card
  button: string;          // label of the clicked button
  result?: string;       // label after the click
  secondary?: string[];  // decorative "ghost" buttons
  path?: Point[];        // cursor path (the last point is snapped onto the button)
  cue?: string;            // interface entrance
  cueStart?: string;      // cursor start
  cueClick?: string;        // click moment
}

const BTN = { cx: 480, cy: 365, w: 660, h: 180 };

// Catmull-Rom spline through all the points, u in [0,1].
const spline = (pts: { x: number; y: number }[], u: number) => {
  const n = pts.length - 1;
  const f = Math.min(n - 1e-6, Math.max(0, u * n));
  const i = Math.floor(f);
  const t = f - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[Math.min(n, i + 1)];
  const p3 = pts[Math.min(n, i + 2)];
  const c = (a: number, b: number, c2: number, d: number) =>
    0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t * t + (-a + 3 * b - 3 * c2 + d) * t * t * t);
  return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) };
};

const CursorClick: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tStart = s.at(props.cueStart ?? 'start', t0 + 16);
  const tClick = s.at(props.cueClick ?? 'click', tStart + 40);
  const p = s.spr(t0, 'soft');
  const base = props.path ?? [
    { x: 1.0, y: 0.98 },
    { x: 0.85, y: 0.62 },
    { x: 0.62, y: 0.38 },
  ];
  const pts = base.map((q) => ({ x: q.x * 960, y: q.y * 760 }));
  pts.push({ x: BTN.cx + 80, y: BTN.cy + 50 });
  const u = interpolate(s.frame, [tStart, tClick], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const pos = spline(pts, u);
  const after = s.frame - tClick;
  const clicked = after >= 0;
  // after the click the cursor drifts gently
  const dx = clicked ? Math.min(1, after / 30) * 70 : 0;
  const dy = clicked ? Math.min(1, after / 30) * 50 : 0;
  const press = Math.max(0, 1 - Math.abs(after) / 4);
  const dist = Math.hypot(pos.x - BTN.cx, pos.y - BTN.cy);
  const hover = interpolate(dist, [120, 320], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const pOut = s.spr(tClick + 2, 'pop');
  const curVis = fade(s.spr(tStart - 4));
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 20, top: 24, width: 920, height: 635, opacity: fade(p), transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.94 + 0.06 * p})` }}>
        {[{ r: 3, x: 16, y: 22 }, { r: -2.4, x: -12, y: 32 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0 })}>
          <div style={{ padding: '28px 36px', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 70, textTransform: 'uppercase', color: s.p.cardInk }}>{props.title ?? 'New video'}</div>
            <Mono s={s} size={32}>
              // ready
            </Mono>
          </div>
          <div style={{ position: 'absolute', left: 36, top: 130, display: 'flex', gap: 12 }}>
            {['script', 'voice', 'scenes'].map((l, i) => (
              <div key={l} style={{ fontFamily: FONTS.mono, fontSize: 28, padding: '6px 18px', borderRadius: 14, background: s.night ? 'rgba(255,255,255,0.07)' : '#EFEBE3', color: s.p.muted, opacity: fade(s.spr(t0 + 10 + i * 3)) }}>{l}</div>
            ))}
          </div>
          <div style={{ position: 'absolute', right: 40, top: 150, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 52, color: s.p.accent, opacity: clicked ? 0 : fade(s.spr(t0 + 14)), transform: `rotate(4deg) translateY(${float(s, 4, 2.2)}px)` }}>
            one click ↓
          </div>
        </div>
      </div>
      {/* ghost secondary buttons */}
      {(props.secondary ?? []).slice(0, 2).map((l, i) => {
        const pp = s.spr(t0 + 8 + i * 4);
        return (
          <div key={i} style={{ position: 'absolute', left: i ? 490 : 70, top: 520, width: 400, height: 100, borderRadius: 26, border: `3px solid ${s.night ? 'rgba(244,242,238,0.3)' : 'rgba(10,10,10,0.25)'}`, color: s.p.muted, fontFamily: FONTS.sans, fontWeight: 700, fontSize: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: fade(pp) * 0.9, transform: `translateY(${(1 - pp) * 40 + float(s, 3, 3, i)}px)` }}>
            {l}
          </div>
        );
      })}
      {/* main button */}
      <div
        style={{
          position: 'absolute',
          left: BTN.cx - BTN.w / 2,
          top: BTN.cy - BTN.h / 2 + float(s, 4) - 10 * hover * (clicked ? 0 : 1),
          width: BTN.w,
          height: BTN.h,
          borderRadius: 46,
          background: clicked ? s.p.success : s.p.accent,
          color: s.night ? '#0A0A0A' : '#FFFFFF',
          fontFamily: FONTS.sans,
          fontWeight: 800,
          fontSize: 76,
          letterSpacing: -1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          border: `3px solid ${s.night ? 'rgba(255,255,255,0.4)' : '#0A0A0A'}`,
          boxShadow: `0 ${18 + 12 * hover}px ${30 + 20 * hover}px ${s.p.shadow}, 0 0 0 ${hover * 10}px ${s.night ? 'rgba(254,237,102,0.18)' : 'rgba(255,74,32,0.16)'}`,
          opacity: fade(s.spr(t0 + 6)),
          transform: `scale(${(0.9 + 0.1 * Math.min(1, s.spr(t0 + 6))) * (1 - 0.07 * press) * (1 + 0.05 * hover)})`,
        }}
      >
        {clicked ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${0.6 + 0.4 * Math.min(1.2, pOut)})` }}>
            <CheckIcon size={88} color={s.night ? '#0A0A0A' : '#fff'} draw={s.prog(tClick, 8)} stroke={7} />
            {props.result ?? props.button}
          </span>
        ) : (
          props.button
        )}
      </div>
      <Ripple x={BTN.cx + 80} y={BTN.cy + 50} t={after} color={s.night ? s.p.accent : '#0A0A0A'} size={200} />
      <div style={{ opacity: curVis }}>
        <Cursor x={pos.x + dx} y={pos.y + dy + float(s, 2, 2.2)} scale={1 - 0.2 * press} />
      </div>
    </Frame>
  );
};

export const cursorClick: SceneDefinition<Props> = {
  type: 'cursor-click',
  description:
    "A mouse cursor follows a smooth path to a big button, clicks (ripple, press effect) and the button switches to a \"done\" state. Use it for \"click here\", launching an action, showing that a step gets triggered.",
  exampleProps: {
    title: 'New video',
    button: 'Generate',
    result: 'Generated',
    secondary: ['Import a script', 'Pick a voice'],
  },
  cues: ['enter', 'start', 'click'],
  Component: CursorClick,
};
