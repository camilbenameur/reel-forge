// Hand-coded SVG head. Local frame: origin at the center of the face, y pointing down.
// Layers (back to front): back hair, ears, face, temple fade, eyes,
// nose, glasses, beard, mouth, mustache, front hair, eyebrows.
import React, { useId } from 'react';
import { random } from 'remotion';
import type { Expression, MouthShape } from '../core/types';
import { Mouth } from './mouth';
import type { AvatarStyle } from './style';

export const FACE_PATH =
  'M 0,-152 C 68,-152 113,-110 113,-34 C 113,38 106,98 80,144 C 62,176 30,192 0,192 C -30,192 -62,176 -80,144 C -106,98 -113,38 -113,-34 C -113,-110 -68,-152 0,-152 Z';

// ---- expressions: eyebrows and eyelids --------------------------------------------------------
interface Brow {
  lift: number; // px upwards
  tilt: number; // >0: inner end lowered (skeptical, focused)
}
interface ExprFace {
  browL: Brow; // L and R: on screen
  browR: Brow;
  lidTopL: number;
  lidTopR: number;
  lidBotL: number;
  lidBotR: number;
  wide: number;
}
const Z: Brow = { lift: 0, tilt: 0 };
const EXPR_FACE: Record<Expression, ExprFace> = {
  neutral: { browL: Z, browR: Z, lidTopL: 0, lidTopR: 0, lidBotL: 0, lidBotR: 0, wide: 0 },
  smile: { browL: { lift: 2, tilt: -1 }, browR: { lift: 2, tilt: -1 }, lidTopL: 0, lidTopR: 0, lidBotL: 0.3, lidBotR: 0.3, wide: 0 },
  surprised: { browL: { lift: 15, tilt: -3 }, browR: { lift: 15, tilt: -3 }, lidTopL: 0, lidTopR: 0, lidBotL: 0, lidBotR: 0, wide: 1 },
  skeptical: { browL: { lift: 14, tilt: -2 }, browR: { lift: -3, tilt: 6 }, lidTopL: 0, lidTopR: 0.32, lidBotL: 0, lidBotR: 0.15, wide: 0 },
  laugh: { browL: { lift: 5, tilt: -2 }, browR: { lift: 5, tilt: -2 }, lidTopL: 0.12, lidTopR: 0.12, lidBotL: 0.8, lidBotR: 0.8, wide: 0 },
  'wink': { browL: { lift: 5, tilt: -1 }, browR: { lift: -4, tilt: 2 }, lidTopL: 0, lidTopR: 1, lidBotL: 0.15, lidBotR: 0.3, wide: 0 },
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

// ---- eyebrow: thick and almost straight, slightly thinner towards the outside ----------------------------
const browPath = (side: 1 | -1, lift: number, tilt: number): string => {
  const x = (v: number) => side * v;
  const x0 = x(14), y0 = -60 - lift + tilt;
  const xc = x(58), yc = -74 - lift;
  const x2 = x(100), y2 = -63 - lift - tilt * 0.6;
  const t0 = 13, t2 = 6;
  return (
    `M ${x0},${y0 - t0 / 2} Q ${xc},${yc - 4} ${x2},${y2 - t2 / 2} ` +
    `L ${x2},${y2 + t2 / 2} Q ${xc},${yc + 5} ${x0},${y0 + t0 / 2} Z`
  );
};

// ---- eye ---------------------------------------------------------------------------------------
const Eye: React.FC<{
  side: 1 | -1;
  s: AvatarStyle;
  gaze: { x: number; y: number };
  lidTop: number;
  lidBot: number;
  wide: number;
}> = ({ side, s, gaze, lidTop, lidBot, wide }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const topC = -26 - 9 * wide;
  const botC = 22 + 6 * wide;
  const cTop = topC + (13 - topC) * lidTop; // arc of the upper eyelid (open to closed)
  const cBot = botC + (-2 - botC) * lidBot;
  const almond = `M -29,1 Q 0,${topC} 29,1 Q 0,${botC} -29,1 Z`;
  const gx = clamp(gaze.x, -8, 8) * (side === -1 ? 1 : 1);
  const gy = clamp(gaze.y, -4, 4);
  const closedness = clamp(lidTop, 0, 1);
  return (
    <g transform={`translate(${side * 56} -11)`}>
      <clipPath id={`e${id}`}>
        <path d={almond} />
      </clipPath>
      <g clipPath={`url(#e${id})`}>
        <rect x={-34} y={-30} width={68} height={60} fill={s.eyeWhite} />
        <path d="M -30,-8 L 30,-8 L 30,16 L -30,16 Z" fill="#EEEAE4" opacity={0.0} />
        <g transform={`translate(${gx} ${gy})`}>
          <circle cx={0} cy={0} r={13.5} fill={s.irisLight} />
          <path d="M -13.5,0 A 13.5 13.5 0 0 0 13.5,0 A 12 8 0 0 1 -13.5,0 Z" fill={s.iris} opacity={0} />
          <circle cx={0} cy={-1.5} r={11.5} fill={s.iris} />
          <circle cx={0} cy={0} r={6.2 + wide * 1.2} fill={s.pupil} />
          <circle cx={4.2} cy={-5.2} r={3.4} fill="#FFFFFF" />
          <circle cx={-3.6} cy={3.6} r={1.6} fill="#FFFFFF" opacity={0.85} />
        </g>
        {/* skin-colored eyelids: they "eat" the eye from top to bottom and bottom to top */}
        <path d={`M -34,-48 L 34,-48 L 34,1 L 29,1 Q 0,${cTop} -29,1 L -34,1 Z`} fill={s.skin} />
        <path d={`M -34,40 L 34,40 L 34,1 L 29,1 Q 0,${cBot} -29,1 L -34,1 Z`} fill={s.skin} />
        {/* shadow of the eyelid on the eyeball */}
        <path d={`M -29,1 Q 0,${cTop + 7} 29,1 Q 0,${cTop + 3} -29,1 Z`} fill="#000" opacity={0.12} />
      </g>
      {/* upper lash and eyelid crease */}
      <path
        d={`M -31,2 Q 0,${cTop - 1} 31,2`}
        fill="none"
        stroke={s.brow}
        strokeWidth={closedness > 0.6 ? 3.6 : 4.4}
        strokeLinecap="round"
      />
      <path d={`M ${side * 28 - side * 2},${-1} l ${side * 5},${-3}`} stroke={s.brow} strokeWidth={3} strokeLinecap="round" opacity={0.0} />
      <path
        d={`M -24,${-9 - 3 * wide + cTop * 0.18} Q 0,${cTop - 12 - wide * 3} 26,${-8 - 3 * wide}`}
        fill="none"
        stroke={s.skinLine}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={closedness > 0.7 ? 0.0 : 0.55}
      />
      {/* bag under the eye when smiling */}
      <path
        d={`M -26,${14 + (cBot < 10 ? -2 : 0)} Q 0,${24 + cBot * 0.2} 26,${14}`}
        fill="none"
        stroke={s.skinShade}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.5 + lidBot * 0.4}
      />
    </g>
  );
};

