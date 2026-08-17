const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { NO_SKU_GROUP, normalizePath } = require('../electron/core/constants.cjs');
const { ExifToolClient, getExifToolPath } = require('../electron/core/exiftool.cjs');
const { assertWithinRoot } = require('../electron/core/media-service.cjs');
const { scanMediaLibrary, sha256File } = require('../electron/core/scanner.cjs');
const { StateStore } = require('../electron/core/store.cjs');

const workspace = path.resolve(__dirname, '..');
const exiftool = new ExifToolClient(getExifToolPath({ appPath: workspace, resourcesPath: workspace, packaged: false }));

async function makeImage(filePath, color, width = 120, height = 120) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 90 }).toFile(filePath);
}

test('scan groups by first Seller SKU folder and remembers no-tag decisions by content', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-scan-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = path.join(directory, 'SKU-ONE', 'main.jpg');
  const duplicate = path.join(directory, 'SKU-ONE', 'archive', 'copy.jpg');
  const second = path.join(directory, 'SKU-TWO', 'second.jpg');
  const rootFile = path.join(directory, 'unassigned.jpg');
  const video = path.join(directory, 'SKU-ONE', 'demo.mp4');
  const avi = path.join(directory, 'SKU-TWO', 'demo.avi');
  await makeImage(first, '#225f48');
  await fs.mkdir(path.dirname(duplicate), { recursive: true });
  await fs.copyFile(first, duplicate);
  await makeImage(second, '#d59a2b', 140, 120);
  await makeImage(rootFile, '#444444');
  await fs.writeFile(video, 'manual-video-fixture');
  await fs.writeFile(avi, 'manual-video-fixture');

  const store = new StateStore(path.join(directory, '.state', 'state.json'));
  await store.load();
  const contentHash = await sha256File(first);
  await store.setDecision(contentHash, 'no-tag', { reviewedBy: 'test' });

  const progress = [];
  const result = await scanMediaLibrary(directory, exiftool, store, (update) => progress.push(update.percent));
  assert.equal(result.items.length, 6);
  assert.equal(result.videos.length, 2);
  assert.equal(result.items.find((item) => item.path === video).mediaType, 'video');
  assert.equal(result.items.find((item) => item.path === video).status, 'review');
  assert.equal(result.items.find((item) => item.path === video).tagWritable, true);
  assert.equal(result.items.find((item) => item.path === avi).mediaType, 'video');
  assert.equal(result.items.find((item) => item.path === avi).tagWritable, false);
  assert.equal(result.items.find((item) => item.path === rootFile).sku, NO_SKU_GROUP);
  assert.equal(result.items.find((item) => item.path === rootFile).status, 'review');
  assert.equal(result.unassigned.length, 0);
  assert.equal(result.items.filter((item) => item.status === 'cleared').length, 2);
  assert.equal(result.items.find((item) => item.path === first).exactDuplicateCount, 2);
  assert.deepEqual(result.skuSummaries.map((summary) => summary.sku), [NO_SKU_GROUP, 'SKU-ONE', 'SKU-TWO']);
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  assert.equal(progress.every((value, index) => index === 0 || value >= progress[index - 1]), true);
});

test('scan continues and reports an issue when a media file disappears', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-disappearing-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = path.join(directory, 'SKU-ONE', 'first.jpg');
  const disappearing = path.join(directory, 'SKU-ONE', 'disappearing.jpg');
  await makeImage(first, '#225f48');
  await makeImage(disappearing, '#774422');

  const disappearingExiftool = {
    readMetadataBatch: async (filePaths, onProgress) => {
      const records = await exiftool.readMetadataBatch([first]);
      await fs.unlink(disappearing);
      onProgress?.({ completed: filePaths.length, total: filePaths.length });
      return records;
    },
  };
  const store = new StateStore(path.join(directory, '.state', 'state.json'));
  await store.load();
  const result = await scanMediaLibrary(directory, disappearingExiftool, store);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].path, first);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].path, disappearing);
});

