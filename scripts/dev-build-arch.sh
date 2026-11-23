#!/bin/bash
# Development build and install script for Arch Linux
# Usage: ./scripts/dev-build-arch.sh [--no-install]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

NO_INSTALL=false
if [[ "$1" == "--no-install" ]]; then
    NO_INSTALL=true
fi

echo "🔨 Building BRS Physics for Arch Linux..."

# Clean previous build artifacts
echo "🧹 Cleaning previous builds..."
rm -rf out release/linux-unpacked release/*.pacman release/*.AppImage release/*.deb 2>/dev/null || true

# Build the application
echo "📦 Building application..."
npm run build

# Build the pacman package
echo "📦 Creating pacman package..."
npm run dist:linux

# Find the generated pacman package
PACMAN_FILE=$(ls -t release/brs-physics-*-linux-x64.pacman 2>/dev/null | head -n1)

if [[ -z "$PACMAN_FILE" ]]; then
    echo "❌ Error: No pacman package found in release/"
    exit 1
fi

echo "✅ Package created: $PACMAN_FILE"

if [[ "$NO_INSTALL" == "true" ]]; then
    echo "⏭️  Skipping installation (--no-install flag provided)"
    exit 0
fi

# Install the package
echo "📥 Installing package (requires sudo)..."
sudo pacman -U --noconfirm "$PACMAN_FILE"

echo "✅ Installation complete!"
echo "🚀 You can now run 'brs-physics' from terminal or application menu"