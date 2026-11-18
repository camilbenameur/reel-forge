// Mouths: 9 shapes (Rhubarb convention A-H + X), drawn through the beard and the mustache,
// modulated by the expression. Each shape is a set of numeric parameters, hence interpolable.
import React, { useId } from 'react';
import type { Expression, MouthShape } from '../core/types';
import type { AvatarStyle } from './style';

export interface MouthParams {
  w: number;      // width
  h: number;      // opening (top to bottom) at the center
  up: number;     // share of the opening above the rest line
  round: number;  // 0 almond-shaped, 1 round
  teeth: number;  // upper teeth visible (0..1)
  tongue: number; // tongue (0..1), 1 = raised against the teeth
  lower: number;  // thickness of the lower lip
  over: number;   // 1 = lower lip raised under the teeth (f, v)
}

export const MOUTH_SHAPES: Record<MouthShape, MouthParams> = {
  X: { w: 68, h: 0, up: 0.5, round: 0, teeth: 0, tongue: 0, lower: 9, over: 0 },
  A: { w: 64, h: 0, up: 0.5, round: 0, teeth: 0, tongue: 0, lower: 6, over: 0 },
  B: { w: 72, h: 9, up: 0.4, round: 0, teeth: 0.9, tongue: 0, lower: 7, over: 0 },
  C: { w: 72, h: 22, up: 0.35, round: 0.2, teeth: 0.4, tongue: 0.4, lower: 7, over: 0 },
  D: { w: 78, h: 42, up: 0.28, round: 0.3, teeth: 0.25, tongue: 0.6, lower: 7, over: 0 },
  E: { w: 46, h: 32, up: 0.45, round: 1, teeth: 0, tongue: 0.3, lower: 7, over: 0 },
  F: { w: 30, h: 26, up: 0.5, round: 1, teeth: 0, tongue: 0, lower: 6, over: 0 },
  G: { w: 68, h: 14, up: 0.4, round: 0, teeth: 1, tongue: 0, lower: 11, over: 1 },
  H: { w: 66, h: 24, up: 0.35, round: 0.2, teeth: 0.5, tongue: 1, lower: 7, over: 0 },
};

export const lerpParams = (a: MouthParams, b: MouthParams, k: number): MouthParams => {
  const o = {} as MouthParams;
  (Object.keys(a) as (keyof MouthParams)[]).forEach((key) => {
    o[key] = a[key] + (b[key] - a[key]) * k;
  });
  return o;
};

interface ExprMod {
  lift: number;   // raised corners (px, positive = smile)
  wMul: number;
  hAdd: number;
  skewL: number;  // vertical offset of the left corner on screen
  skewR: number;
  dx: number;
}

const EXPR: Record<Expression, ExprMod> = {
  neutral: { lift: 0, wMul: 1, hAdd: 0, skewL: 0, skewR: 0, dx: 0 },
  smile: { lift: 8, wMul: 1.1, hAdd: 0, skewL: 0, skewR: 0, dx: 0 },
  surprised: { lift: 0, wMul: 0.82, hAdd: 9, skewL: 0, skewR: 0, dx: 0 },
  skeptical: { lift: 0, wMul: 0.92, hAdd: 0, skewL: 4, skewR: -8, dx: 5 },
  laugh: { lift: 12, wMul: 1.2, hAdd: 7, skewL: 0, skewR: 0, dx: 0 },
  'wink': { lift: 7, wMul: 1.06, hAdd: 0, skewL: 1, skewR: -4, dx: 2 },
};

// In silence (X), some expressions open the mouth on their own.
const REST_OVERRIDE: Partial<Record<Expression, Partial<MouthParams>>> = {
  surprised: { w: 34, h: 28, up: 0.45, round: 1, lower: 7 },
  laugh: { w: 80, h: 32, up: 0.25, round: 0.35, teeth: 0.32, tongue: 0.7, lower: 7 },
};