test('scan falls back to per-file metadata reads when a batch fails', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-metadata-fallback-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const readable = path.join(directory, 'SKU-ONE', 'readable.jpg');
  const unreadable = path.join(directory, 'SKU-ONE', 'unreadable.jpg');
  await makeImage(readable, '#225f48');
  await makeImage(unreadable, '#774422');
  const fallbackExiftool = {
    readMetadataBatch: async () => { throw new Error('batch failed'); },
    readMetadata: async (filePath) => {
      if (filePath === unreadable) throw new Error('file metadata failed');
      return exiftool.readMetadata(filePath);
    },
  };
  const store = new StateStore(path.join(directory, '.state', 'state.json'));
  await store.load();
  const result = await scanMediaLibrary(directory, fallbackExiftool, store);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].path, readable);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].path, unreadable);
});

test('path guard rejects files outside the selected media folder', () => {
  const root = path.resolve(os.tmpdir(), 'MediaLibrary');
  assert.equal(assertWithinRoot(root, path.join(root, 'SKU-1', 'image.jpg')), path.join(root, 'SKU-1', 'image.jpg'));
  assert.throws(() => assertWithinRoot(root, path.resolve(os.tmpdir(), 'Elsewhere', 'image.jpg')), /outside/);
  assert.throws(() => assertWithinRoot(root, root), /outside/);
});

test('path identity folds case only on Windows', () => {
  const mixedCase = path.join(os.tmpdir(), 'Seller-SKU', 'Photo.JPG');
  assert.equal(normalizePath(mixedCase, 'win32'), path.resolve(mixedCase).toLocaleLowerCase('en-US'));
  assert.equal(normalizePath(mixedCase, 'darwin'), path.resolve(mixedCase));
  assert.equal(normalizePath(mixedCase, 'linux'), path.resolve(mixedCase));
});

test('state persistence recovers after one failed write', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-store-recovery-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new StateStore(directory);

  await assert.rejects(store.save());
  store.stateFile = path.join(directory, 'state.json');
  store.state.settings.lastRoot = 'recovered';
  await store.save();

  const saved = JSON.parse(await fs.readFile(store.stateFile, 'utf8'));
  assert.equal(saved.settings.lastRoot, 'recovered');
});

test('a failed state transaction does not persist later as if it succeeded', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-store-rollback-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = new StateStore(directory);

  await assert.rejects(store.setDecision('failed-hash', 'no-tag', { reviewedBy: 'test' }));
  assert.equal(store.getDecision('failed-hash'), null);

  store.stateFile = path.join(directory, 'state.json');
  await store.setSetting('lastRoot', 'recovered');
  const reloaded = new StateStore(store.stateFile);
  await reloaded.load();
  assert.equal(reloaded.getDecision('failed-hash'), null);
});

test('human visual-match dismissal persists by content fingerprint and does not hide exact duplicates', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-dismiss-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const original = path.join(directory, 'SKU-ONE', 'original.jpg');
  const exactCopy = path.join(directory, 'SKU-ONE', 'exact-copy.jpg');
  const visualVariant = path.join(directory, 'SKU-ONE', 'visual-variant.jpg');
  await makeImage(original, '#4c755f', 300, 300);
  await fs.copyFile(original, exactCopy);
  await sharp(original).resize(280, 280).jpeg({ quality: 84 }).toFile(visualVariant);

  const store = new StateStore(path.join(directory, '.state', 'state.json'));
  await store.load();
  const before = await scanMediaLibrary(directory, exiftool, store);
  const variantBefore = before.items.find((item) => item.path === visualVariant);
  assert.ok(variantBefore.visualVariantGroup);

  await store.dismissVisualVariant(variantBefore.contentHash, { reviewedBy: 'test' });
  const after = await scanMediaLibrary(directory, exiftool, store);
  const variantAfter = after.items.find((item) => item.path === visualVariant);
  const originalAfter = after.items.find((item) => item.path === original);
  const exactAfter = after.items.find((item) => item.path === exactCopy);
  assert.equal(variantAfter.visualVariantGroup, null);
  assert.equal(originalAfter.exactDuplicateCount, 2);
  assert.equal(exactAfter.exactDuplicateCount, 2);

  const reloaded = new StateStore(path.join(directory, '.state', 'state.json'));
  await reloaded.load();
  assert.equal(reloaded.isVisualVariantDismissed(variantBefore.contentHash), true);
});
