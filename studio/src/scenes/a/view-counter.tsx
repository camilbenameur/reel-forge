// Scene "view-counter": Insights-style stats card (views, rising curve, period).
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, Mono, cardStyle, fade, float, fmtNum, useScene } from './kit';

interface Tile {
  label: string;
  value: string;
  cue?: string;
}

interface Props {
  label: string;       // "Views"
  value: number;
  period: string;       // "Last 30 days"
  tabs?: string[];    // "7d", "30d", "90d"
  active?: number;        // index of the active tab
  delta?: string;        // "+312%"
  curve: number[];      // curve points (relative values)
  tiles?: Tile[];
  cue?: string;
  cueCurve?: string;
}

const CW = 820;
const CH = 95;

const ViewCounter: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tCurve = s.at(props.cueCurve ?? 'curve', t0 + 18);
  const p = s.spr(t0, 'soft');
  const k = interpolate(s.frame, [tCurve, tCurve + 60], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const count = Math.round(props.value * k);
  const max = Math.max(...props.curve);
  const pts = props.curve.map((v, i) => [(i / (props.curve.length - 1)) * CW, CH - (v / max) * (CH - 14) - 6] as const);
  const line = pts.map(([x, y], i) => {
    if (i === 0) return `M${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `C${cx} ${py} ${cx} ${y} ${x} ${y}`;
  }).join(' ');
  const tabs = props.tabs ?? ['7d', '30d', '90d'];
  const active = props.active ?? 1;
  const pDelta = s.spr(tCurve + 50, 'pop');
  const last = pts[pts.length - 1];
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 20, top: 24, width: 920, height: 645, opacity: fade(p), transform: `translateY(${(1 - p) * 60 + float(s, 4)}px) scale(${0.94 + 0.06 * p})` }}>
        {[{ r: 3, x: 16, y: 22 }, { r: -2.4, x: -12, y: 32 }].map((c, i) => (
          <div key={i} style={cardStyle(s, { position: 'absolute', inset: 0, transform: `translate(${c.x}px, ${c.y}px) rotate(${c.r}deg)`, opacity: 0.7 * fade(p), background: s.night ? '#1d1d1d' : '#FBFAF7' })} />
        ))}
        <div style={cardStyle(s, { position: 'absolute', inset: 0, padding: '30px 40px', overflow: 'hidden' })}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Mono s={s} size={32}>
              // insights
            </Mono>
            <div style={{ display: 'flex', padding: 5, borderRadius: 16, background: s.night ? 'rgba(255,255,255,0.07)' : '#EFEBE3', gap: 4, fontFamily: FONTS.sans, fontWeight: 700, fontSize: 30 }}>
              {tabs.map((o, i) => (
                <div key={i} style={{ padding: '8px 22px', borderRadius: 12, background: i === active ? (s.night ? s.p.accent : '#0A0A0A') : 'transparent', color: i === active ? (s.night ? '#0A0A0A' : '#fff') : s.p.muted }}>
                  {o}
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 22 }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 170, lineHeight: 1, color: s.p.cardInk }}>{fmtNum(count)}</div>
            <div style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 76, color: s.p.accent }}>{props.label.toLowerCase()}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 4 }}>
            <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 36, color: s.p.muted }}>{props.period}</div>
            {props.delta ? (
              <div style={{ background: s.p.success, color: s.night ? '#0A0A0A' : '#fff', fontFamily: FONTS.mono, fontWeight: 800, fontSize: 34, padding: '4px 18px', borderRadius: 12, opacity: fade(pDelta), transform: `scale(${0.4 + 0.6 * pDelta})` }}>
                {props.delta}
              </div>
            ) : null}
          </div>
          <svg width={CW + 20} height={CH + 24} viewBox={`-10 -10 ${CW + 20} ${CH + 24}`} style={{ marginTop: 16, overflow: 'visible' }}>
            <defs>
              <linearGradient id="vc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.p.accent} stopOpacity="0.35" />
                <stop offset="1" stopColor={s.p.accent} stopOpacity="0" />
              </linearGradient>
              <clipPath id="vc-clip">
                <rect x={-10} y={-20} width={(CW + 20) * k} height={CH + 40} />
              </clipPath>
            </defs>
            {[0.33, 0.66, 1].map((g) => (
              <line key={g} x1={0} x2={CW} y1={CH * g} y2={CH * g} stroke={s.night ? 'rgba(244,242,238,0.12)' : 'rgba(10,10,10,0.10)'} strokeWidth={2} strokeDasharray="4 8" />
            ))}
            <g clipPath="url(#vc-clip)">
              <path d={`${line} L${CW} ${CH} L0 ${CH} Z`} fill="url(#vc-fill)" />
              <path d={line} fill="none" stroke={s.p.accent} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
            </g>
            {k > 0.97 ? (
              <g>
                <circle cx={last[0]} cy={last[1]} r={9 + (Math.sin(s.frame / 5) + 1) * 9} fill={s.p.accent} opacity={0.25} />
                <circle cx={last[0]} cy={last[1]} r={11} fill={s.p.accent} stroke={s.p.card} strokeWidth={4} />
              </g>
            ) : null}
          </svg>
          <div style={{ position: 'absolute', left: 60, top: 380, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 48, color: s.p.accent, opacity: fade(pDelta), transform: `rotate(-4deg) translateY(${float(s, 4, 2.4)}px)` }}>
            taking off ↗
          </div>
          {props.tiles ? (
            <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
              {props.tiles.map((t, i) => {
                const pt = s.spr(s.at(t.cue, tCurve + 40 + i * 8));
                return (
                  <div key={i} style={{ flex: 1, borderRadius: 18, background: s.night ? 'rgba(255,255,255,0.06)' : '#F4F0E8', padding: '10px 22px', opacity: fade(pt), transform: `translateY(${(1 - pt) * 20}px)` }}>
                    <div style={{ fontFamily: FONTS.mono, fontSize: 26, color: s.p.muted }}>{t.label}</div>
                    <div style={{ fontFamily: FONTS.sans, fontWeight: 800, fontSize: 46, color: s.p.cardInk }}>{t.value}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Frame>
  );
};

export const viewCounter: SceneDefinition<Props> = {
  type: 'view-counter',
  description:
    "Insights-style stats card: climbing view count, rising curve that draws itself, period, change and small tiles. Use it to show growth, audience results or a numeric proof.",
  exampleProps: {
    label: 'Views',
    value: 2396686,
    period: 'Last 30 days',
    tabs: ['7d', '30d', '90d'],
    active: 1,
    delta: '+312%',
    curve: [4, 5, 5, 7, 6, 9, 12, 11, 18, 26, 41, 63, 100],
    tiles: [
      { label: 'followers', value: '+1,204' },
      { label: 'shares', value: '38.2k' },
    ],
  },
  cues: ['enter', 'curve'],
  Component: ViewCounter,
};
