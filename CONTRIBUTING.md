# Contributing to DoganayLab API Translate App

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to this project.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

### Our Pledge
We are committed to providing a welcoming and inspiring community for all. Please be respectful and constructive in all interactions.

### Expected Behavior
- Use welcoming and inclusive language
- Respect differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community

### Unacceptable Behavior
- Trolling, insulting/derogatory comments, and personal attacks
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

---

## Getting Started

### Prerequisites
- **Node.js**: 16+ and npm 8+
- **Git**: For version control
- **Browser**: Chrome 88+ or Firefox 91+
- **Code Editor**: VS Code recommended (with ESLint and TypeScript extensions)

### Setting Up Development Environment

1. **Fork the Repository**
   ```bash
   # Click "Fork" button on GitHub
   # Then clone your fork
   git clone https://github.com/YOUR_USERNAME/geminitranslate.git
   cd geminitranslate
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # Or for bug fixes:
   git checkout -b fix/issue-number-description
   ```

4. **Run Tests**
   ```bash
   npm test
   ```

5. **Build the Extension**
   ```bash
   npm run build:chrome   # For Chrome
   npm run build:firefox  # For Firefox
   ```

---

## Development Workflow

### Branch Naming Convention
- `feature/feature-name` - New features
- `fix/issue-number-description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/fixes

### Commit Message Format
Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```
feat(popup): add model selector dropdown

Add a dropdown menu to allow users to select AI models.
Includes Gemini, Claude, and GPT-4o options.

Closes #123
```

```
fix(cache): resolve memory leak in LRU cache

Fixed issue where evicted cache entries were not
properly garbage collected.

Fixes #456
```

### Development Commands
```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run linter
npm run lint

# Fix linting issues
npm run lint -- --fix

# Type check
npx tsc --noEmit

# Build for Chrome
npm run build:chrome

# Build for Firefox
npm run build:firefox

# Development mode (watch)
npm run dev:chrome
npm run dev:firefox
```

---

## Coding Standards

### TypeScript
- **Strict Mode**: Enabled (`strict: true` in tsconfig.json)
- **No Explicit Any**: Avoid `any` type, use proper typing
- **Interfaces over Types**: Prefer `interface` for object shapes
- **Named Exports**: Use named exports instead of default exports

**Example:**
```typescript
// ✅ Good
export interface StorageData {
  apiKey: string;
  model: string;
}

export const storageManager = new StorageManager();

// ❌ Bad
export default class StorageManager { ... }
export type StorageData = any;
```

### React
- **Functional Components**: Use function components with hooks
- **TypeScript**: Type all props and state
- **Memoization**: Use `React.memo()` for performance-critical components
- **Hooks**: Use `useCallback()` and `useMemo()` where appropriate

**Example:**
```typescript
// ✅ Good
export interface ButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = React.memo(({ onClick, disabled, children }) => {
  const handleClick = React.useCallback(() => {
    onClick();
  }, [onClick]);

  return (
    <button onClick={handleClick} disabled={disabled}>
      {children}
    </button>
  );
});
```

### ESLint
- Follow the project's ESLint configuration
- Run `npm run lint` before committing
- Fix all errors and warnings

### Documentation
- **JSDoc Comments**: Add JSDoc for all public functions/classes
- **README**: Update if adding new features
- **ARCHITECTURE.md**: Update if changing architecture

**Example:**
```typescript
/**
 * Translates an array of texts to the target language
 * @param texts - Array of texts to translate
 * @param targetLanguage - Target language code (ISO 639-1)
 * @returns Promise resolving to array of translated texts
 * @throws {ApiError} If API key is invalid or API call fails
 */
