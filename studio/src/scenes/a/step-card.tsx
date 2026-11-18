// Scene "step-card": numbered step card (black square badge + condensed title + subtitle).
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Badge, Frame, Mono, cardStyle, fade, float, useScene, type Scene } from './kit';

type Illu = 'clock' | 'bolt' | 'target' | 'magnifier' | 'none';

interface Props {
  number: number;
  title: string;
  subtitle?: string;
  label?: string;
  illustration?: Illu;
  cue?: string;            // card entrance
  cueIllustration?: string; // mini-illustration entrance
}

const Illustration: React.FC<{ kind: Illu; s: Scene }> = ({ kind, s }) => {
  const ink = s.night ? '#F4F2EE' : '#0A0A0A';
  const f = s.frame;
  if (kind === 'clock') {
    const a = (f / s.fps) * 360; // one turn per second: "in 1 sec"
    return (
      <svg width={230} height={230} viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="82" fill={s.p.card} stroke={ink} strokeWidth="8" />
        {Array.from({ length: 12 }, (_, i) => (
          <line key={i} x1="100" y1="26" x2="100" y2={i % 3 === 0 ? 40 : 34} stroke={ink} strokeWidth="5" strokeLinecap="round" transform={`rotate(${i * 30} 100 100)`} />
        ))}
        <path d={`M100 100 L100 22 A78 78 0 0 1 ${100 + 78 * Math.sin((a * Math.PI) / 180)} ${100 - 78 * Math.cos((a * Math.PI) / 180)} Z`} fill={s.p.accent} opacity={a % 360 < 1 ? 0 : 0.28} />
        <line x1="100" y1="100" x2="100" y2="40" stroke={s.p.accent} strokeWidth="6" strokeLinecap="round" transform={`rotate(${a} 100 100)`} />
        <circle cx="100" cy="100" r="9" fill={ink} />
        <rect x="84" y="2" width="32" height="14" rx="5" fill={ink} />
      </svg>
    );
  }
  if (kind === 'bolt') {
    const k = 1 + Math.sin(f / 5) * 0.04;
    return (
      <svg width={220} height={230} viewBox="0 0 200 210" style={{ transform: `scale(${k})` }}>
        <path d="M118 8 L34 118 H92 L72 202 L168 78 H108 Z" fill={s.p.accent} stroke={ink} strokeWidth="8" strokeLinejoin="round" />
        <path d="M118 30 L62 104" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
      </svg>
    );
  }
  if (kind === 'target') {
    const r = (Math.sin(f / 9) + 1) * 2;
    return (
      <svg width={230} height={230} viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="86" fill={s.p.card} stroke={ink} strokeWidth="8" />
        <circle cx="100" cy="100" r="58" fill={s.p.accent} stroke={ink} strokeWidth="6" />
        <circle cx="100" cy="100" r="30" fill={s.p.card} stroke={ink} strokeWidth="6" />
        <circle cx="100" cy="100" r={10 + r} fill={ink} />
        <path d="M100 100 L178 22" stroke={ink} strokeWidth="7" strokeLinecap="round" />
        <path d="M178 22 L150 24 M178 22 L176 50" stroke={ink} strokeWidth="7" strokeLinecap="round" />
      </svg>
    );
  }
  // magnifier
  const dx = Math.sin(f / 14) * 6;
  return (
    <svg width={230} height={230} viewBox="0 0 200 200" style={{ transform: `translate(${dx}px, 0)` }}>
      <circle cx="84" cy="84" r="56" fill={s.p.card} stroke={ink} strokeWidth="9" />
      <path d="M64 70 A26 26 0 0 1 90 58" stroke={s.p.accent} strokeWidth="8" strokeLinecap="round" fill="none" />
      <line x1="126" y1="126" x2="180" y2="180" stroke={ink} strokeWidth="18" strokeLinecap="round" />
    </svg>
  );
};

