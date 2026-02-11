/**
 * ContentScript - Main content script orchestrator
 *
 * Responsibilities:
 * - Initialize all content layer components
 * - Handle messages from background script
 * - Coordinate page translation
 * - Manage selection and clipboard translation
 * - Handle reset operations
 */

import { DOMManipulator, TextNode } from "./domManipulator";
import { SelectionHandler } from "./selectionHandler";
import { ClipboardHandler } from "./clipboardHandler";
import { MutationObserverManager } from "./mutationObserver";
import { FloatingUI } from "./floatingUI";
import { ProgressNotification } from "./progressNotification";
import { MessageBus } from "@shared/messages/MessageBus";
import { MessageType, Message } from "@shared/messages/types";
import { logger } from "@shared/utils";
import { filterBatchTexts } from "@shared/utils/textFilter";
import { EXCLUSION_SELECTORS } from "@shared/constants";

/** Combined CSS selector string for all exclusion rules */
const EXCLUSION_SELECTOR_STRING = EXCLUSION_SELECTORS.join(", ");

export class ContentScript {
  private domManipulator: DOMManipulator;
  private selectionHandler: SelectionHandler;
  private clipboardHandler: ClipboardHandler;
  private mutationObserver: MutationObserverManager;
  private floatingUI: FloatingUI;
  private progressNotification: ProgressNotification;
  private messageBus: MessageBus;
  private isTranslated = false;
  private extractedNodes: TextNode[] = [];
  /**
   * Current translation nodes for batch-by-batch application
   * Set during translatePage() before sending translation request
   */
  private currentTranslationNodes: TextNode[] = [];
  /**
   * Last observed text snapshot per node to avoid duplicate re-translation
   */
  private lastObservedNodeText: WeakMap<Node, string> = new WeakMap();
  /**
   * Pending text nodes for microtask-batched dynamic translation
   */
  private pendingDynamicNodes: Set<Node> = new Set();
  private isDynamicFlushScheduled = false;

  constructor() {
    this.domManipulator = new DOMManipulator();
    this.selectionHandler = new SelectionHandler();
    this.clipboardHandler = new ClipboardHandler();
    this.mutationObserver = new MutationObserverManager();
    this.floatingUI = new FloatingUI();
    this.progressNotification = new ProgressNotification();
    this.messageBus = new MessageBus();

    logger.log("ContentScript initialized");
  }

  /**
   * Initialize content script
   */
  initialize(): void {
    // Set up message listeners
    this.messageBus.listen(this.handleMessage.bind(this));

    // Enable selection handler
    this.selectionHandler.enable();

    logger.log("ContentScript ready");
  }

