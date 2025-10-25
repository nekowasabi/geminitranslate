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

import { DOMManipulator, TextNode } from './domManipulator';
import { SelectionHandler } from './selectionHandler';
import { ClipboardHandler } from './clipboardHandler';
import { MutationObserverManager } from './mutationObserver';
import { FloatingUI } from './floatingUI';
import { MessageBus } from '@shared/messages/MessageBus';
import { MessageType, Message } from '@shared/messages/types';
import { logger } from '@shared/utils';

export class ContentScript {
  private domManipulator: DOMManipulator;
  private selectionHandler: SelectionHandler;
  private clipboardHandler: ClipboardHandler;
  private mutationObserver: MutationObserverManager;
  private floatingUI: FloatingUI;
  private messageBus: MessageBus;
  private isTranslated = false;
  private extractedNodes: TextNode[] = [];

  constructor() {
    this.domManipulator = new DOMManipulator();
    this.selectionHandler = new SelectionHandler();
    this.clipboardHandler = new ClipboardHandler();
    this.mutationObserver = new MutationObserverManager();
    this.floatingUI = new FloatingUI();
    this.messageBus = new MessageBus();

    logger.log('ContentScript initialized');
  }

  /**
   * Initialize content script
   */
  initialize(): void {
    // Set up message listeners
    this.messageBus.listen(this.handleMessage.bind(this));

    // Enable selection handler
    this.selectionHandler.enable();

    logger.log('ContentScript ready');
  }

  /**
   * Handle messages from background script
   */
  private async handleMessage(
    message: Message,
    sender: any,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    logger.log('ContentScript received message:', message.type);

    try {
      switch (message.type) {
        case MessageType.TRANSLATE_PAGE:
          await this.translatePage(message.payload?.targetLanguage || 'en');
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_SELECTION:
          await this.translateSelection(message.payload?.targetLanguage || 'en');
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_CLIPBOARD:
          await this.translateClipboard(message.payload?.targetLanguage || 'en');
          sendResponse({ success: true });
          break;

        case MessageType.RESET:
          this.reset();
          sendResponse({ success: true });
          break;

        default:
          logger.log('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      logger.error('Error handling message:', error);
      sendResponse({ success: false, error: String(error) });
    }
  }

  /**
   * Translate entire page
   */
  private async translatePage(targetLanguage: string): Promise<void> {
    try {
      logger.log('Translating page to', targetLanguage);

      // Extract text nodes
      this.extractedNodes = this.domManipulator.extractTextNodes();

      if (this.extractedNodes.length === 0) {
        logger.log('No text nodes to translate');
        return;
      }

      // Extract texts
      const texts = this.extractedNodes.map(node => node.text);

      logger.log(`Extracted ${texts.length} text nodes`);

      // Request translations from background
      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        payload: {
          texts,
          targetLanguage,
        },
      });

      if (response?.payload?.translations) {
        const translations = response.payload.translations;

        // Apply translations
        this.domManipulator.applyTranslations(this.extractedNodes, translations);

        this.isTranslated = true;

        logger.log('Page translation completed');
      } else {
        logger.warn('No translations received');
      }
    } catch (error) {
      logger.error('Failed to translate page:', error);
      throw error;
    }
  }

  /**
   * Translate selected text
   */
  private async translateSelection(targetLanguage: string): Promise<void> {
    try {
      const translation = await this.selectionHandler.translateSelection(targetLanguage);

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

          logger.log('Selection translation displayed');
        }
      } else {
        logger.log('No selection to translate');
      }
    } catch (error) {
      logger.error('Failed to translate selection:', error);
      throw error;
    }
  }

  /**
   * Translate clipboard content
   */
  private async translateClipboard(targetLanguage: string): Promise<void> {
    try {
      const translation = await this.clipboardHandler.translateClipboard(targetLanguage);

      if (translation) {
        // Show floating UI at center of screen
        this.floatingUI.show(translation, {
          x: window.innerWidth / 2 - 200,
          y: window.innerHeight / 2 - 100,
        });

        logger.log('Clipboard translation displayed');
      } else {
        logger.log('No clipboard content to translate');
      }
    } catch (error) {
      logger.error('Failed to translate clipboard:', error);
      throw error;
    }
  }

  /**
   * Reset page to original state
   */
  private reset(): void {
    try {
      this.domManipulator.reset();
      this.floatingUI.hide();
      this.isTranslated = false;

      logger.log('Page reset to original state');
    } catch (error) {
      logger.error('Failed to reset page:', error);
      throw error;
    }
  }

  /**
   * Enable dynamic content monitoring
   */
  enableDynamicTranslation(targetLanguage: string): void {
    this.mutationObserver.observe(async (mutations) => {
      // Check if new text nodes were added
      const hasNewTextNodes = mutations.some(mutation =>
        Array.from(mutation.addedNodes).some(node => node.nodeType === Node.TEXT_NODE)
      );

      if (hasNewTextNodes && this.isTranslated) {
        logger.log('Dynamic content detected, re-translating');
        await this.translatePage(targetLanguage);
      }
    });

    logger.log('Dynamic translation enabled');
  }

  /**
   * Disable dynamic content monitoring
   */
  disableDynamicTranslation(): void {
    this.mutationObserver.disconnect();
    logger.log('Dynamic translation disabled');
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.selectionHandler.disable();
    this.mutationObserver.disconnect();
    this.floatingUI.hide();
    logger.log('ContentScript cleaned up');
  }
}
