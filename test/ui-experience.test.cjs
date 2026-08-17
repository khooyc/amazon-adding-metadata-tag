const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadI18n() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'i18n.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'i18n.js' });
  return context.window.appI18n;
}

test('English, Simplified Chinese, and Traditional Chinese contain the same translation keys', () => {
  const i18n = loadI18n();
  assert.deepEqual([...i18n.supportedLocales], ['en', 'zh-CN', 'zh-TW']);
  const englishKeys = Object.keys(i18n.translations.en).sort();
  assert.ok(englishKeys.length > 100);
  for (const locale of i18n.supportedLocales) {
    assert.deepEqual(Object.keys(i18n.translations[locale]).sort(), englishKeys, `${locale} translation keys must match English`);
  }
  assert.equal(i18n.normalizeLocale('zh-Hant-TW'), 'zh-TW');
  assert.equal(i18n.normalizeLocale('zh-SG'), 'zh-CN');
  assert.equal(i18n.translate('zh-TW', 'selection.selected', { count: 8 }), '已選擇 8 項');
  assert.match(JSON.stringify(i18n.translations['zh-CN']), /亚马逊/);
  assert.doesNotMatch(JSON.stringify(i18n.translations['zh-CN']), /Amazon/);
  assert.match(JSON.stringify(i18n.translations['zh-TW']), /亞馬遜/);
  assert.doesNotMatch(JSON.stringify(i18n.translations['zh-TW']), /Amazon/);
});

