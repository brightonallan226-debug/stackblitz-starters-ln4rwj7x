
const MODEL_URL =
  'https://raw.githubusercontent.com/brightonallan226-debug/pothole-model/main/best.onnx';

const IMAGE_SIZE = 640;
const IOU_THRESHOLD = 0.45;
const MAX_CANDIDATES = 300;

// --------------------------------------------------
// HTML ELEMENTS
// --------------------------------------------------

const imageInput = document.getElementById('imageInput');
const cameraInput = document.getElementById('cameraInput');
const cameraButton = document.getElementById('cameraButton');
const roadImage = document.getElementById('roadImage');
const imagePreview = document.getElementById('imagePreview');
const detectButton = document.getElementById('detectButton');
const confidenceSelector = document.getElementById('confidenceThreshold');
const status = document.getElementById('status');
const results = document.getElementById('results');

const locationStatus = document.getElementById('locationStatus');
const latitudeElement = document.getElementById('latitude');
const longitudeElement = document.getElementById('longitude');
const gpsAccuracyElement = document.getElementById('gpsAccuracy');

// --------------------------------------------------
// APPLICATION STATE
// --------------------------------------------------

let selectedImage = null;
let modelSession = null;
let overlay = null;
let isDetecting = false;

// --------------------------------------------------
// IMAGE AND CAMERA SELECTION
// --------------------------------------------------

function handleImageFile(file) {
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    status.textContent = 'Please select a valid image.';
    return;
  }

  if (selectedImage) {
    URL.revokeObjectURL(selectedImage);
  }

  selectedImage = URL.createObjectURL(file);

  roadImage.onload = () => {
    imagePreview.hidden = false;
    detectButton.disabled = false;
    results.textContent = '';
    removeOverlay();

    status.textContent =
      'Image ready. Choose confidence and detect potholes.';
  };

  roadImage.onerror = () => {
    status.textContent =
      'Could not load this image. Please try again.';
  };

  roadImage.src = selectedImage;
}

// Gallery upload
imageInput.addEventListener('change', () => {
  handleImageFile(imageInput.files?.[0]);
});

// Open Android camera
cameraButton.addEventListener('click', () => {
  cameraInput.click();
});

// Process camera photograph
cameraInput.addEventListener('change', () => {
  handleImageFile(cameraInput.files?.[0]);
});

// --------------------------------------------------
// GPS LOCATION CAPTURE
// --------------------------------------------------

function updateGPSDisplay(location) {
  if (!location) {
    locationStatus.textContent =
      'GPS location unavailable. Detection can continue without it.';

    latitudeElement.textContent = 'Not available';
    longitudeElement.textContent = 'Not available';
    gpsAccuracyElement.textContent = 'Not available';

    return;
  }

  latitudeElement.textContent =
    location.latitude.toFixed(7);

  longitudeElement.textContent =
    location.longitude.toFixed(7);

  gpsAccuracyElement.textContent =
    `${Math.round(location.accuracy)} metres`;

  locationStatus.textContent =
    'GPS location successfully captured.';
}

function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      updateGPSDisplay(null);
      resolve(null);
      return;
    }

    locationStatus.textContent =
      'Requesting GPS location. Please allow access...';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };

        updateGPSDisplay(location);
        console.log('GPS location:', location);

        resolve(location);
      },

      (error) => {
        console.warn('GPS error:', error.message);

        let message = 'GPS location unavailable.';

        if (error.code === 1) {
          message =
            'Location permission denied. Detection will continue.';
        } else if (error.code === 2) {
          message =
            'GPS position unavailable. Detection will continue.';
        } else if (error.code === 3) {
          message =
            'GPS request timed out. Detection will continue.';
        }

        locationStatus.textContent = message;
        updateGPSDisplay(null);

        resolve(null);
      },

      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  });
}

// --------------------------------------------------
// LOAD MODEL ONCE AND REUSE IT
// --------------------------------------------------

