// Speech output: Google voices (free or Cloud), parallel sentence synthesis, phrase cache, Web Audio playback.
// Lip-sync runs from the AUDIO CLOCK: loudness envelope of the decoded audio + a vowel/consonant (viseme) timeline built from the text
// and time-warped onto the envelope, so the mouth hits the right shapes exactly when the sound is played. While audio is still being
// generated, `Voice.preparing` drives a "getting ready to speak" animation instead of dead air.
import { S, routeChain, VOICES } from './store.js';

export const Voice = { speaking: false, preparing: false, level: 0, viseme: 'N', onStart: null, onEnd: null, onPrepare: null, lastEnd: 0, cur: null, accent: 0 };
let actx = null, token = 0, curSrc = null;
export const ac = () => (actx ||= new AudioContext({ latencyHint: 'interactive' }));
const cache = new Map();       // voice|text -> { buf, rate, env, units }
const b64Bytes = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };

// ---------- text -> viseme units ----------
function textUnits(text) {
  const t = text.toLowerCase().replace(/[^a-z' .,!?;:~\-]/g, ' '), u = []; let i = 0;
  const wordEnd = k => !/[a-z]/.test(t[k] || ' ');
  while (i < t.length) {
    const c = t[i], c2 = t.slice(i, i + 2);
    if (/\s/.test(c)) { u.push({ v: 'N', w: .5 }); i++; continue }
    if (/[.!?;:~]/.test(c)) { u.push({ v: 'M', w: 2.2 }); i++; continue }
    if (c === ',' || c === '-') { u.push({ v: 'N', w: 1.2 }); i++; continue }
    if (c2 === 'th') { u.push({ v: 'L', w: .7 }); i += 2; continue }
    if (c2 === 'sh' || c2 === 'ch' || c2 === 'zh') { u.push({ v: 'U', w: .8 }); i += 2; continue }
    if (c2 === 'oo' || c2 === 'ew' || c2 === 'ue') { u.push({ v: 'U', w: 2.4 }); i += 2; continue }
    if (c2 === 'ou' || c2 === 'ow' || c2 === 'oa') { u.push({ v: 'O', w: 2.6 }); i += 2; continue }
    if (c2 === 'ee' || c2 === 'ea' || c2 === 'ie') { u.push({ v: 'I', w: 2.4 }); i += 2; continue }
    if (c2 === 'ai' || c2 === 'ay' || c2 === 'ei' || c2 === 'ey') { u.push({ v: 'E', w: 2.4 }); i += 2; continue }
    if (c === 'e' && wordEnd(i + 1) && i > 1 && /[^aeiou ]/.test(t[i - 1]) && /[a-z]{2}/.test(t.slice(i - 3, i))) { i++; continue }   // silent final e
    if (c === 'a') u.push({ v: 'A', w: 2.5 }); else if (c === 'e') u.push({ v: 'E', w: 2.2 }); else if (c === 'i') u.push({ v: 'I', w: 2.2 }); else if (c === 'o') u.push({ v: 'O', w: 2.5 }); else if (c === 'u') u.push({ v: 'A', w: 2.2 });
    else if (c === 'y') u.push({ v: wordEnd(i + 1) ? 'I' : 'N', w: wordEnd(i + 1) ? 2 : .6 });
    else if ('bmp'.includes(c)) u.push({ v: 'M', w: .9 }); else if ('fv'.includes(c)) u.push({ v: 'F', w: .8 }); else if (c === 'w') u.push({ v: 'U', w: .9 });
    else if ('ldtnsz'.includes(c)) u.push({ v: 'L', w: .6 }); else u.push({ v: 'N', w: .6 });
    i++;
  }
  return u;
}
// loudness envelope (10 ms hop) + speech bounds
function analyze(buf) {
  const d = buf.getChannelData(0), hop = Math.max(1, Math.round(buf.sampleRate / 100)), n = Math.floor(d.length / hop), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = i * hop; k < (i + 1) * hop; k++) s += d[k] * d[k]; env[i] = Math.sqrt(s / hop); }
  const sorted = Float32Array.from(env).sort(), p90 = sorted[Math.floor(n * .9)] || .1, sc = .85 / Math.max(p90, 1e-4), thr = Math.max(p90 * .06, .004);
  for (let i = 0; i < n; i++) env[i] = Math.min(1.2, env[i] * sc);
  let a = 0, b = n - 1; while (a < n && env[a] * (1 / sc) < thr) a++; while (b > a && env[b] * (1 / sc) < thr) b--;
  return { env, a, b };
}
// time-warp the unit sequence onto the audio: vowels (heavy weight) land where the energy is
function align(units, env, a, b) {
  if (!units.length || b <= a) return [];
  let mean = 0; for (let i = a; i <= b; i++) mean += env[i]; mean /= (b - a + 1);
  const cum = [0]; for (let i = a; i <= b; i++) cum.push(cum[cum.length - 1] + env[i] + mean * .35);
  const total = cum[cum.length - 1], inv = f => { const target = f * total; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m + 1; else hi = m; } return (a + lo) * .01; };
  const tw = units.reduce((s, u) => s + u.w, 0); let acc = 0; return units.map(u => { const t0 = inv(acc / tw); acc += u.w; return { v: u.v, t0, t1: inv(acc / tw) }; });
}
const prep = (buf, text, rate) => { const { env, a, b } = analyze(buf); return { buf, rate, env, units: align(textUnits(text), env, a, b), dur: buf.duration / rate }; };

