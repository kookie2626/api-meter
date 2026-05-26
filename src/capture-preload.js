const { ipcRenderer } = require('electron');
window.addEventListener('mousedown', () => ipcRenderer.send('click-outside'), true);
