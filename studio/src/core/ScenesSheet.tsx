// Control sheet: plays each scene of the registry with its exampleProps (75 frames each).
import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { listScenes } from '../scenes/registry';
import { Background } from './Background';
import { ErrorCard, SceneHost } from './SceneHost';
import { FONTS, PALETTES } from './theme';
import type { SceneSpec } from './types';

export const SHEET_FRAMES_PER_SCENE = 75;
const FPS = 30;

export const sheetDuration = () => Math.max(1, listScenes().length) * SHEET_FRAMES_PER_SCENE;

export const ScenesSheet: React.FC = () => {
  const scenes = listScenes();
  const pal = PALETTES.paper;

  if (!scenes.length) {
    return (
      <AbsoluteFill>
        <Background night={0} />
        <div style={{ position: 'absolute', left: 60, top: 560, width: 960, height: 760 }}>
          <ErrorCard title="Empty registry" detail="No scene in scenes/a and scenes/b yet." />
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <Background night={0} />
      {scenes.map((def, i) => {
        const spec: SceneSpec = {
          id: `sheet-${def.type}`,
          type: def.type,
          start: 0,
          end: SHEET_FRAMES_PER_SCENE / FPS,
          props: (def.exampleProps ?? {}) as Record<string, unknown>,
          cues: {},
        };
        return (
          <Sequence
            key={def.type}
            from={i * SHEET_FRAMES_PER_SCENE}
            durationInFrames={SHEET_FRAMES_PER_SCENE}
            layout="none"
          >
            <SceneHost spec={spec} fromFrame={0} durationInFrames={SHEET_FRAMES_PER_SCENE} theme="paper" />
            <div
              style={{
                position: 'absolute',
                left: 80,
                top: 120,
                fontFamily: FONTS.mono,
                fontSize: 30,
                color: pal.ink,
              }}
            >
              {`// ${String(i + 1).padStart(2, '0')}/${scenes.length} — ${def.type}`}
            </div>
            <div
              style={{
                position: 'absolute',
                left: 80,
                top: 200,
                width: 920,
                fontFamily: FONTS.sans,
                fontSize: 36,
                lineHeight: 1.2,
                color: pal.ink,
              }}
            >
              {def.description}
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
