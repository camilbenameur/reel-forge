// Bust: torso (t-shirt + open overshirt), neck, and arms per pose (sleeves + hands).
import React from 'react';
import type { Pose } from '../core/types';
import { Hand, type HandType } from './hands';
import type { AvatarStyle } from './style';

type P = [number, number];

interface HandDef {
  type: HandType;
  rot: number;
  flip?: boolean;
  over?: boolean; // drawn over the sleeve (the hand covers its own sleeve)
  spread?: number;
  len?: number;
}

interface ArmDef {
  s: P; // shoulder
  e: P; // elbow
  w: P; // wrist
  hand?: HandDef;
}

interface PoseDef {
  L: ArmDef; // left arm on screen
  R: ArmDef; // right arm on screen
  front?: boolean; // drawn in front of the head (hand on the face)
  frontSide?: 'L' | 'R' | 'both';
}

const SL: P = [108, 520];
const SR: P = [492, 520];

const IDLE_L: ArmDef = { s: SL, e: [66, 632], w: [92, 730] };
const IDLE_R: ArmDef = { s: SR, e: [536, 632], w: [510, 730] };

export const POSES: Record<Pose, PoseDef> = {
  neutral: {
    L: { s: SL, e: [40, 610], w: [150, 586], hand: { type: 'open', rot: 84, spread: 0.45, len: 0.8 } },
    R: { s: SR, e: [560, 610], w: [450, 586], hand: { type: 'open', rot: -84, spread: 0.45, len: 0.8, flip: true } },
  },
  'point-up': {
    L: { s: SL, e: [14, 650], w: [64, 478], hand: { type: 'point', rot: 7 } },
    R: IDLE_R,
  },
  'point-scene': {
    L: { s: SL, e: [10, 566], w: [-72, 506], hand: { type: 'point', rot: -78 } },
    R: IDLE_R,
  },
  wave: {
    L: { s: SL, e: [-2, 640], w: [48, 440], hand: { type: 'open', rot: 6 } },
    R: IDLE_R,
  },
  'thumbs-up': {
    L: { s: SL, e: [8, 650], w: [74, 506], hand: { type: 'thumb', rot: 4 } },
    R: IDLE_R,
  },
  thinking: {
    L: IDLE_L,
    R: { s: SR, e: [540, 620], w: [388, 400], hand: { type: 'fist', rot: -34, flip: true } },
    front: true,
    frontSide: 'R',
  },
  facepalm: {
    L: { s: SL, e: [28, 458], w: [188, 318], hand: { type: 'open', rot: 30, spread: 0.7, len: 0.95 } },
    R: IDLE_R,
    front: true,
    frontSide: 'L',
  },
  'arms-open': {
    L: { s: SL, e: [4, 612], w: [52, 492], hand: { type: 'open', rot: -22, spread: 1.15 } },
    R: { s: SR, e: [548, 612], w: [470, 492], hand: { type: 'open', rot: 22, spread: 1.15, flip: true } },
  },
  celebrate: {
    L: { s: SL, e: [18, 556], w: [72, 392], hand: { type: 'fist', rot: 10 } },
    R: { s: SR, e: [544, 556], w: [474, 392], hand: { type: 'fist', rot: -10, flip: true } },
  },
  'point-down': {
    L: { s: SL, e: [-10, 450], w: [-58, 506], hand: { type: 'point', rot: 204, over: true } },
    R: IDLE_R,
  },
  // the index finger of the mascot's right hand (on the left of the screen, heart side) aims at the middle of the chest
  'point-self': {
    L: IDLE_L,
    R: { s: SR, e: [560, 612], w: [462, 520], hand: { type: 'point', rot: -70 } },
  },
};

const rotOf = (a: P, b: P) => (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180) / Math.PI;

const unit = (a: P, b: P): P => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
};
// quadrilateral of a sleeve between a and b, of width wa at a and wb at b
const sleeveQuad = (a: P, b: P, wa: number, wb: number): string => {
  const [ux, uy] = unit(a, b);
  const nx = -uy;
  const ny = ux;
  const f = (n: number) => n.toFixed(1);
  return (
    `M ${f(a[0] + nx * wa / 2)},${f(a[1] + ny * wa / 2)} L ${f(b[0] + nx * wb / 2)},${f(b[1] + ny * wb / 2)} ` +
    `L ${f(b[0] - nx * wb / 2)},${f(b[1] - ny * wb / 2)} L ${f(a[0] - nx * wa / 2)},${f(a[1] - ny * wa / 2)} Z`
  );
};

