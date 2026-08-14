const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const {
  DATA_DIRECTORY_NAME,
  MANUAL_VIDEO_EXTENSIONS,
  SUPPORTED_IMAGE_EXTENSIONS,
  normalizePath,
} = require('./constants.cjs');

const HASH_CONCURRENCY = 4;

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function perceptualHash(filePath) {
  try {
    // Decode from a closed memory buffer so libvips never retains a Windows
    // handle that could block ExifTool's atomic replacement of the source.
    const source = await fsp.readFile(filePath);
    const { data } = await sharp(source, { failOn: 'none' })
      .rotate()
      .resize(16, 16, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
    let bits = '';
    for (const value of data) bits += value >= mean ? '1' : '0';
    let output = '';
    for (let index = 0; index < bits.length; index += 4) {
      output += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
    }
    return output;
  } catch {
    return null;
  }
}

function hammingDistanceHex(first, second) {
  if (!first || !second || first.length !== second.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let index = 0; index < first.length; index += 1) {
    let value = Number.parseInt(first[index], 16) ^ Number.parseInt(second[index], 16);
    while (value) {
      distance += value & 1;
      value >>= 1;
    }
  }
  return distance;
}

function assertAccessibleRoot(rootPath) {
  if (!path.isAbsolute(rootPath)) throw new Error('The selected media folder must be an absolute path.');
  const parsed = path.parse(path.resolve(rootPath));
  if (parsed.root === path.resolve(rootPath)) throw new Error('A drive root cannot be used as the media folder.');
}

async function enumerateMedia(rootPath) {
  assertAccessibleRoot(rootPath);
  const root = path.resolve(rootPath);
  const files = [];
  const unsupported = [];
  const videos = [];
  const unassigned = [];
  const directories = [root];

  while (directories.length) {
    const current = directories.pop();
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === DATA_DIRECTORY_NAME) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        directories.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, fullPath);
      const segments = relativePath.split(path.sep);
      const extension = path.extname(entry.name).toLowerCase();
      const sku = segments.length > 1 ? segments[0] : null;
      if (!sku) {
        unassigned.push({ path: fullPath, name: entry.name, reason: 'File is not inside a Seller SKU folder.' });
        continue;
      }
      if (SUPPORTED_IMAGE_EXTENSIONS.has(extension)) files.push({ path: fullPath, relativePath, name: entry.name, sku, extension });
      else if (MANUAL_VIDEO_EXTENSIONS.has(extension)) videos.push({ path: fullPath, relativePath, name: entry.name, sku, extension });
      else unsupported.push({ path: fullPath, relativePath, name: entry.name, sku, extension: extension || '(none)' });
    }
  }
  return { root, files, videos, unsupported, unassigned };
}

async function scanMediaLibrary(rootPath, exiftool, store, onProgress) {
  const report = typeof onProgress === 'function' ? onProgress : () => {};
  report({ percent: 0, key: 'progress.findingMedia' });
  const inventory = await enumerateMedia(rootPath);
  report({ percent: 10, key: 'progress.readingMetadata', variables: { total: inventory.files.length } });
  const metadata = await exiftool.readMetadataBatch(
    inventory.files.map((file) => file.path),
    ({ completed, total }) => report({
      percent: total ? 10 + Math.round((completed / total) * 20) : 30,
      key: 'progress.readMetadata',
      variables: { completed, total },
    }),
  );
  const metadataByPath = new Map(metadata.map((record) => [normalizePath(record.sourceFile), record]));
  let inspectedCount = 0;
  const inspected = await mapLimit(inventory.files, HASH_CONCURRENCY, async (file) => {
    const stats = await fsp.stat(file.path);
    const [contentHash, visualHash] = await Promise.all([sha256File(file.path), perceptualHash(file.path)]);
    const meta = metadataByPath.get(normalizePath(file.path)) || { subjects: [], hasTag: false, tagCount: 0 };
    const decision = store.getDecision(contentHash);
    const item = {
      ...file,
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      contentHash,
      visualHash,
      subjects: meta.subjects,
      hasTag: meta.hasTag,
      tagCount: meta.tagCount,
      width: meta.width,
      height: meta.height,
      decision,
      status: meta.hasTag ? 'tagged' : decision?.decision === 'no-tag' ? 'cleared' : 'review',
    };
    inspectedCount += 1;
    report({
      percent: inventory.files.length ? 30 + Math.round((inspectedCount / inventory.files.length) * 60) : 90,
      key: 'progress.fingerprinting',
      variables: { completed: inspectedCount, total: inventory.files.length },
    });
    return item;
  });

  report({ percent: 94, key: 'progress.grouping' });
  const exactGroups = new Map();
  for (const item of inspected) {
    if (!exactGroups.has(item.contentHash)) exactGroups.set(item.contentHash, []);
    exactGroups.get(item.contentHash).push(item);
  }
  for (const group of exactGroups.values()) {
    const groupId = group.length > 1 ? group[0].contentHash : null;
    for (const item of group) {
      item.exactDuplicateGroup = groupId;
      item.exactDuplicateCount = group.length;
    }
  }

  for (const item of inspected) item.visualVariantGroup = null;
  const bySku = Map.groupBy(
    inspected.filter((item) => item.visualHash && !store.isVisualVariantDismissed(item.contentHash)),
    (item) => item.sku,
  );
  for (const skuItems of bySku.values()) {
    const remaining = new Set(skuItems);
    while (remaining.size) {
      const seed = remaining.values().next().value;
      remaining.delete(seed);
      const group = [seed];
      for (const candidate of [...remaining]) {
        if (candidate.contentHash !== seed.contentHash && hammingDistanceHex(seed.visualHash, candidate.visualHash) <= 8) {
          group.push(candidate);
          remaining.delete(candidate);
        }
      }
      if (group.length > 1) {
        const groupId = `${seed.sku}:${seed.visualHash.slice(0, 16)}`;
        for (const item of group) item.visualVariantGroup = groupId;
      }
    }
  }

  const summaries = {};
  for (const item of inspected) {
    const summary = summaries[item.sku] || { sku: item.sku, total: 0, review: 0, tagged: 0, cleared: 0, warnings: 0 };
    summary.total += 1;
    summary[item.status] += 1;
    if (item.tagCount > 1) summary.warnings += 1;
    summaries[item.sku] = summary;
  }

  const result = {
    root: inventory.root,
    scannedAt: new Date().toISOString(),
    items: inspected,
    skuSummaries: Object.values(summaries).sort((first, second) => first.sku.localeCompare(second.sku)),
    videos: inventory.videos,
    unsupported: inventory.unsupported,
    unassigned: inventory.unassigned,
  };
  report({ percent: 100, key: 'progress.scanComplete', variables: { total: inspected.length } });
  return result;
}

module.exports = {
  enumerateMedia,
  hammingDistanceHex,
  mapLimit,
  perceptualHash,
  scanMediaLibrary,
  sha256File,
};
