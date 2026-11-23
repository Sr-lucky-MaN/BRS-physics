#!/bin/bash
# Quick development run script - builds and runs without packaging
# Usage: ./scripts/dev-run.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "🔨 Building for development..."
npm run build

echo "🚀 Starting application..."
npm run start