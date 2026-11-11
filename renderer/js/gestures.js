// Gesture bindings: built-in cues (winks, blinks, nods, hand poses) and custom recorded gestures matched with
// Sakoe-Chiba banded DTW (N=32, band 6) over a hand+face feature stream. Each binding runs a configurable action.
import { S, save } from './store.js';
import { on, Vision } from './vision.js';
import { runBinding, say } from './router.js';
const N = 32, BAND = 6, RING = 240;
export const TRIGGERS = [['wink_left', 'Wink left eye'], ['wink_right', 'Wink right eye'], ['double_blink', 'Double blink'], ['brow_raise', 'Raise eyebrows'], ['mouth_open', 'Open mouth'], ['head_nod', 'Nod (yes)'], ['head_shake', 'Shake head (no)'],
  ['open_palm', 'Open palm'], ['peace', 'Peace sign'], ['thumbs_up', 'Thumbs up'], ['finger_heart', 'Finger heart'], ['high_five', 'High five'], ['point', 'Point finger']];
export const ACTIONS = [['open', 'Open app / site'], ['command', 'Run a command'], ['url', 'Open URL'], ['say', 'Say aloud'], ['key', 'Press keys'], ['emotion', 'Show emotion'], ['webhook', 'Call webhook']];
export const triggerLabel = id => (TRIGGERS.find(t => t[0] === id) || [0, id])[1];
export const Rec = { state: 'idle', name: '', action: null, samples: [], msg: '', count: 0 };
export const Live = {};
const feat = new Float32Array(RING * 16), times = new Float64Array(RING); let head = 0, fill = 0;
const D = new Float64Array(N * N);

// ---- feature frame: 8 face dims + 8 hand dims, each scaled to roughly [-1, 1] ----
function frame(h, now) {
  const f = Vision.faceFeat, o = head * 16; times[head] = now;
  feat[o] = (f[0] - 1) * 2.5; feat[o + 1] = (f[1] - 1) * 2.5; feat[o + 2] = f[2] * 2; feat[o + 3] = (f[3] - 1) * 4; feat[o + 4] = (f[4] - 1) * 4; feat[o + 5] = (f[5] - 1) * 4; feat[o + 6] = f[6] * 4; feat[o + 7] = f[7] * 4;
  const lm = h?.[0], p = lm ? 1 : 0; feat[o + 8] = p;
  if (lm) { const palm = Math.hypot((lm[0].x - lm[9].x) * 640, (lm[0].y - lm[9].y) * 480) || 1; feat[o + 9] = (lm[8].x - .5) * 2; feat[o + 10] = (lm[8].y - .5) * 2; feat[o + 11] = Math.hypot((lm[4].x - lm[8].x) * 640, (lm[4].y - lm[8].y) * 480) / palm;
    feat[o + 12] = (lm[0].x - .5) * 2; feat[o + 13] = (lm[0].y - .5) * 2; feat[o + 14] = palm / 240; feat[o + 15] = ([8, 12, 16, 20].filter(t => Math.hypot((lm[t].x - lm[0].x) * 640, (lm[t].y - lm[0].y) * 480) > Math.hypot((lm[t - 2].x - lm[0].x) * 640, (lm[t - 2].y - lm[0].y) * 480) * 1.04).length) / 2; }
  else for (let i = 9; i < 16; i++) feat[o + i] = 0;
  head = (head + 1) % RING; fill = Math.min(RING, fill + 1);
}
function window_(ms, now) { const out = []; for (let i = 0; i < fill; i++) { const k = (head - 1 - i + RING) % RING; if (now - times[k] > ms) break; out.push(k); } return out.reverse(); }
function resample(idx, ts) { // linear interpolation over time into N equidistant frames
  const out = new Float32Array(N * 16), t0 = times[idx[0]], t1 = times[idx[idx.length - 1]] || t0 + 1;
  for (let i = 0; i < N; i++) { const t = t0 + (t1 - t0) * i / (N - 1); let j = 0; while (j < idx.length - 2 && times[idx[j + 1]] < t) j++; const a = idx[j], b = idx[Math.min(j + 1, idx.length - 1)], w = times[b] === times[a] ? 0 : Math.min(1, Math.max(0, (t - times[a]) / (times[b] - times[a])));
    for (let d = 0; d < 16; d++) out[i * 16 + d] = feat[a * 16 + d] * (1 - w) + feat[b * 16 + d] * w; }
  return out;
}
export function dtw(a, b) {
  D.fill(Infinity);
  for (let i = 0; i < N; i++) for (let j = Math.max(0, i - BAND); j <= Math.min(N - 1, i + BAND); j++) {
    let s = 0; for (let d = 0; d < 16; d++) { const x = a[i * 16 + d] - b[j * 16 + d]; s += x * x; } const c = Math.sqrt(s);
    const best = i === 0 && j === 0 ? 0 : Math.min(i > 0 ? D[(i - 1) * N + j] : Infinity, j > 0 ? D[i * N + j - 1] : Infinity, i > 0 && j > 0 ? D[(i - 1) * N + j - 1] : Infinity);
    D[i * N + j] = c + best;
  }
  return D[N * N - 1];
}
const motion = r => { let m = 0; for (let d = 0; d < 16; d++) { let mn = 1e9, mx = -1e9; for (let i = 0; i < N; i++) { const v = r[i * 16 + d]; mn = Math.min(mn, v); mx = Math.max(mx, v); } m += mx - mn; } return m; };

