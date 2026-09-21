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

function loadWebPeopleDetector() {
  const source = fs.readFileSync(path.join(projectRoot, 'web', 'people-detector.js'), 'utf8');
  const context = { URL, window: {} };
  vm.runInNewContext(source, context, { filename: 'web/people-detector.js' });
  return context.window.webPeopleDetector;
}

function validBody(score = 0.76) {
  return {
    score,
    box: [795, 744, 247, 281],
    keypoints: [
      { score: 0.63, position: [892, 758] },
      { score: 0.42, position: [908, 744] },
      { score: 0.45, position: [879, 744] },
      { score: 0.71, position: [938, 755] },
    ],
  };
}

test('people detection results are normalized to an advisory face/body summary', () => {
  const detector = loadPeopleDetector();
  const recommendation = detector.normalizeResult({
    face: [{ score: 0.82 }, { score: 0.74 }],
    body: [validBody(0.91)],
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
      detectorVersion: 'human-3.3.6-face-body-v3',
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

test('degenerate one-keypoint vest pose is rejected in desktop and browser detection', () => {
  const falseVestPose = {
    score: 0.28,
    box: [219, 792, 0, 0],
    keypoints: [{ score: 0.28, position: [219, 792] }],
  };

  const desktop = loadPeopleDetector().normalizeResult({ face: [], body: [falseVestPose] });
  const browser = loadWebPeopleDetector().normalize({ face: [], body: [falseVestPose] });

  assert.equal(desktop.hasPerson, false);
  assert.equal(desktop.bodyCount, 0);
  assert.equal(browser.hasPerson, false);
  assert.equal(browser.bodyCount, 0);
});

test('small model with valid face and body geometry remains detected', () => {
  const imageSixResult = {
    face: [{ score: 0.93, box: [858, 711, 89, 89] }],
    body: [validBody()],
  };

  const desktop = loadPeopleDetector().normalizeResult(imageSixResult);
  const browser = loadWebPeopleDetector().normalize(imageSixResult);

  assert.equal(desktop.hasPerson, true);
  assert.equal(desktop.faceCount, 1);
  assert.equal(desktop.bodyCount, 1);
  assert.equal(browser.hasPerson, true);
  assert.equal(browser.faceCount, 1);
  assert.equal(browser.bodyCount, 1);
});
