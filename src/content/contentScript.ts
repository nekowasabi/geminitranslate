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
import { ApproachingNodeObserver } from "./proximityClassifier";
import { SelectionHandler } from "./selectionHandler";
import { ClipboardHandler } from "./clipboardHandler";
import { MutationObserverManager } from "./mutationObserver";
import { FloatingUI } from "./floatingUI";
import { ProgressNotification } from "./progressNotification";
import { MessageBus } from "@shared/messages/MessageBus";
import { MessageType, Message, TranslationPhase } from "@shared/messages/types";
import { logger } from "@shared/utils";
import { filterBatchTexts } from "@shared/utils/textFilter";
import { API_CONFIG } from "@shared/constants";

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
  // Why: currentTranslationNodes(単一配列)ではなくphaseNodes Map — Phase1/2のノードが相互に上書きされるレースコンディションを防ぐため
  private phaseNodes: Map<TranslationPhase, TextNode[]> = new Map();
  /**
   * Last observed text snapshot per node to avoid duplicate re-translation
   */
  private lastObservedNodeText: WeakMap<Node, string> = new WeakMap();
  /**
   * Pending text nodes for debounce-batched dynamic translation
   */
  private pendingDynamicNodes: Set<Node> = new Set();
  private dynamicTranslationTimer: ReturnType<typeof setTimeout> | null = null;
  private translatingDynamicNodes: WeakSet<Node> = new WeakSet();
  private translatedNodeText: WeakMap<Node, string> = new WeakMap();
  private failedDynamicNodeText: WeakMap<
    Node,
    { text: string; retryAfter: number }
  > = new WeakMap();
  private readonly DYNAMIC_FAILURE_COOLDOWN_MS = 30000;
  private phaseAppliedNodeIndices: Map<TranslationPhase, Set<number>> =
    new Map();
  private approachingObserver: ApproachingNodeObserver | null = null;
  private pageTranslationInFlight = false;

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
    logger.log(
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
          logger.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_PAGE:`,
            {
              targetLanguage:
                "payload" in message ? message.payload.targetLanguage : "en",
            },
          );
          {
            const targetLanguage =
              "payload" in message ? message.payload.targetLanguage : "en";
            if (this.selectionHandler.getSelectedText()) {
              await this.translateSelection(targetLanguage);
            } else {
              await this.translatePage(targetLanguage);
            }
          }
          logger.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_PAGE completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_SELECTION:
          logger.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_SELECTION`,
          );
          await this.translateSelection(
            "payload" in message ? message.payload.targetLanguage : "en",
          );
          logger.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_SELECTION completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_CLIPBOARD:
          logger.log(
            `[Content:ContentScript] ${timestamp} - Handling TRANSLATE_CLIPBOARD`,
          );
          await this.translateClipboard(
            "payload" in message ? message.payload.targetLanguage : "en",
          );
          logger.log(
            `[Content:ContentScript] ${timestamp} - TRANSLATE_CLIPBOARD completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.RESET:
          logger.log(`[Content:ContentScript] ${timestamp} - Handling RESET`);
          this.reset();
          logger.log(
            `[Content:ContentScript] ${timestamp} - RESET completed successfully`,
          );
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATION_PROGRESS:
          logger.log(
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
          logger.log(
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
          logger.log(
            `[Content:ContentScript] ${timestamp} - Handling BATCH_COMPLETED`,
          );
          if ("payload" in message && message.payload) {
            this.handleBatchCompleted(message.payload);
          }
          sendResponse({ success: true });
          break;

        default:
          logger.warn(
            `[Content:ContentScript] ${timestamp} - Unknown message type:`,
            message.type,
          );
          logger.log("Unknown message type:", message.type);
          sendResponse({ success: false, error: "Unknown message type" });
      }
    } catch (error) {
      logger.error(
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
    logger.log(
      `[Content:ContentScript] ${timestamp} - translatePage() called:`,
      { targetLanguage },
    );

    this.disableDynamicTranslation();
    this.pageTranslationInFlight = true;
    try {
      logger.log("Translating page to", targetLanguage);

      logger.log(
        `[Content:ContentScript] ${timestamp} - Extracting text nodes from DOM...`,
      );
      this.extractedNodes = this.domManipulator.extractTextNodes();

      logger.log(
        `[Content:ContentScript] ${timestamp} - Text nodes extracted:`,
        {
          count: this.extractedNodes.length,
        },
      );

      if (this.extractedNodes.length === 0) {
        logger.warn(
          `[Content:ContentScript] ${timestamp} - No text nodes to translate`,
        );
        logger.log("No text nodes to translate");
        return;
      }

      logger.log(
        `[Content:ContentScript] ${timestamp} - Detecting viewport nodes...`,
      );
      const { viewport, outOfViewport } =
        this.domManipulator.detectViewportNodes(this.extractedNodes);
      const { near, far } =
        this.domManipulator.classifyOutOfViewport(outOfViewport);

      logger.log(
        `[Content:ContentScript] ${timestamp} - Viewport detection completed:`,
        {
          viewportCount: viewport.length,
          nearCount: near.length,
          farCount: far.length,
        },
      );

      // Why: include far in the same job (last) instead of IO-only leftover.
      // Holding far until intersection marked the page complete mid-article.
      const immediateNodes = [...viewport, ...near, ...far];
      let shouldAnnounceComplete = immediateNodes.length === 0;

      if (immediateNodes.length > 0) {
        this.progressNotification.showPhase(1, immediateNodes.length);

        const immediateTexts = immediateNodes.map((node) => node.text);
        const { textsToTranslate, originalIndices } =
          filterBatchTexts(immediateTexts);

        if (textsToTranslate.length === 0) {
          logger.log(
            `[Content:ContentScript] ${timestamp} - Immediate job skipped: All texts filtered`,
          );
          this.progressNotification.completePhase(1);
          shouldAnnounceComplete = true;
        } else {
          this.phaseNodes.set(
            1,
            originalIndices.map((i) => immediateNodes[i]),
          );

          logger.log(
            `[Content:ContentScript] ${timestamp} - Sending unified REQUEST_TRANSLATION including far remainder:`,
            {
              type: MessageType.REQUEST_TRANSLATION,
              action: "requestTranslation",
              textsCount: textsToTranslate.length,
              filteredFrom: immediateTexts.length,
              farCount: far.length,
              farIncludedInFirstRequest: true,
              targetLanguage,
              semiParallel: true,
              priorityCount: 1,
              phase: 1,
            },
          );

          try {
            const response = await this.messageBus.send(
              {
                type: MessageType.REQUEST_TRANSLATION,
                action: "requestTranslation",
                payload: {
                  texts: textsToTranslate,
                  targetLanguage,
                  semiParallel: true,
                  priorityCount: 1,
                  phase: 1,
                },
              },
              API_CONFIG.TRANSLATION_MESSAGE_TIMEOUT_MS,
            );

            logger.log(
              `[Content:ContentScript] ${timestamp} - Immediate job response received:`,
              {
                success: response?.success,
                hasTranslations: !!response?.data?.translations,
              },
            );

            if (response?.success && response?.data?.translations) {
              const nodesToTranslate = originalIndices.map(
                (i) => immediateNodes[i],
              );
              this.applyPhaseTranslationsAndTrack(
                1,
                nodesToTranslate,
                response.data.translations,
              );
              this.progressNotification.completePhase(1);
              shouldAnnounceComplete = true;
            } else {
              logger.warn(
                `[Content:ContentScript] ${timestamp} - Immediate job failed:`,
                response,
              );
              // Why: complete() would show 100% while unapplied remainder stays English.
              this.progressNotification.error(
                typeof response?.error === "string"
                  ? response.error
                  : "Translation failed",
              );
            }
          } catch (error) {
            logger.error(
              `[Content:ContentScript] ${timestamp} - Immediate job translation error:`,
              error,
            );
            this.progressNotification.error(
              error instanceof Error ? error.message : "Translation failed",
            );
          }
        }
      } else {
        logger.log(
          `[Content:ContentScript] ${timestamp} - Immediate job skipped: No viewport/near nodes`,
        );
      }

      this.isTranslated = true;
      if (shouldAnnounceComplete) {
        this.progressNotification.complete();
      }
      this.enableDynamicTranslation(targetLanguage);

      logger.log(
        `[Content:ContentScript] ${timestamp} - Page translation completed successfully`,
      );
      logger.log("Page translation completed");
    } catch (error) {
      logger.error(
        `[Content:ContentScript] ${timestamp} - Failed to translate page:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("Failed to translate page:", error);

      this.progressNotification.error(
        error instanceof Error ? error.message : "Translation failed",
      );

      throw error;
    } finally {
      this.pageTranslationInFlight = false;
    }
  }

  /**
   * Translate selected text
   */
  private async translateSelection(targetLanguage: string): Promise<void> {
    try {
      // Why: shortcut must use the same right-edge panel as the T button.
      // FloatingUI sits near the selection and is hard to read.
      await this.selectionHandler.runSelectionTranslation(targetLanguage);
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
      if (this.dynamicTranslationTimer) {
        clearTimeout(this.dynamicTranslationTimer);
        this.dynamicTranslationTimer = null;
      }
      this.lastObservedNodeText = new WeakMap();
      this.translatingDynamicNodes = new WeakSet();
      this.translatedNodeText = new WeakMap();
      this.failedDynamicNodeText = new WeakMap();
      this.phaseNodes.clear();
      this.phaseAppliedNodeIndices.clear();

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
            this.isTextNodeTranslatable(target) &&
            !this.isKnownTranslatedMutation(target)
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

      if (
        detectedTextNodes.size > 0 &&
        this.isTranslated &&
        !this.pageTranslationInFlight
      ) {
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
    if (this.dynamicTranslationTimer) {
      clearTimeout(this.dynamicTranslationTimer);
      this.dynamicTranslationTimer = null;
    }
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
    logger.log(
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

      const phaseNodeList = this.phaseNodes.get(phase) ?? [];
      if (phaseNodeList.length === 0) {
        logger.warn(
          `[Content:ContentScript] ${timestamp} - phaseNodes[${phase}] is empty, skipping batch application`,
        );
        this.applyBatchProgress(phase, progress);
        return;
      }

      const appliedIndices = this.getAppliedNodeIndicesForPhase(phase);
      const pendingPairs = nodeIndices
        .map((nodeIndex: number, translationIndex: number) => ({
          nodeIndex,
          translation: translations[translationIndex],
        }))
        .filter(
          (pair) =>
            pair.nodeIndex < phaseNodeList.length &&
            !appliedIndices.has(pair.nodeIndex),
        );
      const nodes = pendingPairs.map((pair) => phaseNodeList[pair.nodeIndex]);
      const pendingTranslations = pendingPairs.map((pair) => pair.translation);
      const translationsForApply = pendingTranslations.every(
        (translation, index) => translation === translations[index],
      )
        ? translations
        : pendingTranslations;

      if (nodes.length !== translationsForApply.length) {
        logger.warn(
          `[Content:ContentScript] ${timestamp} - Mismatch: nodes(${nodes.length}) vs translations(${translationsForApply.length})`,
        );
      }

      logger.log(
        `[Content:ContentScript] ${timestamp} - Applying batch translations:`,
        {
          nodesCount: nodes.length,
          translationsCount: translationsForApply.length,
          phase,
          progress,
        },
      );

      // Apply translations immediately to DOM
      this.applyTranslationsAndTrack(nodes, translationsForApply);
      pendingPairs.forEach((pair) => appliedIndices.add(pair.nodeIndex));

      this.applyBatchProgress(phase, progress);

      logger.log(
        `[Content:ContentScript] ${timestamp} - Batch applied successfully:`,
        `Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`,
      );

      logger.log(
        `Batch ${payload.batchIndex} completed: ${translations.length} texts translated`,
      );
    } catch (error) {
      logger.error(
        `[Content:ContentScript] ${timestamp} - Failed to handle batch completed:`,
        {
          error,
          message: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      logger.error("Failed to handle batch completed:", error);
      this.applyBatchProgress(payload?.phase, payload?.progress);
    }
  }

  private applyBatchProgress(
    phase: TranslationPhase | undefined,
    progress:
      | { current: number; total: number; percentage: number }
      | undefined,
  ): void {
    if (phase !== 1 && phase !== 2) {
      return;
    }
    if (
      typeof progress?.current === "number" &&
      typeof progress?.total === "number"
    ) {
      this.progressNotification.updatePhase(
        phase,
        progress.current,
        progress.total,
      );
      return;
    }
    if (typeof progress?.percentage === "number") {
      this.progressNotification.updatePhase(phase, progress.percentage);
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
        if (this.translatingDynamicNodes.has(node)) return false;
        if (this.isKnownTranslatedMutation(node)) return false;

        const currentText = node.textContent?.trim() || "";
        const previousText = this.lastObservedNodeText.get(node);
        const recentFailure = this.failedDynamicNodeText.get(node);

        if (
          recentFailure &&
          recentFailure.text === currentText &&
          recentFailure.retryAfter > Date.now()
        ) {
          return false;
        }

        return previousText !== currentText;
      });

      if (changedNodes.length === 0) return;

      const textNodes: TextNode[] = changedNodes.map((node, index) =>
        this.domManipulator.createTextNode(node, index),
      );

      const texts = textNodes.map((n) => n.text);
      const { textsToTranslate, originalIndices } = filterBatchTexts(texts);

      if (textsToTranslate.length === 0) {
        changedNodes.forEach((node) => this.trackNodeText(node));
        return;
      }

      const translationGroups = new Map<
        string,
        { representativeText: string; items: TextNode[] }
      >();

      for (const originalIndex of originalIndices) {
        const textNode = textNodes[originalIndex];
        const key = textNode.text;
        const group = translationGroups.get(key);
        if (group) {
          group.items.push(textNode);
        } else {
          translationGroups.set(key, {
            representativeText: key,
            items: [textNode],
          });
        }
      }

      const uniqueTextsToTranslate = Array.from(translationGroups.values()).map(
        (group) => group.representativeText,
      );
      const nodesInFlight = Array.from(translationGroups.values()).flatMap(
        (group) => group.items.map((item) => item.node),
      );
      nodesInFlight.forEach((node) => this.translatingDynamicNodes.add(node));

      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: "requestTranslation",
        payload: {
          texts: uniqueTextsToTranslate,
          targetLanguage,
          semiParallel: false,
        },
      });

      if (response?.success && response?.data?.translations) {
        const nodesToApply: TextNode[] = [];
        const translationsToApply: string[] = [];

        Array.from(translationGroups.values()).forEach((group, index) => {
          const translation = response.data.translations[index];
          group.items.forEach((textNode) => {
            nodesToApply.push(textNode);
            translationsToApply.push(translation);
          });
        });

        this.applyTranslationsAndTrack(nodesToApply, translationsToApply);

        const translatedIndexSet = new Set(originalIndices);
        textNodes.forEach((textNode, index) => {
          if (!translatedIndexSet.has(index)) {
            this.trackNodeText(textNode.node);
          }
        });
      } else {
        nodesInFlight.forEach((node) =>
          this.markDynamicTranslationFailure(node),
        );
      }
    } catch (error) {
      nodes.forEach((node) => this.markDynamicTranslationFailure(node));
      logger.error("Failed to translate new nodes:", error);
    } finally {
      nodes.forEach((node) => this.translatingDynamicNodes.delete(node));
    }
  }

  private applyPhaseTranslationsAndTrack(
    phase: TranslationPhase,
    nodes: TextNode[],
    translations: string[],
  ): void {
    const appliedIndices = this.getAppliedNodeIndicesForPhase(phase);
    const pendingNodes: TextNode[] = [];
    const pendingTranslations: string[] = [];

    nodes.forEach((node, index) => {
      if (appliedIndices.has(index)) {
        return;
      }
      pendingNodes.push(node);
      pendingTranslations.push(translations[index]);
      appliedIndices.add(index);
    });

    this.applyTranslationsAndTrack(pendingNodes, pendingTranslations);
  }

  private applyTranslationsAndTrack(
    nodes: TextNode[],
    translations: string[],
  ): void {
    this.domManipulator.applyTranslations(nodes, translations);

    nodes.forEach((textNode, index) => {
      if (translations[index] && translations[index].trim()) {
        this.trackNodeText(textNode.node);
        this.translatedNodeText.set(
          textNode.node,
          textNode.node.textContent?.trim() || "",
        );
      }
    });
  }

  private trackNodeText(node: Node): void {
    const text = node.textContent?.trim();
    if (text) {
      this.lastObservedNodeText.set(node, text);
    }
  }

  private markDynamicTranslationFailure(node: Node): void {
    const text = node.textContent?.trim();
    if (!text) return;
    this.failedDynamicNodeText.set(node, {
      text,
      retryAfter: Date.now() + this.DYNAMIC_FAILURE_COOLDOWN_MS,
    });
  }

  private isKnownTranslatedMutation(node: Node): boolean {
    const currentText = node.textContent?.trim();
    const translatedText = this.translatedNodeText.get(node);
    return !!currentText && translatedText === currentText;
  }

  private getAppliedNodeIndicesForPhase(phase: TranslationPhase): Set<number> {
    let indices = this.phaseAppliedNodeIndices.get(phase);
    if (!indices) {
      indices = new Set();
      this.phaseAppliedNodeIndices.set(phase, indices);
    }
    return indices;
  }

  private queueDynamicTranslation(
    nodes: Iterable<Node>,
    targetLanguage: string,
  ): void {
    if (this.pageTranslationInFlight) {
      return;
    }

    for (const node of nodes) {
      this.pendingDynamicNodes.add(node);
    }

    // Why: setTimeout(50ms) instead of queueMicrotask — debounce for SPA high-frequency mutations
    if (this.dynamicTranslationTimer) clearTimeout(this.dynamicTranslationTimer);
    this.dynamicTranslationTimer = setTimeout(() => {
      this.dynamicTranslationTimer = null;

      if (!this.isTranslated || this.pendingDynamicNodes.size === 0) {
        this.pendingDynamicNodes.clear();
        return;
      }

      const nodesToTranslate = Array.from(this.pendingDynamicNodes);
      this.pendingDynamicNodes.clear();
      void this.translateNewNodes(nodesToTranslate, targetLanguage);
    }, 50);
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
    if (this.domManipulator.isExcludedElement(element)) {
      return;
    }

    this.collectTextNodesFromElement(element, collector);
  }

  private collectTextNodesFromElement(
    root: Element,
    collector: Set<Node>,
  ): void {
    if (this.domManipulator.isExcludedElement(root)) {
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

    if (this.domManipulator.isExcludedElement(parent)) return false;
    if (!this.isElementVisible(parent)) return false;

    return true;
  }

  private isElementVisible(element: Element): boolean {
    // Fast path 1: hidden 属性チェック（低コスト）
    if (element.closest('[hidden], [aria-hidden="true"]')) return false;

    // Fast path 2: 対象要素自身の display:none を先に確認
    // Why: getComputedStyle を1回だけ呼び、display:none なら即リターン
    const selfStyle = window.getComputedStyle(element);
    if (selfStyle.display === "none" || selfStyle.visibility === "hidden") return false;

    // 祖先トラバース（必要な場合のみ）
    let current: Element | null = element.parentElement;
    while (current) {
      // hidden 属性の簡易チェックを先行
      if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return false;
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
      current = current.parentElement;
    }

    return true;
  }

  /**
   * Cleanup resources
   */
  private watchFarNodes(farNodes: TextNode[], targetLanguage: string): void {
    this.approachingObserver?.disconnect();
    this.approachingObserver = null;
    if (farNodes.length === 0) {
      return;
    }

    const pending = new Set(farNodes.map((textNode) => textNode.node));
    this.approachingObserver = new ApproachingNodeObserver((nodes) => {
      const approached = nodes.filter((node) => pending.has(node));
      approached.forEach((node) => pending.delete(node));
      if (approached.length > 0) {
        void this.translateNewNodes(approached, targetLanguage);
      }
    });
    this.approachingObserver.watch(farNodes.map((textNode) => textNode.node));
  }

  cleanup(): void {
    this.selectionHandler.disable();
    this.mutationObserver.disconnect();
    this.approachingObserver?.disconnect();
    this.approachingObserver = null;
    this.pendingDynamicNodes.clear();
    if (this.dynamicTranslationTimer) {
      clearTimeout(this.dynamicTranslationTimer);
      this.dynamicTranslationTimer = null;
    }
    this.floatingUI.hide();
    this.progressNotification.remove();
    logger.log("ContentScript cleaned up");
  }
}
