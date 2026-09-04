(() => {
  const DETECTOR_VERSION = 'human-3.3.6-face-body-v2';
  const FACE_CONFIDENCE_THRESHOLD = 0.45;
  const BODY_CONFIDENCE_THRESHOLD = 0.25;
  let detectorPromise = null;

  function normalizeResult(result) {
    const faces = (Array.isArray(result?.face) ? result.face : [])
      .filter((item) => Number(item?.score) >= FACE_CONFIDENCE_THRESHOLD);
    const bodies = (Array.isArray(result?.body) ? result.body : [])
      .filter((item) => Number(item?.score) >= BODY_CONFIDENCE_THRESHOLD);
    const scores = [...faces, ...bodies]
      .map((item) => Number(item?.score) || 0)
      .filter((score) => score >= 0 && score <= 1);
    const faceCount = faces.length;
    const bodyCount = bodies.length;
    return {
      hasPerson: faceCount > 0 || bodyCount > 0,
      faceCount,
      bodyCount,
      maxConfidence: scores.length ? Math.max(...scores) : 0,
      detectorVersion: DETECTOR_VERSION,
    };
  }

  async function createDetector() {
    if (!window.Human?.Human) throw new Error('The local people detector could not be loaded.');
    const detector = new window.Human.Human({
      backend: 'webgl',
      modelBasePath: new URL('../node_modules/@vladmandic/human/models/', window.location.href).href,
      async: true,
      cacheModels: true,
      debug: false,
      skipAllowed: false,
      warmup: 'none',
      face: {
        enabled: true,
        detector: { enabled: true, maxDetected: 20, minConfidence: FACE_CONFIDENCE_THRESHOLD, minSize: 12 },
        mesh: { enabled: false },
        iris: { enabled: false },
        description: { enabled: false },
        emotion: { enabled: false },
        antispoof: { enabled: false },
        liveness: { enabled: false },
        gear: { enabled: false },
      },
      body: {
        enabled: true,
        modelPath: 'movenet-lightning.json',
        maxDetected: 1,
        minConfidence: BODY_CONFIDENCE_THRESHOLD,
      },
      hand: { enabled: false },
      gesture: { enabled: false },
      object: { enabled: false },
      segmentation: { enabled: false },
    });
    await detector.init();
    await detector.load();
    return detector;
  }

  function getDetector() {
    if (!detectorPromise) detectorPromise = createDetector().catch((error) => {
      detectorPromise = null;
      const initializationError = new Error(error?.message || 'The local people detector could not be initialized.');
      initializationError.code = 'PEOPLE_DETECTOR_INIT_FAILED';
      throw initializationError;
    });
    return detectorPromise;
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The image preview could not be decoded for local detection.'));
      image.src = dataUrl;
    });
  }

  async function detectDataUrl(dataUrl) {
    const [detector, image] = await Promise.all([getDetector(), loadImage(dataUrl)]);
    const result = await detector.detect(image);
    if (result?.error) throw new Error(result.error);
    return normalizeResult(result);
  }

  window.peopleDetector = Object.freeze({ DETECTOR_VERSION, detectDataUrl, normalizeResult });
})();
