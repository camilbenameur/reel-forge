// Scene "step-grid": grid of 2 to 6 numbered cards that light up one by one.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Badge, Frame, Mono, cardStyle, fade, float, useScene } from './kit';

interface Card {
  title: string;
  number?: number;
  cue?: string;
}

interface Props {
  title: string;
  cards: Card[];
  cue?: string; // grid appearance
}

const StepGrid: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const cards = props.cards.slice(0, 6);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const lights = cards.map((c, i) => s.at(c.cue, t0 + 14 + i * 20));
  const nLit = lights.filter((t) => s.frame >= t - 2).length;
  const rows = Math.ceil(cards.length / 2);
  const gap = 22;
  const gridTop = 140;
  const cardH = Math.min(230, (545 - gap * (rows - 1)) / rows);
  const cardW = 462;
  const pTitle = s.spr(t0);
  return (
    <Frame>
      <div
        style={{
          position: 'absolute',
          left: 10,
          right: 10,
          top: 6,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          opacity: fade(pTitle),
          transform: `translateY(${(1 - pTitle) * 30}px)`,
        }}
      >
        <div style={{ fontFamily: FONTS.display, fontSize: 120, lineHeight: 1, color: s.p.ink, textTransform: 'uppercase' }}>{props.title}</div>
        <div style={{ paddingBottom: 14 }}>
          <Mono s={s} size={42} color={s.p.muted}>
            {nLit}/{cards.length}
          </Mono>
        </div>
      </div>
      {cards.map((c, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const pIn = s.spr(t0 + 4 + i * 3);
        const lit = s.spr(lights[i], 'pop');
        const isLast = nLit - 1 === i;
        const x = 12 + col * (cardW + 12);
        const y = gridTop + row * (cardH + gap);
        const on = Math.min(1, Math.max(0, lit));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: cardW,
              height: cardH,
              opacity: fade(pIn),
              transform: `translateY(${(1 - pIn) * 40 + float(s, 3, 3.2, i * 1.1)}px) scale(${(0.94 + 0.06 * on) * (1 + 0.05 * Math.max(0, lit - 1))})`,
            }}
          >
            <div
              style={cardStyle(s, {
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '0 22px',
                borderRadius: 26,
                background: on > 0.5 ? s.p.card : s.night ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.45)',
                borderColor: isLast ? s.p.accent : on > 0.5 ? s.edge : s.night ? 'rgba(244,242,238,0.12)' : 'rgba(10,10,10,0.18)',
                boxShadow: on > 0.5 ? `0 18px 36px ${s.p.shadow}` : 'none',
              })}
            >
              <div style={{ opacity: 0.35 + 0.65 * on }}>
                <Badge n={c.number ?? i + 1} size={100} s={s} color={isLast ? s.p.accent : undefined} />
              </div>
              <div
                style={{
                  flex: 1,
                  fontFamily: FONTS.display,
                  fontSize: 50,
                  lineHeight: 1.02,
                  textTransform: 'uppercase',
                  color: on > 0.5 ? s.p.cardInk : s.p.muted,
                }}
              >
                {c.title}
              </div>
              {on > 0.5 ? (
                <svg width="46" height="46" viewBox="0 0 40 40" fill="none" style={{ position: 'absolute', right: 16, top: 12, opacity: Math.min(1, on) }}>
                  <path d="M7 21 L17 31 L34 10" stroke={isLast ? s.p.accent : s.p.success} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
              {isLast ? (
                <div style={{ position: 'absolute', right: 14, bottom: 8, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 34, color: s.p.accent, transform: 'rotate(-4deg)' }}>here!</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </Frame>
  );
};

export const stepGrid: SceneDefinition<Props> = {
  type: 'step-grid',
  description:
    "Grid of 2 to 6 numbered cards (\"6 STEPS\") that light up one by one on the word of each step, with a counter. Use it for a plan, a recap or a list of enumerated steps.",
  exampleProps: {
    title: '6 STEPS',
    cards: [
      { title: 'Hook in 1 sec', cue: 'step1' },
      { title: 'Short script', cue: 'step2' },
      { title: 'Cloned voice', cue: 'step3' },
      { title: 'Animated scenes', cue: 'step4' },
      { title: 'Captions', cue: 'step5' },
      { title: 'Publishing', cue: 'step6' },
    ],
  },
  cues: ['enter'],
  Component: StepGrid,
};
