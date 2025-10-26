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
- **Progress notification during page translation** - Real-time progress updates with visual feedback

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

## Messaging Architecture

### Message Format Standard
All messages between Content Script and Background Script **must** include both `type` and `action` properties:

```typescript
{
  type: MessageType.REQUEST_TRANSLATION,  // Enum value identifying message category
  action: 'requestTranslation',           // String identifier for MessageHandler routing
  payload: {                              // Message-specific data (optional)
    texts: ['Hello'],
    targetLanguage: 'Japanese',
  },
}
```

### Why Both `type` and `action`?
- **`type`**: MessageType enum value for compile-time type safety and categorization
- **`action`**: String identifier used by MessageHandler for runtime routing to appropriate handlers

### Message Type Examples

#### Translation Request (Content → Background)
```typescript
const message: TranslationRequestMessage = {
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: {
    texts: ['Hello', 'World'],
    targetLanguage: 'Japanese',
  },
};
```

#### Test Connection (Options → Background)
```typescript
const message: TestConnectionMessage = {
  type: MessageType.TEST_CONNECTION,
  action: 'testConnection',
  payload: {},  // Optional
};
```

#### Translation Progress (Background → Content)
```typescript
const message: TranslationProgressMessage = {
  type: MessageType.TRANSLATION_PROGRESS,
  payload: {
    current: 5,      // Number of completed batches
    total: 10,       // Total number of batches
    percentage: 50,  // Completion percentage (0-100)
  },
};
```

#### Translation Error (Background → Content)
```typescript
const message: TranslationErrorMessage = {
  type: MessageType.TRANSLATION_ERROR,
  payload: {
    error: 'API rate limit exceeded',  // Error message
    code: 'RATE_LIMIT',                // Optional error code
  },
};
```

### MessageHandler Routing
The `MessageHandler` class uses the `action` property to route messages to appropriate handlers:

```typescript
private actionHandlers: Map<string, ActionHandler> = new Map([
  ['requestTranslation', this.handleRequestTranslation.bind(this)],
  ['clearCache', this.handleClearCache.bind(this)],
  ['getCacheStats', this.handleGetCacheStats.bind(this)],
  ['testConnection', this.handleTestConnection.bind(this)],
]);
```

### Backward Compatibility
MessageHandler includes a fallback mechanism (`inferActionFromType`) that infers `action` from `type` when `action` is missing, ensuring backward compatibility with older message formats.

### Adding New Message Types

When adding a new message type, follow these steps:

1. **Define interface in `src/shared/messages/types.ts`**:
   ```typescript
   export interface YourNewMessage extends BaseMessage {
     type: MessageType.YOUR_NEW_TYPE;
     action: 'yourNewAction';  // REQUIRED (for Content → Background messages)
     payload: {
       // Your payload structure
     };
   }
   ```

   **Note**: The `action` property is **only required for messages sent from Content Script to Background Script** (e.g., TranslationRequestMessage, TestConnectionMessage). Progress and error notifications sent from Background to Content (TranslationProgressMessage, TranslationErrorMessage) do not need an `action` property as they are not routed through MessageHandler.

2. **Add to Message union type**:
   ```typescript
   export type Message =
     | TranslationRequestMessage
     | YourNewMessage  // Add here
     | ...;
   ```

3. **Add handler in `src/background/messageHandler.ts`**:
   ```typescript
   constructor(engine: TranslationEngine, client: OpenRouterClient) {
     this.actionHandlers = new Map([
       ['requestTranslation', this.handleRequestTranslation.bind(this)],
       ['yourNewAction', this.handleYourNewAction.bind(this)],  // Add here
       ...
     ]);
   }

   private async handleYourNewAction(
     payload: any,
     sendResponse: (response: HandlerResponse) => void
   ): Promise<void> {
     // Implementation
   }
   ```

4. **Update tests in `tests/unit/background/messageHandler.test.ts`**:
   ```typescript
   it('should handle yourNewAction', async () => {
     const message = {
       type: MessageType.YOUR_NEW_TYPE,
       action: 'yourNewAction',
       payload: { /* test data */ },
     };
     // Test implementation
   });
   ```

### Common Pitfalls to Avoid
1. ❌ **Forgetting `action` property**: Messages without `action` will be rejected by MessageHandler
2. ❌ **Inconsistent action naming**: Action string must match the key in `actionHandlers` Map
3. ❌ **Missing JSDoc**: Always document message purpose and provide usage examples
4. ❌ **Skipping tests**: Every new message type must have corresponding test cases