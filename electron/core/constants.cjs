const path = require('node:path');

const APP_NAME = 'Amazon - Adding Metadata Tag';
const TAG_VALUE = 'contains-synthetic-performer';
const TAG_FIELD = 'XMP-dc:Subject';
const DATA_DIRECTORY_NAME = '.listing-media-tagger';
const SOFTWARE_DISCLAIMER_URL = 'https://github.com/khooyc/amazon-adding-metadata-tag/blob/main/SOFTWARE_LICENCE_AND_DISCLAIMER.md';
const CREATOR_PROFILE_URL = 'https://github.com/khooyc';
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const NO_SKU_GROUP = '__NO_SKU__';
const WRITABLE_VIDEO_EXTENSIONS = new Set(['.360', '.3g2', '.3gp', '.3gp2', '.3gpp', '.f4v', '.lrv', '.m4v', '.mov', '.mp4', '.mqv', '.qt']);
const VIDEO_EXTENSIONS = new Set([
  ...WRITABLE_VIDEO_EXTENSIONS,
  '.asf', '.avi', '.flv', '.m2ts', '.mkv', '.mpeg', '.mpg', '.mts', '.mxf', '.ogv', '.rm', '.rmvb', '.ts', '.vob', '.webm', '.wmv',
]);

function normalizePath(filePath, platform = process.platform) {
  const resolved = path.resolve(filePath);
  return platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

module.exports = {
  APP_NAME,
  TAG_VALUE,
  TAG_FIELD,
  DATA_DIRECTORY_NAME,
  SOFTWARE_DISCLAIMER_URL,
  CREATOR_PROFILE_URL,
  SUPPORTED_IMAGE_EXTENSIONS,
  NO_SKU_GROUP,
  VIDEO_EXTENSIONS,
  WRITABLE_VIDEO_EXTENSIONS,
  normalizePath,
};
