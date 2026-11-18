// Scene "question-mark": giant red/black extruded question mark and a "WHY?" word in condensed letters.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { SceneRoot, useKit } from './kit';

interface QuestionProps {
  word: string;          // "WHY?"
  symbol?: string;     // "?" by default
}

const QuestionMark: SceneDefinition<QuestionProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const sym = props.symbol ?? '?';
  const u = k.sp(k.cue('symbol', 2), 'pop');
  const depth = 26;
  const sh: string[] = [];
  for (let i = 1; i <= depth; i++) sh.push(`${i * 0.9}px ${i}px 0 ${i > depth - 3 ? '#000' : p.ink}`);
  sh.push(`${depth * 0.9 + 14}px ${depth + 36}px 40px ${p.shadow}`);
  const face = p.accent;
  const letters = Array.from(props.word);
  const wordAt = k.cue('word', 22);
  const rotate = -9 * (1 - Math.min(u, 1)) + k.dr(2.2, 3.4);
  return (
    <SceneRoot>
      {/* halftone pattern behind the symbol */}
      <div
        style={{
          position: 'absolute', left: 250, top: -10, width: 460, height: 460, borderRadius: '50%', opacity: 0.9 * Math.min(1, u),
          backgroundImage: `radial-gradient(${p.ink} 3px, transparent 3.5px)`, backgroundSize: '18px 18px',
          WebkitMaskImage: 'radial-gradient(circle, rgba(0,0,0,0.5) 10%, transparent 68%)', maskImage: 'radial-gradient(circle, rgba(0,0,0,0.5) 10%, transparent 68%)',
        }}
      />
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: -86, textAlign: 'center', fontFamily: FONTS.display, fontSize: 570, lineHeight: 1,
          color: face, textShadow: sh.join(','), transform: `translate(${-depth * 0.4}px, ${k.dr(6, 3.2)}px) scale(${0.35 + 0.65 * Math.min(u, 1.12)}) rotate(${rotate}deg)`,
          transformOrigin: '50% 60%', opacity: Math.min(1, u * 3),
        }}
      >
        {sym}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 112, display: 'flex', justifyContent: 'center', gap: 4 }}>
        {letters.map((l, i) => {
          const s = k.sp(wordAt + i * 2, 'pop');
          return (
            <div
              key={i}
              style={{
                fontFamily: FONTS.display, fontSize: 160, lineHeight: 1, color: p.ink, minWidth: l === ' ' ? 40 : undefined, letterSpacing: 2,
                transform: `translateY(${(1 - Math.min(s, 1)) * -120}px) rotate(${(1 - Math.min(s, 1)) * (i % 2 ? 14 : -14)}deg) scale(${0.7 + 0.3 * Math.min(s, 1.15)})`,
                opacity: Math.min(1, s * 3),
              }}
            >
              {l === ' ' ? ' ' : l}
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 170, right: 170, bottom: 86, height: 16, background: face, borderRadius: 6, transform: `scaleX(${Math.min(1, Math.max(0, k.sp(wordAt + letters.length * 2, 'soft')))})`, transformOrigin: '0 50%' }} />
      {/* sparks around the symbol */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        const r = 330 + k.dr(10, 2.5, i);
        const s = k.sp(k.cue('symbol', 2) + 8 + i * 3, 'pop');
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: 480 + Math.cos(a) * r * 1.15 - 14, top: 230 + Math.sin(a) * r * 0.62 - 14, width: 28, height: 28, background: i % 2 ? p.ink : face,
              borderRadius: i % 2 ? 4 : 14, transform: `scale(${Math.min(s, 1.2)}) rotate(${frame * 2 + i * 30}deg)`,
            }}
          />
        );
      })}
      {/* mono label and small outlined question marks floating around */}
      <div style={{ position: 'absolute', left: 0, top: 4, ...k.ent(2, 'soft', 20), background: p.ink, color: p.bg, fontFamily: FONTS.mono, fontWeight: 700, fontSize: 30, letterSpacing: 2, padding: '8px 20px', borderRadius: 10, transform: `rotate(-3deg)` }}>// THE REAL QUESTION</div>
      {[{ x: 40, y: 250, s: 190, r: -14, o: 0 }, { x: 760, y: 120, s: 150, r: 12, o: 2 }, { x: 800, y: 330, s: 110, r: -8, o: 4 }].map((q, i) => {
        const s2 = k.sp(k.cue('symbol', 2) + 10 + i * 4, 'pop');
        return (
          <div key={i} style={{ position: 'absolute', left: q.x, top: q.y + k.dr(8, 3 + i * 0.4, i * 2), fontFamily: FONTS.display, fontSize: q.s, lineHeight: 1, color: 'transparent', WebkitTextStroke: `4px ${p.ink}`, opacity: Math.min(1, s2 * 2) * 0.85, transform: `rotate(${q.r + k.dr(4, 3.3, i)}deg) scale(${Math.min(1.1, s2)})` }}>{sym}</div>
        );
      })}
    </SceneRoot>
  );
};

export const questionMarkScene: SceneDefinition<QuestionProps> = {
  type: 'question-mark',
  description: "Giant red and black extruded question mark with a condensed uppercase word (\"WHY?\"): asks a fundamental question, a doubt, a mystery.",
  exampleProps: {
    word: 'WHY?',
    symbol: '?',
  },
  cues: ['symbol', 'word'],
  Component: QuestionMark,
};
