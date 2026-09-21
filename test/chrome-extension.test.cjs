const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Chrome extension uses Manifest V3 with one narrowly scoped permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'extension', 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['downloads']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.background.service_worker, 'background.js');
  assert.match(manifest.content_security_policy.extension_pages, /'self'/);
  assert.match(manifest.content_security_policy.extension_pages, /wasm-unsafe-eval/);
});

test('extension download Adapter uses Chrome downloads without remote services', () => {
  const adapter = fs.readFileSync(path.join(root, 'extension', 'platform-adapter.js'), 'utf8');
  assert.match(adapter, /chrome\.downloads\.download/);
  assert.match(adapter, /conflictAction: 'uniquify'/);
  assert.doesNotMatch(adapter, /https?:\/\//);
});

test('shared browser application loads the platform Adapter before its Module', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  assert.ok(html.indexOf('platform-adapter.js') < html.indexOf('app.mjs'));
  const app = fs.readFileSync(path.join(root, 'web', 'app.mjs'), 'utf8');
  assert.match(app, /window\.mediaSaveAdapter/);
});

test('browser edition accepts reviewable videos and requires a full watch before selection', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'web', 'app.mjs'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');

  assert.match(html, /video\/mp4/);
  assert.match(html, /video\/quicktime/);
  assert.match(html, /media-src 'self' blob:/);
  assert.match(app, /tagAndVerifyVideo/);
  assert.match(app, /item\.mediaType === 'video' && !item\.watched/);
  assert.match(app, /video\.played/);
  assert.match(app, /watchProgress >= 0\.95/);
  assert.match(css, /\.video-warning/);
  assert.match(html, /id="folder-input"[^>]*webkitdirectory/);
  assert.match(html, /id="browse-folder"/);
  assert.match(html, /Choose files or a folder/);
  assert.match(css, /radial-gradient\(circle at 8% 0%/);
  for (const font of ['bricolage-grotesque-latin.woff2', 'hanken-grotesk-latin.woff2', 'space-mono-regular-latin.woff2']) {
    assert.ok(fs.statSync(path.join(root, 'web', 'assets', 'fonts', font)).size > 10_000, `${font} must be bundled`);
  }
});

test('browser install action opens native desktop downloads instead of the PWA prompt', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'web', 'app.mjs'), 'utf8');
  for (const expected of ['Download desktop app', 'Amazon-Adding-Metadata-Tag-Windows-Setup.exe', 'Amazon-Adding-Metadata-Tag-mac-arm64.dmg', 'Amazon-Adding-Metadata-Tag-mac-x64.dmg']) assert.match(html, new RegExp(expected.replaceAll('.', '\\.'), 'i'));
  assert.match(html, /id="desktop-dialog"/);
  assert.match(app, /desktop-dialog.*showModal/s);
  assert.doesNotMatch(app, /installPrompt|\.prompt\(\)/);
  for (const asset of ['hero-seller-review.png', 'tutorial-video-placeholder.png']) assert.ok(fs.statSync(path.join(root, 'web', 'assets', asset)).size > 100_000, `${asset} must be a real project asset`);
});

test('local web preview serves self-hosted fonts with a font MIME type', () => {
  const server = fs.readFileSync(path.join(root, 'scripts', 'serve-web.cjs'), 'utf8');
  assert.match(server, /\['\.woff2',\s*'font\/woff2'\]/);
});
