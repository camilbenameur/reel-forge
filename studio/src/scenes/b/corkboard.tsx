// Scene "corkboard": cork board with annotated polaroids, pushpins, red yarn, yellow sticky note and magnifier.
import React from 'react';
import { random } from 'remotion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Mono, SceneRoot, prog, useKit } from './kit';

type Art = 'hills' | 'portrait' | 'city' | 'graph';

interface CorkProps {
  title?: string;
  photos: { caption: string; variant: Art; cue?: string }[];
  note?: string;      // "AI?"
  cueNote?: string;
  magnifier?: boolean;
  magnifierOn?: number;    // index of the polaroid under the magnifier
}

const SLOTS = [
  { x: 52, y: 52, r: -5 },
  { x: 362, y: 84, r: 3 },
  { x: 668, y: 50, r: -2.5 },
  { x: 380, y: 300, r: 2.5 },
];

const Photo: React.FC<{ v: Art; ink: string; accent: string }> = ({ v, ink, accent }) => {
  const sky = '#BFD9E6';
  return (
    <svg width={212} height={212} viewBox="0 0 212 212">
      {v === 'hills' && (
        <>
          <rect width={212} height={212} fill={sky} />
          <circle cx={150} cy={58} r={26} fill="#FFD25E" />
          <path d="M0 150 Q60 80 120 140 T212 120 V212 H0Z" fill="#6FA876" />
          <path d="M0 180 Q80 130 160 175 T212 160 V212 H0Z" fill="#3F7E55" />
        </>
      )}
      {v === 'portrait' && (
        <>
          <rect width={212} height={212} fill="#F0C9A8" />
          <circle cx={106} cy={88} r={42} fill="#E3A77C" />
          <path d="M40 212 Q40 140 106 140 Q172 140 172 212Z" fill={ink} />
          <path d="M62 78 Q70 40 106 42 Q146 42 150 80 Q130 56 106 58 Q80 58 62 78Z" fill="#2A211C" />
          <circle cx={91} cy={92} r={4} fill="#2A211C" />
          <circle cx={121} cy={92} r={4} fill="#2A211C" />
        </>
      )}
      {v === 'city' && (
        <>
          <rect width={212} height={212} fill="#F5C7A1" />
          {[[14, 90, 34], [52, 60, 40], [96, 100, 30], [130, 44, 44], [178, 80, 24]].map(([x, y, w], i) => (
            <g key={i}>
              <rect x={x} y={y} width={w} height={212 - y} fill={i % 2 ? '#2C2C34' : '#454552'} />
              {[0, 1, 2].map((r) => (
                <rect key={r} x={x + 6} y={y + 14 + r * 26} width={w - 12} height={10} fill="#FFD25E" opacity={0.85} />
              ))}
            </g>
          ))}
        </>
      )}
      {v === 'graph' && (
        <>
          <rect width={212} height={212} fill="#F5F3EF" />
          {[40, 80, 56, 120, 150].map((h, i) => (
            <rect key={i} x={18 + i * 38} y={190 - h} width={26} height={h} fill={i === 4 ? accent : ink} />
          ))}
          <path d="M18 120 L70 90 L110 104 L150 56 L196 28" stroke={accent} strokeWidth={6} fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};

const Cork: SceneDefinition<CorkProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const cork = k.night ? '#8E6B3E' : '#C9A06A';
  const speck = k.night ? '#5E4526' : '#9C7442';
  const photos = props.photos.slice(0, 4);
  const boardU = Math.min(1, k.sp(k.cue('board', 0), 'soft'));
  const dots = React.useMemo(
    () => Array.from({ length: 90 }, (_, i) => ({ x: random(`cx${i}`) * 960, y: random(`cy${i}`) * 720, r: 2 + random(`cr${i}`) * 4, o: 0.25 + random(`co${i}`) * 0.4 })),
    [],
  );
  const centers = photos.map((_, i) => ({ x: SLOTS[i].x + 127, y: SLOTS[i].y + 14 }));
  const yarnAt = k.cue('yarn', 10 + photos.length * 12);
  const yarn = prog(frame, yarnAt, yarnAt + 24);
  const magnifierIdx = Math.min(props.magnifierOn ?? 1, photos.length - 1);
  const magnifierAt = k.cue('magnifier', 80);
  const lu = Math.min(1.1, k.sp(magnifierAt, 'snap'));
  const lx = SLOTS[magnifierIdx].x + 150 + k.dr(14, 2.6);
  const ly = SLOTS[magnifierIdx].y + 150 + k.dr(10, 3.1, 1);
  const pAt = k.cue(props.cueNote ?? 'note', 60);
  const pu = k.sp(pAt, 'pop');
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', inset: 0, top: 14, height: 668, transform: `scale(${0.94 + 0.06 * boardU})`, opacity: boardU }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 26, background: cork, border: `14px solid ${k.night ? '#4B3720' : '#8A5A33'}`, boxShadow: `0 26px 44px -14px ${p.shadow}`, overflow: 'hidden' }}>
          <svg width={960} height={720} style={{ position: 'absolute', left: -14, top: -14 }}>
            {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={speck} opacity={d.o} />)}
          </svg>
        </div>
        {props.title && (
          <div style={{ position: 'absolute', left: 320, top: -10, transform: 'rotate(-1.5deg)', background: '#F4EBCB', color: '#0A0A0A', padding: '6px 26px', fontFamily: FONTS.mono, fontWeight: 700, fontSize: 30, letterSpacing: 3, boxShadow: '0 4px 8px rgba(0,0,0,.25)' }}>
            {props.title.toUpperCase()}
          </div>
        )}
        <svg width={960} height={720} style={{ position: 'absolute', left: 0, top: 0 }}>
          {photos.map((_, i) => {
            if (i === 0) return null;
            const a = centers[i - 1];
            const b = centers[i];
            const seg = Math.min(1, Math.max(0, yarn * (photos.length - 1) - (i - 1)));
            const mx = (a.x + b.x) / 2;
            const my = Math.max(a.y, b.y) + 70;
            return (
              <path key={i} d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`} fill="none" stroke="#C0261B" strokeWidth={5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - seg} />
            );
          })}
        </svg>
        {photos.map((ph, i) => {
          const sl = SLOTS[i];
          const at = k.cue(ph.cue, 10 + i * 14);
          const s = k.sp(at, 'pop');
          const t = Math.min(s, 1.1);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', left: sl.x, top: sl.y + (1 - Math.min(s, 1)) * -140 + k.dr(2, 3.3, i), width: 254, height: 314, background: '#FFFFFF',
                border: '2px solid rgba(10,10,10,0.35)', borderRadius: 6, boxShadow: '0 16px 26px -8px rgba(0,0,0,.45)', padding: '16px 21px 0', boxSizing: 'border-box',
                transform: `rotate(${sl.r * t + (1 - Math.min(s, 1)) * 14}deg) scale(${(0.8 + 0.2 * t) * 1.1})`, opacity: Math.min(1, s * 3),
              }}
            >
              <div style={{ position: 'absolute', left: 113, top: -12, width: 28, height: 28, borderRadius: 14, background: i % 2 ? '#2E6BD6' : '#E2331C', boxShadow: 'inset -4px -5px 0 rgba(0,0,0,.28), 0 4px 6px rgba(0,0,0,.4)' }} />
              <Photo v={ph.variant} ink={p.ink === '#0A0A0A' ? '#1A1A1A' : '#2A2A2A'} accent="#E2331C" />
              <div style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 44, textAlign: 'center', color: '#0A0A0A', marginTop: 8, lineHeight: 1 }}>{ph.caption}</div>
            </div>
          );
        })}
        {photos.length < 4 && (() => {
          const ic = k.sp(k.cue('yarn', 10 + photos.length * 12) + 6, 'snap');
          return (
            <div style={{ position: 'absolute', left: 40, top: 420, width: 540, height: 214, background: '#FBF8EF', boxShadow: '0 14px 22px -8px rgba(0,0,0,.4)', transform: `rotate(${-2 + k.dr(0.6, 4)}deg) translateY(${(1 - Math.min(ic, 1)) * 60}px)`, opacity: Math.min(1, ic * 3), padding: '14px 24px', boxSizing: 'border-box', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 10, background: '#E2331C' }} />
              <div style={{ fontFamily: FONTS.mono, fontWeight: 700, fontSize: 26, letterSpacing: 3, color: '#C0261B', marginTop: 8 }}>LEADS</div>
              {photos.map((ph, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 44, lineHeight: 1.1, color: '#0A0A0A', borderBottom: '2px solid rgba(40,80,200,0.25)', opacity: Math.min(1, Math.max(0.25, prog(frame, k.cue(ph.cue, 10 + i * 14), k.cue(ph.cue, 10 + i * 14) + 8))) }}>
                  <span style={{ fontFamily: FONTS.display, fontStyle: 'normal', fontSize: 30, color: '#C0261B' }}>{i + 1}.</span>{ph.caption}
                </div>
              ))}
            </div>
          );
        })()}
        {props.note && (
          <div
            style={{
              position: 'absolute', left: 664, top: 372, width: 262, height: 262, background: '#FFE55C', boxShadow: '0 18px 24px -8px rgba(0,0,0,.45)',
              transform: `rotate(${(5 + k.dr(1, 3.5)) * Math.min(pu, 1.1) - (1 - Math.min(pu, 1)) * 20}deg) scale(${0.3 + 0.7 * Math.min(pu, 1.12)})`, opacity: Math.min(1, pu * 3),
              display: 'flex', alignItems: 'center', justifyContent: 'center', transformOrigin: '50% 0',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 34, background: 'rgba(0,0,0,0.06)' }} />
            <div style={{ fontFamily: FONTS.display, fontSize: 138, color: '#0A0A0A', lineHeight: 1, transform: 'rotate(-4deg)' }}>{props.note}</div>
          </div>
        )}
        {props.magnifier !== false && (
          <svg width={260} height={300} viewBox="0 0 260 300" style={{ position: 'absolute', left: lx - 120, top: ly - 120, opacity: Math.min(1, lu * 2), transform: `scale(${0.6 + 0.4 * lu}) rotate(${-12}deg)`, overflow: 'visible' }}>
            <line x1={190} y1={190} x2={248} y2={284} stroke="#0A0A0A" strokeWidth={26} strokeLinecap="round" />
            <circle cx={120} cy={120} r={100} fill="rgba(255,255,255,0.28)" stroke="#0A0A0A" strokeWidth={14} />
            <path d="M52 100 A72 72 0 0 1 108 50" stroke="#fff" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.9} />
          </svg>
        )}
      </div>
      <Mono k={k} size={1} style={{ display: 'none' }}>{''}</Mono>
    </SceneRoot>
  );
};

export const corkboardScene: SceneDefinition<CorkProps> = {
  type: 'corkboard',
  description: "Cork board with annotated polaroids, pushpins, red yarn, a yellow \"AI?\" sticky note and a magnifier: investigation, clues, \"what if it was AI?\".",
  exampleProps: {
    title: 'the case file',
    photos: [
      { caption: 'before', variant: 'city' },
      { caption: 'the spark', variant: 'portrait' },
      { caption: 'after', variant: 'hills' },
    ],
    note: 'AI?',
    magnifier: true,
    magnifierOn: 1,
  },
  cues: ['board', 'yarn', 'note', 'magnifier'],
  Component: Cork,
};
