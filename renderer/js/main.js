// Boot: wires sensing, character, voice, always-on listening, router and UI together.
import { loadStore, S, onChange } from './store.js';
import { Sound } from './sound.js';
import { Voice, Ear, startEar, stopEar, stopSpeaking, isWake, stripWake, warmTTS } from './voice.js';
import { startVision, stopVision, restartVision, on, Vision } from './vision.js';
import { startLoop, startAsleep, wakeUp, onWake, react, setEmotion, burst, lookAt, touch, shock } from './character.js';
import { Agent, say, dispatchAgentTask, resolvePending, hasPending } from './router.js';
import { initUI, hooks, expandIsland, syncPreview, setEarStatus } from './ui.js';
import { startBackground, setBgActive } from './bg.js';
import { loadFaceID } from './faceid.js';
import { Chats, loadChats, historyForLLM } from './chats.js';
import { hasBinding } from './gestures.js';
import './pointer.js';

const mode = ['island', 'hud'].includes(new URLSearchParams(location.search).get('mode')) ? new URLSearchParams(location.search).get('mode') : 'main';
const $ = id => document.getElementById(id);
const pick = a => a[(Math.random() * a.length) | 0];
const cool = (k, ms) => { const n = Date.now(); if (n - (cool[k] || 0) < ms) return false; cool[k] = n; return true; };
let active = false;

// ---------- always-on listening: "Hello Pixie" wakes her, then she keeps listening for ~20 s ----------
const AWAKE_MS = 20000;
const awake = () => Ear.awakeUntil > Date.now();
function wakeNow() { Ear.awakeUntil = Date.now() + AWAKE_MS; setEarStatus(Ear.status); }
Ear.onText = async text => {
  if (isWake(text)) {
    wakeNow(); touch(); Sound.listenOn(); const rest = stripWake(text);
    if (rest.length > 2) return dispatchAgentTask(rest);
    react('listening', 3000); return say(pick([`Yes, ${S.user}? I'm listening!`, 'I am here!', `Hi ${S.user}! What do you need?`]), 'listening', 4000);
  }
  if (awake() || hasPending()) { wakeNow(); dispatchAgentTask(text); } else Ear.onMiss();
};
Ear.onStatus = s => setEarStatus(s);
Ear.onHeard = () => { if (awake() || hasPending()) { Sound.tick(); setEmotion('thinking'); Agent.busy(true); expandIsland(6000); } };   // instant feedback while the words are being recognised
Ear.onMiss = () => { Agent.busy(false); if (!Voice.speaking) setEmotion('neutral'); };
async function syncEar() {
  if (active && S.wake) { const ok = await startEar(); if (!ok && Ear.status === 'needs-key' && cool('keyhint', 600000)) say(`I can't hear you yet, ${S.user}. Add a free Groq key in Settings, AI providers, then just say hello Pixie. Until then, type to me below!`, 'pouty', 8000); }
  else if (Ear.on) stopEar();
}
hooks.ear = syncEar; hooks.ptt = () => { wakeNow(); touch(); Sound.listenOn(); react('listening', 3000); };
hooks.listening = () => awake();

// ---------- camera ----------
async function syncSensors() {
  if (active && S.camera) { const ok = await startVision($('cam')); syncPreview(); if (S.bindings.some(b => b.kind === 'dtw' || /wink|blink|brow|mouth|head/.test(b.trigger || ''))) Vision.faceEvery = 2;
    if (!ok && Vision.error && mode === 'main' && cool('camerr', 120000)) setTimeout(() => say('My camera is not working, so I will use voice and the chat box for now.', 'sad', 4000), 5000); }
  else stopVision();
}
setInterval(() => { if (mode === 'main') syncPreview(); }, 1500);
hooks.camera = syncSensors; hooks.worker = () => restartVision();
function setActive(v) {
  active = v; setBgActive(v); if (v && mode !== 'hud') loadChats(); syncSensors(); syncEar();
  if (!v) { stopSpeaking(); return; }
  if (mode === 'island') { wakeUp(); setTimeout(() => say(`I'm here if you need me!`, 'happy', 3000), 1200); expandIsland(4000); }
}

