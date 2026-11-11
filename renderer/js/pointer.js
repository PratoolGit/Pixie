// Air touch: point with your index finger to aim a real cursor, pinch to click, hold the pinch to drag.
// The aim point is latched ~110 ms before the pinch closes (so the pinch itself never moves the click),
// and it is magnetically pulled onto the nearest real UI element found through Windows UI Automation.
import { S } from './store.js';
import { on, OneEuro, Vision } from './vision.js';

export const Pointer = { active: false, x: 0, y: 0, snap: null, down: false, label: '' };
const SW = () => screen.width, SH = () => screen.height;
const fx = new OneEuro(1.4, .012), fy = new OneEuro(1.4, .012);
let hist = [], pinching = false, pinchT = 0, dragging = false, lastSend = 0, lastScan = 0, els = [], scanning = false, lostAt = 0, latched = null, clickPending = false;
const send = (cmd, x, y) => window.aether?.ptr?.(cmd, x, y);

async function rescan() {
  if (scanning || !S.airSnap) return; scanning = true; lastScan = performance.now();
  try { const r = await window.aether.agent('scan', { focus: false }); els = r.ok ? (r.els || []).filter(e => e.w > 8 && e.h > 8 && e.w < SW() * .8) : []; } catch { els = []; }
  scanning = false;
}
function snapTo(x, y) {
  let best = null, bd = 1e9;
  for (const e of els) { const cx = e.x + e.w / 2, cy = e.y + e.h / 2, inside = x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h, d = inside ? Math.hypot(cx - x, cy - y) * .3 : Math.hypot(cx - x, cy - y) - Math.min(e.w, e.h) * .3;
    if ((inside || d < 70) && d < bd) { bd = d; best = e; } }
  return best;
}
function hud(extra) { if (S.hud) window.aether.hudSend({ t: 'ptr', ...extra }); }
function release() { if (Pointer.active) { Pointer.active = false; if (dragging) send('up'); dragging = false; pinching = false; Pointer.down = false; hud({ on: false }); } }

on('hand_frame', e => {
  if (!S.airPointer) return; const now = performance.now(), lm = e.lms?.[0], inf = e.info?.[0];
  if (!lm || !inf) { if (Pointer.active && now - lostAt > 500) release(); if (!lostAt) lostAt = now; return; } lostAt = 0;
  const pointPose = inf.ext[1] && !inf.ext[2] && !inf.ext[3] && !inf.ext[4], keep = Pointer.active && (pinching || inf.pinch < .5);
  if (!pointPose && !keep) { release(); return; }
  if (!Pointer.active) { Pointer.active = true; fx.t = null; fy.t = null; if (now - lastScan > 600) rescan(); }
  // aim = index fingertip (before pinch) mapped from the central 76% of the camera view to the whole screen, mirrored
  const tip = lm[8], nx = Math.min(1, Math.max(0, (1 - tip.x - .12) / .76)), ny = Math.min(1, Math.max(0, (tip.y - .12) / .76));
  let x = fx.filter(nx * SW(), now), y = fy.filter(ny * SH(), now);
  hist.push({ t: now, x, y }); while (hist.length && now - hist[0].t > 260) hist.shift();
  const closing = inf.pinch < .45;
  if (closing && !latched) { const h = hist.find(p => now - p.t < 130) || hist[0]; latched = { x: h.x, y: h.y }; }
  if (!closing) latched = null;
  const ax = latched ? latched.x : x, ay = latched ? latched.y : y;
  const el = snapTo(ax, ay); let px = ax, py = ay;
  if (el) { const cx = el.x + el.w / 2, cy = el.y + el.h / 2; px = ax + (cx - ax) * .7; py = ay + (cy - ay) * .7; }
  Pointer.x = px; Pointer.y = py; Pointer.snap = el; Pointer.label = el?.n || '';
  if (now - lastSend > 24 && !dragging) { lastSend = now; send('move', Math.round(px), Math.round(py)); }
  if (dragging && now - lastSend > 24) { lastSend = now; send('move', Math.round(px), Math.round(py)); }
  // pinch state machine: quick pinch = click, held pinch = drag
  if (inf.pinch < .26 && !pinching) { pinching = true; pinchT = now; Pointer.down = true; }
  if (pinching && !dragging && now - pinchT > 380 && inf.pinch < .3) { dragging = true; send('down', Math.round(px), Math.round(py)); }
  if (pinching && inf.pinch > .36) { pinching = false; Pointer.down = false; if (dragging) { dragging = false; send('up'); } else if (now - pinchT < 380) { send('click', Math.round(px), Math.round(py)); window.dispatchEvent(new CustomEvent('pixie-air-click', { detail: { x: px, y: py, label: Pointer.label } })); } }
  if (now - lastScan > 3200 && !pinching) rescan();
  hud({ on: true, x: px, y: py, down: Pointer.down || dragging, snap: el ? { x: el.x, y: el.y, w: el.w, h: el.h } : null, label: Pointer.label });
});
