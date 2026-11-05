
(() => {
    "use strict";

    // ==================================================
    // POTHOLE VISION - MAP MODULE
    // Shared Supabase authentication
    // OpenStreetMap + Leaflet + Live GPS
    // ==================================================

    // Use the Supabase client created by script.js.
    const app = window.PotholeVision;
    const supabaseClient = app?.supabaseClient;

    // ==================================================
    // HTML ELEMENTS
    // ==================================================

    const inspectionTab = document.getElementById("inspectionTab");
    const mapTab = document.getElementById("mapTab");

    const inspectionView = document.getElementById("inspectionView");
    const mapView = document.getElementById("mapView");

    const mapElement = document.getElementById("inspectionMap");
    const mapStatus = document.getElementById("mapStatus");

    const refreshMapButton =
        document.getElementById("refreshMapButton");

    const inspectionCountElement =
        document.getElementById("mapInspectionCount");

    const potholeCountElement =
        document.getElementById("mapPotholeCount");

    const locationCountElement =
        document.getElementById("mapLocationCount");

    const recordsListElement =
        document.getElementById("mapRecordsList");

    // ==================================================
    // APPLICATION STATE
    // ==================================================

    let map = null;
    let markerLayer = null;
    let mapInitialised = false;
    let loadingRecords = false;
    let pendingRecordLoad = false;

    let currentUser = app?.currentUser || null;

    // GPS tracking
    let gpsWatchId = null;
    let vehicleMarker = null;
    let accuracyCircle = null;
    let previousPosition = null;
    let currentHeading = null;

    // ==================================================
    // STATUS MESSAGES
    // ==================================================

    function setMapStatus(message, isError = false) {
        if (!mapStatus) return;

        mapStatus.textContent = message;
        mapStatus.style.color = isError ? "#ff7777" : "#b7f34a";
    }

    function setTrackingStatus(message, isError = false) {
        const element = document.getElementById("trackingStatus");

        if (!element) return;

        element.textContent = message;
        element.style.color = isError ? "#ff7777" : "#b7f34a";
    }

    // ==================================================
    // AUTHENTICATION
    // ==================================================

    function handleAuthenticationChange(event) {
        const detail = event?.detail || {};

        currentUser = detail.user || app?.currentUser || null;

        if (currentUser) {
            setMapStatus("Signed in. Your inspection records are available.");

            if (mapTab?.classList.contains("active")) {
                loadInspectionRecords();
            }
        } else {
            resetMapSummary();

            setMapStatus(
                "Please sign in to view your inspection records."
            );
        }
    }

    window.addEventListener(
        "potholevision:auth",
        handleAuthenticationChange
    );

    if (!supabaseClient) {
        setMapStatus(
            "Shared Supabase connection not found. Check script loading order.",
            true
        );
    } else if (!currentUser) {
        setMapStatus("Checking your saved sign-in...");
    }

    // ==================================================
    // MAP CONTAINER DIMENSIONS
    // ==================================================

    function prepareMapContainer() {
        if (!mapElement) {
            setMapStatus(
                "Map container not found in index.html.",
                true
            );
            return false;
        }

        // Set dimensions directly to avoid depending only on CSS.
        mapElement.style.display = "block";
        mapElement.style.position = "relative";
        mapElement.style.width = "100%";
        mapElement.style.height =
            window.innerWidth <= 600 ? "380px" : "480px";
        mapElement.style.minHeight = "380px";
        mapElement.style.backgroundColor = "#26354a";
        mapElement.style.overflow = "hidden";
        mapElement.style.zIndex = "1";

        return true;
    }

    // ==================================================
    // MAP INITIALISATION
    // ==================================================

    function initialiseMap() {
        if (mapInitialised && map) {
            return true;
        }

        if (!prepareMapContainer()) {
            return false;
        }

        if (typeof L === "undefined") {
            setMapStatus(
                "Leaflet could not load. Check your internet connection and refresh.",
                true
            );
            return false;
        }

        try {
            // The map must be visible before Leaflet initializes.
            if (mapView) {
                mapView.hidden = false;
                mapView.style.display = "block";
            }

            map = L.map(mapElement, {
                zoomControl: true,
                attributionControl: true
            }).setView([-6.369, 34.888], 6);

            const tileLayer = L.tileLayer(
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
                {
                    maxZoom: 19,
                    attribution:
                        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
                }
            );

            tileLayer.on("tileerror", () => {
                setMapStatus(
                    "Map created, but some map tiles could not load. Check your internet connection.",
                    true
                );
            });

            tileLayer.addTo(map);

            markerLayer = L.featureGroup().addTo(map);

            mapInitialised = true;

            // Leaflet needs a size recalculation after the tab is visible.
            requestAnimationFrame(() => {
                map.invalidateSize(true);
            });

            setTimeout(() => {
                if (map) map.invalidateSize(true);
            }, 500);

            console.log("Pothole Vision Leaflet map created.");

            return true;

        } catch (error) {
            console.error("Map initialisation error:", error);

            setMapStatus(
                "Map initialisation failed: " + error.message,
                true
            );

            return false;
        }
    }

    // ==================================================
    // TAB NAVIGATION
    // ==================================================

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

        setMapStatus("Opening map...");

        // Wait until the map section is visible before creating Leaflet.
        requestAnimationFrame(() => {
            const success = initialiseMap();

            if (!success) return;

            setTimeout(() => {
                map.invalidateSize(true);

                currentUser = app?.currentUser || currentUser;

                if (currentUser) {
                    loadInspectionRecords();
                } else {
                    setMapStatus(
                        "Please sign in to view your inspection records."
                    );
                }
            }, 250);
        });
    }

    inspectionTab?.addEventListener("click", showInspectionView);
    mapTab?.addEventListener("click", showMapView);

    // ==================================================
    // TRACKING CONTROLS
    // ==================================================

    function createTrackingControls() {
        const toolbar = document.querySelector(".map-toolbar");

        if (
            !toolbar ||
            document.getElementById("liveTrackingControls")
        ) {
            return;
        }

        const controls = document.createElement("div");
        controls.id = "liveTrackingControls";

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

    // ==================================================
    // SAFE HTML
    // ==================================================

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

    // ==================================================
    // VEHICLE DIRECTION
    // ==================================================

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

        return (toDegrees(Math.atan2(y, x)) + 360) % 360;
    }

    // ==================================================
    // VEHICLE ICON
    // ==================================================

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

    // ==================================================
    // START LIVE GPS TRACKING
    // ==================================================

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

        if (!initialiseMap()) {
            setTrackingStatus(
                "The map is not ready. Please try again.",
                true
            );
            return;
        }

        if (gpsWatchId !== null) return;

        setTrackingStatus("Requesting your phone's GPS location...");
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

    // ==================================================
    // GPS POSITION UPDATE
    // ==================================================

    function handleGPSPosition(position) {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        const newPosition = { latitude, longitude };

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
    }

    // ==================================================
    // GPS ERRORS
    // ==================================================

    function handleGPSError(error) {
        let message = "Unable to obtain your GPS location.";

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message =
                    "Location permission denied. Allow location access in your browser settings.";
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

    // ==================================================
    // STOP GPS TRACKING
    // ==================================================

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
    }

    // ==================================================
    // DATE FORMATTING
    // ==================================================

    function formatDate(dateValue) {
        if (!dateValue) return "Date unavailable";

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) {
            return "Date unavailable";
        }

        return date.toLocaleString();
    }

    // ==================================================
    // RESET SUMMARY
    // ==================================================

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
    }

    // ==================================================
    // INSPECTION MARKERS
    // ==================================================

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

    // ==================================================
    // INSPECTION RECORD LIST
    // ==================================================

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

                    if (record) focusRecord(record);
                });
            });
    }

    // ==================================================
    // FOCUS ON INSPECTION
    // ==================================================

    function focusRecord(record) {
        if (!initialiseMap()) return;

        const latitude = Number(record.latitude);
        const longitude = Number(record.longitude);

        if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
        ) {
            return;
        }

        map.setView([latitude, longitude], 16);

        markerLayer.eachLayer(marker => {
            if (String(marker.recordId) === String(record.id)) {
                marker.openPopup();
            }
        });
    }

    // ==================================================
    // LOAD INSPECTION RECORDS
    // ==================================================

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
            if (!initialiseMap()) {
                throw new Error("Map could not be initialised.");
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

            markerLayer.clearLayers();

            let totalPotholes = 0;
            let validLocations = 0;

            records.forEach(record => {
                const marker = createInspectionMarker(record);

                if (!marker) return;

                markerLayer.addLayer(marker);

                totalPotholes +=
                    Number(record.total_potholes) || 0;

                validLocations++;
            });

            if (inspectionCountElement) {
                inspectionCountElement.textContent = records.length;
            }

            if (potholeCountElement) {
                potholeCountElement.textContent = totalPotholes;
            }

            if (locationCountElement) {
                locationCountElement.textContent = validLocations;
            }

            const validRecords = records.filter(record =>
                Number.isFinite(Number(record.latitude)) &&
                Number.isFinite(Number(record.longitude))
            );

            renderRecords(validRecords);

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
                    `${validLocations} inspection locations loaded.`
                );
            }

            // Make sure the map tiles and markers recalculate dimensions.
            setTimeout(() => {
                if (map) map.invalidateSize(true);
            }, 200);

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
                setTimeout(loadInspectionRecords, 150);
            }
        }
    }

    // ==================================================
    // REFRESH BUTTON
    // ==================================================

    if (refreshMapButton) {
        refreshMapButton.addEventListener("click", () => {
            loadInspectionRecords();
        });
    }

    // ==================================================
    // WINDOW RESIZE
    // ==================================================

    window.addEventListener("resize", () => {
        if (!mapElement) return;

        if (mapInitialised && map) {
            mapElement.style.height =
                window.innerWidth <= 600 ? "380px" : "480px";

            map.invalidateSize(true);
        }
    });

    // ==================================================
    // APPLICATION STARTUP
    // ==================================================

    createTrackingControls();
    showInspectionView();

    console.log(
        "Pothole Vision map module loaded. Shared authentication enabled."
    );

})();
