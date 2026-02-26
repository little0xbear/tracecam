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
  currentPreview: null
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
});

// Generate session ID
function generateSessionId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TC-${timestamp}-${random}`;
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
  
  document.getElementById('liveTimeUTC').textContent = 'UTC: ' + now.toISOString().replace('T', ' ').substring(0, 19);
  document.getElementById('timezoneBadge').textContent = timezone.split('/').pop().replace('_', ' ');
}

// Initialize camera
async function initCamera() {
  try {
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
    document.getElementById('videoElement').srcObject = state.stream;
    
    document.getElementById('statusText').textContent = 'Camera ready';
    showToast('Camera initialized', 'success');
  } catch (error) {
    console.error('Camera error:', error);
    document.getElementById('statusText').textContent = 'Camera error';
    showToast('Camera access denied', 'error');
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
    return;
  }
  
  const options = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  };
  
  // Watch position for continuous updates
  navigator.geolocation.watchPosition(
    updatePosition,
    handleGeoError,
    options
  );
}

// Update position
function updatePosition(position) {
  state.position = position;
  
  const { latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed } = position.coords;
  const timestamp = new Date(position.timestamp);
  
  // Update UI
  document.getElementById('gpsStatus').className = 'w-2 h-2 bg-green-500 rounded-full';
  document.getElementById('gpsText').textContent = 'GPS locked';
  
  document.getElementById('coordsText').textContent = 
    `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  
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
}

// Reverse geocode
async function reverseGeocode(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await response.json();
    
    if (data.display_name) {
      document.getElementById('address').textContent = data.display_name;
    }
  } catch (error) {
    document.getElementById('address').textContent = 'Address unavailable';
  }
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
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  // Draw video frame
  ctx.drawImage(video, 0, 0);
  
  // Add overlay if enabled
  if (state.settings.timestampOnImage || state.settings.coordsOnImage) {
    addMetadataOverlay(ctx, canvas.width, canvas.height);
  }
  
  // Flash effect
  const flash = document.getElementById('flashOverlay');
  flash.classList.add('capture-flash');
  flash.style.opacity = '1';
  setTimeout(() => {
    flash.style.opacity = '0';
    flash.classList.remove('capture-flash');
  }, 300);
  
  // Get image data
  const imageData = canvas.toDataURL('image/jpeg', 0.9);
  
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
    showToast('Photo captured! 📸');
  }
  
  // Vibrate if available
  if (navigator.vibrate) {
    navigator.vibrate(100);
  }
}

// Save photo to device (downloads folder / camera roll)
async function saveToDevice(photo) {
  try {
    // Try using File System Access API (newer browsers)
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
      
      showToast('Photo saved to device! 💾');
      return;
    }
    
    // Fallback: Try Web Share API with file (works on mobile for camera roll)
    if (navigator.share && navigator.canShare) {
      const response = await fetch(photo.imageData);
      const blob = await response.blob();
      const file = new File([blob], `${photo.id}.jpg`, { type: 'image/jpeg' });
      
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `TraceCam Photo ${photo.id}`,
          text: `Captured at ${photo.timestampLocal}\nLocation: ${photo.location?.latitude.toFixed(6)}, ${photo.location?.longitude.toFixed(6)}`
        });
        showToast('Photo saved! 📸');
        return;
      }
    }
    
    // Final fallback: Direct download
    downloadPhotoDirect(photo);
    
  } catch (error) {
    // User cancelled or error - just show normal toast
    if (error.name !== 'AbortError') {
      console.error('Save error:', error);
      showToast('Photo captured (saved to app only)');
    }
  }
}

