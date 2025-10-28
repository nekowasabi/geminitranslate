/**
 * DOMManipulator Unit Tests
 */

import { DOMManipulator } from '@content/domManipulator';

describe('DOMManipulator', () => {
  let domManipulator: DOMManipulator;
  let testContainer: HTMLElement;

  beforeEach(() => {
    domManipulator = new DOMManipulator();

    // Create test DOM structure
    testContainer = document.createElement('div');
    testContainer.id = 'test-container';
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Clean up test container if it exists
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
  });

  describe('extractTextNodes', () => {
    it('should extract text nodes from DOM', () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello World</p>
          <span>Test Text</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(2);
      expect(textNodes[0].node.textContent).toBe('Hello World');
      expect(textNodes[1].node.textContent).toBe('Test Text');
    });

    it('should exclude script tags', () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <script>console.log("hidden");</script>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe('Visible Text');
    });

    it('should exclude style tags', () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <style>.test { color: red; }</style>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe('Visible Text');
    });

    it('should exclude noscript and iframe tags', () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <noscript>No JS</noscript>
          <iframe src="test.html"></iframe>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe('Visible Text');
    });

    it('should exclude whitespace-only text nodes', () => {
      testContainer.innerHTML = `
        <div>
          <p>Text</p>
          <span>   </span>
          <div>Content</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(2);
      expect(textNodes[0].node.textContent?.trim()).toBe('Text');
      expect(textNodes[1].node.textContent?.trim()).toBe('Content');
    });

    it('should return TextNode array with node, text, and index properties', () => {
      testContainer.innerHTML = '<p>Test</p>';

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes[0]).toHaveProperty('node');
      expect(textNodes[0]).toHaveProperty('text');
      expect(textNodes[0]).toHaveProperty('index');
      expect(textNodes[0].text).toBe('Test');
      expect(textNodes[0].index).toBe(0);
    });

    it('should save original text to WeakMap during extraction', () => {
      testContainer.innerHTML = '<p>Original Text</p>';

      const textNodes = domManipulator.extractTextNodes();

      // Modify the text node
      textNodes[0].node.textContent = 'Modified Text';

      // Reset should restore original
      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe('Original Text');
    });
  });

  describe('applyTranslations', () => {
    it('should apply translations to text nodes', () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello</p>
          <span>World</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ['こんにちは', '世界'];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe('こんにちは');
      expect(textNodes[1].node.textContent).toBe('世界');
    });

    it('should handle mismatched array lengths gracefully', () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello</p>
          <span>World</span>
          <div>Test</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ['こんにちは', '世界']; // Only 2 translations for 3 nodes

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe('こんにちは');
      expect(textNodes[1].node.textContent).toBe('世界');
      expect(textNodes[2].node.textContent).toBe('Test'); // Unchanged
    });

    it('should skip empty translations', () => {
      testContainer.innerHTML = '<p>Hello</p>';

      const textNodes = domManipulator.extractTextNodes();
      const translations = [''];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe('Hello'); // Unchanged
    });

    it('should map translations by index', () => {
      testContainer.innerHTML = `
        <div>
          <p>First</p>
          <span>Second</span>
          <div>Third</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ['1番目', '2番目', '3番目'];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe('1番目');
      expect(textNodes[1].node.textContent).toBe('2番目');
      expect(textNodes[2].node.textContent).toBe('3番目');
    });
  });

  describe('reset', () => {
    it('should restore original text content', () => {
      testContainer.innerHTML = `
        <div>
          <p>Original Text</p>
          <span>Another Text</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ['翻訳済み', '別の翻訳'];

      domManipulator.applyTranslations(textNodes, translations);
      expect(textNodes[0].node.textContent).toBe('翻訳済み');

      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe('Original Text');
      expect(textNodes[1].node.textContent).toBe('Another Text');
    });

    it('should handle multiple reset calls', () => {
      testContainer.innerHTML = '<p>Original</p>';

      const textNodes = domManipulator.extractTextNodes();
      domManipulator.applyTranslations(textNodes, ['Translated']);

      domManipulator.reset();
      domManipulator.reset(); // Second reset

      expect(textNodes[0].node.textContent).toBe('Original');
    });

    it('should only reset nodes that were saved', () => {
      testContainer.innerHTML = '<p>Original</p>';

      const textNodes = domManipulator.extractTextNodes();

      // Add a new node after extraction
      const newP = document.createElement('p');
      newP.textContent = 'New Node';
      testContainer.appendChild(newP);

      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe('Original');
      expect(newP.textContent).toBe('New Node'); // Unchanged
    });
  });

  describe('saveOriginalText', () => {
    it('should save text to WeakMap', () => {
      testContainer.innerHTML = '<p>Test Text</p>';

      const textNode = testContainer.querySelector('p')!.firstChild as Node;

      domManipulator.saveOriginalText(textNode);

      // Modify the node
      textNode.textContent = 'Modified';

      // Reset should restore original
      domManipulator.reset();

      // Verify restoration
      expect(textNode.textContent).toBe('Test Text'); // Restored to original
    });
  });

  describe('edge cases', () => {
    it('should handle empty DOM', () => {
      testContainer.innerHTML = '';

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(0);
    });

    it('should handle nested structures', () => {
      testContainer.innerHTML = `
        <div>
          <div>
            <div>
              <p>Deeply Nested</p>
            </div>
          </div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe('Deeply Nested');
    });

    it('should handle multiple text nodes in single element', () => {
      const p = document.createElement('p');
      p.appendChild(document.createTextNode('First '));
      const strong = document.createElement('strong');
      strong.textContent = 'bold';
      p.appendChild(strong);
      p.appendChild(document.createTextNode(' Last'));
      testContainer.appendChild(p);

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(3);
      expect(textNodes[0].node.textContent).toBe('First ');
      expect(textNodes[1].node.textContent).toBe('bold');
      expect(textNodes[2].node.textContent).toBe(' Last');
    });
  });

  describe('detectViewportNodes', () => {
    beforeEach(() => {
      // Mock window dimensions
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800,
      });
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1200,
      });
    });

    it('should detect nodes in viewport', () => {
      testContainer.innerHTML = '<p>Viewport Text</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect to return viewport position
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(1);
      expect(result.outOfViewport.length).toBe(0);
      expect(result.viewport[0].text).toBe('Viewport Text');
    });

    it('should detect nodes out of viewport (below)', () => {
      testContainer.innerHTML = '<p>Below Viewport</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect to return position below viewport
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 900, // Below window.innerHeight (800)
        bottom: 1000,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 900,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
      expect(result.outOfViewport[0].text).toBe('Below Viewport');
    });

    it('should detect nodes out of viewport (above)', () => {
      testContainer.innerHTML = '<p>Above Viewport</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect to return position above viewport
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: -200,
        bottom: -100, // Above viewport (bottom < 0)
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: -200,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it('should detect nodes out of viewport (left)', () => {
      testContainer.innerHTML = '<p>Left of Viewport</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect to return position left of viewport
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: -300,
        right: -100, // Left of viewport (right < 0)
        width: 200,
        height: 100,
        x: -300,
        y: 100,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it('should detect nodes out of viewport (right)', () => {
      testContainer.innerHTML = '<p>Right of Viewport</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect to return position right of viewport
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 1300, // Right of window.innerWidth (1200)
        right: 1500,
        width: 200,
        height: 100,
        x: 1300,
        y: 100,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it('should handle boundary cases - partially visible nodes', () => {
      testContainer.innerHTML = '<p>Partially Visible</p>';
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect - node crosses viewport boundary
      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 750, // Starts in viewport
        bottom: 850, // Ends below viewport
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 750,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      // Partially visible nodes should be counted as IN viewport
      expect(result.viewport.length).toBe(1);
      expect(result.outOfViewport.length).toBe(0);
    });

    it('should handle multiple nodes - mixed viewport/out-of-viewport', () => {
      testContainer.innerHTML = `
        <div>
          <p id="p1">In Viewport 1</p>
          <p id="p2">Out of Viewport</p>
          <p id="p3">In Viewport 2</p>
        </div>
      `;
      const textNodes = domManipulator.extractTextNodes();

      // Mock getBoundingClientRect for each node
      const p1 = document.getElementById('p1')!;
      p1.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => {},
      }));

      const p2 = document.getElementById('p2')!;
      p2.getBoundingClientRect = jest.fn(() => ({
        top: 900,
        bottom: 1000,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 900,
        toJSON: () => {},
      }));

      const p3 = document.getElementById('p3')!;
      p3.getBoundingClientRect = jest.fn(() => ({
        top: 300,
        bottom: 400,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 300,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(2);
      expect(result.outOfViewport.length).toBe(1);
      expect(result.viewport[0].text).toBe('In Viewport 1');
      expect(result.viewport[1].text).toBe('In Viewport 2');
      expect(result.outOfViewport[0].text).toBe('Out of Viewport');
    });

    it('should return empty arrays for empty input', () => {
      const result = domManipulator.detectViewportNodes([]);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(0);
    });

    it('should preserve TextNode properties in result', () => {
      testContainer.innerHTML = '<p>Test Node</p>';
      const textNodes = domManipulator.extractTextNodes();

      const mockElement = textNodes[0].node.parentElement!;
      mockElement.getBoundingClientRect = jest.fn(() => ({
        top: 100,
        bottom: 200,
        left: 100,
        right: 300,
        width: 200,
        height: 100,
        x: 100,
        y: 100,
        toJSON: () => {},
      }));

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport[0]).toHaveProperty('node');
      expect(result.viewport[0]).toHaveProperty('text');
      expect(result.viewport[0]).toHaveProperty('index');
      expect(result.viewport[0].index).toBe(0);
    });
  });
});
