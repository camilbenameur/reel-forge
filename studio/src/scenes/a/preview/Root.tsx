// TEMPORARY: preview composition for the A scenes (remove once the studio core is ready).
import React from 'react';
import { AbsoluteFill, Composition, continueRender, delayRender, staticFile } from 'remotion';
import { palette } from '../../../core/theme';
import type { SceneSpec, Theme } from '../../../core/types';
import type { SceneContext } from '../../contract';
import { SCENES_A } from '../index';

interface P {
  type: string;
  theme: Theme;
  cues?: Record<string, number>;
  props?: Record<string, unknown>;
  [k: string]: unknown;
}

const FACES = `
@font-face{font-family:"Inter Tight";src:url(${staticFile('fonts/InterTight.ttf')});font-weight:100 900}
@font-face{font-family:"Instrument Serif";src:url(${staticFile('fonts/InstrumentSerif-Regular.ttf')});font-style:normal}
@font-face{font-family:"Instrument Serif";src:url(${staticFile('fonts/InstrumentSerif-Italic.ttf')});font-style:italic}
@font-face{font-family:"Anton";src:url(${staticFile('fonts/Anton.ttf')})}
@font-face{font-family:"Bebas Neue";src:url(${staticFile('fonts/BebasNeue.ttf')})}
@font-face{font-family:"JetBrains Mono";src:url(${staticFile('fonts/JetBrainsMono.ttf')});font-weight:100 800}
`;

const Preview: React.FC<P> = ({ type, theme, cues = {}, props }) => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    const faces = ['400 40px "Inter Tight"', '700 40px "Inter Tight"', '40px "Instrument Serif"', 'italic 40px "Instrument Serif"', '40px "Anton"', '40px "JetBrains Mono"'];
    Promise.all(faces.map((f) => document.fonts.load(f))).then(() => continueRender(handle));
  }, [handle]);
  const def = SCENES_A.find((d) => d.type === type);
  if (!def) return <AbsoluteFill style={{ background: '#fff', fontSize: 60 }}>Unknown scene: {type}</AbsoluteFill>;
  const pal = palette(theme);
  const ctx: SceneContext = {
    fps: 30,
    theme,
    durationInFrames: 300,
    cue: (name, fallback = 0) => (name && name in cues ? cues[name] : fallback),
  };
  const spec: SceneSpec = { id: 'x', type, start: 0, end: 5, props: {}, cues: {} };
  const C = def.Component;
  return (
    <AbsoluteFill style={{ background: pal.bg }}>
      <style>{FACES}</style>
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${pal.dot} 1.5px, transparent 1.7px)`,
          backgroundSize: '14px 14px',
        }}
      />
      <C props={{ ...def.exampleProps, ...(props ?? {}) }} spec={spec} ctx={ctx} />
    </AbsoluteFill>
  );
};

export const Root: React.FC = () => (
  <Composition
    id="PreviewA"
    component={Preview as React.FC<any>}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={300}
    defaultProps={{ type: 'step-card', theme: 'paper' }}
  />
);
