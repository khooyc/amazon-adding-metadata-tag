const api = window.mediaTagger;
const peopleDetector = window.peopleDetector;
const classificationView = window.classificationView;
const { normalizeLocale, supportedLocales, translate } = window.appI18n;

const LANGUAGE_KEY = 'amazon-metadata-tag-language-v1';
const THEME_KEY = 'amazon-metadata-tag-theme-v1';
const TUTORIAL_SEEN_KEY = 'amazon-metadata-tag-tutorial-v1';
const NO_SKU_GROUP = '__NO_SKU__';

function initialLocale() {
  const saved = localStorage.getItem(LANGUAGE_KEY);
  return supportedLocales.includes(saved) ? saved : normalizeLocale(navigator.language);
}

function initialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return ['system', 'light', 'dark'].includes(saved) ? saved : 'system';
}

const state = {
  root: null,
  scan: null,
  view: 'review',
  sku: null,
  query: '',
  selected: new Set(),
  busy: false,
  platform: navigator.platform.toLowerCase().includes('mac') ? 'darwin' : 'win32',
  locale: initialLocale(),
  theme: initialTheme(),
  tutorialStep: 0,
  progress: null,
  update: {
    state: 'checking',
    currentVersion: null,
    latestVersion: null,
    releaseUrl: null,
  },
};

const elements = Object.fromEntries([
  'choose-folder', 'scan-folder', 'detect-people', 'folder-strip', 'folder-path', 'welcome', 'welcome-choose', 'library',
  'sku-list', 'all-skus', 'search', 'select-visible', 'select-all-media', 'selection-bar', 'selected-label', 'selection-note',
  'review-actions', 'tagged-actions', 'duplicate-actions', 'mark-no-tag', 'add-tag', 'normalize-tag',
  'remove-tag', 'not-duplicate', 'trash-files', 'summary-cards', 'gallery', 'empty-view', 'view-eyebrow', 'view-title',
  'view-description', 'progress-overlay', 'progress-title', 'progress-detail', 'progress-percent', 'progress-track', 'progress-fill',
  'confirm-dialog', 'dialog-eyebrow', 'dialog-title', 'dialog-message', 'dialog-files', 'dialog-confirm', 'toast-region',
  'backup-manager', 'software-disclaimer-link', 'creator-link',
  'update-indicator', 'update-label',
  'language-select', 'theme-select', 'tutorial-open', 'tutorial-dialog', 'tutorial-step-count', 'tutorial-dots',
  'tutorial-icon', 'tutorial-step-title', 'tutorial-step-body', 'tutorial-skip', 'tutorial-back', 'tutorial-next',
  'count-review', 'count-people', 'count-tagged', 'count-cleared', 'count-duplicates', 'count-issues',
].map((id) => [id, document.getElementById(id)]));

const VIEW_COPY = {
  review: ['view.reviewEyebrow', 'view.reviewTitle', 'view.reviewDescription'],
  people: ['view.peopleEyebrow', 'view.peopleTitle', 'view.peopleDescription'],
  tagged: ['view.taggedEyebrow', 'view.taggedTitle', 'view.taggedDescription'],
  cleared: ['view.clearedEyebrow', 'view.clearedTitle', 'view.clearedDescription'],
  duplicates: ['view.duplicatesEyebrow', 'view.duplicatesTitle', 'view.duplicatesDescription'],
  issues: ['view.issuesEyebrow', 'view.issuesTitle', 'view.issuesDescription'],
};

const TUTORIAL_STEPS = [
  ['tutorial.step1Title', 'tutorial.step1Body'],
  ['tutorial.step2Title', 'tutorial.step2Body'],
  ['tutorial.step3Title', 'tutorial.step3Body'],
  ['tutorial.step4Title', 'tutorial.step4Body'],
  ['tutorial.step5Title', 'tutorial.step5Body'],
];

const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

const MAC_TRANSLATION_KEYS = {
  'action.recycleBin': 'action.trashMac',
  'toast.movedRecycle': 'toast.movedTrashMac',
  'confirm.trashTitle': 'confirm.trashTitleMac',
  'confirm.trashLabel': 'confirm.trashLabelMac',
};

function t(key, variables = {}) {
  const platformKey = state.platform === 'darwin' ? (MAC_TRANSLATION_KEYS[key] || key) : key;
  return translate(state.locale, platformKey, variables);
}