async function loadModel() {
  if (modelSession) return modelSession;

  if (!window.ort) {
    throw new Error('ONNX Runtime could not be loaded.');
  }

  status.textContent = 'Loading AI model for the first time...';

  window.ort.env.wasm.wasmPaths =
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

  modelSession = await window.ort.InferenceSession.create(
    MODEL_URL,
    {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    }
  );

  console.log('Model loaded successfully.');
  console.log('Input:', modelSession.inputMetadata);
  console.log('Output:', modelSession.outputMetadata);

  return modelSession;
}

// --------------------------------------------------
// PREPROCESS IMAGE
// --------------------------------------------------

function prepareImage(image) {
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;

  const scale = Math.min(
    IMAGE_SIZE / originalWidth,
    IMAGE_SIZE / originalHeight
  );

  const resizedWidth = Math.round(originalWidth * scale);
  const resizedHeight = Math.round(originalHeight * scale);

  const padX = (IMAGE_SIZE - resizedWidth) / 2;
  const padY = (IMAGE_SIZE - resizedHeight) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;

  const ctx = canvas.getContext('2d', {
    willReadFrequently: true
  });

  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, IMAGE_SIZE, IMAGE_SIZE);

  ctx.drawImage(
    image,
    0,
    0,
    originalWidth,
    originalHeight,
    padX,
    padY,
    resizedWidth,
    resizedHeight
  );

  const pixels = ctx.getImageData(
    0,
    0,
    IMAGE_SIZE,
    IMAGE_SIZE
  ).data;

  const planeSize = IMAGE_SIZE * IMAGE_SIZE;
  const input = new Float32Array(3 * planeSize);

  for (let i = 0; i < planeSize; i++) {
    input[i] = pixels[i * 4] / 255;
    input[planeSize + i] = pixels[i * 4 + 1] / 255;
    input[2 * planeSize + i] = pixels[i * 4 + 2] / 255;
  }

  return {
    tensor: new window.ort.Tensor(
      'float32',
      input,
      [1, 3, IMAGE_SIZE, IMAGE_SIZE]
    ),
    scale,
    padX,
    padY,
    originalWidth,
    originalHeight
  };
}

// --------------------------------------------------
// CALCULATE BOX OVERLAP
// --------------------------------------------------

function calculateIoU(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection =
    Math.max(0, x2 - x1) *
    Math.max(0, y2 - y1);

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);

  return intersection /
    (areaA + areaB - intersection + 1e-7);
}

// --------------------------------------------------
// OPTIMISED NON-MAXIMUM SUPPRESSION
// --------------------------------------------------

function nonMaximumSuppression(boxes) {
  boxes.sort((a, b) => b.score - a.score);

  const candidates = boxes.slice(0, MAX_CANDIDATES);
  const kept = [];
  const suppressed = new Uint8Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    if (suppressed[i]) continue;

    const best = candidates[i];
    kept.push(best);

    for (let j = i + 1; j < candidates.length; j++) {
      if (suppressed[j]) continue;

      if (
        calculateIoU(best, candidates[j]) >= IOU_THRESHOLD
      ) {
        suppressed[j] = 1;
      }
    }
  }

  return kept;
}

// --------------------------------------------------
// DECODE YOLO OUTPUT
// --------------------------------------------------

