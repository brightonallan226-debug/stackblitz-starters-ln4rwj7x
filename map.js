"use strict";(()=>{const CONFIG={initialCenter:[20,0],initialZoom:1.7,destinationZoom:17,destinationPitch:50,enableHighAccuracy:true,gpsTimeout:30000,gpsMaximumAge:1000,followUser:true,inspectionTable:"inspections"};let map=null;let userMarker=null;const inspectionMarkers=new Map();let inspectionMarkersLoadPromise=null;let inspectionMarkersRefreshQueued=false;const PROXIMITY_CONFIG={warningDistance:200,cautionDistance:100,urgentDistance:50,resetDistance:250,maximumGPSAccuracy:35,directionCone:70};let savedPotholeLocations=[];let proximityAlertStages=new Map();let proximityAlertElement=null;let proximityAlertTitle=null;let proximityAlertMessage=null;let proximityAlertTimer=null;let proximityAudioContext=null;let proximityAudioUnlocked=false;let globeRotationTimer=null;let globeLongitude=CONFIG.initialCenter[0];let currentPosition=null;let previousPosition=null;let currentHeading=0;let headingAvailable=false;let gpsWatchId=null;let gpsStarted=false;let authenticated=false;let mapInitialized=false;let firstGPSFix=false;let localZoomComplete=false;let globeScreen=null;let mapElement=null;let gpsStatus=null;let locationTitle=null;let locationCoordinates=null;let recordButton=null;function installStyles(){if(document.getElementById("pv-map-styles")){return;}const style=document.createElement("style");style.id="pv-map-styles";style.textContent=`

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
                font-size: 10px;
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

            .pv-inspection-marker {
                display: block;
                width: 17px;
                height: 17px;
                padding: 0;
                border-radius: 50%;
                background: #ef4444;
                border: 2px solid #ffffff;
                box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.22),
                            0 2px 9px rgba(0, 0, 0, 0.65);
                cursor: pointer;
            }

            .pv-inspection-marker:hover {
                transform: scale(1.18);
            }

            .pv-inspection-popup {
                min-width: 170px;
                color: #101827;
                font-family: Arial, sans-serif;
                font-size: 12px;
                line-height: 1.5;
            }

            .pv-inspection-popup strong {
                display: block;
                margin-bottom: 5px;
                color: #b91c1c;
                font-size: 13px;
            }

            .pv-inspection-popup span {
                display: block;
            }

            .pv-proximity-alert {
                position: absolute;
                top: 82px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 30;
                width: min(350px, calc(100% - 28px));
                box-sizing: border-box;
                padding: 15px 17px;
                color: #ffffff;
                text-align: center;
                background: rgba(8, 17, 30, 0.97);
                border: 2px solid #38bdf8;
                border-radius: 16px;
                box-shadow: 0 8px 35px rgba(0,0,0,0.45);
                backdrop-filter: blur(14px);
                pointer-events: none;
            }

            .pv-proximity-alert[hidden] {
                display: none !important;
            }

            .pv-proximity-alert strong {
                display: block;
                margin-bottom: 7px;
                font-size: 15px;
                font-weight: 900;
                letter-spacing: 0.4px;
            }

            .pv-proximity-alert span {
                display: block;
                font-size: 12px;
                line-height: 1.5;
            }

            .pv-proximity-alert.pv-alert-warning {
                border-color: #38bdf8;
            }

            .pv-proximity-alert.pv-alert-caution {
                border-color: #facc15;
            }

            .pv-proximity-alert.pv-alert-urgent {
                border-color: #ef4444;
                animation: pv-proximity-pulse 1s ease-in-out 3;
            }

            @keyframes pv-proximity-pulse {
                0%, 100% {
                    box-shadow: 0 0 10px rgba(239,68,68,0.18);
                }
                50% {
                    box-shadow: 0 0 28px rgba(239,68,68,0.72);
                }
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

            .pv-user-marker .pv-location-sphere {
                position: absolute;
                width: 13px;
                height: 13px;
                left: 8.5px;
                top: 8.5px;
                border-radius: 50%;
                background: radial-gradient(circle at 35% 30%, #ffffff 0%, #dfffaa 18%, #b7f34a 48%, #6d9f20 100%);
                border: 1px solid rgba(255,255,255,0.95);
                box-shadow: 0 0 8px rgba(183,243,74,0.95), 0 0 18px rgba(183,243,74,0.55);
                z-index: 2;
            }

            .pv-user-marker .pv-direction-arrow {
                position: absolute;
                width: 18px;
                height: 24px;
                left: 6px;
                top: -12px;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transition: opacity 250ms ease, visibility 250ms ease;
                filter:
                    drop-shadow(0 0 2px rgba(183,243,74,0.75))
                    drop-shadow(0 1px 2px rgba(0,0,0,0.8));
                z-index: 3;
            }

            .pv-user-marker.pv-navigation-ready .pv-direction-arrow {
                opacity: 1;
                visibility: visible;
            }

            .pv-user-marker.pv-navigation-ready .pv-location-sphere {
                opacity: 0;
                visibility: hidden;
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

        `;document.head.appendChild(style);}function createInterface(){if(globeScreen){return;}installStyles();globeScreen=document.createElement("div");globeScreen.id="pv-globe-screen";globeScreen.innerHTML=`

            <div id="pv-globe-map"></div>

            <div class="pv-map-top">
                <div class="pv-brand">
                    POTHOLE <span>VISION</span>
                </div>
                <div id="pv-gps-status" class="pv-gps-status">
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

            <div id="pv-proximity-alert"
                 class="pv-proximity-alert"
                 hidden
                 role="alert"
                 aria-live="assertive">
                <strong id="pv-proximity-alert-title">
                    POTHOLE LOCATION AHEAD
                </strong>
                <span id="pv-proximity-alert-message">
                    A previously recorded pothole inspection location is nearby.
                </span>
            </div>

            <button id="pv-record-button"
                    class="pv-record-button"
                    type="button"
                    disabled>
                ● RECORD POTHOLE
            </button>

        `;document.body.appendChild(globeScreen);mapElement=document.getElementById("pv-globe-map");gpsStatus=document.getElementById("pv-gps-status");locationTitle=document.getElementById("pv-location-title");locationCoordinates=document.getElementById("pv-location-coordinates");recordButton=document.getElementById("pv-record-button");proximityAlertElement=document.getElementById("pv-proximity-alert");proximityAlertTitle=document.getElementById("pv-proximity-alert-title");proximityAlertMessage=document.getElementById("pv-proximity-alert-message");document.addEventListener("pointerdown",unlockProximityAudio,{once:true,capture:true});document.addEventListener("keydown",unlockProximityAudio,{once:true,capture:true});recordButton.onclick = function(){
            recordButton.textContent = "BUTTON CLICK DETECTED";
            console.log("Record button click detected");
            openExistingRecordingWorkflow();
        };}function createMapStyle(){return{version:8,sources:{satellite:{type:"raster",tiles:["https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],tileSize:256,maxzoom:19,attribution:"Tiles © Esri — Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"}},layers:[{id:"satellite-imagery",type:"raster",source:"satellite",minzoom:0,maxzoom:19}]};}function setStatus(message,state="normal"){if(!gpsStatus){return;}gpsStatus.textContent=message;gpsStatus.classList.remove("pv-connected","pv-error");if(state==="connected"){gpsStatus.classList.add("pv-connected");}if(state==="error"){gpsStatus.classList.add("pv-error");}}function formatInspectionDate(value){if(!value){return "Date unavailable";}const date=new Date(value);if(Number.isNaN(date.getTime())){return "Date unavailable";}return date.toLocaleString();}function clearInspectionMarkers(){inspectionMarkers.forEach(marker=>marker.remove());inspectionMarkers.clear();}function createInspectionPopup(inspection){const wrapper=document.createElement("div");wrapper.className="pv-inspection-popup";const heading=document.createElement("strong");heading.textContent="POTHOLE INSPECTION";const date=document.createElement("span");date.textContent="Date: "+formatInspectionDate(inspection.inspected_at);const count=document.createElement("span");count.textContent=`Potholes detected: ${Number(inspection.total_potholes)||0}`;const coordinates=document.createElement("span");coordinates.textContent=`GPS: ${Number(inspection.latitude).toFixed(6)}, ${Number(inspection.longitude).toFixed(6)}`;wrapper.append(heading,date,count,coordinates);return wrapper;}async function loadInspectionMarkers(){if(!map||!mapInitialized){return;}if(inspectionMarkersLoadPromise){inspectionMarkersRefreshQueued=true;await inspectionMarkersLoadPromise;if(inspectionMarkersRefreshQueued){inspectionMarkersRefreshQueued=false;return loadInspectionMarkers();}return;}const client=window.PotholeVision?.supabaseClient;const user=window.PotholeVision?.currentUser;if(!client||!user?.id){clearInspectionMarkers();savedPotholeLocations=[];proximityAlertStages.clear();return;}const request=(async()=>{try{const{data,error}=await client.from(CONFIG.inspectionTable).select("id, inspected_at, latitude, longitude, gps_accuracy, total_potholes").eq("user_id",user.id).not("latitude","is",null).not("longitude","is",null).gt("total_potholes",0).order("inspected_at",{ascending:false});if(error)throw error;if(window.PotholeVision?.currentUser?.id!==user.id){return;}clearInspectionMarkers();const validInspections=(data||[]).filter(inspection=>{const latitude=Number(inspection.latitude);const longitude=Number(inspection.longitude);const count=Number(inspection.total_potholes);return Boolean(inspection.id)&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180&&Number.isFinite(count)&&count>0;});savedPotholeLocations=validInspections.map(inspection=>({id:String(inspection.id),latitude:Number(inspection.latitude),longitude:Number(inspection.longitude),totalPotholes:Number(inspection.total_potholes),inspectedAt:inspection.inspected_at,gpsAccuracy:inspection.gps_accuracy}));const validIds=new Set(savedPotholeLocations.map(item=>item.id));for(const id of proximityAlertStages.keys()){if(!validIds.has(id)){proximityAlertStages.delete(id);}}validInspections.forEach(inspection=>{const latitude=Number(inspection.latitude);const longitude=Number(inspection.longitude);const count=Number(inspection.total_potholes);const markerElement=document.createElement("button");markerElement.type="button";markerElement.className="pv-inspection-marker";markerElement.setAttribute("aria-label",`${count} pothole(s), inspected ${formatInspectionDate(inspection.inspected_at)}`);markerElement.title=`${count} pothole(s) detected`;const popup=new maplibregl.Popup({offset:14,closeButton:true,closeOnClick:true,maxWidth:"260px"}).setDOMContent(createInspectionPopup(inspection));const marker=new maplibregl.Marker({element:markerElement,anchor:"center"}).setLngLat([longitude,latitude]).setPopup(popup).addTo(map);inspectionMarkers.set(String(inspection.id),marker);});console.log(`Loaded ${inspectionMarkers.size} saved pothole inspection marker(s) for proximity alerts.`);checkProximityAlerts();}catch(error){console.error("Could not load saved inspection markers:",error);setStatus("Could not load saved inspection markers","error");}})();inspectionMarkersLoadPromise=request;try{await request;}finally{inspectionMarkersLoadPromise=null;}if(inspectionMarkersRefreshQueued){inspectionMarkersRefreshQueued=false;return loadInspectionMarkers();}}function initialiseMap(){if(map){map.resize();return;}createInterface();if(typeof maplibregl==="undefined"){setStatus("MapLibre library failed to load","error");console.error("MapLibre GL JS is unavailable.");return;}try{map=new maplibregl.Map({container:mapElement,style:createMapStyle(),center:CONFIG.initialCenter,zoom:CONFIG.initialZoom,projection:{type:"globe"},pitch:0,bearing:0,attributionControl:true,antialias:true});map.addControl(new maplibregl.NavigationControl({visualizePitch:true}),"bottom-right");map.on("style.load",()=>{map.setProjection({type:"globe"});console.log("Active map projection:",map.getProjection());});map.on("load",()=>{mapInitialized=true;map.setPadding({top:0,bottom:160,left:0,right:0});map.resize();loadInspectionMarkers();setStatus("Satellite globe loaded — acquiring GPS");console.log("Pothole Vision satellite globe successfully loaded.");if(currentPosition){moveToUser();}else{startGlobeRotation();}});map.on("error",event=>{const error=event.error||event;console.error("Map rendering error:",error);if(error?.message){setStatus("Map error: "+error.message,"error");}});}catch(error){console.error("Map initialization failed:",error);setStatus("Unable to initialize map","error");}}function startGlobeRotation(){if(!map||!mapInitialized||firstGPSFix||globeRotationTimer!==null){return;}globeRotationTimer=window.setInterval(()=>{if(!map||!mapInitialized||firstGPSFix){stopGlobeRotation();return;}globeLongitude+=0.12;if(globeLongitude>180){globeLongitude-=360;}map.setCenter([globeLongitude,0]);},100);}function stopGlobeRotation(){if(globeRotationTimer!==null){window.clearInterval(globeRotationTimer);globeRotationTimer=null;}}function calculateDistance(lat1,lon1,lat2,lon2){const toRad=value=>value*Math.PI/180;const dLat=toRad(lat2-lat1);const dLon=toRad(lon2-lon1);const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}function calculateBearing(lat1,lon1,lat2,lon2){const toRad=value=>value*Math.PI/180;const toDeg=value=>value*180/Math.PI;const phi1=toRad(lat1);const phi2=toRad(lat2);const deltaLon=toRad(lon2-lon1);const y=Math.sin(deltaLon)*Math.cos(phi2);const x=Math.cos(phi1)*Math.sin(phi2)-Math.sin(phi1)*Math.cos(phi2)*Math.cos(deltaLon);return(toDeg(Math.atan2(y,x))+360)%360;}function unlockProximityAudio(){if(proximityAudioUnlocked)return;const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return;try{proximityAudioContext=new AudioContextClass();if(proximityAudioContext.state==="suspended"){proximityAudioContext.resume();}proximityAudioUnlocked=true;}catch(error){console.warn("Proximity audio is unavailable:",error);}}function playProximityTone(level){if(!proximityAudioContext||proximityAudioContext.state!=="running"){return;}const context=proximityAudioContext;const pattern=level==="urgent"?[{frequency:880,offset:0},{frequency:660,offset:0.22},{frequency:880,offset:0.44}]:level==="caution"?[{frequency:660,offset:0},{frequency:660,offset:0.25}]:[{frequency:520,offset:0}];pattern.forEach(tone=>{const start=context.currentTime+tone.offset;const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type="sine";oscillator.frequency.setValueAtTime(tone.frequency,start);gain.gain.setValueAtTime(0.0001,start);gain.gain.exponentialRampToValueAtTime(0.16,start+0.025);gain.gain.exponentialRampToValueAtTime(0.0001,start+0.18);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+0.19);});}function showProximityAlert(distance,level,inspection){if(!proximityAlertElement)return;const metres=Math.max(0,Math.round(distance));proximityAlertElement.hidden=false;proximityAlertElement.classList.remove("pv-alert-warning","pv-alert-caution","pv-alert-urgent");if(level==="warning"){proximityAlertElement.classList.add("pv-alert-warning");proximityAlertTitle.textContent="POTHOLE LOCATION AHEAD";proximityAlertMessage.textContent=`Early warning: a recorded inspection location with ${inspection.totalPotholes} pothole(s) is approximately ${metres} metres away.`;}else if(level==="caution"){proximityAlertElement.classList.add("pv-alert-caution");proximityAlertTitle.textContent="CAUTION — POTHOLE LOCATION NEARBY";proximityAlertMessage.textContent=`Recorded inspection location is approximately ${metres} metres away.`;}else{proximityAlertElement.classList.add("pv-alert-urgent");proximityAlertTitle.textContent="WARNING — VERY CLOSE";proximityAlertMessage.textContent=`You are approximately ${metres} metres from a recorded pothole location.`;}playProximityTone(level);if(proximityAlertTimer!==null){window.clearTimeout(proximityAlertTimer);}proximityAlertTimer=window.setTimeout(()=>{if(proximityAlertElement){proximityAlertElement.hidden=true;}proximityAlertTimer=null;},level==="urgent"?9000:6500);}function isInspectionAhead(inspection){if(!headingAvailable||!currentPosition)return true;const bearing=calculateBearing(currentPosition.latitude,currentPosition.longitude,inspection.latitude,inspection.longitude);const difference=Math.abs(((bearing-currentHeading+540)%360)-180);return difference<=PROXIMITY_CONFIG.directionCone;}function checkProximityAlerts(){if(!currentPosition||savedPotholeLocations.length===0)return;const candidates=[];for(const inspection of savedPotholeLocations){const id=String(inspection.id);const distance=calculateDistance(currentPosition.latitude,currentPosition.longitude,inspection.latitude,inspection.longitude);if(distance>PROXIMITY_CONFIG.resetDistance){proximityAlertStages.delete(id);continue;}if(!isInspectionAhead(inspection)){continue;}let stages=proximityAlertStages.get(id);if(!stages){stages={warning:false,caution:false,urgent:false};proximityAlertStages.set(id,stages);}let level=null;if(distance<=PROXIMITY_CONFIG.urgentDistance&&!stages.urgent){level="urgent";}else if(distance<=PROXIMITY_CONFIG.cautionDistance&&!stages.caution){level="caution";}else if(distance<=PROXIMITY_CONFIG.warningDistance&&!stages.warning){level="warning";}if(level){candidates.push({distance,level,inspection,stages});}}if(candidates.length===0)return;candidates.sort((a,b)=>a.distance-b.distance);const selected=candidates[0];if(selected.level==="warning"){selected.stages.warning=true;}else if(selected.level==="caution"){selected.stages.warning=true;selected.stages.caution=true;}else{selected.stages.warning=true;selected.stages.caution=true;selected.stages.urgent=true;}showProximityAlert(selected.distance,selected.level,selected.inspection);}function updateHeading(coords,nextPosition){let newHeading=null;if(Number.isFinite(coords.heading)&&coords.heading!==null&&Number.isFinite(coords.speed)&&coords.speed>0.8){newHeading=coords.heading;}if(newHeading===null&&previousPosition&&Number.isFinite(coords.accuracy)&&coords.accuracy<=30){const distance=calculateDistance(previousPosition.latitude,previousPosition.longitude,nextPosition.latitude,nextPosition.longitude);if(distance>=5){newHeading=calculateBearing(previousPosition.latitude,previousPosition.longitude,nextPosition.latitude,nextPosition.longitude);}}if(newHeading===null)return;if(!headingAvailable){currentHeading=newHeading;headingAvailable=true;}else{const difference=((newHeading-currentHeading+540)%360)-180;if(Math.abs(difference)<4)return;currentHeading=(currentHeading+difference*0.35+360)%360;}}function addUserMarker(){if(!map||!mapInitialized||!currentPosition){return;}const coordinates=[currentPosition.longitude,currentPosition.latitude];if(!userMarker){const element=document.createElement("div");element.className="pv-user-marker";element.innerHTML=`
                    <div class="pv-pulse"></div>
                    <div class="pv-location-sphere"></div>
                    <div class="pv-direction-arrow">
                        <svg viewBox="0 0 40 48" width="18" height="24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M20 2 L37 42 L20 32 L3 42 Z" fill="#b7f34a" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
                        </svg>
                    </div>
                `;if(localZoomComplete){element.classList.add("pv-navigation-ready");}userMarker=new maplibregl.Marker({element,anchor:"center"}).setLngLat(coordinates).addTo(map);}else{userMarker.setLngLat(coordinates);}recordButton.disabled=false;locationTitle.textContent="Your current location";locationCoordinates.textContent=currentPosition.latitude.toFixed(6)+", "+currentPosition.longitude.toFixed(6);setStatus("GPS location connected","connected");}function moveToUser(){if(!map||!mapInitialized||!currentPosition){return;}const destination=[currentPosition.longitude,currentPosition.latitude];if(!firstGPSFix){firstGPSFix=true;localZoomComplete=false;stopGlobeRotation();map.flyTo({center:destination,zoom:CONFIG.destinationZoom,pitch:CONFIG.destinationPitch,bearing:headingAvailable?currentHeading:0,duration:4500,essential:true});map.once("moveend",()=>{localZoomComplete=true;if(userMarker){userMarker.getElement().classList.add("pv-navigation-ready");}});}else if(CONFIG.followUser){map.easeTo({center:destination,duration:700,essential:true});}addUserMarker();}function handlePosition(position){const coords=position.coords;const nextPosition={latitude:coords.latitude,longitude:coords.longitude,accuracy:coords.accuracy,heading:coords.heading,speed:coords.speed};previousPosition=currentPosition;currentPosition=nextPosition;updateHeading(coords,nextPosition);checkProximityAlerts();console.log("GPS position:",currentPosition);console.log("Travel heading:",headingAvailable?currentHeading:"Waiting for movement");if(mapInitialized){if(!firstGPSFix){moveToUser();}else{addUserMarker();if(CONFIG.followUser){map.easeTo({center:[currentPosition.longitude,currentPosition.latitude],bearing:headingAvailable?currentHeading:map.getBearing(),duration:700,essential:true});}}}window.PotholeVision=window.PotholeVision||{};window.PotholeVision.currentLocation={latitude:currentPosition.latitude,longitude:currentPosition.longitude,accuracy:currentPosition.accuracy};window.dispatchEvent(new CustomEvent("potholevision:location-updated",{detail:window.PotholeVision.currentLocation}));}function handleGPSError(error){console.error("GPS error:",error);let message="Unable to obtain GPS location";if(error.code===1){message="Location permission denied. Check browser settings.";}else if(error.code===2){message="GPS unavailable. Check phone location services.";}else if(error.code===3){message="GPS timed out. Waiting for another reading.";}setStatus(message,"error");if(locationTitle){locationTitle.textContent="GPS connection problem";}if(locationCoordinates){locationCoordinates.textContent=message;}}function startGPS(){if(gpsStarted)return;if(!navigator.geolocation){setStatus("This browser does not support GPS","error");return;}if(!window.isSecureContext){setStatus("GPS requires a secure HTTPS connection","error");return;}gpsStarted=true;setStatus("Requesting phone GPS location");locationTitle.textContent="Finding your location";locationCoordinates.textContent="Waiting for GPS coordinates...";gpsWatchId=navigator.geolocation.watchPosition(handlePosition,handleGPSError,{enableHighAccuracy:CONFIG.enableHighAccuracy,timeout:CONFIG.gpsTimeout,maximumAge:CONFIG.gpsMaximumAge});}function stopGPS(){stopGlobeRotation();if(gpsWatchId!==null){navigator.geolocation.clearWatch(gpsWatchId);}gpsWatchId=null;gpsStarted=false;currentPosition=null;previousPosition=null;currentHeading=0;headingAvailable=false;firstGPSFix=false;localZoomComplete=false;}async function openExistingRecordingWorkflow(){
if(!recordButton)return;
console.log("[Pothole Vision] Record Pothole button clicked.");
recordButton.disabled=true;
const originalLabel="● RECORD POTHOLE";
recordButton.textContent="OPENING CAMERA...";
try{
const app=window.PotholeVision;
if(!app)throw new Error("Pothole Vision service is not available. Check that script.js loaded.");
if(typeof app.startPotholeRecording!=="function")throw new Error("Camera function is missing. Refresh the preview and check script.js.");
if(!window.isSecureContext)throw new Error("Camera access requires a secure HTTPS preview.");
if(!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=="function")throw new Error("This preview does not allow camera access. Test using a browser page with camera permission.");
await app.startPotholeRecording();
}catch(error){
console.error("[Pothole Vision] Camera launch failed:",error);
setStatus(error.message||"Unable to open camera","error");
alert(error.message||"Unable to open camera. Check browser camera permissions.");
}finally{
recordButton.disabled=false;
recordButton.textContent=originalLabel;
}
}function returnToMap(){if(!authenticated){return;}const appWorkspace=document.getElementById("appWorkspace");if(appWorkspace){appWorkspace.hidden=true;}if(globeScreen){globeScreen.classList.add("pv-active");}if(map){map.resize();}if(currentPosition){moveToUser();}}window.addEventListener("potholevision:inspection-saved",async()=>{await loadInspectionMarkers();returnToMap();});function onAuthenticated(event){const user=event.detail?.user;if(!user){onSignedOut();return;}authenticated=true;createInterface();const loginScreen=document.getElementById("loginScreen");const recoveryScreen=document.getElementById("recoveryScreen");const newPasswordScreen=document.getElementById("newPasswordScreen");const appWorkspace=document.getElementById("appWorkspace");const introSection=document.querySelector(".intro-section");const appHeader=document.querySelector(".app-header");const appFooter=document.querySelector(".app-footer");if(loginScreen){loginScreen.hidden=true;}if(recoveryScreen){recoveryScreen.hidden=true;}if(newPasswordScreen){newPasswordScreen.hidden=true;}if(appWorkspace){appWorkspace.hidden=true;}if(introSection){introSection.hidden=true;}if(appHeader){appHeader.hidden=true;}if(appFooter){appFooter.hidden=true;}globeScreen.classList.add("pv-active");initialiseMap();if(mapInitialized){loadInspectionMarkers();}startGPS();setTimeout(()=>{if(map){map.resize();}},500);}function onSignedOut(){authenticated=false;clearInspectionMarkers();savedPotholeLocations=[];proximityAlertStages.clear();if(proximityAlertElement){proximityAlertElement.hidden=true;}if(proximityAlertTimer!==null){window.clearTimeout(proximityAlertTimer);proximityAlertTimer=null;}stopGPS();if(globeScreen){globeScreen.classList.remove("pv-active");}const loginScreen=document.getElementById("loginScreen");const introSection=document.querySelector(".intro-section");const appHeader=document.querySelector(".app-header");const appFooter=document.querySelector(".app-footer");if(loginScreen){loginScreen.hidden=false;}if(introSection){introSection.hidden=false;}if(appHeader){appHeader.hidden=false;}if(appFooter){appFooter.hidden=false;}}window.addEventListener("potholevision:auth",onAuthenticated);window.addEventListener("potholevision:signout",onSignedOut);function checkExistingSession(){const user=window.PotholeVision?.currentUser;if(user){onAuthenticated({detail:{user:user}});}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",checkExistingSession,{once:true});}else{checkExistingSession();}window.PotholeVisionMap={startLocationTracking:startGPS,stopLocationTracking:stopGPS,getCurrentPosition:()=>currentPosition,getMap:()=>map,refreshInspectionMarkers:loadInspectionMarkers,getInspectionMarkerCount:()=>inspectionMarkers.size,getSavedPotholeLocationCount:()=>savedPotholeLocations.length,getProximitySettings:()=>({...PROXIMITY_CONFIG}),returnToMap:returnToMap,focusUser:()=>{if(currentPosition&&map){map.flyTo({center:[currentPosition.longitude,currentPosition.latitude],zoom:CONFIG.destinationZoom,pitch:CONFIG.destinationPitch,bearing:headingAvailable?currentHeading:map.getBearing(),duration:2000,essential:true});}}};})();