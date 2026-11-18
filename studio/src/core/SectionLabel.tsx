// Mono label at the top left ("// 03 — the stack") and counter at the top right
// ("API KEYS 2", value in the accent color). On a section change: typing effect + small spring.
import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { typed, SPRINGS } from './motion';
import { FONTS, LAYOUT, type Palette } from './theme';
import type { Section } from './types';

export const SectionLabel: React.FC<{ sections: Section[]; pal: Palette }> = ({ sections, pal }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let idx = -1;
  sections.forEach((s, i) => {
    if (Math.round(s.start * fps) <= frame) idx = i;
  });
  if (idx < 0) return null;

  const sec = sections[idx];
  const prev = idx > 0 ? sections[idx - 1] : undefined;
  const at = Math.round(sec.start * fps);
  const text = `// ${sec.label}`;
  const shown = typed(frame, fps, at, text, 48);
  const typing = shown.length < text.length;
  const caret = typing || Math.floor((frame - at) / 8) % 2 === 0 ? (frame - at < fps * 1.2 ? '▍' : '') : '';

  const counter = sec.counter;
  let counterNode: React.ReactNode = null;
  if (counter) {
    const labelShown = typed(frame, fps, at + 3, counter.label.toUpperCase(), 40);
    const changed = !prev?.counter || prev.counter.value !== counter.value;
    const p = changed
      ? spring({ frame: frame - (at + 6), fps, config: SPRINGS.pop })
      : 1;
    const valueShown = frame >= at + 4;
    counterNode = (
      <div
        style={{
          position: 'absolute',
          right: 80,
          top: LAYOUT.sectionLabelY,
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          fontFamily: FONTS.mono,
          fontSize: 28,
          letterSpacing: '0.06em',
          color: pal.ink,
          whiteSpace: 'pre',
        }}
      >
        <span style={{ opacity: 0.75 }}>{labelShown}</span>
        {valueShown && (
          <span
            style={{
              display: 'inline-block',
              color: pal.accent,
              fontWeight: 800,
              fontSize: 34,
              transform: `scale(${0.6 + 0.4 * p})`,
              transformOrigin: 'right center',
              opacity: Math.min(1, p * 2.5),
            }}
          >
            {counter.value}
          </span>
        )}
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 80,
          top: LAYOUT.sectionLabelY,
          fontFamily: FONTS.mono,
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: '0.02em',
          color: pal.ink,
          whiteSpace: 'pre',
        }}
      >
        {shown}
        <span style={{ color: pal.accent }}>{caret}</span>
      </div>
      {counterNode}
    </>
  );
};
