// TEMPORARY: 1080×1920 composition that displays a library B scene chosen by props.
import React from 'react';
import { AbsoluteFill, Composition, continueRender, delayRender, staticFile } from 'remotion';
import { SCENES_B } from '../index';
import { PALETTES, FONTS } from '../../../core/theme';
import type { Theme } from '../../../core/types';

interface PreviewProps {
  type: string;
  theme: Theme;
  variant?: number;
  [k: string]: unknown;
}

const FONT_FILES: [string, string, string?][] = [
  ['Inter Tight', 'fonts/InterTight.ttf'],
  ['Instrument Serif', 'fonts/InstrumentSerif-Italic.ttf', 'italic'],
  ['Anton', 'fonts/Anton.ttf'],
  ['JetBrains Mono', 'fonts/JetBrainsMono.ttf'],
];

const Preview: React.FC<PreviewProps> = (props) => {
  const [handle] = React.useState(() => delayRender('fonts'));
  React.useEffect(() => {
    Promise.all(
      FONT_FILES.map(async ([family, file, style]) => {
        const ff = new FontFace(family, `url(${staticFile(file)})`, { style: style ?? 'normal', weight: '100 900' });
        await ff.load();
        document.fonts.add(ff);
      }),
    ).then(() => continueRender(handle), () => continueRender(handle));
  }, [handle]);
  const def = SCENES_B.find((s) => s.type === props.type) ?? SCENES_B[0];
  const pal = PALETTES[props.theme];
  const sceneProps = props.sceneProps ?? (props.variant != null && (def as any).exampleVariants ? (def as any).exampleVariants[props.variant] : def.exampleProps);
  const ctx = { fps: 30, theme: props.theme, durationInFrames: 240, cue: (_n: string | undefined, fb?: number) => fb ?? 0 };
  const C = def.Component;
  return (
    <AbsoluteFill style={{ background: pal.bg, backgroundImage: `radial-gradient(${pal.dot} 1.6px, transparent 1.8px)`, backgroundSize: '14px 14px' }}>
      <div style={{ position: 'absolute', left: 60, top: 560, width: 960, height: 760, outline: '1px dashed rgba(255,0,0,0.25)' }} />
      <div style={{ position: 'absolute', left: 80, top: 100, fontFamily: FONTS.mono, fontSize: 26, color: pal.muted }}>// {def.type}</div>
      <C props={sceneProps as any} spec={{ id: 'p', type: def.type, start: 0, end: 8, props: {}, cues: {} }} ctx={ctx} />
    </AbsoluteFill>
  );
};

export const PreviewRoot: React.FC = () => (
  <Composition id="PreviewB" component={Preview as any} width={1080} height={1920} fps={30} durationInFrames={240}
    defaultProps={{ type: 'keys', theme: 'paper' } as any} />
);
