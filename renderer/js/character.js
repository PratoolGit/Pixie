// Pixie, animated from the ORIGINAL sticker art. 40 emotions = original illustration + procedural motion + props + particles + tint.
// Lip-sync swaps between the open- and closed-mouth illustrations driven by the voice level (with a small squash & stretch).
import { Voice } from './voice.js';
import { Sound } from './sound.js';
import { gust } from './bg.js';
import { ANCHORS } from './anchors.js';

// s = sprite, t = [open-mouth, closed-mouth] talk frames, m = motion [preset, a, b], fx = [[particle, every ms]], p = prop glyph, f = CSS filter
export const EM = {
  neutral: { s: 'peaceful', t: ['happy', 'peaceful'], m: ['breathe'], fx: [['flowers', 5000]] },
  happy: { s: 'happy', t: ['happy', 'peaceful'], m: ['bounce', 3, 7], fx: [['hearts', 2600]] },
  joyful: { s: 'happy', t: ['happy', 'peaceful'], m: ['bounce', 4.2, 13], fx: [['sparkles', 1000]] },
  laughing: { s: 'happy', t: ['happy', 'excited'], m: ['laugh'], fx: [['sparkles', 1400]] },
  excited: { s: 'excited', t: ['excited', 'happy'], m: ['bounce', 2.6, 20], fx: [['confetti', 1800]] },
  cheering: { s: 'excited', t: ['excited', 'happy'], m: ['bounce', 3.4, 26], fx: [['confetti', 900]] },
  greeting: { s: 'excited', t: ['excited', 'happy'], m: ['sway', 3.4, 5], fx: [['sparkles', 1200]] },
  proud: { s: 'peaceful', t: ['happy', 'peaceful'], m: ['puff', 1.6], fx: [['sparkles', 1400]], f: 'drop-shadow(0 0 14px #ffe08a)' },
  thankful: { s: 'happy', t: ['happy', 'peaceful'], m: ['nod', 1.5, 6], fx: [['hearts', 1500]] },
  love: { s: 'shy', t: ['surprised', 'shy'], m: ['float', 1.4, 7], fx: [['hearts', 700]], f: 'drop-shadow(0 0 16px #ff9bc4)' },
  flirty: { s: 'shy', t: ['happy', 'shy'], m: ['wiggle', 2.2, 4], fx: [['hearts', 1200]] },
  teasing: { s: 'happy', t: ['happy', 'peaceful'], m: ['wiggle', 3, 4], fx: [['sparkles', 1500]] },
  playful: { s: 'happy', t: ['happy', 'peaceful'], m: ['bounce', 5, 9], fx: [['notes', 900]] },
  shy: { s: 'shy', t: ['teary', 'shy'], m: ['sway', 1.8, 2.2], fx: [['hearts', 4000]] },
  blushing: { s: 'shy', t: ['teary', 'shy'], m: ['tremble'], fx: [['steam', 1500]], f: 'saturate(1.2)' },
  flustered: { s: 'shy', t: ['surprised', 'shy'], m: ['shake', 14, 3.5], fx: [['steam', 700], ['sweat', 1600]] },
  surprised: { s: 'surprised', t: ['surprised', 'surprised'], m: ['bounce', 1.1, 7], p: '❗' },
  shocked: { s: 'surprised', t: ['surprised', 'surprised'], m: ['shiver', 26, 3], p: '❗❗', fx: [['sweat', 1200]] },
  scared: { s: 'scared', t: ['scared', 'scared'], m: ['shiver', 28, 3], fx: [['sweat', 900]], f: 'brightness(.97)' },
  worried: { s: 'teary', t: ['teary', 'shy'], m: ['sway', 2.4, 2], fx: [['sweat', 2200]] },
  nervous: { s: 'scared', t: ['scared', 'shy'], m: ['wiggle', 8, 2], fx: [['sweat', 1800]] },
  sad: { s: 'sad', t: ['sad', 'teary'], m: ['droop'], p: '🌧️', f: 'saturate(.8) brightness(.97)' },
  crying: { s: 'sad', t: ['sad', 'teary'], m: ['sob', 5], fx: [['tears', 350]] },
  teary: { s: 'teary', t: ['teary', 'shy'], m: ['tremble'], fx: [['tears', 1400]] },
  lonely: { s: 'sad', t: ['sad', 'teary'], m: ['sway', .8, 2], f: 'saturate(.7) brightness(.96)' },
  angry: { s: 'angry', t: ['surprised', 'angry'], m: ['shake', 22, 3.5], p: '💢', f: 'drop-shadow(0 0 12px #ff7a7a)' },
  annoyed: { s: 'pouty', t: ['surprised', 'pouty'], m: ['shake', 4, 1.5], p: '💢' },
  pouty: { s: 'pouty', t: ['surprised', 'pouty'], m: ['puff', 2.2], fx: [['steam', 1300]] },
  jealous: { s: 'pouty', t: ['surprised', 'pouty'], m: ['wiggle', 3, 3], fx: [['steam', 1700]], f: 'hue-rotate(-8deg) saturate(1.1)' },
  confused: { s: 'confused', t: ['surprised', 'confused'], m: ['tilt', 8], p: '❓' },
  curious: { s: 'thinking', t: ['surprised', 'thinking'], m: ['tilt', -7], p: '❓' },
  thinking: { s: 'thinking', t: ['surprised', 'thinking'], m: ['sway', .9, 1.8], p: '💭' },
  idea: { s: 'excited', t: ['excited', 'happy'], m: ['bounce', 3, 10], p: '💡', fx: [['sparkles', 900]] },
  focused: { s: 'thinking', t: ['surprised', 'thinking'], m: ['breathe'], f: 'drop-shadow(0 0 14px #8fd8ff)' },
  working: { s: 'thinking', t: ['surprised', 'thinking'], m: ['nod', 5, 1.4], p: '⚙️', f: 'drop-shadow(0 0 10px #ffd0e6)' },
  listening: { s: 'peaceful', t: ['happy', 'peaceful'], m: ['lean', 4], p: '👂', fx: [['waves', 1100]] },
  success: { s: 'excited', t: ['excited', 'happy'], m: ['bounce', 3, 16], p: '✅', fx: [['confetti', 1300]] },
  oops: { s: 'confused', t: ['surprised', 'confused'], m: ['shake', 6, 2], p: '💦' },
  determined: { s: 'peaceful', t: ['happy', 'peaceful'], m: ['puff', 3], p: '🔥' },
  relieved: { s: 'peaceful', t: ['happy', 'peaceful'], m: ['droop'], fx: [['sparkles', 1600]], p: '😮‍💨' },
  sleepy: { s: 'sleepy', t: ['sleepy', 'sleepy'], m: ['nod', .9, 4], fx: [['zzz', 1800]] },
  yawning: { s: 'sleepy', t: ['sleepy', 'sleepy'], m: ['stretch'], fx: [['zzz', 1500]] },
  tired: { s: 'sleepy', t: ['sleepy', 'sleepy'], m: ['droop'], fx: [['zzz', 3000]], f: 'saturate(.85)' },
  sleeping: { s: 'sleepy', t: ['sleepy', 'sleepy'], m: ['float', .5, 3], fx: [['zzz', 1300]], f: 'brightness(.93) saturate(.9)' }
};
export const EMOTIONS = Object.keys(EM);
const ALIAS = { peaceful: 'neutral', adoring: 'love', pondering: 'thinking', cool: 'proud', sassy: 'teasing', terrified: 'scared', joy: 'joyful', mischievous: 'teasing', grumpy: 'annoyed', puzzled: 'confused', ecstatic: 'cheering', embarrassed: 'blushing', disappointed: 'sad', sobbing: 'crying', bored: 'tired' };
const norm = n => (EM[n] ? n : ALIAS[n] || 'neutral');
const SPRITES = ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'excited', 'shy', 'confused', 'pouty', 'scared', 'teary', 'thinking', 'peaceful'];
const url = n => `app://pixie/assets/emotions/${n}.png`;
SPRITES.forEach(n => { const i = new Image(); i.src = url(n); });

