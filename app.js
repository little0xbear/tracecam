// TraceCam 📍 - GPS Camera for Traceability
// Built by Little Bear 🧸

// State
const state = {
  stream: null,
  facingMode: 'environment',
  position: null,
  photos: [],
  logs: [],
  sessionId: generateSessionId(),
  settings: {
    watermarkEnabled: false,
    coordsOnImage: true,
    timestampOnImage: true,
    autoSave: true,
    projectName: '',
    operatorName: ''
  },
  currentPreview: null,
  detailsExpanded: false
};

// Storage keys
const PHOTOS_KEY = 'tracecam-photos';
const LOGS_KEY = 'tracecam-logs';
const SETTINGS_KEY = 'tracecam-settings';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadPhotos();
  loadLogs();
  initCamera();
  initGeolocation();
  updateLiveTime();
  setInterval(updateLiveTime, 1000);
  updateDeviceInfo();
  updateSessionId();
  
  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLogs();
      closeGallery();
      closeSettings();
      closePreview();
    }
    if (e.key === ' ' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      capturePhoto();
    }
  });
});

// Generate session ID
function generateSessionId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TC-${timestamp}-${random}`;
}

// Update status display
function updateStatus(text, type = 'loading') {
  const statusText = document.getElementById('statusText');
  const statusDot = document.getElementById('statusDot');
  
  statusText.textContent = text;
  statusDot.className = 'w-1.5 h-1.5 rounded-full status-dot ' + 
    (type === 'ready' ? 'bg-green-500' : 
     type === 'error' ? 'bg-red-500' : 'bg-yellow-500');
}

// Update live time display
function updateLiveTime() {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  
  document.getElementById('liveTime').textContent = now.toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  document.getElementById('liveTimeUTC').textContent = 'UTC ' + now.toISOString().replace('T', ' ').substring(0, 19);
  document.getElementById('timezoneBadge').textContent = timezone.split('/').pop().replace('_', ' ');
}

// Initialize camera
async function initCamera() {
  try {
    updateStatus('Starting camera...', 'loading');
    
    const constraints = {
      video: {
        facingMode: state.facingMode,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };
    
    if (state.stream) {
      state.stream.getTracks().forEach(track => track.stop());
    }
    
    state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    const video = document.getElementById('videoElement');
    video.srcObject = state.stream;
    
    video.onloadedmetadata = () => {
      document.getElementById('noCameraFallback').classList.add('hidden');
      updateStatus('Camera ready', 'ready');
      showToast('Camera initialized', 'success');
    };
    
  } catch (error) {
    console.error('Camera error:', error);
    updateStatus('Camera unavailable', 'error');
    document.getElementById('noCameraFallback').classList.remove('hidden');
    
    if (error.name === 'NotAllowedError') {
      showToast('Camera permission denied', 'error');
    } else if (error.name === 'NotFoundError') {
      showToast('No camera found', 'error');
    } else {
      showToast('Camera error: ' + error.message, 'error');
    }
  }
}

// Switch camera
async function switchCamera() {
  state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
  await initCamera();
  showToast(`Switched to ${state.facingMode === 'environment' ? 'back' : 'front'} camera`);
}

// Initialize geolocation
function initGeolocation() {
  if (!navigator.geolocation) {
    document.getElementById('gpsText').textContent = 'GPS not supported';
    document.getElementById('coordsText').textContent = '—';
    return;
  }
  
  const options = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 5000
  };
  
  navigator.geolocation.watchPosition(
    updatePosition,
    handleGeoError,
    options
  );
}

// Update position
function updatePosition(position) {
  state.position = position;
  
  const { latitude, longitude, accuracy, altitude } = position.coords;
  
  // Update camera overlay
  document.getElementById('gpsStatus').className = 'w-2 h-2 bg-green-500 rounded-full';
  document.getElementById('gpsText').textContent = 'GPS locked';
  document.getElementById('coordsText').textContent = 
    `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  
  // Update details panel
  document.getElementById('latitude').textContent = latitude.toFixed(6) + '°';
  document.getElementById('longitude').textContent = longitude.toFixed(6) + '°';
  document.getElementById('accuracy').textContent = 
    accuracy ? `±${accuracy.toFixed(1)}m` : 'N/A';
  document.getElementById('altitude').textContent = 
    altitude ? `${altitude.toFixed(1)}m` : 'N/A';
  
  // Reverse geocode for address
  reverseGeocode(latitude, longitude);
}

