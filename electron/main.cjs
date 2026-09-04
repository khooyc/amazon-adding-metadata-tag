const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const { APP_NAME, CREATOR_PROFILE_URL, DATA_DIRECTORY_NAME, normalizePath, SOFTWARE_DISCLAIMER_URL } = require('./core/constants.cjs');
const { ExifToolClient, getExifToolPath } = require('./core/exiftool.cjs');
const { MediaService, assertWithinRoot } = require('./core/media-service.cjs');
const { scanMediaLibrary, sha256File } = require('./core/scanner.cjs');
const { StateStore } = require('./core/store.cjs');
const { checkLatestRelease, isTrustedReleaseUrl } = require('./core/update-service.cjs');

let mainWindow;
let store;
let exiftool;
let mediaService;
let activeRoot = null;
let lastScan = null;
let activeMutation = null;
let quitAfterMutation = false;
let closeNoticeVisible = false;
let updateCheckPromise = null;
let updateCheckTimer = null;
let updateStatus = {
  state: 'checking',
  currentVersion: app.getVersion(),
  latestVersion: null,
  releaseUrl: null,
  publishedAt: null,
};
const thumbnailCache = new Map();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const APP_SCHEME = 'lmtr';
const APP_CONTENT_ROOT = path.resolve(__dirname, '..');
const APP_STATIC_ROOTS = [
  path.join(APP_CONTENT_ROOT, 'src'),
  path.join(APP_CONTENT_ROOT, 'node_modules', '@vladmandic', 'human', 'dist'),
  path.join(APP_CONTENT_ROOT, 'node_modules', '@vladmandic', 'human', 'models'),
];

protocol.registerSchemesAsPrivileged([{
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
}]);

function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== 'bundle') return new Response('Not found', { status: 404 });
    const requestedPath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target = path.resolve(APP_CONTENT_ROOT, requestedPath);
    if (!APP_STATIC_ROOTS.some((directory) => isWithinDirectory(directory, target))) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(target).href);
  });
}

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

function currentScanItemsByPath(rootPath) {
  if (!lastScan || normalizePath(lastScan.root) !== normalizePath(rootPath)) {
    throw new Error('Scan the selected media folder again before changing its files.');
  }
  return new Map(lastScan.items.map((item) => [normalizePath(item.path), item]));
}

function expectedHashesForCurrentScan(rootPath, filePaths) {
  const scannedItems = currentScanItemsByPath(rootPath);
  const expectedHashes = new Map();
  for (const requestedPath of filePaths) {
    const filePath = assertWithinRoot(rootPath, requestedPath);
    const item = scannedItems.get(normalizePath(filePath));
    if (!item) throw new Error('Scan and review this file again before changing it.');
    expectedHashes.set(normalizePath(filePath), item.contentHash);
  }
  return expectedHashes;
}

function assertTagWritableForCurrentScan(rootPath, filePaths) {
  const scannedItems = currentScanItemsByPath(rootPath);
  for (const requestedPath of filePaths) {
    const item = scannedItems.get(normalizePath(assertWithinRoot(rootPath, requestedPath)));
    if (!item || item.tagWritable === false) {
      throw new Error('This video format cannot safely embed XMP metadata. Convert or remux it to MP4, MOV, M4V, QT, 3GP, 3G2, F4V, LRV, or MQV first.');
    }
  }
}

async function verifyReviewedFiles(filePaths, expectedHashes) {
  for (const filePath of filePaths) {
    const currentHash = await sha256File(filePath);
    if (currentHash !== expectedHashes.get(normalizePath(filePath))) {
      throw new Error('A selected file changed since it was reviewed. Scan and review it again.');
    }
  }
}

function runExclusiveMutation(operation) {
  if (activeMutation) throw new Error('Another file operation is still running. Wait for it to finish.');
  const currentMutation = Promise.resolve().then(operation);
  activeMutation = currentMutation;
  return currentMutation.finally(() => {
    if (activeMutation === currentMutation) activeMutation = null;
    if (quitAfterMutation) {
      quitAfterMutation = false;
      app.quit();
    }
  });
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

function publishUpdateStatus(status) {
  updateStatus = status;
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('app:update-status', status);
}

async function checkForUpdate() {
  if (updateCheckPromise) return updateCheckPromise;
  updateCheckPromise = checkLatestRelease({ currentVersion: app.getVersion() })
    .then((status) => {
      publishUpdateStatus(status);
      return status;
    })
    .catch((error) => {
      const status = {
        state: 'unavailable',
        currentVersion: app.getVersion(),
        latestVersion: null,
        releaseUrl: null,
        publishedAt: null,
        reason: error?.statusCode === 404 ? 'no-release' : 'network',
      };
      publishUpdateStatus(status);
      return status;
    })
    .finally(() => { updateCheckPromise = null; });
  return updateCheckPromise;
}

function scheduleUpdateCheck() {
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
  updateCheckTimer = setTimeout(() => {
    checkForUpdate().finally(scheduleUpdateCheck);
  }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckTimer.unref?.();
}

function assertTrustedReleaseUrl(value) {
  assertString(value, 'releaseUrl');
  if (!isTrustedReleaseUrl(value)) throw new Error('The update link is not a trusted GitHub release URL.');
  return new URL(value).href;
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
  mainWindow.on('close', (event) => {
    if (!activeMutation) return;
    event.preventDefault();
    quitAfterMutation = true;
    if (!closeNoticeVisible) {
      closeNoticeVisible = true;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: APP_NAME,
        message: 'Finishing the current file operation safely',
        detail: 'The app will close automatically after verification and safety cleanup finish.',
      }).finally(() => { closeNoticeVisible = false; });
    }
  });
  mainWindow.once('ready-to-show', async () => {
    mainWindow.show();
    if (process.env.LMTR_SMOKE_SCREENSHOT) {
      await new Promise((resolve) => setTimeout(resolve, 800));
      const image = await mainWindow.webContents.capturePage();
      await fs.writeFile(path.resolve(process.env.LMTR_SMOKE_SCREENSHOT), image.toPNG());
      app.quit();
    }
  });
  await mainWindow.loadURL(APP_SCHEME + '://bundle/src/index.html');
}

