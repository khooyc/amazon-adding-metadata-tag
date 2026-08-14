const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const sharp = require('sharp');
const { TAG_VALUE } = require('../electron/core/constants.cjs');
const { ExifToolClient, getExifToolPath } = require('../electron/core/exiftool.cjs');

const workspace = path.resolve(__dirname, '..');
const exiftool = new ExifToolClient(getExifToolPath({ appPath: workspace, resourcesPath: workspace, packaged: false }));

async function fixture(directory, extension) {
  const filePath = path.join(directory, `fixture.${extension}`);
  const pipeline = sharp({
    create: { width: 48, height: 32, channels: 3, background: { r: 35, g: 110, b: 76 } },
  });
  if (extension === 'jpg') await pipeline.jpeg().toFile(filePath);
  else if (extension === 'png') await pipeline.png().toFile(filePath);
  else if (extension === 'tiff') await pipeline.tiff().toFile(filePath);
  else if (extension === 'webp') await pipeline.webp().toFile(filePath);
  return filePath;
}

test('ExifTool is bundled and executable', async () => {
  assert.match(await exiftool.version(), /^13\.59/);
});

test('reads and writes metadata for Unicode Windows filenames', async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'media-tagger-unicode-'));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const asciiPath = await fixture(directory, 'jpg');
  const filePath = path.join(directory, '(改)listing+image.jpg');
  await fs.rename(asciiPath, filePath);

  const before = await exiftool.readMetadata(filePath);
  assert.equal(before.width, 48);
  assert.equal(before.height, 32);
  const added = await exiftool.addTag(filePath);
  assert.equal(added.after.hasTag, true);
  const removed = await exiftool.removeTag(filePath);
  assert.equal(removed.after.hasTag, false);
});

for (const extension of ['jpg', 'png', 'tiff', 'webp']) {
  test(`adds, verifies, avoids duplicating, normalizes, and removes XMP Subject for ${extension}`, async (context) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), `media-tagger-${extension}-`));
    context.after(() => fs.rm(directory, { recursive: true, force: true }));
    const filePath = await fixture(directory, extension);

    await exiftool.execute(['-overwrite_original', '-XMP-dc:Subject+=existing-keyword', filePath]);
    const added = await exiftool.addTag(filePath);
    assert.equal(added.changed, true);
    assert.equal(added.after.hasTag, true);
    assert.equal(added.after.tagCount, 1);
    assert.deepEqual(added.after.subjects.sort(), [TAG_VALUE, 'existing-keyword'].sort());

    const repeated = await exiftool.addTag(filePath);
    assert.equal(repeated.changed, false);
    assert.equal(repeated.after.tagCount, 1);

    await exiftool.execute(['-overwrite_original', `-XMP-dc:Subject+=${TAG_VALUE}`, filePath]);
    assert.equal((await exiftool.readMetadata(filePath)).tagCount, 2);
    const normalized = await exiftool.normalizeTag(filePath);
    assert.equal(normalized.after.tagCount, 1);
    assert.ok(normalized.after.subjects.includes('existing-keyword'));

    const removed = await exiftool.removeTag(filePath);
    assert.equal(removed.after.hasTag, false);
    assert.deepEqual(removed.after.subjects, ['existing-keyword']);
  });
}