// Handle geolocation error
function handleGeoError(error) {
  console.error('Geolocation error:', error);
  
  document.getElementById('gpsStatus').className = 'w-2 h-2 bg-yellow-500 rounded-full';
  document.getElementById('coordsText').textContent = 'Location unavailable';
  
  switch(error.code) {
    case error.PERMISSION_DENIED:
      document.getElementById('gpsText').textContent = 'GPS denied';
      break;
    case error.POSITION_UNAVAILABLE:
      document.getElementById('gpsText').textContent = 'GPS unavailable';
      break;
    case error.TIMEOUT:
      document.getElementById('gpsText').textContent = 'GPS timeout';
      break;
    default:
      document.getElementById('gpsText').textContent = 'GPS error';
  }
  
  document.getElementById('latitude').textContent = '—';
  document.getElementById('longitude').textContent = '—';
  document.getElementById('accuracy').textContent = '—';
  document.getElementById('altitude').textContent = '—';
}

// Reverse geocode
let geocodeTimeout = null;
function reverseGeocode(lat, lng) {
  clearTimeout(geocodeTimeout);
  geocodeTimeout = setTimeout(async () => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await response.json();
      
      if (data.display_name) {
        document.getElementById('address').textContent = data.display_name;
      }
    } catch (error) {
      document.getElementById('address').textContent = 'Address unavailable';
    }
  }, 1000);
}

// Capture photo
async function capturePhoto() {
  if (!state.stream) {
    showToast('Camera not ready', 'error');
    return;
  }
  
  const video = document.getElementById('videoElement');
  const canvas = document.getElementById('captureCanvas');
  const ctx = canvas.getContext('2d');
  
  // Set canvas size to video size
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;
  
  // Draw video frame
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  // Add overlay if enabled
  if (state.settings.timestampOnImage || state.settings.coordsOnImage) {
    addMetadataOverlay(ctx, canvas.width, canvas.height);
  }
  
  // Flash effect
  const flash = document.getElementById('flashOverlay');
  flash.classList.add('capture-flash');
  flash.style.opacity = '0.8';
  setTimeout(() => {
    flash.style.opacity = '0';
    flash.classList.remove('capture-flash');
  }, 200);
  
  // Get image data
  const imageData = canvas.toDataURL('image/jpeg', 0.92);
  
  // Create photo record
  const photo = {
    id: generatePhotoId(),
    sessionId: state.sessionId,
    imageData,
    timestamp: new Date().toISOString(),
    timestampLocal: new Date().toLocaleString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    location: state.position ? {
      latitude: state.position.coords.latitude,
      longitude: state.position.coords.longitude,
      accuracy: state.position.coords.accuracy,
      altitude: state.position.coords.altitude,
      heading: state.position.coords.heading,
      speed: state.position.coords.speed
    } : null,
    address: document.getElementById('address').textContent,
    device: getDeviceInfo(),
    settings: { ...state.settings },
    projectName: state.settings.projectName,
    operatorName: state.settings.operatorName
  };
  
  // Save photo
  state.photos.unshift(photo);
  savePhotos();
  
  // Add log entry
  addLog(photo);
  
  // Update UI
  updatePhotoCount();
  
  // Auto-save to device if enabled
  if (state.settings.autoSave) {
    saveToDevice(photo);
  } else {
    showToast('Photo captured! 📸', 'success');
  }
  
  // Vibrate if available
  if (navigator.vibrate) {
    navigator.vibrate([50, 30, 50]);
  }
}

