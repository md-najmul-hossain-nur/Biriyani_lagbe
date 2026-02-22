const gulshan2 = [23.7925, 90.4078];
const targetBounds = [
  [23.7605, 90.3905],
  [23.8485, 90.4655],
];
const apiBase = "/api/mosques";

const map = L.map("map", {
  zoomControl: true,
  minZoom: 12,
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
let locationSelectedAt = null;
let timerInterval = null;
const locationText = document.getElementById("locationText");
let popupLocation = null;

function isBiryaniServed(entry) {
  return entry.foodType === "biryani";
}

function foodTypeText(foodType) {
  if (foodType === "biryani") {
    return "Biryani";
  }

  if (foodType === "muri") {
    return "Muri";
  }

  return "No food";
}

function foodEmoji(foodType) {
  if (foodType === "biryani") {
    return "🍛";
  }

  if (foodType === "muri") {
    return "🥣";
  }

  return "🚫";
}

function markerColor(foodType) {
  if (foodType === "biryani") {
    return "#16a34a";
  }

  if (foodType === "muri") {
    return "#ea580c";
  }

  return "#dc2626";
}

function createIcon(foodType) {
  return L.divIcon({
    className: "food-marker",
    html: `<span style="font-size: 22px; filter: drop-shadow(0 1px 2px rgba(0,0,0,.25));">${foodEmoji(
      foodType
    )}</span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 22],
    popupAnchor: [0, -18],
  });
}

function clearAllMarkers() {
  markers.forEach((entry) => {
    entry.marker.removeFrom(map);
  });

  markers.length = 0;
}

function addMosqueEntry(entry) {
  const marker = L.marker([entry.lat, entry.lng], {
    icon: createIcon(entry.foodType),
  });

  const verifyCount = Number(entry.verifyCount || 0);

  marker.bindPopup(
    `<strong>${entry.name}</strong><br/>Food: ${foodEmoji(entry.foodType)} ${foodTypeText(
      entry.foodType
    )}<br/>Status: ${
      isBiryaniServed(entry) ? "Biryani দেয়" : "Biryani দেয় না"
    }<br/>Verify: ${verifyCount}<br/><button class="verify-btn" data-id="${
      entry.id || ""
    }">✅ সহমত</button>`
  );

  markers.push({ ...entry, verifyCount, marker });
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

function updateNearbyList() {
  const nearbyRange = Number(document.getElementById("nearbyRange").value);
  document.getElementById("nearbyRangeValue").textContent = String(nearbyRange);
  const nearbyList = document.getElementById("nearbyList");
  const nearbyHint = document.getElementById("nearbyHint");

  if (!selectedLocation) {
    nearbyHint.textContent = "Pick distance + click to see nearby food spots.";
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
    color: "#0f766e",
    fillColor: "#14b8a6",
    fillOpacity: 0.07,
    weight: 2,
  }).addTo(map);

  const nearby = markers
    .map((entry) => {
      const distanceKm = haversineDistanceKm(
        selectedLocation.lat,
        selectedLocation.lng,
        entry.lat,
        entry.lng
      );

      return { ...entry, distanceKm };
    })
    .filter((entry) => entry.distanceKm <= nearbyRange)
    .sort((left, right) => left.distanceKm - right.distanceKm);

  if (!nearby.length) {
    nearbyHint.textContent = `No mosque found within ${nearbyRange} km.`;
    nearbyList.innerHTML = "";
    return;
  }

  nearbyHint.textContent = `Found ${nearby.length} mosque(s) within ${nearbyRange} km.`;
  nearbyList.innerHTML = nearby
    .map(
      (entry) =>
        `<li>${foodEmoji(entry.foodType)} <strong>${entry.name}</strong><br/>${foodTypeText(
          entry.foodType
        )} • ${entry.distanceKm.toFixed(2)} km away<br/>Verify: ${
          Number(entry.verifyCount || 0)
        } <button class="verify-btn" data-id="${entry.id || ""}">✅ সহমত</button></li>`
    )
    .join("");
}

function updateLocationTimerText() {
  const geoTimer = document.getElementById("geoTimer");

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
  locationSelectedAt = Date.now();
  startLocationTimer();

  if (userLocationMarker) {
    userLocationMarker.removeFrom(map);
  }

  userLocationMarker = L.marker([selectedLocation.lat, selectedLocation.lng])
    .addTo(map)
    .bindPopup(sourceLabel);

  locationText.textContent = `Location: ${selectedLocation.lat}, ${selectedLocation.lng} (${sourceLabel})`;
  map.flyTo([selectedLocation.lat, selectedLocation.lng], 14);
  updateNearbyList();
}

function clearSelectedLocation() {
  selectedLocation = null;
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

  locationText.textContent = "Location: Not selected (click map to set, right-click to clear)";
  updateLocationTimerText();
  updateNearbyList();
}

function showAddPopup(lat, lng) {
  popupLocation = { lat, lng };

  const popupHtml = `
    <form id="mapAddForm" class="map-add-form">
      <strong>Add Mosque Here</strong>
      <input id="popupMosqueName" type="text" placeholder="Mosque name" required />
      <select id="popupFoodType" required>
        <option value="biryani">Biryani</option>
        <option value="muri">Muri</option>
        <option value="none">No food</option>
      </select>
      <button type="submit">Add to map</button>
    </form>
  `;

  L.popup({ closeButton: true, autoClose: true })
    .setLatLng([lat, lng])
    .setContent(popupHtml)
    .openOn(map);
}

async function loadMosquesFromApi() {
  const response = await fetch(apiBase);

  if (!response.ok) {
    let message = `Failed to fetch mosque list (${response.status})`;

    try {
      const payload = await response.json();
      if (typeof payload.message === "string" && payload.message.trim()) {
        message = payload.message;
      }
    } catch {
      // Ignore parse errors and keep fallback message.
    }

    throw new Error(message);
  }

  const data = await response.json();
  clearAllMarkers();

  data.forEach((entry) => {
    if (
      typeof entry.name === "string" &&
      typeof entry.lat === "number" &&
      typeof entry.lng === "number" &&
      ["biryani", "muri", "none"].includes(entry.foodType)
    ) {
      addMosqueEntry(entry);
    }
  });

  renderMarkers();
  updateNearbyList();
}

async function saveMosqueToApi(entry) {
  const response = await fetch(apiBase, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    let message = `Failed to save mosque (${response.status})`;

    try {
      const payload = await response.json();
      if (typeof payload.message === "string" && payload.message.trim()) {
        message = payload.message;
      }
    } catch {
      // Ignore parse errors and keep fallback message.
    }

    throw new Error(message);
  }

  return response.json();
}

async function verifyMosqueEntry(entryId) {
  const response = await fetch(`${apiBase}/${encodeURIComponent(entryId)}/verify`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to verify mosque");
  }

  return response.json();
}

function renderMarkers() {
  const showServe = document.getElementById("showServe").checked;
  const showNoServe = document.getElementById("showNoServe").checked;

  markers.forEach((entry) => {
    const shouldShow =
      (isBiryaniServed(entry) && showServe) ||
      (!isBiryaniServed(entry) && showNoServe);

    if (shouldShow) {
      entry.marker.addTo(map);
    } else {
      entry.marker.removeFrom(map);
    }
  });
}

document.getElementById("showServe").addEventListener("change", renderMarkers);
document
  .getElementById("showNoServe")
  .addEventListener("change", renderMarkers);

map.on("click", (event) => {
  const { lat, lng } = event.latlng;
  setSelectedLocation(lat, lng, "picked from map");
  showAddPopup(lat, lng);
});

map.on("contextmenu", () => {
  clearSelectedLocation();
});

document.getElementById("nearbyRange").addEventListener("input", updateNearbyList);
document.getElementById("findNearbyBtn").addEventListener("click", () => {
  if (!navigator.geolocation) {
    locationText.textContent = "Location: Geolocation not supported";
    return;
  }

  locationText.textContent = "Location: Fetching...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      setSelectedLocation(
        position.coords.latitude,
        position.coords.longitude,
        "from device GPS"
      );
    },
    () => {
      locationText.textContent = "Location: Permission denied or unavailable";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

document.addEventListener("submit", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLFormElement) || target.id !== "mapAddForm") {
    return;
  }

  event.preventDefault();

  if (!popupLocation) {
    locationText.textContent = "Location: Click map again and retry";
    return;
  }

  const nameInput = document.getElementById("popupMosqueName");
  const foodTypeInput = document.getElementById("popupFoodType");

  if (!(nameInput instanceof HTMLInputElement) || !(foodTypeInput instanceof HTMLSelectElement)) {
    return;
  }

  const name = nameInput.value.trim();
  const foodType = foodTypeInput.value;

  if (!name) {
    return;
  }

  saveMosqueToApi({
    name,
    lat: Number(popupLocation.lat.toFixed(6)),
    lng: Number(popupLocation.lng.toFixed(6)),
    foodType,
  })
    .then(() => loadMosquesFromApi())
    .then(() => {
      locationText.textContent = "Saved from map click location";
      map.closePopup();
    })
    .catch((error) => {
      if (error instanceof TypeError) {
        locationText.textContent =
          "Save failed: Python server off. Run 'python app.py' first.";
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

  if (!target.classList.contains("verify-btn")) {
    return;
  }

  const entryId = target.dataset.id;

  if (!entryId) {
    return;
  }

  target.setAttribute("disabled", "true");
  verifyMosqueEntry(entryId)
    .then(() => loadMosquesFromApi())
    .catch(() => {
      document.getElementById("nearbyHint").textContent = "Verification failed. Try again.";
    })
    .finally(() => {
      target.removeAttribute("disabled");
    });
});

loadMosquesFromApi().catch(() => {
  document.getElementById("nearbyHint").textContent =
    "Could not load server data. Run 'python app.py' and reload.";
});

updateLocationTimerText();
