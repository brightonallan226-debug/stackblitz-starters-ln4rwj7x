
/* =========================================================
   POTHOLE VISION
   MAP-FIRST APPLICATION
   YOLO26n + CAMERA + GPS + SUPABASE
========================================================= */

/* =========================================================
   CONFIGURATION
========================================================= */

const MODEL_URL =
  "https://raw.githubusercontent.com/brightonallan226-debug/pothole-model/main/best.onnx";

const SUPABASE_URL =
  "https://yujbvolzjgawjvwhohjf.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_sCj0uJc3lamhDxbyTkPqtw_dAeChOCm";

const SAVE_INSPECTION_URL =
  `${SUPABASE_URL}/functions/v1/save-inspection`;

const IMAGE_SIZE = 640;
const IOU_THRESHOLD = 0.45;
const MAX_CANDIDATES = 300;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;

/* =========================================================
   AUTHENTICATION ELEMENTS
========================================================= */

const loginScreen = document.getElementById("loginScreen");
const appWorkspace = document.getElementById("appWorkspace");

const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

const signInButton = document.getElementById("signInButton");
const signUpButton = document.getElementById("signUpButton");
const signOutButton = document.getElementById("signOutButton");

const authUserPanel = document.getElementById("authUserPanel");
const signedInEmail = document.getElementById("signedInEmail");
const authMessage = document.getElementById("authMessage");

/* =========================================================
   HIDDEN AI ELEMENTS
========================================================= */

const roadImage = document.getElementById("roadImage");
const imagePreview = document.getElementById("imagePreview");

const detectButton = document.getElementById("detectButton");
const confidenceSelector =
  document.getElementById("confidenceThreshold");

const status = document.getElementById("status");
const results = document.getElementById("results");

const locationStatus =
  document.getElementById("locationStatus");

const latitudeElement =
  document.getElementById("latitude");

const longitudeElement =
  document.getElementById("longitude");

const gpsAccuracyElement =
  document.getElementById("gpsAccuracy");

/* =========================================================
   NEW MAP INTERFACE ELEMENTS
========================================================= */

const recordPotholeButton =
  document.getElementById("recordPotholeButton");

const recordPotholeText =
  document.getElementById("recordPotholeText");

const mapLocationText =
  document.getElementById("mapLocationText");

const hazardAlertOverlay =
  document.getElementById("hazardAlertOverlay");

const hazardAlertTitle =
  document.getElementById("hazardAlertTitle");

const hazardAlertMessage =
  document.getElementById("hazardAlertMessage");

/* =========================================================
   APPLICATION STATE
========================================================= */

let selectedImage = null;
let modelSession = null;
let isDetecting = false;

let currentUser = null;
let currentSession = null;
let supabaseClient = null;
let authenticationReady = false;

let activeCameraStream = null;
let activeCameraOverlay = null;

/* =========================================================
   STATUS HELPERS
========================================================= */

function showAuthMessage(message, isError = false) {
  if (!authMessage) return;

  authMessage.textContent = message;

  authMessage.style.color = isError
    ? "#ff7777"
    : "#b7f34a";
}

function setProcessingStatus(message) {
  if (status) {
    status.textContent = message;
  }

  console.log("[Pothole Vision]", message);
}

function showMapMessage(message, level = "warning") {
  if (!hazardAlertOverlay) {
    console.log(message);
    return;
  }

  hazardAlertOverlay.hidden = false;

  hazardAlertOverlay.classList.remove(
    "warning",
    "danger"
  );

  hazardAlertOverlay.classList.add(level);

  if (hazardAlertTitle) {
    if (level === "danger") {
      hazardAlertTitle.textContent =
        "ROAD HAZARD WARNING";
    } else {
      hazardAlertTitle.textContent =
        "POTHOLE VISION";
    }
  }

  if (hazardAlertMessage) {
    hazardAlertMessage.textContent = message;
  }

  if (window.__pvResultTimer) {
    clearTimeout(window.__pvResultTimer);
  }

  window.__pvResultTimer = setTimeout(() => {
    if (hazardAlertOverlay) {
      hazardAlertOverlay.hidden = true;
    }
  }, 8000);
}

/* =========================================================
   AUTHENTICATION DISPLAY
========================================================= */

