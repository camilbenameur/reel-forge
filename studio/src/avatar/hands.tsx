// Vector hands, drawn fingers. Local frame: wrist at the origin, fingers pointing up (-y).
// The fingers are rounded strokes drawn twice (outline then fill) for a clean outline.
import React from 'react';
import type { AvatarStyle } from './style';

export type HandType = 'open' | 'point' | 'fist' | 'thumb';

interface Finger {
  d: string;
  w: number;
}

const Strokes: React.FC<{ fingers: Finger[]; color: string; extra?: number }> = ({ fingers, color, extra = 0 }) => (
  <>
    {fingers.map((f, i) => (
      <path key={i} d={f.d} stroke={color} strokeWidth={f.w + extra} strokeLinecap="round" fill="none" />
    ))}
  </>
);

// Palm: rounded trapezoid, slightly narrower at the wrist.
const PALM = 'M -22,2 C -30,-12 -31,-40 -27,-54 C -23,-63 23,-63 27,-54 C 31,-40 30,-12 22,2 Z';
const FIST = 'M -22,2 C -31,-14 -33,-44 -28,-58 C -22,-70 22,-70 28,-58 C 33,-44 31,-14 22,2 Z';

export const Hand: React.FC<{
  type: HandType;
  s: AvatarStyle;
  spread?: number; // 'open': finger spread (1 = normal)
  len?: number;    // 'open': finger length (1 = normal)
}> = ({ type, s, spread = 1, len = 1 }) => {
  const line = s.skinLine;
  const L = 3; // outline thickness (each side: L/2)

  if (type === 'open') {
    const f = (x0: number, y0: number, ang: number, length: number, w: number): Finger => {
      const a = (ang * spread * Math.PI) / 180;
      const x1 = x0 + Math.sin(a) * length * len;
      const y1 = y0 - Math.cos(a) * length * len;
      // slight curvature for a lively finger
      const cx = (x0 + x1) / 2 + Math.cos(a) * 2;
      const cy = (y0 + y1) / 2 + Math.sin(a) * 2;
      return { d: `M ${x0},${y0} Q ${cx},${cy} ${x1},${y1}`, w };
    };
    const fingers: Finger[] = [
      f(-19, -50, -16, 54, 13), // index
      f(-6, -56, -3, 60, 13.5), // middle
      f(8, -55, 8, 55, 13), // ring
      f(21, -47, 20, 42, 11.5), // pinky
    ];
    const thumb: Finger = (() => {
      const a = (-52 * Math.max(0.6, spread) * Math.PI) / 180;
      const x1 = -25 + Math.sin(a) * 40;
      const y1 = -16 - Math.cos(a) * 40;
      return { d: `M -24,-14 Q ${-24 + (x1 + 24) * 0.4 - 4},${-14 + (y1 + 14) * 0.7} ${x1},${y1}`, w: 14.5 };
    })();
    const all = [thumb, ...fingers];
    return (
      <g>
        <Strokes fingers={all} color={line} extra={L} />
        <path d={PALM} fill={line} stroke={line} strokeWidth={L} strokeLinejoin="round" />
        <path d={PALM} fill={s.skin} />
        <Strokes fingers={all} color={s.skin} />
        {/* flat shadow on the palm side + knuckle folds */}
        <path d="M 12,0 C 22,-14 22,-38 18,-52 C 26,-48 28,-30 24,-8 C 22,-2 18,2 12,2 Z" fill={s.skinShade} opacity={0.7} />
        <path d="M -24,-72 l 8,-2 M -9,-80 l 8,0 M 6,-76 l 8,1 M 19,-62 l 7,2" stroke={s.skinLine} strokeWidth={1.8} opacity={0.55} strokeLinecap="round" fill="none" />
      </g>
    );
  }

  // fists: the four folded fingers form rounded bands at the top of the fist
  const bands = (n: number, x0: number, w: number, y: number, h: number) =>
    Array.from({ length: n }, (_, i) => (
      <rect key={i} x={x0 + i * w} y={y} width={w + 1} height={h} rx={(w + 1) / 2} />
    ));

  if (type === 'point') {
    const index: Finger[] = [{ d: 'M -15,-46 L -15,-104', w: 15 }];
    return (
      <g>
        <Strokes fingers={index} color={line} extra={L} />
        <path d={PALM} fill={line} stroke={line} strokeWidth={L} strokeLinejoin="round" />
        <path d={PALM} fill={s.skin} />
        {/* folded fingers: three horizontal bands on the right */}
        <g fill={line} stroke={line} strokeWidth={L} strokeLinejoin="round">
          <rect x={-4} y={-60} width={32} height={15} rx={7.5} />
          <rect x={-4} y={-46} width={32} height={15} rx={7.5} />
          <rect x={-2} y={-32} width={29} height={14} rx={7} />
        </g>
        <g fill={s.skin}>
          <rect x={-4} y={-60} width={32} height={15} rx={7.5} />
          <rect x={-4} y={-46} width={32} height={15} rx={7.5} />
          <rect x={-2} y={-32} width={29} height={14} rx={7} />
        </g>
        <Strokes fingers={index} color={s.skin} />
        {/* thumb folded across */}
        <path d="M -26,-16 C -20,-30 -8,-34 6,-30" stroke={line} strokeWidth={14 + L} strokeLinecap="round" fill="none" />
        <path d="M -26,-16 C -20,-30 -8,-34 6,-30" stroke={s.skin} strokeWidth={14} strokeLinecap="round" fill="none" />
        <path d="M 14,-60 L 14,-18" stroke={s.skinShade} strokeWidth={2} opacity={0.5} fill="none" />
      </g>
    );
  }

  // 'fist' et 'thumb'
  const thumbUp = type === 'thumb';
  const thumb: Finger = thumbUp
    ? { d: 'M -17,-34 C -27,-52 -26,-74 -22,-92', w: 17 }
    : { d: 'M -26,-18 C -18,-34 -4,-40 10,-34', w: 15 };
  return (
    <g>
      {thumbUp && <Strokes fingers={[thumb]} color={line} extra={L} />}
      <path d={FIST} fill={line} stroke={line} strokeWidth={L} strokeLinejoin="round" />
      <path d={FIST} fill={s.skin} />
      <g fill={line} stroke={line} strokeWidth={L} strokeLinejoin="round">
        {bands(4, -26, 13, -68, 40)}
      </g>
      <g fill={s.skin}>{bands(4, -26, 13, -68, 40)}</g>
      <path d="M -13,-56 L -13,-36 M 0,-56 L 0,-36 M 13,-56 L 13,-36" stroke={s.skinShade} strokeWidth={2} opacity={0.5} fill="none" />
      {thumbUp ? (
        <>
          <Strokes fingers={[thumb]} color={s.skin} />
          <ellipse cx={-22} cy={-86} rx={5.5} ry={4.5} fill="#F3D9C4" opacity={0.85} />
          <path d="M -34,-30 C -30,-24 -24,-20 -14,-18" stroke={line} strokeWidth={2} fill="none" opacity={0.6} />
        </>
      ) : (
        <>
          <Strokes fingers={[thumb]} color={line} extra={L} />
          <Strokes fingers={[thumb]} color={s.skin} />
        </>
      )}
      <path d="M 14,-52 C 22,-40 22,-20 16,-6" stroke={s.skinShade} strokeWidth={6} opacity={0.6} fill="none" strokeLinecap="round" />
    </g>
  );
};
