const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { normalizePath, TAG_VALUE } = require('../electron/core/constants.cjs');
const { ExifToolClient, getExifToolPath } = require('../electron/core/exiftool.cjs');
const { MediaService, safeBackupName } = require('../electron/core/media-service.cjs');
const { perceptualHash } = require('../electron/core/scanner.cjs');
const { StateStore } = require('../electron/core/store.cjs');

const workspace = path.resolve(__dirname, '..');
const exiftool = new ExifToolClient(getExifToolPath({ appPath: workspace, resourcesPath: workspace, packaged: false }));

test('tag service backs up, preserves existing subjects, and reports verified only after re-read', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-service-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 60, height: 60, channels: 3, background: '#587467' } }).jpeg().toFile(filePath);
  await exiftool.execute(['-overwrite_original', '-XMP-dc:Subject+=preserve-me', filePath]);

  const stateFile = path.join(directory, '.private', 'state.json');
  const store = new StateStore(stateFile);
  await store.load();
  const service = new MediaService({ exiftool, store, backupRoot: path.join(directory, '.private', 'backups') });
  const original = await fs.readFile(filePath);
  const progress = [];
  const [result] = await service.tagFiles(directory, [filePath], (update) => progress.push(update.percent));

  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.length >= 4);
  assert.equal(progress.every((value, index) => index === 0 || value >= progress[index - 1]), true);
  const metadata = await exiftool.readMetadata(filePath);
  assert.deepEqual(metadata.subjects.sort(), [TAG_VALUE, 'preserve-me'].sort());
  const backups = Object.values(store.state.backups);
  assert.equal(backups.length, 1);
  assert.deepEqual(await fs.readFile(backups[0].backupPath), original);
  assert.equal(store.state.audit.some((entry) => entry.action === 'tag-added-and-verified'), true);
});

test('verification failure restores the current pre-operation snapshot', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-rollback-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#884433' } }).jpeg().toFile(filePath);
  const before = await fs.readFile(filePath);
  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const failingExiftool = {
    readMetadata: (...args) => exiftool.readMetadata(...args),
    addTag: async (target) => {
      await fs.appendFile(target, Buffer.from('damaged-operation'));
      return { changed: true, before: { subjects: [] }, after: { subjects: [], hasTag: false, tagCount: 0 } };
    },
  };
  const service = new MediaService({ exiftool: failingExiftool, store, backupRoot: path.join(directory, '.private', 'backups') });
  const [result] = await service.tagFiles(directory, [filePath]);
  assert.equal(result.ok, false);
  assert.equal(result.restored, true);
  assert.deepEqual(await fs.readFile(filePath), before);
});

test('startup recovery rolls back a prepared transaction interrupted by a crash', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-crash-recovery-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#113355' } }).jpeg().toFile(filePath);
  const before = await fs.readFile(filePath);
  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const backupRoot = path.join(directory, '.private', 'backups');
  const service = new MediaService({ exiftool, store, backupRoot });
  await service.createOperationSnapshot(filePath);
  await fs.appendFile(filePath, Buffer.from('interrupted-write'));
  const interrupted = await fs.readFile(filePath);

  const recovery = await service.recoverInterruptedTransactions();

  assert.equal(recovery.restored.length, 1);
  assert.equal(recovery.unresolved.length, 0);
  assert.deepEqual(await fs.readFile(filePath), before);
  assert.deepEqual(await fs.readFile(recovery.restored[0].preservedPath), interrupted);
  assert.deepEqual(await fs.readdir(path.join(backupRoot, '.transactions')), []);
});

test('startup recovery does not resurrect a destination deleted after a crash', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-deleted-recovery-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#113355' } }).jpeg().toFile(filePath);
  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const backupRoot = path.join(directory, '.private', 'backups');
  const service = new MediaService({ exiftool, store, backupRoot });
  await service.createOperationSnapshot(filePath);
  await fs.unlink(filePath);

  const recovery = await service.recoverInterruptedTransactions();

  assert.equal(recovery.restored.length, 0);
  assert.equal(recovery.unresolved.length, 1);
  await assert.rejects(fs.access(filePath), { code: 'ENOENT' });
});

