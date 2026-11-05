
(() => {
    "use strict";

    // =========================================================
    // POTHOLE VISION - MAP, GPS AND PROXIMITY ALERTS
    // =========================================================

    const app = window.PotholeVision;
    const supabaseClient = app?.supabaseClient;

    // Alert distances in metres.
    const WARNING_DISTANCE = 300;
    const DANGER_DISTANCE = 100;
    const ALERT_RESET_DISTANCE = 450;
    const MAX_ALERT_GPS_ACCURACY = 100;

    // =========================================================
    // HTML ELEMENTS
    // =========================================================

    const inspectionTab = document.getElementById("inspectionTab");
    const mapTab = document.getElementById("mapTab");

    const inspectionView = document.getElementById("inspectionView");
    const mapView = document.getElementById("mapView");

    const mapStatus = document.getElementById("mapStatus");
    const refreshMapButton = document.getElementById("refreshMapButton");

    const inspectionCountElement =
        document.getElementById("mapInspectionCount");

    const potholeCountElement =
        document.getElementById("mapPotholeCount");

    const locationCountElement =
        document.getElementById("mapLocationCount");

    const recordsListElement =
        document.getElementById("mapRecordsList");

    const mapElement = document.getElementById("inspectionMap");

    // =========================================================
    // APPLICATION VARIABLES
    // =========================================================

    let map = null;
    let markerLayer = null;
    let mapInitialised = false;

    let currentUser = app?.currentUser || null;

    let loadingRecords = false;
    let pendingRecordLoad = false;

    let inspectionRecords = [];

    // GPS
    let gpsWatchId = null;
    let vehicleMarker = null;
    let accuracyCircle = null;

    let previousPosition = null;
    let currentHeading = null;

    // Alerts
    let soundEnabled = false;
    let notificationPermission = "default";
    let audioContext = null;

    let alertPanel = null;
    let alertStatus = null;
    let alertEnableButton = null;

    const alertStates = new Map();

    // =========================================================
    // STATUS HELPERS
    // =========================================================

    function setMapStatus(message, isError = false) {
        if (!mapStatus) return;

        mapStatus.textContent = message;
        mapStatus.style.color = isError ? "#ff6b6b" : "#a3e635";
    }

    function setTrackingStatus(message, isError = false) {
        const status = document.getElementById("trackingStatus");

        if (!status) return;

        status.textContent = message;
        status.style.color = isError ? "#ff6b6b" : "#a3e635";
    }

    // =========================================================
    // MAP DISPLAY FIX
    // =========================================================

    function prepareMapContainer() {
        if (!mapElement) {
            setMapStatus("Map container was not found.", true);
            return false;
        }

        mapElement.style.setProperty("display", "block", "important");
        mapElement.style.setProperty("position", "relative", "important");
        mapElement.style.setProperty("width", "100%", "important");
        mapElement.style.setProperty("height", "480px", "important");
        mapElement.style.setProperty("min-height", "380px", "important");
        mapElement.style.setProperty("visibility", "visible", "important");
        mapElement.style.setProperty("opacity", "1", "important");
        mapElement.style.setProperty("overflow", "hidden", "important");
        mapElement.style.setProperty("flex", "none", "important");

        return true;
    }

    function refreshMapSize() {
        if (!map) return;

        prepareMapContainer();

        requestAnimationFrame(() => {
            map.invalidateSize({ pan: false });

            setTimeout(() => {
                if (map) {
                    map.invalidateSize({ pan: false });
                }
            }, 300);
        });
    }

    // =========================================================
    // AUTHENTICATION
    // =========================================================

    function handleAuthenticationChange(event) {
        const detail = event?.detail || {};

        currentUser = detail.user || app?.currentUser || null;

        if (currentUser) {
            setMapStatus("Signed in. Your inspection records are available.");

            if (mapTab?.classList.contains("active")) {
                loadInspectionRecords();
            }
        } else {
            inspectionRecords = [];
            resetMapSummary();

            if (detail.event === "CLIENT_READY") {
                setMapStatus("Checking your saved sign-in...");
            } else {
                setMapStatus(
                    "Please sign in to view your inspection records."
                );
            }
        }
    }

    window.addEventListener(
        "potholevision:auth",
        handleAuthenticationChange
    );

    if (!supabaseClient) {
        setMapStatus(
            "Shared Supabase connection was not found. Check script.js loading order.",
            true
        );
    }

    // =========================================================
    // TRACKING CONTROLS
    // =========================================================

    function createTrackingControls() {
        const toolbar = document.querySelector(".map-toolbar");

        if (!toolbar ||
            document.getElementById("liveTrackingControls")) {
            return;
        }

        const controls = document.createElement("div");
        controls.id = "liveTrackingControls";

        controls.style.cssText =
            "display:flex;flex-wrap:wrap;gap:8px;width:100%;margin-top:10px;";

        const startButton = document.createElement("button");
        startButton.type = "button";
        startButton.id = "startTrackingButton";
        startButton.textContent = "Start Live Tracking";
        startButton.className = "primary-button";
        startButton.style.width = "auto";
        startButton.style.margin = "0";

        const stopButton = document.createElement("button");
        stopButton.type = "button";
        stopButton.id = "stopTrackingButton";
        stopButton.textContent = "Stop Tracking";
        stopButton.className = "secondary-button";
        stopButton.style.width = "auto";
        stopButton.style.margin = "0";
        stopButton.disabled = true;

        const trackingStatus = document.createElement("p");
        trackingStatus.id = "trackingStatus";
        trackingStatus.textContent = "Live GPS tracking is off.";
        trackingStatus.style.cssText =
            "width:100%;margin:5px 0;color:#94a3b8;font-size:13px;";

        controls.appendChild(startButton);
        controls.appendChild(stopButton);
        controls.appendChild(trackingStatus);

        toolbar.appendChild(controls);

        startButton.addEventListener("click", startLiveTracking);
        stopButton.addEventListener("click", stopLiveTracking);
    }

    function updateTrackingButtons(isTracking) {
        const startButton =
            document.getElementById("startTrackingButton");

        const stopButton =
            document.getElementById("stopTrackingButton");

        if (startButton) startButton.disabled = isTracking;
        if (stopButton) stopButton.disabled = !isTracking;
    }

    // =========================================================
    // TAB NAVIGATION
    // =========================================================

    function showInspectionView() {
        if (!inspectionView || !mapView) return;

        inspectionView.hidden = false;
        inspectionView.style.display = "block";

        mapView.hidden = true;
        mapView.style.display = "none";

        inspectionTab?.classList.add("active");
        mapTab?.classList.remove("active");

        inspectionTab?.setAttribute("aria-selected", "true");
        mapTab?.setAttribute("aria-selected", "false");
    }

    function showMapView() {
        if (!inspectionView || !mapView) return;

        inspectionView.hidden = true;
        inspectionView.style.display = "none";

        mapView.hidden = false;
        mapView.style.display = "block";

        mapTab?.classList.add("active");
        inspectionTab?.classList.remove("active");

        mapTab?.setAttribute("aria-selected", "true");
        inspectionTab?.setAttribute("aria-selected", "false");

        prepareMapContainer();

        setTimeout(() => {
            prepareMapContainer();

            initialiseMap();

            refreshMapSize();

            currentUser = app?.currentUser || currentUser;

            if (currentUser) {
                loadInspectionRecords();
            } else {
                setMapStatus(
                    "Please sign in to view your inspection records."
                );
            }
        }, 250);
    }

    inspectionTab?.addEventListener("click", showInspectionView);
    mapTab?.addEventListener("click", showMapView);

    // =========================================================
    // SAFE HTML
    // =========================================================

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => {
            const entities = {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[character];
        });
    }

    // =========================================================
    // INITIALISE OPENSTREETMAP
    // =========================================================

    function initialiseMap() {
        if (mapInitialised && map) {
            refreshMapSize();
            return;
        }

        if (!prepareMapContainer()) return;

        if (typeof L === "undefined") {
            setMapStatus(
                "Leaflet map library could not load.",
                true
            );
            return;
        }

        try {
            map = L.map(mapElement, {
                zoomControl: true,
                scrollWheelZoom: true
            }).setView([-6.369, 34.888], 6);

            L.tileLayer(
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
                }
            ).addTo(map);

            markerLayer = L.featureGroup().addTo(map);

            mapInitialised = true;

            refreshMapSize();

            setTimeout(refreshMapSize, 700);

            console.log("Pothole Vision map successfully initialised.");

        } catch (error) {
            console.error("Map initialisation error:", error);

            map = null;
            mapInitialised = false;

            setMapStatus(
                "Map initialisation failed: " + error.message,
                true
            );
        }
    }

    // =========================================================
    // DISTANCE CALCULATION
    // =========================================================

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const earthRadius = 6371000;

        const toRadians = value => value * Math.PI / 180;

        const dLat = toRadians(lat2 - lat1);
        const dLon = toRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRadians(lat1)) *
            Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) ** 2;

        return earthRadius * 2 *
            Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // =========================================================
    // ALERT PANEL
    // =========================================================

    function createAlertPanel() {
        const toolbar = document.querySelector(".map-toolbar");

        if (!toolbar || document.getElementById("proximityAlertPanel")) {
            alertPanel = document.getElementById("proximityAlertPanel");
            return;
        }

        alertPanel = document.createElement("div");
        alertPanel.id = "proximityAlertPanel";

        alertPanel.style.cssText = `
            width:100%;
            margin-top:14px;
            padding:16px;
            background:#101d30;
            border:1px solid #334155;
            border-radius:14px;
            box-sizing:border-box;
        `;

        const title = document.createElement("h3");
        title.textContent = "ROAD HAZARD PROXIMITY ALERTS";
        title.style.cssText =
            "margin:0 0 12px;color:#b7f34a;font-size:13px;letter-spacing:1px;";

        const description = document.createElement("p");
        description.textContent =
            "Start live tracking to receive nearby inspection alerts.";
        description.style.cssText =
            "margin:0 0 8px;color:#f8fafc;font-size:13px;";

        alertStatus = document.createElement("p");
        alertStatus.id = "proximityAlertStatus";
        alertStatus.textContent = "No nearby reported location.";
        alertStatus.style.cssText =
            "margin:0 0 12px;color:#94a3b8;font-size:12px;";

        alertEnableButton = document.createElement("button");
        alertEnableButton.type = "button";
        alertEnableButton.id = "enableAlertButton";
        alertEnableButton.textContent =
            "Enable Sound & Notifications";
        alertEnableButton.className = "secondary-button";
        alertEnableButton.style.width = "auto";
        alertEnableButton.style.margin = "0";

        const disclaimer = document.createElement("p");
        disclaimer.textContent =
            "Alerts use approximate saved inspection locations, not exact pothole coordinates.";
        disclaimer.style.cssText =
            "margin:12px 0 0;color:#94a3b8;font-size:10px;line-height:1.5;";

        alertPanel.appendChild(title);
        alertPanel.appendChild(description);
        alertPanel.appendChild(alertStatus);
        alertPanel.appendChild(alertEnableButton);
        alertPanel.appendChild(disclaimer);

        toolbar.appendChild(alertPanel);

        alertEnableButton.addEventListener(
            "click",
            enableAlertFeatures
        );
    }

    // =========================================================
    // ENABLE SOUND AND NOTIFICATIONS
    // =========================================================

    async function enableAlertFeatures() {
        try {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (AudioContextClass) {
                if (!audioContext) {
                    audioContext = new AudioContextClass();
                }

                if (audioContext.state === "suspended") {
                    await audioContext.resume();
                }

                soundEnabled = true;
            }

            if ("Notification" in window) {
                notificationPermission =
                    await Notification.requestPermission();
            }

            if (alertEnableButton) {
                alertEnableButton.textContent =
                    "Sound & Notifications Enabled";
                alertEnableButton.disabled = true;
            }

            updateAlertStatus(
                "Alert features enabled. Start live tracking to receive alerts."
            );

            playAlertSound("warning");

        } catch (error) {
            console.error("Alert setup error:", error);

            updateAlertStatus(
                "Some alert features could not be enabled. Check browser permissions."
            );
        }
    }

    // =========================================================
    // ALERT STATUS
    // =========================================================

    function updateAlertStatus(message, type = "normal") {
        if (!alertStatus) return;

        alertStatus.textContent = message;

        if (type === "danger") {
            alertStatus.style.color = "#ff6b6b";
        } else if (type === "warning") {
            alertStatus.style.color = "#fbbf24";
        } else {
            alertStatus.style.color = "#94a3b8";
        }
    }

    // =========================================================
    // ALERT SOUND
    // =========================================================

    function playAlertSound(level) {
        if (!soundEnabled || !audioContext) return;

        if (audioContext.state !== "running") return;

        const frequencies = level === "danger"
            ? [880, 660, 880]
            : [660, 660];

        frequencies.forEach((frequency, index) => {
            const oscillator = audioContext.createOscillator();
            const gain = audioContext.createGain();

            oscillator.type = "sine";
            oscillator.frequency.value = frequency;

            const startTime =
                audioContext.currentTime + index * 0.22;

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(
                0.18,
                startTime + 0.03
            );
            gain.gain.exponentialRampToValueAtTime(
                0.0001,
                startTime + 0.18
            );

            oscillator.connect(gain);
            gain.connect(audioContext.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + 0.2);
        });
    }

    // =========================================================
    // BROWSER NOTIFICATION
    // =========================================================

    function sendBrowserNotification(title, message) {
        if (
            !("Notification" in window) ||
            notificationPermission !== "granted"
        ) {
            return;
        }

        try {
            new Notification(title, {
                body: message,
                tag: "pothole-vision-alert"
            });
        } catch (error) {
            console.warn("Browser notification unavailable:", error);
        }
    }

    // =========================================================
    // VIBRATION
    // =========================================================

    function vibrateDevice(level) {
        if (!navigator.vibrate) return;

        if (level === "danger") {
            navigator.vibrate([250, 100, 250, 100, 350]);
        } else {
            navigator.vibrate([180, 100, 180]);
        }
    }

    // =========================================================
    // TRIGGER ALERT
    // =========================================================

    function triggerProximityAlert(record, distance, level) {
        const roundedDistance = Math.round(distance);

        const message = level === "danger"
            ? `Danger alert: reported inspection location approximately ${roundedDistance} metres away.`
            : `Warning: reported inspection location approximately ${roundedDistance} metres away.`;

        updateAlertStatus(message, level);

        playAlertSound(level);
        vibrateDevice(level);

        sendBrowserNotification(
            level === "danger"
                ? "POTHOLE VISION - DANGER"
                : "POTHOLE VISION - WARNING",
            message
        );

        console.log("Proximity alert:", {
            recordId: record.id,
            distance: roundedDistance,
            level
        });
    }

    // =========================================================
    // CHECK PROXIMITY TO SAVED INSPECTIONS
    // =========================================================

    function checkProximityAlerts(latitude, longitude, accuracy) {
        if (!inspectionRecords.length) {
            updateAlertStatus(
                "No reported inspection locations available."
            );
            return;
        }

        if (accuracy > MAX_ALERT_GPS_ACCURACY) {
            updateAlertStatus(
                `GPS accuracy is too low (±${Math.round(accuracy)}m). Waiting for a better GPS reading.`
            );
            return;
        }

        const hazards = inspectionRecords.filter(record =>
            Number(record.total_potholes) > 0 &&
            Number.isFinite(Number(record.latitude)) &&
            Number.isFinite(Number(record.longitude))
        );

        if (!hazards.length) {
            updateAlertStatus(
                "No reported pothole inspection locations available."
            );
            return;
        }

        let nearestRecord = null;
        let nearestDistance = Infinity;

        hazards.forEach(record => {
            const distance = calculateDistance(
                latitude,
                longitude,
                Number(record.latitude),
                Number(record.longitude)
            );

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestRecord = record;
            }

            const recordKey = String(record.id);
            const previousAlert = alertStates.get(recordKey);

            // Reset after moving sufficiently far away.
            if (
                previousAlert &&
                distance > ALERT_RESET_DISTANCE
            ) {
                alertStates.delete(recordKey);
            }
        });

        if (!nearestRecord) return;

        if (nearestDistance > WARNING_DISTANCE) {
            updateAlertStatus(
                `Nearest reported inspection location: ${Math.round(nearestDistance)}m away.`
            );
            return;
        }

        const recordKey = String(nearestRecord.id);
        const previousAlert = alertStates.get(recordKey);

        if (nearestDistance <= DANGER_DISTANCE) {
            if (previousAlert !== "danger") {
                triggerProximityAlert(
                    nearestRecord,
                    nearestDistance,
                    "danger"
                );

                alertStates.set(recordKey, "danger");
            } else {
                updateAlertStatus(
                    `Danger zone: reported inspection location approximately ${Math.round(nearestDistance)}m away.`,
                    "danger"
                );
            }

        } else {
            if (!previousAlert) {
                triggerProximityAlert(
                    nearestRecord,
                    nearestDistance,
                    "warning"
                );

                alertStates.set(recordKey, "warning");
            } else if (previousAlert !== "danger") {
                updateAlertStatus(
                    `Warning zone: reported inspection location approximately ${Math.round(nearestDistance)}m away.`,
                    "warning"
                );
            }
        }
    }

    // =========================================================
    // VEHICLE DIRECTION
    // =========================================================

    function calculateBearing(start, end) {
        const toRadians = degrees => degrees * Math.PI / 180;
        const toDegrees = radians => radians * 180 / Math.PI;

        const lat1 = toRadians(start.latitude);
        const lat2 = toRadians(end.latitude);

        const deltaLongitude =
            toRadians(end.longitude - start.longitude);

        const y =
            Math.sin(deltaLongitude) * Math.cos(lat2);

        const x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) *
            Math.cos(deltaLongitude);

        return (
            toDegrees(Math.atan2(y, x)) + 360
        ) % 360;
    }

    // =========================================================
    // VEHICLE ICON
    // =========================================================

    function createVehicleIcon(heading) {
        const rotation = Number.isFinite(heading) ? heading : 0;

        return L.divIcon({
            className: "vehicle-marker-container",
            html: `
                <div style="
                    width:42px;
                    height:42px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    filter:drop-shadow(0 2px 5px #000);
                ">
                    <svg
                        width="38"
                        height="38"
                        viewBox="0 0 40 40"
                        style="transform:rotate(${rotation}deg);"
                    >
                        <circle
                            cx="20"
                            cy="20"
                            r="17"
                            fill="#2563eb"
                            stroke="white"
                            stroke-width="2"
                        />
                        <path
                            d="M20 5 L29 29 L20 24 L11 29 Z"
                            fill="white"
                        />
                    </svg>
                </div>
            `,
            iconSize: [42, 42],
            iconAnchor: [21, 21]
        });
    }

    // =========================================================
    // START GPS TRACKING
    // =========================================================

    function startLiveTracking() {
        if (!navigator.geolocation) {
            setTrackingStatus(
                "Your browser does not support GPS location.",
                true
            );
            return;
        }

        if (!window.isSecureContext) {
            setTrackingStatus(
                "GPS requires a secure HTTPS website.",
                true
            );
            return;
        }

        if (!mapInitialised) {
            initialiseMap();
        }

        if (!map) {
            setTrackingStatus(
                "The map is not ready. Please try again.",
                true
            );
            return;
        }

        if (gpsWatchId !== null) return;

        refreshMapSize();

        setTrackingStatus(
            "Requesting your phone's GPS location..."
        );

        updateTrackingButtons(true);

        gpsWatchId = navigator.geolocation.watchPosition(
            handleGPSPosition,
            handleGPSError,
            {
                enableHighAccuracy: true,
                maximumAge: 1000,
                timeout: 20000
            }
        );
    }

    // =========================================================
    // HANDLE GPS POSITION
    // =========================================================

    function handleGPSPosition(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        const newPosition = {
            latitude,
            longitude
        };

        let heading = position.coords.heading;

        if (
            heading === null ||
            !Number.isFinite(heading)
        ) {
            if (previousPosition) {
                const distanceMoved = map.distance(
                    [
                        previousPosition.latitude,
                        previousPosition.longitude
                    ],
                    [latitude, longitude]
                );

                if (distanceMoved >= 3) {
                    heading = calculateBearing(
                        previousPosition,
                        newPosition
                    );
                } else {
                    heading = currentHeading;
                }
            }
        }

        if (Number.isFinite(heading)) {
            currentHeading = heading;
        }

        previousPosition = newPosition;

        const coordinates = [latitude, longitude];

        if (!vehicleMarker) {
            vehicleMarker = L.marker(
                coordinates,
                {
                    icon: createVehicleIcon(currentHeading),
                    zIndexOffset: 1000
                }
            ).addTo(map);

            vehicleMarker.bindPopup(
                "<strong>Your current vehicle location</strong>"
            );

            map.setView(coordinates, 17);

        } else {
            vehicleMarker.setLatLng(coordinates);

            vehicleMarker.setIcon(
                createVehicleIcon(currentHeading)
            );

            map.panTo(coordinates, {
                animate: true,
                duration: 0.5
            });
        }

        if (!accuracyCircle) {
            accuracyCircle = L.circle(
                coordinates,
                {
                    radius: accuracy,
                    color: "#60a5fa",
                    fillColor: "#3b82f6",
                    fillOpacity: 0.12,
                    weight: 1
                }
            ).addTo(map);

        } else {
            accuracyCircle.setLatLng(coordinates);
            accuracyCircle.setRadius(accuracy);
        }

        const headingText = Number.isFinite(currentHeading)
            ? `${Math.round(currentHeading)}°`
            : "Not available yet";

        setTrackingStatus(
            `Live GPS active | Accuracy: ±${Math.round(accuracy)} m | Direction: ${headingText}`
        );

        // Check nearby inspection locations.
        checkProximityAlerts(
            latitude,
            longitude,
            accuracy
        );
    }

    // =========================================================
    // GPS ERRORS
    // =========================================================

    function handleGPSError(error) {
        let message = "Unable to obtain your GPS location.";

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message =
                    "Location permission denied. Allow location access in browser settings.";
                break;

            case error.POSITION_UNAVAILABLE:
                message =
                    "GPS position is currently unavailable. Check your phone's location settings.";
                break;

            case error.TIMEOUT:
                message =
                    "GPS request timed out. Please try again.";
                break;
        }

        setTrackingStatus(message, true);
        updateTrackingButtons(false);

        if (
            error.code === error.PERMISSION_DENIED ||
            error.code === error.POSITION_UNAVAILABLE
        ) {
            stopLiveTracking();
        }
    }

    // =========================================================
    // STOP GPS TRACKING
    // =========================================================

    function stopLiveTracking() {
        if (gpsWatchId !== null) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }

        if (vehicleMarker && map) {
            map.removeLayer(vehicleMarker);
            vehicleMarker = null;
        }

        if (accuracyCircle && map) {
            map.removeLayer(accuracyCircle);
            accuracyCircle = null;
        }

        previousPosition = null;
        currentHeading = null;

        updateTrackingButtons(false);

        setTrackingStatus("Live GPS tracking is off.");

        updateAlertStatus(
            "Live tracking stopped. No proximity alerts are active."
        );
    }

    // =========================================================
    // DATE FORMATTING
    // =========================================================

    function formatDate(dateValue) {
        if (!dateValue) return "Date unavailable";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString();
    }

    // =========================================================
    // RESET MAP SUMMARY
    // =========================================================

    function resetMapSummary() {
        if (inspectionCountElement) {
            inspectionCountElement.textContent = "0";
        }

        if (potholeCountElement) {
            potholeCountElement.textContent = "0";
        }

        if (locationCountElement) {
            locationCountElement.textContent = "0";
        }

        if (recordsListElement) {
            recordsListElement.innerHTML =
                '<p class="empty-message">No inspection records available.</p>';
        }

        if (markerLayer) {
            markerLayer.clearLayers();
        }

        inspectionRecords = [];
        alertStates.clear();
    }

    // =========================================================
    // CREATE INSPECTION MARKER
    // =========================================================

    function createInspectionMarker(record) {
        const latitude = Number(record.latitude);
        const longitude = Number(record.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        ) {
            return null;
        }

        const potholeCount =
            Number(record.total_potholes) || 0;

        const marker = L.circleMarker(
            [latitude, longitude],
            {
                radius: 9,
                color: "#a3e635",
                weight: 2,
                fillColor: "#84cc16",
                fillOpacity: 0.85
            }
        );

        const averageConfidence =
            record.average_confidence != null
                ? (
                    Number(record.average_confidence) * 100
                ).toFixed(1) + "%"
                : "N/A";

        const popupContent = `
            <div class="map-popup">
                <strong>Inspection Record</strong>
                <p><b>Potholes detected:</b> ${potholeCount}</p>
                <p><b>Date:</b> ${escapeHTML(formatDate(record.inspected_at))}</p>
                <p><b>Confidence threshold:</b> ${escapeHTML(record.confidence_threshold ?? "N/A")}%</p>
                <p><b>Average confidence:</b> ${escapeHTML(averageConfidence)}</p>
                <p><b>Latitude:</b> ${latitude.toFixed(6)}</p>
                <p><b>Longitude:</b> ${longitude.toFixed(6)}</p>
            </div>
        `;

        marker.bindPopup(popupContent);
        marker.recordId = record.id;

        return marker;
    }

    // =========================================================
    // DISPLAY INSPECTION RECORDS
    // =========================================================

    function renderRecords(records) {
        if (!recordsListElement) return;

        if (!records.length) {
            recordsListElement.innerHTML = `
                <p class="empty-message">
                    No inspection records with GPS coordinates were found.
                </p>
            `;
            return;
        }

        recordsListElement.innerHTML = records.map(record => {
            const latitude = Number(record.latitude);
            const longitude = Number(record.longitude);

            return `
                <div class="map-record-card"
                     data-record-id="${escapeHTML(record.id)}">

                    <div class="record-card-header">
                        <strong>Inspection</strong>
                        <span class="record-count">
                            ${Number(record.total_potholes) || 0} potholes
                        </span>
                    </div>

                    <p>${escapeHTML(formatDate(record.inspected_at))}</p>

                    <p class="record-coordinates">
                        ${latitude.toFixed(5)}, ${longitude.toFixed(5)}
                    </p>

                    <button
                        type="button"
                        class="view-record-button"
                        data-record-id="${escapeHTML(record.id)}">
                        View on Map
                    </button>
                </div>
            `;
        }).join("");

        recordsListElement
            .querySelectorAll(".view-record-button")
            .forEach(button => {
                button.addEventListener("click", () => {
                    const record = records.find(
                        item =>
                            String(item.id) === button.dataset.recordId
                    );

                    if (record) {
                        focusRecord(record);
                    }
                });
            });
    }

    // =========================================================
    // FOCUS ON AN INSPECTION
    // =========================================================

    function focusRecord(record) {
        if (!mapInitialised) {
            initialiseMap();
        }

        if (!map || !markerLayer) return;

        const latitude = Number(record.latitude);
        const longitude = Number(record.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        refreshMapSize();

        map.setView([latitude, longitude], 16);

        markerLayer.eachLayer(marker => {
            if (String(marker.recordId) === String(record.id)) {
                marker.openPopup();
            }
        });
    }

    // =========================================================
    // LOAD INSPECTION RECORDS
    // =========================================================

    async function loadInspectionRecords() {
        if (loadingRecords) {
            pendingRecordLoad = true;
            return;
        }

        currentUser = app?.currentUser || currentUser;

        if (!currentUser) {
            resetMapSummary();
            setMapStatus(
                "Please sign in to view your inspection records."
            );
            return;
        }

        if (!supabaseClient) {
            setMapStatus(
                "Shared database connection is unavailable.",
                true
            );
            return;
        }

        loadingRecords = true;
        pendingRecordLoad = false;

        setMapStatus("Loading inspection records...");

        try {
            initialiseMap();

            if (!mapInitialised || !map) {
                throw new Error("The map could not be initialised.");
            }

            const { data, error } = await supabaseClient
                .from("inspections")
                .select(`
                    id,
                    inspected_at,
                    latitude,
                    longitude,
                    total_potholes,
                    confidence_threshold,
                    average_confidence
                `)
                .not("latitude", "is", null)
                .not("longitude", "is", null)
                .order("inspected_at", { ascending: false })
                .limit(1000);

            if (error) throw error;

            const records = data || [];

            inspectionRecords = records.filter(record =>
                Number.isFinite(Number(record.latitude)) &&
                Number.isFinite(Number(record.longitude))
            );

            markerLayer.clearLayers();

            let totalPotholes = 0;
            let validLocations = 0;

            inspectionRecords.forEach(record => {
                const marker = createInspectionMarker(record);

                if (!marker) return;

                markerLayer.addLayer(marker);

                totalPotholes +=
                    Number(record.total_potholes) || 0;

                validLocations++;
            });

            if (inspectionCountElement) {
                inspectionCountElement.textContent =
                    records.length;
            }

            if (potholeCountElement) {
                potholeCountElement.textContent =
                    totalPotholes;
            }

            if (locationCountElement) {
                locationCountElement.textContent =
                    validLocations;
            }

            renderRecords(inspectionRecords);

            if (validLocations > 0 && !vehicleMarker) {
                map.fitBounds(markerLayer.getBounds(), {
                    padding: [40, 40],
                    maxZoom: 15
                });

                setMapStatus(
                    `${validLocations} inspection locations loaded successfully.`
                );

            } else if (validLocations === 0 && !vehicleMarker) {
                map.setView([-6.369, 34.888], 6);

                setMapStatus(
                    "No inspection locations with GPS coordinates found."
                );

            } else {
                setMapStatus(
                    `${validLocations} inspection locations loaded. Live GPS tracking is active.`
                );
            }

            refreshMapSize();

            // Update alert information when records are refreshed.
            if (!inspectionRecords.some(
                record => Number(record.total_potholes) > 0
            )) {
                updateAlertStatus(
                    "No reported inspection locations with potholes."
                );
            } else if (gpsWatchId === null) {
                updateAlertStatus(
                    "Saved inspection locations loaded. Start live tracking for proximity alerts."
                );
            }

        } catch (error) {
            console.error("Inspection map error:", error);

            setMapStatus(
                "Could not load inspection records: " + error.message,
                true
            );

        } finally {
            loadingRecords = false;

            if (pendingRecordLoad && currentUser) {
                pendingRecordLoad = false;
                setTimeout(loadInspectionRecords, 100);
            }
        }
    }

    // =========================================================
    // REFRESH MAP BUTTON
    // =========================================================

    if (refreshMapButton) {
        refreshMapButton.addEventListener("click", () => {
            initialiseMap();
            refreshMapSize();
            loadInspectionRecords();
        });
    }

    // =========================================================
    // INITIALISE APPLICATION
    // =========================================================

    createTrackingControls();
    createAlertPanel();

    showInspectionView();

    console.log(
        "Pothole Vision map, GPS and proximity alert system loaded."
    );

})();