function renderUpdateStatus(status = state.update) {
  state.update = { ...state.update, ...(status || {}) };
  const statusKey = state.update.state || 'unavailable';
  const labelKey = statusKey === 'available'
    ? 'update.available'
    : statusKey === 'current'
      ? 'update.current'
      : statusKey === 'checking'
        ? 'update.checking'
        : 'update.unavailable';
  const variables = statusKey === 'available' ? { version: state.update.latestVersion || '' } : {};
  elements['update-indicator'].dataset.state = statusKey;
  elements['update-indicator'].classList.toggle('has-update', statusKey === 'available');
  elements['update-indicator'].disabled = statusKey === 'checking';
  elements['update-label'].textContent = t(labelKey, variables);
  elements['update-indicator'].setAttribute('aria-label', t('update.aria'));
  elements['update-indicator'].title = t(labelKey, variables);
}

function groupLabel(group) {
  return group === NO_SKU_GROUP ? t('group.noSku') : group;
}

function resolvedTheme() {
  return state.theme === 'system' ? (systemTheme.matches ? 'dark' : 'light') : state.theme;
}

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  elements['theme-select'].value = state.theme;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale;
  document.title = t('app.name');
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder));
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
  });
  elements['language-select'].value = state.locale;
  if (state.root) elements['folder-path'].textContent = state.root;
  if (state.progress) {
    elements['progress-title'].textContent = t(state.progress.titleKey, state.progress.variables);
    elements['progress-detail'].textContent = state.progress.detailKey
      ? t(state.progress.detailKey, state.progress.variables)
      : state.progress.detail;
  }
  renderUpdateStatus();
  renderTutorial();
  if (state.scan) render();
}

function setLocale(locale) {
  if (!supportedLocales.includes(locale)) return;
  state.locale = locale;
  localStorage.setItem(LANGUAGE_KEY, locale);
  applyStaticTranslations();
}

function setTheme(preference) {
  if (!['system', 'light', 'dark'].includes(preference)) return;
  state.theme = preference;
  localStorage.setItem(THEME_KEY, preference);
  applyTheme();
}

function renderTutorial() {
  const [titleKey, bodyKey] = TUTORIAL_STEPS[state.tutorialStep];
  const current = state.tutorialStep + 1;
  const total = TUTORIAL_STEPS.length;
  elements['tutorial-step-count'].textContent = t('tutorial.stepCount', { current, total });
  elements['tutorial-icon'].textContent = current;
  elements['tutorial-step-title'].textContent = t(titleKey);
  elements['tutorial-step-body'].textContent = t(bodyKey);
  elements['tutorial-dots'].innerHTML = TUTORIAL_STEPS.map((_step, index) => `<span class="tutorial-dot ${index === state.tutorialStep ? 'active' : ''}"></span>`).join('');
  elements['tutorial-back'].disabled = state.tutorialStep === 0;
  elements['tutorial-next'].textContent = state.tutorialStep === total - 1 ? t('button.finish') : t('button.next');
}

function showTutorial(force = false) {
  if (!force && localStorage.getItem(TUTORIAL_SEEN_KEY) === 'seen') return;
  state.tutorialStep = 0;
  renderTutorial();
  if (!elements['tutorial-dialog'].open) elements['tutorial-dialog'].showModal();
}

function finishTutorial() {
  localStorage.setItem(TUTORIAL_SEEN_KEY, 'seen');
  elements['tutorial-dialog'].close('complete');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.textContent = message;
  elements['toast-region'].append(item);
  setTimeout(() => item.remove(), 5200);
}

function setProgress(percent, detail, detailKey, variables = {}) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  elements['progress-percent'].textContent = `${value}%`;
  elements['progress-fill'].style.width = `${value}%`;
  elements['progress-track'].setAttribute('aria-valuenow', String(value));
  if (detailKey) {
    state.progress = { ...(state.progress || {}), detailKey, variables, detail };
    elements['progress-detail'].textContent = t(detailKey, variables);
  } else if (detail) {
    state.progress = { ...(state.progress || {}), detailKey: null, variables: {}, detail };
    elements['progress-detail'].textContent = detail;
  }
}

function setBusy(busy, titleKey = 'progress.workingTitle', detailKey = 'progress.keepOpen', variables = {}) {
  state.busy = busy;
  state.progress = { titleKey, detailKey, variables, detail: '' };
  elements['progress-title'].textContent = t(titleKey, variables);
  elements['progress-detail'].textContent = t(detailKey, variables);
  if (busy) setProgress(0, '', detailKey, variables);
  elements['progress-overlay'].classList.toggle('hidden', !busy);
}

api.onProgress(({ percent, detail, key, variables }) => {
  if (state.busy) setProgress(percent, detail, key, variables || {});
});

