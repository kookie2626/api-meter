#!/bin/bash

set -e

echo "🚀 Installing API Meter..."

OS=$(uname -s)
RELEASE_JSON=$(curl -s https://api.github.com/repos/kookie2626/api-meter/releases/latest)

if [ "$OS" = "Darwin" ]; then
    DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep "browser_download_url.*arm64\.dmg" | grep -v blockmap | head -n 1 | cut -d '"' -f 4)

    if [ -z "$DOWNLOAD_URL" ]; then
        echo "❌ Failed to find the latest release. Please download manually from GitHub."
        exit 1
    fi

    echo "📥 Downloading..."
    curl -L -s "$DOWNLOAD_URL" -o /tmp/api-meter.dmg

    echo "💿 Mounting disk image..."
    hdiutil attach /tmp/api-meter.dmg -nobrowse -quiet

    echo "📦 Copying to Applications folder..."
    rm -rf "/Applications/API Meter.app"
    cp -R "/Volumes/Install API Meter/API Meter.app" "/Applications/"

    echo "🧹 Cleaning up..."
    hdiutil detach "/Volumes/Install API Meter" -quiet
    rm /tmp/api-meter.dmg

    echo "✅ API Meter installed!"
    open "/Applications/API Meter.app"

elif [ "$OS" = "Linux" ]; then
    if command -v dpkg &> /dev/null; then
        DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep "browser_download_url.*\.deb" | head -n 1 | cut -d '"' -f 4)

        if [ -z "$DOWNLOAD_URL" ]; then
            echo "❌ Failed to find the latest release. Please download manually from GitHub."
            exit 1
        fi

        echo "📥 Downloading..."
        curl -L -s "$DOWNLOAD_URL" -o /tmp/api-meter.deb

        echo "📦 Installing (requires sudo)..."
        sudo dpkg -i /tmp/api-meter.deb

        rm /tmp/api-meter.deb
        echo "✅ API Meter installed!"
    else
        DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep "browser_download_url.*\.AppImage" | head -n 1 | cut -d '"' -f 4)

        if [ -z "$DOWNLOAD_URL" ]; then
            echo "❌ Failed to find the latest release. Please download manually from GitHub."
            exit 1
        fi

        DEST="$HOME/Applications/API-Meter.AppImage"
        mkdir -p "$HOME/Applications"

        echo "📥 Downloading..."
        curl -L -s "$DOWNLOAD_URL" -o "$DEST"
        chmod +x "$DEST"

        echo "✅ API Meter downloaded to $DEST"
        "$DEST" &
    fi
else
    echo "❌ Unsupported OS: $OS"
    exit 1
fi