// Sleeve: rounded shoulder, arm tapering to the cuff, concentric folds at the elbow, folds at the wrist.
const Arm: React.FC<{ arm: ArmDef; s: AvatarStyle; wave?: number }> = ({ arm, s, wave = 0 }) => {
  const WS = 74; // width at the shoulder
  const WE = 62; // at the elbow
  const WW = 50; // at the wrist
  const f = (n: number) => n.toFixed(1);
  const u1 = unit(arm.e, arm.s); // from the elbow to the shoulder
  const u2 = unit(arm.e, arm.w); // from the elbow to the wrist
  const fd = unit(arm.e, arm.w); // direction of the forearm
  const cb: P = [arm.w[0] - fd[0] * 17, arm.w[1] - fd[1] * 17];
  const upper = sleeveQuad(arm.s, arm.e, WS, WE);
  const fore = sleeveQuad(arm.e, arm.w, WE - 2, WW + 2);
  const cuff = sleeveQuad(cb, arm.w, WW + 3, WW + 1);
  // concentric folds on the inner side of the elbow
  const cross = u1[0] * u2[1] - u1[1] * u2[0];
  const ang1 = Math.atan2(u1[1], u1[0]);
  const ang2 = Math.atan2(u2[1], u2[0]);
  let d = ang2 - ang1;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const bendMag = Math.abs(d); // 0 = straight arm, pi = folded
  const folds = [16, 25, 34].map((r, i) => {
    const a0 = ang1 + d * (0.2 + 0.03 * i);
    const a1 = ang1 + d * (0.8 - 0.03 * i);
    const p0 = `${f(arm.e[0] + Math.cos(a0) * r)},${f(arm.e[1] + Math.sin(a0) * r)}`;
    const p1 = `${f(arm.e[0] + Math.cos(a1) * r)},${f(arm.e[1] + Math.sin(a1) * r)}`;
    return <path key={i} d={`M ${p0} A ${r} ${r} 0 0 ${d > 0 ? 1 : 0} ${p1}`} stroke={s.overshirtShade} strokeWidth={3} opacity={0.5 + Math.min(0.4, bendMag * 0.25)} />;
  });
  // folds at the wrist, perpendicular to the forearm
  const wrist = [0.22, 0.36].map((k, i) => {
    const c: P = [cb[0] - fd[0] * (14 * (i + 1)), cb[1] - fd[1] * (14 * (i + 1))];
    const nx = -fd[1];
    const ny = fd[0];
    const w = 17 - i * 3;
    return (
      <path
        key={k}
        d={`M ${f(c[0] - nx * w)},${f(c[1] - ny * w)} Q ${f(c[0] + fd[0] * 5)},${f(c[1] + fd[1] * 5)} ${f(c[0] + nx * w)},${f(c[1] + ny * w)}`}
        stroke={s.overshirtShade}
        strokeWidth={2.6}
        opacity={0.7}
      />
    );
  });
  // shoulder seam: arc that separates the shoulder from the arm
  const su = unit(arm.s, arm.e);
  const sn: P = [-su[1], su[0]];
  const seamC: P = [arm.s[0] + su[0] * 30, arm.s[1] + su[1] * 30];
  const h = arm.hand;
  const handNode = h && (
    <g transform={`translate(${arm.w[0]} ${arm.w[1]}) rotate(${h.rot + wave}) scale(${h.flip ? -1.14 : 1.14} 1.14)`}>
      <Hand type={h.type} s={s} spread={h.spread} len={h.len} />
    </g>
  );
  const line = s.overshirtLine;
  return (
    <g strokeLinecap="round" strokeLinejoin="round" fill="none">
      {/* hand first: the sleeve covers the wrist */}
      {h && !h.over && handNode}
      {/* outlines */}
      <g fill={line} stroke={line} strokeWidth={4.5}>
        <path d={upper} />
        <path d={fore} />
        <circle cx={arm.e[0]} cy={arm.e[1]} r={WE / 2} />
        <circle cx={arm.s[0]} cy={arm.s[1]} r={WS / 2 - 2} />
        <path d={cuff} />
      </g>
      {/* flat fills */}
      <g fill={s.overshirt} stroke="none">
        <path d={upper} />
        <path d={fore} />
        <circle cx={arm.e[0]} cy={arm.e[1]} r={WE / 2} />
        <circle cx={arm.s[0]} cy={arm.s[1]} r={WS / 2 - 2} />
      </g>
      {folds}
      {wrist}
      <path d={cuff} fill={s.overshirtShade} stroke={s.overshirtLine} strokeWidth={2.5} />
      <circle cx={arm.w[0] - fd[0] * 8 - fd[1] * 14} cy={arm.w[1] - fd[1] * 8 + fd[0] * 14} r={2.6} fill={s.button} stroke="none" />
      <path
        d={`M ${f(seamC[0] + sn[0] * 34)},${f(seamC[1] + sn[1] * 34)} Q ${f(seamC[0] + su[0] * 8)},${f(seamC[1] + su[1] * 8)} ${f(seamC[0] - sn[0] * 34)},${f(seamC[1] - sn[1] * 34)}`}
        stroke={s.overshirtShade}
        strokeWidth={3}
        opacity={0.8}
      />
      {h && h.over && handNode}
    </g>
  );
};

