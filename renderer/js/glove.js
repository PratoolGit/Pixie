// Cute paw-glove hand renderer (replaces the skeleton). P = 21 [x, y] points in canvas pixels.
const CH = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const FW = [.36, .31, .32, .3, .26];
export function drawGlove(g, P, o = {}) {
  const dx = P[9][0] - P[0][0], dy = P[9][1] - P[0][1], s = (Math.hypot(dx, dy) || 1) * (o.scale || 1), a = Math.atan2(dy, dx);
  g.save(); g.globalAlpha = o.alpha ?? .93; g.lineCap = 'round'; g.lineJoin = 'round';
  const pal = [0, 1, 2, 5, 9, 13, 17], ol = Math.max(1.5, s * .07);
  for (const pass of [0, 1]) {
    const col = pass ? '#fff4f9' : '#e56f9d', add = pass ? 0 : ol * 2;
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = s * .2 + add; g.beginPath(); pal.forEach((i, k) => k ? g.lineTo(P[i][0], P[i][1]) : g.moveTo(P[i][0], P[i][1])); g.closePath(); g.fill(); g.stroke();
    CH.forEach((ch, fi) => {
      const pts = fi === 0 ? [P[1], P[2], P[3], P[4]] : [P[ch[0]], P[ch[1]], P[ch[2]], P[ch[3]]];
      for (let k = 0; k < 3; k++) { g.strokeStyle = col; g.lineWidth = s * FW[fi] * (1 - k * .08) * .62 + add; g.beginPath(); g.moveTo(pts[k][0], pts[k][1]); g.lineTo(pts[k + 1][0], pts[k + 1][1]); g.stroke(); }
    });
  }
  // soft shading, seams, knuckles, fingertip shine
  g.strokeStyle = 'rgba(244,160,196,.55)'; g.lineWidth = Math.max(1, s * .02);
  [[5, 9], [9, 13], [13, 17]].forEach(([i, j]) => { g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo((P[i][0] + P[0][0]) / 2 * .35 + P[i][0] * .65, (P[i][1] + P[0][1]) / 2 * .35 + P[i][1] * .65); g.stroke(); });
  CH.forEach((ch, fi) => { const w = s * FW[fi] * .62; [1, 2].forEach(k => { const p = fi === 0 ? P[[1, 2, 3, 4][k]] : P[ch[k]]; g.fillStyle = 'rgba(255,214,232,.8)'; g.beginPath(); g.arc(p[0], p[1], w * .22, 0, 6.3); g.fill(); });
    const t = P[ch[3]]; g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(t[0] - s * .02, t[1] - s * .03, s * .05, s * .035, a, 0, 6.3); g.fill(); });
  // paw pad on the palm + toe beans
  const cx = (P[0][0] + P[5][0] + P[17][0] + P[9][0]) / 4, cy = (P[0][1] + P[5][1] + P[17][1] + P[9][1]) / 4;
  g.fillStyle = '#ffb6d0'; g.beginPath(); g.ellipse(cx, cy, s * .2, s * .16, a, 0, 6.3); g.fill();
  [5, 9, 13].forEach(i => { g.beginPath(); g.arc((P[i][0] * 2 + cx) / 3, (P[i][1] * 2 + cy) / 3, s * .06, 0, 6.3); g.fill(); });
  // cuff with a little bow
  g.save(); g.translate(P[0][0], P[0][1]); g.rotate(a + Math.PI); g.fillStyle = '#ff8fb9'; g.strokeStyle = '#e56f9d'; g.lineWidth = ol; g.beginPath(); g.roundRect(-s * .12, -s * .46, s * .5, s * .92, s * .14); g.fill(); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.roundRect(s * .06, -s * .46, s * .08, s * .92, s * .03); g.fill(); g.restore();
  g.restore();
}
