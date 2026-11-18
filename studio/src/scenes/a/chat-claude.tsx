// Scene "chat-claude": AI chat interface ("What do you want to build?"): a message is typed, then the reply shows checked steps.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import { drift, typed } from '../../core/motion';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Frame, Spinner, TitleBar, cardStyle, fade, float, useScene, type Scene } from './kit';

interface Step {
  text: string;
  detail?: string;
  cue?: string;
}

interface Props {
  title: string;
  message: string;
  intro?: string;
  steps: Step[];
  model?: string;
  cue?: string;        // window entrance
  cueMessage?: string; // typing start
  cueSend?: string;   // message sent (the reply starts)
}

// Small 8-branch star, the assistant's mark (original drawing, not a logo).
const Spark: React.FC<{ size: number; color: string; rot: number }> = ({ size, color, rot }) => (
  <svg width={size} height={size} viewBox="-20 -20 40 40" style={{ transform: `rotate(${rot}deg)` }}>
    {Array.from({ length: 8 }, (_, i) => (
      <line key={i} x1="0" y1="-5" x2="0" y2={i % 2 ? -13 : -17} stroke={color} strokeWidth="4.2" strokeLinecap="round" transform={`rotate(${i * 45})`} />
    ))}
  </svg>
);

const Row: React.FC<{ e: Step; s: Scene; t: number; tNext: number }> = ({ e, s, t, tNext }) => {
  const p = s.spr(t);
  const done = s.frame >= tNext;
  const dk = s.prog(tNext, 8);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, opacity: fade(p), transform: `translateX(${(1 - p) * -40}px)`, height: 86 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 14,
          border: `3px solid ${done ? s.p.success : s.night ? 'rgba(244,242,238,0.4)' : '#0A0A0A'}`,
          background: done ? s.p.success : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? <CheckIcon size={30} color="#fff" draw={dk} stroke={6} /> : <Spinner size={28} color={s.night ? s.p.accent : '#0A0A0A'} frame={s.frame} />}
      </div>
      <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 46, color: s.p.cardInk, letterSpacing: -0.5 }}>{e.text}</div>
      {e.detail ? <div style={{ fontFamily: FONTS.mono, fontSize: 30, color: s.p.muted }}>{e.detail}</div> : null}
    </div>
  );
};

