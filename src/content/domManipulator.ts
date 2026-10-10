/**
 * DOMManipulator - DOM text node extraction and manipulation
 *
 * Responsibilities:
 * - Extract translatable text nodes from DOM
 * - Apply translations to text nodes
 * - Reset DOM to original state
 * - Preserve original text using WeakMap
 */

import { BATCH_CONFIG, EXCLUSION_SELECTORS } from "@shared/constants";
import { classifyRect } from "./proximityClassifier";
import {
  BlockUnit,
  applyBlockTranslation,
  buildBlockUnit,
  growsTooMuch,
  isBlockTag,
  isConstrained,
  restoreBlock,
  stripMarkup,
} from "./blockTranslator";

export interface TextNode {
  node: Node;
  text: string;
  index: number;
  leadingWhitespace?: string;
  trailingWhitespace?: string;
  /**
   * Set when this unit is a whole block element (text + inline tags as
   * placeholders). `node` is then the block element itself.
   */
  block?: BlockUnit;
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
  private readonly IGNORED_TAGS: string[] = [
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "SVG",
    "CANVAS",
    "CODE",
    "PRE",
  ];

  // Why: exclusion logic consolidated here — single source of truth instead of dual contentScript+domManipulator
  private readonly EXCLUSION_SELECTOR_STRING: string =
    EXCLUSION_SELECTORS.join(", ");

  /**
   * Set of normalized texts already extracted (for deduplication)
   * Reset on each extractTextNodes() call
   */
  private extractedTextsSet: Set<string> = new Set();

  /** Block units whose DOM was rewritten (restored on reset). */
  private appliedBlocks: Set<BlockUnit> = new Set();

  /** Constrained elements left untranslated; maps element → original title. */
  private titledElements: Map<Element, string | null> = new Map();

  constructor() {
    // Use default IGNORED_TAGS or extend from EXCLUSION_SELECTORS if needed
  }

  /**
   * Check if an element matches any exclusion selector.
   *
   * Returns true if the element itself or any of its ancestors matches
   * the combined EXCLUSION_SELECTORS CSS selector string.
   *
   * @param element - The element to check
   * @returns true if excluded, false if translatable
   */
  isExcludedElement(element: Element): boolean {
    return (
      element.matches(this.EXCLUSION_SELECTOR_STRING) ||
      !!element.closest(this.EXCLUSION_SELECTOR_STRING)
    );
  }

  /**
   * Extract translatable text nodes from DOM
   * @returns Array of TextNode objects with node, text, and index
   */
  extractTextNodes(): TextNode[] {
    const pendingBlocks = new Map<Element, BlockUnit>();
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (
              isBlockTag(el) &&
              !this.IGNORED_TAGS.includes(el.tagName) &&
              !this.isExcludedElement(el) &&
              !el.closest(
                'svg, [contenteditable="true"], [data-no-translate], .no-translate',
              )
            ) {
              const unit = buildBlockUnit(el, (e) => this.isExcludedElement(e));
              if (unit) {
                pendingBlocks.set(el, unit);
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            return NodeFilter.FILTER_SKIP;
          }
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Check if parent tag is in IGNORED_TAGS
          if (this.IGNORED_TAGS.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if any ancestor matches exclusion selectors
          if (
            parent.closest(
              'svg, [contenteditable="true"], [data-no-translate], .no-translate',
            )
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          // Exclude whitespace-only text
          if (!node.textContent?.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      },
    );

    const textNodes: TextNode[] = [];
    let node: Node | null;
    let index = 0;

    // Reset extracted texts set for each extraction
    this.extractedTextsSet.clear();

    while ((node = walker.nextNode())) {
      const unit =
        node.nodeType === Node.ELEMENT_NODE
          ? pendingBlocks.get(node as Element)
          : undefined;
      if (unit) {
        textNodes.push({ node, text: unit.markup, index, block: unit });
        this.extractedTextsSet.add(unit.markup);
        index++;
        // Skip the block's subtree: it is translated as one unit.
        let last: Node = node;
        while (last.lastChild) last = last.lastChild;
        walker.currentNode = last;
        continue;
      }
      const rawText = node.textContent || "";
      const whitespace = this.extractWhitespaceMetadata(rawText);

      this.saveOriginalText(node);
      textNodes.push({
        node,
        text: whitespace.body,
        index,
        leadingWhitespace: whitespace.leading,
        trailingWhitespace: whitespace.trailing,
      });

      // Track normalized text for potential duplicate detection
      this.extractedTextsSet.add(whitespace.body);
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
        if (textNode.block) {
          this.applyBlock(textNode, translations[index].trim());
          return;
        }
        const container = isConstrained(textNode.node.parentElement);
        if (container && growsTooMuch(textNode.text, translations[index])) {
          this.keepOriginal(container, translations[index].trim());
          return;
        }
        const currentText = textNode.node.textContent || "";
        const whitespace =
          textNode.leadingWhitespace !== undefined ||
          textNode.trailingWhitespace !== undefined
            ? {
                leading: textNode.leadingWhitespace || "",
                trailing: textNode.trailingWhitespace || "",
              }
            : this.extractWhitespaceMetadata(currentText);

        textNode.node.textContent = `${whitespace.leading}${translations[index].trim()}${whitespace.trailing}`;
      }
    });
  }

