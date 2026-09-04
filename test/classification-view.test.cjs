const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadClassificationView() {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'classification-view.js'), 'utf8');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'classification-view.js' });
  return context.window.classificationView;
}

test('Detect people targets the current tagged workflow without reanalyzing content', () => {
  const { detectionCandidates } = loadClassificationView();
  const detectorVersion = 'human-test-v1';
  const items = [
    { name: 'review.jpg', mediaType: 'image', status: 'review', contentHash: 'review' },
    { name: 'tagged-a.jpg', mediaType: 'image', status: 'tagged', contentHash: 'tagged-new' },
    { name: 'tagged-copy.jpg', mediaType: 'image', status: 'tagged', contentHash: 'tagged-new' },
    { name: 'tagged-old.jpg', mediaType: 'image', status: 'tagged', contentHash: 'tagged-old', classificationRecommendation: { detectorVersion: 'old-version', hasPerson: true } },
    { name: 'tagged-current.jpg', mediaType: 'image', status: 'tagged', contentHash: 'tagged-current', classificationRecommendation: { detectorVersion, hasPerson: true } },
    { name: 'tagged-video.mp4', mediaType: 'video', status: 'tagged', contentHash: 'video' },
  ];

  assert.deepEqual(
    [...detectionCandidates(items, 'tagged', detectorVersion)].map((item) => item.name),
    ['tagged-a.jpg', 'tagged-old.jpg'],
  );
});

test('Already tagged summarizes how many visible files have current people detections', () => {
  const { taggedPeopleSummary } = loadClassificationView();
  const detectorVersion = 'human-test-v1';
  const items = [
    { mediaType: 'image', status: 'tagged', contentHash: 'person', classificationRecommendation: { detectorVersion, hasPerson: true } },
    { mediaType: 'image', status: 'tagged', contentHash: 'person', classificationRecommendation: { detectorVersion, hasPerson: true } },
    { mediaType: 'image', status: 'tagged', contentHash: 'empty', classificationRecommendation: { detectorVersion, hasPerson: false } },
    { mediaType: 'image', status: 'review', contentHash: 'review', classificationRecommendation: { detectorVersion, hasPerson: true } },
    { mediaType: 'image', status: 'tagged', contentHash: 'stale', classificationRecommendation: { detectorVersion: 'old-version', hasPerson: true } },
    { mediaType: 'video', status: 'tagged', contentHash: 'video' },
  ];

  assert.deepEqual(
    JSON.parse(JSON.stringify(taggedPeopleSummary(items, detectorVersion))),
    { analyzedFiles: 3, peopleFiles: 2 },
  );
});

test('Completing tagged detection stays on Already tagged instead of opening a separate page', () => {
  const { viewAfterPeopleDetection } = loadClassificationView();

  assert.equal(viewAfterPeopleDetection('tagged'), 'tagged');
});
