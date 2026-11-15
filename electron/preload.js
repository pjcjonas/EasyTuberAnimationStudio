/* The few things the page may ask the studio to do with files. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('studioHost', {
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (path, text, suggested) => ipcRenderer.invoke('project:save', { path, text, suggested }),
  locateMedia: (base, id, files) => ipcRenderer.invoke('media:locate', { base, id, files }),
  setMedia: (map) => ipcRenderer.invoke('media:set', map),
  pickFile: (kind) => ipcRenderer.invoke('file:pick', kind),
  exportAction: (id, code, media) => ipcRenderer.invoke('action:export', { id, code, media }),
  loadAvatar: (pick) => ipcRenderer.invoke('avatar:load', !!pick),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  showFile: (file) => ipcRenderer.invoke('shell:show', file),
  setDirty: (v) => ipcRenderer.send('state:dirty', !!v),
  info: () => ipcRenderer.sendSync('app:info'),
});
