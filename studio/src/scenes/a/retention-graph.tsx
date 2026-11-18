// Scene "retention-graph": retention curve that collapses (most reels) against one that holds (my reel).
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, Mono, cardStyle, clamp01, fade, float, useScene } from './kit';

interface Props {
  title?: string;
  averageLabel: string; // "Most reels"
  ownLabel: string;    // "My reel"
  duration?: number;         // displayed duration in seconds
  drop?: string;        // pill at the end of the falling curve, e.g. "−92%"
  hold?: string;         // pill at the end of the holding curve, e.g. "94%"
  cue?: string;           // card entrance
  cueAverage?: string;    // drawing of the falling curve
  cueOwn?: string;       // drawing of the holding curve
  cueCursor?: string;    // playback cursor start
}

const CW = 770; // plot width
const CH = 355; // plot height

const avg = (x: number) => 6 + 94 * Math.exp(-x * 5.2) - 3 * x;
const mine = (x: number) => 100 - 7 * x - 4 * Math.sin(x * 9) * x + 3 * Math.exp(-((x - 0.55) ** 2) / 0.004);

const toPath = (fn: (x: number) => number) =>
  Array.from({ length: 70 }, (_, i) => {
    const x = i / 69;
    return `${i ? 'L' : 'M'}${(x * CW).toFixed(1)} ${((1 - Math.max(0, fn(x)) / 100) * CH).toFixed(1)}`;
  }).join(' ');

