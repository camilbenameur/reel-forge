// Scene "arrow-annotate": hand-drawn circle / underline / highlight around a word, arrow and handwritten note.
import React from 'react';
import { typed } from '../../core/motion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { SceneRoot, cardStyle, prog, useKit } from './kit';

interface AnnotateProps {
  before: string;
  word: string;
  after?: string;
  note: string;                                        // texte manuscrit
  shape: 'circle' | 'underline' | 'highlight';
}

const CIRCLE = 'M 18 62 C 8 18, 130 -6, 262 8 C 392 22, 408 84, 290 100 C 160 118, 12 104, 16 56 C 18 30, 58 16, 112 10';
const UNDER = 'M 6 20 C 90 8, 200 30, 396 10 M 20 34 C 140 22, 260 40, 388 28';

const Annotate: SceneDefinition<AnnotateProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, fps, p } = k;
  const cardU = Math.min(1, k.sp(k.cue('card', 0), 'soft'));
  const drawAt = k.cue('stroke', 26);
  const draw = prog(frame, drawAt, drawAt + 18);
  const arrowAt = k.cue('arrow', drawAt + 14);
  const arrow = prog(frame, arrowAt, arrowAt + 14);
  const noteAt = arrowAt + 10;
  const noteTxt = typed(frame, fps, noteAt, props.note, 22);
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 10, top: 56, width: 940, ...cardStyle(k, { padding: '104px 52px 170px' }), opacity: cardU, transform: `translateY(${(1 - cardU) * 40}px) rotate(${-0.8 + k.dr(0.3, 4)}deg)` }}>
        <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 96, lineHeight: 1.2, letterSpacing: -2.5, color: p.cardInk }}>
          {props.before}{' '}
          <span style={{ position: 'relative', display: 'inline-block', color: p.cardInk }}>
            {props.shape === 'highlight' && (
              <span style={{ position: 'absolute', left: -10, right: -10, top: '16%', bottom: '8%', background: p.accent, opacity: 0.35, transform: `scaleX(${draw})`, transformOrigin: '0 50%', borderRadius: 6 }} />
            )}
            <span style={{ position: 'relative' }}>{props.word}</span>
            {props.shape === 'circle' && (
              <svg viewBox="0 0 420 116" preserveAspectRatio="none" style={{ position: 'absolute', left: -20, top: -14, width: 'calc(100% + 40px)', height: 'calc(100% + 30px)', overflow: 'visible' }}>
                <path d={CIRCLE} fill="none" stroke={p.accent} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {props.shape === 'underline' && (
              <svg viewBox="0 0 400 44" preserveAspectRatio="none" style={{ position: 'absolute', left: -6, top: '84%', width: 'calc(100% + 12px)', height: 40, overflow: 'visible' }}>
                <path d={UNDER} fill="none" stroke={p.accent} strokeWidth={8} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            {/* arrow + handwritten note, anchored under the word */}
            <svg width={220} height={170} viewBox="0 0 220 170" style={{ position: 'absolute', left: '42%', top: '104%', overflow: 'visible' }}>
              <path d="M 150 150 C 150 100, 100 70, 52 20" fill="none" stroke={p.accent} strokeWidth={7} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - arrow} />
              <path d="M 52 20 L 54 56 M 52 20 L 88 30" fill="none" stroke={p.accent} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - prog(frame, arrowAt + 12, arrowAt + 20)} />
            </svg>
            <span style={{ position: 'absolute', left: '42%', top: '104%', marginLeft: 30, marginTop: 142, whiteSpace: 'nowrap', fontFamily: FONTS.serif, fontStyle: 'italic', fontWeight: 400, fontSize: 82, letterSpacing: 0, color: p.accent, transform: `rotate(-5deg)` }}>
              {noteTxt}
            </span>
          </span>
          {props.after ? ` ${props.after}` : ''}
        </div>
        {/* decorations: label, numbered badge */}
        <div style={{ position: 'absolute', left: 36, top: 26, display: 'flex', alignItems: 'center', gap: 16, fontFamily: FONTS.mono, fontWeight: 700, fontSize: 30, letterSpacing: 2, color: p.muted }}>
          <div style={{ width: 20, height: 20, borderRadius: 10, background: p.accent, opacity: 0.6 + 0.4 * Math.sin(frame / 6) }} />// REMEMBER
        </div>
        <div style={{ position: 'absolute', right: 30, top: -28, width: 84, height: 84, borderRadius: 18, background: p.ink, color: p.bg, fontFamily: FONTS.display, fontSize: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `rotate(${6 + k.dr(2, 3)}deg) scale(${Math.min(1.15, k.sp(k.cue('stroke', 26), 'pop'))})`, boxShadow: `0 10px 18px -6px ${p.shadow}` }}>1</div>
      </div>
    </SceneRoot>
  );
};

export const arrowAnnotateScene: SceneDefinition<AnnotateProps> = {
  type: 'arrow-annotate',
  description: "Large sentence in which one word is circled, underlined or highlighted with a marker (stroke that draws itself), with an arrow and a handwritten note: draw the eye to the key word, \"look at this\".",
  exampleProps: {
    before: 'The real secret is',
    word: 'consistency',
    after: 'not talent.',
    note: 'every single day',
    shape: 'circle',
  },
  cues: ['card', 'stroke', 'arrow'],
  Component: Annotate,
};
