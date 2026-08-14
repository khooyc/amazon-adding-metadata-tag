const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { TAG_FIELD, TAG_VALUE } = require('./constants.cjs');

const execFileAsync = promisify(execFile);

function getExifToolPath({ appPath, resourcesPath, packaged = false, platform = process.platform }) {
  const vendor = platform === 'win32'
    ? { packageName: 'exiftool-vendored.exe', executable: 'exiftool.exe' }
    : { packageName: 'exiftool-vendored.pl', executable: 'exiftool' };
  const basePath = packaged
    ? path.join(resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(appPath, 'node_modules');
  return path.join(basePath, vendor.packageName, 'bin', vendor.executable);
}

function normalizeSubjects(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

class ExifToolClient {
  constructor(executablePath) {
    this.executablePath = executablePath;
  }

  async execute(args, options = {}) {
    // A UTF-8 ExifTool argument file preserves non-ASCII names such as
    // `(改)listing.jpg`, including on Windows UNC shares.
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lmtr-exiftool-'));
    const argumentFile = path.join(temporaryDirectory, 'arguments.txt');
    try {
      await fs.writeFile(argumentFile, `${args.join('\n')}\n`, 'utf8');
      return await execFileAsync(this.executablePath, [
        '-charset',
        'filename=UTF8',
        '-@',
        argumentFile,
      ], {
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
        ...options,
      });
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  async version() {
    const { stdout } = await this.execute(['-ver']);
    return stdout.trim();
  }

  async readMetadata(filePath) {
    const records = await this.readMetadataBatch([filePath]);
    return records[0];
  }

  async readMetadataBatch(filePaths, onProgress) {
    const results = [];
    const chunkSize = 80;
    for (let index = 0; index < filePaths.length; index += chunkSize) {
      const chunk = filePaths.slice(index, index + chunkSize);
      const { stdout } = await this.execute([
        '-j',
        '-n',
        '-XMP-dc:Subject',
        '-ImageWidth',
        '-ImageHeight',
        ...chunk,
      ]);
      const parsed = JSON.parse(stdout || '[]');
      for (const record of parsed) {
        const subjects = normalizeSubjects(record.Subject);
        results.push({
          sourceFile: record.SourceFile,
          subjects,
          tagCount: subjects.filter((value) => value === TAG_VALUE).length,
          hasTag: subjects.includes(TAG_VALUE),
          width: Number(record.ImageWidth) || null,
          height: Number(record.ImageHeight) || null,
        });
      }
      onProgress?.({ completed: Math.min(index + chunk.length, filePaths.length), total: filePaths.length });
    }
    return results;
  }

  async addTag(filePath) {
    const before = await this.readMetadata(filePath);
    if (before.hasTag) return { changed: false, before, after: before };
    await this.execute(['-overwrite_original', `-${TAG_FIELD}+=${TAG_VALUE}`, filePath]);
    const after = await this.readMetadata(filePath);
    return { changed: true, before, after };
  }

  async removeTag(filePath) {
    const before = await this.readMetadata(filePath);
    if (!before.hasTag) return { changed: false, before, after: before };
    await this.execute(['-overwrite_original', `-${TAG_FIELD}-=${TAG_VALUE}`, filePath]);
    const after = await this.readMetadata(filePath);
    return { changed: true, before, after };
  }

  async normalizeTag(filePath) {
    const before = await this.readMetadata(filePath);
    if (before.tagCount <= 1) return { changed: false, before, after: before };
    await this.execute([
      '-overwrite_original',
      `-${TAG_FIELD}-=${TAG_VALUE}`,
      `-${TAG_FIELD}+=${TAG_VALUE}`,
      filePath,
    ]);
    const after = await this.readMetadata(filePath);
    return { changed: true, before, after };
  }
}

module.exports = { ExifToolClient, getExifToolPath, normalizeSubjects };
