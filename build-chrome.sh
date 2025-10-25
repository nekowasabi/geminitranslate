#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔨 Building Chrome extension..."

# Build with web-ext
echo "  📦 Building with web-ext..."
npm run build:ext

# Create dist-chrome directory
mkdir -p dist-chrome

# Extract zip to dist-chrome
echo "  📂 Extracting to dist-chrome/..."
unzip -o web-ext-artifacts/doganaylab_api_translate_app-*.zip -d dist-chrome > /dev/null

# Convert manifest to v3
echo "  🔄 Converting manifest.json to v3..."
node convert-manifest-v3.cjs dist-chrome/manifest.json

# Add Chrome compatibility polyfill
echo "  🔌 Adding Chrome polyfill to background.js..."
node add-chrome-polyfill.cjs dist-chrome/background.js

echo ""
echo "✅ Chrome extension built successfully!"
echo "📂 Load dist-chrome/ directory in Chrome at chrome://extensions/"
echo ""
echo "Steps:"
echo "  1. Open chrome://extensions/"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $(pwd)/dist-chrome"
