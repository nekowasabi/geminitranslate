# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Firefox extension that translates web pages using Google's Gemini API while preserving page structure. The extension consists of three main components:

- **background.js**: Service worker handling browser commands and message routing
- **content.js**: Content script injected into web pages for DOM manipulation and translation
- **popup/**: Extension popup UI for configuration and manual controls

## Development Commands

```bash
# Lint the code
npm run lint

# Build the project (if needed for production)
npm run build

# For extension development, load the extension via Firefox's about:debugging
```

## Architecture

### Translation Flow
1. User triggers translation via popup button or keyboard shortcut (Alt+W)
2. background.js receives command and forwards to content.js via message passing
3. content.js scans DOM, extracts translatable text, and sends batched requests to Gemini API
4. Translated content replaces original while preserving DOM structure and styling

### Key Components
- **Translation Cache**: Map-based caching system to avoid duplicate API calls
- **Batch Processing**: Groups text elements for efficient API usage (CONCURRENCY_LIMIT = 10)
- **MutationObserver**: Detects dynamic content changes for real-time translation
- **Font Size Preservation**: Maintains original styling after translation

### Content Script Features
- Selection-based translation with floating UI
- Clipboard content translation
- Dynamic content detection and translation
- Dark mode support with automatic theme detection

### Storage Management
- API keys stored in browser.storage.local
- Target language and font size preferences persisted
- Translation cache maintained in memory during session

## Extension Permissions
- `storage`: For API key and preferences
- `activeTab`: For current page access
- `commands`: For keyboard shortcuts
- `clipboardRead`: For clipboard translation feature
- `<all_urls>`: For universal page translation

## API Integration
Uses Gemini 2.0 Flash model with batch processing for performance optimization. Text filtering excludes script/style elements and invisible content.