// Word-by-word captions: one page at a time (1 to 3 lines). A word that has started = full ink, an
// upcoming word = contrasted grey, a keyword = Instrument Serif italic in the accent color, slightly larger.
// Line breaking is computed by hand (canvas measurement) to guarantee at most 3 lines within
// LAYOUT.captions.width, shrinking the font size if needed, and to never split a non-breaking
// space (French typography).
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONTS, LAYOUT, type Palette } from './theme';
import type { CaptionPage, Language, Word } from './types';

const SANS_WEIGHT = 600;
const BASE_FONT = 70;             // 68 to 72 px like the reference (LAYOUT.captions.fontSize is the fallback)
const LETTER_SPACING_EM = -0.012; // slightly negative letter spacing
const EMPHASIS_SCALE = 1.1;
const MIN_FONT = 36;
const NBSP = /[  ]/;

// --- Text measurement -------------------------------------------------------------------------

let ctx: CanvasRenderingContext2D | null | undefined;
const cache = new Map<string, number>();

const measureBase = (text: string, emphasis: boolean): number => {
  const key = `${emphasis ? 'e' : 's'}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (ctx === undefined) {
    ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  let w: number;
  if (!ctx) {
    w = text.length * 100 * (emphasis ? 0.42 : 0.52);
  } else {
    ctx.font = emphasis
      ? `italic 400 100px "Instrument Serif"`
      : `${SANS_WEIGHT} 100px "Inter Tight"`;
    w = ctx.measureText(text).width;
  }
  // Do not cache until the fonts are loaded (fallback measurement otherwise).
  if (typeof document === 'undefined' || document.fonts.status === 'loaded') cache.set(key, w);
  return w;
};

// Width at 1 px of font size (emphasis: enlarged).
const wordWidth = (w: Word) =>
  (measureBase(w.text, w.emphasis) / 100 + (w.emphasis ? 0 : w.text.length * LETTER_SPACING_EM)) *
  (w.emphasis ? EMPHASIS_SCALE : 1);
const spaceWidth = () => measureBase(' ', false) / 100;

// --- Line breaking --------------------------------------------------------------------------

// A word must not be separated from the previous one ("word" + "?"), nor from an opening quote or
// parenthesis, nor from a trailing non-breaking space.
// A short function word (the, a, of, to, de, le, que, je...) stays glued to the next word: never a line
// break between the two. The list depends on the reel language.
const SMALL_WORDS: Record<Language, Set<string>> = {
  en: new Set(
    ('a an the of to in on at by for and or but nor so yet as if is it its be am are was i me my we us our you your he him his ' +
      'she her they them their this that these those with from into onto than then not no do does did can will').split(' '),
  ),
  fr: new Set(
    ('le la les un une des de du d l à a au aux en et ou ni mais donc or car que qu ce cet cette ces mon ton son ma ta sa mes tes ' +
      'ses je tu il elle on nous vous ils elles me te se ne n y si sur dans par pour avec sans sous c j m s t').split(' '),
  ),
};
const isSmall = (w: Word, language: Language): boolean => {
  if (w.emphasis || /[,;:.!?…]$/.test(w.text)) return false;
  const bare = w.text.toLowerCase().replace(/[’']$/, '').replace(/^.*[’']/, '');
  return SMALL_WORDS[language].has(bare) && w.text.length <= 5;
};
const glued = (prev: Word, cur: Word, language: Language): boolean =>
  isSmall(prev, language) ||
  /^[?!:;»%€)\]…]/.test(cur.text) ||
  /[«(\[]$/.test(prev.text) ||
  NBSP.test(prev.text.slice(-1)) ||
  NBSP.test(cur.text.charAt(0));

interface Layout {
  fontSize: number;
  lines: number[][]; // local indices into `words`
}

const layoutWords = (words: Word[], language: Language): Layout => {
  const { width, maxLines } = LAYOUT.captions;
  const base = BASE_FONT;
  // Group into unbreakable units.
  const units: number[][] = [];
  words.forEach((w, i) => {
    if (i > 0 && glued(words[i - 1], w, language)) units[units.length - 1].push(i);
    else units.push([i]);
  });
  const unitW = (u: number[]) =>
    u.reduce((s, i) => s + wordWidth(words[i]), 0) + spaceWidth() * (u.length - 1);

  let best: Layout = { fontSize: MIN_FONT, lines: [words.map((_, i) => i)] };
  for (let size = base; size >= MIN_FONT; size -= 2) {
    const sp = spaceWidth() * size;
    const lines: number[][] = [];
    let cur: number[] = [];
    let curW = 0;
    let ok = true;
    for (const u of units) {
      const w = unitW(u) * size;
      if (w > width) ok = false;
      if (cur.length && curW + sp + w > width) {
        lines.push(cur);
        cur = [];
        curW = 0;
      }
      curW += (cur.length ? sp : 0) + w;
      cur = cur.concat(u);
    }
    if (cur.length) lines.push(cur);
    best = { fontSize: size, lines };
    if (ok && lines.length <= maxLines) return best;
  }
  return best;
};

// --- Component -------------------------------------------------------------------------------

export const Captions: React.FC<{
  pages: CaptionPage[];
  words: Word[];
  pal: Palette;
  language?: Language;
}> = ({ pages, words, pal, language = 'en' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  // Current page: the last one started, held 0.25 s after its end (no visual gap).
  let pageIdx = -1;
  pages.forEach((p, i) => {
    if (p.start <= t + 1e-6) pageIdx = i;
  });
  if (pageIdx < 0) return null;
  const page = pages[pageIdx];
  if (t > page.end + 0.25) return null;

  const pageWords = page.words.map((i) => words[i]).filter(Boolean);
  if (!pageWords.length) return null;

  const layout = layoutWords(pageWords, language);
  const pageEnd = Math.round((page.end + 0.25) * fps);
  const pageOut = interpolate(frame, [pageEnd - 2, pageEnd], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const { fontSize: _unused, lineHeight, x, y, width } = LAYOUT.captions;
  const size = layout.fontSize;
  void _unused;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        opacity: pageOut,
        fontFamily: FONTS.sans,
        fontWeight: SANS_WEIGHT,
        fontSize: size,
        lineHeight,
        letterSpacing: `${LETTER_SPACING_EM}em`,
      }}
    >
      {layout.lines.map((line, li) => (
        <div key={li} style={{ display: 'flex', whiteSpace: 'pre', height: size * lineHeight }}>
          {line.map((wi, k) => {
            const w = pageWords[wi];
            // "Upcoming" to "said" transition over 2 frames from the start of the word; the whole page is visible from its first frame.
            const wf = Math.round(w.start * fps);
            const said = interpolate(frame, [wf, wf + 2], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const color = w.emphasis ? mix(pal.muted, pal.accent, said) : mix(pal.muted, pal.ink, said);
            const pop = w.emphasis ? 1 + 0.06 * Math.sin(said * Math.PI) : 1;
            const gap = k < line.length - 1 ? spaceWidth() * size : 0;
            return (
              <span
                key={wi}
                style={{
                  display: 'inline-block',
                  marginRight: gap,
                  transform: `scale(${pop})`,
                  transformOrigin: 'left bottom',
                  color,
                  ...(w.emphasis
                    ? {
                        fontFamily: FONTS.serif,
                        fontStyle: 'italic',
                        fontWeight: 400,
                        letterSpacing: 0,
                        fontSize: size * EMPHASIS_SCALE,
                        lineHeight: `${size * lineHeight}px`,
                      }
                    : {}),
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Linear mix of two CSS colors through color-mix (recent Chromium), no manual computation.
const mix = (a: string, b: string, p: number): string =>
  p <= 0 ? a : p >= 1 ? b : `color-mix(in srgb, ${b} ${(p * 100).toFixed(1)}%, ${a})`;
