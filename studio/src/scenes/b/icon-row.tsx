// Scene "icon-row": row of drawn tool icons (mic, film, brush...) that appear one by one.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Badge, CheckIcon, Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

export type IconName = 'mic' | 'film' | 'brush' | 'gear' | 'magnifier' | 'file' | 'text' | 'player';

interface IconRowProps {
  tools: { icon: IconName; label: string; sub?: string; cue?: string }[];
}

const Glyph: React.FC<{ v: IconName; ink: string; accent: string; bg: string; size?: number }> = ({ v, ink, accent, bg, size = 118 }) => {
  const sw = 5.5;
  const c = { stroke: ink, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
      {v === 'mic' && (
        <>
          <rect x={36} y={10} width={28} height={52} rx={14} {...c} fill={accent} />
          <path d="M24 46 a26 26 0 0 0 52 0" {...c} />
          <path d="M50 72 V88 M36 88 H64" {...c} />
          <path d="M44 24 H56 M44 34 H56" stroke={bg} strokeWidth={3.5} strokeLinecap="round" opacity={0.7} />
        </>
      )}
      {v === 'film' && (
        <>
          <rect x={12} y={20} width={76} height={60} rx={8} {...c} />
          {[28, 44, 60].map((y) => <rect key={y} x={17} y={y} width={7} height={8} rx={1.5} fill={ink} />)}
          {[28, 44, 60].map((y) => <rect key={y + 1} x={76} y={y} width={7} height={8} rx={1.5} fill={ink} />)}
          <path d="M42 34 L62 50 L42 66 Z" fill={accent} stroke={ink} strokeWidth={4.5} strokeLinejoin="round" />
        </>
      )}
      {v === 'brush' && (
        <>
          <path d="M86 12 L52 46" {...c} strokeWidth={11} />
          <path d="M46 40 L60 54 L50 64 C42 72 28 74 16 84 C20 70 22 56 34 50 Z" fill={accent} stroke={ink} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M44 42 L58 56" stroke={ink} strokeWidth={4.5} strokeLinecap="round" />
        </>
      )}
      {v === 'gear' && (
        <>
          {Array.from({ length: 8 }, (_, i) => <rect key={i} x={44} y={8} width={12} height={18} rx={3} fill={ink} transform={`rotate(${i * 45} 50 50)`} />)}
          <circle cx={50} cy={50} r={29} fill={accent} stroke={ink} strokeWidth={sw} />
          <circle cx={50} cy={50} r={11} fill={bg} stroke={ink} strokeWidth={4.5} />
        </>
      )}
      {v === 'magnifier' && (
        <>
          <circle cx={42} cy={42} r={26} {...c} fill={accent} fillOpacity={0.25} />
          <path d="M62 62 L88 88" {...c} strokeWidth={11} />
          <path d="M28 36 a16 16 0 0 1 12 -10" {...c} strokeWidth={4} stroke={ink} opacity={0.6} />
        </>
      )}
      {v === 'file' && (
        <>
          <path d="M22 8 H58 L80 30 V92 H22 Z" {...c} fill={bg} />
          <path d="M58 8 V30 H80" {...c} />
          <path d="M34 50 H68 M34 62 H68 M34 74 H54" {...c} stroke={accent} strokeWidth={6} />
        </>
      )}
      {v === 'text' && (
        <>
          <rect x={10} y={14} width={80} height={72} rx={10} {...c} />
          <path d="M30 34 H70 M50 34 V70" {...c} stroke={accent} strokeWidth={9} />
        </>
      )}
      {v === 'player' && (
        <>
          <rect x={10} y={20} width={80} height={56} rx={10} {...c} />
          <path d="M44 34 L64 48 L44 62 Z" fill={accent} stroke={ink} strokeWidth={4.5} strokeLinejoin="round" />
          <path d="M22 88 H78" {...c} />
        </>
      )}
    </svg>
  );
};

// Layout by number of tools: 1 row of large vertical cards (≤ 3), 2×2 grid of horizontal
// cards (4), then 2 rows of vertical cards (5 to 8). Everything stays outside the mascot area (x > 560 and y > 690).
const layoutFor = (n: number) => {
  const gap = 24;
  if (n <= 3) {
    const cw = Math.min(400, (960 - gap * (n - 1)) / n);
    return { cols: n, rows: 1, cw, ch: 500, gap, horiz: false, icon: Math.min(250, cw - 60), top: 100 };
  }
  if (n === 4) return { cols: 2, rows: 2, cw: 470, ch: 308, gap: 20, horiz: true, icon: 190, top: 48 };
  if (n <= 6) return { cols: 3, rows: 2, cw: 306, ch: 308, gap: 21, horiz: false, icon: 164, top: 48 };
  return { cols: 4, rows: 2, cw: 228, ch: 308, gap: 16, horiz: false, icon: 130, top: 48 };
};

