// Scene "phone": tilted phone whose screen shows a reel, a conversation or notifications.
import React from 'react';
import { FONTS } from '../../core/theme';
import type { SceneDefinition } from '../contract';
import { clamp01, fade, float, fmtNum, Frame, cardStyle, Mono, useScene, type Scene } from './kit';

interface Message {
  from: 'me' | 'them';
  text: string;
  cue?: string;
}
interface Notif {
  app: string;
  title: string;
  text: string;
  time?: string;
  cue?: string;
}

interface Props {
  screen: 'reel' | 'chat' | 'notification';
  tilt?: number;   // degrees, e.g. -6
  // reel
  caption?: string;       // reel caption
  keyword?: string;        // caption word shown in accent italic serif
  author?: string;
  views?: number;
  likes?: string;
  // chat
  contact?: string;
  messages?: Message[];
  // notification
  time?: string;
  date?: string;
  notifications?: Notif[];
  cue?: string;
}

const PW = 360;
const PH = 720;

const StatusBar: React.FC<{ color: string; time?: string }> = ({ color, time = '9:41' }) => (
  <div style={{ position: 'absolute', top: 16, left: 34, right: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: FONTS.sans, fontWeight: 700, fontSize: 17, color }}>
    <span>{time}</span>
    <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <svg width="18" height="12" viewBox="0 0 18 12" fill={color}>
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="5" width="3" height="7" rx="1" />
        <rect x="10" y="2" width="3" height="10" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg width="28" height="13" viewBox="0 0 28 13" fill="none">
        <rect x="0.7" y="0.7" width="23" height="11.6" rx="3.5" stroke={color} strokeOpacity="0.5" />
        <rect x="2.4" y="2.4" width="17" height="8.2" rx="2" fill={color} />
        <rect x="25" y="4" width="2" height="5" rx="1" fill={color} fillOpacity="0.5" />
      </svg>
    </span>
  </div>
);

const Heart: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M12 21 C5 15.5 2.5 12 2.5 8.6 C2.5 5.8 4.6 3.8 7.2 3.8 C9.2 3.8 11 5 12 6.8 C13 5 14.8 3.8 16.8 3.8 C19.4 3.8 21.5 5.8 21.5 8.6 C21.5 12 19 15.5 12 21 Z" />
  </svg>
);

