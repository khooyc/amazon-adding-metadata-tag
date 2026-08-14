const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizePath, TAG_VALUE } = require('./constants.cjs');
const { sha256File } = require('./scanner.cjs');

function assertWithinRoot(rootPath, filePath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(filePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('The selected file is outside the active media folder.');
  }
  return target;
}

function safeBackupName(filePath) {
  const suffix = crypto.createHash('sha256').update(normalizePath(filePath)).digest('hex').slice(0, 16);
  return `${path.basename(filePath)}.${suffix}.before-tag`;
}

function createFileProgress(filePaths, stepsPerFile, onProgress) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  const totalSteps = filePaths.length * stepsPerFile;
  if (!totalSteps) report({ percent: 100, key: 'progress.noFiles' });
  return (fileIndex, step, key, variables = {}) => report({
    percent: Math.round(((fileIndex * stepsPerFile + step) / totalSteps) * 100),
    key,
    variables,
  });
}

class MediaService {
  constructor({ exiftool, store, backupRoot }) {
    this.exiftool = exiftool;
    this.store = store;
    this.backupRoot = backupRoot;
  }

  async ensureBackup(filePath) {
    const key = normalizePath(filePath);
    const existing = this.store.getBackup(key);
    if (existing) {
      try {
        await fs.access(existing.backupPath);
        return existing;
      } catch {
        // The prior backup was removed outside the app; create a new safety copy.
      }
    }
    const timestamp = new Date();
    const directory = path.join(
      this.backupRoot,
      timestamp.getUTCFullYear().toString(),
      String(timestamp.getUTCMonth() + 1).padStart(2, '0'),
      String(timestamp.getUTCDate()).padStart(2, '0'),
    );
    await fs.mkdir(directory, { recursive: true });
    const backupPath = path.join(directory, safeBackupName(filePath));
    await fs.copyFile(filePath, backupPath, fs.constants.COPYFILE_EXCL);
    const backup = {
      sourcePath: filePath,
      backupPath,
      createdAt: timestamp.toISOString(),
      sourceHash: await sha256File(filePath),
    };
    await this.store.setBackup(key, backup);
    return backup;
  }

  async restoreBackup(filePath, backup) {
    await fs.copyFile(backup.backupPath, filePath);
  }

  async createOperationSnapshot(filePath) {
    const directory = path.join(this.backupRoot, '.transactions');
    await fs.mkdir(directory, { recursive: true });
    const snapshotPath = path.join(directory, `${crypto.randomUUID()}.current`);
    await fs.copyFile(filePath, snapshotPath, fs.constants.COPYFILE_EXCL);
    return snapshotPath;
  }