const C = { mouthOn: false, mouthSprite: '', nod: 0, tilt: 0, tiltT: 0, lastAcc: 0, lastLook: 0, ms: { w: 0, h: 0, c: 0, t: 0 }, name: 'sleeping', shown: '', open: false, openAt: 0, tx: 0, ty: 0, lx: 0, ly: 0, asleep: true, last: Date.now(), timer: null, fxT: [], pop: 0, t0: 0 };
const $ = id => document.getElementById(id);
const chars = () => document.querySelectorAll('img[data-char]');

function showSprite(name, fade) {
  if (name === C.shown) return; C.shown = name;
  const a = $('sprA'), b = $('sprB');
  if (a && b) { if (fade) { const act = a.classList.contains('on') ? a : b, nxt = act === a ? b : a; nxt.src = url(name); nxt.classList.add('on'); act.classList.remove('on'); } else (a.classList.contains('on') ? a : b).src = url(name); }
  chars().forEach(i => { i.src = url(name); });
}
export function setEmotion(name, holdMs = 0) {
  name = norm(name); clearTimeout(C.timer);
  if (name !== C.name) {
    C.name = name; const e = EM[name]; document.body.dataset.emotion = name; C.open = false; showSprite(e.s, true); C.pop = performance.now();
    const ch = $('char'); if (ch) ch.style.setProperty('--f', e.f || 'none');
    const pr = $('prop'); if (pr) { pr.textContent = e.p || ''; pr.classList.remove('in'); void pr.offsetWidth; if (e.p) pr.classList.add('in'); }
    C.fxT.forEach(clearInterval); C.fxT = (e.fx || []).map(([k, ms]) => setInterval(() => burst(k, k === 'confetti' ? 6 : k === 'tears' ? 1 : 2), ms));
    if (e.fx && e.fx[0]) burst(e.fx[0][0], e.fx[0][0] === 'confetti' ? 10 : 3);
    if (name === 'excited' || name === 'cheering' || name === 'success' || name === 'greeting') gust(1);
  }
  if (holdMs) C.timer = setTimeout(() => setEmotion('neutral'), holdMs);
}
export const emotion = () => C.name;
export const isAsleep = () => C.asleep;