const RetentionGraph: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tAvg = s.at(props.cueAverage ?? 'average', t0 + 16);
  const tMine = s.at(props.cueOwn ?? 'own', tAvg + 46);
  const tCur = s.at(props.cueCursor ?? 'cursor', tMine + 36);
  const p = s.spr(t0, 'soft');
  const dAvg = s.prog(tAvg, 30, (t) => t * t * (3 - 2 * t));
  const dMine = s.prog(tMine, 40, (t) => t * t * (3 - 2 * t));
  const cur = clamp01((s.frame - tCur) / 90);
  const curX = cur * CW;
  const dur = props.duration ?? 45;
  const sec = Math.round(cur * dur);
  const red = s.night ? '#FF6A45' : '#E3341A';
  const good = s.night ? s.p.accent : '#0A0A0A';
  const pPill1 = s.spr(tAvg + 28, 'pop');
  const pPill2 = s.spr(tMine + 38, 'pop');
  const ink = s.p.cardInk;
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 20, top: 24, width: 920, height: 640, opacity: fade(p), transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.94 + 0.06 * p})` }}>
        {[{ r: 3, x: 16, y: 22 }, { r: -2.4, x: -12, y: 32 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, padding: '28px 36px', overflow: 'hidden' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Mono s={s} size={30}>
              // {props.title ?? 'retention'} · {dur} s
            </Mono>
            <div style={{ display: 'flex', gap: 22, fontFamily: FONTS.sans, fontWeight: 700, fontSize: 27, color: ink }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: fade(s.spr(tAvg)) }}>
                <i style={{ width: 26, height: 10, borderRadius: 5, background: red, display: 'block' }} />
                {props.averageLabel}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: fade(s.spr(tMine)) }}>
                <i style={{ width: 26, height: 10, borderRadius: 5, background: good, display: 'block' }} />
                {props.ownLabel}
              </span>
            </div>
          </div>
          <svg width={CW + 70} height={CH + 60} viewBox={`-62 -16 ${CW + 70} ${CH + 60}`} style={{ marginTop: 6, overflow: 'visible' }}>
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1={0} x2={CW} y1={(1 - v / 100) * CH} y2={(1 - v / 100) * CH} stroke={s.night ? 'rgba(244,242,238,0.15)' : 'rgba(10,10,10,0.14)'} strokeWidth={2} strokeDasharray={v === 0 ? undefined : '6 8'} />
                <text x={-14} y={(1 - v / 100) * CH + 7} textAnchor="end" fontFamily={FONTS.mono} fontSize={26} fill={s.p.muted}>
                  {v}%
                </text>
              </g>
            ))}
            {/* area under the holding curve */}
            <path d={`${toPath(mine)} L${CW} ${CH} L0 ${CH} Z`} fill={good} opacity={0.07 * dMine} />
            <path d={toPath(avg)} pathLength={1} fill="none" stroke={red} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - dAvg} />
            <path d={toPath(mine)} pathLength={1} fill="none" stroke={good} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={1} strokeDashoffset={1 - dMine} />
            {/* curve-end pills */}
            <g transform={`translate(${CW - 190} ${(1 - avg(1) / 100) * CH - 76}) scale(${0.4 + 0.6 * pPill1})`} opacity={fade(pPill1)}>
              <rect width={190} height={58} rx={16} fill={red} />
              <text x={95} y={42} textAnchor="middle" fontFamily={FONTS.display} fontSize={40} fill="#fff" letterSpacing={1}>
                {props.drop ?? '−92%'}
              </text>
            </g>
            <g transform={`translate(${CW - 190} ${(1 - mine(1) / 100) * CH + 24}) scale(${0.4 + 0.6 * pPill2})`} opacity={fade(pPill2)}>
              <rect width={190} height={58} rx={16} fill={good} />
              <text x={95} y={42} textAnchor="middle" fontFamily={FONTS.display} fontSize={40} fill={s.night ? '#0A0A0A' : '#fff'} letterSpacing={1}>
                {props.hold ?? '94%'}
              </text>
            </g>
            {/* playback cursor */}
            {s.frame >= tCur ? (
              <g transform={`translate(${curX} 0)`}>
                <line y1={-10} y2={CH} stroke={s.p.accent} strokeWidth={4} />
                <path d="M-12 -22 L12 -22 L0 -4 Z" fill={s.p.accent} />
                <rect x={-42} y={CH + 8} width={84} height={38} rx={10} fill={s.p.accent} />
                <text x={0} y={CH + 35} textAnchor="middle" fontFamily={FONTS.mono} fontWeight={700} fontSize={26} fill={s.night ? '#0A0A0A' : '#fff'}>
                  0:{String(sec).padStart(2, '0')}
                </text>
              </g>
            ) : null}
          </svg>
          {/* video thumbnails under the axis */}
          <div style={{ display: 'flex', gap: 12, marginTop: 6, marginLeft: 0, width: CW + 8 }}>
            {Array.from({ length: 6 }, (_, i) => {
              const pv = s.spr(t0 + 14 + i * 3);
              const on = cur > 0 && cur * 6 >= i;
              return (
                <div key={i} style={{ flex: 1, height: 92, borderRadius: 14, border: `3px solid ${on ? s.p.accent : s.edge}`, background: i % 2 ? (s.night ? '#2A2A2A' : '#EDE8DD') : s.night ? '#1F1F1F' : '#F7F2E7', opacity: fade(pv) * (on ? 1 : 0.8), transform: `translateY(${(1 - pv) * 20}px)`, position: 'relative', overflow: 'hidden', marginLeft: i === 0 ? 62 : 0 }}>
                  <div style={{ position: 'absolute', left: 8 + i * 4, bottom: 8, width: 26 + (i % 3) * 8, height: 26 + (i % 3) * 8, borderRadius: i % 2 ? 6 : 20, background: i % 3 === 0 ? s.p.accent : s.night ? '#555' : '#0A0A0A' }} />
                  <div style={{ position: 'absolute', right: 8, top: 8, width: 30, height: 6, borderRadius: 3, background: s.p.muted }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Frame>
  );
};

export const retentionGraph: SceneDefinition<Props> = {
  type: 'retention-graph',
  description:
    "Retention chart: the \"most reels\" curve collapses while \"my reel\" holds close to 100%, with a playback cursor and video thumbnails. Use it to talk about retention, audience loyalty or drop-off.",
  exampleProps: {
    title: 'retention',
    averageLabel: 'Most reels',
    ownLabel: 'My reel',
    duration: 45,
    drop: '−92%',
    hold: '94%',
  },
  cues: ['enter', 'average', 'own', 'cursor'],
  Component: RetentionGraph,
};