function updateAuthDisplay() {
  const isSignedIn = Boolean(currentUser);

  document.body.classList.toggle(
    "is-authenticated",
    isSignedIn
  );

  if (loginScreen) {
    loginScreen.hidden = isSignedIn;
  }

  if (appWorkspace) {
    appWorkspace.hidden = !isSignedIn;
  }

  if (authUserPanel) {
    authUserPanel.hidden = !isSignedIn;
  }

  if (authForm) {
    authForm.hidden = isSignedIn;
  }

  if (signedInEmail && currentUser) {
    signedInEmail.textContent =
      currentUser.email || "Signed in";
  }

  if (!isSignedIn) {
    stopRecordCamera();
  }
}

/* =========================================================
   SHARE AUTHENTICATION WITH MAP.JS
========================================================= */

function publishAuthenticationState(
  eventName = "AUTH_STATE_CHANGED"
) {
  window.dispatchEvent(
    new CustomEvent("potholevision:auth", {
      detail: {
        event: eventName,
        user: currentUser,
        session: currentSession
      }
    })
  );
}

/* =========================================================
   SUPABASE INITIALISATION
========================================================= */

function initialiseSupabase() {
  if (supabaseClient) return true;

  if (
    !window.supabase ||
    typeof window.supabase.createClient !== "function"
  ) {
    showAuthMessage(
      "Supabase could not load. Refresh the page.",
      true
    );

    return false;
  }

  try {
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

    window.PotholeVision =
      window.PotholeVision || {};

    window.PotholeVision.supabaseClient =
      supabaseClient;

    Object.defineProperties(
      window.PotholeVision,
      {
        currentUser: {
          configurable: true,
          get: () => currentUser
        },

        currentSession: {
          configurable: true,
          get: () => currentSession
        }
      }
    );

    supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        currentSession = session || null;
        currentUser = session?.user || null;

        authenticationReady = true;

        updateAuthDisplay();
        publishAuthenticationState(event);

        if (event === "INITIAL_SESSION") {
          showAuthMessage(
            currentUser
              ? "Welcome back."
              : "Sign in to access Pothole Vision."
          );
        }

        if (event === "SIGNED_IN") {
          showAuthMessage(
            "You are successfully signed in."
          );
        }

        if (event === "SIGNED_OUT") {
          showAuthMessage(
            "You have signed out."
          );
        }

        if (event === "TOKEN_REFRESHED") {
          console.log("Authentication token refreshed.");
        }
      }
    );

    publishAuthenticationState("CLIENT_READY");

    return true;

  } catch (error) {
    console.error(
      "Supabase initialisation error:",
      error
    );

    showAuthMessage(
      "Could not connect to Supabase. Refresh the page.",
      true
    );

    return false;
  }
}

/* =========================================================
   START AUTHENTICATION
========================================================= */

function initialiseAuthentication() {
  currentUser = null;
  currentSession = null;

  updateAuthDisplay();

  showAuthMessage(
    "Checking your saved sign-in..."
  );

  if (!initialiseSupabase()) {
    showAuthMessage(
      "Authentication is unavailable. Please refresh the page.",
      true
    );
  }
}

/* =========================================================
   CREATE ACCOUNT
========================================================= */

if (signUpButton) {
  signUpButton.addEventListener(
    "click",
    async () => {
      const email = authEmail?.value.trim();
      const password = authPassword?.value;

      if (!email || !password) {
        showAuthMessage(
          "Enter your email and password.",
          true
        );
        return;
      }

      if (password.length < 8) {
        showAuthMessage(
          "Password must contain at least 8 characters.",
          true
        );
        return;
      }

      if (!supabaseClient) {
        showAuthMessage(
          "Authentication is not ready. Refresh the page.",
          true
        );
        return;
      }

      signUpButton.disabled = true;

      showAuthMessage(
        "Creating your account..."
      );

      try {
        const { data, error } =
          await supabaseClient.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo:
                "https://brightonallan226-debug.github.io/stackblitz-starters-ln4rwj7x/"
            }
          });

        if (error) throw error;

        if (data.session) {
          currentSession = data.session;

          currentUser =
            data.user || data.session.user;

          updateAuthDisplay();

          publishAuthenticationState("SIGNED_IN");

          showAuthMessage(
            "Account created successfully."
          );

        } else {
          showAuthMessage(
            "Account created. If email confirmation is enabled, confirm your email before signing in."
          );
        }

      } catch (error) {
        console.error("Sign-up error:", error);

        showAuthMessage(
          error.message || "Could not create account.",
          true
        );

      } finally {
        signUpButton.disabled = false;
      }
    }
  );
}

/* =========================================================
   SIGN IN
========================================================= */

