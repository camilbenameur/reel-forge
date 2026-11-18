// Scene "big-number": giant counting number, suffix, caption and a small arrow.
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, fade, fmtNum, float, useScene } from './kit';

interface Props {
  value: number;
  start?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;           // "K", "%", "M"...
  caption: string;
  arrow?: 'up' | 'down' | 'none';
  countDuration?: number;     // seconds
  cue?: string;               // the number appears and starts counting
  cueCaption?: string;
}

const BigNumber: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tLeg = s.at(props.cueCaption ?? 'caption', t0 + 40);
  const dur = Math.round((props.countDuration ?? 1.4) * s.fps);
  const k = interpolate(s.frame, [t0, t0 + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.exp) });
  const dep = props.start ?? 0;
  const v = dep + (props.value - dep) * k;
  const dec = props.decimals ?? 0;
  const text = fmtNum(v, dec);
  const final = fmtNum(props.value, dec);
  const pPop = s.spr(t0, 'pop');
  const pLeg = s.spr(tLeg);
  const pArrow = s.spr(tLeg + 4, 'pop');
  const maxDigits = final.length;
  const sufW = props.suffix ? props.suffix.length * 0.26 + 0.35 : 0;
  const fs = Math.min(380, 940 / (maxDigits * 0.5 + sufW + (props.prefix ? 0.5 : 0)));
  const up = (props.arrow ?? 'up') === 'up';
  const arrow = props.arrow !== 'none';
  const bounce = Math.sin(s.frame / 6) * 7;
  const settle = s.frame > t0 + dur ? 1 + 0.03 * Math.exp(-(s.frame - t0 - dur) / 6) * Math.cos((s.frame - t0 - dur) * 0.8) : 1;
  return (
    <Frame>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 90, textAlign: 'center', opacity: fade(pPop), transform: `translateY(${(1 - pPop) * 60 + float(s, 6)}px) scale(${(0.7 + 0.3 * pPop) * settle})` }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', justifyContent: 'center', color: s.p.ink, lineHeight: 1 }}>
          {props.prefix ? <span style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: fs * 0.4, color: s.p.accent, marginRight: 8 }}>{props.prefix}</span> : null}
          {Array.from(text).map((ch, i) => {
            const isDigit = /\d/.test(ch);
            return (
              <span key={i} style={{ fontFamily: FONTS.display, fontSize: fs, display: 'inline-block', minWidth: isDigit ? fs * 0.5 : undefined, textAlign: 'center' }}>
                {ch === ' ' ? <span style={{ display: 'inline-block', width: fs * 0.16 }} /> : ch}
              </span>
            );
          })}
          {props.suffix ? <span style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: fs * 0.52, color: s.p.accent, marginLeft: 12 }}>{props.suffix}</span> : null}
        </div>
        <div style={{ margin: '10px auto 0', width: 560 * s.prog(t0 + 6, 18), height: 14, borderRadius: 7, background: s.p.accent }} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 90 + fs * 1.18 + 56, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 28, opacity: fade(pLeg), transform: `translateY(${(1 - pLeg) * 30}px)` }}>
        {arrow ? (
          <div style={{ width: 104, height: 104, borderRadius: 26, background: up ? s.p.success : s.p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${0.3 + 0.7 * pArrow}) translateY(${(up ? -1 : 1) * bounce * 0.6}px)`, boxShadow: `0 10px 20px ${s.p.shadow}` }}>
            <svg width="58" height="58" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? undefined : 'rotate(180deg)' }}>
              <path d="M12 20 V5 M5 12 L12 5 L19 12" />
            </svg>
          </div>
        ) : null}
        <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: 66, letterSpacing: -1, color: s.p.ink, maxWidth: 700, lineHeight: 1.05 }}>{props.caption}</div>
      </div>
      {/* small rising bars, low in the background */}
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 80, height: 130, display: 'flex', alignItems: 'flex-end', gap: 12, opacity: fade(pLeg) * 0.9 }}>
        {Array.from({ length: 16 }, (_, i) => {
          const h = (22 + i * 6.5 + (i % 3) * 8) * (0.4 + 0.6 * s.prog(tLeg + i * 2, 16)) + Math.sin(s.frame / 9 + i) * 4;
          return <div key={i} style={{ flex: 1, height: h, borderRadius: 8, background: i === 15 ? s.p.accent : s.night ? 'rgba(244,242,238,0.22)' : 'rgba(10,10,10,0.14)' }} />;
        })}
      </div>
      <div style={{ position: 'absolute', left: 40, bottom: 224, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 50, color: s.p.accent, opacity: fade(pLeg), transform: `rotate(-4deg) translateY(${float(s, 4, 2.4)}px)` }}>
        a record ↘
      </div>
    </Frame>
  );
};

export const bigNumber: SceneDefinition<Props> = {
  type: 'big-number',
  description:
    "Giant Anton number that counts up to its value, with an italic serif suffix, a caption and a small rising or falling arrow. Use it for a striking statistic, a measured result, a view or follower count.",
  exampleProps: {
    value: 2396686,
    suffix: 'views',
    caption: 'on a single reel',
    arrow: 'up',
    countDuration: 1.4,
  },
  cues: ['enter', 'caption'],
  Component: BigNumber,
};