// Add metadata overlay to image
function addMetadataOverlay(ctx, width, height) {
  const scale = height / 1080;
  const padding = 20 * scale;
  const fontSize = Math.max(14, 18 * scale);
  const lineHeight = fontSize * 1.6;
  
  // Semi-transparent background at bottom
  const bgHeight = lineHeight * 4;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, height - bgHeight, width, bgHeight);
  
  // Text settings
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = 'white';
  ctx.textBaseline = 'bottom';
  
  let y = height - padding;
  
  // Timestamp
  if (state.settings.timestampOnImage) {
    const now = new Date();
    ctx.fillText(
      `📅 ${now.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
      padding,
      y
    );
    y -= lineHeight;
    ctx.fillText(
      `UTC: ${now.toISOString()}`,
      padding,
      y
    );
    y -= lineHeight;
  }
  
  // Coordinates
  if (state.settings.coordsOnImage && state.position) {
    const { latitude, longitude, accuracy } = state.position.coords;
    ctx.fillText(
      `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (±${accuracy?.toFixed(0) || '?'}m)`,
      padding,
      y
    );
  }
  
  // Watermark
  if (state.settings.watermarkEnabled) {
    ctx.font = `bold ${fontSize * 0.9}px sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.textAlign = 'right';
    ctx.fillText('TraceCam 📍', width - padding, height - padding);
    ctx.textAlign = 'left';
  }
}

// Generate photo ID
function generatePhotoId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `IMG-${timestamp}-${random}`;
}

// Get device info
function getDeviceInfo() {
  const ua = navigator.userAgent;
  let device = 'Unknown';
  
  if (/iPhone/.test(ua)) device = 'iPhone';
  else if (/iPad/.test(ua)) device = 'iPad';
  else if (/Android/.test(ua)) {
    const match = ua.match(/Android\s+([\d.]+)/);
    device = match ? `Android ${match[1]}` : 'Android';
  }
  else if (/Windows/.test(ua)) device = 'Windows';
  else if (/Mac/.test(ua)) device = 'Mac';
  else if (/Linux/.test(ua)) device = 'Linux';
  
  return device;
}

// Update device info display
function updateDeviceInfo() {
  document.getElementById('deviceInfo').textContent = getDeviceInfo();
}

// Update session ID display
function updateSessionId() {
  document.getElementById('sessionId').textContent = state.sessionId;
}

// Toggle details panel
function toggleDetails() {
  state.detailsExpanded = !state.detailsExpanded;
  const panel = document.getElementById('detailsPanel');
  const arrow = document.getElementById('detailsArrow');
  
  if (state.detailsExpanded) {
    panel.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    panel.classList.add('hidden');
    arrow.style.transform = 'rotate(0)';
  }
}

// Add log entry
function addLog(photo) {
  const log = {
    id: photo.id,
    timestamp: photo.timestamp,
    timestampLocal: photo.timestampLocal,
    timezone: photo.timezone,
    latitude: photo.location?.latitude,
    longitude: photo.location?.longitude,
    accuracy: photo.location?.accuracy,
    altitude: photo.location?.altitude,
    address: photo.address,
    sessionId: photo.sessionId,
    projectName: photo.projectName,
    operatorName: photo.operatorName
  };
  
  state.logs.unshift(log);
  saveLogs();
  updateLogCount();
}

// Save photos to localStorage
function savePhotos() {
  try {
    const photosToSave = state.photos.slice(0, 50);
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photosToSave));
  } catch (error) {
    console.error('Failed to save photos:', error);
    // If quota exceeded, remove oldest photos
    if (error.name === 'QuotaExceededError') {
      state.photos = state.photos.slice(0, 20);
      localStorage.setItem(PHOTOS_KEY, JSON.stringify(state.photos));
    }
  }
}

// Load photos from localStorage
function loadPhotos() {
  try {
    const saved = localStorage.getItem(PHOTOS_KEY);
    if (saved) {
      state.photos = JSON.parse(saved);
      updatePhotoCount();
    }
  } catch (error) {
    console.error('Failed to load photos:', error);
  }
}