const ReelScreen: React.FC<{ s: Scene; props: Props; t0: number }> = ({ s, props, t0 }) => {
  const f = s.frame;
  const cap = props.caption ?? '';
  const kw = props.keyword;
  const idx = kw ? cap.indexOf(kw) : -1;
  const pCap = s.spr(t0 + 8);
  const pLike = s.spr(t0 + 28, 'pop');
  const views = props.views ?? 0;
  const count = Math.round(views * clamp01((f - (t0 + 14)) / 50) ** 2);
  const prog = ((f - t0) / (s.fps * 12)) % 1;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#F1ECE2', overflow: 'hidden' }}>
      {/* flat illustration: stylized scene */}
      <div style={{ position: 'absolute', left: -20, right: -20, top: 150, height: 250, background: '#FFD9B8', transform: `skewY(-6deg)` }} />
      <svg style={{ position: 'absolute', left: 30, top: 175, width: 300, height: 260 }} viewBox="0 0 300 260">
        <g transform={`translate(0 ${Math.sin(f / 18) * 4})`}>
          <path d="M150 40 L270 100 L150 160 L30 100 Z" fill="#E9E4D8" stroke="#0A0A0A" strokeWidth="4" strokeLinejoin="round" />
          <path d="M30 100 L150 160 L150 215 L30 155 Z" fill="#C9C3B3" stroke="#0A0A0A" strokeWidth="4" strokeLinejoin="round" />
          <path d="M270 100 L150 160 L150 215 L270 155 Z" fill="#FF4A20" stroke="#0A0A0A" strokeWidth="4" strokeLinejoin="round" />
          <rect x="120" y="60" width="60" height="50" rx="6" fill="#FEED66" stroke="#0A0A0A" strokeWidth="4" />
          <path d="M138 98 L138 72 L150 88 L162 72 L162 98" stroke="#FF4A20" strokeWidth="6" fill="none" strokeLinejoin="round" />
        </g>
      </svg>
      {/* caption */}
      <div style={{ position: 'absolute', left: 26, right: 90, top: 440, opacity: fade(pCap), transform: `translateY(${(1 - pCap) * 26}px)`, fontFamily: FONTS.serif, fontSize: 40, lineHeight: 1.05, color: '#0A0A0A', background: 'rgba(255,255,255,0.0)' }}>
        {idx >= 0 ? (
          <>
            {cap.slice(0, idx)}
            <span style={{ fontStyle: 'italic', color: '#FF4A20' }}>{kw}</span>
            {cap.slice(idx + (kw?.length ?? 0))}
          </>
        ) : (
          cap
        )}
      </div>
      {/* views pill */}
      {views > 0 ? (
        <div style={{ position: 'absolute', right: 14, top: 72, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 10px', borderRadius: 999, background: '#fff', boxShadow: '0 6px 14px rgba(0,0,0,0.22)', fontFamily: FONTS.sans, fontWeight: 800, fontSize: 20, color: '#0A0A0A', opacity: fade(s.spr(t0 + 14, 'pop')) }}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 1.5 L14 8 L3 14.5 Z" fill="#0A0A0A" /></svg>
          {fmtNum(count)}
        </div>
      ) : null}
      {/* actions on the right */}
      <div style={{ position: 'absolute', right: 14, bottom: 120, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, fontFamily: FONTS.sans, fontWeight: 700, fontSize: 15, color: '#0A0A0A' }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * pLike + Math.sin(f / 6) * 0.03})` }}>
          <Heart size={40} color="#FF4A20" />
        </div>
        <span style={{ marginTop: -14 }}>{props.likes ?? ''}</span>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinejoin="round"><path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z" /></svg>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinejoin="round"><path d="M21 4 L3 11 L10 13 L12 20 Z" /></svg>
      </div>
      {/* author */}
      <div style={{ position: 'absolute', left: 20, bottom: 54, display: 'flex', alignItems: 'center', gap: 10, fontFamily: FONTS.sans, fontWeight: 700, fontSize: 18, color: '#0A0A0A' }}>
        <div style={{ width: 36, height: 36, borderRadius: 18, background: '#0A0A0A', color: '#FEED66', textAlign: 'center', lineHeight: '36px', fontSize: 18 }}>{(props.author ?? 'c')[0].toUpperCase()}</div>
        {props.author ?? ''}
        <span style={{ border: '1.5px solid #0A0A0A', borderRadius: 8, padding: '2px 10px', fontSize: 15 }}>Follow</span>
      </div>
      {/* playback bar */}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 30, height: 4, borderRadius: 2, background: 'rgba(10,10,10,0.15)' }}>
        <div style={{ width: `${clamp01(prog) * 100}%`, height: '100%', borderRadius: 2, background: '#0A0A0A' }} />
      </div>
    </div>
  );
};

const ChatScreen: React.FC<{ s: Scene; props: Props; t0: number }> = ({ s, props, t0 }) => {
  const msgs = props.messages ?? [];
  const times = msgs.map((m, i) => s.at(m.cue, t0 + 14 + i * 24));
  const last = times.length ? times[times.length - 1] : t0;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFFFFF', overflow: 'hidden', fontFamily: FONTS.sans }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 118, background: '#F6F4F0', borderBottom: '1.5px solid rgba(10,10,10,0.1)' }} />
      <div style={{ position: 'absolute', top: 62, left: 0, right: 0, textAlign: 'center', fontWeight: 800, fontSize: 21, color: '#0A0A0A' }}>
        {props.contact ?? 'Contact'}
      </div>
      <div style={{ position: 'absolute', left: 16, right: 16, top: 140, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => {
          const pp = s.spr(times[i], 'pop');
          const mine = m.from === 'me';
          return (
            <div
              key={i}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: 250,
                padding: '12px 16px',
                borderRadius: 22,
                borderBottomRightRadius: mine ? 6 : 22,
                borderBottomLeftRadius: mine ? 22 : 6,
                background: mine ? '#FF4A20' : '#ECE9E3',
                color: mine ? '#fff' : '#0A0A0A',
                fontWeight: 600,
                fontSize: 21,
                lineHeight: 1.22,
                opacity: fade(pp),
                transform: `scale(${0.6 + 0.4 * pp}) translateY(${(1 - pp) * 24}px)`,
                transformOrigin: mine ? 'bottom right' : 'bottom left',
              }}
            >
              {m.text}
            </div>
          );
        })}
        {msgs.length > 0 && s.frame > last + 8 ? (
          <div style={{ alignSelf: 'flex-start', background: '#ECE9E3', borderRadius: 20, padding: '14px 16px', display: 'flex', gap: 6 }}>
            {[0, 1, 2].map((d) => (
              <div key={d} style={{ width: 9, height: 9, borderRadius: 5, background: '#8C877E', transform: `translateY(${Math.sin(s.frame / 4 - d) * 4}px)` }} />
            ))}
          </div>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 28, height: 50, borderRadius: 25, border: '1.5px solid rgba(10,10,10,0.2)', display: 'flex', alignItems: 'center', padding: '0 18px', color: '#9A958B', fontSize: 19 }}>Message…</div>
    </div>
  );
};

const NotifScreen: React.FC<{ s: Scene; props: Props; t0: number }> = ({ s, props, t0 }) => {
  const list = props.notifications ?? [];
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(170deg,#2B2B33 0%,#16161B 60%,#3A1F18 100%)', overflow: 'hidden', fontFamily: FONTS.sans }}>
      <div style={{ position: 'absolute', top: 76, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: 21 }}>{props.date ?? 'Thursday, October 30'}</div>
      <div style={{ position: 'absolute', top: 100, left: 0, right: 0, textAlign: 'center', color: '#fff', fontWeight: 300, fontSize: 112, letterSpacing: -3 }}>{props.time ?? '9:41'}</div>
      <div style={{ position: 'absolute', left: 14, right: 14, top: 270, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map((n, i) => {
          const pp = s.spr(s.at(n.cue, t0 + 14 + i * 26), 'snap');
          return (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 24, background: 'rgba(255,255,255,0.92)', boxShadow: '0 10px 24px rgba(0,0,0,0.35)', opacity: fade(pp), transform: `translateY(${(1 - pp) * -60}px) scale(${0.9 + 0.1 * pp})` }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: i % 2 ? '#0A0A0A' : '#FF4A20', color: i % 2 ? '#FEED66' : '#fff', fontWeight: 800, fontSize: 24, textAlign: 'center', lineHeight: '46px', flex: 'none' }}>
                {n.app[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0, color: '#0A0A0A' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 600, color: '#6D6962' }}>
                  <span>{n.app.toUpperCase()}</span>
                  <span>{n.time ?? 'now'}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.15 }}>{n.title}</div>
                <div style={{ fontWeight: 500, fontSize: 18, lineHeight: 1.2, color: '#3F3C37' }}>{n.text}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Phone: SceneDefinition<Props>['Component'] = ({ props, ctx }) => {
  const s = useScene(ctx);
  const t0 = s.at(props.cue ?? 'enter', 0);
  const p = s.spr(t0, 'soft');
  const tilt = (props.tilt ?? -6) * Math.min(1, p) + Math.sin(s.frame / 40) * 0.9;
  const dark = props.screen === 'notification';
  const barColor = dark ? '#fff' : '#0A0A0A';
  const pF1 = s.spr(t0 + 12, 'pop');
  const pF2 = s.spr(t0 + 22, 'pop');
  const stat = props.screen === 'reel'
    ? { a: ['likes', props.likes ?? '12.4k'], b: ['views', fmtNum(props.views ?? 0)], note: 'it plays!' }
    : props.screen === 'chat'
      ? { a: ['with', props.contact ?? 'Julie'], b: ['messages', String((props.messages ?? []).length)], note: 'it replies!' }
      : { a: ['time', props.time ?? '9:41'], b: ['alerts', String((props.notifications ?? []).length)], note: 'it rings!' };
  return (
    <Frame>
      {/* left sticker */}
      <div style={{ position: 'absolute', left: 6, top: 170, width: 236, opacity: fade(pF1), transform: `translateY(${(1 - pF1) * 40 + float(s, 6, 3.1)}px) rotate(-5deg) scale(${0.7 + 0.3 * Math.min(1, pF1)})` }}>
        <div style={cardStyle(s, { padding: '18px 24px' })}>
          <Mono s={s} size={28}>{stat.a[0]}</Mono>
          <div style={{ fontFamily: FONTS.display, fontSize: 76, lineHeight: 1, color: s.p.accent }}>{stat.a[1]}</div>
        </div>
      </div>
      {/* right sticker */}
      <div style={{ position: 'absolute', left: 650, top: 120, width: 310, opacity: fade(pF2), transform: `translateY(${(1 - pF2) * 40 + float(s, 6, 3.4, 1.5)}px) rotate(4deg) scale(${0.7 + 0.3 * Math.min(1, pF2)})` }}>
        <div style={cardStyle(s, { padding: '18px 24px' })}>
          <Mono s={s} size={28}>{stat.b[0]}</Mono>
          <div style={{ fontFamily: FONTS.display, fontSize: stat.b[1].length > 6 ? 56 : 76, lineHeight: 1, color: s.p.cardInk }}>{stat.b[1]}</div>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 20, top: 430, fontFamily: FONTS.serif, fontStyle: 'italic', fontSize: 54, color: s.p.accent, opacity: fade(pF2), transform: `rotate(-6deg) translateY(${float(s, 4, 2.4)}px)` }}>
        {stat.note} →
      </div>
      <div
        style={{
          position: 'absolute',
          left: 250,
          top: 20,
          width: PW + 28,
          height: PH + 28,
          opacity: fade(p),
          transform: `translateY(${(1 - p) * 120 + Math.sin(s.frame / 22) * 7}px) rotate(${tilt}deg) scale(${0.9 + 0.1 * p})`,
          filter: `drop-shadow(0 30px 34px ${s.p.shadow})`,
        }}
      >
        {/* casing */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: 66, background: '#0A0A0A', border: '3px solid #2B2B2B' }} />
        <div style={{ position: 'absolute', left: 14, top: 14, width: PW, height: PH, borderRadius: 52, overflow: 'hidden', background: '#fff' }}>
          {props.screen === 'reel' ? <ReelScreen s={s} props={props} t0={t0} /> : null}
          {props.screen === 'chat' ? <ChatScreen s={s} props={props} t0={t0} /> : null}
          {props.screen === 'notification' ? <NotifScreen s={s} props={props} t0={t0} /> : null}
          <StatusBar color={barColor} time={props.screen === 'notification' ? '' : '9:41'} />
          <div style={{ position: 'absolute', top: 12, left: '50%', marginLeft: -50, width: 100, height: 30, borderRadius: 15, background: '#0A0A0A' }} />
          <div style={{ position: 'absolute', bottom: 9, left: '50%', marginLeft: -60, width: 120, height: 5, borderRadius: 3, background: barColor, opacity: 0.85 }} />
        </div>
      </div>
    </Frame>
  );
};

export const phone: SceneDefinition<Props> = {
  type: 'phone',
  description:
    "Slightly tilted phone whose screen shows a reel (caption, views), a conversation (bubbles) or notifications. Use it to talk about a post, a message, a notification or content consumed on mobile.",
  exampleProps: {
    screen: 'reel',
    tilt: -6,
    caption: "McDonald's is not a burger company.",
    keyword: 'burger',
    author: 'your.account',
    views: 2396686,
    likes: '12.4k',
    contact: 'Julie',
    messages: [
      { from: 'them', text: 'Did you see this reel?', cue: 'msg1' },
      { from: 'me', text: "Yes, it's crazy.", cue: 'msg2' },
    ],
    notifications: [
      { app: 'Instagram', title: 'the account posted a reel', text: 'Watch it now', cue: 'notif1' },
      { app: 'Studio', title: 'Your reel is ready', text: 'Render finished in 3 min', cue: 'notif2' },
    ],
  },
  cues: ['enter'],
  Component: Phone,
};
