// Cherry-blossom background: only drifting sakura petals (no tree, branches or leaves). Soft depth, flutter, wind and gusts.
let wind = 0, gustPower = 0, bgOn = true; export const setBgActive = v => { bgOn = v; };
export function gust(p = 1) { gustPower = Math.min(3, gustPower + p); }
function petalSprite(size, c1, c2) {
  const cv = document.createElement('canvas'); cv.width = cv.height = Math.ceil(size * 2.4); const g = cv.getContext('2d'), s = size; g.translate(cv.width / 2, cv.height / 2);
  const gr = g.createLinearGradient(0, -s, 0, s * .9); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.beginPath(); g.moveTo(0, s * .95); g.bezierCurveTo(-s * 1.05, s * .25, -s * .95, -s * .85, -s * .16, -s * .95); g.lineTo(0, -s * .72); g.lineTo(s * .16, -s * .95); g.bezierCurveTo(s * .95, -s * .85, s * 1.05, s * .25, 0, s * .95); g.closePath();
  g.fillStyle = gr; g.fill(); g.lineWidth = Math.max(.6, s * .05); g.strokeStyle = 'rgba(240,130,170,.45)'; g.stroke();
  g.beginPath(); g.moveTo(0, s * .8); g.quadraticCurveTo(0, 0, 0, -s * .55); g.strokeStyle = 'rgba(240,130,170,.3)'; g.stroke(); return cv;
}
export function startBackground(cv) {
  const g = cv.getContext('2d', { alpha: true }); let W, H; const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; }; fit(); addEventListener('resize', fit);
  const cols = [['#fff3f7', '#ffc2d6'], ['#ffe6ef', '#ffa9c6'], ['#ffd9e6', '#ff93b8'], ['#fff9fb', '#ffd0df']];
  const sprites = []; [12, 17, 23, 30].forEach((s, i) => cols.forEach(c => sprites.push({ cv: petalSprite(s, c[0], c[1]), s, depth: i })));
  const mk = init => { const sp = sprites[(Math.random() * sprites.length) | 0], d = sp.depth;
    return { sp, x: Math.random() * (W + 200) - 100, y: init ? Math.random() * H : -40 - Math.random() * 200, vy: 22 + d * 9 + Math.random() * 16, ph: Math.random() * 6.28, rs: (Math.random() - .5) * 1.6, rot: Math.random() * 6.28, fl: Math.random() * 6.28, fs: 1.2 + Math.random() * 2, sw: 14 + Math.random() * 26, a: .55 + d * .1 }; };
  const P = Array.from({ length: Math.min(60, Math.round(innerWidth / 22)) }, () => mk(true));
  const glows = Array.from({ length: 5 }, () => ({ x: Math.random(), y: Math.random(), r: 90 + Math.random() * 150, ph: Math.random() * 6.28 }));
  let last = performance.now();
  const loop = now => {
    requestAnimationFrame(loop); if (!bgOn) return; const dt = Math.min(.05, (now - last) / 1000); if (dt < .015) return; last = now;
    gustPower *= Math.pow(.35, dt); wind = Math.sin(now / 4200) * 28 + Math.sin(now / 1700) * 12 + gustPower * 120;
    g.clearRect(0, 0, W, H);
    for (const q of glows) { const x = (q.x + Math.sin(now / 9000 + q.ph) * .05) * W, y = (q.y + Math.cos(now / 11000 + q.ph) * .05) * H, gr = g.createRadialGradient(x, y, 0, x, y, q.r); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - q.r, y - q.r, q.r * 2, q.r * 2); }
    for (const p of P) {
      p.y += (p.vy + gustPower * 18) * dt; p.x += (wind * (.35 + p.sp.depth * .18) + Math.sin(now / 1000 * p.fs + p.ph) * p.sw) * dt; p.rot += (p.rs + wind * .004) * dt; p.fl += p.fs * dt;
      if (p.y > H + 40 || p.x < -120 || p.x > W + 120) Object.assign(p, mk(false), { x: Math.random() * (W + 200) - 100 });
      const c = Math.cos(p.fl); g.setTransform(Math.cos(p.rot) * (.35 + Math.abs(c) * .65), Math.sin(p.rot) * (.35 + Math.abs(c) * .65), -Math.sin(p.rot), Math.cos(p.rot), p.x, p.y);
      g.globalAlpha = p.a * (.7 + Math.abs(c) * .3); g.drawImage(p.sp.cv, -p.sp.cv.width / 2, -p.sp.cv.height / 2);
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  };
  requestAnimationFrame(loop);
}
