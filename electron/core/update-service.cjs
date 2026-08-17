const https = require('node:https');

const UPDATE_REPOSITORY = 'khooyc/amazon-adding-metadata-tag';
const UPDATE_API_URL = `https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`;
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;
const UPDATE_REQUEST_TIMEOUT_MS = 8_000;

function normalizeVersion(version) {
  const match = String(version || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/i);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    value: `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`,
  };
}

function compareVersions(first, second) {
  const left = normalizeVersion(first);
  const right = normalizeVersion(second);
  if (!left || !right) throw new TypeError('Versions must use the format major.minor.patch.');
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] > right[key] ? 1 : -1;
  }
  return 0;
}

function isTrustedReleaseUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && (url.pathname === `/${UPDATE_REPOSITORY}/releases` || url.pathname.startsWith(`/${UPDATE_REPOSITORY}/releases/`));
  } catch {
    return false;
  }
}

function requestJson(url, timeoutMs = UPDATE_REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Amazon-Adding-Metadata-Tag-update-check',
      },
    }, (response) => {
      const chunks = [];
      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const body = chunks.join('');
        if (response.statusCode !== 200) {
          const error = new Error(`GitHub returned HTTP ${response.statusCode || 'unknown'}.`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('GitHub returned invalid release data.'));
        }
      });
    });
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Update check timed out.')));
    request.on('error', reject);
  });
}

async function checkLatestRelease({ currentVersion, request = requestJson } = {}) {
  const current = normalizeVersion(currentVersion);
  if (!current) throw new TypeError('The current app version is invalid.');
  const release = await request(UPDATE_API_URL);
  const latest = normalizeVersion(release?.tag_name);
  if (!latest || !isTrustedReleaseUrl(release?.html_url)) {
    throw new Error('The latest GitHub release data is invalid.');
  }
  const state = compareVersions(latest.value, current.value) > 0 ? 'available' : 'current';
  return {
    state,
    currentVersion: current.value,
    latestVersion: latest.value,
    releaseUrl: new URL(release.html_url).href,
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
  };
}

module.exports = {
  UPDATE_REPOSITORY,
  UPDATE_API_URL,
  UPDATE_RELEASES_URL,
  UPDATE_REQUEST_TIMEOUT_MS,
  normalizeVersion,
  compareVersions,
  isTrustedReleaseUrl,
  checkLatestRelease,
};
