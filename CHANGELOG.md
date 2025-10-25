# Changelog

All notable changes to the AI Translator Firefox Extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