const ChatClaude: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tType = s.at(props.cueMessage ?? 'message', t0 + 16);
  const cps = 36;
  const typeEnd = tType + Math.ceil((props.message.length / cps) * s.fps);
  const tSend = s.at(props.cueSend ?? 'send', typeEnd + 8);
  const p = s.spr(t0, 'soft');
  const sent = interpolate(s.frame, [tSend, tSend + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const txt = s.frame < tSend ? typed(s.frame, s.fps, tType, props.message, cps) : props.message;
  const caret = s.frame < tSend && Math.floor(s.frame / 8) % 2 === 0;
  const inputTop = interpolate(sent, [0, 1], [330, 500]);
  const pBubble = s.spr(tSend + 6);
  const pReply = s.spr(tSend + 20);
  const stepT = props.steps.map((e, i) => s.at(e.cue, tSend + 36 + i * 26));
  return (
    <Frame>
      <div
        style={{
          position: 'absolute',
          left: 20,
          top: 20,
          width: 920,
          height: 640,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 70 + float(s, 5)}px) scale(${0.92 + 0.08 * p})`,
        }}
      >
        {[{ r: -3.2, x: -10, y: 22, o: 0.55 }, { r: 2.6, x: 12, y: 40, o: 0.85 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, borderRadius: 26, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: c.o * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 26 })}>
          <TitleBar title="New conversation" s={s} height={64} />
          {/* welcome page */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: 110, textAlign: 'center', opacity: 1 - sent, transform: `translateY(${-sent * 30}px)` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Spark size={96} color={s.p.accent} rot={s.frame * 1.2} />
            </div>
            <div style={{ fontFamily: FONTS.serif, fontSize: 84, lineHeight: 1.05, color: s.p.cardInk }}>{props.title}</div>
          </div>
          {/* sent message */}
          {s.frame >= tSend ? (
            <div style={{ position: 'absolute', right: 34, top: 100, maxWidth: 700, opacity: fade(pBubble), transform: `translateY(${(1 - pBubble) * 30}px) scale(${0.9 + 0.1 * pBubble})`, transformOrigin: 'top right' }}>
              <div style={{ background: s.night ? '#2A2A2A' : '#0A0A0A', color: '#fff', fontFamily: FONTS.sans, fontWeight: 600, fontSize: 36, lineHeight: 1.25, padding: '20px 28px', borderRadius: 26, borderTopRightRadius: 8 }}>
                {props.message}
              </div>
            </div>
          ) : null}
          {/* reply */}
          <div style={{ position: 'absolute', left: 34, top: 250, right: 34, opacity: fade(pReply) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, transform: `translateY(${(1 - pReply) * 20}px)` }}>
              <Spark size={44} color={s.p.accent} rot={s.frame * 3} />
              <div style={{ fontFamily: FONTS.serif, fontSize: 48, color: s.p.cardInk, fontStyle: 'italic' }}>{props.intro ?? "Here we go:"}</div>
            </div>
            {props.steps.map((e, i) => (
              <Row key={i} e={e} s={s} t={stepT[i]} tNext={i + 1 < stepT.length ? stepT[i + 1] : stepT[i] + 30} />
            ))}
          </div>
          {/* suggestion chips + annotation (welcome state) */}
          <div style={{ position: 'absolute', left: 34, right: 34, top: 462, display: 'flex', gap: 14, opacity: 1 - sent }}>
            {['A script', 'A voice', 'Scenes'].map((c, i) => (
              <div key={c} style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: 32, padding: '12px 26px', borderRadius: 40, border: `3px solid ${s.edge}`, color: s.p.cardInk, background: s.night ? 'rgba(255,255,255,0.05)' : '#fff', transform: `translateY(${drift(s.frame, s.fps, 4, 2.6, i)}px)` }}>{c}</div>
            ))}
          </div>
          <div style={{ position: 'absolute', right: 40, top: 545, opacity: (1 - sent) * fade(s.spr(t0 + 14)), transform: `rotate(-3deg) translateY(${drift(s.frame, s.fps, 4, 2.2)}px)`, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 44, color: s.p.accent }}>
            one line is enough ↑
          </div>
          <div style={{ position: 'absolute', left: 34, right: 34, bottom: 24, display: 'flex', justifyContent: 'space-between', opacity: sent, fontFamily: FONTS.mono, fontSize: 26, color: s.p.muted }}>
            <span>● Thinking…</span>
            <span>{props.steps.length} steps · on its own</span>
          </div>
          {/* input bar */}
          <div
            style={{
              position: 'absolute',
              left: 34,
              right: 34,
              top: inputTop,
              height: sent > 0.5 ? 84 : 112,
              borderRadius: 26,
              border: `3px solid ${s.edge}`,
              background: s.night ? 'rgba(255,255,255,0.05)' : '#FBFAF7',
              display: 'flex',
              alignItems: 'center',
              padding: '0 26px',
              gap: 14,
              fontFamily: FONTS.sans,
              fontSize: 38,
              fontWeight: 500,
              color: s.p.cardInk,
            }}
          >
            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {s.frame < tSend ? (
                <>
                  {txt || <span style={{ color: s.p.muted }}>Describe your idea…</span>}
                  {caret ? <span style={{ display: 'inline-block', width: 3, height: 36, background: s.p.accent, verticalAlign: -6, marginLeft: 2 }} /> : null}
                </>
              ) : (
                <span style={{ color: s.p.muted }}>Reply…</span>
              )}
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 22, color: s.p.muted }}>{props.model ?? 'Pro'}</span>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: s.p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + 0.18 * Math.max(0, 1 - Math.abs(s.frame - tSend) / 5)})` }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={s.night ? '#0A0A0A' : '#fff'} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20 V5 M5 12 L12 5 L19 12" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
};

export const chatClaude: SceneDefinition<Props> = {
  type: 'chat-claude',
  description:
    "AI chat interface (\"What do you want to build?\"): the message is typed and sent, then the reply unrolls steps that get checked (Script, Voice, Scenes). Use it to describe a request made to an assistant and what it produces.",
  exampleProps: {
    title: 'What do you want to build?',
    message: 'Make me a reel about McDonald’s and real estate.',
    intro: 'On it:',
    steps: [
      { text: 'Script', detail: '45 s', cue: 'step1' },
      { text: 'Voice', detail: 'cloned', cue: 'step2' },
      { text: 'Scenes', detail: '12 shots', cue: 'step3' },
    ],
    model: 'Pro',
  },
  cues: ['enter', 'message', 'send'],
  Component: ChatClaude,
};