test('startup recovery keeps a committed transaction result', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-committed-recovery-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#113355' } }).jpeg().toFile(filePath);
  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const backupRoot = path.join(directory, '.private', 'backups');
  const service = new MediaService({ exiftool, store, backupRoot });
  const transaction = await service.createOperationSnapshot(filePath);
  await fs.appendFile(filePath, Buffer.from('verified-result'));
  const committed = await fs.readFile(filePath);
  await service.commitOperationSnapshot(transaction);

  const recovery = await service.recoverInterruptedTransactions();

  assert.equal(recovery.restored.length, 0);
  assert.equal(recovery.unresolved.length, 0);
  assert.deepEqual(await fs.readFile(filePath), committed);
  assert.deepEqual(await fs.readdir(path.join(backupRoot, '.transactions')), []);
});

test('tagging rejects a file that changed after human review', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-stale-review-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#113355' } }).jpeg().toFile(filePath);
  const reviewedHash = await require('../electron/core/scanner.cjs').sha256File(filePath);
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#aa5522' } }).jpeg().toFile(filePath);

  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const service = new MediaService({ exiftool, store, backupRoot: path.join(directory, '.private', 'backups') });
  const expectedHashes = new Map([[normalizePath(filePath), reviewedHash]]);
  const [result] = await service.tagFiles(directory, [filePath], undefined, expectedHashes);

  assert.equal(result.ok, false);
  assert.match(result.message, /changed since it was reviewed/i);
  assert.equal(Object.keys(store.state.backups).length, 0);
  assert.equal((await exiftool.readMetadata(filePath)).hasTag, false);
});

test('an orphaned safety backup is adopted after an interrupted state save', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-orphan-backup-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#336688' } }).jpeg().toFile(filePath);

  const backupRoot = path.join(directory, '.private', 'backups');
  const reviewedHash = await require('../electron/core/scanner.cjs').sha256File(filePath);
  const now = new Date();
  const backupDirectory = path.join(
    backupRoot,
    now.getUTCFullYear().toString(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  );
  const orphanPath = path.join(backupDirectory, safeBackupName(filePath, reviewedHash));
  await fs.mkdir(backupDirectory, { recursive: true });
  await fs.copyFile(filePath, orphanPath);

  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const service = new MediaService({ exiftool, store, backupRoot });
  const backup = await service.ensureBackup(filePath);

  assert.equal(backup.backupPath, orphanPath);
  assert.equal(store.getBackup(normalizePath(filePath)).backupPath, orphanPath);
});

test('a replacement at the same path receives its own safety backup', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-versioned-backup-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'image.jpg');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#113355' } }).jpeg().toFile(filePath);

  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const service = new MediaService({ exiftool, store, backupRoot: path.join(directory, '.private', 'backups') });
  const first = await service.ensureBackup(filePath);
  await sharp({ create: { width: 40, height: 40, channels: 3, background: '#aa5522' } }).jpeg().toFile(filePath);
  const second = await service.ensureBackup(filePath);

  assert.notEqual(first.sourceHash, second.sourceHash);
  assert.notEqual(first.backupPath, second.backupPath);
  assert.equal(Object.keys(store.state.backups).length, 2);
  assert.equal(await require('../electron/core/scanner.cjs').sha256File(first.backupPath), first.sourceHash);
  assert.equal(await require('../electron/core/scanner.cjs').sha256File(second.backupPath), second.sourceHash);
});

test('WebP remains writable after fingerprinting and memory-buffer thumbnail decoding', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-webp-handle-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'SKU-1', 'previewed.webp');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await sharp({ create: { width: 90, height: 70, channels: 3, background: '#957349' } }).webp().toFile(filePath);

  assert.ok(await perceptualHash(filePath));
  const closedSource = await fs.readFile(filePath);
  await sharp(closedSource).resize(45, 35).jpeg().toBuffer();

  const store = new StateStore(path.join(directory, '.private', 'state.json'));
  await store.load();
  const service = new MediaService({ exiftool, store, backupRoot: path.join(directory, '.private', 'backups') });
  const [result] = await service.tagFiles(directory, [filePath]);
  assert.equal(result.ok, true);
  assert.equal((await exiftool.readMetadata(filePath)).hasTag, true);
});
