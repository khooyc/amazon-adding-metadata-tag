import { TAG_VALUE, inspectImage, tagAndVerifyImage } from './xmp.mjs';

const state = { items: [], busy: false, outputDirectory: null };
const saveAdapter = window.mediaSaveAdapter;
const supported = new Set(['image/jpeg', 'image/png']);
const $ = (id) => document.getElementById(id);
const elements = Object.fromEntries([
  'drop-zone', 'file-input', 'browse-files', 'gallery', 'empty-state', 'actions', 'detect-people',
  'select-people', 'select-all', 'clear-selection', 'process-save', 'save-mode', 'status-message',
  'count-images', 'count-people', 'count-selected', 'count-ready', 'progress-wrap', 'progress-fill',
  'progress-label', 'install-app', 'privacy-dialog', 'privacy-open', 'dialog-close',
].map((id) => [id, $(id)]));

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 ** 2).toFixed(1)} MB`;
}

function outputName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? `${name.slice(0, dot)}-tagged${name.slice(dot)}` : `${name}-tagged`;
}

function message(text, type = 'info') {
  elements['status-message'].textContent = text;
  elements['status-message'].dataset.type = type;
}

function setProgress(current, total, label) {
  const percent = total ? Math.round((current / total) * 100) : 0;
  elements['progress-wrap'].hidden = total === 0;
  elements['progress-fill'].style.width = `${percent}%`;
  elements['progress-label'].textContent = label;
}

function updateCounts() {
  elements['count-images'].textContent = state.items.length;
  elements['count-people'].textContent = state.items.filter((item) => item.detection?.hasPerson).length;
  elements['count-selected'].textContent = state.items.filter((item) => item.selected).length;
  elements['count-ready'].textContent = state.items.filter((item) => item.output).length;
}

function detectionBadge(item) {
  if (item.error) return `<span class="badge badge-error">${escapeHtml(item.error)}</span>`;
  if (item.detecting) return '<span class="badge badge-working">Detecting…</span>';
  if (!item.detection) return '<span class="badge">Not analyzed</span>';
  if (!item.detection.hasPerson) return '<span class="badge">No person detected</span>';
  const parts = [];
  if (item.detection.faceCount) parts.push(`${item.detection.faceCount} face${item.detection.faceCount === 1 ? '' : 's'}`);
  if (item.detection.bodyCount) parts.push(`${item.detection.bodyCount} body pose${item.detection.bodyCount === 1 ? '' : 's'}`);
  return `<span class="badge badge-person">${parts.join(' · ')}</span>`;
}

function render() {
  elements['empty-state'].hidden = state.items.length > 0;
  elements.actions.hidden = state.items.length === 0;
  elements.gallery.innerHTML = state.items.map((item) => `
    <article class="media-card ${item.selected ? 'selected' : ''}" data-id="${item.id}">
      <button class="card-select" type="button" aria-label="${item.selected ? 'Deselect' : 'Select'} ${escapeHtml(item.file.name)}" data-select="${item.id}">
        <span class="check">${item.selected ? '✓' : ''}</span>
        <img src="${item.preview}" alt="Preview of ${escapeHtml(item.file.name)}">
      </button>
      <div class="card-body">
        <div class="badges">${detectionBadge(item)}${item.metadata.hasTag ? '<span class="badge badge-verified">XMP already tagged</span>' : ''}${item.output ? '<span class="badge badge-verified">Output verified</span>' : ''}</div>
        <h3 title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</h3>
        <p>${item.metadata.format.toUpperCase()} · ${formatBytes(item.file.size)}</p>
      </div>
    </article>`).join('');
  updateCounts();
  elements['process-save'].disabled = state.busy || !state.items.some((item) => item.selected);
  elements['detect-people'].disabled = state.busy;
}

async function addFiles(fileList) {
  const incoming = [...fileList];
  const rejected = incoming.filter((file) => !supported.has(file.type) && !/\.(jpe?g|png)$/i.test(file.name));
  const candidates = incoming.filter((file) => !rejected.includes(file));
  let added = 0;
  for (const file of candidates) {
    try {
      const metadata = inspectImage(await file.arrayBuffer(), file.name);
      state.items.push({ id: crypto.randomUUID(), file, metadata, preview: URL.createObjectURL(file), selected: false, detection: null, output: null });
      added += 1;
    } catch (error) {
      rejected.push(file);
      console.warn(error);
    }
  }
  render();
  if (added) message(`${added} image${added === 1 ? '' : 's'} added. Detection and tagging stay on this device.`, 'success');
  if (rejected.length) message(`${rejected.length} unsupported or unreadable file${rejected.length === 1 ? ' was' : 's were'} skipped. Use JPEG or PNG.`, 'warning');
}

async function detectPeople() {
  const candidates = state.items.filter((item) => !item.detection);
  if (!candidates.length) return message('All images have already been analyzed.', 'info');
  state.busy = true;
  render();
  setProgress(0, candidates.length, 'Loading local face and body models…');
  let found = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const item = candidates[index];
    item.detecting = true;
    item.error = null;
    render();
    try {
      item.detection = await window.webPeopleDetector.detect(item.file);
      item.selected = item.detection.hasPerson;
      if (item.detection.hasPerson) found += 1;
    } catch (error) {
      item.error = error.message || 'Detection failed';
    } finally {
      item.detecting = false;
      setProgress(index + 1, candidates.length, `Analyzed ${index + 1} of ${candidates.length}`);
      render();
    }
  }
  state.busy = false;
  render();
  message(`Detection complete: ${found} of ${candidates.length} image${candidates.length === 1 ? '' : 's'} may contain people. Review the selection before tagging.`, 'success');
}

async function writeOutput(item, mode) {
  const type = item.metadata.format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = new Blob([item.output.bytes], { type });
  await saveAdapter.save({ blob, name: outputName(item.file.name), mode, destination: state.outputDirectory });
}

async function processAndSave() {
  const selected = state.items.filter((item) => item.selected);
  if (!selected.length) return;
  const mode = elements['save-mode'].value;
  try {
    state.outputDirectory = await saveAdapter.prepare(mode);
  } catch (error) {
    return message(error.message, 'warning');
  }
  state.busy = true;
  render();
  let completed = 0;
  let failed = 0;
  setProgress(0, selected.length, 'Preparing verified copies…');
  for (let index = 0; index < selected.length; index += 1) {
    const item = selected[index];
    try {
      item.output = tagAndVerifyImage(await item.file.arrayBuffer(), item.file.name);
      await writeOutput(item, mode);
      completed += 1;
    } catch (error) {
      item.error = error.message || 'Tagging failed';
      failed += 1;
    }
    setProgress(index + 1, selected.length, `Tagged, verified and saved ${index + 1} of ${selected.length}`);
    render();
    if (mode === 'download') await new Promise((resolve) => setTimeout(resolve, 120));
  }
  state.busy = false;
  render();
  message(`${completed} verified image${completed === 1 ? '' : 's'} saved${failed ? `; ${failed} failed` : ''}. Your original dropped files were not changed.`, failed ? 'warning' : 'success');
}

function setSelected(predicate) {
  for (const item of state.items) item.selected = predicate(item);
  render();
}

elements['browse-files'].addEventListener('click', () => elements['file-input'].click());
elements['file-input'].addEventListener('change', (event) => addFiles(event.target.files));
elements['drop-zone'].addEventListener('dragover', (event) => { event.preventDefault(); elements['drop-zone'].classList.add('dragging'); });
elements['drop-zone'].addEventListener('dragleave', () => elements['drop-zone'].classList.remove('dragging'));
elements['drop-zone'].addEventListener('drop', (event) => {
  event.preventDefault();
  elements['drop-zone'].classList.remove('dragging');
  addFiles(event.dataTransfer.files);
});
elements.gallery.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select]');
  if (!button) return;
  const item = state.items.find((candidate) => candidate.id === button.dataset.select);
  if (item) item.selected = !item.selected;
  render();
});
elements['detect-people'].addEventListener('click', detectPeople);
elements['select-people'].addEventListener('click', () => setSelected((item) => Boolean(item.detection?.hasPerson)));
elements['select-all'].addEventListener('click', () => setSelected(() => true));
elements['clear-selection'].addEventListener('click', () => setSelected(() => false));
elements['process-save'].addEventListener('click', processAndSave);
elements['privacy-open'].addEventListener('click', () => elements['privacy-dialog'].showModal());
elements['dialog-close'].addEventListener('click', () => elements['privacy-dialog'].close());

let installPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  elements['install-app'].hidden = false;
});
elements['install-app'].addEventListener('click', async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  installPrompt = null;
  elements['install-app'].hidden = true;
});

if (saveAdapter.kind === 'web' && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
elements['save-mode'].querySelector('[value="folder"]').disabled = !saveAdapter.supportsFolder;
message(`Ready. Drop JPEG or PNG images. The exact tag is ${TAG_VALUE}.`);
render();
