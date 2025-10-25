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

export class DOMManipulator {
  private originalTextMap: WeakMap<Node, string> = new WeakMap();
  private readonly IGNORED_TAGS: string[] = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'];

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

    while ((node = walker.nextNode())) {
      const text = node.textContent || '';
      this.saveOriginalText(node);
      textNodes.push({
        node,
        text,
        index
      });
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
}
