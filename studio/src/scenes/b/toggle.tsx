// Scene "toggle": settings whose switches flip, one of them highlighted with a stamp.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface ToggleProps {
  title: string;
  rows: { label: string; hint?: string; cue?: string; focus?: boolean; active?: boolean }[];
  stamp?: string;   // "ENABLED"
}

const ToggleScene: SceneDefinition<ToggleProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const cardU = Math.min(1, k.sp(k.cue('card', 0), 'soft'));
  const lines = props.rows;
  const rowH = 160;
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 10, top: 40, width: 940, ...cardStyle(k, { padding: '24px 34px 14px' }), opacity: cardU, transform: `translateY(${(1 - cardU) * 40}px)` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 66, textTransform: 'uppercase' }}>{props.title}</div>
          <div style={{ display: 'flex', gap: 8 }}>{[0, 1, 2].map((i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 5, background: p.muted }} />)}</div>
        </div>
        {lines.map((l, i) => {
          const at = k.cue(l.cue, 24 + i * 22);
          const t = prog(frame, at - 2, at + 7);
          const on = (l.active ?? true) ? t : 0;
          const pop = k.sp(at, 'pop');
          const big = !!l.focus;
          const tw = big ? 220 : 160;
          const th = big ? 120 : 86;
          const kn = th - 14;
          const bump = Math.max(0, Math.min(1, pop) - 0) && Math.max(0, pop - 1);
          return (
            <div
              key={i}
              style={{
                height: big ? rowH + 30 : rowH - 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `2px ${i ? 'dashed' : 'solid'} ${p.line}22`, position: 'relative',
                background: big ? `${p.accent}${k.night ? '22' : '14'}` : 'transparent', margin: big ? '0 -34px' : 0, padding: big ? '0 34px' : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <div style={{ width: big ? 92 : 76, height: big ? 92 : 76, borderRadius: 22, background: big ? p.accent : (k.night ? '#2A2926' : '#EFECE6'), border: `3px solid ${k.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', transform: `rotate(${k.dr(3, 3, i)}deg)` }}>
                  <svg width={big ? 54 : 44} height={big ? 54 : 44} viewBox="0 0 40 40" fill="none" stroke={big ? k.onAccent : p.cardInk} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                    {i % 3 === 0 && <><path d="M20 6 C12 6 9 12 9 18 V25 L5 30 H35 L31 25 V18 C31 12 28 6 20 6 Z" /><path d="M16 34 a4 4 0 0 0 8 0" /></>}
                    {i % 3 === 1 && <path d="M23 4 L8 23 H19 L16 36 L32 16 H21 Z" fill={big ? k.onAccent : p.accent} />}
                    {i % 3 === 2 && <><path d="M7 7 H27 L33 13 V33 H7 Z" /><path d="M13 7 V16 H25 V7" /><rect x={12} y={23} width={16} height={10} /></>}
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: big ? 58 : 48, letterSpacing: -0.5, lineHeight: 1.05 }}>{l.label}</div>
                  {l.hint && <Mono k={k} size={28} style={{ marginTop: 4 }}>{l.hint}</Mono>}
                </div>
              </div>
              <div style={{ position: 'relative' }}>
                <div style={{ width: tw, height: th, borderRadius: th / 2, background: on > 0.5 ? (big ? p.accent : p.success) : (k.night ? '#3A3834' : '#D5D1CA'), border: `3px solid ${k.border}`, position: 'relative', transition: 'none' }}>
                  <div
                    style={{
                      position: 'absolute', top: 4, left: 4 + (tw - kn - 14) * on, width: kn, height: kn, borderRadius: kn / 2, background: '#fff', border: `3px solid ${k.night ? '#0A0A0A' : '#0A0A0A'}`,
                      boxShadow: '0 6px 10px rgba(0,0,0,.28)', transform: `scaleX(${1 + 0.25 * Math.sin(on * Math.PI)}) scale(${1 + 0.1 * bump})`,
                    }}
                  />
                </div>
                {big && on > 0 && (
                  <div style={{ position: 'absolute', left: -20, top: -24, width: tw + 40, height: th + 48, borderRadius: (th + 48) / 2, border: `5px solid ${p.accent}`, opacity: 1 - prog(frame, at, at + 16), transform: `scale(${1 + 0.25 * prog(frame, at, at + 16)})` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {props.stamp && (() => {
        const idx = Math.max(0, lines.findIndex((l) => l.focus));
        const at = k.cue('stamp', k.cue(lines[idx]?.cue, 24 + idx * 22) + 8);
        const s = k.sp(at, 'pop');
        return (
          <div
            style={{
              position: 'absolute', right: 70, top: 4, border: `6px solid ${p.accent}`, color: p.accent, fontFamily: FONTS.display, fontSize: 72, padding: '4px 26px 8px', borderRadius: 12, letterSpacing: 3,
              transform: `rotate(-9deg) scale(${Math.min(1.2, 0.4 + 0.6 * s) + (s < 1 ? (1 - s) * 0.6 : 0)})`, opacity: Math.min(1, s * 3), background: `${p.bg}CC`,
            }}
          >
            {props.stamp}
          </div>
        );
      })()}
    </SceneRoot>
  );
};

export const toggleScene: SceneDefinition<ToggleProps> = {
  type: 'toggle',
  description: "Settings card whose switches flip to orange/green, one of them enlarged with an \"ENABLED\" stamp: turn on an option, a mode, a hidden trick.",
  exampleProps: {
    title: 'Settings',
    rows: [
      { label: 'Notifications', hint: 'all the time' },
      { label: 'Agent mode', hint: 'the right setting', focus: true },
      { label: 'Auto-save', hint: 'every 5 min' },
    ],
    stamp: 'ENABLED',
  },
  cues: ['card', 'stamp'],
  Component: ToggleScene,
};
