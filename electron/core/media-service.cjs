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

function safeBackupName(filePath, sourceHash = '') {
  const suffix = crypto.createHash('sha256').update(normalizePath(filePath)).digest('hex').slice(0, 16);
  const contentSuffix = sourceHash ? `.${sourceHash.slice(0, 16)}` : '';
  return `${path.basename(filePath)}.${suffix}${contentSuffix}.before-tag`;
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

  async assertReviewedContent(filePath, expectedHashes) {
    if (!expectedHashes) return;
    const expectedHash = expectedHashes.get(normalizePath(filePath));
    if (!expectedHash) throw new Error('Scan and review this file again before changing it.');
    const currentHash = await sha256File(filePath);
    if (currentHash !== expectedHash) throw new Error('This file changed since it was reviewed. Scan and review it again.');
  }

  async ensureBackup(filePath) {
    const key = normalizePath(filePath);
    const sourceHash = await sha256File(filePath);
    const existing = this.store.getBackup(key, sourceHash);
    if (existing) {
      try {
        await fs.access(existing.backupPath);
        if (await sha256File(existing.backupPath) === sourceHash) return existing;
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
    const backupPath = path.join(directory, safeBackupName(filePath, sourceHash));
    try {
      await fs.copyFile(filePath, backupPath, fs.constants.COPYFILE_EXCL);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // A prior crash may have created the safety copy before its state record
      // was saved. Adopt that immutable copy instead of overwriting it.
    }
    const backupStat = await fs.stat(backupPath);
    const backupHash = await sha256File(backupPath);
    if (backupHash !== sourceHash) {
      throw new Error('The existing safety backup does not match the reviewed file.');
    }
    const backup = {
      sourcePath: filePath,
      backupPath,
      createdAt: backupStat.birthtime.toISOString(),
      sourceHash: backupHash,
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
    const transactionId = crypto.randomUUID();
    const transaction = {
      transactionId,
      sourcePath: filePath,
      snapshotPath: path.join(directory, `${transactionId}.current`),
      manifestPath: path.join(directory, `${transactionId}.json`),
      createdAt: new Date().toISOString(),
      status: 'prepared',
    };
    try {
      await fs.copyFile(filePath, transaction.snapshotPath, fs.constants.COPYFILE_EXCL);
      transaction.snapshotHash = await sha256File(transaction.snapshotPath);
      await this.writeOperationManifest(transaction);
      return transaction;
    } catch (error) {
      await this.discardOperationSnapshot(transaction);
      throw error;
    }
  }

  async writeOperationManifest(transaction) {
    const temporaryPath = `${transaction.manifestPath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify({
      transactionId: transaction.transactionId,
      sourcePath: transaction.sourcePath,
      createdAt: transaction.createdAt,
      snapshotHash: transaction.snapshotHash,
      status: transaction.status,
    }, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, transaction.manifestPath);
  }

  async commitOperationSnapshot(transaction) {
    if (!transaction) return;
    transaction.status = 'committed';
    await this.writeOperationManifest(transaction);
  }

  async discardOperationSnapshot(transaction) {
    if (!transaction) return;
    for (const target of [transaction.snapshotPath, transaction.manifestPath]) {
      if (!target) continue;
      try {
        await fs.unlink(target);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  async restoreOperationSnapshot(filePath, transaction) {
    await fs.copyFile(transaction.snapshotPath, filePath);
  }

  async recoverInterruptedTransactions() {
    const directory = path.join(this.backupRoot, '.transactions');
    await fs.mkdir(directory, { recursive: true });
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const restored = [];
    const unresolved = [];
    const manifestIds = new Set(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => entry.name.slice(0, -5)));

    for (const transactionId of manifestIds) {
      const transaction = {
        transactionId,
        snapshotPath: path.join(directory, `${transactionId}.current`),
        manifestPath: path.join(directory, `${transactionId}.json`),
      };
      try {
        const manifest = JSON.parse(await fs.readFile(transaction.manifestPath, 'utf8'));
        if (manifest.transactionId !== transactionId || !path.isAbsolute(manifest.sourcePath)) throw new Error('Invalid recovery manifest.');
        transaction.sourcePath = manifest.sourcePath;
        transaction.createdAt = manifest.createdAt;
        transaction.snapshotHash = manifest.snapshotHash;
        transaction.status = manifest.status;
        if (!/^[a-f0-9]{64}$/i.test(transaction.snapshotHash || '') || await sha256File(transaction.snapshotPath) !== transaction.snapshotHash) {
          throw new Error('Recovery snapshot integrity check failed.');
        }
        if (transaction.status === 'prepared') {
          let currentHash;
          try {
            currentHash = await sha256File(transaction.sourcePath);
          } catch (error) {
            if (error.code === 'ENOENT') throw new Error('The original destination was deleted after the interruption; it was left deleted for manual review.');
            throw error;
          }
          let preservedPath = null;
          if (currentHash !== transaction.snapshotHash) {
            const recoveryDirectory = path.join(this.backupRoot, '.recovery');
            await fs.mkdir(recoveryDirectory, { recursive: true });
            preservedPath = path.join(recoveryDirectory, `${transactionId}.${path.basename(transaction.sourcePath)}.post-crash`);
            try {
              await fs.copyFile(transaction.sourcePath, preservedPath, fs.constants.COPYFILE_EXCL);
            } catch (error) {
              if (error.code !== 'EEXIST' || await sha256File(preservedPath) !== currentHash) throw error;
            }
          }
          await this.restoreOperationSnapshot(transaction.sourcePath, transaction);
          restored.push({ sourcePath: transaction.sourcePath, createdAt: transaction.createdAt, preservedPath });
          await this.store.audit('interrupted-operation-restored', { sourcePath: transaction.sourcePath, createdAt: transaction.createdAt, preservedPath });
        } else if (transaction.status !== 'committed') {
          throw new Error('Unknown recovery transaction status.');
        }
        await this.discardOperationSnapshot(transaction);
      } catch (error) {
        unresolved.push({ transactionId, message: error.message });
      }
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.current') && !manifestIds.has(entry.name.slice(0, -8))) {
        unresolved.push({ transactionId: entry.name.slice(0, -8), message: 'Recovery snapshot has no manifest.' });
      }
    }
    return { restored, unresolved };
  }

  async tagFiles(rootPath, filePaths, onProgress, expectedHashes = null) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let transaction = null;
      try {
        progress(index, 0, 'progress.readCurrent', { current: index + 1, total: filePaths.length });
        await this.assertReviewedContent(filePath, expectedHashes);
        const before = await this.exiftool.readMetadata(filePath);
        progress(index, 1, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        if (before.hasTag) {
          results.push({ path: filePath, ok: true, changed: false, verified: true, message: 'Already tagged and verified.' });
          continue;
        }
        await this.ensureBackup(filePath);
        transaction = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.writeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.addTag(filePath);
        progress(index, 4, 'progress.saveVerified', { current: index + 1, total: filePaths.length });
        if (!operation.after.hasTag || operation.after.tagCount < 1) {
          throw new Error(`Verification failed: ${TAG_VALUE} was not found in XMP dc:subject.`);
        }
        const contentHash = await sha256File(filePath);
        await this.store.setDecision(contentHash, 'tagged', { filePath, verified: true, subjects: operation.after.subjects });
        await this.store.audit('tag-added-and-verified', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        await this.commitOperationSnapshot(transaction);
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true, tagCount: operation.after.tagCount });
      } catch (error) {
        let restored = false;
        if (transaction) {
          try {
            await this.restoreOperationSnapshot(filePath, transaction);
            restored = true;
          } catch {
            restored = false;
          }
        }
        await this.store.audit('tag-failed', { filePath, message: error.message, restored });
        results.push({ path: filePath, ok: false, changed: false, verified: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(transaction);
        progress(index, 5, 'progress.finished', { current: index + 1, total: filePaths.length });
      }
    }
    return results;
  }

  async clearFiles(rootPath, items, onProgress, expectedHashes = null) {
    const results = [];
    const progress = createFileProgress(items, 3, onProgress);
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const filePath = assertWithinRoot(rootPath, item.path);
      try {
        progress(index, 0, 'progress.readCurrent', { current: index + 1, total: items.length });
        await this.assertReviewedContent(filePath, expectedHashes);
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

  async removeTags(rootPath, filePaths, onProgress, expectedHashes = null) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let transaction = null;
      try {
        progress(index, 0, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        await this.assertReviewedContent(filePath, expectedHashes);
        await this.ensureBackup(filePath);
        transaction = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.removeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.removeTag(filePath);
        progress(index, 4, 'progress.saveCorrection', { current: index + 1, total: filePaths.length });
        if (operation.after.hasTag) throw new Error('Verification failed: the tag is still present.');
        const contentHash = await sha256File(filePath);
        await this.store.setDecision(contentHash, 'no-tag', { filePath, correction: true, verified: true });
        await this.store.audit('tag-removed-and-verified', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        await this.commitOperationSnapshot(transaction);
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true });
      } catch (error) {
        let restored = false;
        if (transaction) {
          try {
            await this.restoreOperationSnapshot(filePath, transaction);
            restored = true;
          } catch {
            restored = false;
          }
        }
        results.push({ path: filePath, ok: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(transaction);
        progress(index, 5, 'progress.finished', { current: index + 1, total: filePaths.length });
      }
    }
    return results;
  }

  async normalizeTags(rootPath, filePaths, onProgress, expectedHashes = null) {
    const results = [];
    const progress = createFileProgress(filePaths, 5, onProgress);
    for (let index = 0; index < filePaths.length; index += 1) {
      const requestedPath = filePaths[index];
      const filePath = assertWithinRoot(rootPath, requestedPath);
      let transaction = null;
      try {
        progress(index, 0, 'progress.checkingBackup', { current: index + 1, total: filePaths.length });
        await this.assertReviewedContent(filePath, expectedHashes);
        await this.ensureBackup(filePath);
        transaction = await this.createOperationSnapshot(filePath);
        progress(index, 2, 'progress.normalizeReread', { current: index + 1, total: filePaths.length });
        const operation = await this.exiftool.normalizeTag(filePath);
        progress(index, 4, 'progress.saveVerified', { current: index + 1, total: filePaths.length });
        if (!operation.after.hasTag || operation.after.tagCount !== 1) throw new Error('Verification failed: expected exactly one tag.');
        await this.store.audit('duplicate-tag-normalized', { filePath, before: operation.before.subjects, after: operation.after.subjects });
        await this.commitOperationSnapshot(transaction);
        results.push({ path: filePath, ok: true, changed: operation.changed, verified: true });
      } catch (error) {
        let restored = false;
        if (transaction) {
          try {
            await this.restoreOperationSnapshot(filePath, transaction);
            restored = true;
          } catch {
            restored = false;
          }
        }
        results.push({ path: filePath, ok: false, restored, message: error.message });
      } finally {
        await this.discardOperationSnapshot(transaction);
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
