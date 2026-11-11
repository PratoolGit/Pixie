// Settings, provider vault and task routing. Persisted through the main process (keys encrypted).
export const PRESETS = [
  { id: 'offline', name: 'Local Offline Engine', base: '', builtin: true, models: [] },
  { id: 'freellm', name: 'FreeLLMAPI Router', base: 'http://localhost:8080/v1', models: ['auto'] },
  { id: 'hf', name: 'Hugging Face Router', base: 'https://router.huggingface.co/v1', models: ['meta-llama/Llama-3.3-70B-Instruct'] },
  { id: 'groq', name: 'Groq Cloud (free tier)', base: 'https://api.groq.com/openai/v1', hint: 'Free key at console.groq.com. Also powers speech recognition (Whisper).', models: ['llama-3.3-70b-versatile', 'whisper-large-v3-turbo', 'meta-llama/llama-4-scout-17b-16e-instruct'] },
  { id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', models: ['meta-llama/llama-3.3-70b-instruct:free'] },
  { id: 'nvidia', name: 'NVIDIA NIM (build.nvidia.com)', base: 'https://integrate.api.nvidia.com/v1', hint: 'Free credits at build.nvidia.com. Your key starts with nvapi-', models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.1-405b-instruct', 'nvidia/nemotron-mini-4b-instruct', 'meta/llama-3.2-90b-vision-instruct', 'microsoft/phi-3.5-vision-instruct'] },
  { id: 'ollama', name: 'Ollama Local', base: 'http://localhost:11434/v1', models: ['llama3.2', 'llava'] },
  { id: 'voice', name: 'Edge-TTS / Kokoro Local', base: 'http://localhost:8880/v1', models: ['kokoro', 'tts-1'] }
];
export const SLOTS = [
  { id: 'agent', label: 'Agentic tool-calling & OS automation' }, { id: 'vision', label: 'Screen vision (VLM)' }, { id: 'chat', label: 'Companion chat & personality' },
  { id: 'tts', label: 'Voice synthesis (extra TTS server)' }, { id: 'stt', label: 'Speech recognition (wake word & voice)' }
];
export const LEVELS = ['primary', 'fallback', 'fallback2'];
// Five cute Google voices. Cloud = Google Cloud TTS (needs a key, best quality). Free = Google Translate voice (no key), pitch-lifted in the player.
export const VOICES = [
  { id: 'mochi', name: 'Mochi', desc: 'Soft & sweet, young US voice', cloud: { name: 'en-US-Neural2-H', lang: 'en-US', pitch: 9, rate: 1.08 }, free: { tld: 'com', speed: 1.14 } },
  { id: 'bubbles', name: 'Bubbles', desc: 'Bright, bubbly and very high', cloud: { name: 'en-US-Neural2-F', lang: 'en-US', pitch: 12, rate: 1.05 }, free: { tld: 'com', speed: 1.24 } },
  { id: 'candy', name: 'Candy', desc: 'Playful, a little sassy', cloud: { name: 'en-US-Wavenet-H', lang: 'en-US', pitch: 7, rate: 1.12 }, free: { tld: 'com', speed: 1.17 } },
  { id: 'berry', name: 'Berry', desc: 'Sweet British girl', cloud: { name: 'en-GB-Neural2-A', lang: 'en-GB', pitch: 8, rate: 1.08 }, free: { tld: 'co.uk', speed: 1.14 } },
  { id: 'sprinkle', name: 'Sprinkle', desc: 'Cheeky Aussie sparkle', cloud: { name: 'en-AU-Neural2-A', lang: 'en-AU', pitch: 8, rate: 1.1 }, free: { tld: 'com.au', speed: 1.16 } }
];
const route = (p, f, f2) => ({ primary: p, fallback: f, fallback2: f2 || { provider: 'offline', model: '' } });
const off = { provider: 'offline', model: '' };
export const defaults = () => ({
  user: 'friend', lang: 'en', care: true, camera: true, worker: true, hud: true, wake: true, airPointer: true, airSnap: true,
  voice: { engine: 'free', preset: 'mochi', googleKey: '', pitch: 1, rate: 1, volume: 1, remoteVoice: 'af_heart' },
  faceId: { threshold: 0.8 }, bindings: [], macros: [],
  providers: PRESETS.map(p => ({ ...p, apiKey: '', timeout: 15000 })),
  routing: {
    agent: route({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' }, { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' }),
    chat: route({ provider: 'groq', model: 'llama-3.3-70b-versatile' }, { provider: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free' }, { provider: 'nvidia', model: 'meta/llama-3.3-70b-instruct' }),
    vision: route({ provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct' }, { provider: 'nvidia', model: 'meta/llama-3.2-90b-vision-instruct' }),
    tts: route(off, off), stt: route({ provider: 'groq', model: 'whisper-large-v3-turbo' }, { provider: 'groq', model: 'whisper-large-v3' })
  }
});
export const S = defaults();
let saveTimer = null; const listeners = new Set(); export const onChange = fn => listeners.add(fn);
function merge(saved) {
  if (!saved) return; const d = defaults();
  Object.assign(S, d, saved, { voice: { ...d.voice, ...(saved.voice || {}) }, faceId: { ...d.faceId, ...(saved.faceId || {}) } });
  const have = new Set((saved.providers || []).map(p => p.id));
  S.providers = [...(saved.providers || []), ...d.providers.filter(p => !have.has(p.id))];
  S.routing = Object.fromEntries(SLOTS.map(s => [s.id, { ...d.routing[s.id], ...((saved.routing || {})[s.id] || {}) }]));
}
export async function loadStore() {
  try { merge(window.aether ? await window.aether.getSettings() : JSON.parse(localStorage.getItem('pixie') || 'null')); } catch {}
  window.aether?.onSettings(s => { merge(s); listeners.forEach(f => f()); });
}
export function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { window.aether ? window.aether.setSettings(S) : localStorage.setItem('pixie', JSON.stringify(S)); }, 250); }
export const provider = id => S.providers.find(p => p.id === id);
export const isOffline = id => !id || id === 'offline';
const needsKey = b => !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(b);
// Waterfall chain: primary -> fallback -> fallback2, skipping offline entries and cloud providers with no key.
export function routeChain(slot) {
  const r = S.routing[slot] || {};
  return LEVELS.map(l => r[l]).filter(x => x && !isOffline(x.provider)).map(x => ({ ...x, p: provider(x.provider) }))
    .filter(x => x.p && x.p.base && (!needsKey(x.p.base) || x.p.apiKey));
}
export const exportRouting = () => JSON.stringify({ providers: S.providers.map(p => ({ ...p, apiKey: '' })), routing: S.routing }, null, 2);
export function importRouting(text) {
  const j = JSON.parse(text);
  (j.providers || []).forEach(p => { const o = provider(p.id); if (o) Object.assign(o, p, { apiKey: o.apiKey }); else S.providers.push({ ...p, apiKey: '' }); });
  if (j.routing) S.routing = { ...S.routing, ...j.routing }; save();
}
