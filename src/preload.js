const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getUsageData: () => ipcRenderer.invoke('get-usage-data'),
    loadKeys: () => ipcRenderer.invoke('load-keys'),
    saveKeys: (keys) => ipcRenderer.invoke('save-keys', keys),
    authenticateProvider: (provider, alias) => ipcRenderer.invoke('authenticate-provider', provider, alias),

    resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
    hideApp: () => ipcRenderer.invoke('hide-app'),
    quitApp: () => ipcRenderer.invoke('quit-app'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
    onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
    onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback)
});
