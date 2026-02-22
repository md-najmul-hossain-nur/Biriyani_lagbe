const targetBounds = [
  [23.7605, 90.3905],
  [23.8485, 90.4655],
];
const apiBase = "/api/mosques";

const map = L.map("map", {
  zoomControl: true,
  minZoom: 7,
  maxZoom: 18,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
}).addTo(map);
map.fitBounds(targetBounds, { padding: [20, 20] });

const markers = [];
let selectedLocation = null;
let userLocationMarker = null;
let nearbyCircle = null;
let routeLine = null;
let focusedMosqueId = null;
let popupLocation = null;
let locationSelectedAt = null;
let timerInterval = null;

const showServeInput = document.getElementById("showServe");
const showNoServeInput = document.getElementById("showNoServe");
const showJilapiInput = document.getElementById("showJilapi");
const calendarDateInput = document.getElementById("calendarDate");
const searchTextInput = document.getElementById("searchText");
const quickFoodInput = document.getElementById("quickFood");
const nearbyRangeInput = document.getElementById("nearbyRange");
const nearbyRangeValue = document.getElementById("nearbyRangeValue");
const nearbyHint = document.getElementById("nearbyHint");
const nearbyList = document.getElementById("nearbyList");
const locationText = document.getElementById("locationText");
const geoTimer = document.getElementById("geoTimer");
const findNearbyBtn = document.getElementById("findNearbyBtn");
const showAllBtn = document.getElementById("showAllBtn");
const clearRouteBtn = document.getElementById("clearRouteBtn");
const todayBtn = document.getElementById("todayBtn");
const divisionSelect = document.getElementById("divisionSelect");
const heroQuote = document.getElementById("heroQuote");
const countBiryani = document.getElementById("countBiryani");
const countMuri = document.getElementById("countMuri");
const countJilapi = document.getElementById("countJilapi");
const countNoFood = document.getElementById("countNoFood");
const countAgree = document.getElementById("countAgree");
const countDisagree = document.getElementById("countDisagree");

const divisionMapView = {
  dhaka: { lat: 23.8103, lng: 90.4125, zoom: 10 },
  chattogram: { lat: 22.3569, lng: 91.7832, zoom: 10 },
  rajshahi: { lat: 24.3745, lng: 88.6042, zoom: 10 },
  khulna: { lat: 22.8456, lng: 89.5403, zoom: 10 },
  barishal: { lat: 22.701, lng: 90.3535, zoom: 10 },
  sylhet: { lat: 24.8949, lng: 91.8687, zoom: 10 },
  rangpur: { lat: 25.7439, lng: 89.2752, zoom: 10 },
  mymensingh: { lat: 24.7471, lng: 90.4203, zoom: 10 },
};

const divisionBounds = {
  dhaka: [[23.1, 89.9], [24.8, 91.8]],
  chattogram: [[20.6, 91.0], [23.3, 92.8]],
  rajshahi: [[23.7, 88.0], [25.3, 89.3]],
  khulna: [[21.3, 88.8], [23.2, 90.0]],
  barishal: [[21.7, 89.7], [23.0, 91.2]],
  sylhet: [[24.3, 91.3], [25.4, 92.6]],
  rangpur: [[25.0, 88.7], [26.4, 89.9]],
  mymensingh: [[24.1, 89.7], [25.2, 91.2]],
};

const prayerQuotes = [
  "নামাজ মুমিনের মেরুদণ্ড।",
  "নামাজ হৃদয়ের শান্তি ও আত্মার প্রশান্তি।",
  "নামাজ মানুষকে অন্যায় থেকে বিরত রাখে।",
  "দুনিয়ার ব্যস্ততায়ও নামাজ যেন না ভুলে যাই।",
  "পাঁচ ওয়াক্ত নামাজ—সাফল্যের চাবিকাঠি।",
  "নামাজই আল্লাহর সাথে বান্দার সরাসরি যোগাযোগ।",
  "যে নামাজকে ধরে রাখে, আল্লাহ তাকে সম্মানিত করেন।",
  "নামাজ জীবনের শৃঙ্খলা শেখায়।",
  "কষ্টের সময় নামাজ, সুখের সময় শোকর।",
  "নামাজে আছে মুক্তি, শান্তি ও বরকত।",
];

