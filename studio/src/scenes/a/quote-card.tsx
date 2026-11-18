// Scene "quote-card": quotation in curly quotes, source, and one word highlighted with a marker.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, Mono, cardStyle, fade, float, useScene } from './kit';

interface Props {
  quote: string;
  source: string;          // "Warren Buffett, 1996"
  highlight?: string;    // word of the quote to highlight
  cue?: string;            // card entrance
  cueHighlight?: string;    // marker sweep over the word
}

const strip = (w: string) => w.replace(/[.,;:!?…"“”()]/g, '').toLowerCase();

const QuoteCard: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const words = props.quote.split(' ');
  const n = props.quote.length;
  const fs = n < 60 ? 112 : n < 110 ? 92 : 74;
  const step = Math.max(2, Math.min(5, Math.round(80 / words.length)));
  const lastWordAt = t0 + 10 + words.length * step;
  const tMark = s.at(props.cueHighlight ?? 'highlight', lastWordAt + 6);
  const p = s.spr(t0, 'soft');
  const pQuote = s.spr(t0 + 2, 'pop');
  const mark = s.prog(tMark, 12);
  const target = props.highlight ? strip(props.highlight) : '';
  const pSrc = s.spr(lastWordAt + 2);
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 20, top: 70, width: 920, opacity: fade(p), transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.95 + 0.05 * p}) rotate(-0.6deg)` }}>
        {[{ r: 3.4, x: 16, y: 24 }, { r: -2.6, x: -12, y: 34 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { padding: '40px 56px 50px', position: 'relative', overflow: 'visible', minHeight: 500, boxSizing: 'border-box' })}>
          <div style={{ position: 'absolute', right: 30, bottom: -60, fontFamily: FONTS.serif, fontSize: 420, lineHeight: 1, color: s.p.accent, opacity: 0.1 }}>”</div>
          <div
            style={{
              position: 'absolute',
              left: 30,
              top: -52,
              width: 140,
              height: 140,
              borderRadius: 30,
              background: s.p.accent,
              color: s.night ? '#0A0A0A' : '#fff',
              fontFamily: FONTS.serif,
              fontSize: 180,
              lineHeight: '180px',
              textAlign: 'center',
              border: `3px solid ${s.night ? 'rgba(255,255,255,0.4)' : '#0A0A0A'}`,
              boxShadow: `0 12px 24px ${s.p.shadow}`,
              opacity: fade(pQuote),
              transform: `scale(${0.3 + 0.7 * pQuote}) rotate(${(1 - pQuote) * -30}deg)`,
            }}
          >
            <span style={{ position: 'relative', top: -26 }}>“</span>
          </div>
          <div style={{ marginTop: 70, fontFamily: FONTS.serif, fontSize: fs, lineHeight: 1.06, color: s.p.cardInk, letterSpacing: -0.5 }}>
            {words.map((w, i) => {
              const t = t0 + 10 + i * step;
              const pw = s.spr(t, 'snap');
              const isT = strip(w) === target;
              return (
                <span
                  key={i}
                  style={{
                    display: 'inline-block',
                    marginRight: '0.26em',
                    opacity: fade(pw),
                    transform: `translateY(${(1 - pw) * 26}px)`,
                    ...(isT
                      ? {
                          fontStyle: 'italic',
                          color: mark > 0.5 && s.night ? '#0A0A0A' : s.p.cardInk,
                          backgroundImage: 'linear-gradient(#FEED66, #FEED66)',
                          backgroundSize: `${mark * 100}% 62%`,
                          backgroundRepeat: 'no-repeat',
                          backgroundPosition: '0 82%',
                          padding: '0 8px',
                          margin: '0 0.26em 0 -8px',
                        }
                      : {}),
                  }}
                >
                  {w}
                </span>
              );
            })}
            <span style={{ color: s.p.accent, opacity: fade(s.spr(lastWordAt)), display: 'inline-block' }}>”</span>
          </div>
          <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 20, opacity: fade(pSrc), transform: `translateX(${(1 - pSrc) * -30}px)` }}>
            <div style={{ width: 70 * pSrc, height: 6, borderRadius: 3, background: s.p.accent }} />
            <Mono s={s} size={38} color={s.night ? '#B8B5AF' : '#4A4843'} style={{ fontWeight: 700 }}>
              {props.source}
            </Mono>
          </div>
          <div style={{ position: 'absolute', right: 40, top: -58, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 48, color: s.p.accent, opacity: fade(pSrc), transform: `rotate(4deg) translateY(${float(s, 3, 2.4)}px)` }}>remember this ↓</div>
        </div>
      </div>
    </Frame>
  );
};

export const quoteCard: SceneDefinition<Props> = {
  type: 'quote-card',
  description:
    "Quote card in curly quotes, in serif, with words appearing one by one, a mono source line and one word highlighted with a yellow marker. Use it to quote someone, a punchy sentence or a misconception worth remembering.",
  exampleProps: {
    quote: 'Price is what you pay. Value is what you get.',
    source: 'Warren Buffett',
    highlight: 'Value',
  },
  cues: ['enter', 'highlight'],
  Component: QuoteCard,
};
