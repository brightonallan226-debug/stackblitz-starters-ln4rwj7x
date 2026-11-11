"use strict";

/* ============================================================
   POTHOLE VISION
   MAP-FIRST NAVIGATION — SATELLITE GLOBE VERSION

   Login
      ↓
   Satellite globe centred on Africa
      ↓
   Request phone GPS
      ↓
   Fly to user's location
      ↓
   Tilted local satellite map
      ↓
   Follow phone movement
      ↓
   Record Pothole
      ↓
   Existing camera and AI detection workflow
   ============================================================ */

(() => {

    /* ========================================================
       CONFIGURATION
    ======================================================== */

    const CONFIG = {
        initialCenter: [20, 0],
        initialZoom: 1.7,

        destinationZoom: 17,
        destinationPitch: 50,

        enableHighAccuracy: true,
        gpsTimeout: 30000,
        gpsMaximumAge: 1000,

        followUser: true
    };

    let map = null;
    let userMarker = null;

    let globeRotationTimer = null;
    let globeLongitude = CONFIG.initialCenter[0];

    let currentPosition = null;
    let previousPosition = null;

    // Direction of travel, in degrees clockwise from true north.
    let currentHeading = 0;
    let headingAvailable = false;

    let gpsWatchId = null;
    let gpsStarted = false;

    let authenticated = false;
    let mapInitialized = false;
    let firstGPSFix = false;

    let globeScreen = null;
    let mapElement = null;
    let gpsStatus = null;
    let locationTitle = null;
    let locationCoordinates = null;
    let recordButton = null;

    /* ========================================================
       STYLES
    ======================================================== */

    function installStyles() {

        if (document.getElementById("pv-map-styles")) {
            return;
        }

        const style = document.createElement("style");

        style.id = "pv-map-styles";

        style.textContent = `

            #pv-globe-screen {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: none;
                overflow: hidden;
                background: #050914;
                font-family: Arial, sans-serif;
            }

            #pv-globe-screen.pv-active {
                display: block;
            }

            #pv-globe-map {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                background: #080e18;
            }

            .pv-map-top {
                position: absolute;
                top: max(12px, env(safe-area-inset-top));
                left: 12px;
                right: 12px;
                z-index: 10;

                display: flex;
                align-items: center;
                justify-content: space-between;

                gap: 10px;
                pointer-events: none;
            }

            .pv-brand {
                color: #ffffff;
                font-size: 13px;
                font-weight: 900;
                letter-spacing: 2px;

                text-shadow: 0 2px 8px #000;
            }

            .pv-brand span {
                color: #b7f34a;
            }

            .pv-gps-status {
                max-width: 65%;
                padding: 10px 13px;

                color: #ffffff;
                background: rgba(8, 17, 30, 0.92);

                border: 1px solid rgba(183, 243, 74, 0.35);
                border-radius: 30px;

                font-size: 11px;
                text-align: center;

                backdrop-filter: blur(12px);
            }

            .pv-gps-status::before {
                content: "";
                display: inline-block;

                width: 7px;
                height: 7px;

                margin-right: 7px;

                border-radius: 50%;
                background: #facc15;

                vertical-align: middle;
            }

            .pv-gps-status.pv-connected::before {
                background: #b7f34a;
                box-shadow: 0 0 9px #b7f34a;
            }

            .pv-gps-status.pv-error::before {
                background: #ef4444;
            }

            .pv-location-card {
                position: absolute;

                left: 12px;
                bottom: calc(105px + env(safe-area-inset-bottom));

                z-index: 10;

                max-width: 220px;

                padding: 13px 15px;

                color: #ffffff;

                background: rgba(8, 17, 30, 0.90);

                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 14px;

                font-size: 11px;

                backdrop-filter: blur(12px);

                pointer-events: none;
            }

            .pv-location-card strong {
                display: block;

                margin-bottom: 6px;

                color: #b7f34a;

                font-size: 12px;
            }

            .pv-location-card span {
                overflow-wrap: anywhere;
            }

            .pv-record-button {
                position: absolute;

                left: 50%;
                bottom: calc(24px + env(safe-area-inset-bottom));

                transform: translateX(-50%);

                z-index: 20;

                width: min(270px, calc(100% - 40px));
                min-height: 58px;

                border: none;
                border-radius: 40px;

                background: #b7f34a;
                color: #101827;

                font-size: 14px;
                font-weight: 900;
                letter-spacing: 0.6px;

                box-shadow: 0 8px 30px rgba(183,243,74,0.25);

                cursor: pointer;
            }

            .pv-record-button:active {
                transform: translateX(-50%) scale(0.97);
            }

            .pv-record-button:disabled {
                opacity: 0.45;
                cursor: not-allowed;
            }

            .pv-user-marker {
                width: 30px;
                height: 30px;
                position: relative;
            }

            .pv-user-marker .pv-pulse {
                position: absolute;
                inset: 0;

                border-radius: 50%;

                background: rgba(183,243,74,0.30);

                animation: pv-location-pulse 2s infinite;
            }

            .pv-user-marker .pv-dot {
                position: absolute;

                width: 14px;
                height: 14px;

                top: 8px;
                left: 8px;

                border-radius: 50%;

                background: #b7f34a;

                border: 3px solid white;

                box-shadow: 0 0 14px #b7f34a;
            }

            .pv-user-marker .pv-direction-arrow {
                position: absolute;
                width: 36px;
                height: 44px;
                left: -3px;
                top: -7px;
                display: flex;
                align-items: center;
                justify-content: center;
                filter:
                    drop-shadow(0 0 5px rgba(183,243,74,0.9))
                    drop-shadow(0 2px 5px rgba(0,0,0,0.8));
            }

            @keyframes pv-location-pulse {

                0% {
                    transform: scale(0.8);
                    opacity: 0.9;
                }

                100% {
                    transform: scale(2.5);
                    opacity: 0;
                }

            }

            .maplibregl-ctrl-attrib {
                background: rgba(5,9,20,0.85) !important;
                color: #ffffff !important;
            }

            .maplibregl-ctrl-attrib a {
                color: #b7f34a !important;
            }

            @media (max-width: 600px) {

                .pv-brand {
                    font-size: 11px;
                }

                .pv-gps-status {
                    font-size: 10px;
                    padding: 9px 10px;
                }

                .pv-location-card {
                    max-width: 190px;
                }

            }

        `;

        document.head.appendChild(style);

    }

    /* ========================================================
       CREATE MAP INTERFACE
    ======================================================== */

    function createInterface() {

        if (globeScreen) {
            return;
        }

        installStyles();

        globeScreen = document.createElement("div");

        globeScreen.id = "pv-globe-screen";

        globeScreen.innerHTML = `

            <div id="pv-globe-map"></div>

            <div class="pv-map-top">

                <div class="pv-brand">
                    POTHOLE <span>VISION</span>
                </div>

                <div
                    id="pv-gps-status"
                    class="pv-gps-status"
                >
                    Preparing map...
                </div>

            </div>

            <div class="pv-location-card">

                <strong id="pv-location-title">
                    Finding your location
                </strong>

                <span id="pv-location-coordinates">
                    Waiting for GPS coordinates...
                </span>

            </div>

            <button
                id="pv-record-button"
                class="pv-record-button"
                type="button"
                disabled
            >
                ● RECORD POTHOLE
            </button>

        `;

        document.body.appendChild(globeScreen);

        mapElement = document.getElementById(
            "pv-globe-map"
        );

        gpsStatus = document.getElementById(
            "pv-gps-status"
        );

        locationTitle = document.getElementById(
            "pv-location-title"
        );

        locationCoordinates = document.getElementById(
            "pv-location-coordinates"
        );

        recordButton = document.getElementById(
            "pv-record-button"
        );

        recordButton.addEventListener(
            "click",
            openExistingRecordingWorkflow
        );

    }

    /* ========================================================
       SATELLITE MAP STYLE

       Esri World Imagery is used for both the globe and
       local navigation map.
    ======================================================== */

    function createMapStyle() {

        return {

            version: 8,

            sources: {

                satellite: {

                    type: "raster",

                    tiles: [

                        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

                    ],

                    tileSize: 256,
                    maxzoom: 19,

                    attribution:
                        "Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"

                }

            },

            layers: [

                {

                    id: "satellite-imagery",

                    type: "raster",

                    source: "satellite",

                    minzoom: 0,
                    maxzoom: 19

                }

            ]

        };

    }

    /* ========================================================
       STATUS DISPLAY
    ======================================================== */

    function setStatus(message, state = "normal") {

        if (!gpsStatus) {
            return;
        }

        gpsStatus.textContent = message;

        gpsStatus.classList.remove(
            "pv-connected",
            "pv-error"
        );

        if (state === "connected") {

            gpsStatus.classList.add(
                "pv-connected"
            );

        }

        if (state === "error") {

            gpsStatus.classList.add(
                "pv-error"
            );

        }

    }

    /* ========================================================
       INITIALISE MAP
    ======================================================== */

    function initialiseMap() {

        if (map) {
            map.resize();
            return;
        }

        createInterface();

        if (typeof maplibregl === "undefined") {

            setStatus(
                "MapLibre library failed to load",
                "error"
            );

            console.error(
                "MapLibre GL JS is unavailable."
            );

            return;
        }

        try {

            map = new maplibregl.Map({

                container: mapElement,

                style: createMapStyle(),

                center: CONFIG.initialCenter,

                zoom: CONFIG.initialZoom,

                projection: { type: "globe" },

                pitch: 0,

                bearing: 0,

                attributionControl: true,

                antialias: true

            });

            map.addControl(

                new maplibregl.NavigationControl({
                    visualizePitch: true
                }),

                "bottom-right"

            );

            /*
             * IMPORTANT CORRECTION:
             * Reapply globe projection after the satellite
             * style loads. This keeps the Earth spherical.
             */

            map.on("style.load", () => {

                map.setProjection({
                    type: "globe"
                });

                console.log(
                    "Active map projection:",
                    map.getProjection()
                );

            });

            map.on("load", () => {

                mapInitialized = true;

                map.resize();

                setStatus(
                    "Satellite globe loaded — acquiring GPS"
                );

                console.log(
                    "Pothole Vision satellite globe successfully loaded."
                );

                if (currentPosition) {

                    moveToUser();

                } else {

                    startGlobeRotation();

                }

            });

            map.on("error", event => {

                const error =
                    event.error || event;

                console.error(
                    "Map rendering error:",
                    error
                );

                if (error?.message) {

                    setStatus(
                        "Map error: " + error.message,
                        "error"
                    );

                }

            });

        } catch (error) {

            console.error(
                "Map initialization failed:",
                error
            );

            setStatus(
                "Unable to initialize map",
                "error"
            );

        }

    }

    /* ========================================================
       GLOBE ROTATION

       Slowly rotate the satellite globe while waiting for GPS.
       Stop when the first phone location is received.
    ======================================================== */

    function startGlobeRotation() {

        if (
            !map ||
            !mapInitialized ||
            firstGPSFix ||
            globeRotationTimer !== null
        ) {
            return;
        }

        globeRotationTimer = window.setInterval(() => {

            if (
                !map ||
                !mapInitialized ||
                firstGPSFix
            ) {

                stopGlobeRotation();

                return;

            }

            globeLongitude += 0.12;

            if (globeLongitude > 180) {
                globeLongitude -= 360;
            }

            map.setCenter([
                globeLongitude,
                0
            ]);

        }, 100);

    }

    function stopGlobeRotation() {

        if (globeRotationTimer !== null) {

            window.clearInterval(
                globeRotationTimer
            );

            globeRotationTimer = null;

        }

    }

    /* ========================================================
       DIRECTION AND HEADING

       GPS heading is preferred while moving. If the device does
       not provide it, direction is estimated from successive GPS
       positions. The last reliable heading is retained while still.
    ======================================================== */

    function calculateDistance(lat1, lon1, lat2, lon2) {

        const toRad = value => value * Math.PI / 180;
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) ** 2;

        return 6371000 * 2 * Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );

    }

    function calculateBearing(lat1, lon1, lat2, lon2) {

        const toRad = value => value * Math.PI / 180;
        const toDeg = value => value * 180 / Math.PI;

        const phi1 = toRad(lat1);
        const phi2 = toRad(lat2);
        const deltaLon = toRad(lon2 - lon1);

        const y = Math.sin(deltaLon) * Math.cos(phi2);
        const x =
            Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);

        return (toDeg(Math.atan2(y, x)) + 360) % 360;

    }

    function updateHeading(coords, nextPosition) {

        let newHeading = null;        // A GPS heading is useful only when the phone is moving.
        if (
            Number.isFinite(coords.heading) &&
            coords.heading !== null &&
            Number.isFinite(coords.speed) &&
            coords.speed > 0.8
        ) {
            newHeading = coords.heading;
        }

        // Fall back to the bearing between reliable GPS fixes.
        if (
            newHeading === null &&
            previousPosition &&
            Number.isFinite(coords.accuracy) &&
            coords.accuracy <= 30
        ) {
            const distance = calculateDistance(
                previousPosition.latitude,
                previousPosition.longitude,
                nextPosition.latitude,
                nextPosition.longitude
            );

            if (distance >= 5) {
                newHeading = calculateBearing(
                    previousPosition.latitude,
                    previousPosition.longitude,
                    nextPosition.latitude,
                    nextPosition.longitude
                );
            }
        }

        if (newHeading === null) return;

        if (!headingAvailable) {
            currentHeading = newHeading;
            headingAvailable = true;
        } else {
            // Shortest angular difference handles 359° -> 1° correctly.
            const difference =
                ((newHeading - currentHeading + 540) % 360) - 180;

            // Ignore very small GPS fluctuations and smooth turns.
            if (Math.abs(difference) < 4) return;

            currentHeading =
                (currentHeading + difference * 0.35 + 360) % 360;
        }

    }

    /* ========================================================
       USER LOCATION MARKER
    ======================================================== */

    function addUserMarker() {

        if (
            !map ||
            !mapInitialized ||
            !currentPosition
        ) {
            return;
        }

        const coordinates = [

            currentPosition.longitude,

            currentPosition.latitude

        ];

        if (!userMarker) {

            const element =
                document.createElement("div");

            element.className = "pv-user-marker";

            element.innerHTML = `

                <div class="pv-pulse"></div>

                <div class="pv-direction-arrow">
                    <svg
                        viewBox="0 0 40 48"
                        width="36"
                        height="44"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                    >
                        <path
                            d="M20 2 L37 42 L20 32 L3 42 Z"
                            fill="#b7f34a"
                            stroke="#ffffff"
                            stroke-width="2.5"
                            stroke-linejoin="round"
                        />
                    </svg>
                </div>

            `;

            userMarker = new maplibregl.Marker({

                element: element,

                anchor: "center"

            })

                .setLngLat(coordinates)

                .addTo(map);

        } else {

            userMarker.setLngLat(coordinates);

        }

        recordButton.disabled = false;

        locationTitle.textContent =
            "Your current location";

        locationCoordinates.textContent =

            currentPosition.latitude.toFixed(6) +
            ", " +
            currentPosition.longitude.toFixed(6);

        setStatus(
            "GPS location connected",
            "connected"
        );

    }

    /* ========================================================
       MOVE MAP TO USER
    ======================================================== */

    function moveToUser() {

        if (
            !map ||
            !mapInitialized ||
            !currentPosition
        ) {
            return;
        }

        const destination = [

            currentPosition.longitude,

            currentPosition.latitude

        ];

        if (!firstGPSFix) {

            firstGPSFix = true;

            stopGlobeRotation();

            /*
             * IMPORTANT CORRECTION:
             * Do NOT change to Mercator here.
             * Keep globe projection active during GPS fly-in.
             */

            map.flyTo({

                center: destination,

                zoom: CONFIG.destinationZoom,

                pitch: CONFIG.destinationPitch,

                bearing: headingAvailable ? currentHeading : 0,

                duration: 4500,

                essential: true

            });

        } else if (CONFIG.followUser) {

            map.easeTo({

                center: destination,

                duration: 700,

                essential: true

            });

        }

        addUserMarker();

    }

    /* ========================================================
       GPS POSITION UPDATE
    ======================================================== */

    function handlePosition(position) {

        const coords = position.coords;

        const nextPosition = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed
        };

        // Keep the last fix available for the movement-bearing fallback.
        previousPosition = currentPosition;
        currentPosition = nextPosition;

        updateHeading(coords, nextPosition);

        console.log("GPS position:", currentPosition);
        console.log(
            "Travel heading:",
            headingAvailable ? currentHeading : "Waiting for movement"
        );

        if (mapInitialized) {

            if (!firstGPSFix) {
                moveToUser();
            } else {
                addUserMarker();

                if (CONFIG.followUser) {
                    map.easeTo({
                        center: [
                            currentPosition.longitude,
                            currentPosition.latitude
                        ],
                        bearing: headingAvailable
                            ? currentHeading
                            : map.getBearing(),
                        duration: 700,
                        essential: true
                    });
                }
            }

        }

        /* Share GPS coordinates with the main application. */
        window.PotholeVision = window.PotholeVision || {};

        window.PotholeVision.currentLocation = {
            latitude: currentPosition.latitude,
            longitude: currentPosition.longitude,
            accuracy: currentPosition.accuracy
        };

        window.dispatchEvent(
            new CustomEvent("potholevision:location-updated", {
                detail: window.PotholeVision.currentLocation
            })
        );

    }

    /* ========================================================
       GPS ERROR HANDLING
    ======================================================== */

    function handleGPSError(error) {

        console.error(
            "GPS error:",
            error
        );

        let message =
            "Unable to obtain GPS location";

        if (error.code === 1) {

            message =
                "Location permission denied. Check browser settings.";

        } else if (error.code === 2) {

            message =
                "GPS unavailable. Check phone location services.";

        } else if (error.code === 3) {

            message =
                "GPS timed out. Waiting for another reading.";

        }

        setStatus(
            message,
            "error"
        );

        if (locationTitle) {

            locationTitle.textContent =
                "GPS connection problem";

        }

        if (locationCoordinates) {

            locationCoordinates.textContent =
                message;

        }

    }

    /* ========================================================
       START GPS TRACKING
    ======================================================== */

    function startGPS() {

        if (gpsStarted) {
            return;
        }

        if (!navigator.geolocation) {

            setStatus(
                "This browser does not support GPS",
                "error"
            );

            return;
        }

        if (!window.isSecureContext) {

            setStatus(
                "GPS requires a secure HTTPS connection",
                "error"
            );

            return;
        }

        gpsStarted = true;

        setStatus(
            "Requesting phone GPS location"
        );

        locationTitle.textContent =
            "Finding your location";

        locationCoordinates.textContent =
            "Waiting for GPS coordinates...";

        gpsWatchId =
            navigator.geolocation.watchPosition(

                handlePosition,

                handleGPSError,

                {

                    enableHighAccuracy:
                        CONFIG.enableHighAccuracy,

                    timeout:
                        CONFIG.gpsTimeout,

                    maximumAge:
                        CONFIG.gpsMaximumAge

                }

            );

    }

    /* ========================================================
       STOP GPS TRACKING
    ======================================================== */

    function stopGPS() {

        stopGlobeRotation();

        if (gpsWatchId !== null) {

            navigator.geolocation.clearWatch(
                gpsWatchId
            );

        }

        gpsWatchId = null;

        gpsStarted = false;

        currentPosition = null;

        previousPosition = null;

        currentHeading = 0;

        headingAvailable = false;

        firstGPSFix = false;

    }

    /* ========================================================
       RECORD POTHOLE

       Reuses existing camera and AI workflow.
    ======================================================== */

    function openExistingRecordingWorkflow() {

        const cameraButton =
            document.getElementById("cameraButton");

        if (!cameraButton) {

            alert(
                "The existing camera workflow could not be found."
            );

            return;
        }

        if (!currentPosition) {

            alert(
                "Please wait until your phone GPS location is available."
            );

            return;
        }

        globeScreen.classList.remove(
            "pv-active"
        );

        const appWorkspace =
            document.getElementById("appWorkspace");

        const inspectionView =
            document.getElementById("inspectionView");

        const mapView =
            document.getElementById("mapView");

        if (appWorkspace) {

            appWorkspace.hidden = false;

        }

        if (inspectionView) {

            inspectionView.hidden = false;

        }

        if (mapView) {

            mapView.hidden = true;

        }

        cameraButton.click();

    }

    /* ========================================================
       RETURN TO MAP AFTER INSPECTION
    ======================================================== */

    function returnToMap() {

        if (!authenticated) {
            return;
        }

        const appWorkspace =
            document.getElementById("appWorkspace");

        if (appWorkspace) {

            appWorkspace.hidden = true;

        }

        if (globeScreen) {

            globeScreen.classList.add(
                "pv-active"
            );

        }

        if (map) {

            map.resize();

        }

        if (currentPosition) {

            moveToUser();

        }

    }

    window.addEventListener(

        "potholevision:inspection-saved",

        returnToMap

    );

    /* ========================================================
       AUTHENTICATION
    ======================================================== */

    function onAuthenticated(event) {

        const user = event.detail?.user;

        if (!user) {

            onSignedOut();

            return;

        }

        authenticated = true;

        createInterface();

        const loginScreen =
            document.getElementById("loginScreen");

        const recoveryScreen =
            document.getElementById("recoveryScreen");

        const newPasswordScreen =
            document.getElementById("newPasswordScreen");

        const appWorkspace =
            document.getElementById("appWorkspace");

        const introSection =
            document.querySelector(".intro-section");

        const appHeader =
            document.querySelector(".app-header");

        const appFooter =
            document.querySelector(".app-footer");

        if (loginScreen) {
            loginScreen.hidden = true;
        }

        if (recoveryScreen) {
            recoveryScreen.hidden = true;
        }

        if (newPasswordScreen) {
            newPasswordScreen.hidden = true;
        }

        if (appWorkspace) {
            appWorkspace.hidden = true;
        }

        if (introSection) {
            introSection.hidden = true;
        }

        if (appHeader) {
            appHeader.hidden = true;
        }

        if (appFooter) {
            appFooter.hidden = true;
        }

        globeScreen.classList.add(
            "pv-active"
        );

        initialiseMap();

        startGPS();

        setTimeout(() => {

            if (map) {
                map.resize();
            }

        }, 500);

    }

    /* ========================================================
       SIGN OUT
    ======================================================== */

    function onSignedOut() {

        authenticated = false;

        stopGPS();

        if (globeScreen) {

            globeScreen.classList.remove(
                "pv-active"
            );

        }

        const loginScreen =
            document.getElementById("loginScreen");

        const introSection =
            document.querySelector(".intro-section");

        const appHeader =
            document.querySelector(".app-header");

        const appFooter =
            document.querySelector(".app-footer");

        if (loginScreen) {
            loginScreen.hidden = false;
        }

        if (introSection) {
            introSection.hidden = false;
        }

        if (appHeader) {
            appHeader.hidden = false;
        }

        if (appFooter) {
            appFooter.hidden = false;
        }

    }

    window.addEventListener(
        "potholevision:auth",
        onAuthenticated
    );

    window.addEventListener(
        "potholevision:signout",
        onSignedOut
    );

    /* ========================================================
       EXISTING SESSION CHECK
    ======================================================== */

    function checkExistingSession() {

        const user =
            window.PotholeVision?.currentUser;

        if (user) {

            onAuthenticated({

                detail: {
                    user: user
                }

            });

        }

    }

    if (document.readyState === "loading") {

        document.addEventListener(

            "DOMContentLoaded",

            checkExistingSession,

            { once: true }

        );

    } else {

        checkExistingSession();

    }

    /* ========================================================
       PUBLIC MAP API
    ======================================================== */

    window.PotholeVisionMap = {

        startLocationTracking: startGPS,

        stopLocationTracking: stopGPS,

        getCurrentPosition: () => currentPosition,

        getMap: () => map,

        returnToMap: returnToMap,

        focusUser: () => {

            if (currentPosition && map) {

                map.flyTo({

                    center: [

                        currentPosition.longitude,

                        currentPosition.latitude

                    ],

                    zoom: CONFIG.destinationZoom,

                    pitch: CONFIG.destinationPitch,

                    bearing: headingAvailable
                        ? currentHeading
                        : map.getBearing(),

                    duration: 2000,

                    essential: true

                });

            }

        }

    };

})();