if (signInButton) {
  signInButton.addEventListener(
    "click",
    async () => {
      const email = authEmail?.value.trim();
      const password = authPassword?.value;

      if (!email || !password) {
        showAuthMessage(
          "Enter your email and password.",
          true
        );
        return;
      }

      if (!supabaseClient) {
        showAuthMessage(
          "Authentication is not ready. Refresh the page.",
          true
        );
        return;
      }

      signInButton.disabled = true;

      showAuthMessage("Signing in...");

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

        publishAuthenticationState("SIGNED_IN");

        showAuthMessage(
          "Welcome to Pothole Vision."
        );

      } catch (error) {
        console.error("Sign-in error:", error);

        showAuthMessage(
          error.message || "Could not sign in.",
          true
        );

      } finally {
        signInButton.disabled = false;
      }
    }
  );
}

/* =========================================================
   SIGN OUT
========================================================= */

if (signOutButton) {
  signOutButton.addEventListener(
    "click",
    async () => {
      if (!supabaseClient) return;

      signOutButton.disabled = true;

      try {
        const { error } =
          await supabaseClient.auth.signOut();

        if (error) throw error;

        currentSession = null;
        currentUser = null;

        updateAuthDisplay();

        publishAuthenticationState("SIGNED_OUT");

        showAuthMessage(
          "You have signed out."
        );

        if (authPassword) {
          authPassword.value = "";
        }

        const showPassword =
          document.getElementById("showPassword");

        if (showPassword) {
          showPassword.checked = false;

          showPassword.dispatchEvent(
            new Event("change")
          );
        }

      } catch (error) {
        console.error("Sign-out error:", error);

        showAuthMessage(
          error.message || "Could not sign out.",
          true
        );

      } finally {
        signOutButton.disabled = false;
      }
    }
  );
}

/* =========================================================
   CAMERA OVERLAY
========================================================= */