// ---------- synthesis ----------
const vKey = t => `${S.voice.engine}|${S.voice.preset}|${S.voice.pitch}|${S.voice.rate}|${t}`;
async function synth(text) {
  const ve = VOICES.find(x => x.id === S.voice.preset) || VOICES[0];
  for (const c of routeChain('tts')) {
    const r = await window.aether.fetch({ url: c.p.base.replace(/\/$/, '') + '/audio/speech', headers: c.p.apiKey ? { Authorization: 'Bearer ' + c.p.apiKey } : {}, timeout: Math.min(c.p.timeout, 7000), binary: true, json: { model: c.model || 'tts-1', input: text, voice: S.voice.remoteVoice, response_format: 'mp3' } });
    if (r.ok) return { data: b64Bytes(r.b64), rate: 1 };
  }
  if (S.voice.engine === 'cloud' && S.voice.googleKey) {
    const cl = ve.cloud, r = await window.aether.fetch({ url: 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(S.voice.googleKey), timeout: 7000,
      json: { input: { text }, voice: { languageCode: cl.lang, name: cl.name }, audioConfig: { audioEncoding: 'MP3', pitch: Math.max(-20, Math.min(20, cl.pitch + (S.voice.pitch - 1) * 10)), speakingRate: Math.max(.5, Math.min(2, cl.rate * S.voice.rate)) } } });
    if (r.ok) { try { return { data: b64Bytes(JSON.parse(r.text).audioContent), rate: 1 }; } catch {} }
  }
  const f = ve.free, r = await window.aether.fetch({ url: `https://translate.google.${f.tld}/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(text)}`, binary: true, timeout: 7000, headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (r.ok && r.b64) return { data: b64Bytes(r.b64), rate: f.speed * S.voice.rate * S.voice.pitch };
  return null;
}
function getItem(text) {
  const k = vKey(text); if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const p = (async () => { try { const s = await synth(text); if (!s) return null; const buf = await ac().decodeAudioData(s.data); return prep(buf, text, s.rate); } catch { return null; } })();
  cache.set(k, p); if (cache.size > 80) cache.delete(cache.keys().next().value);
  p.then(v => { if (!v && cache.get(k) === p) cache.delete(k); });
  return p;
}
// sentence chunks; the FIRST chunk is kept short so audio starts sooner
function chunks(text) {
  const clean = text.replace(/\s+/g, ' ').trim(), sents = clean.match(/[^.!?~]+[.!?~]*/g) || [clean], out = [];
  let first = true, cur = '';
  for (const s of sents) {
    if (first && s.length > 70) { const m = s.slice(0, 80).search(/[,;:](?!.*[,;:])/); const cut = m > 18 ? m + 1 : s.lastIndexOf(' ', 60); out.push(s.slice(0, cut > 10 ? cut : 60).trim()); out.push(s.slice(cut > 10 ? cut : 60).trim()); first = false; continue; }
    if ((cur + s).length > 170) { if (cur) out.push(cur.trim()); cur = s; } else cur += s; first = false;
  }
  if (cur.trim()) out.push(cur.trim()); return out.filter(x => x.length);
}
export function warmTTS() {   // pre-synthesize frequent short replies so they play instantly
  const phrases = ['Done!', 'Got it!', 'Okay!', 'All done!', 'On it!', 'Sure!', 'Yes?', "I'm listening!", 'There you go!', 'Opening that for you!', 'Scrolling!', 'Copied!', 'Hi there!'];
  let i = 0; const next = () => { if (i < phrases.length) { getItem(phrases[i++]).then(() => setTimeout(next, 250)); } }; setTimeout(next, 3000);
}

// ---------- playback ----------
function begin() { Voice.preparing = false; Voice.speaking = true; Voice.onStart?.(); }
function finish() { Voice.speaking = false; Voice.preparing = false; Voice.cur = null; Voice.level = 0; Voice.viseme = 'N'; Voice.lastEnd = Date.now(); Voice.onEnd?.(); }
export function stopSpeaking() { token++; try { curSrc?.stop(); } catch {} curSrc = null; if (Voice.speaking || Voice.preparing) finish(); }
function playItem(it, my) {
  return new Promise(res => {
    const ctx = ac(); const src = ctx.createBufferSource(); src.buffer = it.buf; src.playbackRate.value = Math.min(2, Math.max(.6, it.rate));
    const g = ctx.createGain(); g.gain.value = S.voice.volume; src.connect(g).connect(ctx.destination); curSrc = src;
    const t0 = ctx.currentTime + .02; Voice.cur = { t0, rate: it.rate, env: it.env, units: it.units, k: 0 }; src.onended = () => res(); src.start(t0);
    if (my !== token) { try { src.stop(); } catch {} res(); }
  });
}
function silentItem(text) { const units = textUnits(text), dur = Math.max(.8, text.length * .055), env = new Float32Array(Math.ceil(dur * 100)).map((_, i) => .55 + .35 * Math.abs(Math.sin(i / 11))); return { env, units: align(units, env, 0, env.length - 1), dur, rate: 1, silent: true }; }
export async function speak(text, emotion, opts = {}) {
  text = (text || '').replace(/[♪♥✦★*_`#]/g, '').trim(); if (!text) return;
  stopSpeaking(); const my = ++token; ac().resume?.(); Voice.preparing = true; Voice.onPrepare?.();
  const parts = chunks(text), items = parts.map(p => getItem(p)); let started = false;
  const startOnce = () => { if (!started) { started = true; begin(); opts.onStart?.(); } };
  for (let i = 0; i < parts.length; i++) {
    let it = await Promise.race([items[i], new Promise(r => setTimeout(() => r('late'), i === 0 ? 5000 : 8000))]);
    if (my !== token) return;
    if (it === 'late' || !it) { it = silentItem(parts[i]); startOnce(); const t0 = performance.now(); Voice.cur = { t0: ac().currentTime, rate: 1, env: it.env, units: it.units, k: 0 }; await new Promise(r => setTimeout(r, it.dur * 1000)); continue; }
    startOnce(); await playItem(it, my); if (my !== token) return;
  }
  if (my === token) finish();
}
// per-frame lip-sync sample from the audio clock
let lastLevel = 0;
Voice.sample = () => {
  const c = Voice.cur;
  if (!Voice.speaking || !c) { if (Voice.preparing) { Voice.level = .12 + .1 * Math.sin(performance.now() / 160); Voice.viseme = 'N'; } else Voice.level *= .7; return; }
  const t = Math.max(0, (ac().currentTime - c.t0)) * (c.rate || 1), i = Math.min(c.env.length - 1, Math.floor(t * 100));
  const lvl = c.env[i] || 0; Voice.level += (lvl - Voice.level) * .6; Voice.accent = Math.max(0, lvl - lastLevel) > .22 ? 1 : Voice.accent * .85; lastLevel = lvl;
  const u = c.units; let k = c.k || 0; while (k > 0 && u[k] && u[k].t0 > t) k--; while (k < u.length - 1 && u[k].t1 < t) k++; c.k = k;
  Voice.viseme = u[k] && t >= u[k].t0 - .02 && t <= u[k].t1 + .02 ? u[k].v : 'N'; if (Voice.level < .1) Voice.viseme = 'N';
};

// ---------------- always-on listening (accuracy-tuned) ----------------
export const Ear = { on: false, status: 'off', awakeUntil: 0, onText: null, onStatus: null, stream: null, shortOk: () => false };
const GREET = new Set(['hello', 'hi', 'hey', 'yo', 'ok', 'okay', 'hallo', 'hullo', 'helo', 'hay', 'aye']);
const PIXIE = new Set(['pixie', 'pixi', 'pixy', 'picky', 'pickie', 'pixel', 'pizzy', 'pitzi', 'piksi', 'fixie', 'pixies', 'pixiee', 'pitsy', 'pixey', 'pixxie', 'pissy']);
const JUNK = /^(thank you\.?|thanks for watching\.?|thanks for watching!?|you\.?|bye\.?|\.+|um+\.?|uh+\.?|so\.?|okay\.?|oh\.?|hmm+\.?|mm+\.?)$/i;
const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const isPixie = w => PIXIE.has(w) || 1 - lev(w, 'pixie') / Math.max(w.length, 5) >= .6;
function findWake(t) { const w = t.split(/\s+/).map(x => x.toLowerCase().replace(/[^a-z']/g, '')); for (let i = 0; i < w.length - 0; i++) { if (GREET.has(w[i]) && w[i + 1] && isPixie(w[i + 1])) return i + 2; if (i === 0 && isPixie(w[0])) return 1; } return -1; }
export const isWake = t => findWake(t) >= 0;
export const stripWake = t => { const k = findWake(t); return k < 0 ? t : t.split(/\s+/).slice(k).join(' ').replace(/^[,.!?\s-]+/, '').trim(); };
function setStatus(s) { Ear.status = s; Ear.onStatus?.(s); }
const wav = (f32, rate) => { const b = new ArrayBuffer(44 + f32.length * 2), v = new DataView(b), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + f32.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f32.length * 2, true);
  for (let i = 0; i < f32.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f32[i])) * 32767, true); return b; };
const toB64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
// clean-up before recognition: remove rumble (high-pass ~90 Hz) and normalise the level so quiet voices are recognised as well as loud ones
export function prepare(f, rate = 16000) {
  const a = Math.exp(-2 * Math.PI * 90 / rate), out = new Float32Array(f.length); let y = 0, x1 = 0, peak = 0;
  for (let i = 0; i < f.length; i++) { y = a * (y + f[i] - x1); x1 = f[i]; out[i] = y; const p = Math.abs(y); if (p > peak) peak = p; }
  const g = peak > .004 ? Math.min(10, .9 / peak) : 1; for (let i = 0; i < out.length; i++) out[i] *= g; return out;
}
const vocab = () => `Pixie. Hello Pixie. ${S.user}. Spotify, YouTube, Chrome, Notepad, WhatsApp, click, button, scroll, screenshot, timer, search. ${(S.macros || []).slice(0, 6).map(m => m.phrase).join('. ')}`.slice(0, 380);

export async function transcribe(buf) {
  const b64 = toB64(buf);
  for (const c of routeChain('stt')) {
    const fields = { model: c.model || 'whisper-large-v3-turbo', response_format: 'verbose_json', temperature: '0', prompt: vocab() }; if (S.lang && S.lang !== 'auto') fields.language = S.lang;
    const r = await window.aether.fetch({ url: c.p.base.replace(/\/$/, '') + '/audio/transcriptions', headers: c.p.apiKey ? { Authorization: 'Bearer ' + c.p.apiKey } : {}, timeout: Math.min(c.p.timeout, 8000), audioB64: b64, audioType: 'audio/wav', audioName: 'speech.wav', fields });
    if (!r.ok) continue;
    try { const j = JSON.parse(r.text); const segs = j.segments;
      if (Array.isArray(segs) && segs.length) { const keep = segs.filter(x => !(x.no_speech_prob > .6 || x.avg_logprob < -1.15 || x.compression_ratio > 2.6)); return keep.map(x => x.text).join(' ').trim(); }   // drop hallucinated / low-confidence segments
      return (j.text || '').trim(); } catch {}
  }
  return null;
}

export async function startEar() {
  if (Ear.on) return true;
  if (!routeChain('stt').length) { setStatus('needs-key'); return false; }
  try {
    const RATE = 16000, FR = 1024, ctx = new AudioContext({ sampleRate: RATE, latencyHint: 'interactive' });
    Ear.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const src = ctx.createMediaStreamSource(Ear.stream), proc = ctx.createScriptProcessor(FR, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination); Ear.on = true; Ear.ctx = ctx; setStatus('listening');
    let floor = .004, speech = [], pre = [], inSpeech = false, lastLoud = 0, startT = 0, busy = false, run = 0;
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0), now = performance.now(); let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i]; const rms = Math.sqrt(s / d.length);
      if (Voice.speaking || Date.now() - Voice.lastEnd < 450 || busy) { speech = []; inSpeech = false; run = 0; return; }
      const loud = rms > Math.max(.011, floor * 3); if (!loud) floor += (rms - floor) * .015; run = loud ? run + 1 : 0;
      const copy = new Float32Array(d);
      if (loud && run >= 2) { if (!inSpeech) { inSpeech = true; startT = now; speech = pre.slice(); } lastLoud = now; }
      if (inSpeech) { speech.push(copy); const silent = now - lastLoud; if (silent > (now - startT < 1600 ? 430 : 560) || now - startT > 12000) { const dur = lastLoud - startT; inSpeech = false; const chunk = speech; speech = []; if (dur > (Ear.shortOk() ? 160 : 300)) flush(chunk); } }
      else { pre.push(copy); if (pre.length > 8) pre.shift(); }
    };
    async function flush(chunk) {
      busy = true; setStatus('thinking'); Ear.onHeard?.();
      try { const n = chunk.reduce((a, c) => a + c.length, 0), all = new Float32Array(n); let o = 0; chunk.forEach(c => { all.set(c, o); o += c.length; });
        const text = await transcribe(wav(prepare(all, RATE), RATE)); if (text && !JUNK.test(text.trim())) Ear.onText?.(text.trim()); else { Ear.onMiss?.(); if (text === null) setStatus('error'); } } catch {}
      busy = false; if (Ear.on) setStatus('listening');
    }
    return true;
  } catch (e) { setStatus(/denied|NotAllowed/i.test(e.name + e.message) ? 'denied' : 'error'); return false; }
}
export function stopEar() { Ear.on = false; Ear.stream?.getTracks().forEach(t => t.stop()); Ear.ctx?.close(); setStatus('off'); }
