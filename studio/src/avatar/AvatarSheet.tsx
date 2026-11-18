// Mascot control sheet (1080x1920, 300 frames): all the poses, all the expressions,
// the 9 mouth shapes, and at the bottom right the "live" mascot that chains poses x expressions.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, PALETTES } from '../core/theme';
import type { AvatarTrack, Expression, MouthShape, Pose, Word } from '../core/types';
import { Avatar, Figure } from './Avatar';
import { computeState } from './anim';

const POSES: Pose[] = [
  'neutral',
  'point-up',
  'point-scene',
  'wave',
  'thumbs-up',
  'thinking',
  'facepalm',
  'arms-open',
  'celebrate',
  'point-down',
  'point-self',
];
const EXPRESSIONS: Expression[] = ['neutral', 'smile', 'surprised', 'skeptical', 'laugh', 'wink'];
const MOUTHS: MouthShape[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X'];

const pal = PALETTES.paper;

const Label: React.FC<{ x: number; y: number; w: number; children: React.ReactNode; size?: number }> = ({
  x,
  y,
  w,
  children,
  size = 15,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width: w,
      fontFamily: FONTS.mono,
      fontSize: size,
      color: pal.ink,
      textAlign: 'center',
      letterSpacing: 0.3,
    }}
  >
    {children}
  </div>
);

const Cell: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  view: [number, number, number, number];
  pose: Pose;
  expression: Expression;
  mouth: MouthShape;
  label: string;
}> = ({ x, y, w, h, view, pose, expression, mouth, label }) => {
  const track: AvatarTrack = {
    visible: true,
    poses: [{ t: 0, pose, expression }],
    mouth: [{ t: 0, shape: mouth }],
    seed: 7,
  };
  const state = computeState(track, [], 0, 30, { still: true });
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: w,
          height: h,
          overflow: 'hidden',
          background: '#FFFFFF',
          border: `1.5px solid ${pal.line}`,
          borderRadius: 14,
        }}
      >
        <svg width={w} height={h} viewBox={view.join(' ')} style={{ display: 'block' }}>
          <Figure state={state} />
        </svg>
      </div>
      <Label x={x} y={y + h + 4} w={w}>
        {label}
      </Label>
    </>
  );
};

// Synthetic track of the live mascot: 22 pose keys (13 frames), mouths every 4 frames.
const buildTrack = (): { track: AvatarTrack; words: Word[] } => {
  const poses = Array.from({ length: 22 }, (_, k) => ({
    t: (k * 13) / 30,
    pose: POSES[k >> 1],
    expression: EXPRESSIONS[(k * 5) % 6],
  }));
  const mouth = Array.from({ length: 76 }, (_, k) => ({
    t: (k * 4) / 30,
    shape: (k % 10 === 9 ? 'X' : MOUTHS[(k * 7) % 8]) as MouthShape,
  }));
  const words: Word[] = Array.from({ length: 8 }, (_, k) => ({
    text: 'word',
    start: 0.8 + k * 1.2,
    end: 1.2 + k * 1.2,
    emphasis: true,
  }));
  return { track: { visible: true, poses, mouth, seed: 11 }, words };
};
const LIVE = buildTrack();

export const AvatarSheet: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const live = computeState(LIVE.track, LIVE.words, frame, fps);

  const BODY_VIEW: [number, number, number, number] = [-170, -30, 760, 680];
  const HEAD_VIEW: [number, number, number, number] = [120, -40, 360, 430];
  const MOUTH_VIEW: [number, number, number, number] = [190, 215, 220, 160];

  return (
    <AbsoluteFill style={{ background: pal.bg }}>
      <Label x={60} y={34} w={960} size={22}>
        {`// avatar — control sheet  ·  frame ${frame}`}
      </Label>

      {/* poses (cycling mouth) */}
      {POSES.map((p, i) => {
        const cw = 148;
        const ch = 168;
        const col = i % 6;
        const row = Math.floor(i / 6);
        return (
          <Cell
            key={p}
            x={50 + col * (cw + 12)}
            y={90 + row * (ch + 44)}
            w={cw}
            h={ch}
            view={BODY_VIEW}
            pose={p}
            expression={EXPRESSIONS[(i + 1) % 6]}
            mouth={MOUTHS[(i + Math.floor(frame / 5)) % 9]}
            label={`${p}`}
          />
        );
      })}

      {/* expressions */}
      {EXPRESSIONS.map((e, i) => (
        <Cell
          key={e}
          x={50 + i * 168}
          y={540}
          w={158}
          h={188}
          view={HEAD_VIEW}
          pose="neutral"
          expression={e}
          mouth="X"
          label={e}
        />
      ))}

      {/* mouth shapes, with a neutral smile */}
      {MOUTHS.map((m, i) => {
        const cw = 190;
        const ch = 138;
        return (
          <Cell
            key={m}
            x={50 + (i % 5) * (cw + 10)}
            y={800 + Math.floor(i / 5) * (ch + 40)}
            w={cw}
            h={ch}
            view={MOUTH_VIEW}
            pose="neutral"
            expression="neutral"
            mouth={m}
            label={`mouth ${m}`}
          />
        );
      })}

      {/* same D mouth across the expressions */}
      {EXPRESSIONS.map((e, i) => (
        <Cell
          key={`d-${e}`}
          x={50 + (i % 3) * 200}
          y={1150 + Math.floor(i / 3) * 176}
          w={190}
          h={138}
          view={MOUTH_VIEW}
          pose="neutral"
          expression={e}
          mouth={i % 2 === 0 ? 'D' : 'C'}
          label={`${e} ${i % 2 === 0 ? 'D' : 'C'}`}
        />
      ))}

      {/* caption of the live mascot */}
      <Label x={60} y={1520} w={480} size={18}>
        {`live: ${live.pose} · ${live.expression}`}
      </Label>
      <Label x={60} y={1550} w={480} size={16}>
        {`mouth ${live.mouthB} · blink ${live.blink.toFixed(2)} · brow ${live.brow.toFixed(2)}`}
      </Label>

      <Avatar track={LIVE.track} words={LIVE.words} theme="paper" />
    </AbsoluteFill>
  );
};