function decodePredictions(
  output,
  transform,
  confidenceThreshold
) {
  const data = output.data;
  const dimensions = output.dims;

  if (
    dimensions.length !== 3 ||
    dimensions[1] !== 5 ||
    dimensions[2] !== 8400
  ) {
    throw new Error(
      'Unexpected model output shape: ' +
      JSON.stringify(dimensions)
    );
  }

  const candidates = [];

  for (let i = 0; i < 8400; i++) {
    const score = data[4 * 8400 + i];

    if (
      !Number.isFinite(score) ||
      score < confidenceThreshold
    ) {
      continue;
    }

    const cx = data[i];
    const cy = data[8400 + i];
    const width = data[2 * 8400 + i];
    const height = data[3 * 8400 + i];

    const x1 =
      (cx - width / 2 - transform.padX) /
      transform.scale;

    const y1 =
      (cy - height / 2 - transform.padY) /
      transform.scale;

    const x2 =
      (cx + width / 2 - transform.padX) /
      transform.scale;

    const y2 =
      (cy + height / 2 - transform.padY) /
      transform.scale;

    const box = {
      x1: Math.max(0, Math.min(transform.originalWidth, x1)),
      y1: Math.max(0, Math.min(transform.originalHeight, y1)),
      x2: Math.max(0, Math.min(transform.originalWidth, x2)),
      y2: Math.max(0, Math.min(transform.originalHeight, y2)),
      score
    };

    if (box.x2 > box.x1 && box.y2 > box.y1) {
      candidates.push(box);
    }
  }

  console.log('Selected confidence:', confidenceThreshold);
  console.log('Candidates before NMS:', candidates.length);

  return nonMaximumSuppression(candidates);
}

// --------------------------------------------------
// REMOVE OLD OVERLAY
// --------------------------------------------------

function removeOverlay() {
  const existing =
    document.getElementById('detectionOverlay');

  if (existing) existing.remove();

  overlay = null;
}

// --------------------------------------------------
// DRAW BOUNDING BOXES
// --------------------------------------------------

function drawDetections(boxes, image) {
  removeOverlay();

  overlay = document.createElement('canvas');
  overlay.id = 'detectionOverlay';

  overlay.width = image.naturalWidth;
  overlay.height = image.naturalHeight;

  const ctx = overlay.getContext('2d');

  ctx.lineWidth = Math.max(
    3,
    image.naturalWidth / 300
  );

  ctx.font =
    `bold ${Math.max(16, image.naturalWidth / 35)}px Arial`;

  boxes.forEach((box) => {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;

    ctx.strokeStyle = '#b7f34a';
    ctx.strokeRect(box.x1, box.y1, width, height);

    const label =
      `Pothole ${Math.round(box.score * 100)}%`;

    const labelWidth =
      ctx.measureText(label).width + 14;

    const labelHeight =
      Math.max(24, image.naturalWidth / 30);

    const labelY =
      Math.max(labelHeight, box.y1);

    ctx.fillStyle = '#b7f34a';

    ctx.fillRect(
      box.x1,
      labelY - labelHeight,
      labelWidth,
      labelHeight
    );

    ctx.fillStyle = '#101827';

    ctx.fillText(
      label,
      box.x1 + 7,
      labelY - 6
    );
  });

  imagePreview.style.position = 'relative';

  image.style.display = 'block';
  image.style.margin = 'auto';

  overlay.style.position = 'absolute';
  overlay.style.top = '0';
  overlay.style.left = '50%';
  overlay.style.transform = 'translateX(-50%)';

  overlay.style.width =
    image.getBoundingClientRect().width + 'px';

  overlay.style.height =
    image.getBoundingClientRect().height + 'px';

  overlay.style.pointerEvents = 'none';

  imagePreview.appendChild(overlay);
}

// --------------------------------------------------
// DISPLAY INSPECTION REPORT
// --------------------------------------------------

