// ==================================================
// POTHOLE VISION
// YOLO26n + LIVE CAMERA + GPS + SUPABASE DATABASE
// ==================================================

// CONFIGURATION
const MODEL_URL =
  'https://raw.githubusercontent.com/brightonallan226-debug/pothole-model/main/best.onnx';

const SUPABASE_URL =
  'https://yujbvolzjgawjvwhohjf.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_sCj0uJc3lamhDxbyTkPqtw_dAeChOCm';

const SAVE_INSPECTION_URL =
  `${SUPABASE_URL}/functions/v1/save-inspection`;

const IMAGE_SIZE = 640;
const IOU_THRESHOLD = 0.45;
const MAX_CANDIDATES = 300;

// HTML ELEMENTS
const imageInput = document.getElementById('imageInput');
const browseButton = document.getElementById('browseButton');
const changeImageButton = document.getElementById('changeImageButton');

const cameraButton = document.getElementById('cameraButton');
const cameraPanel = document.getElementById('cameraPanel');
const cameraVideo = document.getElementById('cameraVideo');
const capturePhotoButton = document.getElementById('capturePhotoButton');
const cancelCameraButton = document.getElementById('cancelCameraButton');

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

// AUTHENTICATION ELEMENTS
const authForm = document.getElementById('authForm');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const signInButton = document.getElementById('signInButton');
const signUpButton = document.getElementById('signUpButton');
const signOutButton = document.getElementById('signOutButton');
const authUserPanel = document.getElementById('authUserPanel');
const signedInEmail = document.getElementById('signedInEmail');
const authMessage = document.getElementById('authMessage');

// APPLICATION STATE
let selectedImage = null;
let cameraStream = null;
let modelSession = null;
let overlay = null;
let isDetecting = false;

let currentUser = null;
let currentSession = null;
let supabaseClient = null;

// ==================================================
// SUPABASE
// ==================================================

function showAuthMessage(message, isError = false) {
  if (!authMessage) return;

  authMessage.textContent = message;
  authMessage.style.color = isError ? '#ff7777' : '#b7f34a';
}

function initialiseSupabase() {
  if (!window.supabase) {
    showAuthMessage('Supabase could not load. Refresh the page.', true);
    return false;
  }

  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    return true;
  } catch (error) {
    console.error('Supabase initialisation error:', error);
    showAuthMessage('Could not connect to Supabase.', true);
    return false;
  }
}

function updateAuthDisplay() {
  if (!authUserPanel || !authForm) return;

  if (currentUser) {
    authForm.hidden = true;
    authUserPanel.hidden = false;

    if (signedInEmail) {
      signedInEmail.textContent = currentUser.email || 'Signed in';
    }
  } else {
    authForm.hidden = false;
    authUserPanel.hidden = true;
  }
}

async function initialiseAuthentication() {
  if (!initialiseSupabase()) return;

  try {
    const { data, error } =
      await supabaseClient.auth.getSession();

    if (error) throw error;

    currentSession = data.session;
    currentUser = data.session?.user || null;

    updateAuthDisplay();

    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentSession = session;
      currentUser = session?.user || null;

      updateAuthDisplay();

      if (event === 'SIGNED_IN') {
        showAuthMessage('You are successfully signed in.');
      }

      if (event === 'SIGNED_OUT') {
        showAuthMessage('You have signed out.');
      }
    });

  } catch (error) {
    console.error(error);
    showAuthMessage('Could not check login status.', true);
  }
}

// CREATE ACCOUNT
if (signUpButton) {
  signUpButton.addEventListener('click', async () => {
    const email = authEmail?.value.trim();
    const password = authPassword?.value;

    if (!email || !password) {
      showAuthMessage('Enter your email and password.', true);
      return;
    }

    if (password.length < 8) {
      showAuthMessage('Password must contain at least 8 characters.', true);
      return;
    }

    signUpButton.disabled = true;
    showAuthMessage('Creating your account...');

    try {
      const { data, error } =
        await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              'https://brightonallan226-debug.github.io/stackblitz-starters-ln4rwj7x/'
          }
        });

      if (error) throw error;

      if (data.session) {
        currentSession = data.session;
        currentUser = data.user;
        updateAuthDisplay();
        showAuthMessage('Account created successfully.');
      } else {
        showAuthMessage(
          'Account created. If email confirmation is enabled, confirm your email before signing in.'
        );
      }

    } catch (error) {
      console.error(error);
      showAuthMessage(error.message, true);
    } finally {
      signUpButton.disabled = false;
    }
  });
}

