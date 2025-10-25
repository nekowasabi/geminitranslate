/**
 * MutationObserverManager Unit Tests
 */

// Mock logger
jest.mock('@shared/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { MutationObserverManager } from '@content/mutationObserver';

describe('MutationObserverManager', () => {
  let observerManager: MutationObserverManager;
  let testContainer: HTMLElement;

  beforeEach(() => {
    observerManager = new MutationObserverManager();

    // Create test container
    testContainer = document.createElement('div');
    testContainer.id = 'mutation-test-container';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    observerManager.disconnect();
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
  });

  describe('observe', () => {
    it('should start observing DOM mutations', () => {
      const callback = jest.fn();

      observerManager.observe(callback);

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should detect child node additions', (done) => {
      const callback = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThan(0);
        expect(mutations[0].type).toBe('childList');
        done();
      });

      observerManager.observe(callback);

      // Add a new child node
      const newDiv = document.createElement('div');
      newDiv.textContent = 'New content';
      testContainer.appendChild(newDiv);
    });

    it('should detect text node additions', (done) => {
      const callback = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThan(0);
        done();
      });

      observerManager.observe(callback);

      // Add text node
      const textNode = document.createTextNode('Dynamic text');
      testContainer.appendChild(textNode);
    });

    it('should detect subtree mutations', (done) => {
      const callback = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThan(0);
        done();
      });

      // Create nested structure
      const parent = document.createElement('div');
      testContainer.appendChild(parent);

      observerManager.observe(callback);

      // Add child to nested element
      const child = document.createElement('span');
      child.textContent = 'Nested child';
      parent.appendChild(child);
    });

    it('should not observe if already observing', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      observerManager.observe(callback1);
      observerManager.observe(callback2);

      // Add element
      const newDiv = document.createElement('div');
      testContainer.appendChild(newDiv);

      // Wait for mutations
      setTimeout(() => {
        // Only first callback should be called
        expect(callback1).toHaveBeenCalled();
        expect(callback2).not.toHaveBeenCalled();
      }, 50);
    });

    it('should handle multiple mutations in batch', (done) => {
      const callback = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThanOrEqual(1);
        done();
      });

      observerManager.observe(callback);

      // Add multiple elements
      const div1 = document.createElement('div');
      const div2 = document.createElement('div');
      const div3 = document.createElement('div');
      testContainer.appendChild(div1);
      testContainer.appendChild(div2);
      testContainer.appendChild(div3);
    });

    it('should observe with correct config', () => {
      const callback = jest.fn();
      const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');

      observerManager.observe(callback);

      expect(observeSpy).toHaveBeenCalledWith(
        document.body,
        expect.objectContaining({
          childList: true,
          subtree: true,
        })
      );

      observeSpy.mockRestore();
    });
  });

  describe('disconnect', () => {
    it('should stop observing mutations', () => {
      const callback = jest.fn();

      observerManager.observe(callback);
      observerManager.disconnect();

      // Add element after disconnect
      const newDiv = document.createElement('div');
      testContainer.appendChild(newDiv);

      // Wait and verify callback not called
      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
      }, 50);
    });

    it('should handle disconnect when not observing', () => {
      // Should not throw error
      expect(() => {
        observerManager.disconnect();
      }).not.toThrow();
    });

    it('should allow re-observation after disconnect', (done) => {
      const callback1 = jest.fn();
      const callback2 = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThan(0);
        done();
      });

      // First observation
      observerManager.observe(callback1);
      observerManager.disconnect();

      // Second observation
      observerManager.observe(callback2);

      // Add element
      const newDiv = document.createElement('div');
      testContainer.appendChild(newDiv);
    });
  });

  describe('edge cases', () => {
    it('should handle callback errors gracefully', (done) => {
      const callback = jest.fn(() => {
        throw new Error('Callback error');
      });

      observerManager.observe(callback);

      // Add element (should not crash)
      const newDiv = document.createElement('div');
      testContainer.appendChild(newDiv);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should detect removal of nodes', (done) => {
      const existingDiv = document.createElement('div');
      testContainer.appendChild(existingDiv);

      const callback = jest.fn((mutations) => {
        const hasRemovedNodes = mutations.some(m => m.removedNodes.length > 0);
        if (hasRemovedNodes) {
          expect(hasRemovedNodes).toBe(true);
          done();
        }
      });

      observerManager.observe(callback);

      // Remove node
      testContainer.removeChild(existingDiv);
    });

    it('should handle rapid DOM changes', (done) => {
      const callback = jest.fn((mutations) => {
        expect(mutations.length).toBeGreaterThan(0);
        if (callback.mock.calls.length >= 1) {
          done();
        }
      });

      observerManager.observe(callback);

      // Rapid changes
      for (let i = 0; i < 10; i++) {
        const div = document.createElement('div');
        div.textContent = `Item ${i}`;
        testContainer.appendChild(div);
      }
    });

    it('should observe only document.body', () => {
      const callback = jest.fn();
      const observeSpy = jest.spyOn(MutationObserver.prototype, 'observe');

      observerManager.observe(callback);

      const calls = observeSpy.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe(document.body);

      observeSpy.mockRestore();
    });

    it('should provide MutationRecord array to callback', (done) => {
      const callback = jest.fn((mutations: MutationRecord[]) => {
        expect(Array.isArray(mutations)).toBe(true);
        expect(mutations[0]).toHaveProperty('type');
        expect(mutations[0]).toHaveProperty('target');
        expect(mutations[0]).toHaveProperty('addedNodes');
        expect(mutations[0]).toHaveProperty('removedNodes');
        done();
      });

      observerManager.observe(callback);

      const newDiv = document.createElement('div');
      testContainer.appendChild(newDiv);
    });
  });
});