api.onUpdateStatus((status) => renderUpdateStatus(status));

function counts() {
  const items = state.scan?.items || [];
  return {
    review: items.filter((item) => item.status === 'review').length,
    people: items.filter((item) => item.mediaType === 'image' && item.status === 'review' && currentRecommendation(item)?.hasPerson).length,
    tagged: items.filter((item) => item.status === 'tagged').length,
    cleared: items.filter((item) => item.status === 'cleared').length,
    duplicates: items.filter((item) => item.exactDuplicateCount > 1 || item.visualVariantGroup).length,
    issues: (state.scan?.unsupported.length || 0) + (state.scan?.unassigned.length || 0) + (state.scan?.issues.length || 0),
  };
}

function updateCounts() {
  const values = counts();
  for (const name of Object.keys(values)) elements[`count-${name}`].textContent = values[name];
}

function itemsForView() {
  if (!state.scan) return [];
  if (state.view === 'review') return state.scan.items.filter((item) => item.status === 'review');
  if (state.view === 'people') return state.scan.items.filter((item) => item.mediaType === 'image' && item.status === 'review' && currentRecommendation(item)?.hasPerson);
  if (state.view === 'tagged') return state.scan.items.filter((item) => item.status === 'tagged');
  if (state.view === 'cleared') return state.scan.items.filter((item) => item.status === 'cleared');
  if (state.view === 'duplicates') return state.scan.items.filter((item) => item.exactDuplicateCount > 1 || item.visualVariantGroup);
  return [];
}

function itemsForCurrentView() {
  let items = itemsForView();
  if (state.sku) items = items.filter((item) => item.sku === state.sku);
  if (state.query) {
    const query = state.query.toLocaleLowerCase();
    items = items.filter((item) => `${groupLabel(item.sku)} ${item.name} ${item.relativePath}`.toLocaleLowerCase().includes(query));
  }
  return items;
}

function allItemsByPath() {
  return new Map((state.scan?.items || []).map((item) => [item.path, item]));
}

function currentRecommendation(item) {
  return classificationView.currentRecommendation(item, peopleDetector.DETECTOR_VERSION);
}

function expandExactDuplicates(paths) {
  const selectedItems = (state.scan?.items || []).filter((item) => paths.includes(item.path));
  const hashes = new Set(selectedItems.map((item) => item.contentHash));
  return (state.scan?.items || [])
    .filter((item) => hashes.has(item.contentHash) && (
      state.view === 'review' || state.view === 'people' ? item.status === 'review' : state.view === 'tagged' ? item.status === 'tagged' : true
    ))
    .map((item) => item.path);
}

function setSelected(filePath, checked) {
  const affected = ['review', 'people', 'tagged'].includes(state.view) ? expandExactDuplicates([filePath]) : [filePath];
  for (const targetPath of affected) checked ? state.selected.add(targetPath) : state.selected.delete(targetPath);
  renderGallery();
  renderSelectionBar();
}

function renderSidebar() {
  const summaries = state.scan?.skuSummaries || [];
  elements['sku-list'].innerHTML = summaries.map((summary) => {
    const relevant = state.view === 'duplicates'
      ? state.scan.items.filter((item) => item.sku === summary.sku && (item.exactDuplicateCount > 1 || item.visualVariantGroup)).length
      : state.view === 'people'
        ? state.scan.items.filter((item) => item.sku === summary.sku && item.mediaType === 'image' && item.status === 'review' && currentRecommendation(item)?.hasPerson).length
      : state.view === 'issues'
        ? [...state.scan.unsupported, ...state.scan.unassigned, ...state.scan.issues].filter((item) => item.sku === summary.sku).length
        : summary[state.view] || 0;
    return `<button class="sku-button ${state.sku === summary.sku ? 'active' : ''}" data-sku="${escapeText(summary.sku)}"><span>${escapeText(groupLabel(summary.sku))}</span><span>${relevant}</span></button>`;
  }).join('');
  elements['sku-list'].querySelectorAll('[data-sku]').forEach((button) => button.addEventListener('click', () => {
    state.sku = button.dataset.sku;
    state.selected.clear();
    render();
  }));
}