// ---- glasses: thin frame, hexagonal lenses -------------------------------------------------
const LENS = 'M -51,-17 L -30,-39 L 26,-41 L 51,-16 L 48,18 L 17,43 L -27,39 L -49,14 Z';
const Glasses: React.FC<{ s: AvatarStyle }> = ({ s }) => (
  <g strokeLinejoin="round" strokeLinecap="round" fill="none">
    {[-1, 1].map((side) => (
      <g key={side} transform={`translate(${side * 59} -12) scale(${side} 1)`}>
        <path d={LENS} fill={s.lens} />
        <path d="M -30,-26 L -16,-29 L -33,22 L -42,18 Z" fill="#FFFFFF" opacity={0.22} stroke="none" />
        <path d="M -8,-31 L -1,-32 L -17,30 L -22,28 Z" fill="#FFFFFF" opacity={0.14} stroke="none" />
        <path d={LENS} stroke={s.glasses} strokeWidth={2.8} />
        <path d="M -30,-37 L 25,-39 L 49,-16" stroke={s.glassesLight} strokeWidth={1.2} opacity={0.7} />
      </g>
    ))}
    {/* bridge, nose pads and temples */}
    <path d="M -9,-22 Q 0,-32 9,-22" stroke={s.glasses} strokeWidth={2.8} />
    <path d="M -9,-14 q 3,8 1,13 M 9,-14 q -3,8 -1,13" stroke={s.glasses} strokeWidth={1.4} opacity={0.8} />
    <path d="M -109,-27 L -128,-22 M 109,-27 L 128,-22" stroke={s.glasses} strokeWidth={2.8} />
  </g>
);