// ---------- gestures (a binding replaces the default reaction) ----------
const hud = (kind, at) => { if (S.hud) window.aether.hudSend({ t: 'fx', kind, at }); };
on('gesture', ({ name }) => {
  touch(); expandIsland(5000);
  if (name === 'thumbs_up' && hasPending()) return resolvePending(true);
  if (name === 'veto') { if (hasPending()) return resolvePending(false); Agent.token++; stopSpeaking(); Sound.veto(); Agent.focusEnd = 0; react('surprised', 2000); Agent.caption('Okay, everything stopped.'); return; }
  if (hasBinding(name)) return;
  switch (name) {
    case 'open_palm': if (cool('palm', 9000)) { react('greeting', 3500); say(pick([`Hi hi, ${S.user}!`, 'Waving back at you~']), 'greeting', 3500); } break;
    case 'finger_heart': Sound.chime(); react('blushing', 1600); burst('hearts', 26); burst('sparkles', 14); hud('hearts'); setTimeout(() => react('love', 5000), 1500); say(`Aww, a finger heart! That is so sweet, ${S.user}!`, 'love', 6000); break;
    case 'high_five': Sound.celebrate(); shock(); hud('confetti', 'center'); react('cheering', 4000); Agent.tasks++; say('High five! Yatta, we are unstoppable!', 'cheering', 4000); break;
    case 'peace': react('playful', 3500); say('Peace! Hehe, nice one!', 'playful', 3500); break;
    case 'thumbs_up': react('happy', 3500); say(`Thank you, ${S.user}! You're the best~`, 'happy', 3500); break;
    case 'pinch': Sound.pop(); react('shy', 1800); break;
    case 'point': setEmotion('curious', 1500); break;
  }
});
on('cue', ({ name }) => { if (name === 'head_nod' && hasPending()) resolvePending(true); else if (name === 'head_shake' && hasPending()) resolvePending(false); });
on('fist_start', () => hooks.ptt());
on('hand_enter', () => { touch(); expandIsland(4000); });
on('face_pos', p => { lookAt(p.x, p.y); if (cool('seen', 5000)) touch(); });
on('user_smile', () => { touch(); react('happy', 5000); Sound.chime(); say(`I love your smile, ${S.user}! It made my day.`, 'happy', 5000); });
on('user_tired', () => { touch(); react('worried', 6000); say(`${S.user}, you look sleepy! Stretch with me for a minute, okay? I'll count.`, 'worried', 6000); });
on('user_arrive', () => { if (cool('greet', 60000)) { touch(); react('excited', 3000); say(`Welcome back, ${S.user}! I missed you~`, 'excited', 4000); } });
on('face_verified', () => { Sound.chime(); react('love', 4000); say(`I know that face! Welcome back, ${S.user}. VERIFIED.`, 'happy', 4500); });
let lastHud = 0;
on('hand_frame', e => { if (!S.hud) return; const n = performance.now(); if (n - lastHud < 33) return; lastHud = n; window.aether.hudSend({ t: 'hand', hands: e.lms.map(l => l.flatMap(p => [p.x, p.y])) }); });

// ---------- friendly check-ins ----------
const CARE = [['Time for a sip of water, ${u}! Staying hydrated helps you shine.', 'happy'], ["You've been at it a while. Let's stretch our shoulders together, ${u}!", 'worried'], ['Quick eye break! Look at something far away for twenty seconds, ${u}.', 'thinking'], ['Proud of how hard you are working today, ${u}! Remember to breathe.', 'proud']];
let careI = 0; setInterval(() => { if (!active || !S.care || Ear.status === 'off' && !Vision.running) return; if (Voice.speaking || hasPending()) return; const [t, e] = CARE[careI++ % CARE.length]; touch(); react(e, 5000); say(t.replace('${u}', S.user), e, 5000); }, 50 * 60000);

// ---------- boot ----------
(async () => {
  if (mode === 'hud') { document.body.classList.add('mode-hud'); import('./hud.js'); return; }
  await loadStore(); await loadFaceID(); Chats.onSwitch = c => { Agent.history = historyForLLM(c); }; await loadChats(true);
  initUI(mode); startLoop(); startAsleep(); Ear.shortOk = () => hasPending();
  if (mode === 'main') startBackground($('bg'));
  const prevEnd = Voice.onEnd; Voice.onEnd = () => { prevEnd?.(); if (awake()) wakeNow(); };
  onChange(() => { syncSensors(); syncEar(); syncPreview(); });
  onWake(() => { if (mode === 'main') { const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; say(`${g}, ${S.user}! I'm Pixie. Say hello Pixie any time, or type in the box below. What would you like to do?`, 'greeting', 6000); } });
  if (mode === 'main') { window.aether.hudSet(S.hud); setActive(true); setTimeout(wakeUp, 900); } else setActive(await window.aether.isActive());
  window.aether.onActive(setActive);
  window.addEventListener('pointerdown', () => Sound.resume(), { once: true });
  if (mode === 'main') { warmTTS(); window.aether.agentWarm?.(); window.aether.warm?.([...S.providers.filter(p => p.apiKey && p.base).map(p => p.base), 'https://translate.google.com', 'https://texttospeech.googleapis.com']); }
})();
