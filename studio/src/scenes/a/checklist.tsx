// Scene "checklist": title, 0/4 counter and boxes that get checked on their word; items may be struck through.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Frame, Mono, cardStyle, fade, float, useScene } from './kit';

interface Item {
  text: string;
  cue?: string;
  struck?: boolean; // struck through once checked (what you no longer do)
}

interface Props {
  title: string;
  items: Item[];
  cue?: string;
}

const Checklist: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const p = s.spr(t0, 'soft');
  const times = props.items.map((it, i) => s.at(it.cue, t0 + 22 + i * 26));
  const nDone = times.filter((t) => s.frame >= t - 1).length;
  const rowH = Math.min(124, 430 / Math.max(1, props.items.length));
  return (
    <Frame>
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: 24,
          width: 920,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.93 + 0.07 * p}) rotate(${-0.8}deg)`,
        }}
      >
        {[{ r: 3.4, x: 14, y: 26, o: 0.6 }, { r: -2.2, x: -12, y: 14, o: 0.9 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, borderRadius: 30, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: c.o, background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'relative', padding: '30px 46px 22px', borderRadius: 30 })}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: `3px solid ${s.edge}`, paddingBottom: 14, marginBottom: 8 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 96, lineHeight: 1, color: s.p.cardInk, textTransform: 'uppercase' }}>{props.title}</div>
            <div
              style={{
                fontFamily: FONTS.mono,
                fontWeight: 700,
                fontSize: 58,
                color: nDone === props.items.length ? s.p.success : s.p.muted,
                transform: `scale(${1 + 0.25 * Math.max(0, 1 - Math.min(...times.map((t) => Math.abs(s.frame - t))) / 6)})`,
                transformOrigin: 'right bottom',
              }}
            >
              {nDone}/{props.items.length}
            </div>
          </div>
          {props.items.map((it, i) => {
            const pRow = s.spr(t0 + 6 + i * 3);
            const pc = s.spr(times[i], 'pop');
            const checked = s.frame >= times[i] - 1;
            const strike = it.struck ? s.prog(times[i] + 4, 10) : 0;
            return (
              <div key={i} style={{ height: rowH, display: 'flex', alignItems: 'center', gap: 28, opacity: fade(pRow), transform: `translateX(${(1 - pRow) * -50}px)` }}>
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 18,
                    border: `4px solid ${checked ? s.p.accent : s.edge}`,
                    background: checked ? s.p.accent : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 'none',
                    transform: `scale(${checked ? 0.85 + 0.15 * Math.min(pc, 1.3) : 1})`,
                  }}
                >
                  {checked ? <CheckIcon size={54} color={s.night ? '#0A0A0A' : '#fff'} draw={s.prog(times[i], 8)} stroke={7} /> : null}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.sans,
                    fontWeight: 700,
                    fontSize: 54,
                    letterSpacing: -0.6,
                    color: checked && it.struck ? s.p.muted : s.p.cardInk,
                    backgroundImage: `linear-gradient(${s.p.accent}, ${s.p.accent})`,
                    backgroundSize: `${strike * 100}% 6px`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'left 54%',
                  }}
                >
                  {it.text}
                </div>
              </div>
            );
          })}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ flex: 1, height: 14, borderRadius: 7, background: s.night ? 'rgba(244,242,238,0.15)' : 'rgba(10,10,10,0.10)', overflow: 'hidden' }}>
              <div style={{ width: `${(Math.min(...[nDone]) / Math.max(1, props.items.length)) * 100}%`, height: '100%', background: s.p.accent }} />
            </div>
            <Mono s={s} size={28}>
              // {nDone === props.items.length ? 'all checked' : 'in progress'}
            </Mono>
          </div>
          <div style={{ position: 'absolute', right: -6, top: -52, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 46, color: s.p.accent, transform: `rotate(5deg) translateY(${float(s, 4, 2.4, 1)}px)` }}>to check ↓</div>
        </div>
      </div>
    </Frame>
  );
};

export const checklist: SceneDefinition<Props> = {
  type: 'checklist',
  description:
    "Checklist with a title and a 0/4 counter: each box gets checked on its word, and an item can be struck through. Use it to list conditions, prerequisites or things to do or to stop doing.",
  exampleProps: {
    title: 'Before publishing',
    items: [
      { text: 'A hook in 1 second', cue: 'box1' },
      { text: 'A single idea', cue: 'box2' },
      { text: 'Readable captions', cue: 'box3' },
      { text: 'Filming everything yourself', cue: 'box4', struck: true },
    ],
  },
  cues: ['enter'],
  Component: Checklist,
};