// ---- particles & props ----
const G = { hearts: ['♥', '♡', '♥'], sparkles: ['✦', '✧', '★'], confetti: ['●', '▲', '■', '✿'], zzz: ['z', 'Z', 'z'], flowers: ['✿', '❀'], notes: ['♪', '♫'], steam: ['☁'], sweat: ['💧'], tears: ['💧'], waves: ['((', '(('] };
const COL = ['#ff8fb4', '#ffb3c9', '#ffd66e', '#b9a8ff', '#8fd8ff', '#ff9bd0'];
export function burst(kind = 'hearts', n = 8, origin = null) {
  const layer = $('fx'); if (!layer) return; const r = layer.getBoundingClientRect(), g = G[kind] || G.hearts, fall = kind === 'sweat' || kind === 'tears';
  const ox = origin ? origin.x - r.left : r.width * (kind === 'tears' ? .5 : .5), oy = origin ? origin.y - r.top : r.height * (fall ? .46 : .4);
  for (let i = 0; i < n; i++) {
    if (layer.childElementCount > 60) layer.firstChild.remove();
    const e = document.createElement('span'); e.className = 'p p-' + kind; e.textContent = g[i % g.length];
    const side = kind === 'tears' ? (i % 2 ? 1 : -1) * 36 : (Math.random() - .5) * 150;
    e.style.cssText = `left:${ox + side}px;top:${oy}px;color:${kind === 'zzz' ? '#9b8be0' : COL[(Math.random() * COL.length) | 0]};font-size:${kind === 'zzz' ? 18 + i * 5 : 14 + Math.random() * 18}px;--dx:${fall ? side * .1 : (Math.random() - .5) * 240}px;--dy:${fall ? 90 + Math.random() * 40 : -(70 + Math.random() * 180)}px;--rot:${(Math.random() - .5) * 90}deg;animation-delay:${i * 40}ms`;
    layer.appendChild(e); setTimeout(() => e.remove(), 2700 + i * 40);
  }
}
export function shock() { const l = $('fx'); if (!l) return; const e = document.createElement('span'); e.className = 'shock'; l.appendChild(e); setTimeout(() => e.remove(), 900); }
export function reactionFx(name) { const f = EM[norm(name)]?.fx; if (f?.[0]) burst(f[0][0], 10); }
export function react(name, holdMs = 4200) { setEmotion(name, holdMs); reactionFx(name); touch(); }