function displayReport(
  detections,
  elapsedTime,
  confidenceThreshold,
  location,
  inspectedAt
) {
  results.innerHTML = '';

  const summary = document.createElement('div');
  summary.className = 'detection-summary';

  function addReportLine(label, value) {
    const line = document.createElement('p');
    line.textContent = `${label}: ${value}`;
    summary.appendChild(line);
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Road Inspection Report';
  summary.appendChild(heading);

  addReportLine(
    'Total potholes detected',
    detections.length
  );

  addReportLine(
    'Confidence threshold',
    `${Math.round(confidenceThreshold * 100)}%`
  );

  addReportLine(
    'Inspection date and time',
    new Date(inspectedAt).toLocaleString()
  );

  addReportLine(
    'Analysis time',
    `${elapsedTime.toFixed(2)} seconds`
  );

  if (location) {
    addReportLine(
      'Latitude',
      location.latitude.toFixed(7)
    );

    addReportLine(
      'Longitude',
      location.longitude.toFixed(7)
    );

    addReportLine(
      'GPS accuracy',
      `${Math.round(location.accuracy)} metres`
    );
  } else {
    addReportLine(
      'GPS location',
      'Unavailable'
    );
  }

  if (detections.length > 0) {
    const average =
      detections.reduce(
        (sum, box) => sum + box.score,
        0
      ) / detections.length;

    addReportLine(
      'Average confidence',
      `${Math.round(average * 100)}%`
    );

    const list = document.createElement('ul');

    detections.forEach((box, index) => {
      const item = document.createElement('li');

      item.textContent =
        `Pothole ${index + 1}: ` +
        `${Math.round(box.score * 100)}% confidence`;

      list.appendChild(item);

      // Attach inspection metadata to each detection.
      box.inspection = {
        inspectedAt,
        latitude: location ? location.latitude : null,
        longitude: location ? location.longitude : null,
        gpsAccuracy: location ? location.accuracy : null,
        confidenceThreshold
      };
    });

    summary.appendChild(list);
  } else {
    const message = document.createElement('p');

    message.textContent =
      'No potholes detected above the selected confidence threshold.';

    summary.appendChild(message);
  }

  results.appendChild(summary);

  // Keep structured inspection data available for future export.
  window.lastInspection = {
    inspectedAt,
    confidenceThreshold,
    location,
    detections
  };

  console.log('Complete inspection record:', window.lastInspection);
}

// --------------------------------------------------
// MAIN DETECTION FUNCTION
// --------------------------------------------------

detectButton.addEventListener('click', async () => {
  if (isDetecting) return;

  if (!selectedImage) {
    status.textContent =
      'Please select an image or take a photo first.';
    return;
  }

  const confidenceThreshold = confidenceSelector
    ? Number(confidenceSelector.value)
    : 0.25;

  if (
    !Number.isFinite(confidenceThreshold) ||
    confidenceThreshold <= 0 ||
    confidenceThreshold > 1
  ) {
    status.textContent =
      'Please select a valid confidence threshold.';
    return;
  }

  isDetecting = true;
  detectButton.disabled = true;

  results.textContent = '';
  removeOverlay();

  const startTime = performance.now();
  const inspectedAt = new Date().toISOString();

  try {
    // Request GPS immediately from the user's button interaction.
    const gpsPromise = getGPSLocation();

    status.textContent = 'Loading AI model...';

    await loadModel();

    status.textContent = 'Preparing road image...';

    if (!roadImage.complete || !roadImage.naturalWidth) {
      await new Promise((resolve, reject) => {
        roadImage.onload = resolve;
        roadImage.onerror = reject;
      });
    }

    const prepared = prepareImage(roadImage);

    status.textContent =
      `AI analysing road at ${Math.round(confidenceThreshold * 100)}% confidence...`;

    await new Promise(resolve => setTimeout(resolve, 30));

    const feeds = {
      [modelSession.inputNames[0]]: prepared.tensor
    };

    const predictions = await modelSession.run(feeds);

    const output =
      predictions[modelSession.outputNames[0]];

    const detections = decodePredictions(
      output,
      prepared,
      confidenceThreshold
    );

    // Wait for GPS, but never prevent detection if GPS fails.
    const location = await gpsPromise;

    drawDetections(detections, roadImage);

    const elapsedTime =
      (performance.now() - startTime) / 1000;

    displayReport(
      detections,
      elapsedTime,
      confidenceThreshold,
      location,
      inspectedAt
    );

    status.textContent = detections.length > 0
      ? `Inspection complete: ${detections.length} pothole(s) detected.`
      : 'Inspection complete: no potholes detected.';

    console.log('Analysis time:', elapsedTime, 'seconds');
    console.log('Pothole detections:', detections);

  } catch (error) {
    console.error('Detection error:', error);

    status.textContent = 'Detection failed.';
    results.textContent = error.message || String(error);

  } finally {
    isDetecting = false;
    detectButton.disabled = false;
  }
});
