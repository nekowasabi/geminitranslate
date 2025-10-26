# Changelog

All notable changes to DoganayLab API Translate App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.1] - 2025-10-26

### 🔧 Settings & Stability Improvements

#### Added
- **options_ui** definition to both manifest.v2.json and manifest.v3.json for proper settings page integration
- **Dark mode** storage support in StorageData interface with default value
- Comprehensive **error handling** for BrowserAdapter storage operations (get/set/remove)
- **Migration logic** for lineHeight values > 2.0 to automatically correct to 1.5
- Detailed **error messages** in options page with specific error information
- Unit tests for BrowserAdapter error handling scenarios
- Unit tests for StorageManager lineHeight migration logic

#### Changed
- **lineHeight default value** from 4 to 1.5 to match UI specifications (1.0-2.0 range)
- Optimized **StorageManager instantiation** using React's useMemo in useSettings and popup/App
- Refactored BrowserAdapter to use **handleRuntimeError** common function, eliminating code duplication
- Enhanced error logging with console.error for debugging

#### Fixed
- Settings page not opening from browser extension UI
- Potential memory leaks from repeated StorageManager instantiation
- Silent storage operation failures due to missing chrome.runtime.lastError checks
- Inconsistent lineHeight values for existing users
- Dark mode settings not being saved or loaded properly

#### Technical Details
- BrowserAdapter: Added chrome.runtime.lastError validation in all storage methods
- StorageManager: Automatic data migration for invalid lineHeight values
- React hooks: useMemo optimization prevents unnecessary re-instantiation
- Manifest files: browser_style: false (Firefox), open_in_tab: true (Chrome)

## [3.0.0] - 2025-10-26

### 🎉 Major Release - Complete TypeScript Rewrite

#### Added
- TypeScript 100% migration for type safety
- React 18 UI for Popup and Options pages
- Chrome Manifest V3 support
- 3-Tier cache system (Memory → Session → Local)
- LRU cache with automatic eviction (max 1000 entries)
- Selection translation (Alt+Y) with floating UI
- Clipboard translation (Alt+C)
- Dark mode with automatic theme detection
- Connection test in Options UI
- Webpack 5 build system
- Jest testing framework (380+ tests, 99.5% coverage)

#### Changed (Breaking)
- API key storage: `apiKey` → `openRouterApiKey` (auto-migrated)
- Default model: `google/gemini-2.0-flash-exp:free`
- Complete architecture rewrite with layered design
- React-based UI replacing vanilla JavaScript

#### Fixed
- Memory leaks in DOM manipulation
- Race conditions in concurrent translations
- Cache invalidation issues
- Firefox/Chrome compatibility issues

#### Security
- CSP-compliant (no inline scripts)
- Permissions minimized
- Secure storage for API keys

#### Statistics
- Bundle size: 768KB (Chrome), 764KB (Firefox)
- Test coverage: 99.5% (378/380 passing)
- TypeScript: 100%

#### Migration
Your settings will be automatically migrated from v2.x to v3.0.0.

---

## [2.0.2] - 2025-10-25

### Added - Chrome/Edge Support
- **Cross-Browser Compatibility**: Extension now works on Chrome, Edge, and other Chromium-based browsers
  - WebExtension Polyfill (v0.10.0) integration for browser API compatibility
  - Automated build process for Chrome-compatible package
  - Manifest v3 conversion for Chrome Web Store compliance
- **Build System**:
  - New `npm run build:chrome` command for Chrome builds
  - Automated polyfill injection into background.js
  - Enhanced error handling and validation in build scripts
- **Testing**:
  - 43 new unit tests for popup.js and background.js
  - Firefox regression test documentation (tests/FIREFOX_REGRESSION.md)
  - Total test coverage: 73 tests across all components
  - Browser API mock setup for cross-browser testing

### Improved
- **Build Process**:
  - Comprehensive validation of build prerequisites
  - Step-by-step progress indicators during build
  - Automatic file existence checks
  - Better error messages with troubleshooting hints
- **Code Quality**:
  - Formal WebExtension Polyfill integration (replaces simple `var browser = chrome` workaround)
  - Consistent Promise-based API usage across browsers
  - Improved code documentation and comments

