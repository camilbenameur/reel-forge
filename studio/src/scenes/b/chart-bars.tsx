// Scene "chart-bars": comparative bars that grow, one highlighted bar with its bubble.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface BarsProps {
  title: string;
  unit?: string;                      // "views", "$", "%"
  bars: { label: string; value: number; cue?: string; highlight?: boolean }[];
  bubble?: string;                      // "×4": bubble on the highlighted bar
  cueBubble?: string;
}

const Bars: SceneDefinition<BarsProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const bars = props.bars;
  const n = bars.length;
  const max = Math.max(...bars.map((b) => b.value)) * 1.18;
  const plotL = 80;
  const plotR = 910;
  const baseY = 530;
  const plotH = 370;
  const slot = (plotR - plotL) / n;
  const bw = Math.min(170, slot * 0.62);
  const cardU = Math.min(1, k.sp(k.cue('card', 0), 'soft'));
  const lastCue = Math.max(...bars.map((b, i) => k.cue(b.cue, 14 + i * 14)));
  const bubbleAt = k.cue(props.cueBubble ?? 'bubble', lastCue + 10);
  const bu = k.sp(bubbleAt, 'pop');
  const hi = Math.max(0, bars.findIndex((b) => b.highlight));
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 0, top: 14, width: 960, height: 664, ...cardStyle(k), opacity: cardU, transform: `translateY(${(1 - cardU) * 30}px)` }}>
        <Mono k={k} size={34} color={p.ink} style={{ position: 'absolute', left: 36, top: 26 }}>{props.title}</Mono>
        {props.unit && <Mono k={k} size={28} style={{ position: 'absolute', left: 36, top: 72 }}>in {props.unit}</Mono>}
        <svg width={960} height={664} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((g, i) => (
            <line key={i} x1={plotL - 20} x2={plotR + 20} y1={baseY - plotH * g + 20 - 20} y2={baseY - plotH * g} stroke={p.line} strokeOpacity={i === 0 ? 0.9 : 0.14} strokeWidth={i === 0 ? 3 : 2} strokeDasharray={i === 0 ? '0' : '4 10'} />
          ))}
          {bars.map((b, i) => {
            const at = k.cue(b.cue, 14 + i * 14);
            const u = k.sp(at, i === hi ? 'pop' : 'snap');
            const h = (b.value / max) * plotH * Math.max(0, u);
            const x = plotL + slot * i + (slot - bw) / 2;
            const isHi = b.highlight;
            const fill = isHi ? p.accent : k.night ? '#5A5853' : '#CFCAC1';
            const val = Math.round(b.value * Math.min(1, prog(frame, at - 2, at + 14)));
            return (
              <g key={i}>
                {isHi && <rect x={x - 14} y={baseY - plotH - 10} width={bw + 28} height={plotH + 10} rx={14} fill={p.accent} opacity={0.1 * Math.min(1, u)} />}
                <rect x={x} y={baseY - h} width={bw} height={Math.max(0, h)} rx={10} fill={fill} stroke={p.ink} strokeWidth={3} />
                <rect x={x + 10} y={baseY - h + 10} width={14} height={Math.max(0, h - 20)} rx={7} fill="#fff" opacity={isHi ? 0.3 : 0.22} />
                <text x={x + bw / 2} y={baseY - h - 16} textAnchor="middle" fontFamily={FONTS.display} fontSize={isHi ? 76 : 58} fill={isHi ? p.accent : p.ink} opacity={Math.min(1, u * 3)}>
                  {val.toLocaleString('en-US')}
                </text>
                <text x={x + bw / 2} y={baseY + 54} textAnchor="middle" fontFamily={FONTS.mono} fontSize={30} fontWeight={700} fill={isHi ? p.ink : p.muted} letterSpacing={1.5}>
                  {b.label.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
        {props.bubble && n > 0 && (() => {
          const x = plotL + slot * hi + slot / 2;
          const topY = baseY - (bars[hi].value / max) * plotH;
          return (
            <div
              style={{
                position: 'absolute', left: x - 84, top: topY - 222 + k.dr(5, 2.4), transformOrigin: '50% 100%',
                transform: `scale(${Math.min(bu, 1.2)}) rotate(${-6}deg)`, opacity: Math.min(1, bu * 3),
              }}
            >
              <div style={{ background: p.ink, color: p.bg, fontFamily: FONTS.display, fontSize: 84, padding: '4px 26px 10px', borderRadius: 16, lineHeight: 1.1, boxShadow: `0 10px 18px -6px ${p.shadow}` }}>{props.bubble}</div>
              <svg width={40} height={24} style={{ marginLeft: 50, display: 'block' }}><path d="M0 0 L20 24 L40 0Z" fill={p.ink} /></svg>
            </div>
          );
        })()}
      </div>
    </SceneRoot>
  );
};

export const chartBarsScene: SceneDefinition<BarsProps> = {
  type: 'chart-bars',
  description: "Comparative bars that grow one by one with their value, one bar highlighted in the accent color and a \"×4\" bubble: compare numbers, show a gap.",
  exampleProps: {
    title: 'views per reel',
    unit: 'views',
    bars: [
      { label: 'month 1', value: 320 },
      { label: 'month 2', value: 540 },
      { label: 'month 3', value: 910 },
      { label: 'month 4', value: 3800, highlight: true },
    ],
    bubble: '×4',
  },
  cues: ['card', 'bubble'],
  Component: Bars,
};
