// Scene host: resolves the type in the registry, provides SceneContext (including cue()), isolates
// errors (visible red card, never a crash) and applies the enter/exit transition.
// The scene receives the whole 1080x1920 canvas; its kit places itself in SCENE_BOX.
import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { SCENE_BOX, type SceneContext } from '../scenes/contract';
import { getScene } from '../scenes/registry';
import { exitOpacity } from './motion';
import { FONTS } from './theme';
import type { SceneSpec, Theme, Word } from './types';

// Short exit (3 frames): the next scene enters in 2 frames, so there is no long crossfade (metric RY6): a pop, not a fade.
export const EXIT_FRAMES = 3;
const ENTER_FRAMES = 2;
const ENTER_SPRING = { damping: 20, stiffness: 320, mass: 0.5 };

// Pulse on a keyword: the scene swells by 3.5 % then comes back, starting PULSE_LEAD_FRAMES frames before the word
// (format rule: the visual event precedes the word by 1 to 3 frames; metric RY4).
export const PULSE_LEAD_FRAMES = 2;
const PULSE_SCALE = 0.035;
const PULSE_FRAMES = 14;

// First frames of the keyword groups (a group = a run of consecutive emphasis words).
export const keywordFrames = (words: Word[] | undefined, fps: number): number[] => {
  const out: number[] = [];
  let prev = false;
  for (const w of words ?? []) {
    if (w.emphasis && !prev) out.push(Math.round(w.start * fps));
    prev = !!w.emphasis;
  }
  return out;
};

export const pulseAt = (frame: number, keywords: number[]): number => {
  let best = 0;
  for (const kf of keywords) {
    const k = frame - (kf - PULSE_LEAD_FRAMES);
    if (k < 0 || k >= PULSE_FRAMES) continue;
    const v = k < 2 ? k / 2 : Math.exp(-(k - 2) / 3.5);
    best = Math.max(best, v);
  }
  return best * PULSE_SCALE;
};

export const ErrorCard: React.FC<{ title: string; detail?: string }> = ({ title, detail }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      gap: 16,
      padding: 40,
      border: '6px solid #D7260B',
      borderRadius: 28,
      background: 'rgba(255,224,218,0.95)',
      color: '#8C1405',
      fontFamily: FONTS.mono,
      boxSizing: 'border-box',
    }}
  >
    <div style={{ fontSize: 40, fontWeight: 800 }}>{title}</div>
    {detail && <div style={{ fontSize: 26, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail}</div>}
  </div>
);

class Boundary extends React.Component<
  { type: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <ErrorCard
          title={`Error in scene "${this.props.type}"`}
          detail={String(this.state.error.message ?? this.state.error).slice(0, 400)}
        />
      );
    }
    return this.props.children;
  }
}

export const SceneHost: React.FC<{
  spec: SceneSpec;
  fromFrame: number;        // absolute frame where the Sequence starts
  durationInFrames: number; // nominal scene duration (the Sequence lasts EXIT_FRAMES longer for the exit)
  theme: Theme;             // current theme (discrete)
  isLast?: boolean;         // no exit on the last scene
  words?: Word[];           // words of the reel: used for the keyword pulses
}> = ({ spec, fromFrame, durationInFrames, theme, isLast, words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ctx: SceneContext = {
    fps,
    theme,
    durationInFrames,
    cue: (name, fallback = 0) => {
      const t = name !== undefined ? spec.cues?.[name] : undefined;
      if (typeof t !== 'number' || !Number.isFinite(t)) return fallback;
      return Math.max(0, Math.round(t * fps) - fromFrame);
    },
  };

  // Spring entrance, short exit (opacity + slight recoil) over the last frames.
  // Short spring (about 6 frames): the entrance is a pop, not a slide that gets confused with a fade (metric RY6).
  const p = spring({ frame, fps, config: ENTER_SPRING });
  // Near-hard entrance (pop: 85 % then 100 % over ENTER_FRAMES frames, plus the position spring): never a crossfade.
  const enterOpacity = interpolate(frame, [0, ENTER_FRAMES], [0.85, 1], { extrapolateRight: 'clamp' });
  const pulse = pulseAt(frame + fromFrame, keywordFrames(words, fps));
  // The exit starts at the nominal end of the scene and overlaps the entrance of the next one (no gap).
  const out = isLast ? 1 : exitOpacity(frame, durationInFrames + EXIT_FRAMES, EXIT_FRAMES);
  const exitK = 1 - out; // 0 to 1 during the exit
  const transform = `translateY(${(1 - p) * 24 - exitK * 14}px) scale(${0.97 + 0.03 * p - exitK * 0.02 + pulse})`;

  const def = getScene(spec.type);
  let body: React.ReactNode;
  if (!def) {
    body = (
      <ErrorCard
        title={`Unknown scene: "${spec.type}"`}
        detail={`No scene of this type in the registry (id: ${spec.id}).`}
      />
    );
  } else {
    const C = def.Component;
    body = (
      <Boundary type={spec.type}>
        <C props={(spec.props ?? {}) as Record<string, unknown>} spec={spec} ctx={ctx} />
      </Boundary>
    );
  }

  // The scene kits (scenes/a/kit.tsx, scenes/b/kit.tsx) place themselves on SCENE_BOX in canvas
  // coordinates: the host therefore covers the whole canvas, and only the error cards
  // are cropped into SCENE_BOX here.
  const isError = !def;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: enterOpacity * out,
        transform,
        transformOrigin: `${SCENE_BOX.x + SCENE_BOX.width / 2}px ${SCENE_BOX.y + SCENE_BOX.height / 2}px`,
      }}
    >
      {isError ? (
        <div style={{ position: 'absolute', left: SCENE_BOX.x, top: SCENE_BOX.y, width: SCENE_BOX.width, height: SCENE_BOX.height }}>
          {body}
        </div>
      ) : (
        body
      )}
    </div>
  );
};
