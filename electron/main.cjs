const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { APP_NAME, CREATOR_PROFILE_URL, DATA_DIRECTORY_NAME, SOFTWARE_DISCLAIMER_URL } = require('./core/constants.cjs');
const { ExifToolClient, getExifToolPath } = require('./core/exiftool.cjs');
const { MediaService, assertWithinRoot } = require('./core/media-service.cjs');
const { scanMediaLibrary } = require('./core/scanner.cjs');
const { StateStore } = require('./core/store.cjs');

let mainWindow;
let store;
let exiftool;
let mediaService;
let activeRoot = null;
let lastScan = null;
const thumbnailCache = new Map();

function assertString(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  return value;
}

function assertStringArray(value, name, maximum = 10_000) {
  if (!Array.isArray(value) || value.length > maximum || value.some((item) => typeof item !== 'string')) {
    throw new TypeError(`${name} must be an array of file paths.`);
  }
  return [...new Set(value)];
}

function requireActiveRoot(rootPath) {
  assertString(rootPath, 'rootPath');
  if (!activeRoot || path.resolve(rootPath) !== path.resolve(activeRoot)) {
    throw new Error('Select this media folder again before accessing its files.');
  }
  return activeRoot;
}

function registerHandler(channel, handler) {
  ipcMain.handle(channel, async (event, payload) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error('Untrusted application request.');
    return handler(payload || {});
  });
}

function progressReporter(operation) {
  return ({ percent, detail, key, variables }) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
    mainWindow.webContents.send('operation:progress', {
      operation,
      percent: Math.max(0, Math.min(100, Math.round(Number(percent) || 0))),
      detail: String(detail || ''),
      key: typeof key === 'string' ? key : null,
      variables: variables && typeof variables === 'object' ? variables : {},
    });
  };
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f2ed',
    title: APP_NAME,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  await mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    if (process.env.LMTR_SMOKE_SCREENSHOT) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const image = await mainWindow.webContents.capturePage();
      await fs.writeFile(path.resolve(process.env.LMTR_SMOKE_SCREENSHOT), image.toPNG());
      app.quit();
    }
  });
}

