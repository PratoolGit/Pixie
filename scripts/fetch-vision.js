// Copies the MediaPipe runtime out of node_modules and downloads the two model files,
// so the packaged app works fully offline. Failure is non-fatal: the app falls back
// to the on-screen simulator if the vision files are missing.
const fs = require('fs'), path = require('path'), https = require('https');
const root = path.join(__dirname, '..', 'renderer', 'vendor');
const pkg = path.join(__dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision');
fs.mkdirSync(path.join(root, 'models'), { recursive: true });
try {
  fs.copyFileSync(path.join(pkg, 'vision_bundle.mjs'), path.join(root, 'vision_bundle.mjs'));
  fs.copyFileSync(path.join(pkg, 'vision_bundle.cjs'), path.join(root, 'vision_bundle.cjs'));
  fs.cpSync(path.join(pkg, 'wasm'), path.join(root, 'wasm'), { recursive: true });
  console.log('[aether] MediaPipe runtime copied');
} catch (e) { console.warn('[aether] could not copy MediaPipe runtime:', e.message); }

const base = 'https://storage.googleapis.com/mediapipe-models/';
const models = {
  'hand_landmarker.task': base + 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'face_landmarker.task': base + 'face_landmarker/face_landmarker/float16/1/face_landmarker.task'
};
function get(url, dest, redirects = 5) {
  return new Promise((res, rej) => {
    https.get(url, r => {
      if ([301, 302, 307].includes(r.statusCode) && redirects) return get(r.headers.location, dest, redirects - 1).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      const f = fs.createWriteStream(dest); r.pipe(f); f.on('finish', () => f.close(res));
    }).on('error', rej);
  });
}
(async () => {
  for (const [name, url] of Object.entries(models)) {
    const dest = path.join(root, 'models', name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) continue;
    try { await get(url, dest); console.log('[aether] downloaded', name); }
    catch (e) { console.warn('[aether] model download failed for', name, e.message); }
  }
})();
