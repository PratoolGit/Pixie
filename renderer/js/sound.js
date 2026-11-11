// Procedural sound effects. No audio files; everything is synthesized with Web Audio.
let ctx = null;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
function tone(freq, dur = 0.15, type = 'sine', vol = 0.12, slideTo = null, delay = 0) {
  const a = ac(), t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
const arp = (notes, step, type, vol, dur) => notes.forEach((n, i) => tone(n, dur, type, vol, null, i * step));
export const Sound = {
  resume() { try { ac().resume(); } catch {} },
  wake() { arp([392, 523, 659, 784, 1047], 0.09, 'triangle', 0.1, 0.4); },
  chime() { arp([1047, 1319, 1568, 1976, 2637], 0.07, 'triangle', 0.08, 0.5); },
  pop() { tone(500, 0.12, 'sine', 0.12, 900); },
  lock() { tone(1850, 0.014, 'square', 0.05); tone(2450, 0.014, 'square', 0.05, null, 0.05); },
  celebrate() { [523, 659, 784].forEach(f => { tone(f, 0.7, 'sine', 0.07); tone(f * 2, 0.5, 'triangle', 0.04); }); },
  veto() { tone(660, 0.3, 'sawtooth', 0.07, 220); },
  listenOn() { tone(660, 0.09, 'sine', 0.1); tone(990, 0.12, 'sine', 0.1, null, 0.08); },
  listenOff() { tone(990, 0.09, 'sine', 0.1); tone(660, 0.12, 'sine', 0.1, null, 0.08); },
  tick() { tone(1250, .05, 'sine', .06); tone(1650, .05, 'sine', .05, null, .04); },
  whoosh() { tone(150, 0.32, 'sine', 0.2, 34); }
};
