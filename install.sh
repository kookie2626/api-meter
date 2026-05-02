#!/bin/bash

echo "🚀 Installing API Meter..."

# Get latest release download URL
DOWNLOAD_URL=$(curl -s https://api.github.com/repos/kookie2626/api-meter/releases/latest | grep "browser_download_url.*arm64\.dmg" | head -n 1 | cut -d '"' -f 4)

if [ -z "$DOWNLOAD_URL" ]; then
    echo "❌ Failed to find the latest release. Please download manually from GitHub."
    exit 1
fi

echo "📥 Downloading latest version..."
curl -L -s "$DOWNLOAD_URL" -o /tmp/api-meter.dmg

echo "💿 Mounting disk image..."
hdiutil attach /tmp/api-meter.dmg -nobrowse -quiet

echo "📦 Copying to Applications folder..."
rm -rf "/Applications/API Meter.app"
cp -R "/Volumes/Install API Meter/API Meter.app" "/Applications/"

echo "🧹 Cleaning up..."
hdiutil detach "/Volumes/Install API Meter" -quiet
rm /tmp/api-meter.dmg

echo "✅ API Meter successfully installed!"
echo "🎉 Opening API Meter..."
open "/Applications/API Meter.app"