// ---- nose ----------------------------------------------------------------------------------------
const Nose: React.FC<{ s: AvatarStyle }> = ({ s }) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 8,-10 C 12,18 22,40 32,56 C 26,64 18,68 8,68 Z" fill={s.skinShade} opacity={0.55} stroke="none" />
    <path d="M -12,-4 C -14,20 -20,38 -27,52" stroke={s.skinLine} strokeWidth={2.2} opacity={0.35} />
    <path d="M -27,56 C -25,66 -12,71 0,67 C 12,71 25,66 27,56" stroke={s.skinLine} strokeWidth={3.2} opacity={0.9} />
    <path d="M -27,56 C -33,48 -31,38 -23,35 M 27,56 C 33,48 31,38 23,35" stroke={s.skinLine} strokeWidth={2.6} opacity={0.75} />
    <ellipse cx={-10} cy={64} rx={5.5} ry={2.6} fill="#8B5A40" stroke="none" />
    <ellipse cx={10} cy={64} rx={5.5} ry={2.6} fill="#8B5A40" stroke="none" />
    <ellipse cx={-4} cy={44} rx={5} ry={9} fill="#F5D2B0" opacity={0.3} stroke="none" />
  </g>
);

// ---- ear ------------------------------------------------------------------------------------
const Ear: React.FC<{ side: 1 | -1; s: AvatarStyle }> = ({ side, s }) => (
  <g transform={`translate(${side * 118} -2) rotate(${side * -7})`}>
    <ellipse cx={side * 3} cy={0} rx={17} ry={32} fill={s.skin} stroke={s.skinLine} strokeWidth={2.5} />
    <path d={`M ${side * 3},-18 C ${side * 14},-12 ${side * 14},12 ${side * 3},20`} fill="none" stroke={s.skinShade} strokeWidth={4} strokeLinecap="round" />
    <ellipse cx={side * 2} cy={6} rx={6} ry={10} fill={s.skinShade} opacity={0.6} />
  </g>
);

// ---- hair: high airy curls on top, sides shaved in a fade ------------------
interface Curl {
  x: number;
  y: number;
  r: number;
}

const ring = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, r0: number, dr: number, key: string): Curl[] =>
  Array.from({ length: n }, (_, i) => {
    const th = ((a0 + ((a1 - a0) * i) / (n - 1)) * Math.PI) / 180;
    const jr = random(`${key}-${i}`);
    return {
      x: cx + Math.cos(th) * rx + (random(`${key}x-${i}`) - 0.5) * 6,
      y: cy + Math.sin(th) * ry + (random(`${key}y-${i}`) - 0.5) * 6,
      r: r0 + jr * dr,
    };
  });

const buildCurls = (): { back: Curl[]; front: Curl[]; tips: Curl[] } => {
  const back: Curl[] = [
    ...ring(0, -120, 104, 98, 188, 352, 14, 23, 9, 'cb'),
    ...ring(2, -156, 80, 64, 198, 342, 8, 26, 9, 'cc'),
    ...ring(-4, -186, 44, 22, 212, 330, 5, 24, 8, 'cd'),
  ];
  // small detached curls at the top: airy volume
  const tips: Curl[] = [
    { x: -72, y: -214, r: 13 },
    { x: -34, y: -238, r: 14 },
    { x: 14, y: -246, r: 15 },
    { x: 58, y: -232, r: 13 },
    { x: 92, y: -204, r: 12 },
    { x: -100, y: -180, r: 12 },
  ];
  const front: Curl[] = Array.from({ length: 9 }, (_, i) => {
    const x = -88 + i * 22;
    return {
      x,
      y: -124 + 0.0042 * x * x - random(`fy-${i}`) * 5,
      r: 15.5 + random(`fr-${i}`) * 3.5,
    };
  });
  return { back, front, tips };
};
const CURLS = buildCurls();

const CurlArc: React.FC<{ c: Curl; color: string }> = ({ c, color }) => (
  <path
    d={`M ${c.x - c.r * 0.55},${c.y + c.r * 0.15} A ${c.r * 0.62} ${c.r * 0.62} 0 0 1 ${c.x + c.r * 0.2},${c.y - c.r * 0.55}`}
    fill="none"
    stroke={color}
    strokeWidth={3}
    strokeLinecap="round"
    opacity={0.8}
  />
);

