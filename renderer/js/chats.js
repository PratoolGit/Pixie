// Chat history (like ChatGPT): every conversation is saved on this PC in IndexedDB, one record per chat.
// A new chat is created lazily on the first message; "New chat" just clears the current selection.
const DB = 'pixie-chats';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('chats', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('chats', mode), st = t.objectStore('chats'), out = fn(st); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };

export const Chats = { list: [], cur: null, onChange: () => {}, onSwitch: () => {} };
const timers = new Map();
const save = c => { clearTimeout(timers.get(c.id)); timers.set(c.id, setTimeout(() => tx('readwrite', st => st.put(JSON.parse(JSON.stringify(c)))).catch(() => {}), 350)); };

export async function loadChats(fresh = false) {
  if (fresh) localStorage.removeItem('pixie.chat');   // app start = a fresh chat; history stays in the sidebar
  try { Chats.list = (await tx('readonly', st => st.getAll())) || []; } catch { Chats.list = []; }
  Chats.list.sort((a, b) => b.updated - a.updated);
  const id = localStorage.getItem('pixie.chat'); Chats.cur = Chats.list.find(c => c.id === id) || null;
  Chats.onSwitch(Chats.cur); Chats.onChange();
}
export function newChat() { Chats.cur = null; localStorage.removeItem('pixie.chat'); Chats.onSwitch(null); Chats.onChange(); }
export function setCurrent(id) { const c = Chats.list.find(x => x.id === id); if (!c) return; Chats.cur = c; localStorage.setItem('pixie.chat', id); Chats.onSwitch(c); Chats.onChange(); }
export function addMessage(role, text) {
  text = String(text || '').trim(); if (!text) return;
  if (!Chats.cur && role === 'assistant') return;     // greetings and reminders do not start a chat by themselves
  if (!Chats.cur) { const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), title: 'New chat', created: Date.now(), updated: Date.now(), messages: [] }; Chats.list.unshift(c); Chats.cur = c; localStorage.setItem('pixie.chat', c.id); }
  const c = Chats.cur; c.messages.push({ role, text, t: Date.now() });
  if (role === 'user' && c.title === 'New chat') c.title = text.length > 44 ? text.slice(0, 44).trim() + '…' : text;
  c.updated = Date.now(); Chats.list.sort((a, b) => b.updated - a.updated); save(c); Chats.onChange();
}
export function deleteChat(id) { Chats.list = Chats.list.filter(c => c.id !== id); tx('readwrite', st => st.delete(id)).catch(() => {}); if (Chats.cur?.id === id) newChat(); else Chats.onChange(); }
export function renameChat(id, title) { const c = Chats.list.find(x => x.id === id); if (c && title.trim()) { c.title = title.trim().slice(0, 60); save(c); Chats.onChange(); } }
export const historyForLLM = c => (c ? c.messages.slice(-8).map(m => ({ role: m.role, content: m.text })) : []);
