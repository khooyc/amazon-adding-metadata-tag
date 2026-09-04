const assert = require('node:assert/strict');
const test = require('node:test');
const {
  UPDATE_API_URL,
  checkLatestRelease,
  compareVersions,
  isTrustedReleaseUrl,
  normalizeVersion,
} = require('../electron/core/update-service.cjs');

test('update versions are normalized and compared semantically', () => {
  assert.equal(normalizeVersion('v1.6.2').value, '1.6.2');
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.6.1', '1.6.2'), -1);
  assert.equal(compareVersions('1.6.2', '1.6.2'), 0);
  assert.equal(normalizeVersion('1.6'), null);
});

test('update links are restricted to this project GitHub releases', () => {
  assert.equal(isTrustedReleaseUrl('https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.2'), true);
  assert.equal(isTrustedReleaseUrl('https://github.com/khooyc/other/releases/tag/v9.0.0'), false);
  assert.equal(isTrustedReleaseUrl('http://github.com/khooyc/amazon-adding-metadata-tag/releases'), false);
  assert.equal(isTrustedReleaseUrl('https://example.com/khooyc/amazon-adding-metadata-tag/releases'), false);
});

test('release checks report current and available versions without opening links', async () => {
  const available = await checkLatestRelease({
    currentVersion: '1.6.2',
    request: async (url) => {
      assert.equal(url, UPDATE_API_URL);
      return {
        tag_name: 'v1.7.0',
        html_url: 'https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.7.0',
        published_at: '2026-09-03T00:00:00Z',
      };
    },
  });
  assert.equal(available.state, 'available');
  assert.equal(available.latestVersion, '1.7.0');

  const current = await checkLatestRelease({
    currentVersion: '1.6.2',
    request: async () => ({
      tag_name: 'v1.6.2',
      html_url: 'https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.2',
    }),
  });
  assert.equal(current.state, 'current');
});

test('release checks reject untrusted release payloads', async () => {
  await assert.rejects(
    checkLatestRelease({
      currentVersion: '1.6.2',
      request: async () => ({ tag_name: 'v9.0.0', html_url: 'https://example.com/download.exe' }),
    }),
    /release data is invalid/i,
  );
});
