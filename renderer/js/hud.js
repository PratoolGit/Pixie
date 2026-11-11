import { drawGlove } from './glove.js';
// Full-screen click-through overlay: fingertip reticles with velocity lead + critically damped spring, pinch calipers,
// hand skeleton, frustum-edge warning glow, celebration particles, and highlight boxes for the screen-control agent.
const cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%'; document.body.appendChild(cv);
const g = cv.getContext('2d', { desynchronized: true, alpha: true });
let W = 0, H = 0; const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
let ptr = null, ptrAt = 0, hands = [], got = 0, hl = null, edge = [0, 0, 0, 0]; const spr = [{ x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, pvx: 0, pvy: 0, t: 0, init: false }, { x: 0, y: 0, vx: 0, vy: 0, px: 0, py: 0, pvx: 0, pvy: 0, t: 0, init: false }];
const parts = new Float32Array(120 * 7); let pn = 0; const kinds = ['♥', '✦', '●'];
function spawn(kind, x, y, n) { for (let i = 0; i < n; i++) { const o = (pn++ % 120) * 7, a = Math.random() * 6.28, s = 80 + Math.random() * 260; parts[o] = x; parts[o + 1] = y; parts[o + 2] = Math.cos(a) * s; parts[o + 3] = Math.sin(a) * s - 120; parts[o + 4] = 1.4; parts[o + 5] = kind; parts[o + 6] = 12 + Math.random() * 14; } }
let shocks = [];
window.aether.onHud(m => {
  if (m.t === 'hand') { hands = m.hands; got = performance.now(); m.hands.forEach((h, i) => { const s = spr[i], tx = (1 - h[16]) * W, ty = h[17] * H, now = performance.now(), dt = Math.max(.001, (now - s.t) / 1000);
    if (!s.init) { s.x = tx; s.y = ty; s.px = tx; s.py = ty; s.init = true; } const vx = (tx - s.px) / dt, vy = (ty - s.py) / dt; s.ax = (vx - s.pvx) / dt * .15; s.ay = (vy - s.pvy) / dt * .15; s.pvx = vx; s.pvy = vy; s.px = tx; s.py = ty; s.tx = tx; s.ty = ty; s.t = now; s.rx = now; });
    edge = [0, 0, 0, 0]; m.hands.forEach(h => { for (let i = 0; i < 21; i++) { const x = 1 - h[i * 2], y = h[i * 2 + 1]; if (x < .08) edge[0] = 1; if (x > .92) edge[1] = 1; if (y < .08) edge[2] = 1; if (y > .92) edge[3] = 1; } }); }
  else if (m.t === 'ptr') { ptr = m.on ? m : null; ptrAt = performance.now(); }
  else if (m.t === 'highlight') hl = { ...m.rect, label: m.label, at: performance.now() };
  else if (m.t === 'clear') hl = null;
  else if (m.t === 'fx') { const s = spr[0]; const x = m.at === 'center' ? W / 2 : s.x || W / 2, y = m.at === 'center' ? H / 2 : s.y || H / 2; if (m.kind === 'hearts') spawn(0, x, y, 24); else if (m.kind === 'confetti') { spawn(2, x, y, 40); shocks.push({ x, y, t: performance.now() }); } else spawn(1, x, y, 16); }
});
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; g.clearRect(0, 0, W, H);
  const live = now - got < 300;
  if (live) hands.forEach((h, i) => {
    const s = spr[i], lead = Math.min(.024, (now - s.rx) / 1000), px = s.tx + s.pvx * lead + .5 * (s.ax || 0) * lead * lead, py = s.ty + s.pvy * lead + .5 * (s.ay || 0) * lead * lead, w = 42, k = w * w, c = 2 * w;
    s.vx += (k * (px - s.x) - c * s.vx) * dt; s.vy += (k * (py - s.y) - c * s.vy) * dt; s.x += s.vx * dt; s.y += s.vy * dt;
    const P = j => [(1 - h[j * 2]) * W, h[j * 2 + 1] * H];
    drawGlove(g, Array.from({ length: 21 }, (_, j) => P(j)), { alpha: .88 });
    const a = P(4), b = P(8), palm = Math.hypot(a[0] - b[0], a[1] - b[1]) / (Math.hypot(P(0)[0] - P(9)[0], P(0)[1] - P(9)[1]) || 1);
    if (palm < .55) { g.strokeStyle = '#ff5c97'; g.lineWidth = 3; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.fillStyle = '#fff'; g.font = '700 13px Segoe UI'; g.fillText(Math.round(palm * 95) + ' mm', (a[0] + b[0]) / 2 + 8, (a[1] + b[1]) / 2 - 8);
      if (palm < .22) { g.strokeStyle = '#ffd45e'; for (let r = 0; r < 8; r++) { const an = r * Math.PI / 4; g.beginPath(); g.moveTo(b[0] + Math.cos(an) * 8, b[1] + Math.sin(an) * 8); g.lineTo(b[0] + Math.cos(an) * 20, b[1] + Math.sin(an) * 20); g.stroke(); } } }
    const sp = Math.hypot(s.vx, s.vy), tilt = Math.atan2(s.vy, s.vx), st = Math.min(.45, sp / 4000);
    if (ptr && now - ptrAt < 400) return;
    g.save(); g.translate(s.x, s.y); g.rotate(tilt); g.scale(1 + st, 1 - st * .5); g.strokeStyle = '#ff5c97'; g.shadowColor = '#ff9bd0'; g.shadowBlur = 14; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 18, 0, 6.28); g.stroke(); g.beginPath(); g.moveTo(-28, 0); g.lineTo(-10, 0); g.moveTo(10, 0); g.lineTo(28, 0); g.moveTo(0, -28); g.lineTo(0, -10); g.moveTo(0, 10); g.lineTo(0, 28); g.stroke(); g.restore();
  });
  const ec = ['left', 'right', 'top', 'bottom']; edge.forEach((on, i) => { if (!on) return; const gr = i < 2 ? g.createLinearGradient(i ? W : 0, 0, i ? W - 90 : 90, 0) : g.createLinearGradient(0, i === 3 ? H : 0, 0, i === 3 ? H - 90 : 90); gr.addColorStop(0, 'rgba(255,170,60,.7)'); gr.addColorStop(1, 'rgba(255,170,60,0)'); g.fillStyle = gr; g.fillRect(i === 1 ? W - 90 : 0, i === 3 ? H - 90 : 0, i < 2 ? 90 : W, i < 2 ? H : 90); });
  if (ptr && now - ptrAt < 400) {
    if (ptr.snap) { g.save(); g.strokeStyle = '#ff4f94'; g.lineWidth = 3; g.shadowColor = '#ff9bd0'; g.shadowBlur = 14; g.fillStyle = 'rgba(255,120,170,.16)'; g.beginPath(); g.roundRect(ptr.snap.x - 4, ptr.snap.y - 4, ptr.snap.w + 8, ptr.snap.h + 8, 10); g.fill(); g.stroke(); g.restore(); }
    g.save(); g.translate(ptr.x, ptr.y); g.shadowColor = '#ff9bd0'; g.shadowBlur = 16; g.fillStyle = ptr.down ? '#ff4f94' : 'rgba(255,255,255,.92)'; g.strokeStyle = '#e56f9d'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, ptr.down ? 9 : 15, 0, 6.3); g.fill(); g.stroke();
    if (!ptr.down) { g.beginPath(); g.arc(0, 0, 3, 0, 6.3); g.fillStyle = '#e56f9d'; g.fill(); } g.restore();
    if (ptr.label) { g.font = '700 13px Segoe UI'; const t = ptr.label.slice(0, 34), tw = g.measureText(t).width + 16; g.fillStyle = '#ff4f94'; g.beginPath(); g.roundRect(ptr.x + 18, ptr.y + 14, tw, 24, 12); g.fill(); g.fillStyle = '#fff'; g.fillText(t, ptr.x + 26, ptr.y + 31); }
  }
  if (hl) { const pul = 1 + Math.sin(now / 160) * .04, pad = 6; g.save(); g.lineWidth = 4; g.strokeStyle = '#ff4f94'; g.shadowColor = '#ff9bd0'; g.shadowBlur = 18; g.fillStyle = 'rgba(255,120,170,.14)'; const x = hl.x - pad, y = hl.y - pad, w = hl.w + pad * 2, h = hl.h + pad * 2;
    g.beginPath(); g.roundRect(x - (pul - 1) * w / 2, y - (pul - 1) * h / 2, w * pul, h * pul, 10); g.fill(); g.stroke(); g.shadowBlur = 0; if (hl.label) { g.font = '700 14px Segoe UI'; const tw = g.measureText(hl.label.slice(0, 40)).width + 16; g.fillStyle = '#ff4f94'; g.beginPath(); g.roundRect(x, Math.max(2, y - 28), tw, 24, 12); g.fill(); g.fillStyle = '#fff'; g.fillText(hl.label.slice(0, 40), x + 8, Math.max(2, y - 28) + 17); } g.restore(); }
  shocks = shocks.filter(s => now - s.t < 800); shocks.forEach(s => { const p = (now - s.t) / 800, r = p * Math.max(W, H) * .6; [['rgba(255,60,60,', 0], ['rgba(60,255,120,', 4], ['rgba(80,120,255,', 8]].forEach(([c, o]) => { g.strokeStyle = c + (1 - p) * .6 + ')'; g.lineWidth = 4; g.beginPath(); g.arc(s.x, s.y, r + o, 0, 6.28); g.stroke(); }); });
  for (let i = 0; i < 120; i++) { const o = i * 7; if (parts[o + 4] <= 0) continue; parts[o + 4] -= dt; parts[o + 3] += 380 * dt; parts[o] += parts[o + 2] * dt; parts[o + 1] += parts[o + 3] * dt; g.globalAlpha = Math.max(0, parts[o + 4]); g.fillStyle = ['#ff6b9a', '#ffd45e', '#8fd8ff'][i % 3]; g.font = parts[o + 6] + 'px sans-serif'; g.fillText(kinds[parts[o + 5]], parts[o], parts[o + 1]); g.globalAlpha = 1; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