function setupIpc() {
  registerHandler('app:get-state', async () => ({
    appName: APP_NAME,
    platform: process.platform,
    settings: store.snapshot().settings,
    exifToolVersion: await exiftool.version(),
    update: updateStatus,
  }));

  registerHandler('app:check-for-update', async () => checkForUpdate());

  registerHandler('app:open-update', async ({ releaseUrl }) => {
    const trustedUrl = assertTrustedReleaseUrl(releaseUrl);
    await shell.openExternal(trustedUrl);
    return true;
  });

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
      imageCount: lastScan.items.filter((item) => item.mediaType === 'image').length,
      videoCount: lastScan.videos.length,
      unsupportedCount: lastScan.unsupported.length,
    });
    return lastScan;
  });

  registerHandler('classification:save', async ({ rootPath, recommendations }) => {
    const root = requireActiveRoot(rootPath);
    if (!lastScan || normalizePath(lastScan.root) !== normalizePath(root)) {
      throw new Error('Scan the selected media folder again before saving detection results.');
    }
    if (!Array.isArray(recommendations) || recommendations.length > 10_000) {
      throw new TypeError('recommendations must be an array.');
    }
    const allowedHashes = new Set(lastScan.items.filter((item) => item.mediaType === 'image').map((item) => item.contentHash));
    const normalized = recommendations.map((recommendation) => {
      if (!recommendation || typeof recommendation !== 'object' || !allowedHashes.has(recommendation.contentHash)) {
        throw new Error('A detection result does not belong to the current scan.');
      }
      const faceCount = Number(recommendation.faceCount);
      const bodyCount = Number(recommendation.bodyCount);
      const maxConfidence = Number(recommendation.maxConfidence);
      if (!Number.isInteger(faceCount) || faceCount < 0 || !Number.isInteger(bodyCount) || bodyCount < 0) {
        throw new TypeError('Detection counts must be non-negative integers.');
      }
      if (!Number.isFinite(maxConfidence) || maxConfidence < 0 || maxConfidence > 1) {
        throw new TypeError('Detection confidence must be between zero and one.');
      }
      return {
        contentHash: recommendation.contentHash,
        hasPerson: faceCount > 0 || bodyCount > 0,
        faceCount,
        bodyCount,
        maxConfidence,
        detectorVersion: String(recommendation.detectorVersion || '').slice(0, 100),
        analyzedAt: new Date().toISOString(),
      };
    });
    await store.setClassificationRecommendations(normalized);
    return normalized;
  });

  registerHandler('thumbnail:get', async ({ rootPath, filePath }) => {
    const root = requireActiveRoot(rootPath);
    const target = assertWithinRoot(root, assertString(filePath, 'filePath'));
    const cacheKey = normalizePath(target);
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
    const paths = assertStringArray(filePaths, 'filePaths');
    assertTagWritableForCurrentScan(root, paths);
    const expectedHashes = expectedHashesForCurrentScan(root, paths);
    return runExclusiveMutation(async () => {
      const results = await mediaService.tagFiles(root, paths, progressReporter('tag'), expectedHashes);
      thumbnailCache.clear();
      return results;
    });
  });

  registerHandler('media:clear', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths');
    const expectedHashes = expectedHashesForCurrentScan(root, paths);
    return runExclusiveMutation(() => mediaService.clearFiles(root, paths.map((filePath) => ({ path: filePath })), progressReporter('clear'), expectedHashes));
  });

  registerHandler('media:remove-tags', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths');
    assertTagWritableForCurrentScan(root, paths);
    const expectedHashes = expectedHashesForCurrentScan(root, paths);
    return runExclusiveMutation(() => mediaService.removeTags(root, paths, progressReporter('remove'), expectedHashes));
  });

  registerHandler('media:normalize-tags', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths');
    assertTagWritableForCurrentScan(root, paths);
    const expectedHashes = expectedHashesForCurrentScan(root, paths);
    return runExclusiveMutation(() => mediaService.normalizeTags(root, paths, progressReporter('normalize'), expectedHashes));
  });

  registerHandler('media:dismiss-visual-variants', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths', 10_000);
    if (!lastScan || normalizePath(lastScan.root) !== normalizePath(root)) {
      throw new Error('Scan the selected media folder again before dismissing visual matches.');
    }
    return runExclusiveMutation(async () => {
      const itemsByPath = new Map(lastScan.items.map((item) => [normalizePath(item.path), item]));
      const results = [];
      const report = progressReporter('dismiss-visual');
      report({ percent: 0, key: 'progress.checkVisual' });
      for (let index = 0; index < paths.length; index += 1) {
        const requestedPath = paths[index];
        const filePath = assertWithinRoot(root, requestedPath);
        const item = itemsByPath.get(normalizePath(filePath));
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
  });

  registerHandler('media:trash', async ({ rootPath, filePaths }) => {
    const root = requireActiveRoot(rootPath);
    const paths = assertStringArray(filePaths, 'filePaths', 1_000).map((filePath) => assertWithinRoot(root, filePath));
    const expectedHashes = expectedHashesForCurrentScan(root, paths);
    return runExclusiveMutation(async () => {
      const results = [];
      const report = progressReporter('trash');
      report({ percent: 0, key: 'progress.preparingFiles' });
      for (let index = 0; index < paths.length; index += 1) {
        const filePath = paths[index];
        try {
          await verifyReviewedFiles([filePath], expectedHashes);
          await shell.trashItem(filePath);
          await store.audit('file-moved-to-recycle-bin', { filePath });
          thumbnailCache.delete(normalizePath(filePath));
          results.push({ path: filePath, ok: true });
        } catch (error) {
          results.push({ path: filePath, ok: false, message: error.message });
        }
        report({ percent: Math.round(((index + 1) / paths.length) * 100), key: 'progress.processedFiles', variables: { current: index + 1, total: paths.length } });
      }
      return results;
    });
  });

  registerHandler('media:show-in-folder', async ({ rootPath, filePath }) => {
    const root = requireActiveRoot(rootPath);
    shell.showItemInFolder(assertWithinRoot(root, assertString(filePath, 'filePath')));
    return true;
  });

  registerHandler('backups:list-expired', async () => mediaService.cleanupExpiredBackups(store.state.settings.backupRetentionDays));

  registerHandler('backups:delete-expired', async ({ backupPaths }) => {
    const requested = new Set(assertStringArray(backupPaths, 'backupPaths', 10_000).map((item) => path.resolve(item)));
    return runExclusiveMutation(async () => {
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
  });
}

async function initializeApplication() {
  registerAppProtocol();
  const userData = app.getPath('userData');
  store = new StateStore(path.join(userData, 'state.json'));
  await store.load();
  const exifToolPath = getExifToolPath({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, packaged: app.isPackaged });
  exiftool = new ExifToolClient(exifToolPath);
  await exiftool.version();
  mediaService = new MediaService({ exiftool, store, backupRoot: path.join(userData, DATA_DIRECTORY_NAME, 'backups') });
  const recovery = await mediaService.recoverInterruptedTransactions();
  setupIpc();
  await createWindow();
  void checkForUpdate();
  scheduleUpdateCheck();
  if (recovery.restored.length || recovery.unresolved.length) {
    const details = [];
    if (recovery.restored.length) details.push(`${recovery.restored.length} interrupted file operation(s) were safely restored.`);
    const preservedCount = recovery.restored.filter((item) => item.preservedPath).length;
    if (preservedCount) details.push(`${preservedCount} post-crash version(s) were preserved separately in the app data recovery folder.`);
    if (recovery.unresolved.length) details.push(`${recovery.unresolved.length} recovery snapshot(s) need manual attention in the app data backup folder.`);
    await dialog.showMessageBox(mainWindow, {
      type: recovery.unresolved.length ? 'warning' : 'info',
      title: APP_NAME,
      message: recovery.unresolved.length ? 'File recovery needs attention' : 'Interrupted operation restored',
      detail: details.join('\n'),
    });
  }
}

function reportStartupFailure(error) {
  const startupError = error instanceof Error ? error : new Error(String(error));
  if (store) store.audit('startup-failed', { message: startupError.message, stack: startupError.stack }).catch(() => {});
  dialog.showErrorBox(APP_NAME, startupError.message);
  app.quit();
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

if (hasSingleInstanceLock) app.whenReady().then(initializeApplication).catch(reportStartupFailure);
else app.quit();

app.on('window-all-closed', () => app.quit());

app.on('will-quit', () => {
  if (updateCheckTimer) clearTimeout(updateCheckTimer);
});

process.on('uncaughtException', async (error) => {
  if (store) await store.audit('uncaught-error', { message: error.message, stack: error.stack });
  dialog.showErrorBox(APP_NAME, error.message);
});
