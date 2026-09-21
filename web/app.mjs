import { TAG_VALUE, inspectImage, tagAndVerifyImage, tagAndVerifyVideo } from './xmp.mjs';

const state = { items: [], busy: false, outputDirectory: null };
const saveAdapter = window.mediaSaveAdapter;
const imageTypes = new Set(['image/jpeg', 'image/png']);
const videoTypes = new Set(['video/mp4', 'video/quicktime', 'video/x-m4v']);
const imagePattern = /\.(jpe?g|png)$/i;
const videoPattern = /\.(mp4|mov|m4v)$/i;
const $ = (id) => document.getElementById(id);
const elements = Object.fromEntries([
  'drop-zone', 'file-input', 'folder-input', 'browse-files', 'browse-folder', 'gallery', 'empty-state', 'actions', 'detect-people',
  'select-people', 'select-all', 'clear-selection', 'process-save', 'save-mode', 'status-message',
  'count-images', 'count-people', 'count-selected', 'count-ready', 'progress-wrap', 'progress-fill',
  'progress-label', 'install-app', 'desktop-dialog', 'privacy-dialog', 'privacy-open', 'dialog-close',
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

function mediaKind(file) {
  if (imageTypes.has(file.type) || imagePattern.test(file.name)) return 'image';
  if (videoTypes.has(file.type) || videoPattern.test(file.name)) return 'video';
  return null;
}

function detectionBadge(item) {
  if (item.mediaType === 'video') {
    if (item.watched) return '<span class="badge badge-verified">Full video watched</span>';
    return `<span class="badge badge-watch">Watch full video · ${Math.round((item.watchProgress || 0) * 100)}%</span>`;
  }
  if (item.error) return `<span class="badge badge-error">${escapeHtml(item.error)}</span>`;
  if (item.detecting) return '<span class="badge badge-working">Detecting…</span>';
  if (!item.detection) return '<span class="badge">Not analyzed</span>';
  if (!item.detection.hasPerson) return '<span class="badge">No person detected</span>';
  const parts = [];
  if (item.detection.faceCount) parts.push(`${item.detection.faceCount} face${item.detection.faceCount === 1 ? '' : 's'}`);
  if (item.detection.bodyCount) parts.push(`${item.detection.bodyCount} body pose${item.detection.bodyCount === 1 ? '' : 's'}`);
  return `<span class="badge badge-person">${parts.join(' · ')}</span>`;
}

function mediaPreview(item) {
  const label = escapeHtml(item.file.name);
  if (item.mediaType === 'video') {
    return `<video class="media-preview" data-video-id="${item.id}" src="${item.preview}" controls preload="metadata" playsinline aria-label="Video preview of ${label}"></video>`;
  }
  return `<img class="media-preview" src="${item.preview}" alt="Preview of ${label}">`;
}

function watchedFraction(video) {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return 0;
  let played = 0;
  for (let index = 0; index < video.played.length; index += 1) played += video.played.end(index) - video.played.start(index);
  return Math.min(1, played / video.duration);
}

function bindVideoProgress() {
  for (const video of elements.gallery.querySelectorAll('[data-video-id]')) {
    const update = () => {
      const item = state.items.find((candidate) => candidate.id === video.dataset.videoId);
      if (!item || item.watched) return;
      item.watchProgress = Math.max(item.watchProgress || 0, watchedFraction(video));
      const badge = video.closest('.media-card')?.querySelector('.badge-watch');
      if (badge) badge.textContent = `Watch full video · ${Math.round(item.watchProgress * 100)}%`;
      if (item.watchProgress >= 0.95) {
        item.watched = true;
        render();
        message(`${item.file.name} is fully watched and ready for your decision.`, 'success');
      }
    };
    video.addEventListener('timeupdate', update);
    video.addEventListener('ended', update);
  }
}

function render() {
  elements['empty-state'].hidden = state.items.length > 0;
  elements.actions.hidden = state.items.length === 0;
  elements.gallery.innerHTML = state.items.map((item) => `
    <article class="media-card ${item.selected ? 'selected' : ''}" data-id="${item.id}">
      <div class="card-preview">
        ${mediaPreview(item)}
        <button class="check" type="button" aria-label="${item.selected ? 'Deselect' : 'Select'} ${escapeHtml(item.file.name)}" data-select="${item.id}" ${item.mediaType === 'video' && !item.watched ? 'disabled' : ''}>${item.selected ? '✓' : ''}</button>
        ${item.mediaType === 'video' ? '<p class="video-warning">Watch the full video before deciding</p>' : ''}
      </div>
      <div class="card-body">
        <div class="badges">${detectionBadge(item)}${item.metadata.hasTag ? '<span class="badge badge-verified">XMP already tagged</span>' : ''}${item.output ? '<span class="badge badge-verified">Output verified</span>' : ''}</div>
        <h3 title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</h3>
        <p>${item.mediaType === 'video' ? 'VIDEO' : item.metadata.format.toUpperCase()} · ${item.metadata.format.toUpperCase()} · ${formatBytes(item.file.size)}</p>
      </div>
    </article>`).join('');
  bindVideoProgress();
  updateCounts();
  elements['process-save'].disabled = state.busy || !state.items.some((item) => item.selected);
  elements['detect-people'].disabled = state.busy;
}

async function addFiles(fileList, source = 'files') {
  const incoming = [...fileList];
  const rejected = incoming.filter((file) => !mediaKind(file));
  const candidates = incoming.filter((file) => !rejected.includes(file));
  let added = 0;
  for (const file of candidates) {
    try {
      const type = mediaKind(file);
      const format = file.name.split('.').pop()?.toLowerCase() || (type === 'video' ? 'mp4' : 'jpeg');
      const metadata = type === 'image' ? inspectImage(await file.arrayBuffer(), file.name) : { format, subjects: [], hasTag: false, xmp: '', deferred: true };
      state.items.push({ id: crypto.randomUUID(), file, mediaType: type, metadata, preview: URL.createObjectURL(file), selected: false, detection: null, output: null, watched: false, watchProgress: 0 });
      added += 1;
    } catch (error) {
      rejected.push(file);
      console.warn(error);
    }
  }
  render();
  if (added) {
    const sourceNote = source === 'folder' ? ' added from the selected folder' : ' added';
    message(`${added} media file${added === 1 ? '' : 's'}${sourceNote}. Processing stays on this device.`, 'success');
  }
  if (rejected.length) message(`${rejected.length} unsupported or unreadable file${rejected.length === 1 ? ' was' : 's were'} skipped. Use JPEG, PNG, MP4, MOV, or M4V.`, 'warning');
}

async function detectPeople() {
  const candidates = state.items.filter((item) => item.mediaType === 'image' && !item.detection);
  if (!candidates.length) return message('There are no unanalyzed images. Videos require a full manual watch instead.', 'info');
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
  const type = item.file.type || (item.mediaType === 'video' ? 'video/mp4' : item.metadata.format === 'png' ? 'image/png' : 'image/jpeg');
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
      const bytes = await item.file.arrayBuffer();
      item.output = item.mediaType === 'video' ? tagAndVerifyVideo(bytes, item.file.name) : tagAndVerifyImage(bytes, item.file.name);
      item.metadata = item.output.after;
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
  message(`${completed} verified media cop${completed === 1 ? 'y' : 'ies'} saved${failed ? `; ${failed} failed` : ''}. Your original files were not changed.`, failed ? 'warning' : 'success');
}

function setSelected(predicate) {
  for (const item of state.items) item.selected = predicate(item);
  render();
}

elements['browse-files'].addEventListener('click', () => elements['file-input'].click());
elements['browse-folder'].addEventListener('click', () => elements['folder-input'].click());
elements['file-input'].addEventListener('change', async (event) => {
  await addFiles(event.target.files, 'files');
  event.target.value = '';
});
elements['folder-input'].addEventListener('change', async (event) => {
  await addFiles(event.target.files, 'folder');
  event.target.value = '';
});
elements['drop-zone'].addEventListener('dragover', (event) => { event.preventDefault(); elements['drop-zone'].classList.add('dragging'); });
elements['drop-zone'].addEventListener('dragleave', () => elements['drop-zone'].classList.remove('dragging'));
elements['drop-zone'].addEventListener('drop', (event) => {
  event.preventDefault();
  elements['drop-zone'].classList.remove('dragging');
  addFiles(event.dataTransfer.files, 'files');
});
elements.gallery.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select]');
  if (!button) return;
  const item = state.items.find((candidate) => candidate.id === button.dataset.select);
  if (item?.mediaType === 'video' && !item.watched) return message('Watch the full video before making a tag decision.', 'warning');
  if (item) item.selected = !item.selected;
  render();
});
elements['detect-people'].addEventListener('click', detectPeople);
elements['select-people'].addEventListener('click', () => setSelected((item) => Boolean(item.detection?.hasPerson)));
elements['select-all'].addEventListener('click', () => setSelected((item) => item.mediaType === 'image' || item.watched));
elements['clear-selection'].addEventListener('click', () => setSelected(() => false));
elements['process-save'].addEventListener('click', processAndSave);
elements['privacy-open'].addEventListener('click', () => elements['privacy-dialog'].showModal());
elements['dialog-close'].addEventListener('click', () => elements['privacy-dialog'].close());

elements['install-app'].addEventListener('click', () => elements['desktop-dialog'].showModal());
for (const trigger of document.querySelectorAll('[data-open-desktop]')) trigger.addEventListener('click', () => elements['desktop-dialog'].showModal());

// Keep this site's install action focused on the native desktop downloads.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
});

if (saveAdapter.kind === 'web' && 'serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
elements['save-mode'].querySelector('[value="folder"]').disabled = !saveAdapter.supportsFolder;
message(`Ready. Drop JPEG, PNG, MP4, MOV, or M4V files. The exact tag is ${TAG_VALUE}.`);
render();
