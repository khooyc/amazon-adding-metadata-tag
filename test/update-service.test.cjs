const assert = require('node:assert/strict');
const test = require('node:test');

const {
  UPDATE_API_URL,
  checkLatestRelease,
  compareVersions,
  isTrustedReleaseUrl,
  normalizeVersion,
} = require('../electron/core/update-service.cjs');

test('normalizes and compares release versions safely', () => {
  assert.deepEqual(normalizeVersion('v1.6.1'), { major: 1, minor: 6, patch: 1, value: '1.6.1' });
  assert.equal(compareVersions('1.6.1', '1.6.0'), 1);
  assert.equal(compareVersions('1.6.0', 'v1.6.0'), 0);
  assert.equal(compareVersions('1.5.9', '1.6.0'), -1);
  assert.equal(normalizeVersion('latest'), null);
  assert.throws(() => compareVersions('latest', '1.0.0'), /format major\.minor\.patch/);
});

test('accepts only this repository GitHub release URLs', () => {
  assert.equal(isTrustedReleaseUrl('https://github.com/khooyc/amazon-adding-metadata-tag/releases'), true);
  assert.equal(isTrustedReleaseUrl('https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.1'), true);
  assert.equal(isTrustedReleaseUrl('https://github.com/other/repo/releases/tag/v1.6.1'), false);
  assert.equal(isTrustedReleaseUrl('http://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.1'), false);
  assert.equal(isTrustedReleaseUrl('https://evil.example/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.1'), false);
});

test('detects a newer stable GitHub release without touching local media', async () => {
  let requestedUrl = null;
  const available = await checkLatestRelease({
    currentVersion: '1.6.0',
    request: async (url) => {
      requestedUrl = url;
      return {
        tag_name: 'v1.6.1',
        html_url: 'https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.1',
        published_at: '2026-08-17T00:00:00Z',
      };
    },
  });
  assert.equal(requestedUrl, UPDATE_API_URL);
  assert.equal(available.state, 'available');
  assert.equal(available.latestVersion, '1.6.1');
  assert.equal(available.currentVersion, '1.6.0');

  const current = await checkLatestRelease({
    currentVersion: '1.6.1',
    request: async () => ({
      tag_name: 'v1.6.1',
      html_url: 'https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/v1.6.1',
    }),
  });
  assert.equal(current.state, 'current');
});

test('rejects malformed or untrusted release metadata', async () => {
  await assert.rejects(
    checkLatestRelease({
      currentVersion: '1.6.0',
      request: async () => ({ tag_name: 'latest', html_url: 'https://github.com/khooyc/amazon-adding-metadata-tag/releases/tag/latest' }),
    }),
    /release data is invalid/,
  );
  await assert.rejects(
    checkLatestRelease({
      currentVersion: '1.6.0',
      request: async () => ({ tag_name: 'v1.6.1', html_url: 'https://example.com/release/v1.6.1' }),
    }),
    /release data is invalid/,
  );
});
