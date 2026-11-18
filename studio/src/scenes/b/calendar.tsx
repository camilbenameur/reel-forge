// Scene "calendar": calendar page "TODAY OCT 17" whose sheet turns, then days get checked.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { CheckIcon, Mono, SceneRoot, cardStyle, prog, useKit } from './kit';

interface CalendarProps {
  month: string;            // "OCT"
  year: string;           // "2026"
  day: number;            // day shown large
  label: string;         // "TODAY"
  firstWeekday: number;     // weekday of the 1st (0 = Monday)
  daysInMonth: number;
  checkedDays: { day: number; cue?: string }[]; // days to check, each on its own cue
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const Calendar: SceneDefinition<CalendarProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const W = 700;
  const H = 650;
  const HEAD = 300;
  const enterU = Math.min(1.05, k.sp(k.cue('page', 2), 'soft'));
  const turnAt = k.cue('turn', 12);
  const turn = prog(frame, turnAt - 2, turnAt + 16);
  const turnAngle = -turn * 118;
  const cells: (number | null)[] = [];
  for (let i = 0; i < props.firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= props.daysInMonth; d++) cells.push(d);
  const cw = (W - 56) / 7;
  const rowsN = Math.ceil(cells.length / 7);
  const rh = Math.min(60, Math.floor((H - HEAD - 62) / rowsN));
  const nChecked = props.checkedDays.filter((j, m) => frame >= k.cue(j.cue, 40 + m * 14) + 4).length;
  const side = k.ent(k.cue('label', 18) + 4, 'pop', 30);
  const head = (n: number, leaf: boolean) => (
    <div style={{ position: 'relative', height: HEAD }}>
      <div style={{ height: 88, background: p.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 60, letterSpacing: 4, color: k.onAccent }}>{props.month}</div>
        <div style={{ fontFamily: FONTS.mono, fontSize: 34, fontWeight: 600, color: k.onAccent, opacity: 0.85 }}>{props.year}</div>
      </div>
      <div style={{ position: 'absolute', top: 88, left: 0, right: 0, height: 212, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: FONTS.display, fontSize: 250, lineHeight: 1, color: p.cardInk, transform: `translateY(${k.dr(3, 3)}px)` }}>{n}</div>
      </div>
      {!leaf && (
        <div
          style={{
            position: 'absolute', right: 24, top: 108, background: p.ink, color: p.bg, fontFamily: FONTS.mono, fontWeight: 700, fontSize: 28,
            letterSpacing: 2, padding: '8px 16px', borderRadius: 8, transform: `rotate(4deg) scale(${Math.min(1.2, k.sp(k.cue('label', 18), 'pop'))})`,
          }}
        >
          {props.label}
        </div>
      )}
    </div>
  );
  return (
    <SceneRoot>
      <div
        style={{
          position: 'absolute', left: 12, top: 28 + k.dr(4, 3.6), width: W, height: H, perspective: 1600,
          opacity: Math.min(1, enterU * 2), transform: `translateY(${(1 - Math.min(enterU, 1)) * 50}px) rotate(${-1.5 + k.dr(0.6, 4)}deg)`,
        }}
      >
        <div style={{ ...cardStyle(k, { overflow: 'hidden' }), width: W, height: H, position: 'absolute', inset: 0 }}>
          {head(props.day, false)}
          <div style={{ padding: '10px 28px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${cw}px)` }}>
              {WEEKDAYS.map((j, i) => (
                <Mono key={i} k={k} size={30} style={{ textAlign: 'center', height: 48 }}>{j}</Mono>
              ))}
              {cells.map((d, i) => {
                const m = d == null ? undefined : props.checkedDays.findIndex((x) => x.day === d);
                const c = m != null && m >= 0 ? k.cue(props.checkedDays[m].cue, 40 + m * 14) : 0;
                const on = m != null && m >= 0 ? prog(frame, c - 2, c + 10) : 0;
                const today = d === props.day;
                return (
                  <div key={i} style={{ height: rh, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {d != null && (
                      <>
                        {today && <div style={{ position: 'absolute', width: 52, height: 52, borderRadius: 13, background: p.ink }} />}
                        <div style={{ position: 'relative', fontFamily: FONTS.mono, fontWeight: 700, fontSize: 34, color: today ? p.bg : p.cardInk, opacity: on > 0.5 && !today ? 0 : 1 }}>{d}</div>
                        {on > 0 && !today && (
                          <div style={{ position: 'absolute', transform: `scale(${0.6 + 0.4 * Math.min(1.2, k.sp(c, 'pop'))})` }}>
                            <CheckIcon size={50} color={p.accent} stroke={7} progress={on} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        {/* turning sheet: shows the previous day and flips upward */}
        {turn < 0.999 && (
          <div
            style={{
              ...cardStyle(k, { overflow: 'hidden', borderRadius: '24px 24px 0 0', boxShadow: 'none' }), position: 'absolute', left: 0, top: 0, width: W, height: 330,
              transformOrigin: '50% 0%', transform: `rotateX(${turnAngle}deg)`, backfaceVisibility: 'hidden', opacity: 1 - prog(frame, turnAt + 10, turnAt + 16),
            }}
          >
            {head(props.day - 1, true)}
          </div>
        )}
        {/* binding rings */}
        {[0.2, 0.5, 0.8].map((x, i) => (
          <div key={i} style={{ position: 'absolute', left: W * x - 12, top: -18, width: 24, height: 44, borderRadius: 12, background: p.ink, border: `3px solid ${p.card}` }} />
        ))}
      </div>
      {/* right column: counters */}
      <div style={{ position: 'absolute', left: 742, top: 64, width: 210, ...side }}>
        <div style={{ ...cardStyle(k, { borderRadius: 22, padding: '14px 10px 16px', textAlign: 'center' }), transform: `rotate(${3 + k.dr(1, 3.8)}deg)` }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 130, lineHeight: 1, color: p.accent }}>{nChecked}</div>
          <Mono k={k} size={26} color={p.ink} style={{ lineHeight: 1.15 }}>{nChecked > 1 ? 'days checked' : 'day checked'}</Mono>
        </div>
        <div style={{ marginTop: 30, ...cardStyle(k, { borderRadius: 22, padding: '14px 10px 16px', textAlign: 'center', background: p.ink, color: p.bg }), transform: `rotate(${-2.5 - k.dr(1, 3.4)}deg)` }}>
          <div style={{ fontFamily: FONTS.display, fontSize: 110, lineHeight: 1 }}>{Math.max(0, props.daysInMonth - props.day)}</div>
          <Mono k={k} size={26} color={p.bg} style={{ lineHeight: 1.15 }}>days left</Mono>
        </div>
      </div>
    </SceneRoot>
  );
};

export const calendarScene: SceneDefinition<CalendarProps> = {
  type: 'calendar',
  description: "Calendar page \"TODAY OCT 17\": the previous day's sheet turns, today's date appears, then days get checked one by one.",
  exampleProps: {
    month: 'OCT',
    year: '2026',
    day: 17,
    label: 'TODAY',
    firstWeekday: 3,
    daysInMonth: 31,
    checkedDays: [{ day: 14 }, { day: 15 }, { day: 16 }, { day: 17 }].slice(0, 3),
  },
  cues: ['page', 'turn', 'label'],
  Component: Calendar,
};
