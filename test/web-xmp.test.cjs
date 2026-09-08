const test = require('node:test');
const assert = require('node:assert/strict');

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function be32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function pngChunk(type, data = []) {
  return Uint8Array.from([...be32(data.length), ...Buffer.from(type), ...data, 0, 0, 0, 0]);
}

function minimalPng() {
  return Uint8Array.from([
    ...PNG_SIGNATURE,
    ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]),
    ...pngChunk('IEND'),
  ]);
}

test('browser XMP module writes and verifies an exact JPEG dc:subject tag', async () => {
  const { TAG_VALUE, inspectImage, tagAndVerifyImage } = await import('../web/xmp.mjs');
  const source = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const result = tagAndVerifyImage(source, 'sample.jpg');
  assert.equal(result.changed, true);
  assert.equal(inspectImage(result.bytes).hasTag, true);
  assert.deepEqual(result.after.subjects, [TAG_VALUE]);
  assert.deepEqual([...result.bytes.slice(-2)], [0xff, 0xd9]);
});

test('browser XMP module writes and verifies an exact PNG dc:subject tag', async () => {
  const { TAG_VALUE, inspectImage, tagAndVerifyImage } = await import('../web/xmp.mjs');
  const source = minimalPng();
  const result = tagAndVerifyImage(source, 'sample.png');
  assert.equal(result.changed, true);
  assert.equal(inspectImage(result.bytes).hasTag, true);
  assert.deepEqual(result.after.subjects, [TAG_VALUE]);
});

test('tagging is idempotent and retains an existing subject', async () => {
  const { addSubjectToXmp, readSubjectsFromXmp, TAG_VALUE } = await import('../web/xmp.mjs');
  const source = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:subject><rdf:Bag><rdf:li>existing-keyword</rdf:li></rdf:Bag></dc:subject></rdf:Description></rdf:RDF></x:xmpmeta>';
  const once = addSubjectToXmp(source);
  const twice = addSubjectToXmp(once);
  assert.deepEqual(readSubjectsFromXmp(twice), ['existing-keyword', TAG_VALUE]);
  assert.equal(once, twice);
});

test('new dc:subject fields declare their namespace in existing XMP', async () => {
  const { addSubjectToXmp, TAG_VALUE } = await import('../web/xmp.mjs');
  const source = '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description></rdf:Description></rdf:RDF></x:xmpmeta>';
  const result = addSubjectToXmp(source);
  assert.match(result, /<dc:subject xmlns:dc="http:\/\/purl\.org\/dc\/elements\/1\.1\/">/);
  assert.match(result, new RegExp(TAG_VALUE));
});

test('extended JPEG XMP is refused rather than partially rewritten', async () => {
  const { tagAndVerifyImage } = await import('../web/xmp.mjs');
  const payload = Buffer.from('http://ns.adobe.com/xmp/extension/\0extended');
  const size = payload.length + 2;
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...payload, 0xff, 0xd9]);
  assert.throws(() => tagAndVerifyImage(jpeg, 'extended.jpg'), /extended XMP/);
});

test('unsupported images fail without producing output', async () => {
  const { tagAndVerifyImage } = await import('../web/xmp.mjs');
  assert.throws(() => tagAndVerifyImage(Uint8Array.from([1, 2, 3]), 'sample.webp'), /not a supported JPEG or PNG/);
});
