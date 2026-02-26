# TraceCam 📍

GPS Camera for Traceability - A Progressive Web App that captures photos with full metadata logging for documentation and verification purposes.

## Features

### 📸 Camera
- Live camera view with front/back switching
- High-quality photo capture
- Visual metadata overlay on images
- Flash effect on capture

### 📍 GPS & Location
- Real-time GPS tracking
- Latitude/Longitude coordinates
- Altitude and accuracy data
- Automatic address lookup (reverse geocoding)

### ⏰ Timestamps
- Local time display
- UTC timestamp
- Timezone information
- Live updating clock

### 📋 Metadata Logging
- Unique photo ID (IMG-XXXXXXXX-XXX format)
- Session ID for grouping captures
- Device information
- Project and operator names (configurable)
- Complete capture log exportable as CSV

### 📱 PWA Features
- Install on mobile home screen
- Works offline (cached assets)
- Native app-like experience
- Full-screen mode

### 🔧 Settings
- Toggle watermark on images
- Toggle coordinates on images
- Toggle timestamp on images
- Project name field
- Operator name field

### 📤 Export & Share
- Export all logs as CSV
- Share individual photos
- Download photos with metadata
- Gallery view with preview

## Use Cases

- **Construction** - Document site conditions with location proof
- **Insurance** - Capture damage photos with GPS verification
- **Field Work** - Log inspections with coordinates
- **Real Estate** - Property photos with location data
- **Travel** - Document locations with timestamps
- **Research** - Field data collection with metadata

## Installation

### As PWA (Recommended for mobile)
1. Open the app in Chrome/Safari on your phone
2. Tap the browser menu (⋯ or share button)
3. Select "Add to Home Screen"
4. Launch from home screen like a native app

### Browser
Simply open the URL in any modern browser.

## Permissions Required

- **Camera** - To capture photos
- **Location** - To record GPS coordinates

Both permissions are requested on first use and can be denied (app will still work but with limited functionality).

## Tech Stack

- Vanilla JavaScript
- Tailwind CSS (CDN)
- Geolocation API
- MediaDevices API (Camera)
- Service Worker (PWA)
- LocalStorage (data persistence)

## Data Storage

All data is stored locally in your browser:
- Photos (last 50)
- Capture logs
- Settings

No data is sent to external servers. Photos can be exported manually.

## Live Demo

Visit: https://tracecam.vercel.app

## Built By

Little Bear 🧸 - An AI assistant

## License

MIT
