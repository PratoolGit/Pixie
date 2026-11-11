// Lightweight geometric face unlock: 32 scale-invariant ratios from the face mesh, 3-pose enrollment saved in IndexedDB.
// This is a convenience greeting, not secure authentication.
import { S } from './store.js';
import { on, emit } from './vision.js';
const W = 640, H = 480;
const PAIRS = [[33, 133], [362, 263], [159, 145], [386, 374], [168, 1], [1, 2], [2, 0], [0, 17], [61, 291], [17, 152], [152, 10], [234, 454], [93, 323], [132, 361], [58, 288], [172, 397], [152, 58], [152, 288], [105, 159], [334, 386], [107, 336], [55, 285], [168, 10], [1, 152], [1, 10], [48, 278], [4, 168], [129, 358], [205, 425], [50, 280], [116, 345], [21, 251]];
export function vector(lm) {
  const P = i => [lm[i].x * W, lm[i].y * H, lm[i].z * W], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], ipd = dist(mid(P(33), P(133)), mid(P(362), P(263))) || 1;
  return PAIRS.map(([a, b]) => dist(P(a), P(b)) / ipd);
}
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('pixie-faceid', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kvGet = async k => { const db = await idb(); return new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); };
const kvSet = async (k, v) => { const db = await idb(); return new Promise(res => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; }); };
const mean = vs => vs[0].map((_, i) => vs.reduce((a, v) => a + v[i], 0) / vs.length);
export const POSES = ['Front, neutral', 'Slight smile', 'Slight turn'];
export const FaceID = { poses: [null, null, null], centroid: null, score: 0, verified: false, capturing: -1, progress: 0 };
let cap = [], resolve = null, buf = [], hits = 0, last = 0, lastWelcome = 0;
export async function loadFaceID() { const d = await kvGet('enrolled'); if (d) { FaceID.poses = d.poses; FaceID.centroid = d.centroid; } }
const persist = () => kvSet('enrolled', { poses: FaceID.poses, centroid: FaceID.centroid });
export function enrollPose(i) {
  return new Promise(res => { cap = []; FaceID.capturing = i; FaceID.progress = 0; resolve = res; setTimeout(() => { if (FaceID.capturing === i) { FaceID.capturing = -1; res(false); } }, 8000); });
}
export async function clearFaceID() { FaceID.poses = [null, null, null]; FaceID.centroid = null; FaceID.verified = false; await kvSet('enrolled', null); }
const similarity = (a, b) => Math.max(0, 1 - a.reduce((s, v, i) => s + Math.abs(v - b[i]) / b[i], 0) / a.length / .15);
on('face_lm', lm => {
  const v = vector(lm); last = performance.now();
  if (FaceID.capturing >= 0) { cap.push(v); FaceID.progress = cap.length / 8; if (cap.length >= 8) { const i = FaceID.capturing; FaceID.poses[i] = mean(cap); FaceID.capturing = -1; if (FaceID.poses.every(Boolean)) FaceID.centroid = mean(FaceID.poses); persist(); resolve?.(true); } return; }
  if (!FaceID.centroid) return;
  buf.push(v); if (buf.length > 6) buf.shift(); FaceID.score = similarity(mean(buf), FaceID.centroid);
  const ok = FaceID.score >= S.faceId.threshold; hits = ok ? hits + 1 : 0;
  if (hits >= 3 && !FaceID.verified) { FaceID.verified = true; if (Date.now() - lastWelcome > 600000) { lastWelcome = Date.now(); emit('face_verified'); } }
  if (FaceID.verified && FaceID.score < S.faceId.threshold - .08) { FaceID.verified = false; hits = 0; }
});
setInterval(() => { if (FaceID.verified && performance.now() - last > 3000) { FaceID.verified = false; hits = 0; buf = []; } }, 1000);
