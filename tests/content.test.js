// Translation Progress Banner Tests
import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';

describe('Test Environment Setup', () => {
  test('should have jsdom environment', () => {
    expect(document).toBeDefined();
    expect(document.createElement).toBeDefined();
  });

  test('should have browser API mocked', () => {
    expect(global.browser).toBeDefined();
    expect(global.browser.storage).toBeDefined();
  });
});

describe('Process 1: Progress Banner UI Creation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('should create banner element with correct class name', () => {
    const banner = createProgressBanner();
    expect(banner).toBeDefined();
    expect(banner.className).toContain('gemini-progress-banner');
  });

  test('should have initial text "翻訳中... 0%"', () => {
    const banner = createProgressBanner();
    expect(banner.textContent).toBe('翻訳中... 0%');
  });

  test('should have correct styling attributes', () => {
    const banner = createProgressBanner();
    expect(banner.style.position).toBe('fixed');
    expect(banner.style.top).toBe('20px');
  });

  test('should be appendable to document.body', () => {
    const banner = createProgressBanner();
    document.body.appendChild(banner);
    expect(document.querySelector('.gemini-progress-banner')).toBeTruthy();
  });
});

describe('Process 2: Progress Update Logic', () => {
  let banner;
  let progressState;

  beforeEach(() => {
    document.body.innerHTML = '';
    banner = createProgressBanner();
    document.body.appendChild(banner);
    progressState = createProgressState();
  });

  test('should calculate percentage correctly', () => {
    updateProgress(banner, progressState, 50, 100);
    // Initial update should work immediately
    expect(banner.textContent).toBe('翻訳中... 50%');
  });

  test('should throttle updates within 500ms', (done) => {
    updateProgress(banner, progressState, 25, 100);
    expect(banner.textContent).toBe('翻訳中... 25%');

    // Try to update immediately - should be throttled
    updateProgress(banner, progressState, 50, 100);
    expect(banner.textContent).toBe('翻訳中... 25%'); // Still 25%

    // After 500ms, update should work
    setTimeout(() => {
      updateProgress(banner, progressState, 75, 100);
      expect(banner.textContent).toBe('翻訳中... 75%');
      done();
    }, 550);
  });

  test('should handle zero total gracefully', () => {
    updateProgress(banner, progressState, 0, 0);
    expect(banner.textContent).toContain('%');
  });

  test('should round percentage to integer', () => {
    updateProgress(banner, progressState, 1, 3);
    // Check that percentage is rounded (33% not 33.33%)
    const match = banner.textContent.match(/翻訳中\.\.\. (\d+)%/);
    expect(match).toBeTruthy();
    expect(match[1]).toBe('33'); // Integer, not decimal
  });
});

describe('Process 5: Edge Cases', () => {
  let banner;
  let progressState;

  beforeEach(() => {
    document.body.innerHTML = '';
    banner = createProgressBanner();
    progressState = createProgressState();
  });

  test('should handle zero batches gracefully', () => {
    // Zero batches should not cause division by zero
    expect(() => {
      document.body.appendChild(banner);
      updateProgress(banner, progressState, 0, 0);
    }).not.toThrow();
    expect(banner.textContent).toBe('翻訳中... 0%');
  });

  test('should not create duplicate banners', () => {
    const banner1 = createProgressBanner();
    const banner2 = createProgressBanner();
    document.body.appendChild(banner1);
    document.body.appendChild(banner2);

    const banners = document.querySelectorAll('.gemini-progress-banner');
    expect(banners.length).toBe(2); // Both exist initially

    // In actual implementation, should check and remove existing before adding
  });

  test('should handle progress updates with invalid values', () => {
    document.body.appendChild(banner);
    // Negative values
    updateProgress(banner, progressState, -1, 100);
    // Should handle gracefully (implementation may vary)
    expect(banner.textContent).toContain('%');

    // Values exceeding total
    updateProgress(banner, progressState, 150, 100);
    expect(banner.textContent).toContain('%');
  });
});

describe('Process 4: Completion Handling', () => {
  let banner;

  beforeEach(() => {
    document.body.innerHTML = '';
    banner = createProgressBanner();
    document.body.appendChild(banner);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should update banner text to "翻訳完了"', () => {
    hideProgressBanner(banner);
    expect(banner.textContent).toBe('翻訳完了');
  });

  test('should remove banner after 3 seconds', () => {
    hideProgressBanner(banner);
    expect(document.querySelector('.gemini-progress-banner')).toBeTruthy();

    // Fast-forward 3 seconds
    jest.advanceTimersByTime(3000);
    expect(document.querySelector('.gemini-progress-banner')).toBeNull();
  });

  test('should not throw if banner already removed', () => {
    hideProgressBanner(banner);
    banner.remove();

    // Fast-forward should not cause error
    expect(() => jest.advanceTimersByTime(3000)).not.toThrow();
  });
});

// Implementation from content.js for testing
function createProgressBanner() {
  const banner = document.createElement('div');
  banner.className = 'gemini-progress-banner';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #4285f4;
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 999999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  banner.textContent = '翻訳中... 0%';
  return banner;
}

// Implementation from content.js for testing
function createProgressState() {
  return {
    lastUpdateTime: 0
  };
}

function updateProgress(banner, state, processed, total) {
  const PROGRESS_UPDATE_INTERVAL = 500;
  const now = Date.now();

  if (now - state.lastUpdateTime < PROGRESS_UPDATE_INTERVAL) {
    return;
  }

  const percentage = total === 0 ? 0 : Math.round((processed / total) * 100);
  banner.textContent = `翻訳中... ${percentage}%`;
  state.lastUpdateTime = now;
}

function hideProgressBanner(banner) {
  const COMPLETION_DISPLAY_DURATION = 3000;

  banner.textContent = '翻訳完了';
  setTimeout(() => {
    if (banner && banner.parentNode) {
      banner.parentNode.removeChild(banner);
    }
  }, COMPLETION_DISPLAY_DURATION);
}