test('localized settings, dark mode, tutorial, and persistent legal warning are wired into the packaged UI', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'src', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
  const renderer = fs.readFileSync(path.join(projectRoot, 'src', 'renderer.js'), 'utf8');

  for (const id of ['language-select', 'theme-select', 'tutorial-open', 'tutorial-dialog', 'human-verification-warning', 'software-disclaimer-link', 'creator-link', 'update-indicator', 'update-label']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<script src="i18n\.js"><\/script>/);
  assert.match(html, /<link rel="icon" type="image\/png" href="assets\/logo\.png">/);
  assert.match(html, /<img class="brand-mark" src="assets\/logo\.png" alt="">/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /\.update-indicator\[data-state="available"\]/);
  assert.match(css, /html\[data-theme="dark"\] \.button-secondary \{[^}]*background: #fff;[^}]*color: #17221c;/);
  assert.match(renderer, /TUTORIAL_SEEN_KEY/);
  assert.match(renderer, /prefers-color-scheme: dark/);
  assert.match(renderer, /api\.chooseFolder\(state\.locale\)/);
  assert.match(renderer, /api\.openSoftwareDisclaimer\(\)/);
  assert.match(renderer, /api\.openCreatorProfile\(\)/);
  assert.match(renderer, /api\.onUpdateStatus/);
  assert.match(renderer, /api\.checkForUpdate\(\)/);
  assert.match(renderer, /data-media-type="\$\{isVideo \? 'video' : 'image'\}"/);
  assert.match(renderer, /video-review-warning/);
  assert.match(renderer, /card\.dataset\.mediaType === 'video'/);
  assert.doesNotMatch(renderer, /state\.scan\.videos\.map/);
  assert.ok(fs.statSync(path.join(projectRoot, 'src', 'assets', 'logo.png')).size > 10_000);
  assert.ok(fs.statSync(path.join(projectRoot, 'build', 'icon.png')).size > 100_000);

  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');
  assert.match(main, /registerHandler\('app:check-for-update'/);
  assert.match(main, /registerHandler\('app:open-update'/);
  assert.match(main, /scheduleUpdateCheck\(\)/);
  assert.match(preload, /onUpdateStatus/);
  assert.match(preload, /openUpdate/);
  assert.match(readme, /Update notifications/);

  const i18n = loadI18n();
  const usedKeys = new Set();
  for (const match of renderer.matchAll(/\bt\('([^']+)'/g)) usedKeys.add(match[1]);
  for (const match of html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) usedKeys.add(match[1]);
  const missing = [...usedKeys].filter((key) => !Object.hasOwn(i18n.translations.en, key));
  assert.deepEqual(missing, [], `missing English translations: ${missing.join(', ')}`);
});

test('SKU grouping is optional and recognized videos remain in Media with safe tag capability', () => {
  const constants = fs.readFileSync(path.join(projectRoot, 'electron', 'core', 'constants.cjs'), 'utf8');
  const scanner = fs.readFileSync(path.join(projectRoot, 'electron', 'core', 'scanner.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const renderer = fs.readFileSync(path.join(projectRoot, 'src', 'renderer.js'), 'utf8');
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

  assert.match(constants, /NO_SKU_GROUP = '__NO_SKU__'/);
  for (const extension of ['.avi', '.mkv', '.webm', '.wmv', '.mpeg', '.ts', '.vob']) assert.match(constants, new RegExp(`'\\${extension}'`));
  for (const extension of ['.mp4', '.mov', '.m4v', '.3gp', '.f4v']) assert.match(constants, new RegExp(`'\\${extension}'`));
  assert.match(scanner, /segments\.length > 1 \? segments\[0\] : NO_SKU_GROUP/);
  assert.match(scanner, /tagWritable: WRITABLE_VIDEO_EXTENSIONS\.has\(extension\)/);
  assert.match(main, /function assertTagWritableForCurrentScan/);
  assert.match(renderer, /function groupLabel\(group\)/);
  assert.match(renderer, /item\.tagWritable === false/);
  assert.match(renderer, /toast\.videoTagUnsupported/);
  assert.match(readme, /Seller SKU or product subfolders are optional/);
  assert.match(readme, /Other recognized video containers stay in the Media queue/);
});

test('the hidden main window is ready to show before its page begins loading', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const readyToShowIndex = main.indexOf("mainWindow.once('ready-to-show'");
  const loadFileIndex = main.indexOf('await mainWindow.loadFile');

  assert.notEqual(readyToShowIndex, -1, 'the main window must have a ready-to-show handler');
  assert.notEqual(loadFileIndex, -1, 'the main window must load the application page');
  assert.ok(
    readyToShowIndex < loadFileIndex,
    'register ready-to-show before loadFile so a fast page load cannot leave the window hidden',
  );
});

test('startup initialization failures are surfaced and terminate the hidden process', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /function reportStartupFailure\(error\)/);
  assert.match(main, /app\.whenReady\(\)\.then\(initializeApplication\)\.catch\(reportStartupFailure\)/);
  assert.match(main, /dialog\.showErrorBox\(APP_NAME, error\.message\)/);
  assert.match(main, /app\.quit\(\)/);
});

test('only one app instance can mutate media and closing waits for active work', () => {
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  assert.match(main, /app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /app\.on\('second-instance'/);
  assert.match(main, /function runExclusiveMutation\(operation\)/);
  assert.match(main, /mainWindow\.on\('close'/);
  assert.match(main, /quitAfterMutation/);
  const backupCleanup = main.slice(main.indexOf("registerHandler('backups:delete-expired'"), main.indexOf('\n  });\n}', main.indexOf("registerHandler('backups:delete-expired'")));
  assert.match(backupCleanup, /runExclusiveMutation/);
  const trashHandler = main.slice(main.indexOf("registerHandler('media:trash'"), main.indexOf("registerHandler('media:show-in-folder'"));
  assert.match(trashHandler, /for \(let index[\s\S]*verifyReviewedFiles\(\[filePath\]/);
  const renderer = fs.readFileSync(path.join(projectRoot, 'src', 'renderer.js'), 'utf8');
  const backupUi = renderer.slice(renderer.indexOf('async function manageBackups()'), renderer.indexOf("elements['choose-folder']"));
  assert.match(backupUi, /if \(state\.busy\) return/);
  assert.match(backupUi, /setBusy\(true/);
  assert.match(backupUi, /finally[\s\S]*setBusy\(false\)/);
});

test('the Windows installer offers an optional Start Menu shortcut without breaking launch', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const installer = fs.readFileSync(path.join(projectRoot, 'build', 'installer.nsh'), 'utf8');

  assert.equal(manifest.build.nsis.oneClick, false, 'the shortcut choice requires the assisted installer');
  assert.equal(manifest.build.nsis.createStartMenuShortcut, true, 'builder must retain normal shortcut and uninstall support');
  assert.equal(manifest.build.nsis.include, 'build/installer.nsh');
  assert.match(installer, /!include "MUI2\.nsh"/);
  assert.match(installer, /Create a Start Menu shortcut/);
  assert.match(installer, /StrCpy \$CreateStartMenuShortcut \$\{BST_CHECKED\}/);
  assert.match(installer, /Delete "\$newStartMenuLink"/);
  assert.match(installer, /StrCpy \$launchLink "\$appExe"/);
  assert.match(installer, /\$\{IfNot\} \$\{Silent\}[\s\S]*CreateShortCut "\$newStartMenuLink"/);
});

test('software licence and disclaimer is complete and opens only through the secured Electron bridge', () => {
  const document = fs.readFileSync(path.join(projectRoot, 'SOFTWARE_LICENCE_AND_DISCLAIMER.md'), 'utf8');
  const constants = fs.readFileSync(path.join(projectRoot, 'electron', 'core', 'constants.cjs'), 'utf8');
  const main = fs.readFileSync(path.join(projectRoot, 'electron', 'main.cjs'), 'utf8');
  const preload = fs.readFileSync(path.join(projectRoot, 'electron', 'preload.cjs'), 'utf8');

  for (const heading of ['Free Software', 'Human Verification Required', 'No Affiliation or Endorsement', 'Limitation of Liability', 'User Responsibility', 'Changes', 'Legal Review']) {
    assert.match(document, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.match(document, /not endorsed by, sponsored by, or affiliated with Amazon/i);
  assert.doesNotMatch(document, /cannot legally be excluded/i);
  assert.match(constants, /SOFTWARE_DISCLAIMER_URL = 'https:\/\/github\.com\/khooyc\/amazon-adding-metadata-tag\/blob\/main\/SOFTWARE_LICENCE_AND_DISCLAIMER\.md'/);
  assert.match(main, /SOFTWARE_DISCLAIMER_URL\.startsWith\('https:\/\/github\.com\/'\)/);
  assert.match(main, /url\.hostname !== 'github\.com'/);
  assert.match(main, /shell\.openExternal\(url\.href\)/);
  assert.match(preload, /openSoftwareDisclaimer: \(\) => invoke\('legal:open-software-disclaimer'\)/);
  assert.match(preload, /openCreatorProfile: \(\) => invoke\('creator:open-github-profile'\)/);
});
