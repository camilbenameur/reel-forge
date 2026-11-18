// Scene "api-hub": central card wired by cables to service cards that go from "missing" to checked.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface HubProps {
  hub: { title: string; sub?: string };
  services: { name: string; detail?: string; cue?: string }[];
  missingLabel?: string;
}

const SLOTS = [
  { x: 0, y: 44 },
  { x: 660, y: 44 },
  { x: 0, y: 500 },
  { x: 660, y: 500 },
  { x: 330, y: 538 },
];
const CW = 300;
const CH = 148;

const Hub: SceneDefinition<HubProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const sv = props.services.slice(0, 5);
  const ctrU = Math.min(1, k.sp(k.cue('hub', 2), 'soft'));
  const cx = 480;
  const cy = 330;
  const hw = 215;
  const hh = 118;
  const cuesAll = sv.map((s, i) => k.cue(s.cue, 30 + i * 18));
  const nOn = cuesAll.filter((c) => frame >= c + 4).length;
  const lib = props.missingLabel ?? 'missing';
  return (
    <SceneRoot>
      <svg width={960} height={760} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        {sv.map((s, i) => {
          const sl = SLOTS[i];
          const sx = sl.x + CW / 2;
          const sy = sl.y + CH / 2;
          const side = sx < cx - 50 ? -1 : sx > cx + 50 ? 1 : 0;
          const top = sy < cy;
          // attach point on the service card (edge closest to the hub) and on the central card
          const ex = sx;
          const ey = top ? sl.y + CH : sl.y;
          const ax = side === 0 ? cx : cx + side * hw;
          const ay = side === 0 ? cy + hh : top ? cy - hh * 0.5 : cy + hh * 0.5;
          const d =
            side === 0
              ? `M ${ax} ${ay} C ${ax} ${(ay + ey) / 2}, ${ex} ${(ay + ey) / 2}, ${ex} ${ey}`
              : `M ${ax} ${ay} C ${ax + side * 110} ${ay}, ${ex} ${ey + (top ? 90 : -90)}, ${ex} ${ey}`;
          const c = k.cue(s.cue, 30 + i * 18);
          const u = Math.min(1, k.sp(8 + i * 5 + 4, 'soft'));
          const on = prog(frame, c - 4, c + 12);
          return (
            <g key={i} opacity={u}>
              <path d={d} fill="none" stroke={p.muted} strokeWidth={4} strokeDasharray="2 12" strokeLinecap="round" />
              <path d={d} fill="none" stroke={p.ink} strokeWidth={6} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - on} strokeLinecap="round" />
              {on > 0.99 && <path d={d} fill="none" stroke={p.accent} strokeWidth={6} strokeLinecap="round" strokeDasharray="3 40" strokeDashoffset={-frame * 3 * (side === 0 ? -1 : 1) * (top ? 1 : -1)} />}
              <circle cx={ex} cy={ey} r={11} fill={on > 0.95 ? p.accent : p.card} stroke={p.ink} strokeWidth={3.5} />
              <circle cx={ax} cy={ay} r={7} fill={p.accent} stroke="#0A0A0A" strokeWidth={3} />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: cx - hw,
          top: cy - hh + k.dr(3, 3.4),
          width: hw * 2,
          height: hh * 2,
          ...cardStyle(k, { background: k.night ? '#1C1C1C' : '#0A0A0A', color: '#F4F2EE' }),
          transform: `scale(${0.85 + 0.15 * ctrU})`,
          opacity: ctrU,
          padding: '22px 30px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 70, textTransform: 'uppercase', lineHeight: 1 }}>{props.hub.title}</div>
          <div style={{ width: 22, height: 22, borderRadius: 11, background: p.accent, opacity: 0.55 + 0.45 * Math.sin(frame / 5) }} />
        </div>
        {props.hub.sub && (
          <Mono k={k} size={28} color={p.accent}>
            {props.hub.sub}
          </Mono>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1, height: 14, borderRadius: 7, background: 'rgba(244,242,238,0.16)', overflow: 'hidden' }}>
            <div style={{ width: `${(nOn / Math.max(1, sv.length)) * 100}%`, height: '100%', background: p.accent }} />
          </div>
          <Mono k={k} size={28} color="#F4F2EE">{nOn}/{sv.length}</Mono>
        </div>
      </div>
      {sv.map((s, i) => {
        const sl = SLOTS[i];
        const c = k.cue(s.cue, 30 + i * 18);
        const u = Math.min(1.1, k.sp(8 + i * 5, 'snap'));
        const on = prog(frame, c - 4, c + 8);
        const pop = Math.max(0, k.sp(c, 'pop') - 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: sl.x,
              top: sl.y + k.dr(3, 3.2, i),
              width: CW,
              height: CH,
              ...cardStyle(k, { borderStyle: on > 0.5 ? 'solid' : 'dashed', borderColor: on > 0.5 ? p.ink : k.border }),
              opacity: Math.min(1, u * 2) * (0.62 + 0.38 * on),
              transform: `translateY(${(1 - Math.min(u, 1)) * 30}px) scale(${1 + 0.06 * pop})`,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontFamily: FONTS.display, fontSize: 54, textTransform: 'uppercase', lineHeight: 1 }}>{s.name}</div>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  background: on > 0.5 ? p.success : 'transparent',
                  border: `3px solid ${on > 0.5 ? p.success : p.muted}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {on > 0.5 && <CheckIcon size={34} color="#fff" stroke={6} progress={prog(frame, c, c + 8)} />}
              </div>
            </div>
            <Mono k={k} size={28} color={on > 0.5 ? p.success : p.accent}>
              {on > 0.5 ? (s.detail ?? 'connected') : lib}
            </Mono>
          </div>
        );
      })}
    </SceneRoot>
  );
};

export const apiHubScene: SceneDefinition<HubProps> = {
  type: 'api-hub',
  description:
    'A central card wired by cables to service cards (up to 5) that go from "missing" to checked: shows a tool plugging into several APIs.',
  exampleProps: {
    hub: { title: 'Your agent', sub: 'one single entry point' },
    services: [
      { name: 'Google', detail: 'results ok' },
      { name: 'Scraping', detail: 'pages ok' },
      { name: 'YouTube', detail: 'videos ok' },
      { name: 'AI', detail: 'text ok' },
    ],
    missingLabel: 'missing',
  },
  cues: ['hub'],
  Component: Hub,
};