  private applyBlock(textNode: TextNode, translation: string): void {
    const unit = textNode.block!;
    const container = isConstrained(unit.element);
    if (
      container &&
      growsTooMuch(stripMarkup(unit.markup), stripMarkup(translation))
    ) {
      this.keepOriginal(container, stripMarkup(translation));
      return;
    }
    if (applyBlockTranslation(unit, translation)) {
      this.appliedBlocks.add(unit);
    }
  }

  /**
   * Safeguard: a translation that would overflow a fixed-size container
   * (button, th, nav, ...) is not applied; it is exposed as a tooltip instead.
   */
  private keepOriginal(container: Element, translation: string): void {
    if (!this.titledElements.has(container)) {
      this.titledElements.set(container, container.getAttribute("title"));
    }
    container.setAttribute("title", translation);
  }

  /**
   * Reset all text nodes to original content
   */
  reset(): void {
    this.appliedBlocks.forEach((unit) => restoreBlock(unit));
    this.appliedBlocks.clear();
    this.titledElements.forEach((title, el) => {
      if (title === null) el.removeAttribute("title");
      else el.setAttribute("title", title);
    });
    this.titledElements.clear();

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
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
      this.originalTextMap.set(node, node.textContent || "");
    }
  }

  createTextNode(node: Node, index: number): TextNode {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const unit = buildBlockUnit(node as Element, (e) =>
        this.isExcludedElement(e),
      );
      if (unit) return { node, text: unit.markup, index, block: unit };
    }
    const rawText = node.textContent || "";
    const whitespace = this.extractWhitespaceMetadata(rawText);
    this.saveOriginalText(node);
    return {
      node,
      text: whitespace.body,
      index,
      leadingWhitespace: whitespace.leading,
      trailingWhitespace: whitespace.trailing,
    };
  }

  private extractWhitespaceMetadata(text: string): {
    leading: string;
    body: string;
    trailing: string;
  } {
    const leading = text.match(/^\s*/)?.[0] || "";
    const trailing = text.match(/\s*$/)?.[0] || "";
    return {
      leading,
      body: text.slice(leading.length, text.length - trailing.length),
      trailing,
    };
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

    nodes.forEach((node) => {
      // Use Range to get the text node's actual position (not parent's)
      const range = document.createRange();
      range.selectNodeContents(node.node);
      const rect = range.getBoundingClientRect();

      // Handle edge case: empty text nodes have zero-size rect
      // Fall back to parent element check if rect is invalid
      if (rect.width === 0 && rect.height === 0) {
        const element = node.node.parentElement;
        if (element) {
          const parentRect = element.getBoundingClientRect();
          const isInViewport =
            parentRect.top < window.innerHeight &&
            parentRect.bottom > 0 &&
            parentRect.left < window.innerWidth &&
            parentRect.right > 0;
          if (isInViewport) {
            viewport.push(node);
          } else {
            outOfViewport.push(node);
          }
        } else {
          outOfViewport.push(node);
        }
        return;
      }

      // Check if text node's actual position is in viewport
      // A text node is visible if:
      // - Its top is above the bottom of the viewport (rect.top < window.innerHeight)
      // - Its bottom is below the top of the viewport (rect.bottom > 0)
      // - Its left is before the right edge of the viewport (rect.left < window.innerWidth)
      // - Its right is after the left edge of the viewport (rect.right > 0)
      const isInViewport =
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      if (isInViewport) {
        viewport.push(node);
      } else {
        outOfViewport.push(node);
      }
    });

    return { viewport, outOfViewport };
  }

  /**
   * Split already-detected out-of-viewport nodes into near (first job) and far (wait for approach).
   */
  classifyOutOfViewport(nodes: TextNode[]): {
    near: TextNode[];
    far: TextNode[];
  } {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const near: TextNode[] = [];
    const far: TextNode[] = [];

    for (const node of nodes) {
      const range = document.createRange();
      range.selectNodeContents(node.node);
      const rect = range.getBoundingClientRect();
      const measurable =
        rect.width === 0 && rect.height === 0 && node.node.parentElement
          ? node.node.parentElement.getBoundingClientRect()
          : rect;
      const band = classifyRect(
        measurable,
        viewport,
        BATCH_CONFIG.NEAR_VIEWPORT_SCREENS,
      );
      if (band === "far") {
        far.push(node);
      } else {
        near.push(node);
      }
    }

    return { near, far };
  }
}