function createRecordCameraOverlay() {
  const overlay = document.createElement("section");

  overlay.id = "recordCameraOverlay";
  overlay.className = "record-camera-sheet";

  overlay.innerHTML = `
    <p class="record-camera-message">
      Point your phone towards the road and capture the pothole.
    </p>

    <video
      id="recordCameraVideo"
      autoplay
      muted
      playsinline
    ></video>

    <div class="record-camera-actions">
      <button
        type="button"
        id="recordCaptureButton"
        class="primary-button"
      >
        Capture Photo
      </button>

      <button
        type="button"
        id="recordCancelButton"
        class="secondary-button"
      >
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  activeCameraOverlay = overlay;

  const video =
    overlay.querySelector("#recordCameraVideo");

  const captureButton =
    overlay.querySelector("#recordCaptureButton");

  const cancelButton =
    overlay.querySelector("#recordCancelButton");

  captureButton.addEventListener(
    "click",
    captureRecordPhoto
  );

  cancelButton.addEventListener(
    "click",
    () => {
      stopRecordCamera();

      setRecordButtonState(false);

      showMapMessage(
        "Pothole recording cancelled."
      );
    }
  );

  return video;
}

/* =========================================================
   OPEN REAR CAMERA
========================================================= */

async function openRecordCamera() {
  if (!currentUser) {
    showMapMessage(
      "Please sign in before recording a pothole."
    );
    return;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia
  ) {
    showMapMessage(
      "Camera unavailable. Open Pothole Vision in Chrome over HTTPS."
    );

    setRecordButtonState(false);
    return;
  }

  if (!window.isSecureContext) {
    showMapMessage(
      "Camera access requires a secure HTTPS website."
    );

    setRecordButtonState(false);
    return;
  }

  try {
    setRecordButtonState(true, "Opening camera...");

    const video = createRecordCameraOverlay();

    activeCameraStream =
      await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });

    video.srcObject = activeCameraStream;

    await video.play();

    const captureButton =
      activeCameraOverlay.querySelector(
        "#recordCaptureButton"
      );

    if (captureButton) {
      captureButton.disabled = false;
    }

    setRecordButtonState(false);

  } catch (error) {
    console.error("Camera access error:", error);

    stopRecordCamera();

    setRecordButtonState(false);

    if (
      error.name === "NotAllowedError" ||
      error.name === "PermissionDeniedError"
    ) {
      showMapMessage(
        "Camera permission denied. Allow camera access in your browser settings."
      );

    } else if (error.name === "NotFoundError") {
      showMapMessage(
        "No camera was found on this device."
      );

    } else {
      showMapMessage(
        "Could not open camera: " + error.message
      );
    }
  }
}

/* =========================================================
   STOP CAMERA
========================================================= */

function stopRecordCamera() {
  if (activeCameraStream) {
    activeCameraStream
      .getTracks()
      .forEach(track => track.stop());

    activeCameraStream = null;
  }

  if (activeCameraOverlay) {
    activeCameraOverlay.remove();
    activeCameraOverlay = null;
  }
}

/* =========================================================
   CAPTURE PHOTO
========================================================= */

async function captureRecordPhoto() {
  if (!activeCameraOverlay) return;

  const video =
    activeCameraOverlay.querySelector(
      "#recordCameraVideo"
    );

  const captureButton =
    activeCameraOverlay.querySelector(
      "#recordCaptureButton"
    );

  if (
    !video ||
    !video.videoWidth ||
    !video.videoHeight
  ) {
    showMapMessage(
      "Camera is not ready yet. Please wait."
    );
    return;
  }

  if (captureButton) {
    captureButton.disabled = true;
    captureButton.textContent = "Capturing...";
  }

  const canvas = document.createElement("canvas");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    showMapMessage(
      "Could not prepare the camera image."
    );

    stopRecordCamera();
    setRecordButtonState(false);
    return;
  }

  context.drawImage(
    video,
    0,
    0,
    canvas.width,
    canvas.height
  );

  canvas.toBlob(
    async (blob) => {
      if (!blob) {
        showMapMessage(
          "Could not capture the photograph."
        );

        stopRecordCamera();
        setRecordButtonState(false);
        return;
      }

      const photoFile = new File(
        [blob],
        `pothole-inspection-${Date.now()}.jpg`,
        { type: "image/jpeg" }
      );

      stopRecordCamera();

      await processInspectionImage(photoFile);
    },
    "image/jpeg",
    0.92
  );
}

/* =========================================================
   RECORD BUTTON
========================================================= */

function setRecordButtonState(
  busy,
  label = "Record Pothole"
) {
  if (!recordPotholeButton) return;

  recordPotholeButton.disabled = busy;

  if (recordPotholeText) {
    recordPotholeText.textContent = busy
      ? label
      : "Record Pothole";
  }
}

if (recordPotholeButton) {
  recordPotholeButton.addEventListener(
    "click",
    async () => {
      if (isDetecting || activeCameraStream) return;

      await openRecordCamera();
    }
  );
}

/* =========================================================
   IMAGE LOADING
========================================================= */

function handleImageFile(file) {
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image.");
  }

  if (selectedImage) {
    URL.revokeObjectURL(selectedImage);
  }

  selectedImage = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    roadImage.onload = () => {
      if (imagePreview) {
        imagePreview.hidden = false;
      }

      resolve();
    };

    roadImage.onerror = () => {
      reject(
        new Error("Could not load the captured image.")
      );
    };

    roadImage.src = selectedImage;
  });
}

/* =========================================================
   GPS FOR INSPECTION
========================================================= */

function updateGPSDisplay(location) {
  if (!location) {
    if (locationStatus) {
      locationStatus.textContent =
        "GPS location unavailable.";
    }

    if (latitudeElement) {
      latitudeElement.textContent = "Not available";
    }

    if (longitudeElement) {
      longitudeElement.textContent = "Not available";
    }

    if (gpsAccuracyElement) {
      gpsAccuracyElement.textContent = "Not available";
    }

    return;
  }

  if (latitudeElement) {
    latitudeElement.textContent =
      location.latitude.toFixed(7);
  }

  if (longitudeElement) {
    longitudeElement.textContent =
      location.longitude.toFixed(7);
  }

  if (gpsAccuracyElement) {
    gpsAccuracyElement.textContent =
      `${Math.round(location.accuracy)} metres`;
  }

  if (locationStatus) {
    locationStatus.textContent =
      "GPS location successfully captured.";
  }
}

function getGPSLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      updateGPSDisplay(null);
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };

        updateGPSDisplay(location);
        resolve(location);
      },

      error => {
        console.warn(
          "Inspection GPS error:",
          error.message
        );

        updateGPSDisplay(null);
        resolve(null);
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });
}

/* =========================================================
   LOAD YOLO MODEL
========================================================= */

async function loadModel() {
  if (modelSession) {
    return modelSession;
  }

  if (!window.ort) {
    throw new Error(
      "ONNX Runtime could not be loaded."
    );
  }

  setProcessingStatus(
    "Loading AI model for the first time..."
  );

  window.ort.env.wasm.wasmPaths =
    "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

  modelSession =
    await window.ort.InferenceSession.create(
      MODEL_URL,
      {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all"
      }
    );

  console.log("YOLO26n model loaded successfully.");

  return modelSession;
}

/* =========================================================
   IMAGE PREPROCESSING
========================================================= */

function prepareImage(image) {
  const originalWidth = image.naturalWidth;
  const originalHeight = image.naturalHeight;

  const scale = Math.min(
    IMAGE_SIZE / originalWidth,
    IMAGE_SIZE / originalHeight
  );

  const resizedWidth =
    Math.round(originalWidth * scale);

  const resizedHeight =
    Math.round(originalHeight * scale);

  const padX = (IMAGE_SIZE - resizedWidth) / 2;
  const padY = (IMAGE_SIZE - resizedHeight) / 2;

  const canvas = document.createElement("canvas");

  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true
  });

  ctx.fillStyle = "rgb(114,114,114)";

  ctx.fillRect(
    0,
    0,
    IMAGE_SIZE,
    IMAGE_SIZE
  );

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

  const input = new Float32Array(
    3 * planeSize
  );

  for (let i = 0; i < planeSize; i++) {
    input[i] = pixels[i * 4] / 255;

    input[planeSize + i] =
      pixels[i * 4 + 1] / 255;

    input[2 * planeSize + i] =
      pixels[i * 4 + 2] / 255;
  }

  return {
    tensor: new window.ort.Tensor(
      "float32",
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

/* =========================================================
   NON-MAXIMUM SUPPRESSION
========================================================= */

function calculateIoU(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);

  const intersection =
    Math.max(0, x2 - x1) *
    Math.max(0, y2 - y1);

  const areaA =
    (a.x2 - a.x1) * (a.y2 - a.y1);

  const areaB =
    (b.x2 - b.x1) * (b.y2 - b.y1);

  return intersection /
    (areaA + areaB - intersection + 1e-7);
}

function nonMaximumSuppression(boxes) {
  boxes.sort((a, b) => b.score - a.score);

  const candidates =
    boxes.slice(0, MAX_CANDIDATES);

  const kept = [];

  const suppressed =
    new Uint8Array(candidates.length);

  for (let i = 0; i < candidates.length; i++) {
    if (suppressed[i]) continue;

    const best = candidates[i];

    kept.push(best);

    for (
      let j = i + 1;
      j < candidates.length;
      j++
    ) {
      if (suppressed[j]) continue;

      if (
        calculateIoU(best, candidates[j]) >=
        IOU_THRESHOLD
      ) {
        suppressed[j] = 1;
      }
    }
  }

  return kept;
}

/* =========================================================
   DECODE YOLO26n PREDICTIONS
========================================================= */

function decodePredictions(
  output,
  transform,
  confidenceThreshold
) {
  const data = output.data;
  const candidates = [];

  const numberOfPredictions = 8400;

  if (data.length < 5 * numberOfPredictions) {
    throw new Error(
      "Unexpected model output dimensions. Check the exported ONNX model."
    );
  }

  for (
    let i = 0;
    i < numberOfPredictions;
    i++
  ) {
    const score =
      data[4 * numberOfPredictions + i];

    if (
      !Number.isFinite(score) ||
      score < confidenceThreshold
    ) {
      continue;
    }

    const cx = data[i];

    const cy =
      data[numberOfPredictions + i];

    const width =
      data[2 * numberOfPredictions + i];

    const height =
      data[3 * numberOfPredictions + i];

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
      x1: Math.max(
        0,
        Math.min(transform.originalWidth, x1)
      ),

      y1: Math.max(
        0,
        Math.min(transform.originalHeight, y1)
      ),

      x2: Math.max(
        0,
        Math.min(transform.originalWidth, x2)
      ),

      y2: Math.max(
        0,
        Math.min(transform.originalHeight, y2)
      ),

      score
    };

    if (
      box.x2 > box.x1 &&
      box.y2 > box.y1
    ) {
      candidates.push(box);
    }
  }

  return nonMaximumSuppression(candidates);
}

/* =========================================================
   DRAW DETECTION OVERLAY
========================================================= */

function removeOverlay() {
  const existing =
    document.getElementById("detectionOverlay");

  if (existing) {
    existing.remove();
  }
}

function drawDetections(boxes, image) {
  removeOverlay();

  if (!imagePreview) return;

  const overlay = document.createElement("canvas");

  overlay.id = "detectionOverlay";

  overlay.width = image.naturalWidth;
  overlay.height = image.naturalHeight;

  const ctx = overlay.getContext("2d");

  ctx.lineWidth =
    Math.max(3, image.naturalWidth / 300);

  ctx.font =
    `bold ${Math.max(16, image.naturalWidth / 35)}px Arial`;

  boxes.forEach(box => {
    const width = box.x2 - box.x1;
    const height = box.y2 - box.y1;

    ctx.strokeStyle = "#b7f34a";

    ctx.strokeRect(
      box.x1,
      box.y1,
      width,
      height
    );

    const label =
      `Pothole ${Math.round(box.score * 100)}%`;

    const labelWidth =
      ctx.measureText(label).width + 14;

    const labelHeight =
      Math.max(24, image.naturalWidth / 30);

    const labelY =
      Math.max(labelHeight, box.y1);

    ctx.fillStyle = "#b7f34a";

    ctx.fillRect(
      box.x1,
      labelY - labelHeight,
      labelWidth,
      labelHeight
    );

    ctx.fillStyle = "#101827";

    ctx.fillText(
      label,
      box.x1 + 7,
      labelY - 6
    );
  });

  overlay.style.position = "absolute";
  overlay.style.inset = "0";
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.pointerEvents = "none";

  imagePreview.style.position = "relative";

  imagePreview.appendChild(overlay);
}

/* =========================================================
   INSPECTION REPORT
========================================================= */

function displayReport(
  detections,
  elapsedTime,
  confidenceThreshold,
  location,
  inspectedAt
) {
  if (results) {
    results.innerHTML = "";
  }

  let averageConfidence = 0;

  if (detections.length > 0) {
    averageConfidence =
      detections.reduce(
        (sum, box) => sum + box.score,
        0
      ) / detections.length;
  }

  const inspection = {
    inspectedAt,
    confidenceThreshold,
    location,
    detections,
    averageConfidence,
    elapsedTime
  };

  window.lastInspection = inspection;

  return inspection;
}

/* =========================================================
   SAVE INSPECTION TO SUPABASE
========================================================= */

async function saveInspectionToDatabase(inspection) {
  if (!supabaseClient) {
    throw new Error(
      "Database connection is unavailable."
    );
  }

  if (!currentUser) {
    throw new Error(
      "Please sign in before saving inspections."
    );
  }

  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  const session = sessionData.session;

  if (!session) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const detections =
    inspection.detections.map(box => ({
      confidence: box.score,
      box_x: box.x1,
      box_y: box.y1,
      box_width: box.x2 - box.x1,
      box_height: box.y2 - box.y1,
      severity: null
    }));

  const payload = {
    inspected_at: inspection.inspectedAt,

    latitude: inspection.location
      ? inspection.location.latitude
      : null,

    longitude: inspection.location
      ? inspection.location.longitude
      : null,

    gps_accuracy: inspection.location
      ? inspection.location.accuracy
      : null,

    total_potholes: detections.length,

    confidence_threshold:
      inspection.confidenceThreshold,

    average_confidence:
      inspection.averageConfidence,

    processing_time_ms:
      Math.round(inspection.elapsedTime * 1000),

    detections
  };

  const response = await fetch(
    SAVE_INSPECTION_URL,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization":
          `Bearer ${session.access_token}`
      },

      body: JSON.stringify(payload)
    }
  );

  const responseData =
    await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(
      "Database save response:",
      responseData
    );

    throw new Error(
      responseData.error ||
      responseData.message ||
      `Could not save inspection. Server returned ${response.status}.`
    );
  }

  return responseData;
}

/* =========================================================
   RUN DETECTION
========================================================= */

async function runDetection() {
  if (isDetecting) return;

  if (!currentUser) {
    throw new Error(
      "Please sign in before starting an inspection."
    );
  }

  if (
    !roadImage ||
    !roadImage.complete ||
    !roadImage.naturalWidth
  ) {
    throw new Error(
      "The captured road image is not ready."
    );
  }

  const confidenceThreshold =
    confidenceSelector
      ? Number(confidenceSelector.value)
      : DEFAULT_CONFIDENCE_THRESHOLD;

  if (
    !Number.isFinite(confidenceThreshold) ||
    confidenceThreshold <= 0 ||
    confidenceThreshold > 1
  ) {
    throw new Error(
      "Invalid confidence threshold."
    );
  }

  isDetecting = true;

  if (detectButton) {
    detectButton.disabled = true;
  }

  const startTime = performance.now();

  const inspectedAt =
    new Date().toISOString();

  try {
    setProcessingStatus(
      "Getting inspection GPS location..."
    );

    const gpsPromise = getGPSLocation();

    setProcessingStatus(
      "Loading AI model..."
    );

    await loadModel();

    setProcessingStatus(
      "Preparing road image..."
    );

    const prepared = prepareImage(roadImage);

    setProcessingStatus(
      "AI analysing road image..."
    );

    await new Promise(resolve =>
      setTimeout(resolve, 25)
    );

    const feeds = {
      [modelSession.inputNames[0]]:
        prepared.tensor
    };

    const predictions =
      await modelSession.run(feeds);

    const output =
      predictions[modelSession.outputNames[0]];

    const detections = decodePredictions(
      output,
      prepared,
      confidenceThreshold
    );

    const location = await gpsPromise;

    drawDetections(
      detections,
      roadImage
    );

    const elapsedTime =
      (performance.now() - startTime) / 1000;

    const inspection = displayReport(
      detections,
      elapsedTime,
      confidenceThreshold,
      location,
      inspectedAt
    );

    setProcessingStatus(
      `Detection complete: ${detections.length} pothole(s) detected.`
    );

    setRecordButtonState(
      true,
      "Saving inspection..."
    );

    try {
      await saveInspectionToDatabase(inspection);

      console.log(
        "Inspection successfully saved."
      );

      window.dispatchEvent(
        new CustomEvent(
          "potholevision:inspection-saved"
        )
      );

      const resultMessage =
        detections.length > 0
          ? `${detections.length} pothole(s) detected and saved successfully.`
          : "Inspection saved. No potholes detected above the selected threshold.";

      showMapMessage(resultMessage);

    } catch (saveError) {
      console.error(
        "Inspection saving error:",
        saveError
      );

      showMapMessage(
        "Detection finished, but saving failed: " +
        saveError.message,
        "danger"
      );

      throw saveError;
    }

    return inspection;

  } finally {
    isDetecting = false;

    if (detectButton) {
      detectButton.disabled = false;
    }
  }
}

/* =========================================================
   PROCESS CAPTURED IMAGE
========================================================= */

async function processInspectionImage(file) {
  if (isDetecting) return;

  try {
    setRecordButtonState(
      true,
      "Preparing image..."
    );

    setProcessingStatus(
      "Preparing captured photograph..."
    );

    await handleImageFile(file);

    setRecordButtonState(
      true,
      "Analysing road..."
    );

    await runDetection();

  } catch (error) {
    console.error(
      "Inspection processing error:",
      error
    );

    showMapMessage(
      error.message || "Inspection failed.",
      "danger"
    );

  } finally {
    setRecordButtonState(false);
  }
}

/* =========================================================
   CLEAN UP
========================================================= */

window.addEventListener(
  "pagehide",
  () => {
    stopRecordCamera();

    if (selectedImage) {
      URL.revokeObjectURL(selectedImage);
      selectedImage = null;
    }
  }
);

/* =========================================================
   START APPLICATION
========================================================= */

initialiseAuthentication();

console.log(
  "Pothole Vision map-first application initialised."
);

/* =========================================================
   PASSWORD RECOVERY
========================================================= */

(() => {
  "use strict";

  const $ = id =>
    document.getElementById(id);

  const recoveryScreen =
    $("recoveryScreen");

  const newPasswordScreen =
    $("newPasswordScreen");

  const forgotButton =
    $("forgotPasswordButton");

  const recoveryForm =
    $("recoveryForm");

  const recoveryEmail =
    $("recoveryEmail");

  const recoveryMessage =
    $("recoveryMessage");

  const backButton =
    $("backToLoginButton");

  const newPasswordForm =
    $("newPasswordForm");

  const newPassword =
    $("newPassword");

  const confirmPassword =
    $("confirmNewPassword");

  const newPasswordMessage =
    $("newPasswordMessage");

  const sendButton =
    $("sendResetEmailButton");

  const saveButton =
    $("saveNewPasswordButton");

  function getClient() {
    if (supabaseClient) {
      return supabaseClient;
    }

    return window.PotholeVision?.supabaseClient || null;
  }

  function showOnly(screen) {
    if (loginScreen) {
      loginScreen.hidden = screen !== "login";
    }

    if (recoveryScreen) {
      recoveryScreen.hidden =
        screen !== "recovery";
    }

    if (newPasswordScreen) {
      newPasswordScreen.hidden =
        screen !== "new-password";
    }

    if (appWorkspace) {
      appWorkspace.hidden = screen !== "app";
    }

    document.body.classList.toggle(
      "is-authenticated",
      screen === "app" && Boolean(currentUser)
    );
  }

  function message(
    element,
    value,
    isError = false
  ) {
    if (!element) return;

    element.textContent = value;

    element.style.color = isError
      ? "#ff7777"
      : "#b7f34a";
  }

  if (forgotButton) {
    forgotButton.addEventListener(
      "click",
      () => {
        if (recoveryEmail && authEmail) {
          recoveryEmail.value =
            authEmail.value.trim();
        }

        message(recoveryMessage, "");

        showOnly("recovery");
      }
    );
  }

  if (backButton) {
    backButton.addEventListener(
      "click",
      () => {
        message(recoveryMessage, "");

        showOnly("login");
      }
    );
  }

  if (recoveryForm) {
    recoveryForm.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const client = getClient();

        const email =
          recoveryEmail?.value.trim();

        if (!client) {
          message(
            recoveryMessage,
            "Supabase could not initialise. Refresh the page and try again.",
            true
          );

          return;
        }

        if (!email) {
          message(
            recoveryMessage,
            "Enter your registered email address.",
            true
          );

          return;
        }

        sendButton.disabled = true;

        message(
          recoveryMessage,
          "Sending password reset email..."
        );

        try {
          const redirectTo =
            window.location.origin +
            window.location.pathname;

          const { error } =
            await client.auth.resetPasswordForEmail(
              email,
              { redirectTo }
            );

          if (error) throw error;

          message(
            recoveryMessage,
            "If an account exists for this email, a reset link has been sent. Check your inbox and spam folder."
          );

        } catch (error) {
          console.error(
            "Password recovery request failed:",
            error
          );

          message(
            recoveryMessage,
            error.message ||
              "Could not send the reset email.",
            true
          );

        } finally {
          sendButton.disabled = false;
        }
      }
    );
  }

  function onAuthEvent(event) {
    if (event === "PASSWORD_RECOVERY") {
      message(
        newPasswordMessage,
        "Choose a new password for your account."
      );

      showOnly("new-password");
    }
  }

  function attachRecoveryListener() {
    const client = getClient();

    if (
      !client ||
      window.__pvRecoveryListenerAttached
    ) {
      return false;
    }

    window.__pvRecoveryListenerAttached = true;

    client.auth.onAuthStateChange(
      event => onAuthEvent(event)
    );

    return true;
  }

  if (newPasswordForm) {
    newPasswordForm.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const client = getClient();

        const password =
          newPassword?.value || "";

        const confirmation =
          confirmPassword?.value || "";

        if (!client) {
          message(
            newPasswordMessage,
            "Supabase is unavailable. Refresh the page and reopen the recovery email link.",
            true
          );

          return;
        }

        if (password.length < 8) {
          message(
            newPasswordMessage,
            "Use at least 8 characters for your new password.",
            true
          );

          return;
        }

        if (password !== confirmation) {
          message(
            newPasswordMessage,
            "The passwords do not match.",
            true
          );

          return;
        }

        saveButton.disabled = true;

        message(
          newPasswordMessage,
          "Updating your password..."
        );

        try {
          const { error } =
            await client.auth.updateUser({
              password
            });

          if (error) throw error;

          newPassword.value = "";
          confirmPassword.value = "";

          message(
            newPasswordMessage,
            "Password updated successfully. You can now sign in with your new password."
          );

          setTimeout(() => {
            if (currentUser) {
              updateAuthDisplay();
              showOnly("app");
              publishAuthenticationState(
                "SIGNED_IN"
              );
            } else {
              showOnly("login");
            }
          }, 1800);

        } catch (error) {
          console.error(
            "Password update failed:",
            error
          );

          message(
            newPasswordMessage,
            error.message ||
              "Could not update your password.",
            true
          );

        } finally {
          saveButton.disabled = false;
        }
      }
    );
  }

  if (!attachRecoveryListener()) {
    let attempts = 0;

    const timer = setInterval(() => {
      attempts += 1;

      if (
        attachRecoveryListener() ||
        attempts >= 20
      ) {
        clearInterval(timer);
      }
    }, 250);
  }

  const hashParams =
    new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    );

  const queryParams =
    new URLSearchParams(window.location.search);

  if (
    hashParams.get("type") === "recovery" ||
    queryParams.get("type") === "recovery"
  ) {
    showOnly("new-password");
  }

})();