// ---- recording: countdown, 2.6 s capture, trim to the active segment, 3 samples -> template ----
export function startRecording(name, action) { Rec.state = 'ready'; Rec.name = name; Rec.action = action; Rec.samples = []; Rec.msg = 'Press "Record sample 1 of 3", then perform your gesture after the countdown.'; }
export async function recordSample() {
  if (!Vision.running) { Rec.msg = 'Turn the camera on first.'; return false; }
  for (let c = 3; c > 0; c--) { Rec.state = 'count'; Rec.msg = `Get ready… ${c}`; await new Promise(r => setTimeout(r, 800)); }
  Rec.state = 'rec'; Rec.msg = 'Go! Do your gesture now…'; const t0 = performance.now(); await new Promise(r => setTimeout(r, 2600));
  const idx = window_(2800, performance.now()); if (idx.length < 12) { Rec.state = 'ready'; Rec.msg = 'I could not see enough frames. Try again.'; return false; }
  // active segment = frames that deviate from the first 300 ms baseline
  const base = new Float32Array(16); const nb = Math.max(1, idx.filter(k => times[k] - times[idx[0]] < 300).length); for (let d = 0; d < 16; d++) { for (let i = 0; i < nb; i++) base[d] += feat[idx[i] * 16 + d] / nb; }
  const act = idx.map(k => { let s = 0; for (let d = 0; d < 16; d++) s += Math.abs(feat[k * 16 + d] - base[d]); return s; }), thr = .45; let a0 = act.findIndex(v => v > thr), a1 = act.length - 1 - [...act].reverse().findIndex(v => v > thr);
  if (a0 < 0 || a1 - a0 < 3) { Rec.state = 'ready'; Rec.msg = 'I did not see a clear movement. Make the gesture bigger and try again.'; return false; }
  a0 = Math.max(0, a0 - 2); a1 = Math.min(idx.length - 1, a1 + 2); const seg = idx.slice(a0, a1 + 1);
  Rec.samples.push({ r: resample(seg), dur: times[seg[seg.length - 1]] - times[seg[0]] });
  if (Rec.samples.length < 3) { Rec.state = 'ready'; Rec.msg = `Sample ${Rec.samples.length} saved. Record sample ${Rec.samples.length + 1} of 3.`; return true; }
  const tpl = new Float32Array(N * 16); Rec.samples.forEach(s => { for (let i = 0; i < tpl.length; i++) tpl[i] += s.r[i] / 3; });
  const maxd = Math.max(...Rec.samples.map(s => dtw(s.r, tpl))), dur = Rec.samples.reduce((a, s) => a + s.dur, 0) / 3;
  S.bindings.push({ id: 'b' + Date.now(), kind: 'dtw', label: Rec.name || 'Custom gesture', template: Array.from(tpl), tau: maxd * 2.4 + .5, dur, motion: motion(tpl), action: Rec.action }); save();
  Rec.state = 'idle'; Rec.msg = `Saved "${Rec.name}"! Perform it any time and I'll react.`; Vision.faceEvery = 2; return true;
}
export function cancelRecording() { Rec.state = 'idle'; Rec.msg = ''; }

// ---- live matching every 120 ms ----
let lastEval = 0, cool = 0;
function evaluate(now) {
  const bs = S.bindings.filter(b => b.kind === 'dtw'); if (!bs.length || fill < 12) return;
  for (const b of bs) {
    const idx = window_(b.dur * 1.25 + 150, now); if (idx.length < 10) { Live[b.id] = 0; continue; }
    const r = resample(idx), tpl = Float32Array.from(b.template); let conf = 0;
    if (motion(r) > b.motion * .45) conf = Math.max(0, 100 * (1 - dtw(r, tpl) / b.tau));
    Live[b.id] = conf; if (conf >= 58 && now > cool) { cool = now + 2000; fire(b); }
  }
}
function fire(b) { runBinding(b.action); }
on('hand_frame', e => { const now = performance.now(); frame(e.lms, now); if (now - lastEval > 120) { lastEval = now; evaluate(now); } });
on('cue', ({ name }) => S.bindings.filter(b => b.trigger === name).forEach(fire));
on('gesture', ({ name }) => S.bindings.filter(b => b.trigger === name).forEach(fire));
export const hasBinding = n => S.bindings.some(b => b.trigger === n);
export function addBinding(trigger, action) { S.bindings = S.bindings.filter(b => b.trigger !== trigger); S.bindings.push({ id: 'b' + Date.now(), kind: 'builtin', trigger, action }); if (/wink|blink|brow|mouth|head/.test(trigger)) Vision.faceEvery = 2; save(); }
export const removeBinding = id => { S.bindings = S.bindings.filter(b => b.id !== id); save(); };