// Save logs to localStorage
function saveLogs() {
  try {
    localStorage.setItem(LOGS_KEY, JSON.stringify(state.logs));
  } catch (error) {
    console.error('Failed to save logs:', error);
  }
}

// Load logs from localStorage
function loadLogs() {
  try {
    const saved = localStorage.getItem(LOGS_KEY);
    if (saved) {
      state.logs = JSON.parse(saved);
      updateLogCount();
    }
  } catch (error) {
    console.error('Failed to load logs:', error);
  }
}

// Save settings
function saveSettings() {
  state.settings = {
    watermarkEnabled: document.getElementById('watermarkEnabled').checked,
    coordsOnImage: document.getElementById('coordsOnImage').checked,
    timestampOnImage: document.getElementById('timestampOnImage').checked,
    autoSave: document.getElementById('autoSave').checked,
    projectName: document.getElementById('projectName').value.trim(),
    operatorName: document.getElementById('operatorName').value.trim()
  };
  
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  showToast('Settings saved', 'success');
  closeSettings();
}

// Load settings
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
    }
    
    document.getElementById('watermarkEnabled').checked = state.settings.watermarkEnabled;
    document.getElementById('coordsOnImage').checked = state.settings.coordsOnImage;
    document.getElementById('timestampOnImage').checked = state.settings.timestampOnImage;
    document.getElementById('autoSave').checked = state.settings.autoSave ?? true;
    document.getElementById('projectName').value = state.settings.projectName || '';
    document.getElementById('operatorName').value = state.settings.operatorName || '';
  } catch (error) {
    console.error('Failed to load settings:', error);
    document.getElementById('autoSave').checked = true;
  }
}

// Update photo count badge
function updatePhotoCount() {
  const badge = document.getElementById('photoCount');
  const summary = document.getElementById('gallerySummary');
  
  if (state.photos.length > 0) {
    badge.textContent = state.photos.length;
    badge.classList.remove('hidden');
    summary.textContent = `${state.photos.length} photo${state.photos.length > 1 ? 's' : ''}`;
  } else {
    badge.classList.add('hidden');
    summary.textContent = 'No photos';
  }
}

// Update log count badge
function updateLogCount() {
  const badge = document.getElementById('logCount');
  const summary = document.getElementById('logsSummary');
  
  if (state.logs.length > 0) {
    badge.textContent = state.logs.length;
    badge.classList.remove('hidden');
    summary.textContent = `${state.logs.length} capture${state.logs.length > 1 ? 's' : ''} logged`;
  } else {
    badge.classList.add('hidden');
    summary.textContent = 'No captures yet';
  }
}

// Save photo to device
async function saveToDevice(photo) {
  try {
    // Try File System Access API
    if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: `${photo.id}.jpg`,
        types: [{
          description: 'JPEG Image',
          accept: { 'image/jpeg': ['.jpg'] }
        }]
      });
      
      const writable = await handle.createWritable();
      const response = await fetch(photo.imageData);
      await writable.write(await response.blob());
      await writable.close();
      
      showToast('Photo saved! 💾', 'success');
      return;
    }
    
    // Try Web Share API
    if (navigator.share && navigator.canShare) {
      const response = await fetch(photo.imageData);
      const blob = await response.blob();
      const file = new File([blob], `${photo.id}.jpg`, { type: 'image/jpeg' });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `TraceCam ${photo.id}`,
        });
        showToast('Photo saved! 📸', 'success');
        return;
      }
    }
    
    // Fallback: direct download
    downloadPhotoDirect(photo);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      showToast('Photo captured! 📸', 'success');
    } else {
      console.error('Save error:', error);
      showToast('Photo captured (saved to app)', 'success');
    }
  }
}