function setupIpc() {
  registerHandler('app:get-state', async () => ({
    appName: APP_NAME,
    platform: process.platform,
    settings: store.snapshot().settings,
    exifToolVersion: await exiftool.version(),
  }));

  registerHandler('legal:open-software-disclaimer', async () => {
    if (!SOFTWARE_DISCLAIMER_URL.startsWith('https://github.com/')) {
      throw new Error('The Software Licence & Disclaimer URL has not been configured yet.');
    }
    const url = new URL(SOFTWARE_DISCLAIMER_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') {
      throw new Error('The software disclaimer link is not a trusted GitHub URL.');
    }
    await shell.openExternal(url.href);
    return true;
  });

  registerHandler('creator:open-github-profile', async () => {
    const url = new URL(CREATOR_PROFILE_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.pathname !== '/khooyc') {
      throw new Error('The creator profile link is not a trusted GitHub URL.');
    }
    await shell.openExternal(url.href);
    return true;
  });

  registerHandler('folder:choose', async ({ locale }) => {
    const titles = {
      'zh-CN': '选择媒体库文件夹',
      'zh-TW': '選擇媒體庫資料夾',
      en: 'Select your Media Library folder',
    };
    const result = await dialog.showOpenDialog(mainWindow, {
      title: titles[locale] || titles.en,
      properties: ['openDirectory', 'dontAddToRecent'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    activeRoot = path.resolve(result.filePaths[0]);
    lastScan = null;
    thumbnailCache.clear();
    await store.setSetting('lastRoot', activeRoot);
    return activeRoot;
  });

  registerHandler('scan:run', async ({ rootPath }) => {
    const root = requireActiveRoot(rootPath);
    lastScan = await scanMediaLibrary(root, exiftool, store, progressReporter('scan'));
    await store.audit('folder-scanned', {
      root,
      imageCount: lastScan.items.length,
      videoCount: lastScan.videos.length,
      unsupportedCount: lastScan.unsupported.length,
    });
    return lastScan;
  });

  registerHandler('thumbnail:get', async ({ rootPath, filePath }) => {
    const root = requireActiveRoot(rootPath);
    const target = assertWithinRoot(root, assertString(filePath, 'filePath'));
    const cacheKey = target.toLocaleLowerCase('en-US');
    if (thumbnailCache.has(cacheKey)) return thumbnailCache.get(cacheKey);
    // Read and close the source before decoding. This prevents a preview from
    // competing with ExifTool's safe temporary-file rename on Windows.
    const source = await fs.readFile(target);
    const data = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize(480, 360, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${data.toString('base64')}`;
    if (thumbnailCache.size > 500) thumbnailCache.delete(thumbnailCache.keys().next().value);
    thumbnailCache.set(cacheKey, dataUrl);
    return dataUrl;
  });

  registerHandler('media:tag', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const results = await mediaService.tagFiles(root, assertStringArray(filePaths, 'filePaths'), progressReporter('tag'));
    thumbnailCache.clear();
    return results;
  });

  registerHandler('media:clear', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths');
    return mediaService.clearFiles(root, paths.map((filePath) => ({ path: filePath })), progressReporter('clear'));
  });

  registerHandler('media:remove-tags', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    return mediaService.removeTags(root, assertStringArray(filePaths, 'filePaths'), progressReporter('remove'));
  });

  registerHandler('media:normalize-tags', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    return mediaService.normalizeTags(root, assertStringArray(filePaths, 'filePaths'), progressReporter('normalize'));
  });

  registerHandler('media:dismiss-visual-variants', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths', 10_000);
    if (!lastScan || path.resolve(lastScan.root) !== path.resolve(root)) {
      throw new Error('Scan the selected media folder again before dismissing visual matches.');
    }
    const itemsByPath = new Map(lastScan.items.map((item) => [path.resolve(item.path), item]));
    const results = [];
    const report = progressReporter('dismiss-visual');
    report({ percent: 0, key: 'progress.checkVisual' });
    for (let index = 0; index < paths.length; index += 1) {
      const requestedPath = paths[index];
      const filePath = assertWithinRoot(root, requestedPath);
      const item = itemsByPath.get(path.resolve(filePath));
      if (!item) {
        results.push({ path: filePath, ok: false, message: 'The file is not present in the current scan.' });
        report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.checked', variables: { current: index + 1, total: paths.length } });
        continue;
      }
      if (item.exactDuplicateCount > 1) {
        results.push({ path: filePath, ok: false, message: 'Byte-for-byte exact duplicates cannot be dismissed as different.' });
        report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.checked', variables: { current: index + 1, total: paths.length } });
        continue;
      }
      if (!item.visualVariantGroup) {
        results.push({ path: filePath, ok: false, message: 'The file is not currently classified as a visual variant.' });
        report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.checked', variables: { current: index + 1, total: paths.length } });
        continue;
      }
      await store.dismissVisualVariant(item.contentHash, { filePath, reviewedBy: 'local-human' });
      results.push({ path: filePath, ok: true });
      report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.savedDecisions', variables: { current: index + 1, total: paths.length } });
    }
    return results;
  });

  registerHandler('media:trash', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths', 1_000).map((filePath) => assertWithinRoot(root, filePath));
    const results = [];
    const report = progressReporter('trash');
    report({ percent: 0, key: 'progress.preparingFiles' });
    for (let index = 0; index < paths.length; index += 1) {
      const filePath = paths[index];
      try {
        await shell.trashItem(filePath);
        await store.audit('file-moved-to-recycle-bin', { filePath });
        thumbnailCache.delete(filePath.toLocaleLowerCase('en-US'));
        results.push({ path: filePath, ok: true });
      } catch (error) {
        results.push({ path: filePath, ok: false, message: error.message });
      }
      report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.processedFiles', variables: { current: index + 1, total: paths.length } });
    }
    return results;
  });

  registerHandler('media:show-in-folder', async ({ rootPath, filePath }) => {
    const root = requireActiveRoot(rootPath);
    shell.showItemInFolder(assertWithinRoot(root, assertString(filePath, 'filePath')));
    return true;
  });

  registerHandler('backups:list-expired', async () => mediaService.cleanupExpiredBackups(store.state.settings.backupRetentionDays));

  registerHandler('backups:delete-expired', async ({ backupPaths }) => {
    const requested = new Set(assertStringArray(backupPaths, 'backupPaths', 10_000).map((item) => path.resolve(item)));
    const candidates = await mediaService.cleanupExpiredBackups(store.state.settings.backupRetentionDays);
    const allowed = new Map(candidates.map((candidate) => [path.resolve(candidate.backupPath), candidate]));
    const results = [];
    for (const backupPath of requested) {
      const candidate = allowed.get(backupPath);
      if (!candidate) throw new Error('Only expired backups listed by the app may be removed.');
      try {
        await fs.unlink(backupPath);
        await store.removeBackup(candidate.key);
        results.push({ path: backupPath, ok: true });
      } catch (error) {
        results.push({ path: backupPath, ok: false, message: error.message });
      }
    }
    return results;
  });
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  store = new StateStore(path.join(userData, 'state.json'));
  await store.load();
  const exifToolPath = getExifToolPath({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, packaged: app.isPackaged });
  exiftool = new ExifToolClient(exifToolPath);
  await exiftool.version();
  mediaService = new MediaService({ exiftool, store, backupRoot: path.join(userData, DATA_DIRECTORY_NAME, 'backups') });
  setupIpc();
  await createWindow();
});

app.on('window-all-closed', () => app.quit());

process.on('uncaughtException', async (error) => {
  if (store) await store.audit('uncaught-error', { message: error.message, stack: error.stack });
  dialog.showErrorBox(APP_NAME, error.message);
});