let quoteIndex = Math.floor(Math.random() * prayerQuotes.length);

function setRandomPrayerQuote() {
  if (!heroQuote || !prayerQuotes.length) {
    return;
  }

  heroQuote.textContent = prayerQuotes[quoteIndex];
}

function rotatePrayerQuote() {
  if (!heroQuote || !prayerQuotes.length) {
    return;
  }

  quoteIndex = (quoteIndex + 1) % prayerQuotes.length;
  heroQuote.textContent = prayerQuotes[quoteIndex];
}

function isPointInBounds(lat, lng, bounds) {
  const [[south, west], [north, east]] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

function matchesDivisionFilter(entry) {
  if (!divisionSelect || !divisionSelect.value) {
    return true;
  }

  const bounds = divisionBounds[divisionSelect.value];
  if (!bounds) {
    return true;
  }

  return isPointInBounds(entry.lat, entry.lng, bounds);
}

function matchesFoodToggle(entry) {
  if (entry.foodType === "biryani") {
    return showServeInput.checked;
  }

  if (entry.foodType === "jilapi") {
    return showJilapiInput ? showJilapiInput.checked : true;
  }

  return showNoServeInput.checked;
}

function entryMatchesCurrentFilters(entry) {
  if (focusedMosqueId && entry.id !== focusedMosqueId) {
    return false;
  }

  if (!matchesDivisionFilter(entry)) {
    return false;
  }

  if (!matchesFoodToggle(entry)) {
    return false;
  }

  if (selectedLocation) {
    const nearbyRange = Number(nearbyRangeInput.value);
    const distanceKm = haversineDistanceKm(
      selectedLocation.lat,
      selectedLocation.lng,
      entry.lat,
      entry.lng
    );

    if (distanceKm > nearbyRange) {
      return false;
    }
  }

  return true;
}

function updateCounts() {
  const visibleEntries = markers.filter((entry) => entryMatchesCurrentFilters(entry));

  const biryaniTotal = visibleEntries.filter((entry) => entry.foodType === "biryani").length;
  const muriTotal = visibleEntries.filter((entry) => entry.foodType === "muri").length;
  const jilapiTotal = visibleEntries.filter((entry) => entry.foodType === "jilapi").length;
  const noFoodTotal = visibleEntries.filter((entry) => entry.foodType === "none").length;

  const agreeTotal = visibleEntries.reduce((sum, entry) => sum + Number(entry.verifyCount || 0), 0);
  const disagreeTotal = visibleEntries.reduce((sum, entry) => sum + Number(entry.disagreeCount || 0), 0);

  if (countBiryani) countBiryani.textContent = String(biryaniTotal);
  if (countMuri) countMuri.textContent = String(muriTotal);
  if (countJilapi) countJilapi.textContent = String(jilapiTotal);
  if (countNoFood) countNoFood.textContent = String(noFoodTotal);
  if (countAgree) countAgree.textContent = String(agreeTotal);
  if (countDisagree) countDisagree.textContent = String(disagreeTotal);
}

function getTodayDateString() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getClientId() {
  const key = "biryani-client-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const created = `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  localStorage.setItem(key, created);
  return created;
}

if (!calendarDateInput.value) {
  calendarDateInput.value = getTodayDateString();
}

function foodEmoji(foodType) {
  if (foodType === "biryani") return "🍛";
  if (foodType === "muri") return "🥣";
  if (foodType === "jilapi") return "🥨";
  return "🚫";
}

function foodTypeText(foodType) {
  if (foodType === "biryani") return "Biryani";
  if (foodType === "muri") return "Muri";
  if (foodType === "jilapi") return "Jilapi";
  return "No food";
}

function prayerSlotText(prayerSlot) {
  if (prayerSlot === "juma" || prayerSlot === "johor") return "Jumu'ah / Zuhr";
  if (prayerSlot === "asor") return "Asr";
  if (prayerSlot === "magrib") return "Maghrib";
  if (prayerSlot === "esha") return "Isha";
  return "Not specified";
}

function createIcon(foodType) {
  return L.divIcon({
    className: "food-marker",
    html: `<span style="font-size: 28px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25));">${foodEmoji(
      foodType
    )}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 28],
    popupAnchor: [0, -20],
  });
}

function trustBadge(score) {
  if (score >= 80) return "High trust";
  if (score >= 50) return "Medium trust";
  return "Low trust";
}

function formatTimeWindow(entry) {
  if (entry.prayerSlot) {
    return prayerSlotText(entry.prayerSlot);
  }

  if (entry.startTime && entry.endTime) {
    return `${entry.startTime} - ${entry.endTime}`;
  }

  if (entry.startTime) {
    return `From ${entry.startTime}`;
  }

  if (entry.endTime) {
    return `Until ${entry.endTime}`;
  }

  return "Not specified";
}

function clearAllMarkers() {
  markers.forEach((entry) => entry.marker.removeFrom(map));
  markers.length = 0;
}

function clearRouteLine() {
  if (routeLine) {
    routeLine.removeFrom(map);
    routeLine = null;
  }
}

function haversineDistanceKm(fromLat, fromLng, toLat, toLng) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371;

  const latDiff = toRad(toLat - fromLat);
  const lngDiff = toRad(toLng - fromLng);

  const haversineValue =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(toRad(fromLat)) *
      Math.cos(toRad(toLat)) *
      Math.sin(lngDiff / 2) *
      Math.sin(lngDiff / 2);

  const angularDistance =
    2 * Math.atan2(Math.sqrt(haversineValue), Math.sqrt(1 - haversineValue));

  return earthRadius * angularDistance;
}

function updateLocationTimerText() {
  if (!locationSelectedAt) {
    geoTimer.textContent = "Location age: --";
    return;
  }

  const secondsAgo = Math.max(0, Math.floor((Date.now() - locationSelectedAt) / 1000));
  geoTimer.textContent = `Location age: ${secondsAgo}s ago`;
}

function startLocationTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  updateLocationTimerText();
  timerInterval = setInterval(updateLocationTimerText, 1000);
}

function setSelectedLocation(lat, lng, sourceLabel) {
  selectedLocation = {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };

  if (userLocationMarker) {
    userLocationMarker.removeFrom(map);
  }

  userLocationMarker = L.marker([selectedLocation.lat, selectedLocation.lng])
    .addTo(map)
    .bindPopup(sourceLabel);

  locationSelectedAt = Date.now();
  startLocationTimer();

  locationText.textContent = `Location: ${selectedLocation.lat}, ${selectedLocation.lng} (${sourceLabel})`;
  map.flyTo([selectedLocation.lat, selectedLocation.lng], 14);

  renderMarkers();
  updateNearbyList();
}

function clearSelectedLocation() {
  selectedLocation = null;
  focusedMosqueId = null;
  locationSelectedAt = null;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (userLocationMarker) {
    userLocationMarker.removeFrom(map);
    userLocationMarker = null;
  }

  if (nearbyCircle) {
    nearbyCircle.removeFrom(map);
    nearbyCircle = null;
  }

  clearRouteLine();
  locationText.textContent = "Location: map-এ click করে set করুন (right-click এ clear)";
  updateLocationTimerText();
  renderMarkers();
  updateNearbyList();
}

function addMosqueEntry(entry) {
  const existingIndex = markers.findIndex((item) => item.id === entry.id);
  if (existingIndex !== -1) {
    markers[existingIndex].marker.removeFrom(map);
    markers.splice(existingIndex, 1);
  }

  const marker = L.marker([entry.lat, entry.lng], {
    icon: createIcon(entry.foodType),
  });

  const entryId = entry.id || `${entry.name}-${entry.lat}-${entry.lng}`;
  const proofRow = entry.proofImage
    ? `<br/>Proof: <a href="${entry.proofImage}" target="_blank" rel="noopener noreferrer">View photo</a>`
    : "";
  const disagreeCount = Number(entry.disagreeCount || 0);

  marker.bindPopup(
    `<strong>${entry.name}</strong><br/>Food: ${foodEmoji(entry.foodType)} ${foodTypeText(
      entry.foodType
    )}<br/>Time: ${formatTimeWindow(entry)}<br/>Trust: ${entry.trustScore} (${trustBadge(
      entry.trustScore
    )})<br/>Votes: ✅ ${entry.verifyCount} | ❌ ${disagreeCount}${proofRow}<br/><button class="route-btn" data-lat="${
      entry.lat
    }" data-lng="${entry.lng}" data-name="${entry.name}">🧭 Show route</button> <button class="verify-btn" data-id="${
      entryId
    }">✅ সহমত</button> <button class="disagree-btn" data-id="${entryId}">❌ অসহমত</button>`
  );

  marker.on("click", () => {
    focusedMosqueId = entryId;
    locationText.textContent = `${entry.name} focus mode চালু হয়েছে। সব দেখতে 'সব mosque আবার দেখাও' চাপুন।`;
    renderMarkers();
  });

  markers.push({ ...entry, id: entryId, marker });
}

function renderMarkers() {
  markers.forEach((entry) => {
    if (!entryMatchesCurrentFilters(entry)) {
      entry.marker.removeFrom(map);
      return;
    }

    if (!map.hasLayer(entry.marker)) {
      entry.marker.addTo(map);
    }
  });

  updateCounts();
}

function updateNearbyList() {
  const nearbyRange = Number(nearbyRangeInput.value);
  nearbyRangeValue.textContent = String(nearbyRange);

  if (!selectedLocation) {
    nearbyHint.textContent = "Distance select করে nearby mosque list দেখুন।";
    nearbyList.innerHTML = "";

    if (nearbyCircle) {
      nearbyCircle.removeFrom(map);
      nearbyCircle = null;
    }
    return;
  }

  if (nearbyCircle) {
    nearbyCircle.removeFrom(map);
  }

  nearbyCircle = L.circle([selectedLocation.lat, selectedLocation.lng], {
    radius: nearbyRange * 1000,
    color: "#dc2626",
    fillColor: "#fb7185",
    fillOpacity: 0.18,
    weight: 3,
    dashArray: "6 4",
  }).addTo(map);
  nearbyCircle.bringToFront();

  const nearby = markers
    .filter((entry) => matchesDivisionFilter(entry))
    .filter((entry) => matchesFoodToggle(entry))
    .map((entry) => ({
      ...entry,
      distanceKm: haversineDistanceKm(
        selectedLocation.lat,
        selectedLocation.lng,
        entry.lat,
        entry.lng
      ),
    }))
    .filter((entry) => entry.distanceKm <= nearbyRange)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (!nearby.length) {
    nearbyHint.textContent = `${nearbyRange} km এর মধ্যে কোনো mosque পাওয়া যায়নি।`;
    nearbyList.innerHTML = "";
    return;
  }

  nearbyHint.textContent = `${nearbyRange} km এর মধ্যে ${nearby.length} টি mosque পাওয়া গেছে।`;

  nearbyList.innerHTML = nearby
    .map(
      (entry) => {
        const disagreeCount = Number(entry.disagreeCount || 0);
        return (
        `<li>${foodEmoji(entry.foodType)} <strong>${entry.name}</strong><br/>${foodTypeText(
          entry.foodType
        )} • ${entry.distanceKm.toFixed(2)} km away<br/>Time: ${formatTimeWindow(
          entry
        )}<br/>Trust: ${entry.trustScore} (${trustBadge(
          entry.trustScore
        )})<br/>Votes: ✅ ${entry.verifyCount} | ❌ ${disagreeCount}<br/><button class="route-btn" data-lat="${entry.lat}" data-lng="${entry.lng}" data-name="${
          entry.name
        }">🧭 Show route</button> <button class="verify-btn" data-id="${
          entry.id
        }">✅ সহমত</button> <button class="disagree-btn" data-id="${entry.id}">❌ অসহমত</button></li>`
        );
      }
    )
    .join("");
}

function getCurrentLocationIfNeeded() {
  if (selectedLocation) {
    return Promise.resolve(selectedLocation);
  }

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setSelectedLocation(
          position.coords.latitude,
          position.coords.longitude,
          "from device GPS"
        );
        resolve(selectedLocation);
      },
      () => reject(new Error("Location permission denied")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

function getDeviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => {
        if (error && error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission denied. Browser/site settings থেকে location Allow করুন"));
          return;
        }

        if (error && error.code === error.TIMEOUT) {
          reject(new Error("Location request timed out"));
          return;
        }

        reject(new Error("Location unavailable"));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function zoomToSearchMatch() {
  const term = searchTextInput.value.trim().toLowerCase();
  if (!term) {
    return;
  }

  const exactMatch = markers.find(
    (entry) => typeof entry.name === "string" && entry.name.toLowerCase() === term
  );
  const partialMatch = markers.find(
    (entry) => typeof entry.name === "string" && entry.name.toLowerCase().includes(term)
  );
  const found = exactMatch || partialMatch;

  if (!found) {
    return;
  }

  if (!map.hasLayer(found.marker)) {
    found.marker.addTo(map);
  }

  map.flyTo([found.lat, found.lng], 16);
  found.marker.openPopup();
}

async function drawShortestRoute(toLat, toLng, placeName) {
  clearRouteLine();

  const from = await getCurrentLocationIfNeeded();
  const routeUrl =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${toLng},${toLat}?overview=full&geometries=geojson`;

  const response = await fetch(routeUrl);
  if (!response.ok) {
    throw new Error("Route server unavailable");
  }

  const payload = await response.json();
  if (!payload.routes || !payload.routes.length) {
    throw new Error("No route found");
  }

  const bestRoute = payload.routes[0];
  routeLine = L.geoJSON(bestRoute.geometry, {
    style: {
      color: "#2563eb",
      weight: 5,
      opacity: 0.9,
    },
  }).addTo(map);

  map.fitBounds(routeLine.getBounds(), { padding: [35, 35] });

  const distanceKm = bestRoute.distance / 1000;
  const durationMin = bestRoute.duration / 60;
  locationText.textContent = `Route ready: ${placeName} পর্যন্ত ${distanceKm.toFixed(
    2
  )} km, সময় প্রায় ${durationMin.toFixed(0)} min`;
}

function openAddPopup(lat, lng) {
  popupLocation = { lat, lng };

  const popupHtml = `
    <form id="mapAddForm" class="map-add-form" enctype="multipart/form-data">
      <strong>Add Mosque Here</strong>
      <input id="popupMosqueName" type="text" placeholder="Mosque name" required />
      <select id="popupFoodType" required>
        <option value="biryani">Biryani</option>
        <option value="muri">Muri</option>
        <option value="jilapi">Jilapi</option>
        <option value="none">No food</option>
      </select>
      <select id="popupPrayerSlot" required>
        <option value="juma">Jumu'ah / Zuhr</option>
        <option value="asor">Asr</option>
        <option value="magrib">Maghrib</option>
        <option value="esha">Isha</option>
      </select>
      <button type="submit">Add to map</button>
    </form>
  `;

  L.popup({ closeButton: true, autoClose: true })
    .setLatLng([lat, lng])
    .setContent(popupHtml)
    .openOn(map);
}

function createMosquePayloadFromPopup() {
  const nameInput = document.getElementById("popupMosqueName");
  const foodTypeInput = document.getElementById("popupFoodType");
  const prayerSlotInput = document.getElementById("popupPrayerSlot");

  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(foodTypeInput instanceof HTMLSelectElement) ||
    !(prayerSlotInput instanceof HTMLSelectElement)
  ) {
    return null;
  }

  const name = nameInput.value.trim();
  const foodType = foodTypeInput.value;
  const prayerSlot = prayerSlotInput.value;

  if (!name || !popupLocation || !prayerSlot) {
    return null;
  }

  const formData = new FormData();
  formData.append("name", name);
  formData.append("lat", String(Number(popupLocation.lat.toFixed(6))));
  formData.append("lng", String(Number(popupLocation.lng.toFixed(6))));
  formData.append("foodType", foodType);
  formData.append("prayerSlot", prayerSlot);
  formData.append("eventDate", calendarDateInput.value || getTodayDateString());

  return formData;
}

async function loadMosquesFromApi() {
  const selectedDate = calendarDateInput.value || getTodayDateString();
  const q = searchTextInput.value.trim();
  const quickFood = quickFoodInput.value;

  const params = new URLSearchParams({
    date: selectedDate,
    quickFood,
  });

  if (q) {
    params.set("q", q);
  }

  const response = await fetch(`${apiBase}?${params.toString()}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    let message = `Failed to fetch mosque list (${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  clearAllMarkers();

  data.forEach((entry) => {
    if (
      typeof entry.name === "string" &&
      typeof entry.lat === "number" &&
      typeof entry.lng === "number"
    ) {
      addMosqueEntry(entry);
    }
  });

  renderMarkers();
  updateNearbyList();
}

async function saveMosqueToApi(formData) {
  const response = await fetch(apiBase, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = `Failed to save mosque (${response.status})`;
    try {
      const payload = await response.json();
      if (typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json();
}

async function verifyMosqueEntry(entryId) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(entryId)}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": getClientId(),
    },
    body: JSON.stringify({ clientId: getClientId() }),
  });

  if (!response.ok) {
    let message = "Failed to verify mosque";
    try {
      const payload = await response.json();
      if (typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json();
}

async function disagreeMosqueEntry(entryId) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(entryId)}/disagree`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": getClientId(),
    },
    body: JSON.stringify({ clientId: getClientId() }),
  });

  if (!response.ok) {
    let message = "Failed to submit disagreement";
    try {
      const payload = await response.json();
      if (typeof payload.message === "string") {
        message = payload.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return response.json();
}

showServeInput.addEventListener("change", renderMarkers);
showNoServeInput.addEventListener("change", renderMarkers);
if (showJilapiInput) {
  showJilapiInput.addEventListener("change", renderMarkers);
}
nearbyRangeInput.addEventListener("input", () => {
  renderMarkers();
  updateNearbyList();
});

calendarDateInput.addEventListener("change", () => {
  focusedMosqueId = null;
  clearRouteLine();
  loadMosquesFromApi().catch((error) => {
    nearbyHint.textContent = error.message;
  });
});

searchTextInput.addEventListener("input", () => {
  focusedMosqueId = null;
  loadMosquesFromApi()
    .then(() => {
      zoomToSearchMatch();
    })
    .catch((error) => {
      nearbyHint.textContent = error.message;
    });
});

quickFoodInput.addEventListener("change", () => {
  focusedMosqueId = null;
  loadMosquesFromApi().catch((error) => {
    nearbyHint.textContent = error.message;
  });
});

if (divisionSelect) {
  divisionSelect.addEventListener("change", () => {
    const key = divisionSelect.value;
    if (!key || !divisionMapView[key]) {
      renderMarkers();
      updateNearbyList();
      return;
    }

    const target = divisionMapView[key];
    map.flyTo([target.lat, target.lng], target.zoom);
    locationText.textContent = `Map moved to ${key} division.`;
    focusedMosqueId = null;
    clearRouteLine();
    renderMarkers();
    updateNearbyList();
  });
}

findNearbyBtn.addEventListener("click", () => {
  findNearbyBtn.setAttribute("disabled", "true");
  locationText.textContent = "Location: Fetching...";

  getDeviceLocation()
    .then((position) => {
      setSelectedLocation(
        position.coords.latitude,
        position.coords.longitude,
        "from device GPS"
      );
    })
    .catch((error) => {
      locationText.textContent = `Location: ${error.message}`;
    })
    .finally(() => {
      findNearbyBtn.removeAttribute("disabled");
    });
});

showAllBtn.addEventListener("click", () => {
  focusedMosqueId = null;
  clearRouteLine();
  renderMarkers();
  locationText.textContent = "সব mosque আবার দেখানো হচ্ছে।";
});

clearRouteBtn.addEventListener("click", () => {
  clearRouteLine();
  locationText.textContent = "Route cleared.";
});

todayBtn.addEventListener("click", () => {
  calendarDateInput.value = getTodayDateString();
  focusedMosqueId = null;
  loadMosquesFromApi().catch((error) => {
    nearbyHint.textContent = error.message;
  });
});

map.on("click", (event) => {
  focusedMosqueId = null;
  clearRouteLine();
  locationText.textContent = "Nearby শুধু আপনার GPS location থেকে দেখাবে।";
  openAddPopup(event.latlng.lat, event.latlng.lng);
});

map.on("contextmenu", () => {
  clearSelectedLocation();
});

document.addEventListener("submit", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLFormElement) || target.id !== "mapAddForm") {
    return;
  }

  event.preventDefault();
  const formData = createMosquePayloadFromPopup();

  if (!formData) {
    locationText.textContent = "Invalid form input.";
    return;
  }

  saveMosqueToApi(formData)
    .then((createdEntry) => {
      addMosqueEntry(createdEntry);
      renderMarkers();
      updateNearbyList();
      if (createdEntry && Number.isFinite(createdEntry.lat) && Number.isFinite(createdEntry.lng)) {
        map.flyTo([createdEntry.lat, createdEntry.lng], 15);
      }
      locationText.textContent = "নতুন mosque map-এ যোগ হয়েছে।";
      map.closePopup();
    })
    .catch((error) => {
      if (error instanceof TypeError) {
        locationText.textContent = "Save failed: Python server off. Run 'python app.py' first.";
        return;
      }

      locationText.textContent = `Save failed: ${error.message}`;
    });
});