  async discardOperationSnapshot(snapshotPath) {
    if (!snapshotPath) return;
    try {
      await fs.unlink(snapshotPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async restoreOperationSnapshot(filePath, snapshotPath) {
    await fs.copyFile(snapshotPath, filePath);
  }

  async tagFiles(rootPath, filePaths, onProgress) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let snapshotPath = null;
      try {
        progress(index, 0, 'progress.readCurrent', { current: index + 1, total: filePaths.length });
        const before = await this.exiftool.readMetadata(filePath);
        progress(index, 1, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        if (before.hasTag) {
          results.push({ path: filePath, ok: true, changed: false, verified: true, message: 'Already tagged and verified.' });
          continue;
        }
        await this.ensureBackup(filePath);
        snapshotPath = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.writeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.addTag(filePath);
        progress(index, 4, 'progress.saveVerified', { current: index + 1, total: filePaths.length });
        if (!operation.after.hasTag || operation.after.tagCount < 1) {
          throw new Error(`Verification failed: ${TAG_VALUE} was not found in XMP dc:subject.`);
        }
        const contentHash = await sha256File(filePath);
        await this.store.setDecision(contentHash, 'tagged', { filePath, verified: true, subjects: operation.after.subjects });
        await this.store.audit('tag-added-and-verified', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true, tagCount: operation.after.tagCount });
      } catch (error) {
        let restored = false;
        if (snapshotPath) {
          try {
            await this.restoreOperationSnapshot(filePath, snapshotPath);
            restored = true;
          } catch {
            restored = false;
          }
        }
        await this.store.audit('tag-failed', { filePath, message: error.message, restored });
        results.push({ path: filePath, ok: false, changed: false, verified: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(snapshotPath);
        progress(index, 5, 'progress.finished', { current: index + 1, total: filePaths.length });
      }
    }
    return results;
  }

  async clearFiles(rootPath, items, onProgress) {
    const results = [];
    const progress = createFileProgress(items, 3, onProgress);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const filePath = assertWithinRoot(rootPath, item.path);
      try {
        progress(index, 0, 'progress.readCurrent', { current: index + 1, total: items.length });
        const metadata = await this.exiftool.readMetadata(filePath);
        progress(index, 1, 'progress.fingerprintOne', { current: index + 1, total: items.length });
        if (metadata.hasTag) {
          results.push({ path: filePath, ok: false, message: 'Tagged files cannot be marked No tag needed. Use the separate Remove tag action.' });
          continue;
        }
        const contentHash = await sha256File(filePath);
        progress(index, 2, 'progress.saveDecision', { current: index + 1, total: items.length });
        await this.store.setDecision(contentHash, 'no-tag', { filePath, reviewedBy: 'local-human' });
        results.push({ path: filePath, ok: true });
      } catch (error) {
        await this.store.audit('no-tag-decision-failed', { filePath, message: error.message });
        results.push({ path: filePath, ok: false, message: error.message });
      } finally {
        progress(index, 3, 'progress.finished', { current: index + 1, total: items.length });
      }
    }
    return results;
  }

  async removeTags(rootPath, filePaths, onProgress) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let snapshotPath = null;
      try {
        progress(index, 0, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        await this.ensureBackup(filePath);
        snapshotPath = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.removeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.removeTag(filePath);
        progress(index, 4, 'progress.saveCorrection', { current: index + 1, total: filePaths.length });
        if (operation.after.hasTag) throw new Error('Verification failed: the tag is still present.');
        const contentHash = await sha256File(filePath);
        await this.store.setDecision(contentHash, 'no-tag', { filePath, correction: true, verified: true });
        await this.store.audit('tag-removed-and-verified', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true });
      } catch (error) {
        let restored = false;
        if (snapshotPath) {
          try {
            await this.restoreOperationSnapshot(filePath, snapshotPath);
            restored = true;
          } catch {
            restored = false;
          }
        }
        results.push({ path: filePath, ok: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(snapshotPath);
        progress(index, 5, 'progress.finished', { current: index + 1, total: filePaths.length });
      }
    }
    return results;
  }

  async normalizeTags(rootPath, filePaths, onProgress) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let snapshotPath = null;
      try {
        progress(index, 0, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        await this.ensureBackup(filePath);
        snapshotPath = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.normalizeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.normalizeTag(filePath);
        progress(index, 4, 'progress.saveVerified', { current: index + 1, total: filePaths.length });
        if (!operation.after.hasTag || operation.after.tagCount !== 1) throw new Error('Verification failed: expected exactly one tag.');
        await this.store.audit('duplicate-tag-normalized', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true });
      } catch (error) {
        let restored = false;
        if (snapshotPath) {
          try {
            await this.restoreOperationSnapshot(filePath, snapshotPath);
            restored = true;
          } catch {
            restored = false;
          }
        }
        results.push({ path: filePath, ok: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(snapshotPath);
        progress(index, 5, 'progress.finished', { current: index + 1, total: filePaths.length });
      }
    }
    return results;
  }

  async cleanupExpiredBackups(retentionDays) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const candidates = [];
    for (const [key, backup] of Object.entries(this.store.state.backups)) {
      if (Date.parse(backup.createdAt) < cutoff) candidates.push({ key, ...backup });
    }
    return candidates;
  }
}

module.exports = { MediaService, assertWithinRoot, safeBackupName };