const BackHair: React.FC<{ s: AvatarStyle }> = ({ s }) => (
  <g>
    <ellipse cx={0} cy={-124} rx={112} ry={62} fill={s.hair} />
    {CURLS.back.map((c, i) => (
      <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={s.hair} />
    ))}
    {CURLS.tips.map((c, i) => (
      <circle key={`t${i}`} cx={c.x} cy={c.y} r={c.r} fill={s.hair} />
    ))}
    {CURLS.back.map((c, i) => (i % 3 !== 2 ? <CurlArc key={`a${i}`} c={c} color={s.hairLight} /> : null))}
    {CURLS.tips.map((c, i) => (
      <CurlArc key={`ta${i}`} c={c} color={s.hairLight} />
    ))}
  </g>
);

const FrontHair: React.FC<{ s: AvatarStyle }> = ({ s }) => (
  <g>
    <ellipse cx={0} cy={-164} rx={100} ry={50} fill={s.hair} />
    {/* temple join: the fringe meets the fade with no gap of skin */}
    <ellipse cx={-102} cy={-122} rx={13} ry={17} fill={s.hair} />
    <ellipse cx={102} cy={-122} rx={13} ry={17} fill={s.hair} />
    {CURLS.front.map((c, i) => (
      <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={s.hair} />
    ))}
    {CURLS.front.map((c, i) => (i % 2 === 1 ? <CurlArc key={`a${i}`} c={c} color={s.hairLight} /> : null))}
    {/* strands on top */}
    <path
      d="M -62,-166 C -44,-186 -14,-186 0,-170 M 22,-176 C 40,-192 70,-184 80,-164 M -96,-140 C -90,-160 -74,-170 -58,-166"
      fill="none"
      stroke={s.hairLight}
      strokeWidth={3}
      strokeLinecap="round"
      opacity={0.75}
    />
  </g>
);

// Clean fade: shaved skin from the temples to above the ear, getting lighter towards the bottom.
const Fade: React.FC<{ s: AvatarStyle }> = ({ s }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '_');
  return (
    <g>
      <defs>
        <linearGradient id={`fd${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={s.hair} stopOpacity={1} />
          <stop offset="0.45" stopColor={s.hairFade} stopOpacity={0.85} />
          <stop offset="1" stopColor={s.hairFade} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[-1, 1].map((side) => (
        <path
          key={side}
          transform={`scale(${side} 1)`}
          d="M 113,-112 L 94,-112 C 96,-84 100,-58 103,-30 L 111,-24 C 113,-50 114,-80 113,-112 Z"
          fill={`url(#fd${id})`}
        />
      ))}
    </g>
  );
};

// ---- short beard and mustache ------------------------------------------------------------------
// Band following the jaw: thin sideburns, clear high cheeks, full chin, skin visible around the mouth.
const BEARD_SHAPE =
  'M -124,-70 L -106,-70 C -105,-30 -102,2 -99,26 C -95,56 -84,84 -70,104 C -64,114 -60,120 -56,126 C -36,160 36,160 56,126 C 60,120 64,114 70,104 C 84,84 95,56 99,26 C 102,2 105,-30 106,-70 L 124,-70 L 126,230 L -126,230 Z';
const EDGE: [number, number][] = [[-70, 106], [0, 102], [26, 99], [56, 93], [84, 82], [104, 70], [126, 56]];
const edgeX = (y: number) => {
  for (let i = 0; i < EDGE.length - 1; i++) {
    const [y0, x0] = EDGE[i];
    const [y1, x1] = EDGE[i + 1];
    if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
  }
  return 56;
};

