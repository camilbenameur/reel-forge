// Scene "browser-page": web page in a browser (URL, title, blocks), cursor that clicks then scrolls.
import React from 'react';
import { typed } from '../../core/motion';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { SceneRoot, prog, useKit } from './kit';

interface BrowserProps {
  url: string;
  title: string;
  subtitle?: string;
  button: string;
  cards: { title: string; cue?: string }[];
  cueClick?: string;
}

const Cursor: React.FC<{ x: number; y: number; press: number }> = ({ x, y, press }) => (
  <svg width={54} height={64} viewBox="0 0 27 32" style={{ position: 'absolute', left: x, top: y, filter: 'drop-shadow(0 6px 5px rgba(0,0,0,.35))', transform: `scale(${1 - 0.12 * press})`, transformOrigin: '0 0' }}>
    <path d="M2 2 L2 24 L8 18.5 L12.2 28.5 L16.4 26.7 L12.3 17 L20.5 17 Z" fill="#fff" stroke="#0A0A0A" strokeWidth={2.2} strokeLinejoin="round" />
  </svg>
);

const BrowserPage: SceneDefinition<BrowserProps>['Component'] = ({ props, ctx }) => {
  const k = useKit(ctx);
  const { frame, fps, p } = k;
  const winU = Math.min(1, k.sp(k.cue('window', 0), 'soft'));
  const clickAt = k.cue(props.cueClick ?? 'click', 48);
  const scrollAt = clickAt + 10;
  const sc = prog(frame, scrollAt, scrollAt + 40);
  const scrollE = 1 - Math.pow(1 - sc, 3);
  const scroll = scrollE * 250;
  const press = prog(frame, clickAt - 2, clickAt + 2) * (1 - prog(frame, clickAt + 3, clickAt + 8));
  const ripple = prog(frame, clickAt, clickAt + 16);
  // cursor: comes in from the right toward the button, stays, then moves down with the scroll
  const mv = prog(frame, 14, clickAt - 4);
  const mvE = 1 - Math.pow(1 - mv, 3);
  const bx = 150;
  const by = 430;
  const cx = 780 + (bx - 780) * mvE + k.dr(3, 2.4);
  const cy = 520 + (by - 520) * mvE + sc * 110 + k.dr(2, 3);
  const urlTxt = typed(frame, fps, 4, props.url, 36);
  const W = 920;
  const H = 654;
  const page = k.night ? '#1A1A1A' : '#FFFFFF';
  const blk = k.night ? '#2B2B2B' : '#EFECE6';
  return (
    <SceneRoot>
      <div style={{ position: 'absolute', left: 20, top: 24, width: W, height: H, borderRadius: 26, background: page, border: `2.5px solid ${k.border}`, boxShadow: `0 28px 46px -14px ${p.shadow}`, overflow: 'hidden', opacity: winU, transform: `translateY(${(1 - winU) * 40}px)` }}>
        <div style={{ height: 124, background: k.night ? '#222' : '#ECE8E1', borderBottom: `2px solid ${k.border}`, padding: '14px 22px 0', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />)}
          </div>
          <div style={{ height: 58, borderRadius: 29, background: page, border: `2px solid ${k.border}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, fontFamily: FONTS.mono, fontSize: 30, fontWeight: 600, color: p.cardInk }}>
            <svg width={20} height={22} viewBox="0 0 20 22"><rect x={2} y={9} width={16} height={12} rx={3} fill={p.success} /><path d="M5 9 V6 a5 5 0 0 1 10 0 V9" stroke={p.success} strokeWidth={3} fill="none" /></svg>
            <span>{urlTxt}</span>
            <span style={{ width: 3, height: 26, background: p.accent, opacity: urlTxt.length < props.url.length ? 1 : 0 }} />
          </div>
        </div>
        <div style={{ position: 'absolute', top: 124, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <div style={{ transform: `translateY(${-scroll}px)`, padding: '0 44px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 84 }}>
              <div style={{ fontFamily: FONTS.display, fontSize: 40, color: p.cardInk }}>LOGO<span style={{ color: p.accent }}>.</span></div>
              <div style={{ display: 'flex', gap: 22 }}>{[70, 90, 60].map((w, i) => <div key={i} style={{ width: w, height: 12, borderRadius: 6, background: blk }} />)}</div>
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 108, lineHeight: 1, textTransform: 'uppercase', color: p.cardInk, marginTop: 14, ...k.ent(8, 'soft', 20) }}>{props.title}</div>
            {props.subtitle && <div style={{ fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 50, color: p.accent, marginTop: 10, ...k.ent(14, 'soft', 20) }}>{props.subtitle}</div>}
            <div style={{ marginTop: 28, position: 'relative', width: 'fit-content' }}>
              <div style={{ background: p.accent, color: k.onAccent, fontFamily: FONTS.sans, fontWeight: 800, fontSize: 46, padding: '20px 48px', borderRadius: 16, border: '3px solid #0A0A0A', boxShadow: press ? 'none' : '0 8px 0 #0A0A0A', transform: `translateY(${press * 8}px)` }}>{props.button}</div>
              <div style={{ position: 'absolute', left: 60, top: 40, width: 60, height: 60, marginLeft: -30, marginTop: -30, borderRadius: 30, border: `5px solid ${p.accent}`, opacity: ripple > 0 && ripple < 1 ? 1 - ripple : 0, transform: `scale(${1 + ripple * 3})` }} />
            </div>
            <div style={{ position: 'absolute', right: 44, top: 250, width: 330, height: 200, borderRadius: 22, background: p.ink, border: '3px solid #0A0A0A', overflow: 'hidden', transform: `rotate(${2 + k.dr(1, 3.2)}deg)`, ...k.ent(18, 'soft', 20) }}>
              <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 70% 30%, ${p.accent}, transparent 60%)`, opacity: 0.8 }} />
              <svg width={330} height={200} style={{ position: 'absolute', inset: 0 }}>
                <circle cx={165} cy={100} r={44} fill="#fff" />
                <path d="M152 78 L186 100 L152 122 Z" fill={p.accent} />
                <rect x={20} y={172} width={290} height={8} rx={4} fill="rgba(255,255,255,0.3)" />
                <rect x={20} y={172} width={110 + 60 * Math.sin(frame / 30) ** 2} height={8} rx={4} fill="#fff" />
              </svg>
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 70 }}>
              {props.cards.slice(0, 3).map((c, i) => {
                const at = k.cue(c.cue, scrollAt + 14 + i * 8);
                const s = Math.min(1.1, k.sp(at, 'snap'));
                return (
                  <div key={i} style={{ flex: 1, height: 300, borderRadius: 22, background: blk, border: `2.5px solid ${k.border}`, padding: 20, boxSizing: 'border-box', opacity: Math.min(1, s * 2.4), transform: `translateY(${(1 - Math.min(s, 1)) * 40}px)` }}>
                    <div style={{ width: 84, height: 84, borderRadius: 22, background: i === 1 ? p.accent : p.ink }} />
                    <div style={{ fontFamily: FONTS.display, fontSize: 52, textTransform: 'uppercase', marginTop: 20, color: p.cardInk, lineHeight: 1.05 }}>{c.title}</div>
                    <div style={{ height: 10, width: '80%', borderRadius: 5, background: p.muted, opacity: 0.6, marginTop: 14 }} />
                    <div style={{ height: 10, width: '55%', borderRadius: 5, background: p.muted, opacity: 0.6, marginTop: 10 }} />
                  </div>
                );
              })}
            </div>
            <div style={{ height: 300 }} />
          </div>
        </div>
      </div>
      <Cursor x={cx + 20} y={cy + 40} press={press} />
    </SceneRoot>
  );
};

export const browserPageScene: SceneDefinition<BrowserProps> = {
  type: 'browser-page',
  description: "Web page in a browser window (typed URL, title, button, cards) with a cursor that clicks then scrolls: present a website, an online tool, a sales page.",
  exampleProps: {
    url: 'reelforge.example/try',
    title: 'One reel a day',
    subtitle: 'without ever filming',
    button: 'Try it',
    cards: [{ title: 'Voice' }, { title: 'Scenes' }, { title: 'Render' }],
    cueClick: 'click',
  },
  cues: ['window', 'click'],
  Component: BrowserPage,
};