export const PoseArms: React.FC<{
  pose: Pose;
  s: AvatarStyle;
  layer: 'back' | 'front';
  t: number;
  bounce: number;
}> = ({ pose, s, layer, t, bounce }) => {
  const def = POSES[pose];
  const isFront = !!def.front;
  const wave = pose === 'wave' ? 9 * Math.sin(2 * Math.PI * 1.6 * t) : 0;
  const shake = pose === 'celebrate' ? 5 * Math.sin(2 * Math.PI * 3 * t) : 0;
  const rise = (1 - bounce) * 34;
  const draw = (side: 'L' | 'R') => {
    const frontSide = def.frontSide ?? 'both';
    const thisFront = isFront && (frontSide === 'both' || frontSide === side);
    if ((layer === 'front') !== thisFront) return null;
    return <Arm key={side} arm={def[side]} s={s} wave={side === 'L' ? wave + shake : -wave - shake} />;
  };
  return (
    <g transform={`translate(0 ${rise})`}>
      {draw('L')}
      {draw('R')}
    </g>
  );
};

export const Torso: React.FC<{ s: AvatarStyle }> = ({ s }) => {
  const outer = 'M 22,720 L 40,528 C 52,462 120,418 236,402 L 364,402 C 480,418 548,462 560,528 L 578,720 Z';
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* overshirt */}
      <path d={outer} fill={s.overshirt} stroke={s.overshirtLine} strokeWidth={4} />
      <path
        d="M 436,420 C 500,436 548,476 560,528 L 578,720 L 440,720 C 450,600 452,500 436,420 Z"
        fill={s.overshirtShade}
        opacity={0.55}
      />
      {/* neck */}
      <path d="M 252,330 L 348,330 L 352,430 C 330,452 270,452 248,430 Z" fill={s.skin} />
      <path d="M 250,380 C 280,412 322,412 350,380 L 352,430 C 330,452 270,452 248,430 Z" fill={s.skinShade} />
      {/* white t-shirt, round neckline */}
      <path
        d="M 246,404 C 250,444 272,462 300,462 C 328,462 350,444 354,404 L 376,720 L 224,720 Z"
        fill={s.tee}
        stroke={s.overshirtLine}
        strokeWidth={3}
      />
      <path d="M 262,430 C 276,456 324,456 338,430" fill="none" stroke={s.teeLine} strokeWidth={4} opacity={0.9} />
      {/* overshirt lapels */}
      <path
        d="M 238,398 C 214,404 190,414 176,428 L 214,486 C 238,484 262,490 282,500 C 262,470 248,436 238,398 Z"
        fill={s.overshirtLight}
        stroke={s.overshirtLine}
        strokeWidth={3.5}
      />
      <path
        d="M 362,398 C 386,404 410,414 424,428 L 386,486 C 362,484 338,490 318,500 C 338,470 352,436 362,398 Z"
        fill={s.overshirtLight}
        stroke={s.overshirtLine}
        strokeWidth={3.5}
      />
      {/* edges of the open overshirt + buttons */}
      <path d="M 232,500 L 224,720 M 368,500 L 376,720" stroke={s.overshirtLine} strokeWidth={3} fill="none" />
      <path d="M 244,500 L 238,720 M 356,500 L 362,720" stroke={s.overshirtShade} strokeWidth={2.5} fill="none" opacity={0.7} />
      {/* chest pocket, right side on screen */}
      <g fill="none" stroke={s.overshirtLine} strokeWidth={3}>
        <path d="M 396,540 L 456,540 L 456,606 C 440,616 412,616 396,606 Z" fill={s.overshirtShade} fillOpacity={0.35} />
        <path d="M 396,556 L 456,556" />
      </g>
      <circle cx={426} cy={566} r={4.5} fill={s.button} />
      {/* shoulder seams */}
      <path
        d="M 120,470 C 100,490 86,510 78,540 M 480,470 C 500,490 514,510 522,540"
        stroke={s.overshirtShade}
        strokeWidth={3}
        fill="none"
        opacity={0.8}
      />
    </g>
  );
};
