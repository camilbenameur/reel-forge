// Scene "comment-cta": comment box where the keyword is typed letter by letter, then a click on Post.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import { typed } from '../../core/motion';
import type { SceneDefinition } from '../contract';
import { Cursor, Frame, Ripple, cardStyle, fade, float, useScene } from './kit';

interface ExistingComment {
  author: string;
  text: string;
}

interface Props {
  word: string;              // the keyword to comment, e.g. "SKILL"
  placeholder?: string;
  button?: string;          // "Post"
  hint?: string;              // handwritten note above the input, default "one word only ↓"
  username?: string;          // author of the posted comment
  title?: string;           // "Comments"
  total?: string;           // "1,204"
  existing?: ExistingComment[];
  cue?: string;             // box entrance
  cueWord?: string;          // typing start
  cueClick?: string;         // click on Post
}

const Avatar: React.FC<{ letter: string; size?: number; bg: string; fg: string }> = ({ letter, size = 64, bg, fg }) => (
  <div style={{ width: size, height: size, borderRadius: size / 2, background: bg, color: fg, fontFamily: FONTS.display, fontSize: size * 0.5, lineHeight: `${size}px`, textAlign: 'center', flex: 'none' }}>
    {letter.toUpperCase()}
  </div>
);

const CommentCta: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tType = s.at(props.cueWord ?? 'word', t0 + 22);
  const cps = 7;
  const typeEnd = tType + Math.ceil((props.word.length / cps) * s.fps);
  const tClick = s.at(props.cueClick ?? 'click', typeEnd + 30);
  const p = s.spr(t0, 'soft');
  const posted = s.frame >= tClick;
  const txt = posted ? '' : typed(s.frame, s.fps, tType, props.word, cps);
  const caret = !posted && Math.floor(s.frame / 8) % 2 === 0;
  const hasText = txt.length > 0;
  const existing = props.existing ?? [];
  const pPost = s.spr(tClick + 4);
  const press = Math.max(0, 1 - Math.abs(s.frame - tClick) / 4);

  // cursor: moves from the right edge towards the Post button
  const btn = { x: 765, y: 572 };
  const start = { x: 840, y: 330 };
  const kMove = interpolate(s.frame, [Math.min(typeEnd + 4, tClick - 14), tClick], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.cubic) });
  const arc = Math.sin(kMove * Math.PI) * -40;
  const cx = start.x + (btn.x - start.x) * kMove + arc;
  const cy = start.y + (btn.y - start.y) * kMove;
  const curScale = 1 - 0.18 * press;
  const curOpacity = s.frame >= tType ? Math.min(1, (s.frame - tType) / 6) : 0;

  const listShift = pPost * 120;
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 20, top: 24, width: 920, height: 640, opacity: fade(p), transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.94 + 0.06 * p})` }}>
        {[{ r: 3, x: 16, y: 24 }, { r: -2.4, x: -12, y: 34 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, overflow: 'hidden' })}>
          <div style={{ padding: '26px 36px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${s.night ? 'rgba(244,242,238,0.15)' : 'rgba(10,10,10,0.12)'}`, paddingBottom: 18 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 66, textTransform: 'uppercase', color: s.p.cardInk }}>{props.title ?? 'Comments'}</div>
            <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 36, color: s.p.muted }}>{props.total ?? ''}</div>
          </div>
          {/* comment list (the new one is inserted at the top) */}
          <div style={{ position: 'absolute', left: 36, right: 36, top: 126 }}>
            {posted ? (
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, display: 'flex', gap: 18, alignItems: 'center', opacity: fade(pPost), transform: `translateY(${(1 - pPost) * -30}px) scale(${0.95 + 0.05 * pPost})`, background: s.night ? 'rgba(254,237,102,0.10)' : 'rgba(255,74,32,0.08)', borderRadius: 20, padding: '10px 14px', marginLeft: -14, marginRight: -14, height: 108, boxSizing: 'border-box' }}>
                <Avatar letter={(props.username ?? 'me')[0]} bg={s.p.accent} fg={s.night ? '#0A0A0A' : '#fff'} size={80} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 30, color: s.p.cardInk }}>
                    {props.username ?? 'me'} <span style={{ color: s.p.muted, fontWeight: 600 }}>· just now</span>
                  </div>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 44, letterSpacing: 1, color: s.p.accent }}>{props.word}</div>
                </div>
                <svg width="38" height="38" viewBox="0 0 24 24" fill={s.p.accent} style={{ transform: `scale(${0.6 + 0.4 * s.spr(tClick + 14, 'pop')})` }}>
                  <path d="M12 21 C5 15.5 2.5 12 2.5 8.6 C2.5 5.8 4.6 3.8 7.2 3.8 C9.2 3.8 11 5 12 6.8 C13 5 14.8 3.8 16.8 3.8 C19.4 3.8 21.5 5.8 21.5 8.6 C21.5 12 19 15.5 12 21 Z" />
                </svg>
              </div>
            ) : null}
            {existing.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 18, alignItems: 'center', height: 108, transform: `translateY(${listShift}px)`, opacity: 0.9 }}>
                <Avatar letter={c.author[0]} bg={s.night ? '#333' : '#E9E4D8'} fg={s.night ? '#ddd' : '#0A0A0A'} size={80} />
                <div>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 30, color: s.p.cardInk }}>{c.author}</div>
                  <div style={{ fontFamily: FONTS.sans, fontWeight: 500, fontSize: 38, color: s.p.muted }}>{c.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ position: 'absolute', left: 40, bottom: 176, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 48, color: s.p.accent, opacity: posted ? 0 : fade(s.spr(t0 + 16)), transform: `rotate(-3deg) translateY(${float(s, 3, 2.2)}px)` }}>
            {props.hint ?? 'one word only ↓'}
          </div>
          {/* input area */}
          <div style={{ position: 'absolute', left: 36, right: 36, bottom: 30, height: 130, borderRadius: 30, border: `3px solid ${hasText ? s.p.accent : s.edge}`, display: 'flex', alignItems: 'center', gap: 20, padding: '0 22px', background: s.night ? 'rgba(255,255,255,0.05)' : '#FBFAF7' }}>
            <Avatar letter={(props.username ?? 'me')[0]} bg={s.night ? s.p.accent : '#0A0A0A'} fg={s.night ? '#0A0A0A' : '#FEED66'} size={84} />
            <div style={{ flex: 1, fontFamily: FONTS.sans, fontWeight: 800, fontSize: 64, letterSpacing: 2, color: s.p.cardInk, whiteSpace: 'nowrap' }}>
              {hasText || caret ? (
                <>
                  {txt}
                  {caret ? <span style={{ display: 'inline-block', width: 5, height: 64, background: s.p.accent, marginLeft: 3, verticalAlign: -8 }} /> : null}
                </>
              ) : null}
              {!hasText && !caret && !posted ? <span style={{ color: s.p.muted, fontWeight: 500, fontSize: 40, letterSpacing: 0 }}>{props.placeholder ?? 'Add a comment…'}</span> : null}
              {!hasText && caret && !posted ? <span style={{ color: s.p.muted, fontWeight: 500, fontSize: 40, letterSpacing: 0, marginLeft: 12 }}>{props.placeholder ?? 'Add a comment…'}</span> : null}
            </div>
            <div
              style={{
                padding: '0 30px',
                height: 82,
                borderRadius: 24,
                background: hasText ? s.p.accent : s.night ? '#2A2A2A' : '#E7E3DA',
                color: hasText ? (s.night ? '#0A0A0A' : '#fff') : s.p.muted,
                fontFamily: FONTS.sans,
                fontWeight: 800,
                fontSize: 38,
                display: 'flex',
                alignItems: 'center',
                transform: `scale(${1 - 0.1 * press})`,
              }}
            >
              {props.button ?? 'Post'}
            </div>
          </div>
          <Ripple x={btn.x} y={btn.y} t={s.frame - tClick} color={s.p.accent} size={120} />
          <div style={{ opacity: curOpacity }}>
            <Cursor x={cx} y={cy + float(s, 2, 2)} scale={curScale} />
          </div>
        </div>
      </div>
    </Frame>
  );
};

export const commentCta: SceneDefinition<Props> = {
  type: 'comment-cta',
  description:
    "Comment box where the call-to-action keyword is typed letter by letter, then the cursor clicks Post and the comment appears. Use it for the end of the reel: \"comment SKILL to get the link\".",
  exampleProps: {
    word: 'SKILL',
    placeholder: 'Add a comment…',
    button: 'Post',
    hint: 'one word only ↓',
    username: 'your.account',
    title: 'Comments',
    total: '1,204',
    existing: [
      { author: 'julie.m', text: 'I want the same one!' },
      { author: 'thomas', text: 'How do you do that?' },
    ],
  },
  cues: ['enter', 'word', 'click'],
  Component: CommentCta,
};
