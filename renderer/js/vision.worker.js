// Background vision worker: MediaPipe runs here so the UI thread never blocks.
// Frames arrive as transferred ImageBitmaps (zero-copy); results go back as plain arrays.
let hand = null, face = null;
const plain = l => l.map(p => ({ x: p.x, y: p.y, z: p.z }));
self.onmessage = async e => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      self.exports = {};
      importScripts(m.base + 'vision_bundle.cjs');
      const mod = self.exports;
      const files = await mod.FilesetResolver.forVisionTasks(m.base + 'wasm');
      const make = async (Klass, file, extra) => {
        for (const delegate of ['GPU', 'CPU']) {
          try { return await Klass.createFromOptions(files, { baseOptions: { modelAssetPath: m.base + 'models/' + file, delegate }, runningMode: 'VIDEO', ...extra }); }
          catch (err) { if (delegate === 'CPU') throw err; }
        }
      };
      hand = await make(mod.HandLandmarker, 'hand_landmarker.task', { numHands: 2, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      face = await make(mod.FaceLandmarker, 'face_landmarker.task', { numFaces: 1 });
      postMessage({ type: 'ready' });
    } catch (err) { postMessage({ type: 'error', error: String((err && err.message) || err) }); }
    return;
  }
  if (m.type === 'frame') {
    const t0 = performance.now();
    try {
      const hr = hand.detectForVideo(m.bm, m.ts);
      let fl = null;
      if (m.face) { const fr = face.detectForVideo(m.bm, m.ts + 0.5); fl = fr.faceLandmarks && fr.faceLandmarks[0] ? plain(fr.faceLandmarks[0]) : null; }
      m.bm.close();
      postMessage({ type: 'result', hands: (hr.landmarks || []).map(plain), worlds: (hr.worldLandmarks || []).map(plain), handed: (hr.handedness || []).map(h => h[0] && h[0].categoryName), faceRun: !!m.face, face: fl, ms: performance.now() - t0, t: m.t });
    } catch (err) { try { m.bm.close(); } catch {} postMessage({ type: 'frameerror', error: String((err && err.message) || err) }); }
  }
};
