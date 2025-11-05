#!/bin/bash

# DoganayLab API Translate App - Firefox Build Script
# This script automates the complete build process for Firefox

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

check_requirement() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed or not in PATH"
        return 1
    fi
    print_info "$1 found: $(command -v $1)"
}

# Main script
print_info "DoganayLab API Translate App - Firefox Build Script"
echo ""

# Check system requirements
print_info "Checking system requirements..."

if ! check_requirement "node"; then
    print_error "Node.js is required but not installed. Visit https://nodejs.org/"
    exit 1
fi

if ! check_requirement "npm"; then
    print_error "npm is required but not installed"
    exit 1
fi

# Verify Node.js version (v18+)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js v18 or higher is required (found: v$NODE_VERSION)"
    exit 1
fi

# Verify npm version (v9+)
NPM_VERSION=$(npm -v | cut -d'.' -f1)
if [ "$NPM_VERSION" -lt 9 ]; then
    print_error "npm v9 or higher is required (found: v$(npm -v))"
    exit 1
fi

print_info "Node.js version: $(node -v)"
print_info "npm version: $(npm -v)"
echo ""

# Install dependencies
print_info "Installing dependencies..."
if [ -d "node_modules" ]; then
    print_warning "node_modules directory already exists. Skipping npm install..."
else
    npm install
    if [ $? -ne 0 ]; then
        print_error "npm install failed"
        exit 1
    fi
fi
echo ""

# Clean previous builds
print_info "Cleaning previous builds..."
npm run clean:firefox
echo ""

# Build Firefox extension
print_info "Building Firefox extension..."
npm run build:firefox
if [ $? -ne 0 ]; then
    print_error "Firefox build failed"
    exit 1
fi
echo ""

# Verify build
print_info "Verifying build..."
if [ ! -f "dist-firefox/manifest.json" ]; then
    print_error "manifest.json not found in dist-firefox/"
    exit 1
fi

MANIFEST_VERSION=$(grep '"version"' dist-firefox/manifest.json | head -1 | grep -o '[0-9.]*')
print_info "Build successful! Firefox extension built at dist-firefox/"
print_info "Extension version: $MANIFEST_VERSION"

# List build artifacts
echo ""
print_info "Build artifacts:"
du -sh dist-firefox/
echo ""

# Final checklist
print_info "Build verification checklist:"
echo "  ✓ Node.js v$(node -v | cut -d'v' -f2) installed"
echo "  ✓ npm v$(npm -v) installed"
echo "  ✓ Dependencies installed"
echo "  ✓ Firefox extension built"
echo "  ✓ Version: $MANIFEST_VERSION"
echo ""

print_info "Next steps:"
echo "  1. Load in Firefox: about:debugging → Load Temporary Add-on → dist-firefox/manifest.json"
echo "  2. Or use: web-ext run --source-dir=dist-firefox"
echo "  3. Create package: npm run package:firefox"
echo ""

print_info "Build completed successfully!"
