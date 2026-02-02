/**
 * DOMManipulator - DOM text node extraction and manipulation
 *
 * Responsibilities:
 * - Extract translatable text nodes from DOM
 * - Apply translations to text nodes
 * - Reset DOM to original state
 * - Preserve original text using WeakMap
 */

import { EXCLUSION_SELECTORS } from '@shared/constants';

export interface TextNode {
  node: Node;
  text: string;
  index: number;
}

/**
 * ビューポート内/外のキュー
 */
export interface ViewportQueue {
  /**
   * ビューポート内のテキストノード
   */
  viewport: TextNode[];

  /**
   * ビューポート外のテキストノード
   */
  outOfViewport: TextNode[];
}

export class DOMManipulator {
  private originalTextMap: WeakMap<Node, string> = new WeakMap();
  private readonly IGNORED_TAGS: string[] = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'CODE', 'PRE'];

  /**
   * Set of normalized texts already extracted (for deduplication)
   * Reset on each extractTextNodes() call
   */
  private extractedTextsSet: Set<string> = new Set();

  constructor() {
    // Use default IGNORED_TAGS or extend from EXCLUSION_SELECTORS if needed
  }

  /**
   * Extract translatable text nodes from DOM
   * @returns Array of TextNode objects with node, text, and index
   */
  extractTextNodes(): TextNode[] {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Check if parent tag is in IGNORED_TAGS
          if (this.IGNORED_TAGS.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if any ancestor matches exclusion selectors
          if (parent.closest('svg, [contenteditable="true"], [data-no-translate], .no-translate')) {
            return NodeFilter.FILTER_REJECT;
          }

          // Exclude whitespace-only text
          if (!node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: TextNode[] = [];
    let node: Node | null;
    let index = 0;

    // Reset extracted texts set for each extraction
    this.extractedTextsSet.clear();

    while ((node = walker.nextNode())) {
      const rawText = node.textContent || '';
      // Normalize text by trimming whitespace
      const text = rawText.trim();

      this.saveOriginalText(node);
      textNodes.push({
        node,
        text,
        index
      });

      // Track normalized text for potential duplicate detection
      this.extractedTextsSet.add(text);
      index++;
    }

    return textNodes;
  }

  /**
   * Apply translations to text nodes
   * @param nodes - Array of TextNode objects
   * @param translations - Array of translated strings
   */
  applyTranslations(nodes: TextNode[], translations: string[]): void {
    nodes.forEach((textNode, index) => {
      if (translations[index] && translations[index].trim()) {
        textNode.node.textContent = translations[index];
      }
    });
  }

  /**
   * Reset all text nodes to original content
   */
  reset(): void {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const original = this.originalTextMap.get(node);
      if (original !== undefined) {
        node.textContent = original;
      }
    }
  }

  /**
   * Save original text of a node to WeakMap
   * @param node - DOM Node to save
   */
  saveOriginalText(node: Node): void {
    if (!this.originalTextMap.has(node)) {
      this.originalTextMap.set(node, node.textContent || '');
    }
  }

  /**
   * Detect viewport nodes and separate them from out-of-viewport nodes
   *
   * Uses getBoundingClientRect() to determine if a node's parent element
   * is currently visible in the viewport. Partially visible nodes are
   * counted as IN viewport.
   *
   * @param nodes - Array of TextNode objects to check
   * @returns ViewportQueue with separated viewport and outOfViewport arrays
   *
   * @example
   * ```typescript
   * const textNodes = domManipulator.extractTextNodes();
   * const { viewport, outOfViewport } = domManipulator.detectViewportNodes(textNodes);
   * console.log(`Viewport: ${viewport.length}, Out: ${outOfViewport.length}`);
   * ```
   */
  detectViewportNodes(nodes: TextNode[]): ViewportQueue {
    const viewport: TextNode[] = [];
    const outOfViewport: TextNode[] = [];

    nodes.forEach(node => {
      const element = node.node.parentElement;

      if (!element) {
        // No parent element, treat as out of viewport
        outOfViewport.push(node);
        return;
      }

      const rect = element.getBoundingClientRect();

      // Check if element is in viewport
      // An element is visible if:
      // - Its top is above the bottom of the viewport (rect.top < window.innerHeight)
      // - Its bottom is below the top of the viewport (rect.bottom > 0)
      // - Its left is before the right edge of the viewport (rect.left < window.innerWidth)
      // - Its right is after the left edge of the viewport (rect.right > 0)
      const isInViewport = (
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0
      );

      if (isInViewport) {
        viewport.push(node);
      } else {
        outOfViewport.push(node);
      }
    });

    return { viewport, outOfViewport };
  }
}
