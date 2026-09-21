export const TAG_VALUE = 'contains-synthetic-performer';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });
const JPEG_XMP_HEADER = encoder.encode('http://ns.adobe.com/xap/1.0/\0');
const JPEG_EXTENDED_XMP_HEADER = encoder.encode('http://ns.adobe.com/xmp/extension/\0');
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const VIDEO_XMP_UUID = Uint8Array.from([0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3, 0xaf, 0xac]);

function concat(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function equalAt(bytes, expected, offset = 0) {
  if (offset + expected.length > bytes.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');
}

export function readSubjectsFromXmp(xml) {
  const subject = xml.match(/<dc:subject(?:\s[^>]*)?>([\s\S]*?)<\/dc:subject\s*>/i);
  if (!subject) return [];
  return [...subject[1].matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li\s*>/gi)]
    .map((match) => decodeXml(match[1].replace(/<[^>]+>/g, '').trim()));
}

function freshXmp() {
  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Amazon Metadata Tag Web">\n <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">\n   <dc:subject><rdf:Bag></rdf:Bag></dc:subject>\n  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end="w"?>`;
}

export function addSubjectToXmp(source, value = TAG_VALUE) {
  let xml = source?.trim() || freshXmp();
  if (!/<rdf:RDF(?:\s|>)/i.test(xml)) throw new Error('The existing XMP packet is malformed and was not changed.');
  if (readSubjectsFromXmp(xml).includes(value)) return xml;

  const item = `<rdf:li>${escapeXml(value)}</rdf:li>`;
  const subject = xml.match(/<dc:subject(?:\s[^>]*)?>[\s\S]*?<\/dc:subject\s*>/i);
  if (subject) {
    if (!/<rdf:Bag(?:\s[^>]*)?>/i.test(subject[0]) || !/<\/rdf:Bag\s*>/i.test(subject[0])) {
      throw new Error('The existing XMP dc:subject is not an RDF Bag and was not changed.');
    }
    const replacement = subject[0].replace(/<\/rdf:Bag\s*>/i, `${item}</rdf:Bag>`);
    return xml.slice(0, subject.index) + replacement + xml.slice(subject.index + subject[0].length);
  }

  const descriptionEnd = xml.search(/<\/rdf:Description\s*>/i);
  if (descriptionEnd < 0) throw new Error('The existing XMP description is malformed and was not changed.');
  const field = `<dc:subject xmlns:dc="http://purl.org/dc/elements/1.1/"><rdf:Bag>${item}</rdf:Bag></dc:subject>`;
  return `${xml.slice(0, descriptionEnd)}${field}${xml.slice(descriptionEnd)}`;
}

function jpegSegments(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('This file is not a valid JPEG image.');
  const segments = [];
  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('The JPEG marker structure is invalid.');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    const markerStart = offset - 1;
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }
    if (offset + 2 >= bytes.length) throw new Error('The JPEG segment is truncated.');
    const size = (bytes[offset + 1] << 8) | bytes[offset + 2];
    if (size < 2 || offset + 1 + size > bytes.length) throw new Error('The JPEG segment length is invalid.');
    segments.push({ marker, start: markerStart, end: offset + 1 + size, payloadStart: offset + 3 });
    offset += 1 + size;
  }
  return segments;
}

function findJpegXmp(bytes) {
  return jpegSegments(bytes).find((segment) => segment.marker === 0xe1 && equalAt(bytes, JPEG_XMP_HEADER, segment.payloadStart));
}

function makeJpegXmpSegment(xml) {
  const payload = concat(JPEG_XMP_HEADER, encoder.encode(xml));
  const size = payload.length + 2;
  if (size > 0xffff) throw new Error('The XMP packet is too large for a standard JPEG metadata segment.');
  return concat(Uint8Array.from([0xff, 0xe1, size >> 8, size & 0xff]), payload);
}

function readJpegXmp(bytes) {
  const segment = findJpegXmp(bytes);
  return segment ? decoder.decode(bytes.subarray(segment.payloadStart + JPEG_XMP_HEADER.length, segment.end)) : '';
}

function writeJpegXmp(bytes, xml) {
  const hasExtendedXmp = jpegSegments(bytes).some((segment) => segment.marker === 0xe1 && equalAt(bytes, JPEG_EXTENDED_XMP_HEADER, segment.payloadStart));
  if (hasExtendedXmp) throw new Error('This JPEG uses extended XMP. Use the desktop app so its metadata is not damaged.');
  const replacement = makeJpegXmpSegment(xml);
  const existing = findJpegXmp(bytes);
  if (existing) return concat(bytes.subarray(0, existing.start), replacement, bytes.subarray(existing.end));
  return concat(bytes.subarray(0, 2), replacement, bytes.subarray(2));
}

function u32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function be32(value) {
  return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function isoBoxes(bytes) {
  const boxes = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const size32 = u32(bytes, offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > bytes.length) throw new Error('The video container has a truncated extended-size box.');
      const high = u32(bytes, offset + 8);
      const low = u32(bytes, offset + 12);
      size = (high * 0x1_0000_0000) + low;
      headerSize = 16;
      if (!Number.isSafeInteger(size)) throw new Error('This video is too large to process safely in the browser.');
    } else if (size32 === 0) {
      size = bytes.length - offset;
    }
    if (size < headerSize || offset + size > bytes.length) throw new Error('The video container has an invalid box structure.');
    boxes.push({ type, start: offset, end: offset + size, headerSize, payloadStart: offset + headerSize });
    offset += size;
  }
  if (offset !== bytes.length) throw new Error('The video container is truncated.');
  return boxes;
}

function videoXmpBox(bytes) {
  return isoBoxes(bytes).filter((box) => box.type === 'uuid' && equalAt(bytes, VIDEO_XMP_UUID, box.payloadStart)).at(-1) || null;
}

function inspectVideoContainer(bytes, fileName = '') {
  const boxes = isoBoxes(bytes);
  if (!boxes.some((box) => box.type === 'ftyp')) throw new Error(`${fileName || 'This file'} is not a supported MP4, MOV, or M4V video.`);
  const extension = fileName.split('.').pop()?.toLowerCase();
  return extension === 'mov' ? 'mov' : extension === 'm4v' ? 'm4v' : 'mp4';
}

function readVideoXmp(bytes) {
  const box = videoXmpBox(bytes);
  return box ? decoder.decode(bytes.subarray(box.payloadStart + VIDEO_XMP_UUID.length, box.end)).trim() : '';
}

function makeVideoXmpBox(xml) {
  const payload = concat(VIDEO_XMP_UUID, encoder.encode(xml));
  const size = payload.length + 8;
  if (size > 0xffffffff) throw new Error('The XMP packet is too large for this video container.');
  return concat(be32(size), encoder.encode('uuid'), payload);
}

function writeVideoXmp(bytes, xml) {
  const existing = videoXmpBox(bytes);
  if (!existing) {
    const lastBox = isoBoxes(bytes).at(-1);
    if (lastBox && u32(bytes, lastBox.start) === 0) {
      throw new Error('This video uses an open-ended final box. Use the desktop app so the container is not damaged.');
    }
    return concat(bytes, makeVideoXmpBox(xml));
  }
  const payloadStart = existing.payloadStart + VIDEO_XMP_UUID.length;
  const capacity = existing.end - payloadStart;
  const encoded = encoder.encode(xml);
  if (encoded.length > capacity) {
    throw new Error('The existing video XMP packet has no room for this tag. Use the desktop app so the video is not damaged.');
  }
  const padded = new Uint8Array(capacity);
  padded.fill(0x20);
  padded.set(encoded);
  return concat(bytes.subarray(0, payloadStart), padded, bytes.subarray(existing.end));
}

function pngChunks(bytes) {
  if (!equalAt(bytes, PNG_SIGNATURE)) throw new Error('This file is not a valid PNG image.');
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= bytes.length) {
    const length = u32(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('The PNG chunk structure is truncated.');
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    chunks.push({ type, start: offset, dataStart: offset + 8, dataEnd: offset + 8 + length, end });
    offset = end;
    if (type === 'IEND') break;
  }
  if (!chunks.some((chunk) => chunk.type === 'IEND')) throw new Error('The PNG image has no IEND chunk.');
  return chunks;
}

function parsePngXmp(bytes, chunk) {
  if (chunk.type !== 'iTXt') return null;
  const data = bytes.subarray(chunk.dataStart, chunk.dataEnd);
  let cursor = data.indexOf(0);
  if (cursor < 0 || decoder.decode(data.subarray(0, cursor)) !== 'XML:com.adobe.xmp') return null;
  cursor += 1;
  if (data[cursor] !== 0) throw new Error('Compressed PNG XMP is not supported.');
  cursor += 2;
  for (let field = 0; field < 2; field += 1) {
    const next = data.indexOf(0, cursor);
    if (next < 0) throw new Error('The PNG XMP text chunk is malformed.');
    cursor = next + 1;
  }
  return decoder.decode(data.subarray(cursor));
}

let crcTable;
function crc32(bytes) {
  if (!crcTable) {
    crcTable = Array.from({ length: 256 }, (_, index) => {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      return value >>> 0;
    });
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const typeBytes = encoder.encode(type);
  return concat(be32(data.length), typeBytes, data, be32(crc32(concat(typeBytes, data))));
}

function readPngXmp(bytes) {
  for (const chunk of pngChunks(bytes)) {
    const xml = parsePngXmp(bytes, chunk);
    if (xml !== null) return xml;
  }
  return '';
}

function writePngXmp(bytes, xml) {
  const chunks = pngChunks(bytes);
  const keyword = encoder.encode('XML:com.adobe.xmp');
  const data = concat(keyword, Uint8Array.from([0, 0, 0, 0, 0]), encoder.encode(xml));
  const xmpChunk = makePngChunk('iTXt', data);
  const parts = [PNG_SIGNATURE];
  for (const chunk of chunks) {
    if (parsePngXmp(bytes, chunk) !== null) continue;
    if (chunk.type === 'IEND') parts.push(xmpChunk);
    parts.push(bytes.subarray(chunk.start, chunk.end));
  }
  return concat(...parts);
}

function format(bytes, fileName = '') {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (equalAt(bytes, PNG_SIGNATURE)) return 'png';
  throw new Error(`${fileName || 'This file'} is not a supported JPEG or PNG image.`);
}

export function inspectImage(input, fileName = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = format(bytes, fileName);
  const xml = kind === 'jpeg' ? readJpegXmp(bytes) : readPngXmp(bytes);
  const subjects = readSubjectsFromXmp(xml);
  return { format: kind, subjects, hasTag: subjects.includes(TAG_VALUE), xmp: xml };
}

export function tagAndVerifyImage(input, fileName = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const before = inspectImage(bytes, fileName);
  const xml = addSubjectToXmp(before.xmp, TAG_VALUE);
  const output = before.format === 'jpeg' ? writeJpegXmp(bytes, xml) : writePngXmp(bytes, xml);
  const after = inspectImage(output, fileName);
  if (!after.hasTag) throw new Error('Verification failed: the exact XMP keyword was not found after writing.');
  return { bytes: output, before, after, changed: !before.hasTag };
}

export function inspectVideo(input, fileName = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const kind = inspectVideoContainer(bytes, fileName);
  const xml = readVideoXmp(bytes);
  const subjects = readSubjectsFromXmp(xml);
  return { format: kind, subjects, hasTag: subjects.includes(TAG_VALUE), xmp: xml };
}

export function tagAndVerifyVideo(input, fileName = '') {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const before = inspectVideo(bytes, fileName);
  const xml = addSubjectToXmp(before.xmp, TAG_VALUE);
  const output = writeVideoXmp(bytes, xml);
  const after = inspectVideo(output, fileName);
  if (!after.hasTag) throw new Error('Verification failed: the exact XMP keyword was not found after writing.');
  return { bytes: output, before, after, changed: !before.hasTag };
}
