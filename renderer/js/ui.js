// Dashboard (character, settings gear, chat box, camera preview) and settings dropdown; dynamic island controller.
import { S, SLOTS, LEVELS, VOICES, PRESETS, save, provider, isOffline, exportRouting, importRouting } from './store.js';
import { speak, Voice, Ear } from './voice.js';
import { Vision, emit } from './vision.js';
import { EMOTIONS, react } from './character.js';
import { Chats, loadChats, newChat, setCurrent, deleteChat, renameChat } from './chats.js';
import { Agent, dispatchAgentTask, focusLeft, resolvePending, hasPending } from './router.js';
import { bindingsSection, faceSection, macroSection, hudSection, initStudio, tickStudio } from './studio.js';

export const hooks = { ptt: () => {}, camera: () => {}, ear: () => {}, worker: () => {}, listening: () => false };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mode = 'main', capT = null, menuOpen = false;

export function setCaption(text) {
  if (mode === 'island') { $('islandText').textContent = text.replace(/^You: /, '🎤 ').slice(0, 70); return; }
  $('capText').textContent = text; const c = $('caption'); c.classList.add('show'); clearTimeout(capT);
  capT = setTimeout(() => { if (!hasPending()) c.classList.remove('show'); }, Math.max(4000, text.length * 80));
}
export function syncPreview() { const c = $('preview'); if (!c) return; const on = S.camera && Vision.running; c.hidden = !on; Vision.previewCanvas = on && mode === 'main' ? c : null; }
const EAR_TIPS = { off: 'Microphone off', listening: 'Listening for “Hello Pixie”', thinking: 'Transcribing…', 'needs-key': 'Needs a free Groq key (Settings ▸ AI providers)', denied: 'Microphone blocked by Windows', error: 'Speech service not responding' };
export function setEarStatus(s) { const awake = Ear.awakeUntil > Date.now(), tip = awake ? "I'm listening to you~" : EAR_TIPS[s] || s; for (const id of ['micDot', 'islandDot']) { const d = $(id); if (d) { d.className = (awake ? 'awake ' : '') + s; d.title = tip; } } }

