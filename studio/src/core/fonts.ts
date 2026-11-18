// Declaration of the local fonts (OFL, public/fonts folder) through the FontFace API.
// The render waits (delayRender) until all fonts are loaded before the first frame:
// this guarantees that the text measurements (Captions) and the final render are identical.
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

const loadAll = async (): Promise<void> => {
  await Promise.all(
    FONT_FILES.map(async (f) => {
      const face = new FontFace(f.family, `url(${staticFile(f.file)})`, {
        weight: f.weight,
        style: f.style,
      });
      await face.load();
      document.fonts.add(face);
    }),
  );
};

// Exported promise: useful to modules that want to wait explicitly for the fonts.
export const fontsReady: Promise<void> =
  typeof document === 'undefined'
    ? Promise.resolve()
    : (() => {
        // Generous timeout and a retry: on a machine without a GPU, a busy render tab can
        // take a long time to resolve the fonts (a failure was observed at 58 s).
        const handle = delayRender('Loading local fonts', { timeoutInMilliseconds: 180000, retries: 2 });
        return loadAll()
          .then(() => continueRender(handle))
          .catch((e) => cancelRender(e));
      })();
