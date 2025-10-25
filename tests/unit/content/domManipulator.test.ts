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
});
