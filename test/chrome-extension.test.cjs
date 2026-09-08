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