const IconRow: SceneDefinition<IconRowProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { p, frame } = k;
  const tools = props.tools.slice(0, 8);
  const n = tools.length;
  const L = layoutFor(n);
  const labelSize = L.horiz ? 46 : n <= 3 ? 56 : n <= 6 ? 44 : 38;
  const hd = k.ent(0, 'soft', 20);
  // Card of the current word: the last one to appear; it is highlighted (scale 1.08, red outline).
  const ats = tools.map((t, i) => k.cue(t.cue, 8 + i * 12));
  let cur = -1;
  ats.forEach((a, i) => { if (frame >= a && (cur < 0 || a >= ats[cur])) cur = i; });
  return (
    <SceneRoot>
      {/* header strip: tool counter */}
      <div style={{ position: 'absolute', left: 0, top: L.horiz || n > 3 ? 4 : 40, width: 960, display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...hd }}>
        <Mono k={k} size={30} color={p.ink}>// toolbox</Mono>
        <div style={{ fontFamily: FONTS.mono, fontSize: 30, fontWeight: 700, color: p.accent, letterSpacing: 1.5 }}>
          {tools.filter((t, i) => frame >= k.cue(t.cue, 8 + i * 12)).length}/{n} READY
        </div>
      </div>
      {tools.map((t, i) => {
        const r = Math.floor(i / L.cols);
        const inRow = Math.min(L.cols, n - r * L.cols);
        const col = i % L.cols;
        const rowW = inRow * L.cw + (inRow - 1) * L.gap;
        const x = (960 - rowW) / 2 + col * (L.cw + L.gap);
        const y = L.top + r * (L.ch + L.gap);
        const at = k.cue(t.cue, 8 + i * 12);
        const s = k.sp(at, 'pop');
        const sn = Math.min(1.12, s);
        const chk = k.sp(at + 9, 'pop');
        const underline = prog(frame, at + 4, at + 16);
        const hot = i === cur ? prog(frame, at, at + 4) : 0;
        const wob = Math.sin((frame / 30) * 2.2 + i) * 3;
        const tile = L.icon + 34;
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x, top: y + k.dr(4, 3, i), width: L.cw, height: L.ch, opacity: Math.min(1, s * 3), zIndex: i === cur ? 3 : 1,
              transform: `scale(${(0.5 + 0.5 * sn) * (1 + 0.08 * hot)}) rotate(${(1 - Math.min(s, 1)) * (i % 2 ? 10 : -10)}deg)`,
            }}
          >
            <div style={{ ...cardStyle(k, { borderRadius: 30, ...(hot > 0.5 ? { border: `5px solid ${p.accent}`, boxShadow: `0 26px 44px -12px ${p.shadow}` } : {}) }), width: L.cw, height: L.ch, position: 'relative', overflow: 'hidden',
              display: 'flex', flexDirection: L.horiz ? 'row' : 'column', alignItems: 'center', justifyContent: L.horiz ? 'flex-start' : 'center',
              padding: L.horiz ? '0 22px 0 22px' : '18px 10px 12px', gap: L.horiz ? 20 : 8 }}>
              {/* status dot at the top right */}
              <div style={{ position: 'absolute', right: 16, top: 14, width: 44, height: 44, borderRadius: 22, background: p.success, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${Math.min(1.1, chk)})`, opacity: Math.min(1, chk * 2) }}>
                <CheckIcon size={26} color="#fff" stroke={6} progress={chk} />
              </div>
              <Mono k={k} size={22} style={{ position: 'absolute', left: L.horiz ? 22 : 22, bottom: 12, display: L.horiz ? 'block' : 'none' }}>{`TOOL 0${i + 1}`}</Mono>
              {/* icon tile: soft accent background, rotating dotted circle */}
              <div style={{ width: tile, height: tile, flex: 'none', borderRadius: tile * 0.3, background: k.night ? 'rgba(254,237,102,0.10)' : 'rgba(255,74,32,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <svg width={tile} height={tile} style={{ position: 'absolute', inset: 0 }}>
                  <circle cx={tile / 2} cy={tile / 2} r={tile / 2 - 8} fill="none" stroke={p.accent} strokeWidth={2.5} strokeDasharray="4 12" strokeLinecap="round"
                    transform={`rotate(${frame * 1.2} ${tile / 2} ${tile / 2})`} opacity={0.7} />
                </svg>
                <div style={{ transform: `rotate(${wob}deg)` }}>
                  <Glyph v={t.icon} ink={p.cardInk} accent={p.accent} bg={p.card} size={L.icon} />
                </div>
              </div>
              <div style={{ textAlign: L.horiz ? 'left' : 'center', minWidth: 0, flex: L.horiz ? 1 : 'none', marginTop: L.horiz ? 0 : 6 }}>
                <div style={{ fontFamily: FONTS.display, fontSize: labelSize, textTransform: 'uppercase', lineHeight: 1.02, overflowWrap: 'anywhere' }}>{t.label}</div>
                <svg width={L.horiz ? 150 : 120} height={14} viewBox="0 0 150 14" style={{ display: 'block', margin: L.horiz ? '6px 0 4px' : '6px auto 4px' }}>
                  <path d="M3 8 C40 2 90 12 147 5" stroke={p.accent} strokeWidth={5} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - underline} />
                </svg>
                {t.sub && <Mono k={k} size={n > 6 ? 22 : 28} style={{ lineHeight: 1.1 }}>{t.sub}</Mono>}
              </div>
              <Badge k={k} size={58} style={{ position: 'absolute', left: -2, top: -2, borderRadius: '30px 0 18px 0', fontSize: 38 }}>{i + 1}</Badge>
            </div>
          </div>
        );
      })}
    </SceneRoot>
  );
};

export const iconRowScene: SceneDefinition<IconRowProps> = {
  type: 'icon-row',
  description: "Row of drawn tool icons (mic, film, brush, gear, magnifier, file, text, player) that appear one by one with their label: list tools, steps, capabilities.",
  exampleProps: {
    tools: [
      { icon: 'mic', label: 'Voice', sub: 'cloned' },
      { icon: 'brush', label: 'Animate', sub: 'mascot' },
      { icon: 'text', label: 'Captions', sub: 'word by word' },
      { icon: 'film', label: 'Render', sub: '1080×1920' },
    ],
  },
  Component: IconRow,
};
