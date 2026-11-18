// Scene "envelope": wax-sealed envelope that opens on "HOW?".
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { SceneRoot, prog, useKit } from './kit';

interface EnvelopeProps {
  question: string;        // "HOW?"
  lines?: string[];       // grayed lines of the letter (short text; empty = gray bar)
  seal: string;           // initial on the wax seal
  label?: string;      // small mention on the envelope (address)
}

const Envelope: SceneDefinition<EnvelopeProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, p } = k;
  const W = 760;
  const top = 250;       // top of the envelope body
  const H = 420;
  const mid = W / 2;
  const enterU = Math.min(1.05, k.sp(k.cue('envelope', 2), 'snap'));
  const openAt = k.cue('open', 40);
  const flap = prog(frame, openAt, openAt + 14);                 // 0 closed → 1 open
  const rise = prog(frame, openAt + 8, openAt + 30);
  const riseE = 1 - Math.pow(1 - rise, 3);
  const flapScale = Math.cos(flap * Math.PI);
  const paper = k.night ? '#2A2926' : '#EFE6D2';
  const paperDark = k.night ? '#1F1E1C' : '#E2D7BE';
  const flapCol = k.night ? '#34332F' : '#F6EEDB';
  const wax = '#C9361A';
  const crack = prog(frame, openAt - 2, openAt + 10);
  const letterY = 300 - riseE * 280;
  const sealPos = { x: mid, y: top + 250 };
  const wob = k.dr(1.2, 3.5);
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 60, top: 0, width: W, height: 760, transform: `translateY(${(1 - Math.min(enterU, 1)) * 60}px) rotate(${wob}deg)`, opacity: Math.min(1, enterU * 2.5) }}>
        <svg width={W} height={760} style={{ overflow: 'visible' }}>
          <defs>
            <clipPath id="env-left"><rect x={0} y={0} width={mid} height={760} /></clipPath>
            <clipPath id="env-right"><rect x={mid} y={0} width={mid} height={760} /></clipPath>
            <filter id="env-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="22" stdDeviation="16" floodColor={k.night ? '#000' : '#0A0A0A'} floodOpacity={0.22} />
            </filter>
          </defs>
          {/* body */}
          <g filter="url(#env-shadow)">
            <rect x={0} y={top} width={W} height={H} rx={16} fill={paperDark} stroke={k.border} strokeWidth={3} />
          </g>
          {/* open flap (behind the letter) */}
          {flap > 0.5 && (
            <path d={`M 0 ${top} L ${mid} ${top - 190 * -flapScale * 0.0 - Math.abs(flapScale) * 250} L ${W} ${top} Z`} fill={paperDark} stroke={k.border} strokeWidth={3} strokeLinejoin="round" />
          )}
          {/* letter */}
          <g transform={`translate(70 ${letterY})`}>
            <rect x={0} y={0} width={W - 140} height={400} rx={14} fill={p.card} stroke={k.border} strokeWidth={3} />
            <text x={(W - 140) / 2} y={158} textAnchor="middle" fontFamily={FONTS.display} fontSize={130} fill={p.accent} letterSpacing={2}>
              {props.question}
            </text>
            {(props.lines ?? ['', '', '']).slice(0, 3).map((l, i) =>
              l ? (
                <text key={i} x={(W - 140) / 2} y={222 + i * 48} textAnchor="middle" fontFamily={FONTS.mono} fontSize={32} fill={p.muted} fontWeight={600}>{l}</text>
              ) : (
                <rect key={i} x={70 + i * 20} y={200 + i * 40} width={W - 140 - 140 - i * 40} height={14} rx={7} fill={p.muted} opacity={0.5} />
              ),
            )}
          </g>
          {/* front pocket */}
          <path d={`M 0 ${top} L ${mid} ${top + 235} L 0 ${top + H} Z`} fill={paper} stroke={k.border} strokeWidth={3} strokeLinejoin="round" />
          <path d={`M ${W} ${top} L ${mid} ${top + 235} L ${W} ${top + H} Z`} fill={paper} stroke={k.border} strokeWidth={3} strokeLinejoin="round" />
          <path d={`M 0 ${top + H} L ${mid} ${top + 215} L ${W} ${top + H} Z`} fill={flapCol} stroke={k.border} strokeWidth={3} strokeLinejoin="round" />
          {props.label && (
            <text x={mid} y={top + H - 40} textAnchor="middle" fontFamily={FONTS.mono} fontSize={34} fontWeight={700} fill={p.muted} letterSpacing={4}>{props.label}</text>
          )}
          {/* stamp and address on the pocket */}
          <g transform={`translate(${W - 150} ${top + 120}) rotate(5)`}>
            <rect x={0} y={0} width={92} height={110} fill={p.card} stroke={k.border} strokeWidth={3} strokeDasharray="7 5" />
            <rect x={12} y={12} width={68} height={86} fill={p.accent} />
            <circle cx={46} cy={44} r={14} fill="none" stroke={k.onAccent} strokeWidth={5} />
            <path d="M24 86 Q46 56 68 86" fill="none" stroke={k.onAccent} strokeWidth={5} strokeLinecap="round" />
          </g>
          <g opacity={0.8}>
            {[0, 1, 2].map((i) => <rect key={i} x={60} y={top + 150 + i * 30} width={150 - i * 24} height={12} rx={6} fill={p.muted} opacity={0.7} />)}
          </g>
          {/* closed flap */}
          {flap <= 0.5 && (
            <path d={`M 0 ${top} L ${mid} ${top + 250 * Math.abs(flapScale)} L ${W} ${top} Z`} fill={flapCol} stroke={k.border} strokeWidth={3} strokeLinejoin="round" />
          )}
          {/* wax seal in two halves that break apart */}
          {[['env-left', -1], ['env-right', 1]].map(([id, dir]) => (
            <g key={id as string} clipPath={`url(#${id})`} opacity={1 - prog(frame, openAt + 6, openAt + 22)}
              transform={`translate(${(dir as number) * crack * 34} ${crack * crack * 90}) rotate(${(dir as number) * crack * 24} ${sealPos.x} ${sealPos.y})`}>
              <circle cx={sealPos.x} cy={sealPos.y} r={52} fill={wax} stroke="#0A0A0A" strokeWidth={3} />
              <circle cx={sealPos.x} cy={sealPos.y} r={38} fill="none" stroke="#E8664A" strokeWidth={3} />
              <text x={sealPos.x} y={sealPos.y + 20} textAnchor="middle" fontFamily={FONTS.display} fontSize={56} fill="#F7D9CF">{props.seal}</text>
            </g>
          ))}
        </svg>
      </div>
    </SceneRoot>
  );
};

export const envelopeScene: SceneDefinition<EnvelopeProps> = {
  type: 'envelope',
  description: "Wax-sealed envelope whose seal breaks and flap opens to pull out a \"HOW?\" letter: introduces a question or a revealed secret.",
  exampleProps: {
    question: 'HOW?',
    lines: ['', '', ''],
    seal: 'C',
    label: 'CONFIDENTIAL',
  },
  cues: ['envelope', 'open'],
  Component: Envelope,
};
