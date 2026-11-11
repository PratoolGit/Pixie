const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aether', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: s => ipcRenderer.invoke('settings:set', s),
  onSettings: cb => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  isActive: () => ipcRenderer.invoke('state:active'),
  onActive: cb => ipcRenderer.on('active', (_e, v) => cb(v)),
  fetch: o => ipcRenderer.invoke('net:fetch', o),
  agent: (name, args) => ipcRenderer.invoke('agent:run', { name, args }),
  capture: () => ipcRenderer.invoke('screen:capture'),
  islandIgnore: v => ipcRenderer.send('island:ignore', v),
  restore: () => ipcRenderer.send('window:restore'),
  ptr: (cmd, x, y) => ipcRenderer.send('ptr', { cmd, x, y }),
  agentWarm: () => ipcRenderer.send('agent:warm'),
  warm: urls => ipcRenderer.send('net:warm', urls),
  hudSet: v => ipcRenderer.send('hud:set', v),
  hudSend: m => ipcRenderer.send('hud:data', m),
  onHud: cb => ipcRenderer.on('hud', (_e, m) => cb(m))
});
