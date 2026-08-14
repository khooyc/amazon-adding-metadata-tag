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
});

test('localized settings, dark mode, tutorial, and persistent legal warning are wired into the packaged UI', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'src', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(projectRoot, 'src', 'styles.css'), 'utf8');
  const renderer = fs.readFileSync(path.join(projectRoot, 'src', 'renderer.js'), 'utf8');

  for (const id of ['language-select', 'theme-select', 'tutorial-open', 'tutorial-dialog', 'human-verification-warning', 'software-disclaimer-link', 'creator-link']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<script src="i18n\.js"><\/script>/);
  assert.match(html, /<link rel="icon" type="image\/png" href="assets\/logo\.png">/);
  assert.match(html, /<img class="brand-mark" src="assets\/logo\.png" alt="">/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(css, /html\[data-theme="dark"\] \.button-secondary \{[^}]*background: #fff;[^}]*color: #17221c;/);
  assert.match(renderer, /TUTORIAL_SEEN_KEY/);
  assert.match(renderer, /prefers-color-scheme: dark/);
  assert.match(renderer, /api\.chooseFolder\(state\.locale\)/);
  assert.match(renderer, /api\.openSoftwareDisclaimer\(\)/);
  assert.match(renderer, /api\.openCreatorProfile\(\)/);
  assert.ok(fs.statSync(path.join(projectRoot, 'src', 'assets', 'logo.png')).size > 10_000);
  assert.ok(fs.statSync(path.join(projectRoot, 'build', 'icon.png')).size > 100_000);

  const i18n = loadI18n();
  const usedKeys = new Set();
  for (const match of renderer.matchAll(/\bt\('([^']+)'/g)) usedKeys.add(match[1]);
  for (const match of html.matchAll(/data-i18n(?:-placeholder|-aria-label)?="([^"]+)"/g)) usedKeys.add(match[1]);
  const missing = [...usedKeys].filter((key) => !Object.hasOwn(i18n.translations.en, key));
  assert.deepEqual(missing, [], `missing English translations: ${missing.join(', ')}`);
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