  /**
   * Handle messages from background script
   *
   * Routes incoming messages to appropriate handlers based on message type.
   * Supports translation commands, progress updates, and error notifications.
   *
   * **Supported Message Types**:
   * - `TRANSLATE_PAGE`: Full page translation
   * - `TRANSLATE_SELECTION`: Selected text translation
   * - `TRANSLATE_CLIPBOARD`: Clipboard content translation
   * - `TRANSLATION_PROGRESS`: Progress update from background (updates UI)
   * - `TRANSLATION_ERROR`: Error notification from background (shows error UI)
   * - `RESET`: Reset page to original state
   *
   * @param message - The message object with type and payload
   * @param sender - Message sender information
   * @param sendResponse - Callback to send response back to sender
   */
  private async handleMessage(
    message: Message,
    sender: any,
    sendResponse: (response?: any) => void,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(
      `[Content:ContentScript] ${timestamp} - handleMessage() called:`,
      {
        messageType: message.type,
        payload: "payload" in message ? message.payload : undefined,
      },
    );

    logger.log("ContentScript received message:", message.type);

    try {
      switch (message.type) {
        case MessageType.TRANSLATE_PAGE:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_PAGE:`,
            {
              targetLanguage:
                "payload" in message ? message.payload.targetLanguage : "en",
            },
          );
          await this.translatePage(
            "payload" in message ? message.payload.targetLanguage : "en",
          );
          console.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_PAGE completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_SELECTION:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_SELECTION`,
          );
          await this.translateSelection(
            "payload" in message ? message.payload.targetLanguage : "en",
          );
          console.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_SELECTION completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_CLIPBOARD:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_CLIPBOARD`,
          );
          await this.translateClipboard(
            "payload" in message ? message.payload.targetLanguage : "en",
          );
          console.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_CLIPBOARD completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.RESET:
          console.log(`[Content:ContentScript] ${timestamp} - Handling RESET`);
          this.reset();
          console.log(
            `[Content:ContentScript] ${timestamp} - RESET completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATION_PROGRESS:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATION_PROGRESS`,
          );
          if ("payload" in message && message.payload) {
            const { current, total } = message.payload;
            if (typeof current === "number" && typeof total === "number") {
              this.progressNotification.update(current, total);
            }
          }
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATION_ERROR:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATION_ERROR`,
          );
          if (
            "payload" in message &&
            message.payload &&
            message.payload.error !== undefined
          ) {
            this.progressNotification.error(message.payload.error);
            logger.error("Translation error received:", message.payload.error);
          }
          sendResponse({ success: true });
          break;

        case MessageType.BATCH_COMPLETED:
          console.log(
            `[Content:ContentScript] ${timestamp} - Handling BATCH_COMPLETED`,
          );
          if ("payload" in message && message.payload) {
            this.handleBatchCompleted(message.payload);
          }
          sendResponse({ success: true });
          break;

        default:
          console.warn(
            `[Content:ContentScript] ${timestamp} - Unknown message type:`,
            message.type,
          );
          logger.log("Unknown message type:", message.type);
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      console.error(
        `[Content:ContentScript] ${timestamp} - Error handling message:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("Error handling message:", error);
      sendResponse({ success: false, error: String(error) });
    }
  }

  /**
   * Translate entire page with viewport-priority translation
   *
   * Implements a two-phase translation strategy:
   * - **Phase 1**: Translates viewport nodes first using semi-parallel processing
   * - **Phase 2**: Translates out-of-viewport nodes using parallel processing
   *
   * **Progress Notification Flow**:
   * 1. Shows Phase 1 progress notification (viewport translation)
   * 2. Shows Phase 2 progress notification (full-page translation)
   * 3. Shows completion notification (auto-hides after 3s) or error notification
   *
   * @param targetLanguage - Target language for translation (e.g., 'Japanese', 'French')
   * @throws Error if translation fails (error is caught and shown via progress notification)
   */
  private async translatePage(targetLanguage: string): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(
      `[Content:ContentScript] ${timestamp} - translatePage() called:`,
      { targetLanguage },
    );

    try {
      logger.log("Translating page to", targetLanguage);

      // Extract text nodes
      console.log(
        `[Content:ContentScript] ${timestamp} - Extracting text nodes from DOM...`,
      );
      this.extractedNodes = this.domManipulator.extractTextNodes();

      console.log(
        `[Content:ContentScript] ${timestamp} - Text nodes extracted:`,
        {
          count: this.extractedNodes.length,
        },
      );

      if (this.extractedNodes.length === 0) {
        console.warn(
          `[Content:ContentScript] ${timestamp} - No text nodes to translate`,
        );
        logger.log("No text nodes to translate");
        return;
      }

      // Separate viewport and out-of-viewport nodes
      console.log(
        `[Content:ContentScript] ${timestamp} - Detecting viewport nodes...`,
      );
      const { viewport, outOfViewport } =
        this.domManipulator.detectViewportNodes(this.extractedNodes);

      console.log(
        `[Content:ContentScript] ${timestamp} - Viewport detection completed:`,
        {
          viewportCount: viewport.length,
          outOfViewportCount: outOfViewport.length,
        },
      );

      // Phase 1: Translate viewport nodes first
      if (viewport.length > 0) {
        console.log(
          `[Content:ContentScript] ${timestamp} - Starting Phase 1: Viewport translation`,
        );
        this.progressNotification.showPhase(1, viewport.length);

        const viewportTexts = viewport.map((node) => node.text);

        // Filter out non-translatable texts (numbers, URLs, symbols, etc.)
        const { textsToTranslate, originalIndices } =
          filterBatchTexts(viewportTexts);

        if (textsToTranslate.length === 0) {
          // All texts filtered out — skip Phase 1 API call
          console.log(
            `[Content:ContentScript] ${timestamp} - Phase 1 skipped: All texts filtered`,
          );
          this.progressNotification.completePhase(1);
        } else {
          // Store only filtered nodes for batch-by-batch application via BATCH_COMPLETED
          this.currentTranslationNodes = originalIndices.map(
            (i) => viewport[i],
          );

          console.log(
            `[Content:ContentScript] ${timestamp} - Sending Phase 1 REQUEST_TRANSLATION:`,
            {
              type: MessageType.REQUEST_TRANSLATION,
              action: "requestTranslation",
              textsCount: textsToTranslate.length,
              filteredFrom: viewportTexts.length,
              targetLanguage,
              semiParallel: true,
              priorityCount: 1,
              phase: 1,
            },
          );

          // Wait for Phase 1 completion before starting Phase 2
          const response1 = await this.messageBus.send({
            type: MessageType.REQUEST_TRANSLATION,
            action: "requestTranslation",
            payload: {
              texts: textsToTranslate,
              targetLanguage,
              semiParallel: true,
              priorityCount: 1,
              phase: 1,
            },
          });

          console.log(
            `[Content:ContentScript] ${timestamp} - Phase 1 response received:`,
            {
              success: response1?.success,
              hasTranslations: !!response1?.data?.translations,
            },
          );

          if (response1?.success && response1?.data?.translations) {
            console.log(
              `[Content:ContentScript] ${timestamp} - Applying Phase 1 translations`,
            );
            // Apply all translations including cache hits (same pattern as Phase 2)
            const nodesToTranslate = originalIndices.map((i) => viewport[i]);
            this.applyTranslationsAndTrack(
              nodesToTranslate,
              response1.data.translations,
            );
            this.progressNotification.completePhase(1);
            console.log(
              `[Content:ContentScript] ${timestamp} - Phase 1 completed with all translations applied`,
            );
          } else {
            console.warn(
              `[Content:ContentScript] ${timestamp} - Phase 1 failed:`,
              response1,
            );
          }

          console.log(
            `[Content:ContentScript] ${timestamp} - Phase 1 request completed (batches were applied via BATCH_COMPLETED)`,
          );
        }
      } else {
        console.log(
          `[Content:ContentScript] ${timestamp} - Phase 1 skipped: No viewport nodes`,
        );
      }

      // Phase 2: Translate out-of-viewport nodes
      if (outOfViewport.length > 0) {
        console.log(
          `[Content:ContentScript] ${timestamp} - Starting Phase 2: Full-page translation`,
        );
        this.progressNotification.showPhase(2, outOfViewport.length);

        const outOfViewportTexts = outOfViewport.map((node) => node.text);

        // Filter out non-translatable texts
        const { textsToTranslate: oovTexts, originalIndices: oovIndices } =
          filterBatchTexts(outOfViewportTexts);

        if (oovTexts.length > 0) {
          console.log(
            `[Content:ContentScript] ${timestamp} - Sending Phase 2 REQUEST_TRANSLATION:`,
            {
              type: MessageType.REQUEST_TRANSLATION,
              action: "requestTranslation",
              textsCount: oovTexts.length,
              filteredFrom: outOfViewportTexts.length,
              targetLanguage,
              semiParallel: true,
              priorityCount: 0,
              phase: 2,
            },
          );

          // P1 Fix: Use semiParallel=true for progressive rendering in Phase 2
          // Store Phase 2 nodes for handleBatchCompleted
          this.currentTranslationNodes = oovIndices.map(
            (i) => outOfViewport[i],
          );

          const response2 = await this.messageBus.send({
            type: MessageType.REQUEST_TRANSLATION,
            action: "requestTranslation",
            payload: {
              texts: oovTexts,
              targetLanguage,
              semiParallel: true,
              priorityCount: 0,
              phase: 2,
            },
          });

          console.log(
            `[Content:ContentScript] ${timestamp} - Phase 2 response received:`,
            {
              success: response2?.success,
              hasTranslations: !!response2?.data?.translations,
            },
          );

          if (response2?.success && response2?.data?.translations) {
            console.log(
              `[Content:ContentScript] ${timestamp} - Applying Phase 2 translations`,
            );
            const nodesToTranslate = oovIndices.map((i) => outOfViewport[i]);
            this.applyTranslationsAndTrack(
              nodesToTranslate,
              response2.data.translations,
            );
            this.progressNotification.completePhase(2);
            console.log(
              `[Content:ContentScript] ${timestamp} - Phase 2 completed`,
            );
          } else {
            console.warn(
              `[Content:ContentScript] ${timestamp} - Phase 2 failed:`,
              response2,
            );
          }
        } else {
          console.log(
            `[Content:ContentScript] ${timestamp} - Phase 2 skipped: All texts filtered`,
          );
          this.progressNotification.completePhase(2);
        }
      } else {
        console.log(
          `[Content:ContentScript] ${timestamp} - Phase 2 skipped: No out-of-viewport nodes`,
        );
      }

      this.isTranslated = true;
      this.progressNotification.complete();

      // P0 Fix: Enable MutationObserver for infinite scroll / dynamic content
      this.enableDynamicTranslation(targetLanguage);

      console.log(
        `[Content:ContentScript] ${timestamp} - Page translation completed successfully`,
      );
      logger.log("Page translation completed");
    } catch (error) {
      console.error(
        `[Content:ContentScript] ${timestamp} - Failed to translate page:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("Failed to translate page:", error);

      // Show error notification
      this.progressNotification.error(
        error instanceof Error ? error.message : "Translation failed",
      );

      throw error;
    }
  }