// SIGN IN
if (signInButton) {
  signInButton.addEventListener('click', async () => {
    const email = authEmail?.value.trim();
    const password = authPassword?.value;

    if (!email || !password) {
      showAuthMessage('Enter your email and password.', true);
      return;
    }

    signInButton.disabled = true;
    showAuthMessage('Signing in...');

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      currentSession = data.session;
      currentUser = data.user;

      updateAuthDisplay();
      showAuthMessage('Welcome to Pothole Vision.');

    } catch (error) {
      console.error(error);
      showAuthMessage(error.message, true);
    } finally {
      signInButton.disabled = false;
    }
  });
}

// SIGN OUT
if (signOutButton) {
  signOutButton.addEventListener('click', async () => {
    if (!supabaseClient) return;

    signOutButton.disabled = true;

    try {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;

      currentSession = null;
      currentUser = null;

      updateAuthDisplay();
      showAuthMessage('You have signed out.');

    } catch (error) {
      console.error(error);
      showAuthMessage(error.message, true);
    } finally {
      signOutButton.disabled = false;
    }
  });
}

// ==================================================
// IMAGE SELECTION
// ==================================================

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
    status.textContent = 'Could not load this image. Try again.';
  };

  roadImage.src = selectedImage;
}

// ==================================================
// GALLERY BUTTON CONNECTIONS - CORRECTED
// ==================================================

function openImageGallery() {
  if (!imageInput) {
    status.textContent =
      'Photo gallery is unavailable. Please refresh the page.';
    return;
  }

  // Clear the previous selection so the same photo can be selected again.
  imageInput.value = '';

  // Open the device gallery.
  imageInput.click();
}

// CHOOSE A PHOTO BUTTON
if (browseButton) {
  browseButton.addEventListener('click', openImageGallery);
}

// CHANGE IMAGE BUTTON
if (changeImageButton) {
  changeImageButton.addEventListener('click', openImageGallery);
}

// PROCESS THE SELECTED GALLERY IMAGE
if (imageInput) {
  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];

    if (file) {
      handleImageFile(file);
    }
  });
}

// ==================================================
// LIVE REAR CAMERA
// ==================================================

async function openRearCamera() {
  if (!navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia) {
    status.textContent =
      'Live camera is unavailable. Open the website in Chrome over HTTPS.';
    return;
  }

  try {
    status.textContent = 'Requesting access to your rear camera...';

    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });

    cameraVideo.srcObject = cameraStream;
    cameraPanel.hidden = false;

    await cameraVideo.play();

    status.textContent =
      'Camera ready. Position the road and capture a photo.';

  } catch (error) {
    console.error('Camera access error:', error);
    stopRearCamera();

    if (error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError') {
      status.textContent =
        'Camera permission denied. Allow camera access in Chrome settings.';
    } else if (error.name === 'NotFoundError') {
      status.textContent = 'No camera was found on this device.';
    } else {
      status.textContent = 'Could not open camera: ' + error.message;
    }
  }
}

function stopRearCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (cameraVideo) {
    cameraVideo.pause();
    cameraVideo.srcObject = null;
  }

  if (cameraPanel) {
    cameraPanel.hidden = true;
  }
}

