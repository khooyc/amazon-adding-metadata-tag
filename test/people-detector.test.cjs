const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadPeopleDetector(windowOverrides = {}, contextOverrides = {}) {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'people-detector.js'), 'utf8');
  const context = { URL, ...contextOverrides, window: { ...windowOverrides } };
  vm.runInNewContext(source, context, { filename: 'people-detector.js' });
  return context.window.peopleDetector;
}

test('people detection results are normalized to an advisory face/body summary', () => {
  const detector = loadPeopleDetector();
  const recommendation = detector.normalizeResult({
    face: [{ score: 0.82 }, { score: 0.74 }],
    body: [{ score: 0.91 }],
  });

  assert.equal(recommendation.hasPerson, true);
  assert.equal(recommendation.faceCount, 2);
  assert.equal(recommendation.bodyCount, 1);
  assert.equal(recommendation.maxConfidence, 0.91);
  assert.match(recommendation.detectorVersion, /^human-/);
});

test('model initialization failures are marked so a batch can fail fast', async () => {
  class TestImage {
    set src(_value) { queueMicrotask(() => this.onload()); }
  }
  class FailingHuman {
    async init() { throw new Error('model unavailable'); }
  }
  const detector = loadPeopleDetector(
    { Human: { Human: FailingHuman }, location: { href: 'https://app.test/src/index.html' } },
    { Image: TestImage, queueMicrotask },
  );

  await assert.rejects(detector.detectDataUrl('data:image/jpeg;base64,AA=='), (error) => (
    error.code === 'PEOPLE_DETECTOR_INIT_FAILED' && /model unavailable/.test(error.message)
  ));
});

test('empty detector output remains advisory and reports no person found', () => {
  const recommendation = loadPeopleDetector().normalizeResult({ face: [], body: [] });
  assert.deepEqual(
    JSON.parse(JSON.stringify(recommendation)),
    {
      hasPerson: false,
      faceCount: 0,
      bodyCount: 0,
      maxConfidence: 0,
      detectorVersion: 'human-3.3.6-face-body-v2',
    },
  );
});

test('zero-confidence detector placeholders do not become people recommendations', () => {
  const recommendation = loadPeopleDetector().normalizeResult({
    face: [{ score: 0.44 }],
    body: [{ score: 0 }],
  });

  assert.equal(recommendation.hasPerson, false);
  assert.equal(recommendation.faceCount, 0);
  assert.equal(recommendation.bodyCount, 0);
  assert.equal(recommendation.maxConfidence, 0);
});
