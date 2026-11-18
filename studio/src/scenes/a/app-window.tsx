// Scene "app-window": application window (light, or dark terminal) whose lines are typed out.
import React from 'react';
import { FONTS } from '../../core/theme';
import { typed } from '../../core/motion';
import type { SceneDefinition } from '../contract';
import { Badge, Frame, TitleBar, cardStyle, fade, float, useScene } from './kit';

interface Line {
  text: string;
  cue?: string;
  tone?: 'normal' | 'accent' | 'ok' | 'muted';
  prefix?: string; // e.g. ">" or "✓" (text character, no emoji)
}

interface Props {
  title: string;
  variant?: 'light' | 'terminal';
  lines: Line[];
  prompt?: string;  // hint text of the input bar at the bottom
  badge?: number;   // numbered square badge at the top right
  cue?: string;
}

const CPS = 38;

const AppWindow: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const dark = (props.variant ?? 'light') === 'terminal';
  const t0 = s.at(props.cue ?? 'enter', 0);
  const p = s.spr(t0, 'soft');
  const pBadge = s.spr(t0 + 6, 'pop');

  // Typing start frames: the line's cue, otherwise right after the previous line.
  const starts: number[] = [];
  let prevEnd = t0 + 14;
  props.lines.forEach((l) => {
    const st = s.at(l.cue, prevEnd + 5);
    starts.push(st);
    prevEnd = st + Math.ceil((l.text.length / CPS) * s.fps);
  });
  const active = (() => {
    let a = -1;
    starts.forEach((st, i) => {
      if (s.frame >= st) a = i;
    });
    return a;
  })();

  const bg = dark ? '#101010' : s.p.card;
  const fg = dark ? '#ECEAE5' : s.p.cardInk;
  const tones: Record<string, string> = {
    normal: fg,
    accent: dark ? '#FF6A45' : s.p.accent,
    ok: dark ? '#57D68D' : s.p.success,
    muted: dark ? 'rgba(236,234,229,0.45)' : s.p.muted,
  };
  const barW = 920;

  return (
    <Frame>
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: 40,
          width: barW,
          height: 615,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 70 + float(s, 5)}px) scale(${0.92 + 0.08 * p})`,
        }}
      >
        {[{ r: 3, x: 16, y: 24 }, { r: -2.4, x: -12, y: 36 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, borderRadius: 24, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.75 * fade(p), background: dark ? '#262626' : s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div
          style={cardStyle(s, {
            position: 'absolute',
            inset: 0,
            background: bg,
            borderRadius: 24,
            overflow: 'hidden',
            borderColor: dark ? (s.night ? 'rgba(244,242,238,0.3)' : '#0A0A0A') : s.edge,
          })}
        >
          <TitleBar title={props.title} dark={dark} s={s} height={68} />
          <div style={{ padding: '26px 34px', fontFamily: FONTS.mono, fontSize: 38, lineHeight: '60px' }}>
            {props.lines.map((l, i) => {
              if (s.frame < starts[i]) return null;
              const txt = typed(s.frame, s.fps, starts[i], l.text, CPS);
              const done = txt.length >= l.text.length;
              const color = tones[l.tone ?? 'normal'];
              const caret = i === active && (!done || i === props.lines.length - 1) && Math.floor(s.frame / 8) % 2 === 0;
              return (
                <div key={i} style={{ color, whiteSpace: 'pre-wrap', minHeight: 60, fontWeight: l.tone === 'accent' ? 700 : 500 }}>
                  {l.prefix ? <span style={{ color: tones.accent, marginRight: 14 }}>{l.prefix}</span> : null}
                  {txt}
                  {caret ? (
                    <span style={{ display: 'inline-block', width: 20, height: 42, marginLeft: 3, verticalAlign: -8, background: dark ? '#ECEAE5' : s.p.accent }} />
                  ) : null}
                </div>
              );
            })}
          </div>
          <div style={{ position: 'absolute', right: 34, bottom: props.prompt ? 136 : 30, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 46, color: dark ? '#FF6A45' : s.p.accent, transform: `rotate(-3deg) translateY(${float(s, 3, 2.4, 1)}px)`, opacity: fade(s.spr(t0 + 30)) }}>
            types itself
          </div>
          {props.prompt ? (
            <div
              style={{
                position: 'absolute',
                left: 26,
                right: 26,
                bottom: 24,
                height: 88,
                borderRadius: 26,
                border: `2px solid ${dark ? 'rgba(255,255,255,0.18)' : s.night ? 'rgba(244,242,238,0.25)' : 'rgba(10,10,10,0.2)'}`,
                background: dark ? 'rgba(255,255,255,0.04)' : s.night ? 'rgba(255,255,255,0.04)' : '#FAF8F4',
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
                gap: 16,
                fontFamily: FONTS.sans,
                fontSize: 34,
                color: dark ? 'rgba(236,234,229,0.5)' : s.p.muted,
              }}
            >
              <span style={{ fontSize: 44, lineHeight: 1 }}>+</span>
              <span style={{ flex: 1 }}>{props.prompt}</span>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: s.p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={s.night ? '#0A0A0A' : '#fff'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20 V5 M5 12 L12 5 L19 12" />
                </svg>
              </div>
            </div>
          ) : null}
        </div>
        {props.badge !== undefined ? (
          <div style={{ position: 'absolute', right: -14, top: -64, opacity: fade(pBadge), transform: `scale(${0.2 + 0.8 * pBadge}) rotate(${(1 - pBadge) * 30}deg)` }}>
            <Badge n={props.badge} size={120} s={s} />
          </div>
        ) : null}
      </div>
    </Frame>
  );
};

export const appWindow: SceneDefinition<Props> = {
  type: 'app-window',
  description:
    "Application window (light) or dark terminal with a title bar, text lines typed out on their word, and an optional input bar and step badge. Use it to show a tool, a command or a configuration.",
  exampleProps: {
    title: 'ai-video — terminal',
    variant: 'terminal',
    lines: [
      { text: 'Checking your setup…', tone: 'muted', cue: 'line1' },
      { text: 'Node.js    v22.11  OK', tone: 'ok', prefix: '>', cue: 'line2' },
      { text: 'ffmpeg     ready   OK', tone: 'ok', prefix: '>', cue: 'line3' },
      { text: 'Cloned voice: to configure', tone: 'accent', prefix: '>', cue: 'line4' },
    ],
    prompt: 'What do you want to create?',
    badge: 2,
  },
  cues: ['enter'],
  Component: AppWindow,
};