// Direct download
function downloadPhotoDirect(photo) {
  const link = document.createElement('a');
  link.href = photo.imageData;
  link.download = `${photo.id}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Photo downloaded! 📥', 'success');
}

// Save all photos
async function saveAllPhotos() {
  if (state.photos.length === 0) {
    showToast('No photos to save', 'error');
    return;
  }
  
  showToast(`Saving ${state.photos.length} photos...`);
  
  for (let i = 0; i < state.photos.length; i++) {
    downloadPhotoDirect(state.photos[i]);
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  
  showToast(`Saved ${state.photos.length} photos! 📥`, 'success');
}

// Show gallery
function showGallery() {
  const container = document.getElementById('galleryContainer');
  
  if (state.photos.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 text-center py-12">
        <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
        </div>
        <p class="text-slate-500 text-sm">No photos yet</p>
        <p class="text-slate-600 text-xs mt-1">Captured photos will appear here</p>
      </div>
    `;
  } else {
    container.innerHTML = state.photos.map(photo => `
      <div class="aspect-square bg-slate-800 rounded-xl overflow-hidden relative cursor-pointer group" onclick="previewPhoto('${photo.id}')">
        <img src="${photo.imageData}" class="w-full h-full object-cover transition group-hover:scale-105" alt="Photo ${photo.id}" loading="lazy">
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
          <p class="text-[10px] font-mono text-white/80 truncate">${photo.id}</p>
        </div>
      </div>
    `).join('');
  }
  
  document.getElementById('galleryModal').classList.remove('hidden');
}

// Close gallery
function closeGallery() {
  document.getElementById('galleryModal').classList.add('hidden');
}

// Preview photo
function previewPhoto(photoId) {
  const photo = state.photos.find(p => p.id === photoId);
  if (!photo) return;
  
  state.currentPreview = photo;
  
  document.getElementById('previewImage').src = photo.imageData;
  document.getElementById('previewMetadata').innerHTML = `
    <p class="flex justify-between"><span class="text-slate-500">ID:</span><span class="text-white">${photo.id}</span></p>
    <p class="flex justify-between"><span class="text-slate-500">Time:</span><span class="text-white">${photo.timestampLocal}</span></p>
    <p class="flex justify-between"><span class="text-slate-500">Timezone:</span><span class="text-white">${photo.timezone}</span></p>
    ${photo.location ? `<p class="flex justify-between"><span class="text-slate-500">Location:</span><span class="text-emerald-400">${photo.location.latitude.toFixed(6)}, ${photo.location.longitude.toFixed(6)}</span></p>` : ''}
    ${photo.location?.accuracy ? `<p class="flex justify-between"><span class="text-slate-500">Accuracy:</span><span class="text-white">±${photo.location.accuracy.toFixed(1)}m</span></p>` : ''}
    ${photo.address ? `<p class="flex justify-between"><span class="text-slate-500">Address:</span><span class="text-white text-right ml-2 truncate">${photo.address}</span></p>` : ''}
    <p class="flex justify-between"><span class="text-slate-500">Session:</span><span class="text-white">${photo.sessionId}</span></p>
    ${photo.projectName ? `<p class="flex justify-between"><span class="text-slate-500">Project:</span><span class="text-white">${photo.projectName}</span></p>` : ''}
    ${photo.operatorName ? `<p class="flex justify-between"><span class="text-slate-500">Operator:</span><span class="text-white">${photo.operatorName}</span></p>` : ''}
  `;
  
  document.getElementById('previewModal').classList.remove('hidden');
}

// Close preview
function closePreview() {
  document.getElementById('previewModal').classList.add('hidden');
  state.currentPreview = null;
}

// Share photo
async function sharePhoto() {
  if (!state.currentPreview) return;
  
  const photo = state.currentPreview;
  const text = `TraceCam Photo\n${photo.id}\n${photo.timestampLocal}\n${photo.location?.latitude.toFixed(6)}, ${photo.location?.longitude.toFixed(6)}`;
  
  if (navigator.share) {
    try {
      const response = await fetch(photo.imageData);
      const blob = await response.blob();
      const file = new File([blob], `${photo.id}.jpg`, { type: 'image/jpeg' });
      
      await navigator.share({
        title: 'TraceCam Photo',
        text,
        files: [file]
      });
    } catch (e) {
      if (e.name !== 'AbortError') {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'success');
      }
    }
  } else {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard', 'success');
  }
}

