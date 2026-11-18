// Mascot: final component (placed in the canvas according to LAYOUT.avatar) and reusable figure.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { PALETTES, LAYOUT } from '../core/theme';
import type { AvatarTrack, Pose, Theme, Word } from '../core/types';
import { computeState, type FigureState } from './anim';
import { PoseArms, Torso } from './body';
import { Head } from './head';
import { AVATAR_STYLE, type AvatarStyle } from './style';

export { AVATAR_STYLE } from './style';

// Drawing box of the mascot (local coordinates). It matches LAYOUT.avatar.
export const FIGURE_BOX = { width: 520, height: 630 } as const;

// Scale and vertical offset of the mascot in the canvas (8 % reduction, 30 px lower).
export const AVATAR_SCALE = 0.92;
export const AVATAR_SHIFT_Y = 30;

// Slight tilt / offset of the head depending on the pose (degrees, local pixels).
const POSE_HEAD: Partial<Record<Pose, { rot: number; dy: number; dx: number }>> = {
  facepalm: { rot: -5, dy: 8, dx: 4 },
  thinking: { rot: 4, dy: 2, dx: -2 },
  wave: { rot: -2, dy: 0, dx: 0 },
  'point-up': { rot: -2, dy: 0, dx: 0 },
  'point-scene': { rot: -3, dy: 0, dx: -4 },
  celebrate: { rot: 0, dy: -5, dx: 0 },
  'thumbs-up': { rot: 2, dy: 0, dx: 0 },
  'point-down': { rot: 2, dy: 3, dx: 0 },
  'point-self': { rot: 3, dy: 0, dx: 2 },
};
const headPose = (p: Pose) => POSE_HEAD[p] ?? { rot: 0, dy: 0, dx: 0 };

const NECK = { x: 300, y: 408 };
const HEAD_SCALE = 0.9;
const HEAD_CY = 200;

// The mascot drawing alone, in the local 520x630 box (may overflow).
export const Figure: React.FC<{ state: FigureState; style?: AvatarStyle }> = ({ state, style = AVATAR_STYLE }) => {
  const st = state;
  const cur = headPose(st.pose);
  const prv = st.prevPose ? headPose(st.prevPose) : cur;
  const mix = st.poseMix;
  const hRot = prv.rot + (cur.rot - prv.rot) * mix;
  const hDy = prv.dy + (cur.dy - prv.dy) * mix;
  const hDx = prv.dx + (cur.dx - prv.dx) * mix;

  const nodRot = st.nod * 2.6;
  const nodDy = st.nod * 6 + (1 - st.bounce) * -8;
  const breathY = 1 + 0.01 * st.breathe;
  const rot = hRot + nodRot;
  const pivotY = (NECK.y - HEAD_CY) / HEAD_SCALE;

  const bodyTransform =
    `translate(0 ${(1 - st.slide) * 720}) ` +
    `rotate(${st.sway} 300 720) ` +
    `translate(300 720) scale(1 ${breathY}) translate(-300 -720)`;

  const arms = (layer: 'back' | 'front') => (
    <>
      {st.prevPose && st.poseMix < 1 && (
        <PoseArms pose={st.prevPose} s={style} layer={layer} t={st.t} bounce={1} />
      )}
      <g opacity={st.poseMix}>
        <PoseArms pose={st.pose} s={style} layer={layer} t={st.t} bounce={st.bounce} />
      </g>
    </>
  );

  return (
    <g transform={bodyTransform}>
      <g transform="translate(0 -18)">
        <Torso s={style} />
      </g>
      {arms('back')}
      <g
        transform={`translate(${NECK.x + hDx} ${NECK.y + hDy + nodDy}) rotate(${rot}) scale(${HEAD_SCALE}) translate(0 ${-pivotY})`}
      >
        <Head
          s={style}
          expression={st.expression}
          mouthA={st.mouthA}
          mouthB={st.mouthB}
          mouthMix={st.mouthMix}
          blink={st.blink}
          gaze={st.gaze}
          brow={st.brow}
          smile={st.smile}
          smirk={st.smirk}
        />
      </g>
      {arms('front')}
    </g>
  );
};

export const Avatar: React.FC<{ track: AvatarTrack; words: Word[]; theme: Theme }> = ({ track, words, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!track.visible) return null;
  const state = computeState(track, words, frame, fps);
  const pal = PALETTES[theme];
  return (
    <svg
      width={FIGURE_BOX.width}
      height={FIGURE_BOX.height}
      viewBox={`0 0 ${FIGURE_BOX.width} ${FIGURE_BOX.height}`}
      style={{
        position: 'absolute',
        left: LAYOUT.avatar.x,
        top: LAYOUT.avatar.y,
        overflow: 'visible',
        // VI4: the mascot does not dominate the scene: 8 % smaller (anchored at the top), 30 px lower.
        transform: `translateY(${AVATAR_SHIFT_Y}px) scale(${AVATAR_SCALE})`,
        transformOrigin: '50% 0%',
        filter: `drop-shadow(0 10px 16px ${pal.shadow})`,
      }}
    >
      <Figure state={state} />
    </svg>
  );
};
