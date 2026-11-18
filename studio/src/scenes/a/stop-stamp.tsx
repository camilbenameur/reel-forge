// Scene "stop-stamp": an item, then a big STOP / ERROR / NO stamp that slams down with a shake.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, cardStyle, fade, float, useScene, type Scene } from './kit';

type IconKind = 'camera' | 'document' | 'bell' | 'dollar';

interface Props {
  item: { title: string; subtitle?: string; icon?: IconKind };
  stamp: string; // STOP, ERROR, NO...
  cue?: string;        // item appearance
  cueStamp?: string;  // stamp drop
}

const Icon: React.FC<{ kind: IconKind; s: Scene }> = ({ kind, s }) => {
  const ink = s.night ? '#F4F2EE' : '#0A0A0A';
  const sw = 7;
  if (kind === 'camera')
    return (
      <svg width={240} height={200} viewBox="0 0 240 200" fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
        <rect x="14" y="48" width="150" height="110" rx="16" fill={s.p.card} />
        <path d="M164 84 L226 52 V154 L164 122 Z" fill={s.p.accent} />
        <circle cx="62" cy="30" r="26" fill={s.p.card} />
        <circle cx="120" cy="30" r="20" fill={s.p.card} />
        <circle cx="64" cy="104" r="26" />
        <circle cx="64" cy="104" r="8" fill={ink} />
        <path d="M60 158 L46 192 M118 158 L132 192" />
      </svg>
    );
  if (kind === 'document')
    return (
      <svg width={190} height={220} viewBox="0 0 190 220" fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
        <path d="M24 10 H120 L168 58 V206 H24 Z" fill={s.p.card} />
        <path d="M120 10 V58 H168" />
        <path d="M50 96 H142 M50 124 H142 M50 152 H110" stroke={s.p.accent} />
      </svg>
    );
  if (kind === 'bell')
    return (
      <svg width={200} height={220} viewBox="0 0 200 220" fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
        <path d="M100 18 C56 18 40 56 40 100 C40 140 24 154 16 168 H184 C176 154 160 140 160 100 C160 56 144 18 100 18 Z" fill={s.p.accent} />
        <path d="M80 184 A22 22 0 0 0 120 184" fill={s.p.card} />
        <path d="M100 6 V18" />
      </svg>
    );
  return (
    <svg width={210} height={210} viewBox="0 0 210 210" fill="none" stroke={ink} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
      <circle cx="105" cy="105" r="88" fill={s.p.card} />
      <circle cx="105" cy="105" r="66" stroke={s.p.accent} />
      <path d="M130 70 C120 58 84 58 84 84 C84 112 130 98 130 128 C130 152 90 152 80 138 M105 44 V166" />
    </svg>
  );
};

const StopStamp: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tHit = s.at(props.cueStamp ?? 'stamp', t0 + 34);
  const p = s.spr(t0);
  // stamp drop: 6 approach frames (accelerating), then impact
  const fall = Math.min(1, Math.max(0, (s.frame - (tHit - 7)) / 7));
  const fallE = fall * fall;
  const landed = s.frame >= tHit;
  const since = s.frame - tHit;
  // Approach scale capped at 1.8: at 3 the stamp covered the captions (LI6 metric).
  const scale = landed ? 1 : 1.8 - 0.8 * fallE;
  const settle = landed ? 1 + Math.max(0, 0.16 * Math.exp(-since / 4) * Math.cos(since * 0.9)) : scale;
  const shakeAmp = landed ? 22 * Math.exp(-since / 5) : 0;
  const shakeX = Math.sin(since * 2.7) * shakeAmp;
  const shakeY = Math.cos(since * 3.3) * shakeAmp * 0.7;
  const word = props.stamp.toUpperCase();
  const fs = Math.min(240, 800 / (word.length * 0.5));
  const stampColor = s.night ? s.p.accent : '#E3341A';
  return (
    <Frame style={{ transform: `translate(${shakeX}px, ${shakeY}px)` }}>
      {/* item */}
      <div
        style={{
          position: 'absolute',
          left: 90,
          top: 20,
          width: 780,
          height: 640,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 70 + float(s, 5)}px) rotate(${-3 + (1 - p) * -6}deg) scale(${0.9 + 0.1 * p})`,
        }}
      >
        {[{ r: 5, x: 26, y: 20 }, { r: -4, x: -20, y: 30 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7, background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: "flex-start", gap: 14, paddingTop: 40, overflow: 'hidden' })}>
          <div style={{ fontFamily: FONTS.display, fontSize: 92, lineHeight: 1, color: s.p.cardInk, textTransform: 'uppercase', textAlign: 'center', padding: '0 30px' }}>{props.item.title}</div>
          {props.item.subtitle ? <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 40, color: s.p.muted }}>{props.item.subtitle}</div> : null}
          <div style={{ transform: 'scale(1.35)', marginTop: 34 }}><Icon kind={props.item.icon ?? 'camera'} s={s} /></div>
          <div style={{ position: 'absolute', left: 36, bottom: 26, fontFamily: FONTS.mono, fontSize: 28, color: s.p.muted }}>// seen 1,000 times</div>
          <div style={{ position: 'absolute', right: 30, top: 24, width: 40, height: 40, borderRadius: 20, background: s.p.accent }} />
        </div>
      </div>
      {/* impact lines */}
      {landed && since < 12 ? (
        <svg style={{ position: 'absolute', left: 0, top: 0, width: 960, height: 760, overflow: 'visible' }}>
          {Array.from({ length: 14 }, (_, i) => {
            const a = (i / 14) * Math.PI * 2;
            const r0 = 230 + since * 22;
            const r1 = r0 + 60 - since * 3;
            return <line key={i} x1={480 + Math.cos(a) * r0 * 1.3} y1={440 + Math.sin(a) * r0 * 0.75} x2={480 + Math.cos(a) * r1 * 1.3} y2={440 + Math.sin(a) * r1 * 0.75} stroke={stampColor} strokeWidth={8 * (1 - since / 12)} strokeLinecap="round" opacity={1 - since / 12} />;
          })}
        </svg>
      ) : null}
      {/* stamp */}
      {s.frame >= tHit - 8 ? (
        <div
          style={{
            position: 'absolute',
            left: 480 - 400,
            top: 400 - 150,
            width: 800,
            height: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: landed ? 0.96 : Math.min(1, fall * 3),
            transform: `rotate(-9deg) scale(${landed ? settle : scale})`,
            mixBlendMode: s.night ? 'normal' : 'multiply',
          }}
        >
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
            </filter>
          </svg>
          <div
            style={{
              filter: 'url(#rough)',
              border: `14px solid ${stampColor}`,
              borderRadius: 26,
              padding: '0 54px',
              outline: `4px solid ${stampColor}`,
              outlineOffset: 8,
              fontFamily: FONTS.display,
              fontSize: fs,
              lineHeight: 1.1,
              letterSpacing: 6,
              color: stampColor,
              background: s.night ? 'rgba(10,10,10,0.75)' : 'rgba(255,74,32,0.06)',
            }}
          >
            {word}
          </div>
        </div>
      ) : null}
    </Frame>
  );
};

export const stopStamp: SceneDefinition<Props> = {
  type: 'stop-stamp',
  description:
    "An item (camera, document, bell, dollar) hit by a big red STOP / ERROR / NO stamp with a screen shake. Use it to reject a practice, a common mistake or a \"never do this\".",
  exampleProps: {
    item: { title: 'Filming every reel', subtitle: '3 hours per video', icon: 'camera' },
    stamp: 'STOP',
  },
  cues: ['enter', 'stamp'],
  Component: StopStamp,
};