async function captureCameraPhoto() {
  if (!cameraVideo ||
      !cameraVideo.videoWidth ||
      !cameraVideo.videoHeight) {
    status.textContent = 'Camera is not ready yet. Please wait.';
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;

  const context = canvas.getContext('2d');
  context.drawImage(
    cameraVideo,
    0,
    0,
    canvas.width,
    canvas.height
  );

  canvas.toBlob((blob) => {
    if (!blob) {
      status.textContent = 'Could not capture the photograph.';
      return;
    }

    const photoFile = new File(
      [blob],
      `pothole-inspection-${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    );

    stopRearCamera();
    handleImageFile(photoFile);

  }, 'image/jpeg', 0.92);
}

if (cameraButton) {
  cameraButton.addEventListener('click', openRearCamera);
}

if (capturePhotoButton) {
  capturePhotoButton.addEventListener('click', captureCameraPhoto);
}

if (cancelCameraButton) {
  cancelCameraButton.addEventListener('click', () => {
    stopRearCamera();
    status.textContent = 'Camera closed. Choose a photo or take another one.';
  });
}

window.addEventListener('pagehide', stopRearCamera);

// ==================================================
// GPS
// ==================================================

function updateGPSDisplay(location) {
  if (!location) {
    locationStatus.textContent =
      'GPS location unavailable. Detection can continue without it.';

    latitudeElement.textContent = 'Not available';
    longitudeElement.textContent = 'Not available';
    gpsAccuracyElement.textContent = 'Not available';
    return;
  }

  latitudeElement.textContent = location.latitude.toFixed(7);
  longitudeElement.textContent = location.longitude.toFixed(7);
  gpsAccuracyElement.textContent =
    `${Math.round(location.accuracy)} metres`;

  locationStatus.textContent = 'GPS location successfully captured.';
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
        resolve(location);
      },

      (error) => {
        console.warn('GPS error:', error.message);

        let message = 'GPS location unavailable.';

        if (error.code === 1) {
          message = 'Location permission denied. Detection will continue.';
        } else if (error.code === 2) {
          message = 'GPS position unavailable. Detection will continue.';
        } else if (error.code === 3) {
          message = 'GPS request timed out. Detection will continue.';
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

// ==================================================
// LOAD YOLO MODEL
// ==================================================

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
  return modelSession;
}

// ==================================================
// IMAGE PREPROCESSING
// ==================================================

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

// ==================================================
// NON-MAXIMUM SUPPRESSION
// ==================================================

function calculateIoU(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection =
    Math.max(0, x2 - x1) * Math.max(0, y2 - y1);

  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);

  return intersection /
    (areaA + areaB - intersection + 1e-7);
}

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

      if (calculateIoU(best, candidates[j]) >= IOU_THRESHOLD) {
        suppressed[j] = 1;
      }
    }
  }

  return kept;
}

// ==================================================
// DECODE YOLO OUTPUT
// ==================================================

function decodePredictions(output, transform, confidenceThreshold) {
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

    if (!Number.isFinite(score) || score < confidenceThreshold) {
      continue;
    }

    const cx = data[i];
    const cy = data[8400 + i];
    const width = data[2 * 8400 + i];
    const height = data[3 * 8400 + i];

    const x1 =
      (cx - width / 2 - transform.padX) / transform.scale;

    const y1 =
      (cy - height / 2 - transform.padY) / transform.scale;

    const x2 =
      (cx + width / 2 - transform.padX) / transform.scale;

    const y2 =
      (cy + height / 2 - transform.padY) / transform.scale;

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

  return nonMaximumSuppression(candidates);
}

// ==================================================
// OVERLAY
// ==================================================

function removeOverlay() {
  const existing = document.getElementById('detectionOverlay');

  if (existing) existing.remove();
  overlay = null;
}

function drawDetections(boxes, image) {
  removeOverlay();

  overlay = document.createElement('canvas');
  overlay.id = 'detectionOverlay';
  overlay.width = image.naturalWidth;
  overlay.height = image.naturalHeight;

  const ctx = overlay.getContext('2d');

  ctx.lineWidth = Math.max(3, image.naturalWidth / 300);
  ctx.font =
    `bold ${Math.max(16, image.naturalWidth / 35)}px Arial`;

  boxes.forEach((box) => {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;

    ctx.strokeStyle = '#b7f34a';
    ctx.strokeRect(box.x1, box.y1, width, height);

    const label = `Pothole ${Math.round(box.score * 100)}%`;
    const labelWidth = ctx.measureText(label).width + 14;
    const labelHeight = Math.max(24, image.naturalWidth / 30);
    const labelY = Math.max(labelHeight, box.y1);

    ctx.fillStyle = '#b7f34a';
    ctx.fillRect(
      box.x1,
      labelY - labelHeight,
      labelWidth,
      labelHeight
    );

    ctx.fillStyle = '#101827';
    ctx.fillText(label, box.x1 + 7, labelY - 6);
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

// ==================================================
// INSPECTION REPORT
// ==================================================

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

  addReportLine('Total potholes detected', detections.length);

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

  let averageConfidence = 0;

  if (detections.length > 0) {
    averageConfidence =
      detections.reduce((sum, box) => sum + box.score, 0) /
      detections.length;

    addReportLine(
      'Average confidence',
      `${Math.round(averageConfidence * 100)}%`
    );

    const list = document.createElement('ul');

    detections.forEach((box, index) => {
      const item = document.createElement('li');

      item.textContent =
        `Pothole ${index + 1}: ${Math.round(box.score * 100)}% confidence`;

      list.appendChild(item);

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

  window.lastInspection = {
    inspectedAt,
    confidenceThreshold,
    location,
    detections,
    averageConfidence,
    elapsedTime
  };
}

// ==================================================
// SAVE INSPECTION TO SUPABASE
// ==================================================

async function saveInspectionToDatabase(inspection) {
  if (!supabaseClient) {
    throw new Error('Database connection is unavailable.');
  }

  if (!currentUser) {
    throw new Error('Please sign in before saving inspections.');
  }

  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  const session = sessionData.session;

  if (!session) {
    throw new Error('Your session has expired. Please sign in again.');
  }

  const detections = inspection.detections.map((box) => ({
    confidence: box.score,
    box_x: box.x1,
    box_y: box.y1,
    box_width: box.x2 - box.x1,
    box_height: box.y2 - box.y1,
    severity: null
  }));

  const payload = {
    inspected_at: inspection.inspectedAt,
    latitude: inspection.location ? inspection.location.latitude : null,
    longitude: inspection.location ? inspection.location.longitude : null,
    gps_accuracy: inspection.location ? inspection.location.accuracy : null,
    total_potholes: detections.length,
    confidence_threshold: inspection.confidenceThreshold,
    average_confidence: inspection.averageConfidence,
    processing_time_ms: Math.round(inspection.elapsedTime * 1000),
    detections
  };

  const response = await fetch(SAVE_INSPECTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_PUBLISHABLE_KEY,
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('Database save response:', responseData);

    throw new Error(
      responseData.error ||
      responseData.message ||
      `Could not save inspection. Server returned ${response.status}.`
    );
  }

  return responseData;
}

// ==================================================
// MAIN DETECTION
// ==================================================

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
    status.textContent = 'Please select a valid confidence threshold.';
    return;
  }

  isDetecting = true;
  detectButton.disabled = true;
  results.textContent = '';
  removeOverlay();

  const startTime = performance.now();
  const inspectedAt = new Date().toISOString();

  try {
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
    const output = predictions[modelSession.outputNames[0]];

    const detections = decodePredictions(
      output,
      prepared,
      confidenceThreshold
    );

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

    if (currentUser) {
      status.textContent = 'Detection complete. Saving inspection...';

      try {
        await saveInspectionToDatabase(window.lastInspection);

        status.textContent =
          'Inspection complete and successfully saved to your account.';

      } catch (saveError) {
        console.error('Inspection saving error:', saveError);

        status.textContent =
          'Detection complete, but database saving failed: ' +
          saveError.message;
      }

    } else {
      status.textContent +=
        ' Sign in to save this inspection to your account.';
    }

  } catch (error) {
    console.error('Detection error:', error);
    status.textContent = 'Detection failed.';
    results.textContent = error.message || String(error);

  } finally {
    isDetecting = false;
    detectButton.disabled = false;
  }
});

// START APPLICATION
initialiseAuthentication();

console.log('Pothole Vision application initialised.');