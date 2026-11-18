// Scene "keys": keyring of labeled API keys (×N badge) or a single golden key that unlocks cards.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Badge, CheckIcon, KeyGlyph, Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface KeysProps {
  variant: 'keyring' | 'golden';
  title?: string;
  keys: { label: string; detail?: string; cue?: string }[];
  multiplier?: number; // ×N badge on the ring (keyring)
}

const Padlock: React.FC<{ open: number; color: string; body: string }> = ({ open, color, body }) => (
  <svg width={46} height={56} viewBox="0 0 46 56" fill="none">
    <path d="M12 26 V16 a11 11 0 0 1 22 0 V26" stroke={color} strokeWidth={5.5} strokeLinecap="round"
      transform={`rotate(${-open * 32} 34 26) translate(0 ${-open * 6})`} />
    <rect x={4} y={26} width={38} height={27} rx={7} fill={body} stroke={color} strokeWidth={4} />
    <circle cx={23} cy={38} r={4} fill={color} />
  </svg>
);

const Keys: SceneDefinition<KeysProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const keys = props.keys ?? [];
  const n = keys.length;
  const gold = '#F7C531';

  if (props.variant === 'golden') {
    const cx = 480, cy = 340;
    const kPop = k.sp(k.cue('key', 4), 'pop');
    const pos = keys.map((_, i) => {
      const a = ((-90 + (360 / n) * (i + 0.5)) * Math.PI) / 180;
      return { x: cx + Math.cos(a) * 330, y: cy + Math.sin(a) * 255 };
    });
    return (
      <SceneRoot>
        <svg width={960} height={760} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <defs>
            <radialGradient id="halo-golden">
              <stop offset="0%" stopColor={gold} stopOpacity={k.night ? 0.55 : 0.5} />
              <stop offset="100%" stopColor={gold} stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={230 + k.dr(10, 2.6)} fill="url(#halo-golden)" opacity={kPop} />
          <circle cx={cx} cy={cy} r={300} fill="none" stroke={p.line} strokeOpacity={0.25} strokeDasharray="4 12" strokeWidth={2.5}
            transform={`rotate(${frame * 0.4} ${cx} ${cy})`} />
          {pos.map((q, i) => {
            const c = k.cue(keys[i].cue, 24 + i * 16);
            const l = prog(frame, c - 8, c + 8);
            return (
              <g key={i}>
                <line x1={cx} y1={cy} x2={q.x} y2={q.y} stroke={p.line} strokeOpacity={0.3} strokeWidth={3} strokeDasharray="3 10" />
                <line x1={cx} y1={cy} x2={cx + (q.x - cx) * l} y2={cy + (q.y - cy) * l} stroke={p.accent} strokeWidth={5} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
        {pos.map((q, i) => {
          const c = k.cue(keys[i].cue, 24 + i * 16);
          const u = k.sp(c, 'pop');
          const open = prog(frame, c - 2, c + 8);
          return (
            <div key={i} style={{
              position: 'absolute', left: q.x - 150, top: q.y - 62, width: 300, height: 124, ...cardStyle(k, {
                borderColor: open > 0.5 ? p.accent : k.border, borderStyle: open > 0.5 ? 'solid' : 'dashed',
                boxShadow: open > 0.5 ? `0 0 0 4px ${p.accent}33, 0 22px 40px -12px ${p.shadow}` : 'none',
              }),
              display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', opacity: 0.5 + 0.5 * open,
              transform: `scale(${0.96 + 0.04 * u})`,
            }}>
              <Padlock open={open} color={open > 0.5 ? p.accent : p.muted} body={p.card} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 50, textTransform: 'uppercase', lineHeight: 1 }}>{keys[i].label}</div>
                {keys[i].detail && <Mono k={k} size={24} style={{ marginTop: 6 }}>{keys[i].detail}</Mono>}
              </div>
              {open > 0.9 && <CheckIcon size={30} color={p.success} progress={prog(frame, c + 6, c + 14)} />}
            </div>
          );
        })}
        <div style={{ position: 'absolute', left: cx - 65, top: cy - 150, transform: `scale(${1.15 * kPop}) rotate(${k.dr(5, 3.4)}deg)`, transformOrigin: '50% 12%' }}>
          <KeyGlyph fill={gold} stroke={p.ink} hole={p.bg} width={130} />
        </div>
        {props.title && (
          <Mono k={k} color={p.ink} size={32} style={{ position: 'absolute', left: 0, top: 4 }}>{props.title}</Mono>
        )}
      </SceneRoot>
    );
  }

  // Trousseau
  const ringU = k.sp(k.cue('ring', 2), 'soft');
  const pivotX = 480, pivotY = 150;
  const spread = Math.min(30, 120 / Math.max(1, n - 1));
  return (
    <SceneRoot>
      <svg width={960} height={760} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <circle cx={pivotX} cy={pivotY - 36} r={112} fill="none" stroke={p.ink} strokeWidth={14} opacity={ringU}
          strokeDasharray={704} strokeDashoffset={704 * (1 - ringU)} transform={`rotate(-90 ${pivotX} ${pivotY - 36})`} />
      </svg>
      {keys.map((c, i) => {
        const at = k.cue(c.cue, 12 + i * 12);
        const u = k.sp(at, 'pop');
        const a = (i - (n - 1) / 2) * spread * 1.3;
        const sw = k.dr(2.2, 3.2, i * 1.3);
        const rot = a * u + (1 - u) * 28 + sw;
        const col = i % 2 === 0 ? p.ink : p.accent;
        return (
          <div key={i} style={{
            position: 'absolute', left: pivotX - 80, top: pivotY + 60, width: 160, transformOrigin: '50% 0%',
            transform: `rotate(${rot}deg)`, opacity: Math.min(1, u * 2.5),
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ marginTop: 6 }}><KeyGlyph fill={col} stroke={p.ink} hole={p.bg} width={104} /></div>
              <div style={{ marginTop: 6, transform: `rotate(${-rot * 0.7}deg)`, ...cardStyle(k, { borderRadius: 12, padding: '8px 14px', whiteSpace: 'nowrap', textAlign: 'center' }) }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 52, textTransform: 'uppercase', lineHeight: 1.05 }}>{c.label}</div>
                {c.detail && <Mono k={k} size={26}>{c.detail}</Mono>}
              </div>
            </div>
          </div>
        );
      })}
      {props.multiplier != null && (
        <Badge k={k} size={92} fill={p.accent} color={k.onAccent} style={{
          position: 'absolute', left: pivotX + 100, top: 30, fontSize: 56, transform: `scale(${k.sp(k.cue('multiplier', 18), 'pop')}) rotate(${6 + k.dr(2, 2.5)}deg)`,
        }}>
          ×{props.multiplier}
        </Badge>
      )}
      <div style={{ position: 'absolute', left: pivotX - 100, top: pivotY - 120, width: 200, textAlign: 'center', fontFamily: FONTS.display, fontSize: 104, lineHeight: 1, color: p.accent, opacity: Math.min(1, ringU * 2), transform: `rotate(${-6 + k.dr(2, 3)}deg) scale(${0.8 + 0.2 * Math.min(1, ringU)})` }}>API</div>
      {props.title && <Mono k={k} color={p.ink} size={32} style={{ position: 'absolute', left: 0, top: 4, background: p.card, border: `2.5px solid ${k.border}`, borderRadius: 12, padding: '8px 18px', transform: 'rotate(-2deg)' }}>{props.title}</Mono>}
    </SceneRoot>
  );
};

export const keysScene: SceneDefinition<KeysProps> = {
  type: 'keys',
  description: "Keyring of labeled API keys with a ×N badge (keyring variant), or a single golden key that unlocks cards (golden variant): \"one key for everything\".",
  exampleProps: {
    variant: 'keyring',
    title: 'your API keys',
    keys: [
      { label: 'Voice', detail: 'api #1' },
      { label: 'Images', detail: 'api #2' },
      { label: 'Text', detail: 'api #3' },
      { label: 'Video', detail: 'api #4' },
    ],
    multiplier: 4,
  },
  cues: ['ring', 'multiplier', 'key'],
  Component: Keys,
};
