// Scene "price-tag": price tag hanging from a string, or perforated ticket, that drops in and swings.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Mono, SceneRoot, prog, useKit } from './kit';

interface PriceProps {
  variant: 'tag' | 'ticket';
  price: string;               // "$9" or "FREE"
  oldPrice?: string;        // struck-through price
  note?: string;           // "per month"
  heading?: string;         // top word ("PRICE", "OFFER")
}

const fit = (s: string, big: number) => (s.length <= 4 ? big : s.length <= 7 ? big * 0.7 : big * 0.5);

const Barcode: React.FC<{ color: string; w: number; h: number }> = ({ color, w, h }) => {
  const bars: number[] = [];
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = 2 + ((i * 7 + 3) % 5);
    bars.push(x, bw);
    x += bw + 2 + ((i * 5) % 4);
    i++;
  }
  return (
    <svg width={w} height={h}>
      {Array.from({ length: bars.length / 2 }, (_, j) => <rect key={j} x={bars[j * 2]} y={0} width={bars[j * 2 + 1]} height={h} fill={color} />)}
    </svg>
  );
};

const Price: SceneDefinition<PriceProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, fps, p } = k;
  const at = k.cue('price', 8);
  const t = (frame - at) / fps;
  const fall = Math.min(1.08, k.sp(at, 'snap'));
  const swing = t > 0 ? 9 * Math.exp(-t / 0.9) * Math.cos(t * 7.5) : 0;
  const strikeAt = k.cue('strike', at + 22);
  const strike = prog(frame, strikeAt, strikeAt + 10);
  const stamp = k.sp(k.cue('stamp', at + 30), 'pop');
  const label = props.heading ?? (props.variant === 'ticket' ? 'TICKET' : 'PRICE');
  if (props.variant === 'ticket') {
    const W = 920;
    const H = 440;
    const r = 32;
    const px = 300;
    const d = `M0 0 H${px - r} a${r} ${r} 0 0 0 ${2 * r} 0 H${W} V${H / 2 - r} a${r} ${r} 0 0 0 0 ${2 * r} V${H} H${px + r} a${r} ${r} 0 0 0 ${-2 * r} 0 H0 V${H / 2 + r} a${r} ${r} 0 0 0 0 ${-2 * r} Z`;
    return (
      <SceneRoot>
        <div style={{ position: 'absolute', left: 20, top: 90 - (1 - fall) * 600, width: W, height: H + 80, transform: `rotate(${-5 + swing * 0.5}deg)`, transformOrigin: '50% 0%' }}>
          <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', filter: `drop-shadow(0 24px 22px ${p.shadow})` }}>
            <path d={d} fill={p.accent} stroke="#0A0A0A" strokeWidth={4} strokeLinejoin="round" />
            <line x1={px} x2={px} y1={r + 8} y2={H - r - 8} stroke="#0A0A0A" strokeWidth={4} strokeDasharray="10 12" opacity={0.7} />
          </svg>
          <div style={{ position: 'absolute', left: 30, top: 40, width: px - 60, color: k.onAccent }}>
            <Mono k={k} size={30} color={k.onAccent}>No. 0042</Mono>
            <div style={{ fontFamily: FONTS.display, fontSize: 84, lineHeight: 1, margin: '10px 0 26px', color: k.onAccent }}>{label}</div>
            <Barcode color={k.night ? '#0A0A0A' : '#FFFFFF'} w={px - 60} h={150} />
          </div>
          <div style={{ position: 'absolute', left: px + 30, top: 0, width: W - px - 60, height: H, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: k.onAccent }}>
            {props.oldPrice && (
              <div style={{ position: 'relative', fontFamily: FONTS.display, fontSize: 84, opacity: 0.8, lineHeight: 1 }}>
                {props.oldPrice}
                <div style={{ position: 'absolute', left: -8, right: -8, top: '52%', height: 8, background: '#0A0A0A', transform: `scaleX(${strike}) rotate(-6deg)`, transformOrigin: '0 50%' }} />
              </div>
            )}
            <div style={{ fontFamily: FONTS.display, fontSize: fit(props.price, 310), lineHeight: 1.05, color: k.onAccent }}>{props.price}</div>
            {props.note && <Mono k={k} size={36} color={k.onAccent}>{props.note}</Mono>}
          </div>
        </div>
      </SceneRoot>
    );
  }
  // hanging tag
  const W = 660;
  const H = 540;
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: (960 - W) / 2 - 50, top: -(1 - fall) * 700 - 10, width: W, height: H + 120, transformOrigin: '50% 0%', transform: `rotate(${swing}deg)` }}>
        <svg width={W} height={140} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <path d={`M${W / 2} 0 L${W / 2} 70`} stroke={p.ink} strokeWidth={6} />
          <circle cx={W / 2} cy={0} r={10} fill={p.ink} />
        </svg>
        <div style={{ position: 'absolute', left: 0, top: 64, width: W, height: H }}>
          <svg width={W} height={H} style={{ position: 'absolute', inset: 0, overflow: 'visible', filter: `drop-shadow(0 26px 20px ${p.shadow})` }}>
            <path d={`M90 0 H${W - 90} L${W} 80 V${H - 26} Q${W} ${H} ${W - 26} ${H} H26 Q0 ${H} 0 ${H - 26} V80 Z`} fill={p.card} stroke={k.border} strokeWidth={4} strokeLinejoin="round" />
            <circle cx={W / 2} cy={44} r={20} fill={p.bg} stroke={k.border} strokeWidth={4} />
            <rect x={30} y={92} width={W - 60} height={60} fill={p.accent} />
          </svg>
          <div style={{ position: 'absolute', left: 30, top: 92, width: W - 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: 50, letterSpacing: 8, color: k.onAccent }}>{label}</div>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 160, textAlign: 'center' }}>
            {props.oldPrice && (
              <div style={{ position: 'relative', display: 'inline-block', fontFamily: FONTS.display, fontSize: 66, color: p.muted, lineHeight: 1 }}>
                {props.oldPrice}
                <div style={{ position: 'absolute', left: -8, right: -8, top: '52%', height: 9, background: p.accent, transform: `scaleX(${strike}) rotate(-6deg)`, transformOrigin: '0 50%' }} />
              </div>
            )}
            <div style={{ fontFamily: FONTS.display, fontSize: fit(props.price, 176), lineHeight: 1.0, color: p.cardInk, marginTop: props.oldPrice ? 2 : 30 }}>{props.price}</div>
            {props.note && <Mono k={k} size={36} color={p.ink}>{props.note}</Mono>}
          </div>
          <div style={{ position: 'absolute', left: 40, bottom: 26 }}><Barcode color={p.ink} w={W - 80} h={42} /></div>
          <div style={{ position: 'absolute', right: -70, top: 120, width: 170, height: 170, borderRadius: 85, background: p.ink, color: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONTS.display, fontSize: 44, textAlign: 'center', lineHeight: 1, padding: 18, boxSizing: 'border-box', transform: `rotate(${12 + k.dr(3, 2.6)}deg) scale(${Math.min(1.2, stamp)})`, opacity: Math.min(1, stamp * 3) }}>
            {props.oldPrice ? 'GOOD DEAL' : 'ALL INCLUDED'}
          </div>
        </div>
      </div>
    </SceneRoot>
  );
};

export const priceTagScene: SceneDefinition<PriceProps> = {
  type: 'price-tag',
  description: "Hanging price tag (or perforated ticket with barcode) that drops in, swings and shows \"$9\" or \"FREE\", with an optional struck-through original price: talk about a cost or something free.",
  exampleProps: {
    variant: 'tag',
    price: '$9',
    oldPrice: '$49',
    note: 'per month',
    heading: 'PRICE',
  },
  cues: ['price', 'strike', 'stamp'],
  Component: Price,
};