// ---- motion presets: return [x, y, rotation(deg), scaleX, scaleY] ----
function motion(m, t, lvl) {
  const [p, a, b] = m, S = Math.sin, A = Math.abs, pi = Math.PI;
  switch (p) {
    case 'bounce': { const k = A(S(t * a * pi / 2)); return [0, -k * b, S(t * a * pi / 2) * 1.2, 1 + (1 - k) * .02, 1 - (1 - k) * .03]; }
    case 'laugh': return [S(t * 9) * 1.5, -A(S(t * 9)) * 6, S(t * 9) * 2.4, 1, 1];
    case 'shake': return [S(t * a) * b, 0, S(t * a * .5) * b * .25, 1, 1];
    case 'shiver': return [S(t * a) * b, S(t * a * 1.3) * b * .5, 0, 1, 1];
    case 'sway': return [S(t * a * .7) * 3, S(t * a * 1.4) * 1.5, S(t * a) * b, 1, 1];
    case 'wiggle': return [S(t * a) * 3, -A(S(t * a)) * 2, S(t * a) * b, 1, 1];
    case 'nod': return [0, S(t * a * 2) * b * .6, S(t * a * 2) * b * .5, 1, 1 + S(t * a * 2) * .01];
    case 'tilt': return [0, S(t * 1.6) * 2, a + S(t * 1.6) * 2, 1, 1];
    case 'sob': return [0, A(S(t * a)) * -5, S(t * a * .5) * 1.2, 1 + S(t * a) * .012, 1 - S(t * a) * .012];
    case 'puff': return [0, 0, 0, 1 + S(t * a) * .03, 1 + S(t * a) * .03];
    case 'stretch': return [0, 0, 0, 1 - (S(t * .9) + 1) * .02, 1 + (S(t * .9) + 1) * .06];
    case 'lean': return [S(t * 1.2) * 2 + a, 2, a, 1, 1];
    case 'float': return [S(t * a * .6) * 4, S(t * a) * b, S(t * a * .6) * 1.5, 1, 1];
    case 'tremble': return [S(t * 40) * 1.2, S(t * 33) * .8, S(t * .9) * 1.2, 1, 1];
    case 'droop': return [0, 10 + S(t * 1.2) * 2, S(t * .8) * 1.4, 1, .975];
    default: return [S(t * .7) * 1.2, S(t * 2) * 3, S(t * .9) * 1.2, 1, 1 + S(t * 2) * .008];
  }
}
export function lookAt(x, y) { C.drift = false; C.lastLook = performance.now(); C.tx = x; C.ty = y; }
export function touch() { C.last = Date.now(); if (C.asleep) wakeUp(); }
const IDLE = [['curious', 2400], ['happy', 2200], ['shy', 2000], ['thinking', 2600], ['proud', 2200], ['greeting', 2200]];
// ---- real lip-sync: vector lips drawn on the mouthless original face, shaped by the viseme + loudness from the audio clock ----
const VIS = { N: { w: .92, h: .1 }, M: { w: .86, h: 0 }, A: { w: 1, h: 1, t: 1 }, E: { w: 1.2, h: .52, t: 1 }, I: { w: 1.3, h: .27, t: 1 }, O: { w: .62, h: .85, r: 1 }, U: { w: .46, h: .55, r: 1 }, F: { w: 1.02, h: .15, t: 1 }, L: { w: 1, h: .4, t: 1 }, PREP: { w: .72, h: .12 } };
const E_ = id => document.getElementById(id);
function drawMouth(a, now, dt) {
  const svg = E_('mouth'); if (!svg) return; const W = a.w, H = a.h, hw = a.hw / 100 * W, oh = a.oh / 100 * H, cx = a.cx / 100 * W, cy = a.cy / 100 * H;
  const prep = Voice.preparing && !Voice.speaking, v = VIS[prep ? 'PREP' : Voice.viseme] || VIS.N, lvl = Voice.speaking ? Voice.level : .3 + .2 * Math.sin(now / 170);
  const M = C.ms, k = 1 - Math.exp(-dt * 32);
  const tw = hw * v.w * (1 + .07 * lvl), th = prep ? oh * (.06 + .05 * Math.sin(now / 200)) : oh * v.h * Math.min(1.12, .3 + lvl * .95);
  M.w += (tw - M.w) * k; M.h += (th - M.h) * (th > M.h ? k : k * 1.2); M.c += ((Voice.speaking ? a.c * .45 + .12 : a.c) - M.c) * k;
  if (!M.w) { M.w = hw; }
  const w = M.w, h = Math.max(0, M.h), lift = M.c * w * .26, L = [cx - w, cy - lift], R = [cx + w, cy - lift], lw = Math.max(1.3, W * .0068);
  const fill = E_('mFill'), line = E_('mLine'), tong = E_('mTongue'), teeth = E_('mTeeth'), clip = E_('mClipP');
  line.setAttribute('stroke-width', lw); fill.setAttribute('stroke-width', lw);
  if (h < oh * .07) { line.setAttribute('d', `M${L[0]} ${L[1]} Q${cx} ${cy + M.c * w * .55 + w * .08} ${R[0]} ${R[1]}`); fill.setAttribute('d', ''); clip.setAttribute('d', ''); tong.setAttribute('rx', 0); teeth.setAttribute('width', 0); return; }
  let d; const rd = v.r && h > oh * .2;
  if (rd) { const ey = cy + h * .38, ry = h * .55; d = `M${cx - w} ${ey} A${w} ${ry} 0 1 0 ${cx + w} ${ey} A${w} ${ry} 0 1 0 ${cx - w} ${ey}Z`; }
  else d = `M${L[0]} ${L[1]} Q${cx} ${L[1] - w * .06 - h * .08} ${R[0]} ${R[1]} Q${cx} ${R[1] + h * 1.38} ${L[0]} ${L[1]}Z`;
  fill.setAttribute('d', d); clip.setAttribute('d', d); line.setAttribute('d', '');
  const top = rd ? cy + h * .38 - h * .55 : L[1], tongueY = rd ? cy + h * .62 : L[1] + h * .78;
  tong.setAttribute('cx', cx); tong.setAttribute('cy', tongueY); tong.setAttribute('rx', w * (rd ? .6 : .56)); tong.setAttribute('ry', Math.max(.5, h * .3));
  if (v.t && h > oh * .28) { teeth.setAttribute('x', cx - w * .78); teeth.setAttribute('y', top - 1); teeth.setAttribute('width', w * 1.56); teeth.setAttribute('height', Math.min(h * .26, oh * .24)); teeth.setAttribute('rx', 1.5); } else teeth.setAttribute('width', 0);
}
function setMouthLayer(on, name) {
  const m = E_('sprM'), svg = E_('mouth'); if (!m || !svg) return; const a = ANCHORS[name];
  if (on && a) { if (C.mouthSprite !== name) { m.src = `app://pixie/assets/emotions/mouthless/${name}.png`; svg.setAttribute('viewBox', `0 0 ${a.w} ${a.h}`); C.mouthSprite = name; C.ms.w = a.hw / 100 * a.w; C.ms.h = 0; C.ms.c = a.c; } m.style.opacity = 1; svg.style.opacity = 1; C.mouthOn = true; }
  else { m.style.opacity = 0; svg.style.opacity = 0; C.mouthOn = false; }
}

