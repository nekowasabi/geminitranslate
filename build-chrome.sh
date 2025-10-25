#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔨 Building Chrome extension..."
echo ""

# Function to check command existence
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to handle errors
handle_error() {
  echo ""
  echo "❌ Error: $1"
  echo "   Build process failed. Please check the error message above."
  exit 1
}

# Validate required commands
if ! command_exists npm; then
  handle_error "npm is not installed. Please install Node.js and npm."
fi

if ! command_exists node; then
  handle_error "node is not installed. Please install Node.js."
fi

if ! command_exists unzip; then
  handle_error "unzip is not installed. Please install unzip utility."
fi

# Validate required files exist
if [ ! -f "package.json" ]; then
  handle_error "package.json not found. Are you in the project root?"
fi

if [ ! -f "manifest.json" ]; then
  handle_error "manifest.json not found. Are you in the project root?"
fi

if [ ! -f "browser-polyfill.min.js" ]; then
  handle_error "browser-polyfill.min.js not found in project root"
fi

if [ ! -f "popup/browser-polyfill.min.js" ]; then
  handle_error "browser-polyfill.min.js not found in popup/ directory"
fi

# Build with web-ext
echo "📦 Step 1/6: Building with web-ext..."
if ! npm run build:ext; then
  handle_error "web-ext build failed"
fi
echo "   ✓ web-ext build completed"

# Validate web-ext artifacts exist
if [ ! -d "web-ext-artifacts" ]; then
  handle_error "web-ext-artifacts directory not created"
fi

ZIP_FILE=$(ls web-ext-artifacts/doganaylab_api_translate_app-*.zip 2>/dev/null | head -n 1)
if [ -z "$ZIP_FILE" ]; then
  handle_error "No zip file found in web-ext-artifacts/"
fi
echo "   ✓ Found: $(basename "$ZIP_FILE")"

# Create dist-chrome directory
echo ""
echo "📂 Step 2/6: Creating dist-chrome directory..."
mkdir -p dist-chrome
echo "   ✓ Directory created"

# Extract zip to dist-chrome
echo ""
echo "📦 Step 3/6: Extracting to dist-chrome/..."
if ! unzip -o "$ZIP_FILE" -d dist-chrome > /dev/null 2>&1; then
  handle_error "Failed to extract zip file"
fi
echo "   ✓ Extraction completed"

# Validate extracted files
if [ ! -f "dist-chrome/manifest.json" ]; then
  handle_error "manifest.json not found in extracted files"
fi

if [ ! -f "dist-chrome/background.js" ]; then
  handle_error "background.js not found in extracted files"
fi

# Convert manifest to v3
echo ""
echo "🔄 Step 4/6: Converting manifest.json to v3..."
if ! node convert-manifest-v3.cjs dist-chrome/manifest.json; then
  handle_error "Manifest v3 conversion failed"
fi
echo "   ✓ Manifest converted to v3"

# Add Chrome compatibility polyfill
echo ""
echo "🔌 Step 5/6: Adding WebExtension Polyfill..."
if ! node add-chrome-polyfill.cjs dist-chrome/background.js; then
  handle_error "Failed to add polyfill to background.js"
fi
echo "   ✓ Polyfill added to background.js"

# Copy polyfill files for content scripts and popup
echo ""
echo "📋 Copying polyfill files..."
if ! cp browser-polyfill.min.js dist-chrome/; then
  handle_error "Failed to copy browser-polyfill.min.js to dist-chrome/"
fi
echo "   ✓ Copied to dist-chrome/"

if ! cp popup/browser-polyfill.min.js dist-chrome/popup/; then
  handle_error "Failed to copy browser-polyfill.min.js to dist-chrome/popup/"
fi
echo "   ✓ Copied to dist-chrome/popup/"

# Remove unnecessary files and directories
echo ""
echo "🧹 Step 6/6: Cleaning up unnecessary files..."
CLEANUP_ITEMS=(
  "dist-chrome/__tests__"
  "dist-chrome/coverage"
  "dist-chrome/tests"
  "dist-chrome/eslint.config.js"
  "dist-chrome/package.json"
  "dist-chrome/package-lock.json"
  "dist-chrome/deno.lock"
  "dist-chrome/CLAUDE.md"
  "dist-chrome/PLAN.md"
  "dist-chrome/README.md"
  "dist-chrome/vite.config.ts"
  "dist-chrome/tsconfig.json"
  "dist-chrome/tailwind.config.js"
  "dist-chrome/postcss.config.js"
  "dist-chrome/jest.config.js"
  "dist-chrome/.vscode"
  "dist-chrome/.DS_Store"
  "dist-chrome/.gitignore"
  "dist-chrome/.web-ext-config.json"
  "dist-chrome/build-chrome.sh"
  "dist-chrome/convert-manifest-v3.cjs"
  "dist-chrome/add-chrome-polyfill.cjs"
)

for item in "${CLEANUP_ITEMS[@]}"; do
  if [ -e "$item" ]; then
    rm -rf "$item"
  fi
done
echo "   ✓ Cleanup completed"

# Final validation
echo ""
echo "🔍 Validating build output..."
REQUIRED_FILES=(
  "dist-chrome/manifest.json"
  "dist-chrome/background.js"
  "dist-chrome/content.js"
  "dist-chrome/browser-polyfill.min.js"
  "dist-chrome/popup/popup.html"
  "dist-chrome/popup/popup.js"
  "dist-chrome/popup/browser-polyfill.min.js"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    handle_error "Required file missing: $file"
  fi
done
echo "   ✓ All required files present"

echo ""
echo "======================================"
echo "✅ Chrome extension built successfully!"
echo "======================================"
echo ""
echo "📂 Build output: $(pwd)/dist-chrome"
echo "📊 Total size: $(du -sh dist-chrome | cut -f1)"
echo ""
echo "🚀 Installation steps:"
echo "   1. Open chrome://extensions/ in Chrome"
echo "   2. Enable 'Developer mode' (top right toggle)"
echo "   3. Click 'Load unpacked'"
echo "   4. Select: $(pwd)/dist-chrome"
echo ""