function renderSummary(items) {
  const unique = new Set(items.map((item) => item.contentHash)).size;
  const exactCopies = items.filter((item) => item.exactDuplicateCount > 1).length;
  const warnings = items.filter((item) => item.tagCount > 1).length;
  const pills = [
    `<span class="summary-pill"><strong>${items.length}</strong> ${t('summary.filesShown')}</span>`,
    `<span class="summary-pill"><strong>${unique}</strong> ${t('summary.uniqueContents')}</span>`,
  ];
  if (state.view === 'tagged') {
    const people = classificationView.taggedPeopleSummary(items, peopleDetector.DETECTOR_VERSION);
    if (people.analyzedFiles) {
      pills.push(`<span class="summary-pill"><strong>${people.peopleFiles}</strong> ${t('summary.peopleDetected')}</span>`);
    }
  }
  if (exactCopies) pills.push(`<span class="summary-pill"><strong>${exactCopies}</strong> ${t('summary.exactCopies')}</span>`);
  if (warnings) pills.push(`<span class="summary-pill"><strong>${warnings}</strong> ${t('summary.duplicateWarnings')}</span>`);
  elements['summary-cards'].innerHTML = pills.join('');
}

function exactKeepPath(item) {
  if (!item.exactDuplicateGroup) return null;
  return state.scan.items
    .filter((candidate) => candidate.contentHash === item.contentHash)
    .sort((first, second) => first.path.length - second.path.length || first.path.localeCompare(second.path))[0]?.path;
}

function mediaCard(item) {
  const isVideo = item.mediaType === 'video';
  const badges = [];
  const recommendation = currentRecommendation(item);
  if (isVideo && item.tagWritable === false) badges.push(`<span class="badge badge-warning">${t('badge.videoTagUnsupported')}</span>`);
  if (recommendation?.faceCount) badges.push(`<span class="badge badge-person">${t('badge.faces', { count: recommendation.faceCount })}</span>`);
  if (recommendation?.bodyCount) badges.push(`<span class="badge badge-person">${t('badge.bodies', { count: recommendation.bodyCount })}</span>`);
  if (recommendation && !recommendation.hasPerson) badges.push(`<span class="badge badge-muted">${t('badge.noPerson')}</span>`);
  if (item.tagCount > 1) badges.push(`<span class="badge badge-warning">${t('badge.tagCount', { count: item.tagCount })}</span>`);
  else if (item.hasTag) badges.push(`<span class="badge badge-ok">${t('badge.verified')}</span>`);
  if (item.exactDuplicateCount > 1) {
    badges.push(`<span class="badge">${exactKeepPath(item) === item.path ? t('badge.suggestedKeep') : t('badge.exactCopy', { count: item.exactDuplicateCount })}</span>`);
  } else if (item.visualVariantGroup) badges.push(`<span class="badge">${t('badge.visualVariant')}</span>`);
  return `
    <article class="media-card ${state.selected.has(item.path) ? 'selected' : ''}" data-path="${escapeText(item.path)}" data-media-type="${isVideo ? 'video' : 'image'}">
      <div class="thumbnail-wrap">
        ${(state.view !== 'cleared') ? `<input class="card-select" type="checkbox" aria-label="${escapeText(t('card.select', { name: item.name }))}" ${state.selected.has(item.path) ? 'checked' : ''}>` : ''}
        <span class="thumbnail-placeholder ${isVideo ? 'video-placeholder' : ''}">${isVideo ? '▶' : t('card.loadingPreview')}</span>
        ${isVideo ? '' : `<img class="hidden" alt="${escapeText(item.name)}">`}
        <div class="badge-row">${badges.join('')}</div>
      </div>
      <div class="card-body">
        <p class="card-title" title="${escapeText(item.name)}">${escapeText(item.name)}</p>
        <div class="card-meta"><span>${escapeText(groupLabel(item.sku))}</span><span>${isVideo ? t('card.videoFile') : `${item.width || '?'} × ${item.height || '?'}`}</span><span>${formatBytes(item.size)}</span></div>
        ${isVideo ? `<p class="video-review-warning" role="note">${escapeText(t('card.videoWarning'))}</p>` : ''}
        ${isVideo && item.tagWritable === false ? `<p class="video-review-warning" role="note">${escapeText(t('card.videoTagUnsupported'))}</p>` : ''}
        <div class="card-path" title="${escapeText(item.relativePath)}">${escapeText(item.relativePath)}</div>
      </div>
      <div class="card-footer"><button data-show-folder>${t('card.showInFolder')}</button></div>
    </article>`;
}