const StepCard: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tIll = s.at(props.cueIllustration ?? 'illustration', t0 + 10);
  const p = s.spr(t0);
  const pBadge = s.spr(t0 + 5, 'pop');
  const pTitle = s.spr(t0 + 3, 'snap');
  const pSub = s.spr(t0 + 9, 'snap');
  const pIll = s.spr(tIll, 'pop');
  const illu = props.illustration ?? 'none';
  const n = props.title.length;
  const avail = illu === 'none' ? 780 : 520;
  const size = Math.min(200, Math.max(80, avail / (n * 0.46)));
  const lines = size * n * 0.46 > avail ? 2 : 1;
  const fs = lines === 2 ? Math.min(160, Math.max(80, (avail * 2) / (n * 0.5))) : size;
  return (
    <Frame>
      <div
        style={{
          position: 'absolute',
          left: 30,
          top: 50,
          width: 900,
          height: 620,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 60 + float(s, 6)}px) scale(${0.88 + 0.12 * p}) rotate(${-0.9 + (1 - p) * -3}deg)`,
        }}
      >
        {[{ r: 4.5, x: 22, y: 22 }, { r: -3.5, x: -16, y: 30 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, padding: '56px 60px', overflow: 'hidden' })}>
          <Mono s={s} size={34} color={s.p.accent} style={{ fontWeight: 700 }}>
            {props.label ?? '// step'}
          </Mono>
          <div
            style={{
              marginTop: 18,
              width: avail,
              fontFamily: FONTS.display,
              fontSize: fs,
              lineHeight: 1.02,
              color: s.p.cardInk,
              textTransform: 'uppercase',
              overflow: 'hidden',
            }}
          >
            <div style={{ transform: `translateY(${(1 - Math.min(1, pTitle)) * 110}%)` }}>{props.title}</div>
          </div>
          <div style={{ height: 14, width: 190 * Math.min(1, pTitle), background: s.p.accent, borderRadius: 5, marginTop: 20 }} />
          {props.subtitle ? (
            <div
              style={{
                marginTop: 22,
                width: avail,
                fontFamily: FONTS.sans,
                fontWeight: 600,
                fontSize: 46,
                lineHeight: 1.2,
                color: s.night ? '#B8B5AF' : '#4A4843',
                opacity: fade(pSub),
                transform: `translateY(${(1 - pSub) * 22}px)`,
              }}
            >
              {props.subtitle}
            </div>
          ) : null}
          {illu !== 'none' ? (
            <div
              style={{
                position: 'absolute',
                right: 40,
                bottom: 44,
                transformOrigin: 'right bottom',
                opacity: fade(pIll),
                transform: `scale(${(0.3 + 0.7 * pIll) * 1.2}) rotate(${(1 - pIll) * -25 + Math.sin(s.frame / 20) * 2}deg)`,
              }}
            >
              <Illustration kind={illu} s={s} />
            </div>
          ) : null}
          <div style={{ position: 'absolute', left: 60, bottom: 38, display: 'flex', alignItems: 'center', gap: 14, opacity: fade(pSub) }}>
            <div style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 46, color: s.p.accent, transform: `rotate(-3deg) translateY(${float(s, 3, 2.2, 2)}px)` }}>remember this</div>
            <svg width="70" height="40" viewBox="0 0 70 40" fill="none" stroke={s.p.accent} strokeWidth="5" strokeLinecap="round"><path d="M4 30 C24 6 44 6 62 22 M62 22 L48 20 M62 22 L58 8" /></svg>
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            right: -30,
            top: -52,
            opacity: fade(pBadge),
            transform: `scale(${0.2 + 0.8 * pBadge}) rotate(${(1 - pBadge) * 40 + 4}deg)`,
          }}
        >
          <Badge n={props.number} size={140} s={s} />
        </div>
      </div>
    </Frame>
  );
};

export const stepCard: SceneDefinition<Props> = {
  type: 'step-card',
  description:
    "Numbered step card: black square badge, big condensed uppercase title (\"HOOK IN 1 SEC\"), subtitle and an optional mini-illustration. Use it when the script announces \"step 1\", a rule or a named principle.",
  exampleProps: {
    number: 1,
    title: 'HOOK IN 1 SEC',
    subtitle: 'The first seconds decide everything.',
    label: '// step 1',
    illustration: 'clock',
    cueIllustration: 'illustration',
  },
  cues: ['enter', 'illustration'],
  Component: StepCard,
};
