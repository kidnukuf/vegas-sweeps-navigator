#!/bin/bash
# Build the zero-install Windows offline package for B.O.B. Roll-off Passport
# Run this from the offline-server/ directory: bash build-windows-package.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
PACKAGE_DIR="$BUILD_DIR/BOB-Offline-Server"
NODE_VERSION="22.13.0"
NODE_WIN_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"

echo "=== B.O.B. Offline Package Builder ==="
echo "Building zero-install Windows package..."

# Clean and create dirs
rm -rf "$BUILD_DIR"
mkdir -p "$PACKAGE_DIR/node_modules"

# Copy server files
echo "Copying server files..."
cp "$SCRIPT_DIR/server.js" "$PACKAGE_DIR/"
cp "$SCRIPT_DIR/package.json" "$PACKAGE_DIR/"
cp -r "$SCRIPT_DIR/public" "$PACKAGE_DIR/"

# Install dependencies for Linux first to get the module structure,
# then we'll use the Windows-compatible pure-JS modules
cd "$PACKAGE_DIR"
npm install --omit=dev --ignore-scripts 2>/dev/null || npm install --omit=dev 2>/dev/null || true

# Download Node.js Windows binary
echo "Downloading Node.js ${NODE_VERSION} for Windows..."
NODE_ZIP="$BUILD_DIR/node-win.zip"
if [ ! -f "$NODE_ZIP" ]; then
  curl -L -o "$NODE_ZIP" "$NODE_WIN_URL"
fi

# Extract just the node.exe
echo "Extracting node.exe..."
cd "$BUILD_DIR"
unzip -q "$NODE_ZIP" "node-v${NODE_VERSION}-win-x64/node.exe" -d "$BUILD_DIR/node_extract"
cp "$BUILD_DIR/node_extract/node-v${NODE_VERSION}-win-x64/node.exe" "$PACKAGE_DIR/node.exe"
rm -rf "$BUILD_DIR/node_extract"

# Create START.bat
cat > "$PACKAGE_DIR/START.bat" << 'BATEOF'
@echo off
title B.O.B. Roll-off Passport - Offline Server
color 0A
echo.
echo  ============================================================
echo   B.O.B. Roll-off Passport - Offline Server
echo  ============================================================
echo.
echo  Starting server... please wait.
echo.
echo  Once started, open your browser to:
echo    http://localhost:7777
echo.
echo  Doorman tablets connect to the Network URL shown in the
echo  server window (e.g. http://192.168.x.x:7777/doorman-tablet)
echo.
echo  DO NOT close this window while the event is running.
echo.
cd /d "%~dp0"
node.exe server.js
echo.
echo  Server stopped. Press any key to exit.
pause > nul
BATEOF

# Create README.txt
cat > "$PACKAGE_DIR/README.txt" << 'READMEEOF'
B.O.B. Roll-off Passport — Offline Server
==========================================

QUICK START
-----------
1. Double-click START.bat to launch the server
2. Open http://localhost:7777 in a browser on this laptop
3. Load the bob_snapshot.json file (download from admin dashboard first)
4. Create a WiFi hotspot: Windows Settings > Network > Mobile Hotspot > Turn On
5. Connect doorman tablets to the hotspot
6. On each tablet, open: http://<laptop-ip>:7777/doorman-tablet
7. Enter the PIN to unlock the scanner

BEFORE THE EVENT (requires internet)
--------------------------------------
- Log into the admin dashboard at https://bobrolloffpassport.com/admin
- Go to the Import tab
- Click "Download Offline Snapshot"
- Save the file as bob_snapshot.json in this folder

AFTER THE EVENT (sync back to cloud)
--------------------------------------
- When internet is available, open http://localhost:7777
- Click "Sync to Cloud Now"
- All offline redemptions will be uploaded to the cloud database

TROUBLESHOOTING
---------------
- "Camera access denied": The tablet browser needs camera permission. 
  On Android: Settings > Apps > Chrome > Permissions > Camera > Allow
- "Server not found" on tablet: Make sure both devices are on the same hotspot
- "No PIN configured": Load the snapshot first (it contains the PIN)

SUPPORT
-------
Contact your event director for assistance.
READMEEOF

# Create the final ZIP
echo "Creating ZIP package..."
cd "$BUILD_DIR"
zip -r "BOB-Offline-Server-Windows.zip" "BOB-Offline-Server/" -x "*.DS_Store" -x "__MACOSX/*"

echo ""
echo "=== BUILD COMPLETE ==="
echo "Package: $BUILD_DIR/BOB-Offline-Server-Windows.zip"
echo "Size: $(du -sh "$BUILD_DIR/BOB-Offline-Server-Windows.zip" | cut -f1)"
echo ""
echo "Upload this ZIP to the webdev static assets and add a download link in the admin dashboard."
