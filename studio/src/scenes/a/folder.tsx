// Scene "folder": blue folder that opens and lets files / cards ("SKILL.md"...) pop out.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { Frame, fade, float, useScene } from './kit';

interface FileItem {
  name: string;
  detail?: string;
  type?: 'skill' | 'doc' | 'folder';
  cue?: string;
}

interface Props {
  name: string;          // folder label, e.g. "ai-video"
  files: FileItem[];  // 1 to 4 items that pop out
  cue?: string;         // folder entrance
  cueOpen?: string;    // folder opening
}

const BLUE = '#5AA9F6';
const BLUE_DARK = '#2F7FD6';
const BLUE_LIGHT = '#8CC6FF';

const FileCard: React.FC<{ f: FileItem; s: ReturnType<typeof useScene>; x: number; y: number; rot: number; p: number }> = ({ f, s, x, y, rot, p }) => {
  const kind = f.type ?? 'doc';
  const ink = s.night ? 'rgba(244,242,238,0.9)' : '#0A0A0A';
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 360,
        height: 180,
        opacity: fade(p),
        transform: `translateY(${(1 - p) * 140}px) rotate(${rot * Math.min(1, p)}deg) scale(${0.7 + 0.3 * p})`,
        background: s.p.card,
        border: `3px solid ${s.edge}`,
        borderRadius: 20,
        boxShadow: `0 16px 30px ${s.p.shadow}`,
        padding: '18px 24px',
        boxSizing: 'border-box',
        display: 'flex',
        gap: 18,
        alignItems: 'center',
      }}
    >
      <div style={{ width: 84, height: 106, flex: 'none', borderRadius: 10, border: `3px solid ${ink}`, background: kind === 'skill' ? s.p.accent : kind === 'folder' ? BLUE : s.night ? '#2A2A2A' : '#F3EFE6', position: 'relative' }}>
        {kind === 'skill' ? (
          <svg width="84" height="106" viewBox="0 0 70 88" style={{ position: 'absolute', inset: -3 }}>
            <path d="M35 20 L40 36 L56 38 L44 48 L48 64 L35 55 L22 64 L26 48 L14 38 L30 36 Z" fill="#FEED66" stroke="#0A0A0A" strokeWidth="3" strokeLinejoin="round" />
          </svg>
        ) : (
          <>
            <div style={{ position: 'absolute', left: 10, right: 10, top: 20, height: 5, background: ink, opacity: 0.55, borderRadius: 3 }} />
            <div style={{ position: 'absolute', left: 10, right: 20, top: 34, height: 5, background: ink, opacity: 0.55, borderRadius: 3 }} />
            <div style={{ position: 'absolute', left: 10, right: 10, top: 48, height: 5, background: ink, opacity: 0.55, borderRadius: 3 }} />
          </>
        )}
      </div>
      <div>
        <div style={{ fontFamily: FONTS.mono, fontWeight: 800, fontSize: 38, color: s.p.cardInk }}>{f.name}</div>
        {f.detail ? <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: 30, color: s.p.muted, marginTop: 4 }}>{f.detail}</div> : null}
      </div>
    </div>
  );
};

const Folder: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const tOpen = s.at(props.cueOpen ?? 'open', t0 + 24);
  const p = s.spr(t0);
  const open = s.spr(tOpen, 'snap');
  const o = Math.min(1.12, Math.max(0, open));
  const shown = props.files.slice(0, 4);
  const fx = [10, 580, 290, 600];
  const fy = [60, 40, 140, 200];
  const rot = [-7, 5, -3, 6];
  const bob = float(s, 6, 3.6);
  return (
    <Frame>
      {/* files popping out (behind the front face) */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 960, height: 760, transform: `translateY(${bob}px)` }}>
        {shown.map((f, i) => {
          const pf = s.spr(s.at(f.cue, tOpen + 8 + i * 9));
          return <FileCard key={i} f={f} s={s} x={fx[i]} y={fy[i]} rot={rot[i]} p={pf} />;
        })}
      </div>
      {/* folder */}
      <div
        style={{
          position: 'absolute',
          left: 130,
          top: 330,
          width: 700,
          height: 340,
          opacity: fade(p),
          transformOrigin: '50% 100%',
          transform: `translateY(${(1 - p) * 90 + bob}px) scale(${(0.85 + 0.15 * p) * 1.12}) rotate(${-1}deg)`,
          filter: `drop-shadow(0 26px 24px ${s.p.shadow})`,
        }}
      >
        {/* back */}
        <svg width="700" height="340" viewBox="0 0 700 340" style={{ position: 'absolute', inset: 0 }}>
          <path d="M20 40 Q20 14 46 14 H230 Q252 14 268 34 L286 56 H654 Q680 56 680 82 V300 Q680 326 654 326 H46 Q20 326 20 300 Z" fill={BLUE_DARK} stroke="#0A0A0A" strokeWidth="6" strokeLinejoin="round" />
        </svg>
        {/* papers inside the folder */}
        <div style={{ position: 'absolute', left: 50, right: 50, top: 60 - 40 * Math.min(1, o), height: 220, background: '#fff', border: '5px solid #0A0A0A', borderRadius: 14, transform: 'rotate(-1deg)' }} />
        {/* front face that tilts open */}
        <div style={{ position: 'absolute', left: 0, top: 80, width: 700, height: 260, transformOrigin: 'bottom center', transform: `perspective(900px) rotateX(${-34 * Math.min(1.1, o)}deg)` }}>
          <svg width="700" height="260" viewBox="0 0 700 260" style={{ position: 'absolute', inset: 0 }}>
            <path d="M14 24 Q14 0 38 0 H662 Q686 0 686 24 V232 Q686 254 662 254 H38 Q14 254 14 232 Z" fill={BLUE} stroke="#0A0A0A" strokeWidth="6" />
            <path d="M30 18 H670" stroke={BLUE_LIGHT} strokeWidth="8" strokeLinecap="round" />
          </svg>
          <div style={{ position: 'absolute', left: 36, bottom: 26, padding: '6px 22px', borderRadius: 12, background: '#fff', border: '5px solid #0A0A0A', fontFamily: FONTS.mono, fontWeight: 800, fontSize: 38, color: '#0A0A0A' }}>
            {props.name}
          </div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 40, top: 450, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 50, color: '#fff', opacity: fade(s.spr(tOpen + 30)), transform: `rotate(-5deg) translateY(${float(s, 4, 2.4)}px)` }}>
        everything is inside ↘
      </div>
    </Frame>
  );
};

export const folder: SceneDefinition<Props> = {
  type: 'folder',
  description:
    "Blue folder that opens and lets files or cards (\"SKILL.md\", \"script.md\"...) pop out and fan out. Use it to talk about a project folder, a skill, a file library or a downloadable kit.",
  exampleProps: {
    name: 'ai-video',
    files: [
      { name: 'SKILL.md', detail: 'the brain', type: 'skill', cue: 'file1' },
      { name: 'voice.wav', detail: 'your cloned voice', type: 'doc', cue: 'file2' },
      { name: 'scenes/', detail: '16 templates', type: 'folder', cue: 'file3' },
    ],
  },
  cues: ['enter', 'open'],
  Component: Folder,
};
