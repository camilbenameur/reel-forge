// Scene "code-snippet": colored code block whose lines are typed out, some of them highlighted.
import React from 'react';
import { typed } from '../../core/motion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { SceneRoot, prog, useKit } from './kit';

interface CodeProps {
  file: string;
  lines: { text: string; highlight?: boolean; cue?: string }[];
  speed?: number; // characters per second
}

const COLORS_NIGHT = { base: '#F4F2EE', keyword: '#FF7A59', string: '#9BE59D', number: '#FEED66', func: '#8EC5FF', comment: '#7D7A74' };
// Paper theme: light card, sober black / red / gray coloring.
const COLORS_PAPER = { base: '#0A0A0A', keyword: '#C9361A', string: '#5A564F', number: '#C9361A', func: '#0A0A0A', comment: '#8A867F' };
type Cols = typeof COLORS_NIGHT;
// Window chrome per theme.
const CHROME = {
  paper: { win: '#FFFFFF', tabs: '#F5F3EF', tabActive: '#FFFFFF', tabInk: '#0A0A0A', tabLine: 'rgba(10,10,10,0.18)', sibling: '#8A867F', lights: ['#0A0A0A', '#B9B5AE', '#FF4A20'], rule: 'rgba(10,10,10,0.14)', cur: 'rgba(10,10,10,0.05)', num: '#8A867F', numOn: '#0A0A0A', okBg: '#0A0A0A', okInk: '#FFFFFF', border: '4px solid #0A0A0A' },
  night: { win: '#0F0F10', tabs: '#18181A', tabActive: '#0F0F10', tabInk: '#F4F2EE', tabLine: 'rgba(244,242,238,0.14)', sibling: '#6C6A65', lights: ['#FF5F57', '#FEBC2E', '#28C840'], rule: 'rgba(244,242,238,0.10)', cur: 'rgba(244,242,238,0.05)', num: '#5E5C58', numOn: '#C9C6BF', okBg: '#0A0A0A', okInk: '#9BE59D', border: '2.5px solid rgba(244,242,238,0.38)' },
};
const RE = /(#.*$|\/\/.*$)|("[^"]*"?|'[^']*'?)|\b(def|return|import|from|const|let|await|async|if|else|for|in|class|function|print|True|False|None|true|false|null)\b|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_]\w*(?=\())/g;

const tokenize = (s: string, COL: Cols): React.ReactNode[] => {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RE.lastIndex = 0;
  let key = 0;
  while ((m = RE.exec(s))) {
    if (m.index > last) out.push(<span key={key++}>{s.slice(last, m.index)}</span>);
    const color = m[1] ? COL.comment : m[2] ? COL.string : m[3] ? COL.keyword : m[4] ? COL.number : COL.func;
    out.push(<span key={key++} style={{ color, fontStyle: m[1] ? 'italic' : undefined }}>{m[0]}</span>);
    last = m.index + m[0].length;
    if (m[0].length === 0) RE.lastIndex++;
  }
  if (last < s.length) out.push(<span key={key++}>{s.slice(last)}</span>);
  return out;
};

const Code: SceneDefinition<CodeProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, fps, p } = k;
  const COL = k.night ? COLORS_NIGHT : COLORS_PAPER;
  const C = k.night ? CHROME.night : CHROME.paper;
  const cps = props.speed ?? 46;
  const lines = props.lines;
  const winU = Math.min(1, k.sp(k.cue('window', 0), 'soft'));
  const starts = lines.map((l, i) => k.cue(l.cue, 12 + i * 20));
  // Full-width window (960 px), outside the mascot area (local y < 690).
  const W = 960;
  const gutter = 92;
  const maxLen = Math.max(12, ...lines.map((l) => l.text.length));
  const fs = Math.max(30, Math.min(38, Math.floor((W - gutter - 40) / (0.6 * maxLen))));
  const rows = Math.max(lines.length, 7);
  const tabsH = 74;
  const statusH = 52;
  const H = Math.min(660, 640);
  const lh = Math.min(76, Math.floor((H - tabsH - statusH - 24) / rows));
  const ext = (props.file.split('.').pop() ?? '').toLowerCase();
  const language = ({ py: 'Python', ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', md: 'Markdown', json: 'JSON', sh: 'Shell' } as Record<string, string>)[ext] ?? 'Text';
  const sibling = ext === 'py' ? 'config.toml' : ext === 'tsx' || ext === 'ts' ? 'index.ts' : 'README.md';
  // Line currently being typed (for the status bar and the active line).
  let cur = 0;
  starts.forEach((st, i) => { if (frame >= st) cur = i; });
  const curShown = typed(frame, fps, starts[cur] ?? 0, lines[cur]?.text ?? '', cps).length;
  const allDone = lines.length > 0 && frame >= starts[lines.length - 1] && typed(frame, fps, starts[lines.length - 1], lines[lines.length - 1].text, cps).length >= lines[lines.length - 1].text.length;
  const okP = k.sp((starts[lines.length - 1] ?? 0) + Math.ceil(((lines[lines.length - 1]?.text.length ?? 0) / cps) * fps) + 4, 'pop');
  return (
    <SceneRoot>
      <div
        style={{
          position: 'absolute', left: 0, top: 18 + k.dr(3, 3.4), width: W, height: H, background: C.win, border: C.border,
          borderRadius: 28, boxShadow: `0 34px 56px -16px ${p.shadow}`, overflow: 'hidden', opacity: winU, transform: `translateY(${(1 - winU) * 40}px) scale(${0.96 + 0.04 * winU})`,
        }}
      >
        {/* tab bar */}
        <div style={{ height: tabsH, background: C.tabs, borderBottom: `2px solid ${C.tabLine}`, display: 'flex', alignItems: 'stretch', paddingLeft: 24, gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 8 }}>
            {C.lights.map((c) => <div key={c} style={{ width: 20, height: 20, borderRadius: 10, background: c }} />)}
          </div>
          <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px', background: C.tabActive, borderTop: `4px solid ${p.accent}`, fontFamily: FONTS.mono, fontSize: 30, color: C.tabInk, fontWeight: 600 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: p.accent, opacity: 0.55 + 0.45 * Math.sin(frame / 6) }} />
            {props.file}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', fontFamily: FONTS.mono, fontSize: 28, color: C.sibling, fontWeight: 500 }}>{sibling}</div>
        </div>
        {/* code area */}
        <div style={{ position: 'relative', padding: '12px 0 0' }}>
          <div style={{ position: 'absolute', left: gutter - 6, top: 0, bottom: 0, width: 1.5, background: C.rule }} />
          {Array.from({ length: rows }, (_, i) => {
            const l = lines[i];
            const full = l?.text ?? '';
            const shown = l ? typed(frame, fps, starts[i], full, cps) : '';
            const done = !!l && shown.length >= full.length && frame >= starts[i];
            const active = !!l && frame >= starts[i] && !done;
            const isCur = !!l && i === cur && frame >= starts[i] && !allDone;
            const hl = l?.highlight ? prog(frame, starts[i] + (full.length / cps) * fps, starts[i] + (full.length / cps) * fps + 8) : 0;
            return (
              <div key={i} style={{ position: 'relative', height: lh, display: 'flex', alignItems: 'center', fontFamily: FONTS.mono, fontSize: fs, fontWeight: 500 }}>
                {isCur && <div style={{ position: 'absolute', inset: 0, background: C.cur }} />}
                {l?.highlight && <div style={{ position: 'absolute', inset: 0, background: p.accent, opacity: 0.22 * hl }} />}
                {l?.highlight && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 8, background: p.accent, opacity: hl }} />}
                <div style={{ width: gutter, textAlign: 'right', paddingRight: 22, color: isCur || hl > 0.5 ? C.numOn : C.num, position: 'relative', fontSize: fs - 4 }}>{i + 1}</div>
                <div style={{ position: 'relative', whiteSpace: 'pre', color: COL.base, paddingLeft: 12 }}>
                  {tokenize(shown, COL)}
                  {active && <span style={{ display: 'inline-block', width: Math.round(fs * 0.55), height: Math.round(fs * 1.15), background: p.accent, marginLeft: 2, verticalAlign: 'middle', opacity: Math.floor(frame / 8) % 2 ? 0.2 : 1 }} />}
                </div>
                {l?.highlight && hl > 0.3 && (
                  <div style={{ position: 'absolute', right: 20, fontFamily: FONTS.mono, fontSize: 24, fontWeight: 700, color: p.accent, background: 'rgba(255,74,32,0.14)', border: `2px solid ${p.accent}`, borderRadius: 10, padding: '2px 12px', opacity: hl, transform: `translateX(${(1 - hl) * 20}px)` }}>← here</div>
                )}
              </div>
            );
          })}
        </div>
        {/* status bar */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: statusH, background: p.accent, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px', fontFamily: FONTS.mono, fontSize: 26, fontWeight: 700 }}>
          <span>{language} · UTF-8</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {allDone && <span style={{ background: C.okBg, color: C.okInk, borderRadius: 10, padding: '2px 14px', transform: `scale(${Math.min(1.1, okP)})`, opacity: Math.min(1, okP * 2) }}>✓ ready</span>}
            <span>Ln {cur + 1}, Col {curShown + 1}</span>
          </span>
        </div>
      </div>
    </SceneRoot>
  );
};

export const codeSnippetScene: SceneDefinition<CodeProps> = {
  type: 'code-snippet',
  description: "Code block with syntax coloring whose lines are typed one by one, some highlighted: show a command, a script, a technical prompt.",
  exampleProps: {
    file: 'voice.py',
    lines: [
      { text: '# clone my voice in ten seconds' },
      { text: 'import reelforge' },
      { text: 'voice = reelforge.clone("voice.wav")' },
      { text: 'reel = reelforge.make(topic, voice)', highlight: true },
      { text: 'print("ready in", 38, "seconds")' },
    ],
    speed: 46,
  },
  cues: ['window'],
  Component: Code,
};