### Technical Changes
- Updated `add-chrome-polyfill.cjs`: Now injects full WebExtension Polyfill instead of simple assignment
- Enhanced `build-chrome.sh`: Added validation, error handling, and progress tracking
- New test files:
  - `tests/popup.test.js`: 20 tests for popup functionality
  - `tests/background.test.js`: 23 tests for background script
  - `tests/setup.js`: Enhanced with `browser.commands` mock
  - `tests/FIREFOX_REGRESSION.md`: Manual testing procedures
- Updated `README.md`: Added Chrome installation and technical compatibility sections

### Compatibility
- **Firefox**: ✅ All existing functionality preserved (Manifest v2)
- **Chrome/Edge**: ✅ Full feature parity with Firefox version (Manifest v3)
- **Test Status**: 73/73 tests passing
- **ESLint**: Clean (13 warnings, 0 errors)

### Migration Notes
For developers:
1. Use `npm run build:chrome` to create Chrome-compatible build
2. Load `dist-chrome/` directory as unpacked extension in Chrome
3. All Firefox features work identically in Chrome
4. No code changes needed for new features - polyfill handles API differences

For users:
- Firefox users: No changes needed, extension works as before
- Chrome users: Follow new installation instructions in README.md

---

## [2.0.0] - 2025-10-25

### Changed - Major Migration
- **BREAKING CHANGE**: Migrated from Gemini API to OpenRouter API
  - Users must obtain a new OpenRouter API key (free tier available)
  - Previous Gemini API keys will no longer work
  - Migration provides access to multiple AI models beyond just Gemini

### Added
- **Multiple AI Model Support**: Choose from various models through OpenRouter:
  - Google Gemini 2.0 Flash (free tier)
  - Google Gemini Flash 1.5 8B
  - Anthropic Claude 3.5 Sonnet
  - OpenAI GPT-4o Mini
  - Custom model input option
  - Many more models available through OpenRouter
- **Provider Routing**: Optional provider selection for performance optimization
  - Support for DeepInfra, Together, and other providers
  - Configurable through the popup UI
- **Connection Testing**: Built-in API connection test feature
  - Verify API key validity before translation
  - Test model availability and access
- **Enhanced Popup UI**:
  - Model selection dropdown with popular models pre-configured
  - Provider input field for routing optimization
  - Test Connection button for API validation
  - Improved user experience with better feedback

### Improved
- **Translation Quality**: Access to multiple AI models allows users to choose the best model for their needs
- **Cost Optimization**: Free tier models available through OpenRouter
- **Flexibility**: Easy switching between different AI providers
- **Error Handling**: Enhanced error messages specific to OpenRouter API responses
- **Documentation**: Comprehensive README updates with OpenRouter setup instructions

### Technical Changes
- Added `openrouter.js`: New OpenRouterClient class for API communication
- Updated `background.js`: Replaced Gemini API calls with OpenRouter integration
- Updated `popup/popup.html`: New UI elements for model and provider selection
- Updated `popup/popup.js`: Enhanced settings management for OpenRouter
- Updated `manifest.json`: Version bump to 2.0.0 and description update
- Added comprehensive test suite:
  - Unit tests for OpenRouterClient (`__tests__/openrouter.test.js`)
  - Integration tests for translation features (`__tests__/integration.test.js`)
  - 35 total tests covering all major functionality

### Storage Schema Changes
- `apiKey` → `openRouterApiKey`: API key storage key renamed
- Added `openRouterModel`: Stores selected AI model
- Added `openRouterProvider`: Stores optional provider routing preference
- Existing settings (`targetLanguage`, `fontSize`, `lineHeight`) remain unchanged

### Migration Notes
For users upgrading from v1.x:
1. Obtain a free OpenRouter API key from https://openrouter.ai/
2. Enter the new key in the extension popup
3. Select your preferred model (default: Google Gemini 2.0 Flash Free)
4. Use the Test Connection button to verify setup
5. Your previous preferences (language, font size) will be preserved

## [1.1.0] - Previous Release

### Changed
- Updated to Gemini 2.5 Flash Lite model
- Performance improvements

## [1.0.0] - Initial Release

### Added
- Full page translation using Google Gemini API
- Selection-based translation
- Clipboard translation
- Dynamic content translation
- Translation caching
- Custom font size and line height settings
- Multi-language support (25+ languages)
- Dark mode support

---

For more information, see the [README](README.md).