async function hydrateThumbnails(cards) {
  for (const card of cards) {
    const filePath = card.dataset.path;
    if (card.dataset.mediaType === 'video') continue;
    try {
      const source = await api.getThumbnail(state.root, filePath);
      if (!card.isConnected || card.dataset.path !== filePath) continue;
      const image = card.querySelector('img');
      image.src = source;
      image.classList.remove('hidden');
      card.querySelector('.thumbnail-placeholder').classList.add('hidden');
    } catch {
      const placeholder = card.querySelector('.thumbnail-placeholder');
      if (placeholder) placeholder.textContent = t('card.previewUnavailable');
    }
  }
}

function renderIssues() {
  const all = [
    ...state.scan.unsupported.map((item) => ({ ...item, kind: t('issue.unsupported', { extension: item.extension }) })),
    ...state.scan.unassigned.map((item) => ({ ...item, kind: t('issue.notInsideSku') })),
    ...state.scan.issues.map((item) => ({ ...item, kind: t('issue.unreadable', { reason: item.reason }) })),
  ].filter((item) => (!state.sku || item.sku === state.sku) && (!state.query || `${item.sku || ''} ${item.name} ${item.path}`.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())));
  elements.gallery.innerHTML = all.map((item) => `
    <article class="media-card" data-path="${escapeText(item.path)}">
      <div class="thumbnail-wrap"><span class="thumbnail-placeholder">${escapeText(item.kind)}</span></div>
      <div class="card-body"><p class="card-title">${escapeText(item.name)}</p><div class="card-meta"><span>${escapeText(item.sku || t('issue.noSku'))}</span><span>${escapeText(item.extension || '')}</span></div><div class="card-path">${escapeText(item.path)}</div></div>
      <div class="card-footer"><button data-show-folder>${t('card.showInFolder')}</button></div>
    </article>`).join('');
  elements['summary-cards'].innerHTML = `<span class="summary-pill"><strong>${all.length}</strong> ${t('summary.manualAttention')}</span>`;
  elements['empty-view'].classList.toggle('hidden', all.length > 0);
  wireCards();
}

function wireCards() {
  const cards = [...elements.gallery.querySelectorAll('.media-card')];
  cards.forEach((card) => {
    const checkbox = card.querySelector('.card-select');
    checkbox?.addEventListener('click', (event) => event.stopPropagation());
    checkbox?.addEventListener('change', (event) => setSelected(card.dataset.path, event.target.checked));
    if (checkbox) {
      card.classList.add('selectable');
      card.addEventListener('click', (event) => {
        if (event.target.closest('button, input')) return;
        setSelected(card.dataset.path, !state.selected.has(card.dataset.path));
      });
    }
    card.querySelector('[data-show-folder]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      api.showInFolder(state.root, card.dataset.path);
    });
  });
  return cards;
}

function renderGallery() {
  if (!state.scan) return;
  if (state.view === 'issues') {
    renderIssues();
    return;
  }
  const items = itemsForCurrentView();
  renderSummary(items);
  elements.gallery.innerHTML = items.map(mediaCard).join('');
  elements['empty-view'].classList.toggle('hidden', items.length > 0);
  hydrateThumbnails(wireCards());
}

function renderSelectionBar() {
  const count = state.selected.size;
  const selectableView = ['review', 'people', 'tagged', 'duplicates'].includes(state.view);
  elements['selection-bar'].classList.toggle('hidden', !selectableView || count === 0);
  elements['selected-label'].textContent = t('selection.selected', { count });
  elements['review-actions'].classList.toggle('hidden', !['review', 'people'].includes(state.view));
  elements['tagged-actions'].classList.toggle('hidden', state.view !== 'tagged');
  elements['duplicate-actions'].classList.toggle('hidden', state.view !== 'duplicates');
  elements['selection-note'].textContent = t(state.view === 'duplicates' ? 'selection.duplicateHelp' : 'selection.exactIncluded');
}

function render() {
  updateCounts();
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  const [eyebrowKey, titleKey, descriptionKey] = VIEW_COPY[state.view];
  const title = t(titleKey);
  elements['view-eyebrow'].textContent = t(eyebrowKey);
  elements['view-title'].textContent = state.sku ? `${title} — ${groupLabel(state.sku)}` : title;
  elements['view-description'].textContent = t(descriptionKey);
  elements['select-visible'].classList.toggle('hidden', !['review', 'people', 'tagged'].includes(state.view));
  elements['select-all-media'].classList.toggle('hidden', !['review', 'people', 'tagged', 'duplicates'].includes(state.view));
  renderSidebar();
  renderGallery();
  renderSelectionBar();
}

