// Style tokens. Colors sampled from captures of the reference format
// (background #F5F3EF, accent #FF4A20, black #0A0A0A, yellow of the night variant #FEED66).
import type { Theme } from './types';

export interface Palette {
  bg: string;        // background
  dot: string;       // grid dots
  ink: string;       // main text
  muted: string;     // upcoming text (words not yet said), secondary captions
  accent: string;    // keywords, stamps, badges
  accentDark: string;
  card: string;      // card / window background
  cardInk: string;
  line: string;      // thin strokes, borders
  shadow: string;    // card drop shadow
  success: string;
}

export const PALETTES: Record<Theme, Palette> = {
  paper: {
    bg: '#F5F3EF',
    dot: 'rgba(10,10,10,0.10)',
    ink: '#0A0A0A',
    muted: '#8A867F',
    accent: '#FF4A20',
    accentDark: '#C9361A',
    card: '#FFFFFF',
    cardInk: '#0A0A0A',
    line: '#0A0A0A',
    shadow: 'rgba(10,10,10,0.18)',
    success: '#0A0A0A', // no green in the paper theme (reference: red-orange and black),
  },
  night: {
    bg: '#0A0A0A',
    dot: 'rgba(255,255,255,0.08)',
    ink: '#F4F2EE',
    muted: '#5E5C58',
    accent: '#FEED66',
    accentDark: '#D9C53F',
    card: '#151515',
    cardInk: '#F4F2EE',
    line: '#F4F2EE',
    shadow: 'rgba(0,0,0,0.6)',
    success: '#57D68D',
  },
};

// Families declared by core/fonts.ts (OFL files in public/fonts).
export const FONTS = {
  sans: '"Inter Tight", system-ui, sans-serif',         // captions, interface text
  serif: '"Instrument Serif", Georgia, serif',          // keywords, in italics
  display: '"Anton", "Bebas Neue", Impact, sans-serif', // condensed uppercase titles
  mono: '"JetBrains Mono", Consolas, monospace',        // labels such as "// 03 — the stack"
} as const;

export const CANVAS = { width: 1080, height: 1920 } as const;

// Layout zones (pixels on 1080x1920). The mascot occupies the bottom-right corner.
export const LAYOUT = {
  sectionLabelY: 120,                                   // mono label and counter
  captions: { x: 80, y: 250, width: 900, maxLines: 3, fontSize: 64, lineHeight: 1.12 },
  scene: { x: 60, y: 560, width: 960, height: 760 },
  avatar: { x: 560, y: 1290, width: 520, height: 630 }, // bottom-right anchor, overflows the frame at the bottom
  safeRight: 140,                                       // vertical buttons of the platform UI
  safeBottom: 380,                                      // caption and bar of the platform UI
} as const;

export const palette = (theme: Theme): Palette => PALETTES[theme];
