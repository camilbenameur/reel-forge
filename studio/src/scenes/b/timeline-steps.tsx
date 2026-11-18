// Scene "timeline-steps": timeline of milestones D1 → D30 with a progress line.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface TimelineProps {
  milestones: { label: string; title: string; detail?: string; cue?: string }[];
}

const TimelineSteps: SceneDefinition<TimelineProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const js = props.milestones;
  const n = js.length;
  const x0 = 150;
  const x1 = 810;
  const y = 345;
  const xs = js.map((_, i) => (n === 1 ? 480 : x0 + (i * (x1 - x0)) / (n - 1)));
  const cues = js.map((j, i) => k.cue(j.cue, 10 + i * 18));
  // progress: the line advances toward each milestone during the 14 frames before its cue
  let progX = x0;
  for (let i = 1; i < n; i++) {
    const t = prog(frame, cues[i] - 14, cues[i]);
    if (t > 0) progX = xs[i - 1] + (xs[i] - xs[i - 1]) * t;
  }
  const lineU = Math.min(1, k.sp(2, 'soft'));
  return (
    <SceneRoot>
      <svg width={960} height={760} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
        <line x1={x0} y1={y} x2={x0 + (x1 - x0) * lineU} y2={y} stroke={p.line} strokeOpacity={0.25} strokeWidth={14} strokeLinecap="round" />
        <line x1={x0} y1={y} x2={progX} y2={y} stroke={p.accent} strokeWidth={14} strokeLinecap="round" />
        {js.map((_, i) => {
          const up = i % 2 === 0;
          const s = Math.min(1, prog(frame, cues[i] - 2, cues[i] + 8));
          return <line key={i} x1={xs[i]} x2={xs[i]} y1={y} y2={y + (up ? -1 : 1) * 118 * s} stroke={p.line} strokeWidth={3} strokeDasharray="3 7" />;
        })}
        {/* graduations */}
        {Array.from({ length: 33 }, (_, t) => {
          const tx = x0 + ((x1 - x0) * t) / 32;
          return <line key={t} x1={tx} x2={tx} y1={y + 30} y2={y + (t % 4 === 0 ? 46 : 38)} stroke={p.line} strokeOpacity={tx <= progX ? 0.7 : 0.2} strokeWidth={3} strokeLinecap="round" />;
        })}
        {/* point voyageur */}
        <circle cx={progX} cy={y} r={26 + k.dr(4, 1.2)} fill={p.accent} opacity={0.3} />
        <circle cx={progX} cy={y} r={14} fill={p.accent} stroke="#fff" strokeWidth={4} />
      </svg>
      {js.map((j, i) => {
        const up = i % 2 === 0;
        const s = k.sp(cues[i], 'pop');
        const reached = frame >= cues[i] - 2;
        const last = i === n - 1;
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute', left: xs[i] - 66, top: y - 66, width: 132, height: 132, borderRadius: 30, background: reached ? (last ? p.accent : p.ink) : p.card,
                border: `3px solid ${k.border}`, color: reached ? (last ? k.onAccent : p.bg) : p.muted, fontFamily: FONTS.display, fontSize: j.label.length > 3 ? 56 : 74, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: `scale(${reached ? 0.8 + 0.2 * Math.min(s, 1.25) : 0.85}) translateY(${reached ? k.dr(2, 2.6, i) : 0}px)`, boxShadow: `0 14px 22px -8px ${p.shadow}`,
              }}
            >
              {j.label}
            </div>
            <div
              style={{
                position: 'absolute', left: xs[i] - 150, width: 300, ...(up ? { bottom: 760 - (y - 118) } : { top: y + 118 }), opacity: Math.min(1, s * 2.5),
                transform: `translateY(${(1 - Math.min(s, 1)) * (up ? 30 : -30)}px)`,
              }}
            >
              <div style={{ ...cardStyle(k, { borderRadius: 18, padding: '14px 16px', textAlign: 'center', minHeight: 190, display: 'flex', flexDirection: 'column', justifyContent: 'center' }) }}>
                <div style={{ fontFamily: FONTS.display, fontSize: 58, textTransform: 'uppercase', lineHeight: 1.02 }}>{j.title}</div>
                {j.detail && <Mono k={k} size={28} style={{ marginTop: 8 }}>{j.detail}</Mono>}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </SceneRoot>
  );
};

export const timelineStepsScene: SceneDefinition<TimelineProps> = {
  type: 'timeline-steps',
  description: "Horizontal timeline of milestones (D1, D7, D14, D30...) linked by an advancing progress line: a journey over time, the steps of a challenge.",
  exampleProps: {
    milestones: [
      { label: 'D1', title: 'First reel', detail: '0 followers' },
      { label: 'D7', title: 'First spike', detail: '1,200 views' },
      { label: 'D14', title: 'Routine', detail: 'one a day' },
      { label: 'D30', title: 'The result', detail: '2,900 followers' },
    ],
  },
  Component: TimelineSteps,
};
