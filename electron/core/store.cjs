const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_STATE = Object.freeze({
  version: 1,
  settings: {
    lastRoot: null,
    backupRetentionDays: 30,
  },
  decisions: {},
  visualVariantDismissals: {},
  backups: {},
  audit: [],
});

function cloneDefaultState() {
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

class StateStore {
  constructor(stateFile) {
    this.stateFile = stateFile;
    this.state = cloneDefaultState();
    this.writeQueue = Promise.resolve();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf8');
      const parsed = JSON.parse(raw);
      this.state = {
        ...cloneDefaultState(),
        ...parsed,
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        decisions: parsed.decisions || {},
        visualVariantDismissals: parsed.visualVariantDismissals || {},
        backups: parsed.backups || {},
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.save();
    }
    return this.snapshot();
  }

  snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  async save() {
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
      const temporaryFile = `${this.stateFile}.${process.pid}.tmp`;
      await fs.writeFile(temporaryFile, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
      await fs.rename(temporaryFile, this.stateFile);
    });
    return this.writeQueue;
  }

  getDecision(contentHash) {
    return this.state.decisions[contentHash] || null;
  }

  async setDecision(contentHash, decision, details = {}) {
    const record = {
      decision,
      decidedAt: new Date().toISOString(),
      ...details,
    };
    this.state.decisions[contentHash] = record;
    this.appendAudit('decision-recorded', { contentHash, ...record });
    await this.save();
    return record;
  }

  isVisualVariantDismissed(contentHash) {
    return Boolean(this.state.visualVariantDismissals[contentHash]);
  }

  async dismissVisualVariant(contentHash, details = {}) {
    const record = {
      dismissedAt: new Date().toISOString(),
      ...details,
    };
    this.state.visualVariantDismissals[contentHash] = record;
    this.appendAudit('visual-variant-dismissed', { contentHash, ...record });
    await this.save();
    return record;
  }

  getBackup(normalizedFilePath) {
    return this.state.backups[normalizedFilePath] || null;
  }

  async setBackup(normalizedFilePath, backup) {
    this.state.backups[normalizedFilePath] = backup;
    this.appendAudit('backup-created', { normalizedFilePath, ...backup });
    await this.save();
  }

  async removeBackup(normalizedFilePath) {
    const backup = this.state.backups[normalizedFilePath];
    delete this.state.backups[normalizedFilePath];
    this.appendAudit('backup-removed', { normalizedFilePath, backup });
    await this.save();
  }

  async setSetting(name, value) {
    this.state.settings[name] = value;
    await this.save();
  }

  appendAudit(action, details = {}) {
    this.state.audit.push({ action, at: new Date().toISOString(), ...details });
  }

  async audit(action, details = {}) {
    this.appendAudit(action, details);
    await this.save();
  }
}

module.exports = { StateStore, DEFAULT_STATE };