export function startLoop() {
  const el = $('char'); let idleAt = performance.now() + 15000, prev = performance.now();
  const loop = now => {
    const dt = Math.min(.05, (now - prev) / 1000); prev = now; const t = now / 1000, e = EM[C.name]; Voice.sample();
    // idle gaze drift when no face is being tracked
    if (now - C.lastLook > 3500) { C.lastLook = now; if (Math.abs(C.tx) < .05 && Math.abs(C.ty) < .05 || C.drift) { C.drift = true; C.tx = (Math.random() - .5) * .5; C.ty = (Math.random() - .5) * .25; } }
    C.lx += (C.tx - C.lx) * .08; C.ly += (C.ty - C.ly) * .08;
    const speaking = Voice.speaking, prepare = Voice.preparing && !speaking, lvl = speaking ? Voice.level : 0;
    let [x, y, r, sx, sy] = motion(e.m, t, lvl);
    const age = now - C.pop; if (age < 420) { const k = age / 420, pop = 1 + Math.sin(k * Math.PI) * .07 * (1 - k); sx *= pop; sy *= pop; }
    // ---- speaking body language ----
    C.nod = Math.max(C.nod * .86, Voice.accent || 0);
    if (Voice.accent > .9 && now - C.lastAcc > 650) { C.lastAcc = now; C.tiltT = (Math.random() - .5) * 5.5; }
    if (!speaking) C.tiltT = 0; C.tilt += (C.tiltT - C.tilt) * .06;
    if (speaking) { y += -lvl * 3.5 + C.nod * 5; r += C.tilt + C.nod * 1.3; sy *= 1 + lvl * .03 + C.nod * .01; sx *= 1 - lvl * .012; x += Math.sin(t * 2.1) * 1.5; }
    else if (prepare) { y += 2.5 + Math.sin(t * 5) * 1; sy *= 1.008; r += Math.sin(t * 3) * .6; }
    // ---- mouth: overlay lips on the mouthless art when this sprite has an anchor, otherwise swap open/closed drawings ----
    const hasStage = !!$('sprM'), spr = e.s, anchored = hasStage && ANCHORS[spr];
    if (anchored) { const want = speaking || prepare; if (want !== C.mouthOn || (want && C.mouthSprite !== spr)) setMouthLayer(want, spr); if (want) drawMouth(ANCHORS[spr], now, dt); if (C.open) { C.open = false; showSprite(e.s, false); } }
    else {
      if (C.mouthOn) setMouthLayer(false);
      if (speaking) { const want = Voice.level > (C.open ? .22 : .38); if (want !== C.open && now - C.openAt > 70) { C.open = want; C.openAt = now; showSprite(want ? e.t[0] : e.t[1], false); } sy *= 1 + lvl * .035; y -= lvl * 4; }
      else if (C.open) { C.open = false; showSprite(e.s, false); }
    }
    const tr = `translate(${(x + C.lx * 10).toFixed(1)}px, ${(y + C.ly * 5).toFixed(1)}px) rotate(${(r + C.lx * 2.5).toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
    if (el) el.style.transform = tr;
    chars().forEach(i => { i.style.transform = `translate(${(x * .4).toFixed(1)}px, ${(y * .4).toFixed(1)}px) rotate(${(r * .8).toFixed(1)}deg) scale(${(1 + (sx - 1) * .6).toFixed(3)}, ${(1 + (sy - 1) * .6).toFixed(3)})`; });
    if (!C.asleep && Date.now() - C.last > 240000) fallAsleep();
    if (!C.asleep && C.name === 'neutral' && !speaking && now > idleAt) { const [n, ms] = IDLE[(Math.random() * IDLE.length) | 0]; setEmotion(n, ms); idleAt = now + 14000 + Math.random() * 14000; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export function fallAsleep() { C.asleep = true; setEmotion('sleeping'); document.body.classList.add('asleep'); }
export function startAsleep() { C.asleep = true; C.name = ''; setEmotion('sleeping'); document.body.classList.add('asleep'); }
let wakeHandler = null; export const onWake = fn => (wakeHandler = fn);
export function wakeUp() {
  if (!C.asleep) return; C.asleep = false; C.last = Date.now(); document.body.classList.remove('asleep'); Sound.wake();
  setEmotion('yawning');
  setTimeout(() => { setEmotion('surprised'); Sound.pop(); burst('sparkles', 10); }, 1300);
  setTimeout(() => { setEmotion('excited'); burst('hearts', 12); wakeHandler?.(); }, 2100);
  setTimeout(() => setEmotion('happy', 3500), 4800);
}
