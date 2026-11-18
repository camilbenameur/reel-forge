// Scene "stack-cards": stack of cards/documents that fans out.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Badge, Mono, SceneRoot, prog, useKit } from './kit';

interface StackProps {
  cards: { title: string; sub?: string; tag?: string; cue?: string }[];
  cueFan?: string;
}

const StackCards: SceneDefinition<StackProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const cards = props.cards.slice(0, 6);
  const n = cards.length;
  const cues = cards.map((c, i) => k.cue(c.cue, 6 + i * 8));
  const fanAt = k.cue(props.cueFan ?? 'fan', Math.max(...cues) + 22);
  const fan = Math.min(1.12, k.sp(fanAt, 'pop'));
  const step = Math.min(15, 60 / Math.max(1, n - 1));
  const CW = 360;
  const CH = 520;
  const tSize = n <= 3 ? 64 : n === 4 ? 58 : n === 5 ? 54 : 46;
  return (
    <SceneRoot>
      {cards.map((c, i) => {
        const mid = (n - 1) / 2;
        const u = Math.min(1.1, k.sp(cues[i], 'snap'));
        const stacked = { rot: (i - mid) * 1.4, x: (i % 2 ? 1 : -1) * 4, y: -i * 3 };
        const fanned = { rot: (i - mid) * step, x: 0, y: 0 };
        const rot = stacked.rot + (fanned.rot - stacked.rot) * fan + k.dr(0.8, 3.2, i);
        const last = i === n - 1;
        const dropY = (1 - Math.min(u, 1)) * -520;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: 480 - CW / 2 + stacked.x, top: 50 + stacked.y + dropY, width: CW, height: CH, transformOrigin: `50% ${CH + 100}px`,
              transform: `rotate(${rot}deg) translateY(${(1 - Math.min(fan, 1)) * 0}px)`, opacity: Math.min(1, u * 3), zIndex: i,
              background: p.card, color: p.cardInk, border: `2.5px solid ${k.border}`, borderRadius: 22, boxShadow: `0 20px 30px -12px ${p.shadow}`, boxSizing: 'border-box', overflow: 'hidden',
            }}
          >
            <div style={{ minHeight: 200, background: last ? p.accent : p.ink, display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 18px 14px' }}>
              <Badge k={k} size={64} fill={last ? '#0A0A0A' : p.accent} color={last ? '#F4F2EE' : k.onAccent} style={{ boxShadow: 'none', flex: 'none', fontSize: 42 }}>{i + 1}</Badge>
              <div style={{ fontFamily: FONTS.display, fontSize: tSize, textTransform: 'uppercase', color: last ? k.onAccent : p.bg, lineHeight: 1, overflowWrap: 'anywhere' }}>{c.title}</div>
            </div>
            <div style={{ padding: '16px 18px' }}>
              {c.tag && <Mono k={k} size={28}>{c.tag}</Mono>}
              {c.sub && <div style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: Math.round(tSize * 1.1), color: p.accent, marginTop: 4, lineHeight: 1 }}>{c.sub}</div>}
              <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[100, 86, 64].map((w, j) => <div key={j} style={{ width: `${w}%`, height: 14, borderRadius: 7, background: p.muted, opacity: 0.55 }} />)}
              </div>
            </div>
            <div style={{ position: 'absolute', right: 20, bottom: 20, opacity: prog(frame, fanAt, fanAt + 10) }}>
              <div style={{ width: 34, height: 34, borderRadius: 17, border: `3px solid ${k.border}` }} />
            </div>
          </div>
        );
      })}
    </SceneRoot>
  );
};

export const stackCardsScene: SceneDefinition<StackProps> = {
  type: 'stack-cards',
  description: "Stack of numbered cards or documents that drop onto each other then fan out: several options, several formats, \"something for every taste\".",
  exampleProps: {
    cards: [
      { title: 'Hook', sub: 'one second', tag: 'step' },
      { title: 'Script', sub: 'short', tag: 'step' },
      { title: 'Voice', sub: 'cloned', tag: 'step' },
      { title: 'Scenes', sub: 'animated', tag: 'step' },
      { title: 'Render', sub: 'in 4K', tag: 'final' },
    ],
  },
  cues: ['fan'],
  Component: StackCards,
};
