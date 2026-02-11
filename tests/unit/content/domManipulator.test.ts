/**
 * DOMManipulator Unit Tests
 */

import { DOMManipulator } from "@content/domManipulator";

describe("DOMManipulator", () => {
  let domManipulator: DOMManipulator;
  let testContainer: HTMLElement;

  beforeEach(() => {
    domManipulator = new DOMManipulator();

    // Create test DOM structure
    testContainer = document.createElement("div");
    testContainer.id = "test-container";
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    // Clean up test container if it exists
    if (testContainer && testContainer.parentNode) {
      testContainer.parentNode.removeChild(testContainer);
    }
  });

  describe("extractTextNodes", () => {
    it("should extract text nodes from DOM", () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello World</p>
          <span>Test Text</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(2);
      expect(textNodes[0].node.textContent).toBe("Hello World");
      expect(textNodes[1].node.textContent).toBe("Test Text");
    });

    it("should exclude script tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <script>console.log("hidden");</script>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe("Visible Text");
    });

    it("should exclude style tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <style>.test { color: red; }</style>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe("Visible Text");
    });

    it("should exclude noscript and iframe tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <noscript>No JS</noscript>
          <iframe src="test.html"></iframe>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].node.textContent).toBe("Visible Text");
    });

    it("should exclude whitespace-only text nodes", () => {
      testContainer.innerHTML = `
        <div>
          <p>Text</p>
          <span>   </span>
          <div>Content</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(2);
      expect(textNodes[0].node.textContent?.trim()).toBe("Text");
      expect(textNodes[1].node.textContent?.trim()).toBe("Content");
    });

    it("should return TextNode array with node, text, and index properties", () => {
      testContainer.innerHTML = "<p>Test</p>";

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes[0]).toHaveProperty("node");
      expect(textNodes[0]).toHaveProperty("text");
      expect(textNodes[0]).toHaveProperty("index");
      expect(textNodes[0].text).toBe("Test");
      expect(textNodes[0].index).toBe(0);
    });

    it("should save original text to WeakMap during extraction", () => {
      testContainer.innerHTML = "<p>Original Text</p>";

      const textNodes = domManipulator.extractTextNodes();

      // Modify the text node
      textNodes[0].node.textContent = "Modified Text";

      // Reset should restore original
      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe("Original Text");
    });
  });

  describe("applyTranslations", () => {
    it("should apply translations to text nodes", () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello</p>
          <span>World</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ["こんにちは", "世界"];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe("こんにちは");
      expect(textNodes[1].node.textContent).toBe("世界");
    });

    it("should handle mismatched array lengths gracefully", () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello</p>
          <span>World</span>
          <div>Test</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ["こんにちは", "世界"]; // Only 2 translations for 3 nodes

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe("こんにちは");
      expect(textNodes[1].node.textContent).toBe("世界");
      expect(textNodes[2].node.textContent).toBe("Test"); // Unchanged
    });

    it("should skip empty translations", () => {
      testContainer.innerHTML = "<p>Hello</p>";

      const textNodes = domManipulator.extractTextNodes();
      const translations = [""];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe("Hello"); // Unchanged
    });

    it("should map translations by index", () => {
      testContainer.innerHTML = `
        <div>
          <p>First</p>
          <span>Second</span>
          <div>Third</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ["1番目", "2番目", "3番目"];

      domManipulator.applyTranslations(textNodes, translations);

      expect(textNodes[0].node.textContent).toBe("1番目");
      expect(textNodes[1].node.textContent).toBe("2番目");
      expect(textNodes[2].node.textContent).toBe("3番目");
    });
  });

  describe("reset", () => {
    it("should restore original text content", () => {
      testContainer.innerHTML = `
        <div>
          <p>Original Text</p>
          <span>Another Text</span>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();
      const translations = ["翻訳済み", "別の翻訳"];

      domManipulator.applyTranslations(textNodes, translations);
      expect(textNodes[0].node.textContent).toBe("翻訳済み");

      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe("Original Text");
      expect(textNodes[1].node.textContent).toBe("Another Text");
    });

    it("should handle multiple reset calls", () => {
      testContainer.innerHTML = "<p>Original</p>";

      const textNodes = domManipulator.extractTextNodes();
      domManipulator.applyTranslations(textNodes, ["Translated"]);

      domManipulator.reset();
      domManipulator.reset(); // Second reset

      expect(textNodes[0].node.textContent).toBe("Original");
    });

    it("should only reset nodes that were saved", () => {
      testContainer.innerHTML = "<p>Original</p>";

      const textNodes = domManipulator.extractTextNodes();

      // Add a new node after extraction
      const newP = document.createElement("p");
      newP.textContent = "New Node";
      testContainer.appendChild(newP);

      domManipulator.reset();

      expect(textNodes[0].node.textContent).toBe("Original");
      expect(newP.textContent).toBe("New Node"); // Unchanged
    });
  });

  describe("saveOriginalText", () => {
    it("should save text to WeakMap", () => {
      testContainer.innerHTML = "<p>Test Text</p>";

      const textNode = testContainer.querySelector("p")!.firstChild as Node;

      domManipulator.saveOriginalText(textNode);

      // Modify the node
      textNode.textContent = "Modified";

      // Reset should restore original
      domManipulator.reset();

      // Verify restoration
      expect(textNode.textContent).toBe("Test Text"); // Restored to original
    });
  });

  describe("text normalization", () => {
    it("should trim whitespace from extracted text", () => {
      testContainer.innerHTML = "<p>  Hello World  </p>";

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      // Text should be trimmed
      expect(textNodes[0].text).toBe("Hello World");
    });

    it("should normalize text with leading/trailing newlines", () => {
      testContainer.innerHTML = "<p>\n\nHello\n\n</p>";

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(1);
      expect(textNodes[0].text).toBe("Hello");
    });
  });

  describe("duplicate text handling", () => {
    it("should detect duplicate texts", () => {
      testContainer.innerHTML = `
        <div>
          <p>Same Text</p>
          <span>Same Text</span>
          <div>Same Text</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      // Should extract all nodes, but mark duplicates
      expect(textNodes.length).toBe(3);
      // All nodes should have same text
      expect(textNodes[0].text).toBe("Same Text");
      expect(textNodes[1].text).toBe("Same Text");
      expect(textNodes[2].text).toBe("Same Text");
    });

    it("should handle duplicate texts with different whitespace", () => {
      testContainer.innerHTML = `
        <div>
          <p>Hello World</p>
          <span>  Hello World  </span>
          <div>Hello World</div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      // After normalization, all should be 'Hello World'
      expect(textNodes.length).toBe(3);
      textNodes.forEach((node) => {
        expect(node.text).toBe("Hello World");
      });
    });
  });

  describe("EXCLUSION_SELECTORS filtering", () => {
    it("should exclude SVG tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <svg><text>SVG Text</text></svg>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Visible Text");
      expect(texts).not.toContain("SVG Text");
    });

    it("should exclude CANVAS tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <canvas>Canvas Fallback Text</canvas>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Visible Text");
      expect(texts).not.toContain("Canvas Fallback Text");
    });

    it("should exclude CODE tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <code>const x = 1;</code>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Visible Text");
      expect(texts).not.toContain("const x = 1;");
    });

    it("should exclude PRE tags", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible Text</p>
          <pre>Preformatted code block</pre>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Visible Text");
      expect(texts).not.toContain("Preformatted code block");
    });

    it("should exclude contenteditable elements", () => {
      testContainer.innerHTML = `
        <div>
          <p>Normal Text</p>
          <div contenteditable="true">
            <p>Editable Text</p>
          </div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Normal Text");
      expect(texts).not.toContain("Editable Text");
    });

    it("should exclude data-no-translate elements", () => {
      testContainer.innerHTML = `
        <div>
          <p>Translate Me</p>
          <div data-no-translate>
            <p>Do Not Translate</p>
          </div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Translate Me");
      expect(texts).not.toContain("Do Not Translate");
    });

    it("should exclude .no-translate class elements", () => {
      testContainer.innerHTML = `
        <div>
          <p>Translate Me</p>
          <div class="no-translate">
            <p>Skip This</p>
          </div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Translate Me");
      expect(texts).not.toContain("Skip This");
    });

    it("should exclude deeply nested text inside excluded ancestors", () => {
      testContainer.innerHTML = `
        <div>
          <p>Visible</p>
          <div data-no-translate>
            <div>
              <span>
                <p>Deeply Nested Excluded</p>
              </span>
            </div>
          </div>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Visible");
      expect(texts).not.toContain("Deeply Nested Excluded");
    });

    it("should exclude text inside CODE nested within PRE", () => {
      testContainer.innerHTML = `
        <div>
          <p>Normal Text</p>
          <pre><code>function hello() { return "world"; }</code></pre>
        </div>
      `;

      const textNodes = domManipulator.extractTextNodes();

      const texts = textNodes.map((n) => n.text);
      expect(texts).toContain("Normal Text");
      expect(texts).not.toContain('function hello() { return "world"; }');
    });
  });

  describe("edge cases", () => {
    it("should handle empty DOM", () => {
      testContainer.innerHTML = "";

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(0);
    });

    it("should handle nested structures", () => {
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
      expect(textNodes[0].node.textContent).toBe("Deeply Nested");
    });

    it("should handle multiple text nodes in single element", () => {
      const p = document.createElement("p");
      p.appendChild(document.createTextNode("First "));
      const strong = document.createElement("strong");
      strong.textContent = "bold";
      p.appendChild(strong);
      p.appendChild(document.createTextNode(" Last"));
      testContainer.appendChild(p);

      const textNodes = domManipulator.extractTextNodes();

      expect(textNodes.length).toBe(3);
      expect(textNodes[0].node.textContent).toBe("First ");
      expect(textNodes[1].node.textContent).toBe("bold");
      expect(textNodes[2].node.textContent).toBe(" Last");
    });
  });

  describe("detectViewportNodes", () => {
    beforeEach(() => {
      // Mock window dimensions
      Object.defineProperty(window, "innerHeight", {
        writable: true,
        configurable: true,
        value: 800,
      });
      Object.defineProperty(window, "innerWidth", {
        writable: true,
        configurable: true,
        value: 1200,
      });
    });

    it("should detect nodes in viewport", () => {
      testContainer.innerHTML = "<p>Viewport Text</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() for text node position
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 100,
          bottom: 200,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 100,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(1);
      expect(result.outOfViewport.length).toBe(0);
      expect(result.viewport[0].text).toBe("Viewport Text");
    });

    it("should detect nodes out of viewport (below)", () => {
      testContainer.innerHTML = "<p>Below Viewport</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() to return position below viewport
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 900, // Below window.innerHeight (800)
          bottom: 1000,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 900,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
      expect(result.outOfViewport[0].text).toBe("Below Viewport");
    });

    it("should detect nodes out of viewport (above)", () => {
      testContainer.innerHTML = "<p>Above Viewport</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() to return position above viewport
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: -200,
          bottom: -100, // Above viewport (bottom < 0)
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: -200,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it("should detect nodes out of viewport (left)", () => {
      testContainer.innerHTML = "<p>Left of Viewport</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() to return position left of viewport
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 100,
          bottom: 200,
          left: -300,
          right: -100, // Left of viewport (right < 0)
          width: 200,
          height: 100,
          x: -300,
          y: 100,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it("should detect nodes out of viewport (right)", () => {
      testContainer.innerHTML = "<p>Right of Viewport</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() to return position right of viewport
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 100,
          bottom: 200,
          left: 1300, // Right of window.innerWidth (1200)
          right: 1500,
          width: 200,
          height: 100,
          x: 1300,
          y: 100,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(1);
    });

    it("should handle boundary cases - partially visible nodes", () => {
      testContainer.innerHTML = "<p>Partially Visible</p>";
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() - node crosses viewport boundary
      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 750, // Starts in viewport
          bottom: 850, // Ends below viewport
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 750,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      // Partially visible nodes should be counted as IN viewport
      expect(result.viewport.length).toBe(1);
      expect(result.outOfViewport.length).toBe(0);
    });

    it("should handle multiple nodes - mixed viewport/out-of-viewport", () => {
      testContainer.innerHTML = `
        <div>
          <p id="p1">In Viewport 1</p>
          <p id="p2">Out of Viewport</p>
          <p id="p3">In Viewport 2</p>
        </div>
      `;
      const textNodes = domManipulator.extractTextNodes();

      // Mock Range.getBoundingClientRect() for each text node
      const mockRange1 = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 100,
          bottom: 200,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 100,
          toJSON: () => {},
        })),
      };

      const mockRange2 = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 900,
          bottom: 1000,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 900,
          toJSON: () => {},
        })),
      };

      const mockRange3 = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 300,
          bottom: 400,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 300,
          toJSON: () => {},
        })),
      };

      const createRangeSpy = jest.spyOn(document, "createRange");
      createRangeSpy
        .mockReturnValueOnce(mockRange1 as any)
        .mockReturnValueOnce(mockRange2 as any)
        .mockReturnValueOnce(mockRange3 as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport.length).toBe(2);
      expect(result.outOfViewport.length).toBe(1);
      expect(result.viewport[0].text).toBe("In Viewport 1");
      expect(result.viewport[1].text).toBe("In Viewport 2");
      expect(result.outOfViewport[0].text).toBe("Out of Viewport");
    });

    it("should return empty arrays for empty input", () => {
      const result = domManipulator.detectViewportNodes([]);

      expect(result.viewport.length).toBe(0);
      expect(result.outOfViewport.length).toBe(0);
    });

    it("should preserve TextNode properties in result", () => {
      testContainer.innerHTML = "<p>Test Node</p>";
      const textNodes = domManipulator.extractTextNodes();

      const mockRange = {
        selectNodeContents: jest.fn(),
        getBoundingClientRect: jest.fn(() => ({
          top: 100,
          bottom: 200,
          left: 100,
          right: 300,
          width: 200,
          height: 100,
          x: 100,
          y: 100,
          toJSON: () => {},
        })),
      };

      jest.spyOn(document, "createRange").mockReturnValue(mockRange as any);

      const result = domManipulator.detectViewportNodes(textNodes);

      expect(result.viewport[0]).toHaveProperty("node");
      expect(result.viewport[0]).toHaveProperty("text");
      expect(result.viewport[0]).toHaveProperty("index");
      expect(result.viewport[0].index).toBe(0);
    });

    describe("Reddit-style nested containers", () => {
      it("should correctly classify text nodes based on their actual position, not parent container", () => {
        // THE REAL BUG SCENARIO:
        // When a tall parent element contains multiple text nodes at different positions,
        // current code checks parentElement.getBoundingClientRect() which returns the SAME
        // bounds for ALL text nodes inside, causing misclassification.
        //
        // This test creates a tall paragraph (3000px) with text nodes at different Y offsets.
        // All text nodes share the same parent, so they all get classified based on the
        // parent's bounds, not their actual positions.

        // Create a tall paragraph element with text at different positions
        const tallPara = document.createElement("p");
        tallPara.style.cssText =
          "height: 3000px; position: relative; display: block;";

        // Manually create text nodes and position them using line breaks
        // (In reality, we'd use absolute positioning, but text nodes themselves can't be positioned)
        // So we'll create a scenario where the parent's bounds don't match the text position

        // Add first text node
        tallPara.appendChild(document.createTextNode("Visible text"));

        // Add many line breaks to push second text down
        for (let i = 0; i < 80; i++) {
          tallPara.appendChild(document.createElement("br"));
        }

        // Add second text node (nowfar below)
        tallPara.appendChild(document.createTextNode("Below fold text"));

        testContainer.appendChild(tallPara);

        // Mock viewport
        Object.defineProperty(window, "innerHeight", {
          value: 750,
          writable: true,
        });
        Object.defineProperty(window, "innerWidth", {
          value: 800,
          writable: true,
        });

        // Mock the tall paragraph's bounds
        // This is the parent for BOTH text nodes
        // Current buggy code will use these bounds for BOTH texts
        tallPara.getBoundingClientRect = jest.fn(() => ({
          top: 0, // Parent starts in viewport
          bottom: 3000, // Parent extends far below
          left: 0,
          right: 800,
          width: 800,
          height: 3000,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }));

        // Extract text nodes
        const nodes = domManipulator.extractTextNodes();

        // We should have 2 text nodes (the <br> elements don't have text)
        expect(nodes.length).toBe(2);

        // MOCK Range.getBoundingClientRect() for each text node
        // This is what the FIXED code should use
        const textNode1 = nodes[0].node;
        const textNode2 = nodes[1].node;

        // Mock document.createRange() for the first text node
        const mockRange1 = {
          selectNodeContents: jest.fn(),
          getBoundingClientRect: jest.fn(() => ({
            top: 100, // Actually in viewport
            bottom: 120,
            left: 0,
            right: 800,
            width: 800,
            height: 20,
            x: 0,
            y: 100,
            toJSON: () => ({}),
          })),
        };

        const mockRange2 = {
          selectNodeContents: jest.fn(),
          getBoundingClientRect: jest.fn(() => ({
            top: 2000, // Actually below viewport
            bottom: 2020,
            left: 0,
            right: 800,
            width: 800,
            height: 20,
            x: 0,
            y: 2000,
            toJSON: () => ({}),
          })),
        };

        // Wire up the mocks to document.createRange()
        const createRangeSpy = jest.spyOn(document, "createRange");
        createRangeSpy
          .mockReturnValueOnce(mockRange1 as any)
          .mockReturnValueOnce(mockRange2 as any);

        // Detect viewport nodes
        const { viewport, outOfViewport } =
          domManipulator.detectViewportNodes(nodes);

        // CURRENT BUGGY BEHAVIOR:
        // Both text nodes have tallPara as parent
        // tallPara.getBoundingClientRect() returns {top: 0, bottom: 3000}
        // Since top (0) < innerHeight (750), BOTH are classified as "in viewport"
        //
        // EXPECTED: viewport = 2, outOfViewport = 0 (WRONG!)
        // AFTER FIX: viewport = 1, outOfViewport = 1 (CORRECT!)

        // This test FAILS with current implementation
        expect(viewport.length).toBe(1); // Will actually be 2 (BUG!)
        expect(outOfViewport.length).toBe(1); // Will actually be 0 (BUG!)
        expect(viewport[0].text).toBe("Visible text");
        expect(outOfViewport[0].text).toBe("Below fold text");
      });
    });
  });
});