document.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.classList.contains("verify-btn")) {
    const entryId = target.dataset.id;
    if (!entryId) return;

    target.setAttribute("disabled", "true");
    verifyMosqueEntry(entryId)
      .then(() => loadMosquesFromApi())
      .catch((error) => {
        locationText.textContent = error.message;
      })
      .finally(() => {
        target.removeAttribute("disabled");
      });
    return;
  }

  if (target.classList.contains("disagree-btn")) {
    const entryId = target.dataset.id;
    if (!entryId) return;

    target.setAttribute("disabled", "true");
    disagreeMosqueEntry(entryId)
      .then(() => loadMosquesFromApi())
      .catch((error) => {
        locationText.textContent = error.message;
      })
      .finally(() => {
        target.removeAttribute("disabled");
      });
    return;
  }

  if (target.classList.contains("route-btn")) {
    const targetLat = Number(target.dataset.lat);
    const targetLng = Number(target.dataset.lng);
    const placeName = target.dataset.name || "mosque";

    if (!Number.isFinite(targetLat) || !Number.isFinite(targetLng)) {
      return;
    }

    target.setAttribute("disabled", "true");
    drawShortestRoute(targetLat, targetLng, placeName)
      .catch((error) => {
        locationText.textContent = `Route failed: ${error.message}`;
      })
      .finally(() => {
        target.removeAttribute("disabled");
      });
    return;
  }

});

function focusFromQueryParam() {
  const url = new URL(window.location.href);
  const mosqueId = url.searchParams.get("mosque");

  if (!mosqueId) {
    return;
  }

  const found = markers.find((item) => item.id === mosqueId);
  if (!found) {
    return;
  }

  focusedMosqueId = found.id;
  renderMarkers();
  map.flyTo([found.lat, found.lng], 15);
  found.marker.openPopup();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Ignore registration issues for now.
  });
}

loadMosquesFromApi()
  .then(() => {
    focusFromQueryParam();
  })
  .catch((error) => {
    nearbyHint.textContent = error.message || "Load failed";
  });

updateLocationTimerText();
setRandomPrayerQuote();
setInterval(rotatePrayerQuote, 7000);
registerServiceWorker();
