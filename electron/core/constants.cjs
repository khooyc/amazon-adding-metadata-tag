const path = require('node:path');

const APP_NAME = 'Amazon - Adding Metadata Tag';
const TAG_VALUE = 'contains-synthetic-performer';
const TAG_FIELD = 'XMP-dc:Subject';
const DATA_DIRECTORY_NAME = '.listing-media-tagger';
const SOFTWARE_DISCLAIMER_URL = 'https://github.com/khooyc/amazon-adding-metadata-tag/blob/main/SOFTWARE_LICENCE_AND_DISCLAIMER.md';
const CREATOR_PROFILE_URL = 'https://github.com/khooyc';
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp']);
const MANUAL_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov']);

function normalizePath(filePath) {
  return path.resolve(filePath).toLocaleLowerCase('en-US');
}

module.exports = {
  APP_NAME,
  TAG_VALUE,
  TAG_FIELD,
  DATA_DIRECTORY_NAME,
  SOFTWARE_DISCLAIMER_URL,
  CREATOR_PROFILE_URL,
  SUPPORTED_IMAGE_EXTENSIONS,
  MANUAL_VIDEO_EXTENSIONS,
  normalizePath,
};