// Download photo
function downloadPhoto() {
  if (!state.currentPreview) return;
  downloadPhotoDirect(state.currentPreview);
}

// Show logs
function showLogs() {
  const container = document.getElementById('logsContainer');
  
  if (state.logs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <p class="text-slate-500 text-sm">No captures yet</p>
        <p class="text-slate-600 text-xs mt-1">Take a photo to start logging</p>
      </div>
    `;
  } else {
    container.innerHTML = state.logs.map(log => `
      <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-sm text-emerald-400">${log.id}</span>
          <span class="text-[10px] text-slate-500">${log.timestampLocal}</span>
        </div>
        <div class="text-xs space-y-1 text-slate-400">
          ${log.latitude ? `<p class="flex items-center gap-1"><span>📍</span> ${log.latitude.toFixed(6)}, ${log.longitude.toFixed(6)} <span class="text-slate-600">(±${log.accuracy?.toFixed(0) || '?'}m)</span></p>` : '<p class="text-slate-600">📍 No location</p>'}
          <p class="flex items-center gap-1"><span>🕐</span> ${log.timezone}</p>
          ${log.projectName ? `<p class="flex items-center gap-1"><span>📁</span> ${log.projectName}</p>` : ''}
          ${log.operatorName ? `<p class="flex items-center gap-1"><span>👤</span> ${log.operatorName}</p>` : ''}
        </div>
      </div>
    `).join('');
  }
  
  document.getElementById('logsModal').classList.remove('hidden');
}

// Close logs
function closeLogs() {
  document.getElementById('logsModal').classList.add('hidden');
}

// Clear logs
function clearLogs() {
  if (confirm('Clear all logs? This cannot be undone.')) {
    state.logs = [];
    saveLogs();
    updateLogCount();
    showLogs();
    showToast('Logs cleared', 'success');
  }
}

// Export logs as CSV
function exportLogs() {
  if (state.logs.length === 0) {
    showToast('No logs to export', 'error');
    return;
  }
  
  const headers = [
    'ID', 'Timestamp (UTC)', 'Timestamp (Local)', 'Timezone',
    'Latitude', 'Longitude', 'Accuracy (m)', 'Altitude (m)',
    'Address', 'Session ID', 'Project', 'Operator'
  ];
  
  const rows = state.logs.map(log => [
    log.id,
    log.timestamp,
    log.timestampLocal,
    log.timezone,
    log.latitude || '',
    log.longitude || '',
    log.accuracy || '',
    log.altitude || '',
    `"${(log.address || '').replace(/"/g, '""')}"`,
    log.sessionId,
    log.projectName || '',
    log.operatorName || ''
  ]);
  
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `tracecam-logs-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  
  URL.revokeObjectURL(url);
  showToast('Logs exported!', 'success');
}

// Show settings
function showSettings() {
  document.getElementById('settingsModal').classList.remove('hidden');
}

// Close settings
function closeSettings() {
  document.getElementById('settingsModal').classList.add('hidden');
}

// Show toast
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  const toastIcon = document.getElementById('toastIcon');
  
  toastText.textContent = message;
  
  // Set icon and color based on type
  if (type === 'success') {
    toastIcon.textContent = '✓';
    toast.className = toast.className.replace(/bg-\w+-\d+/g, '');
    toast.classList.add('bg-emerald-600');
  } else if (type === 'error') {
    toastIcon.textContent = '✕';
    toast.className = toast.className.replace(/bg-\w+-\d+/g, '');
    toast.classList.add('bg-red-600');
  } else {
    toastIcon.textContent = 'ℹ';
    toast.className = toast.className.replace(/bg-\w+-\d+/g, '');
    toast.classList.add('bg-slate-700');
  }
  
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';
  toast.style.pointerEvents = 'auto';
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.pointerEvents = 'none';
  }, 2500);
}
