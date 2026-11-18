// Declaration of the local fonts (OFL, public/fonts folder) through the FontFace API.
// <FontGate> holds the render (delayRender) and mounts its children only once all fonts are loaded:
// this guarantees that the text measurements (Captions) and the final render are identical.
//
// The delayRender is created from a component, not at module evaluation: at module level the handle was
// forgotten when `remotion/no-react` reset window.remotion_delayRenderHandles, so frames were captured before the
// fonts were ready, the timer was never cleared and a spurious "Loading local fonts" timeout fired every period.
import React, { useEffect, useState } from 'react';
import { cancelRender, continueRender, delayRender, staticFile } from 'remotion';

interface FontSpec {
  family: string;
  file: string;
  weight: string;
  style: 'normal' | 'italic';
}

export const FONT_FILES: FontSpec[] = [
  { family: 'Inter Tight', file: 'fonts/InterTight.ttf', weight: '100 900', style: 'normal' },
  { family: 'Instrument Serif', file: 'fonts/InstrumentSerif-Regular.ttf', weight: '400', style: 'normal' },
  { family: 'Instrument Serif', file: 'fonts/InstrumentSerif-Italic.ttf', weight: '400', style: 'italic' },
  { family: 'Anton', file: 'fonts/Anton.ttf', weight: '400', style: 'normal' },
  { family: 'Bebas Neue', file: 'fonts/BebasNeue.ttf', weight: '400', style: 'normal' },
  { family: 'JetBrains Mono', file: 'fonts/JetBrainsMono.ttf', weight: '100 800', style: 'normal' },
];

let loading: Promise<void> | null = null;

const loadAll = (): Promise<void> => {
  loading ??= Promise.all(
    FONT_FILES.map(async (f) => {
      const face = new FontFace(f.family, `url(${staticFile(f.file)})`, {
        weight: f.weight,
        style: f.style,
      });
      await face.load();
      document.fonts.add(face);
    }),
  ).then(() => undefined);
  return loading;
};

export const FontGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ready, setReady] = useState(false);
  // Generous timeout and a retry: on a machine without a GPU, a busy render tab can take a long time to
  // resolve the fonts (a failure was observed at 58 s).
  const [handle] = useState(() => delayRender('Loading local fonts', { timeoutInMilliseconds: 180000, retries: 2 }));
  useEffect(() => {
    loadAll().then(() => setReady(true), (e) => cancelRender(e));
  }, []);
  // Release the render only after the children have been committed.
  useEffect(() => {
    if (ready) continueRender(handle);
  }, [ready, handle]);
  return ready ? <>{children}</> : null;
};