const Beard: React.FC<{ s: AvatarStyle }> = ({ s }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const dots = React.useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: (random(`st-x-${i}`) - 0.5) * 230,
        y: 60 + random(`st-y-${i}`) * 140,
        r: 0.9 + random(`st-r-${i}`) * 1.0,
      })),
    [],
  );
  // beard shadow: scattered dots on the inner edge of the beard, for a non-geometric outline
  const fringe = React.useMemo(
    () =>
      Array.from({ length: 38 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const y = -30 + random(`fr-k-${i}`) * 150;
        return { x: side * (edgeX(y) - 1 - random(`fr-x-${i}`) * 8), y, r: 0.8 + random(`fr-r-${i}`) * 0.8 };
      }),
    [],
  );
  return (
    <g>
      <clipPath id={`bf${id}`}>
        <path d={FACE_PATH} />
      </clipPath>
      <clipPath id={`b${id}`}>
        <path d={BEARD_SHAPE} />
      </clipPath>
      <g clipPath={`url(#bf${id})`}>
        <path d={BEARD_SHAPE} fill={s.beard} opacity={0.9} />
        {fringe.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={s.beard} opacity={0.5} />
        ))}
        <g clipPath={`url(#b${id})`}>
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={s.beardLight} opacity={0.55} />
          ))}
          <path d="M -92,70 C -84,120 -60,160 -22,184 M 92,70 C 84,120 60,160 22,184" stroke={s.beardLight} strokeWidth={4} fill="none" opacity={0.35} strokeLinecap="round" />
        </g>
      </g>
    </g>
  );
};

// Thin mustache, right above the lip: the mouth (and teeth) stay clearly visible below.
const Moustache: React.FC<{ s: AvatarStyle }> = ({ s }) => (
  <g>
    <path
      d="M 0,85 C -14,82 -36,84 -54,94 C -58,99 -53,102 -48,100 C -34,93 -18,92 -3,95 L 0,93 L 3,95 C 18,92 34,93 48,100 C 53,102 58,99 54,94 C 36,84 14,82 0,85 Z"
      fill={s.beard}
      stroke={s.beard}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <path d="M -44,92 C -32,88 -18,88 -6,90 M 44,92 C 32,88 18,88 6,90" stroke={s.beardLight} strokeWidth={1.8} fill="none" strokeLinecap="round" opacity={0.6} />
  </g>
);

// ---- assembly ---------------------------------------------------------------------------------
export interface HeadProps {
  s: AvatarStyle;
  expression: Expression;
  mouthA: MouthShape;
  mouthB: MouthShape;
  mouthMix: number;
  blink: number;
  gaze: { x: number; y: number };
  brow: number;
  smile?: number;
  smirk?: number;
}

export const Head: React.FC<HeadProps> = ({ s, expression, mouthA, mouthB, mouthMix, blink, gaze, brow, smile = 0, smirk = 0 }) => {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const ef = EXPR_FACE[expression];
  const lid = (base: number) => base + (1 - base) * blink;
  const browLift = (b: Brow) => clamp(b.lift + brow * 9 + smirk * 7, -8, 28);
  return (
    <g>
      <BackHair s={s} />
      <Ear side={-1} s={s} />
      <Ear side={1} s={s} />
      {/* face + flat shadows */}
      <clipPath id={`f${id}`}>
        <path d={FACE_PATH} />
      </clipPath>
      <path d={FACE_PATH} fill={s.skin} />
      <g clipPath={`url(#f${id})`}>
        <path d="M 56,-160 C 100,-90 100,40 52,196 L 160,196 L 160,-160 Z" fill={s.skinShade} opacity={0.5} />
        <ellipse cx={0} cy={-108} rx={124} ry={22} fill={s.skinShade} opacity={0.7} />
        <ellipse cx={-64} cy={52} rx={24} ry={16} fill={s.blush} opacity={0.18} />
        <ellipse cx={64} cy={52} rx={24} ry={16} fill={s.blush} opacity={0.18} />
      </g>
      <path d={FACE_PATH} fill="none" stroke={s.skinLine} strokeWidth={2.5} opacity={0.55} />
      <Fade s={s} />
      <Eye side={-1} s={s} gaze={gaze} lidTop={lid(ef.lidTopL)} lidBot={ef.lidBotL} wide={ef.wide} />
      <Eye side={1} s={s} gaze={gaze} lidTop={lid(ef.lidTopR)} lidBot={ef.lidBotR} wide={ef.wide} />
      <Nose s={s} />
      <Glasses s={s} />
      <Beard s={s} />
      <Mouth a={mouthA} b={mouthB} mix={mouthMix} expression={expression} s={s} smile={smile} smirk={smirk} />
      <Moustache s={s} />
      <FrontHair s={s} />
      <path
        d={browPath(-1, browLift(ef.browL), ef.browL.tilt)}
        fill={s.brow}
        stroke={s.brow}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      <path
        d={browPath(1, browLift(ef.browR), ef.browR.tilt)}
        fill={s.brow}
        stroke={s.brow}
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </g>
  );
};
