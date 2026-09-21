(() => {
  const DETECTOR_VERSION = 'human-3.3.6-face-body-web-v2';
  const FACE_THRESHOLD = 0.45;
  const BODY_THRESHOLD = 0.25;
  const BODY_MIN_CONFIDENT_KEYPOINTS = 4;
  const BODY_MIN_BOX_SIZE = 8;
  let detectorPromise;

  function isUsableBodyPose(item) {
    if (Number(item?.score) < BODY_THRESHOLD) return false;
    const width = Number(item?.box?.[2]);
    const height = Number(item?.box?.[3]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
    if (width < BODY_MIN_BOX_SIZE || height < BODY_MIN_BOX_SIZE) return false;
    const confidentKeypoints = (Array.isArray(item?.keypoints) ? item.keypoints : [])
      .filter((point) => Number(point?.score) >= BODY_THRESHOLD);
    return confidentKeypoints.length >= BODY_MIN_CONFIDENT_KEYPOINTS;
  }

  function normalize(result) {
    const faces = (result?.face || []).filter((item) => Number(item.score) >= FACE_THRESHOLD);
    const bodies = (result?.body || []).filter(isUsableBodyPose);
    return {
      hasPerson: faces.length > 0 || bodies.length > 0,
      faceCount: faces.length,
      bodyCount: bodies.length,
      detectorVersion: DETECTOR_VERSION,
    };
  }

  async function create() {
    if (!window.Human?.Human) throw new Error('The bundled local people detector could not load.');
    const human = new window.Human.Human({
      backend: 'webgl',
      modelBasePath: new URL('./models/', window.location.href).href,
      async: true,
      cacheModels: true,
      debug: false,
      warmup: 'none',
      face: {
        enabled: true,
        detector: { enabled: true, maxDetected: 20, minConfidence: FACE_THRESHOLD, minSize: 12 },
        mesh: { enabled: false }, iris: { enabled: false }, description: { enabled: false },
        emotion: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, gear: { enabled: false },
      },
      body: { enabled: true, modelPath: 'movenet-lightning.json', maxDetected: 1, minConfidence: BODY_THRESHOLD },
      hand: { enabled: false }, gesture: { enabled: false }, object: { enabled: false }, segmentation: { enabled: false },
    });
    await human.init();
    await human.load();
    return human;
  }

  function detector() {
    if (!detectorPromise) detectorPromise = create().catch((error) => {
      detectorPromise = null;
      throw error;
    });
    return detectorPromise;
  }

  async function loadImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
      await image.decode();
      return image;
    } finally {
      // Human reads the decoded bitmap synchronously when detect() starts.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function detect(file) {
    const [human, image] = await Promise.all([detector(), loadImage(file)]);
    const result = await human.detect(image);
    if (result?.error) throw new Error(result.error);
    return normalize(result);
  }

  window.webPeopleDetector = Object.freeze({ detect, normalize, DETECTOR_VERSION });
})();