// ================= settings dropdown =================
const setPath = (o, path, v) => { const k = path.split('.'), last = k.pop(); k.reduce((a, b) => a[b], o)[last] = v; };
const sec = (k, t, b, open) => `<details data-k="${k}" ${open.has(k) ? 'open' : ''}><summary>${t}</summary><div class="body">${b}</div></details>`;
const slider = (label, path, min, max, step, val) => `<label>${label}: <b>${val}</b><input type="range" data-bind="${path}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
const toggle = (label, path, val) => `<label class="row">${label}<input type="checkbox" data-bind="${path}" ${val ? 'checked' : ''}></label>`;
const provOpts = sel => S.providers.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');

function renderMenu() {
  const menu = $('menu'), open = new Set([...menu.querySelectorAll('details[data-k][open]')].map(d => d.dataset.k));
  if (!menu.dataset.init) { open.add('general'); menu.dataset.init = '1'; }
  const general = `
    <label>What should I call you?<input type="text" data-bind="user" value="${esc(S.user)}"></label>
    <label>Speech language<select data-bind="lang">${[['en', 'English'], ['auto', 'Auto-detect'], ['hi', 'Hindi'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ja', 'Japanese'], ['pt', 'Portuguese'], ['ar', 'Arabic']].map(l => `<option value="${l[0]}" ${S.lang === l[0] ? 'selected' : ''}>${l[1]}</option>`).join('')}</select></label>
    ${toggle('Friendly check-ins (water, stretch, breaks)', 'care', S.care)}
    ${toggle('Always listen for “Hello Pixie”', 'wake', S.wake)}${toggle('Camera, gestures & face cues', 'camera', S.camera)}
    <p class="note">Voice recognition needs a free Groq key (AI providers ▸ Groq Cloud). Without it, use the chat box.</p>`;
  const voice = `
    <label>Engine<select data-bind="voice.engine"><option value="free" ${S.voice.engine === 'free' ? 'selected' : ''}>Google voice (free, no key)</option><option value="cloud" ${S.voice.engine === 'cloud' ? 'selected' : ''}>Google Cloud TTS (API key, best quality)</option></select></label>
    <label>Google Cloud TTS API key<input type="password" data-bind="voice.googleKey" value="${esc(S.voice.googleKey)}" placeholder="only needed for Cloud TTS"></label>
    <div class="vgrid">${VOICES.map(v => `<div class="vcard ${v.id === S.voice.preset ? 'on' : ''}" data-act="pickvoice" data-id="${v.id}" tabindex="0"><b>${v.name}</b><span>${v.desc}</span></div>`).join('')}</div>
    ${slider('Pitch lift', 'voice.pitch', 0.7, 1.4, 0.02, S.voice.pitch)}${slider('Speed', 'voice.rate', 0.7, 1.4, 0.02, S.voice.rate)}${slider('Volume', 'voice.volume', 0, 1, 0.05, S.voice.volume)}
    <label>Voice name for extra TTS servers<input type="text" data-bind="voice.remoteVoice" value="${esc(S.voice.remoteVoice)}"></label>
    <div class="btns"><button class="btn" data-act="test-voice">Test voice</button></div><p class="note">Free mode uses Google Translate's voice, pitch-lifted for a baby-girl sound. Cloud mode uses the exact Neural2/Wavenet models listed in each card.</p>`;
  const provs = S.providers.map(p => `<details class="prov" data-k="p-${p.id}" ${open.has('p-' + p.id) ? 'open' : ''}><summary>${esc(p.name)}</summary><div class="body">
    ${p.builtin ? '<p class="note">Built in. Always available, no internet or key needed.</p>' : `
    ${(PRESETS.find(x => x.id === p.id)?.hint) ? `<p class="note">${esc(PRESETS.find(x => x.id === p.id).hint)}</p>` : ''}
    <label>Base URL (OpenAI-compatible)<input type="text" data-prov="${p.id}" data-field="base" value="${esc(p.base)}"></label>
    <label>API key<input type="password" data-prov="${p.id}" data-field="apiKey" value="${esc(p.apiKey)}" placeholder="stored encrypted on this PC"></label>
    <label>Timeout (ms)<input type="number" min="1000" step="500" data-prov="${p.id}" data-field="timeout" value="${p.timeout}"></label>
    <div class="btns"><button class="btn" data-act="ping" data-id="${p.id}">Ping test</button>${p.custom ? `<button class="btn alt" data-act="delprov" data-id="${p.id}">Remove</button>` : ''}<span id="ping-${p.id}"></span></div>`}</div></details>`).join('');
  const providers = `${provs}<div class="slot"><h4>Add custom endpoint</h4><input type="text" id="newName" placeholder="Name, e.g. My LM Studio"><input type="text" id="newBase" placeholder="https://host:port/v1"><div class="btns"><button class="btn" data-act="addprov">Add provider</button></div></div>`;
  const routing = `<p class="note">Each task tries primary, then fallback, then fallback 2, and finally the built-in offline engine, so I never hang.</p>
    ${SLOTS.map(s => { const r = S.routing[s.id]; return `<div class="slot"><h4>${s.label}</h4>${LEVELS.map(w => { const pv = provider(r[w].provider);
      return `<div class="pair"><label><span class="tag">${w === 'fallback2' ? 'fallback 2' : w}</span><select data-route="${s.id}|${w}|provider">${provOpts(r[w].provider)}</select></label>
      <label><span class="tag">model</span><input type="text" list="dl-${s.id}-${w}" data-route="${s.id}|${w}|model" value="${esc(r[w].model)}" ${isOffline(r[w].provider) ? 'disabled placeholder="n/a"' : ''}><datalist id="dl-${s.id}-${w}">${(pv?.models || []).map(m => `<option>${esc(m)}</option>`).join('')}</datalist></label></div>`; }).join('')}</div>`; }).join('')}
    <div class="slot"><h4>Quick setup</h4><div class="pair"><select id="allProv">${provOpts('groq')}</select><input type="text" id="allModel" placeholder="model name"></div><div class="btns"><button class="btn" data-act="apply-all">Use for chat, agent & vision</button></div></div>
    <div class="btns"><button class="btn alt" data-act="export">Export routing</button><button class="btn alt" data-act="import">Import routing</button></div>`;
  const cmds = `<table><tr><td>“Hello Pixie”</td><td>Wake me; then talk normally for ~20 s</td></tr><tr><td>“Click the send button”</td><td>I highlight it and ask “Use this button?”. Say yes (or 👍 / nod)</td></tr>
    <tr><td>“Write an email to…”</td><td>I draft it (AI), highlight your cursor box, ask, then type it</td></tr><tr><td>“Type hello there”</td><td>Types your exact words at the cursor after you confirm</td></tr>
    <tr><td>Open / search / play</td><td>Apps, sites, web search, YouTube</td></tr><tr><td>Press ctrl c · scroll down</td><td>Keyboard shortcuts and scrolling</td></tr>
    <tr><td>Timer · note · calculate</td><td>“remind me in 10 minutes to stretch”, “note that…”, “what is 15% of 240”</td></tr>
    <tr><td>Summarize / translate / rewrite</td><td>Works on text you highlight (needs AI)</td></tr><tr><td>Screenshot · battery · lock · minimize all</td><td>System helpers</td></tr>
    <tr><td>Fist (hold)</td><td>Wake me instantly</td></tr><tr><td>👍 / both palms</td><td>Yes / stop</td></tr></table>`;
  const lab = `<p class="note">Preview any of her 40 emotions or trigger gestures without a camera.</p><div class="pair"><select id="emoSel">${EMOTIONS.map(e => `<option>${e}</option>`).join('')}</select><button class="btn" data-act="emo">Play</button></div>
    <div class="btns">${['open_palm', 'finger_heart', 'high_five', 'peace', 'thumbs_up', 'pinch', 'veto'].map(g => `<button class="btn alt" data-act="gesture" data-id="${g}">${g.replace('_', ' ')}</button>`).join('')}<button class="btn alt" data-act="ev" data-id="user_smile">smile</button><button class="btn alt" data-act="ev" data-id="user_tired">yawn</button></div>`;
  menu.innerHTML = `<div class="btns top"><button class="btn alt" data-act="wide">⤢ Studio view</button></div>` + sec('general', 'Character & listening', general, open) + sec('voice', 'Voice (Google TTS)', voice, open) + sec('providers', 'AI providers & API keys', providers, open) +
    sec('routing', 'Task routing', routing, open) + sec('bindings', 'Gesture bindings & recorder', bindingsSection(), open) + sec('face', 'Face ID', faceSection(), open) + sec('macros', 'Macros (offline commands)', macroSection(), open) +
    sec('hud', 'Spatial HUD & performance', hudSection(), open) + sec('lab', 'Test lab', lab, open) + sec('cmds', 'What can I say?', cmds, open);
}
async function ping(id) {
  const p = provider(id), out = $('ping-' + id); out.className = ''; out.textContent = 'testing…';
  const r = await window.aether.fetch({ url: p.base.replace(/\/$/, '') + '/models', headers: p.apiKey ? { Authorization: 'Bearer ' + p.apiKey } : {}, timeout: p.timeout });
  if (!r.status) { out.className = 'bad'; out.textContent = '✗ ' + (r.error || 'unreachable'); } else if (r.ok) { out.className = 'ok'; out.textContent = `✓ ${r.ms} ms`; } else { out.className = 'bad'; out.textContent = `HTTP ${r.status}${r.status === 401 || r.status === 403 ? ' · check key' : ''}`; }
}
function initMenu() {
  const menu = $('menu'), gear = $('gear'), rerender = () => menuOpen && renderMenu();
  const toggleMenu = v => { menuOpen = v ?? !menuOpen; menu.hidden = !menuOpen; gear.setAttribute('aria-expanded', menuOpen); if (menuOpen) renderMenu(); };
  gear.onclick = e => { e.stopPropagation(); toggleMenu(); };
  document.addEventListener('click', e => { if (menuOpen && !$('settingsWrap').contains(e.target)) toggleMenu(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) toggleMenu(false); });
  Agent.openSettings = () => toggleMenu(true); initStudio(menu, rerender);
  setInterval(() => { if (menuOpen) tickStudio(menu); }, 300);
  menu.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.bind) {
      const v = t.type === 'checkbox' ? t.checked : t.type === 'range' || t.type === 'number' ? Number(t.value) : t.value; setPath(S, t.dataset.bind, v); save();
      if (t.type === 'range') t.parentElement.querySelector('b').textContent = v;
      const b = t.dataset.bind; if (b === 'camera') { hooks.camera(); syncPreview(); } if (b === 'wake') hooks.ear(); if (b === 'hud') window.aether.hudSet(S.hud); if (b === 'worker') hooks.worker();
    } else if (t.dataset.prov) { provider(t.dataset.prov)[t.dataset.field] = t.type === 'number' ? Number(t.value) : t.value.trim(); save(); if (t.dataset.field === 'apiKey') hooks.ear(); }
    else if (t.dataset.route) { const [slot, which, field] = t.dataset.route.split('|'); S.routing[slot][which][field] = t.value; save();
      if (field === 'provider') { const p = provider(t.value); if (p?.models?.length && !S.routing[slot][which].model) S.routing[slot][which].model = p.models[0]; renderMenu(); } }
  });
  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b || b.dataset.act.startsWith('st-')) return; const id = b.dataset.id;
    ({
      wide: () => menu.classList.toggle('wide'), 'test-voice': () => speak(`Hi ${S.user}! This is me. Do you like my voice? Be honest... I know you do.`, 'flirty'),
      pickvoice: () => { S.voice.preset = id; save(); renderMenu(); speak(`Hi ${S.user}, I'm ${VOICES.find(v => v.id === id).name}!`, 'happy'); }, ping: () => ping(id),
      delprov: () => { S.providers = S.providers.filter(p => p.id !== id); Object.values(S.routing).forEach(r => LEVELS.forEach(w => { if (r[w].provider === id) r[w] = { provider: 'offline', model: '' }; })); save(); renderMenu(); },
      addprov: () => { const n = $('newName').value.trim(), u = $('newBase').value.trim(); if (!n || !/^https?:\/\//.test(u)) return; S.providers.push({ id: 'custom-' + Date.now(), name: n, base: u, models: [], apiKey: '', timeout: 15000, custom: true }); save(); renderMenu(); },
      'apply-all': () => { const pv = $('allProv').value, m = $('allModel').value.trim(); ['chat', 'agent', 'vision'].forEach(s => { S.routing[s].primary = { provider: pv, model: m }; }); save(); renderMenu(); },
      export: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([exportRouting()], { type: 'application/json' })); a.download = 'pixie-routing.json'; a.click(); },
      import: () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json'; i.onchange = async () => { try { importRouting(await i.files[0].text()); renderMenu(); } catch { setCaption('That routing file looks invalid.'); } }; i.click(); },
      gesture: () => emit('gesture', { name: id }), ev: () => emit(id), emo: () => react($('emoSel').value, 5000)
    }[b.dataset.act] || (() => {}))();
  });
}


