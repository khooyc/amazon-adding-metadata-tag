const fs = require('node:fs/promises');
const path = require('node:path');
const { normalizePath } = require('./constants.cjs');

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

  async writeState(state) {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    const temporaryFile = `${this.stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryFile, this.stateFile);
  }

  async save() {
    this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.writeState(this.state));
    return this.writeQueue;
  }

  async updateState(mutator) {
    const operation = this.writeQueue.catch(() => {}).then(async () => {
      const nextState = this.snapshot();
      const result = mutator(nextState);
      await this.writeState(nextState);
      this.state = nextState;
      return result;
    });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
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
    return this.updateState((state) => {
      state.decisions[contentHash] = record;
      this.appendAudit('decision-recorded', { contentHash, ...record }, state);
      return record;
    });
  }

  isVisualVariantDismissed(contentHash) {
    return Boolean(this.state.visualVariantDismissals[contentHash]);
  }

  async dismissVisualVariant(contentHash, details = {}) {
    const record = {
      dismissedAt: new Date().toISOString(),
      ...details,
    };
    return this.updateState((state) => {
      state.visualVariantDismissals[contentHash] = record;
      this.appendAudit('visual-variant-dismissed', { contentHash, ...record }, state);
      return record;
    });
  }

  getBackup(normalizedFilePath, sourceHash = null) {
    const direct = this.state.backups[normalizedFilePath];
    const matching = Object.values(this.state.backups).filter((backup) => (
      backup && backup.sourcePath && normalizePath(backup.sourcePath) === normalizedFilePath
    ));
    if (sourceHash) return [direct, ...matching].find((backup) => backup?.sourceHash === sourceHash) || null;
    return direct || matching.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt))[0] || null;
  }

  async setBackup(normalizedFilePath, backup) {
    const backupKey = `${normalizedFilePath}::${backup.sourceHash}`;
    await this.updateState((state) => {
      state.backups[backupKey] = backup;
      this.appendAudit('backup-created', { normalizedFilePath, backupKey, ...backup }, state);
    });
  }

  async removeBackup(backupKey) {
    await this.updateState((state) => {
      const backup = state.backups[backupKey];
      delete state.backups[backupKey];
      this.appendAudit('backup-removed', { backupKey, backup }, state);
    });
  }

  async setSetting(name, value) {
    await this.updateState((state) => { state.settings[name] = value; });
  }

  appendAudit(action, details = {}, state = this.state) {
    state.audit.push({ action, at: new Date().toISOString(), ...details });
  }

  async audit(action, details = {}) {
    await this.updateState((state) => this.appendAudit(action, details, state));
  }
}

module.exports = { StateStore, DEFAULT_STATE };
