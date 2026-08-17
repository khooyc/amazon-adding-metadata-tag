const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('mediaTagger', Object.freeze({
  getState: () => invoke('app:get-state'),
  checkForUpdate: () => invoke('app:check-for-update'),
  openUpdate: (releaseUrl) => invoke('app:open-update', { releaseUrl }),
  openSoftwareDisclaimer: () => invoke('legal:open-software-disclaimer'),
  openCreatorProfile: () => invoke('creator:open-github-profile'),
  chooseFolder: (locale) => invoke('folder:choose', { locale }),
  scan: (rootPath) => invoke('scan:run', { rootPath }),
  getThumbnail: (rootPath, filePath) => invoke('thumbnail:get', { rootPath, filePath }),
  tag: (rootPath, filePaths) => invoke('media:tag', { rootPath, filePaths }),
  clear: (rootPath, filePaths) => invoke('media:clear', { rootPath, filePaths }),
  removeTags: (rootPath, filePaths) => invoke('media:remove-tags', { rootPath, filePaths }),
  normalizeTags: (rootPath, filePaths) => invoke('media:normalize-tags', { rootPath, filePaths }),
  dismissVisualVariants: (rootPath, filePaths) => invoke('media:dismiss-visual-variants', { rootPath, filePaths }),
  trash: (rootPath, filePaths) => invoke('media:trash', { rootPath, filePaths }),
  showInFolder: (rootPath, filePath) => invoke('media:show-in-folder', { rootPath, filePath }),
  listExpiredBackups: () => invoke('backups:list-expired'),
  deleteExpiredBackups: (backupPaths) => invoke('backups:delete-expired', { backupPaths }),
  onProgress: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Progress callback must be a function.');
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('operation:progress', listener);
    return () => ipcRenderer.removeListener('operation:progress', listener);
  },
  onUpdateStatus: (callback) => {
    if (typeof callback !== 'function') throw new TypeError('Update status callback must be a function.');
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('app:update-status', listener);
    return () => ipcRenderer.removeListener('app:update-status', listener);
  },
}));