// ================= chat sidebar (history like ChatGPT) =================
const when = t => { const d = new Date(t), now = new Date(), day = 864e5, a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); return t >= a ? 'Today' : t >= a - day ? 'Yesterday' : t >= a - 7 * day ? 'Previous 7 days' : t >= a - 30 * day ? 'Previous 30 days' : 'Older'; };
const hm = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
let sideOpen = false, renaming = null, sure = null, lastRendered = '';
function renderSidebar() {
  const q = $('chatSearch').value.trim().toLowerCase(), box = $('chatList'); const items = Chats.list.filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.text.toLowerCase().includes(q)));
  if (!items.length) { box.innerHTML = `<div class="sb-empty">${Chats.list.length ? 'No chats match your search.' : 'No chats yet.<br>Say “Hello Pixie” or type below to start one.'}</div>`; return; }
  let html = '', last = '';
  for (const c of items) { const g = when(c.updated); if (g !== last) { html += `<div class="grp">${g}</div>`; last = g; }
    html += `<div class="chat-item ${Chats.cur?.id === c.id ? 'on' : ''}" role="listitem" data-id="${c.id}">
      <span class="t">${renaming === c.id ? `<input data-rename="${c.id}" value="${esc(c.title)}" maxlength="60">` : esc(c.title)}</span>
      <span class="acts"><button data-act="ren" title="Rename">✎</button><button data-act="del" class="${sure === c.id ? 'sure' : ''}" title="${sure === c.id ? 'Click again to delete' : 'Delete'}">${sure === c.id ? '✓' : '🗑'}</button></span></div>`; }
  box.innerHTML = html; const inp = box.querySelector('[data-rename]'); if (inp) { inp.focus(); inp.select(); }
}
function renderTranscript() {
  const c = Chats.cur, box = $('msgs'); $('trTitle').textContent = c ? c.title : 'New chat'; $('trCount').textContent = c ? `${c.messages.length} message${c.messages.length === 1 ? '' : 's'}` : '';
  const sig = c ? c.id + ':' + c.messages.length : 'none'; if (sig === lastRendered) return; const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || !lastRendered.startsWith(c ? c.id : 'none'); lastRendered = sig;
  box.innerHTML = c && c.messages.length ? c.messages.map(m => `<div class="msg ${m.role}">${esc(m.text)}<time>${hm(m.t)}</time></div>`).join('') : '<div class="tr-empty"><b>New chat</b>Ask me anything, or say “Hello Pixie”.<br>Your conversation will appear here and be saved.</div>';
  if (stick) box.scrollTop = box.scrollHeight;
}
function initSidebar() {
  const toggle = v => { sideOpen = v ?? !sideOpen; document.body.classList.toggle('sb-open', sideOpen); $('sideBtn').setAttribute('aria-expanded', sideOpen); if (sideOpen) { renderSidebar(); lastRendered = ''; renderTranscript(); } };
  $('sideBtn').onclick = e => { e.stopPropagation(); toggle(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sideOpen && !document.activeElement?.dataset?.rename) toggle(false); });
  $('newChat').onclick = () => { newChat(); renaming = sure = null; $('chatInput').focus(); };
  $('chatSearch').addEventListener('input', renderSidebar);
  $('chatList').addEventListener('click', e => {
    const item = e.target.closest('.chat-item'); if (!item || e.target.closest('input')) return; const id = item.dataset.id, a = e.target.closest('[data-act]')?.dataset.act;
    if (a === 'ren') { renaming = id; sure = null; return renderSidebar(); }
    if (a === 'del') { if (sure === id) { sure = null; deleteChat(id); } else { sure = id; renderSidebar(); setTimeout(() => { if (sure === id) { sure = null; renderSidebar(); } }, 2500); } return; }
    sure = null; setCurrent(id);
  });
  $('chatList').addEventListener('keydown', e => { const i = e.target.dataset?.rename; if (!i) return; if (e.key === 'Enter') { renameChat(i, e.target.value); renaming = null; renderSidebar(); } if (e.key === 'Escape') { renaming = null; renderSidebar(); } });
  $('chatList').addEventListener('focusout', e => { const i = e.target.dataset?.rename; if (i && renaming === i) { renameChat(i, e.target.value); renaming = null; renderSidebar(); } });
  Chats.onChange = () => { if (sideOpen) { renderSidebar(); renderTranscript(); } };
}

