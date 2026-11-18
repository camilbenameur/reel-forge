// Scene "loading-bar": progress bar with checked steps and a large percentage.
import React from 'react';
import { interpolate } from 'remotion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface LoadingProps {
  title: string;
  steps: { label: string; cue?: string }[];  // the cue = moment the step is finished
  final?: string;                              // "READY"
}

const LoadingBar: SceneDefinition<LoadingProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const steps = props.steps;
  const n = steps.length;
  const cardU = Math.min(1, k.sp(k.cue('card', 0), 'soft'));
  // strictly increasing cues
  const cues: number[] = [];
  steps.forEach((s, i) => cues.push(Math.max(k.cue(s.cue, 30 + i * 28), (cues[i - 1] ?? 0) + 4)));
  const xs = [Math.max(0, cues[0] - 26), ...cues];
  const ys = [0, ...steps.map((_, i) => ((i + 1) / n) * 100)];
  const pct = interpolate(frame, xs, ys, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const done = pct >= 99.5;
  const firstPending = cues.findIndex((c) => frame < c);
  const stripe = (frame * 2) % 40;
  const secs = Math.min(99, Math.floor(frame / ctx.fps));
  const cols = n > 3 ? 2 : 1;
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 10, top: 14, width: 940, ...cardStyle(k, { padding: '28px 40px 28px' }), opacity: cardU, transform: `translateY(${(1 - cardU) * 40}px) translateY(${k.dr(2, 3.6)}px)` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Mono k={k} size={32} color={p.ink}>{props.title}</Mono>
          <Mono k={k} size={30} color={done ? p.success : p.accent}>{done ? 'done' : 'in progress…'} · 00:{String(secs).padStart(2, '0')}</Mono>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', margin: '22px 0 14px', height: 230 }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 250, lineHeight: 1, color: done ? p.success : p.ink }}>
            {Math.round(pct)}<span style={{ fontSize: 120, color: p.accent }}>%</span>
          </div>
          {done && props.final && (() => {
            const s = k.sp(cues[n - 1] + 2, 'pop');
            return (
              <div style={{ border: `7px solid ${p.success}`, color: p.success, fontFamily: FONTS.display, fontSize: 96, padding: '2px 26px 8px', borderRadius: 12, transform: `rotate(-8deg) scale(${Math.min(1.25, 0.5 + 0.5 * s)})`, opacity: Math.min(1, s * 3), marginBottom: 40 }}>
                {props.final}
              </div>
            );
          })()}
        </div>
        <div style={{ width: '100%', height: 76, borderRadius: 38, border: `3px solid ${k.border}`, background: k.night ? '#0A0A0A' : '#EDEAE4', overflow: 'hidden', position: 'relative' }}>
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 38, background: done ? p.success : p.accent,
              backgroundImage: `repeating-linear-gradient(-45deg, rgba(255,255,255,0.22) 0 14px, transparent 14px 28px)`, backgroundSize: '40px 40px', backgroundPosition: `${stripe}px 0`,
              boxShadow: 'inset 0 -8px 0 rgba(0,0,0,0.12)',
            }}
          />
          {steps.map((_, i) => i < n - 1 && <div key={i} style={{ position: 'absolute', left: `${((i + 1) / n) * 100}%`, top: 14, bottom: 14, width: 3, background: p.ink, opacity: 0.25 }} />)}
        </div>
        <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px 24px' }}>
          {steps.map((s, i) => {
            const isDone = frame >= cues[i];
            const current = i === firstPending;
            const u = k.sp(cues[i], 'pop');
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: 62, opacity: isDone || current ? 1 : 0.45 }}>
                <div style={{ width: 54, height: 54, flex: 'none', borderRadius: 15, border: `3.5px solid ${isDone ? p.success : k.border}`, background: isDone ? p.success : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${isDone ? Math.min(1.2, 0.6 + 0.4 * u) : 1})` }}>
                  {isDone && <CheckIcon size={36} color="#fff" stroke={7} progress={prog(frame, cues[i], cues[i] + 8)} />}
                  {current && (
                    <svg width={34} height={34} viewBox="0 0 26 26" style={{ transform: `rotate(${frame * 16}deg)` }}>
                      <circle cx={13} cy={13} r={9} fill="none" stroke={p.accent} strokeWidth={4} strokeDasharray="30 30" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: 42, lineHeight: 1.05, color: p.cardInk }}>{s.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </SceneRoot>
  );
};

export const loadingBarScene: SceneDefinition<LoadingProps> = {
  type: 'loading-bar',
  description: "Progress bar with a large rising percentage and a list of steps checked one by one, final stamp: work that gets done by itself, the steps of a production.",
  exampleProps: {
    title: 'reel production',
    steps: [
      { label: 'Script written' },
      { label: 'Voice cloned' },
      { label: 'Scenes animated' },
      { label: 'Final render' },
    ],
    final: 'READY',
  },
  cues: ['card'],
  Component: LoadingBar,
};