export const Mouth: React.FC<{
  a: MouthShape;
  b: MouthShape;
  mix: number;
  expression: Expression;
  s: AvatarStyle;
  cy?: number;
  smile?: number; // 0..1: slight smile added (emphasis word)
  smirk?: number; // 0..1: smirk, right side of the screen
}> = ({ a, b, mix, expression, s, cy = 120, smile = 0, smirk = 0 }) => {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const base0 = EXPR[expression];
  const mod: ExprMod = {
    ...base0,
    lift: base0.lift + smile * 4 + smirk * 3,
    wMul: base0.wMul + smile * 0.05,
    skewR: base0.skewR - smirk * 6,
    skewL: base0.skewL + smirk * 1,
    dx: base0.dx + smirk * 3,
  };
  const forShape = (shape: MouthShape): MouthParams => {
    const base = MOUTH_SHAPES[shape];
    const over = shape === 'X' ? REST_OVERRIDE[expression] : undefined;
    return over ? { ...base, ...over } : base;
  };
  const p = lerpParams(forShape(a), forShape(b), mix);
  const w = p.w * mod.wMul;
  const h = Math.max(0, p.h + (p.h > 1 ? mod.hAdd : 0));
  const cx = mod.dx;
  const kx = (w / 2) * (0.45 + 0.55 * p.round);
  const yL = cy - mod.lift + mod.skewL;
  const yR = cy - mod.lift + mod.skewR;
  const cornerAvg = (yL + yR) / 2;
  // top of each lip; at rest, the center drops slightly below the corners (U-shaped smile)
  const sag = mod.lift * 0.55;
  const top = cy - h * p.up + sag * (h > 1 ? 0.2 : 1) - 0.5;
  const bot = cy + h * (1 - p.up) + sag * (h > 1 ? 0.2 : 1);
  const topC = (top - 0.25 * cornerAvg) / 0.75;
  const botC = (bot - 0.25 * cornerAvg) / 0.75;
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  const upper = `M ${xl},${yL} C ${cx - kx},${topC} ${cx + kx},${topC} ${xr},${yR}`;
  const lowerBack = `C ${cx + kx},${botC} ${cx - kx},${botC} ${xl},${yL}`;
  const outline = `${upper} ${lowerBack} Z`;
  const open = h > 1.5;
  const teethH = Math.min(18, p.teeth * h * 0.85);
  const tongueRy = Math.max(0, h * 0.3 * Math.min(1, p.tongue + 0.2)) * (p.tongue > 0.02 ? 1 : 0);
  const tongueCy = bot - tongueRy * 0.75 - (p.tongue > 0.9 ? h * 0.2 : 0);
  const lowerT = p.lower;
  // lower lip: crescent under the bottom curve
  const lowerLip =
    `M ${xl + 3},${yL + 1} C ${cx - kx},${botC} ${cx + kx},${botC} ${xr - 3},${yR + 1} ` +
    `C ${cx + kx * 0.8},${botC + lowerT * 1.35} ${cx - kx * 0.8},${botC + lowerT * 1.35} ${xl + 3},${yL + 1} Z`;
  const clipId = `mc${rawId}`;
  return (
    <g>
      {/* shadow under the lip */}
      <ellipse cx={cx} cy={bot + lowerT + 7} rx={w * 0.26} ry={4} fill={s.skinShade} opacity={0.7} />
      {open && (
        <>
          <clipPath id={clipId}>
            <path d={outline} />
          </clipPath>
          <path d={outline} fill={s.mouthInside} />
          <g clipPath={`url(#${clipId})`}>
            {p.tongue > 0.02 && (
              <ellipse cx={cx + 2} cy={tongueCy + 2} rx={w * 0.3} ry={tongueRy + 2} fill={s.tongue} />
            )}
            {p.teeth > 0.02 && (
              <>
                <rect x={xl - 4} y={top - 6} width={w + 8} height={teethH + 6} fill={s.teeth} />
                <rect x={xl - 4} y={top + teethH - 1.5} width={w + 8} height={1.5} fill="#D9D2C4" />
              </>
            )}
          </g>
        </>
      )}
      <path d={lowerLip} fill={s.lip} />
      <path
        d={`M ${xl + 6},${yL + lowerT * 0.1} C ${cx - kx * 0.6},${botC + lowerT * 0.5} ${cx + kx * 0.6},${botC + lowerT * 0.5} ${xr - 6},${yR + lowerT * 0.1}`}
        fill="none"
        stroke="#E0A18E"
        strokeWidth={2}
        opacity={0.55}
        strokeLinecap="round"
      />
      <path d={upper} fill="none" stroke={s.lipDark} strokeWidth={open ? 4 : 3.4} strokeLinecap="round" />
      {open && (
        <path d={`M ${xr},${yR} ${lowerBack}`} fill="none" stroke={s.lipDark} strokeWidth={3} strokeLinecap="round" opacity={0.9} />
      )}
      {/* small folds at the corners */}
      <path
        d={`M ${xl - 3},${yL - 5} q -3,5 0,10 M ${xr + 3},${yR - 5} q 3,5 0,10`}
        fill="none"
        stroke={s.skinLine}
        strokeWidth={2}
        opacity={0.55}
        strokeLinecap="round"
      />
    </g>
  );
};