// ================= dashboard =================
function initMain() {
  initMenu(); initSidebar(); syncPreview();
  $('chat').addEventListener('submit', e => { e.preventDefault(); const i = $('chatInput'), v = i.value.trim(); i.value = ''; if (v) dispatchAgentTask(v); });
  $('caption').addEventListener('click', e => { const b = e.target.closest('[data-yn]'); if (b) resolvePending(b.dataset.yn === '1'); });
  $('micDot').onclick = () => { S.wake = !S.wake; save(); hooks.ear(); };
  Agent.expand = () => {}; Agent.confirmUI = on => { $('confirmBtns').hidden = !on; if (on) $('caption').classList.add('show'); };
  Agent.busy = on => { const t = $('capText'); if (on) { t.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; $('caption').classList.add('show'); } else if (t.querySelector('.dots')) t.textContent = ''; };
  setInterval(() => setEarStatus(Ear.status), 700);
}

// ================= dynamic island (minimal) =================
let collapseT = null, hover = false, focusIn = false;
export function expandIsland(ms = 5000) { if (mode !== 'island') return; const el = $('island'); el.classList.add('expanded'); el.classList.remove('compact'); clearTimeout(collapseT); collapseT = setTimeout(collapse, ms); }
function collapse() { if (hover || focusIn || Voice.speaking || hasPending()) { collapseT = setTimeout(collapse, 1500); return; } const el = $('island'); el.classList.remove('expanded'); el.classList.add('compact'); }
function initIsland() {
  const el = $('island'); Agent.compact = true;
  el.addEventListener('mouseenter', () => { hover = true; window.aether.islandIgnore(false); expandIsland(8000); });
  el.addEventListener('mouseleave', () => { hover = false; if (!focusIn) window.aether.islandIgnore(true); expandIsland(2500); });
  $('islandInput').addEventListener('focus', () => { focusIn = true; window.aether.islandFocus?.(true); }); $('islandInput').addEventListener('blur', () => { focusIn = false; });
  $('islandForm').addEventListener('submit', e => { e.preventDefault(); const i = $('islandInput'), v = i.value.trim(); i.value = ''; if (v) dispatchAgentTask(v); });
  $('islandRestore').onclick = () => window.aether.restore();
  el.querySelectorAll('[data-yn]').forEach(b => b.onclick = () => resolvePending(b.dataset.yn === '1'));
  Voice.onStart = () => document.body.classList.add('speaking'); Voice.onEnd = () => document.body.classList.remove('speaking');
  Agent.busy = on => { if (on) $('islandText').innerHTML = '<span class="dots"><i></i><i></i><i></i></span>'; };
  Agent.expand = ms => expandIsland(ms || 6000); Agent.confirmUI = on => { $('islandYN').hidden = !on; if (on) expandIsland(40000); };
  setInterval(() => { const f = focusLeft(); if (f) $('islandText').textContent = `Focus ${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`; }, 1000);
}
export function setListening(on) { document.body.classList.toggle('listening', on); if (on) expandIsland(12000); }
export function initUI(m) { mode = m; document.body.classList.add('mode-' + m); Agent.caption = setCaption; if (m === 'island') initIsland(); else initMain(); }
