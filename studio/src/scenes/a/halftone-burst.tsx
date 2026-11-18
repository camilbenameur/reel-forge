// Scene "halftone-burst": burst or wave of halftone dots that fills the screen.
// Transition or emphasis: occupies the whole 1080 x 1920 frame (not just the scene box).
import React from 'react';
import { Easing, interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import { exitOpacity } from '../../core/motion';
import type { SceneDefinition } from '../contract';
import { clamp01, useScene } from './kit';

interface Props {
  pattern: 'burst' | 'wave';
  color?: 'accent' | 'ink' | 'yellow';
  word?: string;                 // punch word in the center (optional)
  center?: { x: number; y: number }; // 0 to 1, for the burst
  cue?: string;                 // trigger
}

const STEP = 40;
const COLS = Math.ceil(1080 / STEP) + 1;
const ROWS = Math.ceil(1920 / STEP) + 1;

const HalftoneBurst: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const f = s.frame - t0;
  const color = props.color === 'ink' ? s.p.ink : props.color === 'yellow' ? '#FEED66' : s.p.accent;
  const cx = (props.center?.x ?? 0.5) * 1080;
  const cy = (props.center?.y ?? 0.42) * 1920;
  const maxR = STEP * 0.62;
  const out = exitOpacity(s.frame, ctx.durationInFrames, 8);
  const grow = interpolate(f, [0, 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const rFront = grow * 2100;
  const yFront = 1920 + 300 - grow * (1920 + 700);

  const dots: React.ReactNode[] = [];
  if (f >= 0) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * STEP + (r % 2 ? STEP / 2 : 0); // staggered grid, like a real print screen
        const y = r * STEP;
        let size = 0;
        if (props.pattern === 'burst') {
          const d = Math.hypot(x - cx, (y - cy) * 0.92);
          if (d < rFront) {
            const base = clamp01(1 - d / 1500);
            const edge = clamp01((rFront - d) / 160); // the front arrives growing
            const pulse = 0.88 + 0.12 * Math.sin(d / 70 - f / 5);
            size = maxR * Math.pow(0.35 + 0.65 * base, 0.9) * edge * pulse * (d < 90 ? 1.25 : 1);
          }
        } else if (y > yFront) {
          const behind = clamp01((y - yFront) / 260);
          const wave = 0.5 + 0.5 * Math.sin((y - yFront) / 130 - f / 6 + x / 380);
          size = maxR * (0.25 + 0.75 * wave) * behind * (0.8 + 0.2 * Math.sin(x / 200));
        }
        if (size > 0.8) dots.push(<circle key={r * COLS + c} cx={x} cy={y} r={size} />);
      }
    }
  }
  const pWord = s.spr(t0 + 10, 'pop');
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920, opacity: out, pointerEvents: 'none' }}>
      <svg width={1080} height={1920} viewBox="0 0 1080 1920" fill={color} style={{ position: 'absolute', inset: 0 }}>
        {dots}
      </svg>
      {props.word ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: cy - 150,
            textAlign: 'center',
            opacity: clamp01(pWord / 0.4),
            transform: `scale(${0.3 + 0.7 * pWord}) rotate(${-4 + Math.sin(s.frame / 12) * 1.2}deg)`,
          }}
        >
          <span
            style={{
              display: 'inline-block',
              fontFamily: FONTS.display,
              fontSize: Math.min(300, 880 / (props.word.length * 0.5)),
              lineHeight: 1.1,
              textTransform: 'uppercase',
              background: s.p.bg,
              color: s.p.ink,
              padding: '10px 50px',
              border: `8px solid ${s.p.ink}`,
              borderRadius: 30,
              boxShadow: `0 20px 40px ${s.p.shadow}`,
            }}
          >
            {props.word}
          </span>
        </div>
      ) : null}
    </div>
  );
};

export const halftoneBurst: SceneDefinition<Props> = {
  type: 'halftone-burst',
  description:
    "Burst or wave of halftone dots that invades the whole screen, with an optional punch word in the center. Use it as a strong transition or to emphasize a reveal, a \"boom\", a key moment.",
  exampleProps: {
    pattern: 'burst',
    color: 'accent',
    word: 'BOOM',
    center: { x: 0.5, y: 0.42 },
  },
  cues: ['enter'],
  Component: HalftoneBurst,
};