async translateBatch(texts: string[], targetLanguage: string): Promise<string[]> {
  // Implementation
}
```

---

## Testing

### Test Strategy
- **Unit Tests**: Test individual functions/classes
- **Integration Tests**: Test component interactions
- **E2E Tests**: Test full user workflows

### Writing Tests
- Use Jest for unit and integration tests
- Aim for >80% code coverage
- Test edge cases and error handling

**Example:**
```typescript
describe('TranslationEngine', () => {
  let engine: TranslationEngine;

  beforeEach(async () => {
    engine = new TranslationEngine();
    await engine.initialize();
  });

  test('should translate batch of texts', async () => {
    const texts = ['Hello', 'World'];
    const result = await engine.translateBatch(texts, 'ja');

    expect(result).toHaveLength(2);
    expect(result[0]).toBe('こんにちは');
    expect(result[1]).toBe('世界');
  });

  test('should throw ApiError for invalid API key', async () => {
    // Mock invalid API key
    await expect(
      engine.translateBatch(['test'], 'ja')
    ).rejects.toThrow(ApiError);
  });
});
```

### Running Tests
```bash
# All tests
npm test

# Specific test file
npm test -- translationEngine.test.ts

# Watch mode
npm test -- --watch

# Coverage report
npm test -- --coverage
```

---

## Pull Request Process

### Before Submitting
1. **Update from main**
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Run all checks**
   ```bash
   npm run lint
   npm test
   npm run build:chrome
   npm run build:firefox
   ```

3. **Update documentation**
   - Update README.md if needed
   - Add/update JSDoc comments
   - Update ARCHITECTURE.md if architecture changed

### Submitting PR
1. **Push to your fork**
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Create Pull Request**
   - Go to GitHub and click "New Pull Request"
   - Fill in the PR template
   - Link related issues (e.g., "Closes #123")

3. **PR Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests added/updated
   - [ ] Integration tests added/updated
   - [ ] Manual testing performed

   ## Checklist
   - [ ] Code follows project style guidelines
   - [ ] Self-review performed
   - [ ] Comments added for complex code
   - [ ] Documentation updated
   - [ ] No new warnings generated
   - [ ] Tests pass locally

   ## Screenshots (if applicable)
   ```

### Review Process
- Maintainers will review your PR
- Address feedback and push updates
- Once approved, PR will be merged

---

## Reporting Bugs

### Before Reporting
1. **Search existing issues** to avoid duplicates
2. **Reproduce the bug** in the latest version
3. **Check browser console** for error messages

### Bug Report Template
```markdown
## Bug Description
Clear and concise description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior
What you expected to happen

## Actual Behavior
What actually happened

## Screenshots
If applicable

## Environment
- Browser: [e.g., Chrome 120, Firefox 121]
- Extension Version: [e.g., 3.0.0]
- OS: [e.g., Windows 11, macOS 14]

## Console Logs
```
Paste relevant console logs here
```

## Additional Context
Any other context about the problem
```

---

## Feature Requests

### Before Requesting
1. **Search existing issues** to avoid duplicates
2. **Consider if the feature fits the project scope**

### Feature Request Template
```markdown
## Feature Description
Clear and concise description of the feature

## Problem Statement
What problem does this feature solve?

## Proposed Solution
How should this feature work?

## Alternatives Considered
Other solutions you've considered

## Additional Context
Any other context, screenshots, or mockups
```

---

## Project Structure

```
geminitranslate/
├── src/
│   ├── shared/          # Shared utilities (BrowserAdapter, StorageManager, etc.)
│   ├── background/      # Background service worker
│   ├── content/         # Content scripts (DOM manipulation)
│   ├── popup/           # Popup UI (React)
│   └── options/         # Options UI (React)
├── tests/               # Test files
├── __tests__/           # Integration tests
├── docs/                # Documentation
│   ├── API.md
│   └── USER_GUIDE.md
├── webpack/             # Webpack configurations
├── public/              # Static assets
└── dist-{browser}/      # Build outputs
```

---

## Resources

### Documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture overview
- [API.md](docs/API.md) - API specification
- [USER_GUIDE.md](docs/USER_GUIDE.md) - User guide

### External Resources
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev/)
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [Firefox WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [OpenRouter API Docs](https://openrouter.ai/docs)

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

If you have questions, feel free to:
- Open an issue on GitHub
- Contact the maintainers

Thank you for contributing! 🎉