async function scan(options = {}) {
  const force = options?.force === true;
  if (!state.root || (state.busy && !force)) return;
  setBusy(true, 'busy.scanTitle', 'busy.scanDetail');
  try {
    state.scan = await api.scan(state.root);
    state.selected.clear();
    state.sku = null;
    elements.welcome.classList.add('hidden');
    elements.library.classList.remove('hidden');
    render();
    toast(t('toast.scanComplete', { count: state.scan.items.length }));
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function chooseFolder() {
  if (state.busy) return;
  try {
    const chosen = await api.chooseFolder(state.locale);
    if (!chosen) return;
    state.root = chosen;
    state.scan = null;
    state.selected.clear();
    elements['folder-path'].textContent = chosen;
    elements['folder-strip'].classList.add('active');
    elements['scan-folder'].disabled = false;
    elements.welcome.classList.remove('hidden');
    elements.library.classList.add('hidden');
    toast(t('toast.folderSelected'));
  } catch (error) {
    toast(error.message, 'error');
  }
}

function applySavedRecommendations(recommendations) {
  const byHash = new Map(recommendations.map((recommendation) => [recommendation.contentHash, recommendation]));
  for (const item of state.scan.items) {
    const recommendation = byHash.get(item.contentHash);
    if (recommendation) item.classificationRecommendation = recommendation;
  }
}

async function analyzePeople() {
  if (!state.scan || state.busy) return;
  const startingView = state.view;
  const candidates = classificationView.detectionCandidates(state.scan.items, startingView, peopleDetector.DETECTOR_VERSION);
  if (!candidates.length) return toast(t('toast.peopleAlreadyAnalyzed'));

  setBusy(true, 'busy.peopleTitle', 'busy.peopleLoading', { total: candidates.length });
  const pending = [];
  let failed = 0;
  let people = 0;
  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      try {
        const thumbnail = await api.getThumbnail(state.root, item.path);
        const recommendation = await peopleDetector.detectDataUrl(thumbnail);
        pending.push({ contentHash: item.contentHash, ...recommendation });
        if (recommendation.hasPerson) people += 1;
        if (pending.length >= 12) {
          const saved = await api.saveClassificationRecommendations(state.root, pending.splice(0));
          applySavedRecommendations(saved);
        }
      } catch (error) {
        if (error?.code === 'PEOPLE_DETECTOR_INIT_FAILED') throw error;
        failed += 1;
      }
      setProgress(
        Math.round(((index + 1) / candidates.length) * 100),
        '',
        'progress.peopleAnalyzing',
        { current: index + 1, total: candidates.length },
      );
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (pending.length) {
      const saved = await api.saveClassificationRecommendations(state.root, pending.splice(0));
      applySavedRecommendations(saved);
    }
    state.view = classificationView.viewAfterPeopleDetection(startingView);
    state.selected.clear();
    render();
    toast(t(failed ? 'toast.peopleCompleteWithFailures' : 'toast.peopleComplete', { people, total: candidates.length, failed }), failed ? 'error' : 'success');
  } catch (error) {
    toast(t('toast.peopleFailed', { message: error.message }), 'error');
  } finally {
    setBusy(false);
  }
}

function selectedPaths() {
  return [...state.selected];
}

async function runReviewAction(action) {
  let paths = selectedPaths();
  if (!paths.length) return;
  let skippedUnsupported = 0;
  if (action === 'tag') {
    const items = allItemsByPath();
    const writablePaths = paths.filter((filePath) => items.get(filePath)?.tagWritable !== false);
    skippedUnsupported = paths.length - writablePaths.length;
    paths = writablePaths;
    if (!paths.length) return toast(t('toast.videoTagUnsupported', { count: skippedUnsupported }), 'error');
  }
  setBusy(true, action === 'tag' ? 'busy.tagging' : 'busy.recording', action === 'tag' ? 'busy.tagDetail' : 'busy.clearDetail');
  try {
    const results = action === 'tag' ? await api.tag(state.root, paths) : await api.clear(state.root, paths);
    const failed = results.filter((result) => !result.ok);
    if (failed.length) toast(t('toast.filesFailed', { count: failed.length, message: failed[0].message || '' }), 'error');
    else if (action === 'tag' && skippedUnsupported) toast(t('toast.taggedSkippedUnsupported', { tagged: results.length, skipped: skippedUnsupported }), 'error');
    else toast(t(action === 'tag' ? 'toast.tagged' : 'toast.cleared', { count: results.length }));
    await scan({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function confirmAction({ eyebrow = t('confirm.eyebrow'), title, message, paths = [], confirmLabel = t('button.confirm'), danger = true }) {
  elements['dialog-eyebrow'].textContent = eyebrow;
  elements['dialog-title'].textContent = title;
  elements['dialog-message'].textContent = message;
  elements['dialog-files'].innerHTML = paths.length ? paths.map((item) => `<div>${escapeText(item)}</div>`).join('') : `<div>${t('confirm.noFiles')}</div>`;
  elements['dialog-confirm'].textContent = confirmLabel;
  elements['dialog-confirm'].className = danger ? 'button button-danger' : 'button button-primary';
  elements['confirm-dialog'].showModal();
  return new Promise((resolve) => elements['confirm-dialog'].addEventListener('close', () => resolve(elements['confirm-dialog'].returnValue === 'confirm'), { once: true }));
}

async function destructiveFileAction(kind) {
  const paths = selectedPaths();
  if (!paths.length) return;
  const copy = kind === 'trash'
    ? { title: t('confirm.trashTitle'), message: t('confirm.trashMessage'), label: t('confirm.trashLabel') }
    : { title: t('confirm.removeTitle'), message: t('confirm.removeMessage'), label: t('confirm.removeLabel') };
  if (!await confirmAction({ title: copy.title, message: copy.message, paths, confirmLabel: copy.label })) return;
  setBusy(true, kind === 'trash' ? 'confirm.trashLabel' : 'confirm.removeLabel', 'busy.applyConfirmed');
  try {
    const results = kind === 'trash' ? await api.trash(state.root, paths) : await api.removeTags(state.root, paths);
    const failed = results.filter((result) => !result.ok);
    if (failed.length) toast(t('toast.filesFailed', { count: failed.length, message: failed[0].message || '' }), 'error');
    else toast(t(kind === 'trash' ? 'toast.movedRecycle' : 'toast.correctionsVerified', { count: results.length }));
    await scan({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function normalizeTags() {
  const paths = selectedPaths().filter((filePath) => allItemsByPath().get(filePath)?.tagCount > 1);
  if (!paths.length) return toast(t('toast.selectDuplicateWarning'), 'error');
  if (!await confirmAction({
    title: t('confirm.normalizeTitle'),
    message: t('confirm.normalizeMessage'),
    paths,
    confirmLabel: t('confirm.normalizeLabel'),
    danger: false,
  })) return;
  setBusy(true, 'busy.normalizing', 'busy.normalizingDetail');
  try {
    const results = await api.normalizeTags(state.root, paths);
    const failed = results.filter((result) => !result.ok);
    failed.length
      ? toast(t('toast.filesFailed', { count: failed.length, message: failed[0].message || '' }), 'error')
      : toast(t('toast.normalized', { count: results.length }));
    await scan({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function dismissVisualVariants() {
  const paths = selectedPaths().filter((filePath) => {
    const item = allItemsByPath().get(filePath);
    return item?.visualVariantGroup && item.exactDuplicateCount === 1;
  });
  if (!paths.length) return toast(t('toast.selectVisualVariant'), 'error');
  if (!await confirmAction({
    eyebrow: t('confirm.visualEyebrow'),
    title: t('confirm.visualTitle', { count: paths.length }),
    message: t('confirm.visualMessage'),
    paths,
    confirmLabel: t('confirm.visualLabel'),
    danger: false,
  })) return;
  setBusy(true, 'busy.savingDuplicate', 'busy.savingDuplicateDetail');
  try {
    const results = await api.dismissVisualVariants(state.root, paths);
    const failed = results.filter((result) => !result.ok);
    if (failed.length) toast(t('toast.filesFailed', { count: failed.length, message: failed[0].message || '' }), 'error');
    else toast(t('toast.variantsRemoved', { count: results.length }));
    await scan({ force: true });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function manageBackups() {
  if (state.busy) return;
  try {
    const expired = await api.listExpiredBackups();
    if (!expired.length) return toast(t('toast.noExpiredBackups'));
    const paths = expired.map((item) => item.backupPath);
    if (!await confirmAction({
      eyebrow: t('confirm.backupEyebrow'),
      title: t('confirm.backupTitle', { count: paths.length }),
      message: t('confirm.backupMessage'),
      paths,
      confirmLabel: t('confirm.backupLabel'),
    })) return;
    setBusy(true, 'confirm.backupLabel', 'busy.applyConfirmed');
    const results = await api.deleteExpiredBackups(paths);
    const failed = results.filter((result) => !result.ok);
    failed.length ? toast(t('toast.backupsFailed', { count: failed.length }), 'error') : toast(t('toast.backupsDeleted', { count: results.length }));
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function handleUpdateIndicator() {
  if (state.update.state === 'available' && state.update.releaseUrl) {
    try {
      await api.openUpdate(state.update.releaseUrl);
    } catch (error) {
      toast(t('toast.updateOpenFailed', { message: error.message }), 'error');
    }
    return;
  }
  renderUpdateStatus({ state: 'checking' });
  try {
    const status = await api.checkForUpdate();
    renderUpdateStatus(status);
  } catch (error) {
    renderUpdateStatus({ state: 'unavailable' });
    toast(t('toast.updateCheckFailed', { message: error.message }), 'error');
  }
}

elements['choose-folder'].addEventListener('click', chooseFolder);
elements['welcome-choose'].addEventListener('click', chooseFolder);
elements['scan-folder'].addEventListener('click', scan);
elements['detect-people'].addEventListener('click', analyzePeople);
elements['all-skus'].addEventListener('click', () => { state.sku = null; state.selected.clear(); render(); });
elements.search.addEventListener('input', () => { state.query = elements.search.value.trim(); state.selected.clear(); render(); });
elements['select-visible'].addEventListener('click', () => {
  const visible = itemsForCurrentView().map((item) => item.path);
  const expanded = expandExactDuplicates(visible);
  const allSelected = expanded.length && expanded.every((item) => state.selected.has(item));
  for (const item of expanded) allSelected ? state.selected.delete(item) : state.selected.add(item);
  renderGallery();
  renderSelectionBar();
});
elements['select-all-media'].addEventListener('click', () => {
  const allPaths = itemsForView().map((item) => item.path);
  const expanded = ['review', 'people', 'tagged'].includes(state.view) ? expandExactDuplicates(allPaths) : allPaths;
  const allSelected = expanded.length > 0 && expanded.every((item) => state.selected.has(item));
  for (const item of expanded) allSelected ? state.selected.delete(item) : state.selected.add(item);
  renderGallery();
  renderSelectionBar();
  toast(allSelected ? t('toast.selectionCleared') : t('toast.selectionAll', { count: expanded.length }));
});
elements['mark-no-tag'].addEventListener('click', () => runReviewAction('clear'));
elements['add-tag'].addEventListener('click', () => runReviewAction('tag'));
elements['remove-tag'].addEventListener('click', () => destructiveFileAction('remove'));
elements['trash-files'].addEventListener('click', () => destructiveFileAction('trash'));
elements['normalize-tag'].addEventListener('click', normalizeTags);
elements['not-duplicate'].addEventListener('click', dismissVisualVariants);
elements['backup-manager'].addEventListener('click', manageBackups);
elements['update-indicator'].addEventListener('click', handleUpdateIndicator);
elements['software-disclaimer-link'].addEventListener('click', async () => {
  try {
    await api.openSoftwareDisclaimer();
  } catch (error) {
    toast(t('toast.disclaimerFailed', { message: error.message }), 'error');
  }
});
elements['creator-link'].addEventListener('click', async () => {
  try {
    await api.openCreatorProfile();
  } catch (error) {
    toast(t('toast.creatorFailed', { message: error.message }), 'error');
  }
});
elements['language-select'].addEventListener('change', () => setLocale(elements['language-select'].value));
elements['theme-select'].addEventListener('change', () => setTheme(elements['theme-select'].value));
elements['tutorial-open'].addEventListener('click', () => showTutorial(true));
elements['tutorial-back'].addEventListener('click', () => {
  state.tutorialStep = Math.max(0, state.tutorialStep - 1);
  renderTutorial();
});
elements['tutorial-next'].addEventListener('click', () => {
  if (state.tutorialStep === TUTORIAL_STEPS.length - 1) finishTutorial();
  else {
    state.tutorialStep += 1;
    renderTutorial();
  }
});
elements['tutorial-skip'].addEventListener('click', () => localStorage.setItem(TUTORIAL_SEEN_KEY, 'seen'));
document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  state.selected.clear();
  render();
}));
systemTheme.addEventListener('change', () => { if (state.theme === 'system') applyTheme(); });

applyTheme();
applyStaticTranslations();

(async () => {
  showTutorial();
  try {
    const appState = await api.getState();
    state.platform = appState.platform || state.platform;
    if (appState.update) renderUpdateStatus(appState.update);
    applyStaticTranslations();
    if (appState.settings.lastRoot) elements['folder-path'].textContent = t('folder.lastUsed', { path: appState.settings.lastRoot });
  } catch (error) {
    toast(t('toast.startupFailed', { message: error.message }), 'error');
  }
})();