// Direct download fallback
function downloadPhotoDirect(photo) {
  const link = document.createElement('a');
  link.href = photo.imageData;
  link.download = `${photo.id}.jpg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Photo downloaded! 📥');
}

// Save all photos as zip (bulk download)
async function saveAllPhotos() {
  if (state.photos.length === 0) {
    showToast('No photos to save', 'error');
    return;
  }
  
  showToast(`Downloading ${state.photos.length} photos...`);
  
  // Download each photo with small delay
  for (let i = 0; i < state.photos.length; i++) {
    const photo = state.photos[i];
    downloadPhotoDirect(photo);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  
  showToast('All photos downloaded! 📥');
}

// Add metadata overlay to image
function addMetadataOverlay(ctx, width, height) {
  const padding = 20;
  const lineHeight = 24;
  let y = height - padding;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, height - 120, width, 120);
  
  ctx.font = '14px monospace';
  ctx.fillStyle = 'white';
  
  if (state.settings.timestampOnImage) {
    const now = new Date();
    ctx.fillText(
      `📅 ${now.toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,
      padding,
      y - lineHeight * 2
    );
    ctx.fillText(
      `UTC: ${now.toISOString()}`,
      padding,
      y - lineHeight
    );
  }
  
  if (state.settings.coordsOnImage && state.position) {
    const { latitude, longitude } = state.position.coords;
    ctx.fillText(
      `📍 ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      padding,
      y
    );
  }
  
  // Watermark
  if (state.settings.watermarkEnabled) {
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillText('TraceCam 📍', width - 120, height - 20);
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
  else if (/Android/.test(ua)) device = 'Android';
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
    // Only keep last 50 photos in localStorage to avoid quota issues
    const photosToSave = state.photos.slice(0, 50);
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photosToSave));
  } catch (error) {
    console.error('Failed to save photos:', error);
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
    projectName: document.getElementById('projectName').value,
    operatorName: document.getElementById('operatorName').value
  };
  
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
  showToast('Settings saved');
  closeSettings();
}

// Load settings
function loadSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      state.settings = { ...state.settings, ...JSON.parse(saved) };
      
      document.getElementById('watermarkEnabled').checked = state.settings.watermarkEnabled;
      document.getElementById('coordsOnImage').checked = state.settings.coordsOnImage;
      document.getElementById('timestampOnImage').checked = state.settings.timestampOnImage;
      document.getElementById('autoSave').checked = state.settings.autoSave ?? true;
      document.getElementById('projectName').value = state.settings.projectName;
      document.getElementById('operatorName').value = state.settings.operatorName;
    } else {
      // Default: auto-save enabled
      document.getElementById('autoSave').checked = true;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Update photo count badge
function updatePhotoCount() {
  const badge = document.getElementById('photoCount');
  if (state.photos.length > 0) {
    badge.textContent = state.photos.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Update log count badge
function updateLogCount() {
  const badge = document.getElementById('logCount');
  if (state.logs.length > 0) {
    badge.textContent = state.logs.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Show gallery
function showGallery() {
  const container = document.getElementById('galleryContainer');
  
  if (state.photos.length === 0) {
    container.innerHTML = '<p class="text-slate-500 text-center py-8 col-span-2">No photos yet</p>';
  } else {
    container.innerHTML = state.photos.map(photo => `
      <div class="aspect-square bg-slate-800 rounded-lg overflow-hidden relative cursor-pointer hover:ring-2 hover:ring-emerald-500 transition" onclick="previewPhoto('${photo.id}')">
        <img src="${photo.imageData}" class="w-full h-full object-cover" alt="Photo">
        <div class="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
          <p class="text-xs font-mono truncate">${photo.id}</p>
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
    <p><strong>ID:</strong> ${photo.id}</p>
    <p><strong>Time:</strong> ${photo.timestampLocal} (${photo.timezone})</p>
    <p><strong>UTC:</strong> ${photo.timestamp}</p>
    ${photo.location ? `<p><strong>Location:</strong> ${photo.location.latitude.toFixed(6)}, ${photo.location.longitude.toFixed(6)}</p>` : ''}
    ${photo.location?.accuracy ? `<p><strong>Accuracy:</strong> ±${photo.location.accuracy.toFixed(1)}m</p>` : ''}
    ${photo.address ? `<p><strong>Address:</strong> ${photo.address}</p>` : ''}
    <p><strong>Session:</strong> ${photo.sessionId}</p>
    ${photo.projectName ? `<p><strong>Project:</strong> ${photo.projectName}</p>` : ''}
    ${photo.operatorName ? `<p><strong>Operator:</strong> ${photo.operatorName}</p>` : ''}
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
  const text = `TraceCam Photo\n\n` +
    `ID: ${photo.id}\n` +
    `Time: ${photo.timestampLocal}\n` +
    `Location: ${photo.location?.latitude.toFixed(6)}, ${photo.location?.longitude.toFixed(6)}\n` +
    `Session: ${photo.sessionId}`;
  
  if (navigator.share) {
    try {
      // Convert data URL to blob
      const response = await fetch(photo.imageData);
      const blob = await response.blob();
      const file = new File([blob], `${photo.id}.jpg`, { type: 'image/jpeg' });
      
      await navigator.share({
        title: 'TraceCam Photo',
        text,
        files: [file]
      });
    } catch (e) {
      // Fallback to clipboard
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard');
    }
  } else {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
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
    container.innerHTML = '<p class="text-slate-500 text-center py-8">No captures yet</p>';
  } else {
    container.innerHTML = state.logs.map(log => `
      <div class="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50 mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-sm text-emerald-400">${log.id}</span>
          <span class="text-xs text-slate-500">${log.timestampLocal}</span>
        </div>
        <div class="text-xs space-y-1 text-slate-400">
          ${log.latitude ? `<p>📍 ${log.latitude.toFixed(6)}, ${log.longitude.toFixed(6)} (±${log.accuracy?.toFixed(1)}m)</p>` : '<p>📍 No location</p>'}
          <p>🕐 ${log.timezone}</p>
          ${log.projectName ? `<p>📁 ${log.projectName}</p>` : ''}
          ${log.operatorName ? `<p>👤 ${log.operatorName}</p>` : ''}
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
    showToast('Logs cleared');
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
  showToast('Logs exported');
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
  document.getElementById('toastText').textContent = message;
  
  toast.className = toast.className.replace(/bg-\w+-\d+/g, '');
  toast.classList.add(type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-slate-800');
  
  toast.style.opacity = '1';
  
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 2000);
}
