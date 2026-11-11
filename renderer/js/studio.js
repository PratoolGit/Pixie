// Settings sections for: gesture bindings + recorder, Face ID, macros, HUD & performance.
import { S, save } from './store.js';
import { Vision } from './vision.js';
import { FaceID, enrollPose, clearFaceID, POSES } from './faceid.js';
import { TRIGGERS, ACTIONS, triggerLabel, Rec, Live, startRecording, recordSample, cancelRecording, addBinding, removeBinding } from './gestures.js';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const actLabel = t => (ACTIONS.find(a => a[0] === t) || [0, t])[1];
const actOpts = () => ACTIONS.map(a => `<option value="${a[0]}">${a[1]}</option>`).join('');
const PH = 'spotify  ·  youtube.com  ·  text to say  ·  ctrl+s';

export const bindingsSection = () => `
  <p class="note">Bind any face or hand gesture to an action. Example: <b>Wink left eye → Open app → spotify</b>. Or pick “Record a custom gesture” and teach me your own (3 samples, DTW matching).</p>
  ${S.bindings.map(b => `<div class="row2"><div><b>${esc(b.kind === 'dtw' ? '✦ ' + b.label : triggerLabel(b.trigger))}</b> → ${esc(actLabel(b.action.type))}: <i>${esc(b.action.value)}</i>
    ${b.kind === 'dtw' ? `<progress data-live="${b.id}" max="100" value="0"></progress>` : ''}</div><button class="btn alt" data-act="st-delbind" data-id="${b.id}">✕</button></div>`).join('') || '<p class="note">No bindings yet.</p>'}
  <div class="slot"><h4>New binding</h4>
    <label>When I…<select id="bTrig">${TRIGGERS.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}<option value="__rec">Record a custom gesture…</option></select></label>
    <input type="text" id="bName" placeholder="Name (only for custom gestures)">
    <div class="pair"><select id="bType">${actOpts()}</select><input type="text" id="bVal" placeholder="${PH}"></div>
    <div class="btns"><button class="btn" data-act="st-addbind">Add binding</button></div></div>
  <div class="slot"><h4>Gesture recorder</h4><p class="note" id="recMsg">${esc(Rec.msg || 'Choose “Record a custom gesture…” above and press Add.')}</p>
    <div class="btns"><button class="btn" data-act="st-rec" ${Rec.state === 'idle' ? 'disabled' : ''}>Record sample ${Math.min(3, Rec.samples.length + 1)} of 3</button><button class="btn alt" data-act="st-cancelrec">Cancel</button></div></div>`;

export const faceSection = () => `
  <p class="note" id="fidStatus"></p>
  <div class="btns">${POSES.map((p, i) => `<button class="btn ${FaceID.poses[i] ? '' : 'alt'}" data-act="st-enrol" data-id="${i}">${FaceID.poses[i] ? '✓ ' : ''}${p}</button>`).join('')}</div>
  <label>Match threshold: <b>${S.faceId.threshold}</b><input type="range" data-bind="faceId.threshold" min=".5" max=".98" step=".01" value="${S.faceId.threshold}"></label>
  <div class="btns"><button class="btn alt" data-act="st-fidclear">Clear enrollment</button></div>
  <p class="note">Capture all 3 poses with your face centred. When I recognise you I'll flash “VERIFIED” and greet you. This is a friendly check, not security.</p>`;

export const macroSection = () => `
  <p class="note">Offline command registry: your own phrases that always work, with or without an AI key.</p>
  ${S.macros.map((m, i) => `<div class="row2"><div><b>“${esc(m.phrase)}”</b> → ${esc(actLabel(m.action.type))}: <i>${esc(m.action.value)}</i></div><button class="btn alt" data-act="st-delmacro" data-id="${i}">✕</button></div>`).join('') || '<p class="note">No macros yet.</p>'}
  <div class="slot"><input type="text" id="mPhrase" placeholder='When I say… e.g. "work mode"'><div class="pair"><select id="mType">${actOpts()}</select><input type="text" id="mVal" placeholder="${PH}"></div>
  <div class="btns"><button class="btn" data-act="st-addmacro">Add macro</button></div></div>`;

export const hudSection = () => `
  <label class="row">Spatial HUD overlay (full-screen, click-through)<input type="checkbox" data-bind="hud" ${S.hud ? 'checked' : ''}></label>
  <label class="row">Background vision worker (zero-copy frames)<input type="checkbox" data-bind="worker" ${S.worker ? 'checked' : ''}></label>
  <p class="note" id="pipeStatus"></p><p class="note">The HUD draws smoothed fingertip reticles with motion lead, pinch calipers, your hand skeleton, edge warnings and celebration effects over every app.</p>`;

export function initStudio(menu, rerender) {
  menu.addEventListener('click', async e => {
    const b = e.target.closest('[data-act^="st-"]'); if (!b) return; const id = b.dataset.id, v = x => menu.querySelector(x)?.value.trim();
    if (b.dataset.act === 'st-addbind') { const trig = v('#bTrig'), action = { type: v('#bType'), value: v('#bVal') }; if (!action.value) { Rec.msg = 'Add a value for the action first.'; return rerender(); }
      if (trig === '__rec') { startRecording(v('#bName') || 'Custom gesture', action); Vision.faceEvery = 2; } else addBinding(trig, action); rerender(); }
    if (b.dataset.act === 'st-rec') { recordSample().then(rerender); }
    if (b.dataset.act === 'st-cancelrec') { cancelRecording(); rerender(); }
    if (b.dataset.act === 'st-delbind') { removeBinding(id); rerender(); }
    if (b.dataset.act === 'st-enrol') { enrollPose(+id).then(rerender); }
    if (b.dataset.act === 'st-fidclear') { await clearFaceID(); rerender(); }
    if (b.dataset.act === 'st-addmacro') { const phrase = v('#mPhrase'), val = v('#mVal'); if (phrase && val) { S.macros.push({ phrase, action: { type: v('#mType'), value: val } }); save(); rerender(); } }
    if (b.dataset.act === 'st-delmacro') { S.macros.splice(+id, 1); save(); rerender(); }
  });
}
export function tickStudio(menu) {
  const set = (id, t) => { const el = menu.querySelector(id); if (el && el.textContent !== t) el.textContent = t; };
  set('#recMsg', Rec.msg || 'Choose “Record a custom gesture…” above and press Add.');
  const need = !Vision.running ? 'Turn the camera on to enroll.' : FaceID.capturing >= 0 ? `Capturing “${POSES[FaceID.capturing]}”… ${Math.round(FaceID.progress * 100)}%` : FaceID.centroid ? (FaceID.verified ? `VERIFIED ✓  match ${Math.round(FaceID.score * 100)}%` : `UNVERIFIED  match ${Math.round(FaceID.score * 100)}%`) : `Not enrolled: ${FaceID.poses.filter(Boolean).length}/3 poses captured.`;
  set('#fidStatus', need);
  set('#pipeStatus', Vision.running ? `Vision: ${Vision.mode} · ${Vision.fps} fps · ${Vision.latency} ms` : Vision.error ? 'Vision error: ' + Vision.error : 'Camera is off.');
  menu.querySelectorAll('[data-live]').forEach(p => { p.value = Live[p.dataset.live] || 0; });
}
