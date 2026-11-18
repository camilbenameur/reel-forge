// Scene "versus": before / after in two columns, with a cross (left) and a check mark (right).
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, CrossIcon, Frame, cardStyle, fade, float, useScene } from './kit';

interface Line {
  text: string;
  cue?: string;
}

interface Column {
  title: string;       // "BEFORE"
  lines: Line[];
}

interface Props {
  left: Column;
  right: Column;
  cue?: string;
}

const Versus: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const pL = s.spr(t0, 'snap');
  const pR = s.spr(t0 + 6, 'snap');
  const pVs = s.spr(t0 + 10, 'pop');
  const red = s.night ? '#FF6A45' : '#E3341A';
  const nL = props.left.lines.length;
  const rows = Math.max(nL, props.right.lines.length);
  const rowH = Math.min(132, 470 / Math.max(1, rows));
  const colW = 452;

  const Col: React.FC<{ col: Column; side: 'l' | 'r'; p: number }> = ({ col, side, p }) => {
    const good = side === 'r';
    const x = good ? 494 : 14;
    return (
      <div style={{ position: 'absolute', left: x, top: 70, width: colW, height: 620, opacity: fade(p), transform: `translateX(${(1 - p) * (good ? 120 : -120)}px) translateY(${float(s, 4, 3.4, good ? 1 : 0)}px) rotate(${good ? 0.8 : -0.8}deg)` }}>
        <div style={cardStyle(s, { position: 'absolute', inset: 0, overflow: 'hidden', borderColor: s.edge, background: good ? s.p.card : s.night ? 'rgba(255,255,255,0.03)' : '#EFEBE3' })}>
          <div style={{ padding: '20px 30px', background: good ? s.p.accent : s.night ? '#2A2A2A' : '#0A0A0A', color: good ? '#0A0A0A' : '#fff', fontFamily: FONTS.display, fontSize: 80, lineHeight: 1, textTransform: 'uppercase', letterSpacing: 2 }}>
            {col.title}
          </div>
          <div style={{ padding: '14px 26px' }}>
            {col.lines.map((l, i) => {
              const t = s.at(l.cue, t0 + 22 + i * 24 + (good ? 12 : 0));
              const pp = s.spr(t, 'pop');
              return (
                <div key={i} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 20, borderBottom: i < rows - 1 ? `2px dashed ${s.night ? 'rgba(244,242,238,0.15)' : 'rgba(10,10,10,0.14)'}` : 'none' }}>
                  <div style={{ flex: 'none', width: 64, height: 64, borderRadius: 18, background: good ? (s.night ? s.p.success : '#0A0A0A') : red, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: fade(pp), transform: `scale(${0.3 + 0.7 * Math.min(1.15, pp)}) rotate(${(1 - Math.min(1, pp)) * -40}deg)` }}>
                    {good ? <CheckIcon size={44} color={s.night ? '#0A0A0A' : '#fff'} draw={s.prog(t, 8)} stroke={7} /> : <CrossIcon size={40} color="#fff" draw={s.prog(t, 8)} stroke={7} />}
                  </div>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: 43, lineHeight: 1.08, letterSpacing: -0.4, color: good ? s.p.cardInk : s.p.muted, opacity: 0.3 + 0.7 * fade(pp), textDecoration: !good ? 'line-through' : 'none', textDecorationColor: red, textDecorationThickness: 3 }}>
                    {l.text}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Frame>
      <Col col={props.left} side="l" p={pL} />
      <Col col={props.right} side="r" p={pR} />
      <div style={{ position: 'absolute', left: 480 - 64, top: 590 - 64, width: 128, height: 128, borderRadius: 64, background: s.night ? s.p.accent : '#0A0A0A', color: s.night ? '#0A0A0A' : '#fff', border: `5px solid ${s.p.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: 62, boxShadow: `0 12px 24px ${s.p.shadow}`, opacity: fade(pVs), transform: `scale(${0.2 + 0.8 * pVs}) rotate(${(1 - pVs) * 90 + Math.sin(s.frame / 14) * 3}deg)`, zIndex: 5 }}>
        VS
      </div>
      <div style={{ position: 'absolute', left: 300, top: 8, width: 360, textAlign: 'center', fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 46, color: s.p.accent, opacity: fade(pVs), transform: `rotate(-3deg) translateY(${float(s, 4, 2.4)}px)` }}>
        the difference ↓
      </div>
    </Frame>
  );
};

export const versus: SceneDefinition<Props> = {
  type: 'versus',
  description:
    "Before / after (or old / new) comparison in two columns: struck-through lines with a red cross on the left, lines with a black check mark on the right, orange-red header, VS badge in the middle. Use it to contrast two methods, two results or a before and an after.",
  exampleProps: {
    left: {
      title: 'Before',
      lines: [
        { text: 'Filming for 3 hours', cue: 'l1' },
        { text: 'Editing by hand', cue: 'l2' },
        { text: '1 reel per week', cue: 'l3' },
      ],
    },
    right: {
      title: 'After',
      lines: [
        { text: 'One written idea', cue: 'r1' },
        { text: 'Automatic render', cue: 'r2' },
        { text: '1 reel per day', cue: 'r3' },
      ],
    },
  },
  cues: ['enter'],
  Component: Versus,
};