  /**
   * Translate selected text
   */
  private async translateSelection(targetLanguage: string): Promise<void> {
    try {
      const translation =
        await this.selectionHandler.translateSelection(targetLanguage);

      if (translation) {
        // Get selection position
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Show floating UI
          this.floatingUI.show(translation, {
            x: rect.left + window.scrollX,
            y: rect.bottom + window.scrollY,
          });

          logger.log("Selection translation displayed");
        }
      } else {
        logger.log("No selection to translate");
      }
    } catch (error) {
      logger.error("Failed to translate selection:", error);
      throw error;
    }
  }

  /**
   * Translate clipboard content
   */
  private async translateClipboard(targetLanguage: string): Promise<void> {
    try {
      const translation =
        await this.clipboardHandler.translateClipboard(targetLanguage);

      if (translation) {
        // Show floating UI at center of screen
        this.floatingUI.show(translation, {
          x: window.innerWidth / 2 - 200,
          y: window.innerHeight / 2 - 100,
        });

        logger.log("Clipboard translation displayed");
      } else {
        logger.log("No clipboard content to translate");
      }
    } catch (error) {
      logger.error("Failed to translate clipboard:", error);
      throw error;
    }
  }

  /**
   * Reset page to original state
   */
  private reset(): void {
    try {
      this.isTranslated = false;
      this.domManipulator.reset();
      this.floatingUI.hide();
      this.pendingDynamicNodes.clear();
      this.isDynamicFlushScheduled = false;
      this.lastObservedNodeText = new WeakMap();

      logger.log("Page reset to original state");
    } catch (error) {
      logger.error("Failed to reset page:", error);
      throw error;
    }
  }

  /**
   * Enable dynamic content monitoring
   */
  enableDynamicTranslation(targetLanguage: string): void {
    this.mutationObserver.observe((mutations) => {
      const detectedTextNodes = new Set<Node>();

      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            this.collectTextNodesFromAddedNode(addedNode, detectedTextNodes);
          }
          continue;
        }

        if (mutation.type === "characterData") {
          const target = mutation.target;
          if (
            target.nodeType === Node.TEXT_NODE &&
            this.isTextNodeTranslatable(target)
          ) {
            detectedTextNodes.add(target);
          }
          continue;
        }

        if (mutation.type === "attributes") {
          const target = mutation.target;
          if (target.nodeType === Node.ELEMENT_NODE) {
            this.collectTextNodesFromElement(
              target as Element,
              detectedTextNodes,
            );
          }
        }
      }

      if (detectedTextNodes.size > 0 && this.isTranslated) {
        logger.log(
          `Dynamic content: ${detectedTextNodes.size} candidate text nodes detected`,
        );
        this.queueDynamicTranslation(detectedTextNodes, targetLanguage);
      }
    });

    logger.log("Dynamic translation enabled");
  }

  /**
   * Disable dynamic content monitoring
   */
  disableDynamicTranslation(): void {
    this.mutationObserver.disconnect();
    this.pendingDynamicNodes.clear();
    this.isDynamicFlushScheduled = false;
    logger.log("Dynamic translation disabled");
  }

  /**
   * Handle batch completed notification
   *
   * Invoked by Background Script when each batch completes during semi-parallel translation.
   * Applies translations immediately to corresponding nodes and updates progress UI.
   *
   * @param payload - BatchCompletedMessage payload
   */
  private handleBatchCompleted(payload: any): void {
    const timestamp = new Date().toISOString();
    console.log(
      `[Content:ContentScript] ${timestamp} - handleBatchCompleted() called:`,
      payload,
    );

    try {
      const { translations, nodeIndices, phase, progress } = payload as {
        translations: string[];
        nodeIndices: number[];
        phase: 1 | 2;
        progress: { current: number; total: number; percentage: number };
      };

      if (
        !this.currentTranslationNodes ||
        this.currentTranslationNodes.length === 0
      ) {
        console.warn(
          `[Content:ContentScript] ${timestamp} - currentTranslationNodes is empty, skipping batch application`,
        );
        return;
      }

      // Extract corresponding nodes using nodeIndices
      const nodes = nodeIndices
        .filter((i: number) => i < this.currentTranslationNodes.length)
        .map((i: number) => this.currentTranslationNodes[i]);

      if (nodes.length !== translations.length) {
        console.warn(
          `[Content:ContentScript] ${timestamp} - Mismatch: nodes(${nodes.length}) vs translations(${translations.length})`,
        );
      }

      console.log(
        `[Content:ContentScript] ${timestamp} - Applying batch translations:`,
        {
          nodesCount: nodes.length,
          translationsCount: translations.length,
          phase,
          progress,
        },
      );

      // Apply translations immediately to DOM
      this.applyTranslationsAndTrack(nodes, translations);

      // Update progress notification
      if (typeof progress?.percentage === "number") {
        this.progressNotification.updatePhase(phase, progress.percentage);
      }

      console.log(
        `[Content:ContentScript] ${timestamp} - Batch applied successfully:`,
        `Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`,
      );

      logger.log(
        `Batch ${payload.batchIndex} completed: ${translations.length} texts translated`,
      );
    } catch (error) {
      console.error(
        `[Content:ContentScript] ${timestamp} - Failed to handle batch completed:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("Failed to handle batch completed:", error);
    }
  }

  /**
   * Translate only newly added DOM nodes (incremental translation)
   */
  private async translateNewNodes(
    nodes: Node[],
    targetLanguage: string,
  ): Promise<void> {
    try {
      const uniqueNodes = Array.from(new Set(nodes));
      const changedNodes = uniqueNodes.filter((node) => {
        if (!this.isTextNodeTranslatable(node)) return false;

        const currentText = node.textContent?.trim() || "";
        const previousText = this.lastObservedNodeText.get(node);

        return previousText !== currentText;
      });

      if (changedNodes.length === 0) return;

      const textNodes: TextNode[] = changedNodes.map((node, index) => ({
        node,
        text: node.textContent?.trim() || "",
        index,
      }));

      const texts = textNodes.map((n) => n.text);
      const { textsToTranslate, originalIndices } = filterBatchTexts(texts);

      if (textsToTranslate.length === 0) {
        changedNodes.forEach((node) => this.trackNodeText(node));
        return;
      }

      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: textsToTranslate,
          targetLanguage,
          semiParallel: false,
        },
      });

      if (response?.success && response?.data?.translations) {
        const nodesToTranslate = originalIndices.map((i) => textNodes[i]);
        this.applyTranslationsAndTrack(
          nodesToTranslate,
          response.data.translations,
        );

        const translatedIndexSet = new Set(originalIndices);
        textNodes.forEach((textNode, index) => {
          if (!translatedIndexSet.has(index)) {
            this.trackNodeText(textNode.node);
          }
        });
      }
    } catch (error) {
      logger.error("Failed to translate new nodes:", error);
    }
  }

  private applyTranslationsAndTrack(
    nodes: TextNode[],
    translations: string[],
  ): void {
    this.domManipulator.applyTranslations(nodes, translations);

    nodes.forEach((textNode, index) => {
      if (translations[index] && translations[index].trim()) {
        this.trackNodeText(textNode.node);
      }
    });
  }

  private trackNodeText(node: Node): void {
    const text = node.textContent?.trim();
    if (text) {
      this.lastObservedNodeText.set(node, text);
    }
  }

  private queueDynamicTranslation(
    nodes: Iterable<Node>,
    targetLanguage: string,
  ): void {
    for (const node of nodes) {
      this.pendingDynamicNodes.add(node);
    }

    if (this.isDynamicFlushScheduled) {
      return;
    }

    this.isDynamicFlushScheduled = true;

    queueMicrotask(() => {
      this.isDynamicFlushScheduled = false;

      if (!this.isTranslated || this.pendingDynamicNodes.size === 0) {
        this.pendingDynamicNodes.clear();
        return;
      }

      const nodesToTranslate = Array.from(this.pendingDynamicNodes);
      this.pendingDynamicNodes.clear();
      void this.translateNewNodes(nodesToTranslate, targetLanguage);
    });
  }

  private collectTextNodesFromAddedNode(
    addedNode: Node,
    collector: Set<Node>,
  ): void {
    if (addedNode.nodeType === Node.TEXT_NODE) {
      if (this.isTextNodeTranslatable(addedNode)) {
        collector.add(addedNode);
      }
      return;
    }

    if (addedNode.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = addedNode as Element;
    if (
      element.matches(EXCLUSION_SELECTOR_STRING) ||
      element.closest(EXCLUSION_SELECTOR_STRING)
    ) {
      return;
    }

    this.collectTextNodesFromElement(element, collector);
  }

  private collectTextNodesFromElement(
    root: Element,
    collector: Set<Node>,
  ): void {
    if (
      root.matches(EXCLUSION_SELECTOR_STRING) ||
      root.closest(EXCLUSION_SELECTOR_STRING)
    ) {
      return;
    }

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        this.isTextNodeTranslatable(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT,
    });

    let textNode: Node | null;
    while ((textNode = walker.nextNode())) {
      collector.add(textNode);
    }
  }

  private isTextNodeTranslatable(node: Node): boolean {
    if (node.nodeType !== Node.TEXT_NODE) return false;
    if (!node.textContent?.trim()) return false;

    const parent = node.parentElement;
    if (!parent) return false;

    if (parent.closest(EXCLUSION_SELECTOR_STRING)) return false;
    if (!this.isElementVisible(parent)) return false;

    return true;
  }

  private isElementVisible(element: Element): boolean {
    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }

    let current: Element | null = element;
    while (current) {
      if (
        current.hasAttribute("hidden") ||
        current.getAttribute("aria-hidden") === "true"
      ) {
        return false;
      }

      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.selectionHandler.disable();
    this.mutationObserver.disconnect();
    this.pendingDynamicNodes.clear();
    this.isDynamicFlushScheduled = false;
    this.floatingUI.hide();
    this.progressNotification.remove();
    logger.log("ContentScript cleaned up");
  }
}
