// Background: theme color (paper <-> night fade), slowly drifting dot grid, very light grain.
import React from 'react';
import { AbsoluteFill, interpolateColors, random, useCurrentFrame } from 'remotion';
import { PALETTES } from './theme';

const GRAIN_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>";
const GRAIN_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_SVG)}")`;

const DOT_STEP = 40;

// `night`: 0 = paper, 1 = night (intermediate value during the animated switch).
export const Background: React.FC<{ night: number }> = ({ night }) => {
  const frame = useCurrentFrame();
  const bg = interpolateColors(night, [0, 1], [PALETTES.paper.bg, PALETTES.night.bg]);
  const dot = interpolateColors(night, [0, 1], [PALETTES.paper.dot, PALETTES.night.dot]);

  // Slow drift of the grid (about 4.5 px/s in x, 3 px/s in y), periodic on the step.
  const ox = (frame * 0.15) % DOT_STEP;
  const oy = (frame * 0.1) % DOT_STEP;

  // The grain jumps position every 2 frames (deterministic) to feel alive without flickering.
  const g = Math.floor(frame / 2);
  const gx = Math.floor(random(`grain-x-${g}`) * 256);
  const gy = Math.floor(random(`grain-y-${g}`) * 256);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(circle, ${dot} 2.2px, transparent 2.8px)`,
          backgroundSize: `${DOT_STEP}px ${DOT_STEP}px`,
          backgroundPosition: `${ox}px ${oy}px`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_URL,
          backgroundSize: '256px 256px',
          backgroundPosition: `${gx}px ${gy}px`,
          opacity: 0.045,
          mixBlendMode: night > 0.5 ? 'screen' : 'multiply',
        }}
      />
    </AbsoluteFill>
  );
};
