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
    const timestamp = new Date().toISOString();
    console.log(`[Content:ContentScript] ${timestamp} - handleMessage() called:`, {
      messageType: message.type,
      payload: 'payload' in message ? message.payload : undefined
    });

    logger.log('ContentScript received message:', message.type);

    try {
      switch (message.type) {
        case MessageType.TRANSLATE_PAGE:
          console.log(`[Content:ContentScript] ${timestamp} - Handling TRANSLATE_PAGE:`, {
            targetLanguage: 'payload' in message ? message.payload.targetLanguage : 'en'
          });
          await this.translatePage('payload' in message ? message.payload.targetLanguage : 'en');
          console.log(`[Content:ContentScript] ${timestamp} - TRANSLATE_PAGE completed successfully`);
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_SELECTION:
          console.log(`[Content:ContentScript] ${timestamp} - Handling TRANSLATE_SELECTION`);
          await this.translateSelection('payload' in message ? message.payload.targetLanguage : 'en');
          console.log(`[Content:ContentScript] ${timestamp} - TRANSLATE_SELECTION completed successfully`);
          sendResponse({ success: true });
          break;

        case MessageType.TRANSLATE_CLIPBOARD:
          console.log(`[Content:ContentScript] ${timestamp} - Handling TRANSLATE_CLIPBOARD`);
          await this.translateClipboard('payload' in message ? message.payload.targetLanguage : 'en');
          console.log(`[Content:ContentScript] ${timestamp} - TRANSLATE_CLIPBOARD completed successfully`);
          sendResponse({ success: true });
          break;

        case MessageType.RESET:
          console.log(`[Content:ContentScript] ${timestamp} - Handling RESET`);
          this.reset();
          console.log(`[Content:ContentScript] ${timestamp} - RESET completed successfully`);
          sendResponse({ success: true });
          break;

        default:
          console.warn(`[Content:ContentScript] ${timestamp} - Unknown message type:`, message.type);
          logger.log('Unknown message type:', message.type);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error(`[Content:ContentScript] ${timestamp} - Error handling message:`, {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      logger.error('Error handling message:', error);
      sendResponse({ success: false, error: String(error) });
    }
  }

  /**
   * Translate entire page
   */
  private async translatePage(targetLanguage: string): Promise<void> {
    const timestamp = new Date().toISOString();
    console.log(`[Content:ContentScript] ${timestamp} - translatePage() called:`, { targetLanguage });

    try {
      logger.log('Translating page to', targetLanguage);

      // Extract text nodes
      console.log(`[Content:ContentScript] ${timestamp} - Extracting text nodes from DOM...`);
      this.extractedNodes = this.domManipulator.extractTextNodes();

      console.log(`[Content:ContentScript] ${timestamp} - Text nodes extracted:`, {
        count: this.extractedNodes.length
      });

      if (this.extractedNodes.length === 0) {
        console.warn(`[Content:ContentScript] ${timestamp} - No text nodes to translate`);
        logger.log('No text nodes to translate');
        return;
      }

      // Extract texts
      const texts = this.extractedNodes.map(node => node.text);

      console.log(`[Content:ContentScript] ${timestamp} - Prepared texts for translation:`, {
        count: texts.length,
        firstText: texts[0]?.substring(0, 50)
      });

      logger.log(`Extracted ${texts.length} text nodes`);

      // Request translations from background
      console.log(`[Content:ContentScript] ${timestamp} - Sending REQUEST_TRANSLATION to background:`, {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        textsCount: texts.length,
        targetLanguage
      });

      const response = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts,
          targetLanguage,
        },
      });

      console.log(`[Content:ContentScript] ${timestamp} - Received response from background:`, {
        response,
        success: response?.success,
        hasData: !!response?.data,
        hasTranslations: !!response?.data?.translations
      });

      if (response?.success && response?.data?.translations) {
        const translations = response.data.translations;

        console.log(`[Content:ContentScript] ${timestamp} - Applying translations to DOM:`, {
          translationsCount: translations.length,
          firstTranslation: translations[0]?.substring(0, 50)
        });

        // Apply translations
        this.domManipulator.applyTranslations(this.extractedNodes, translations);

        this.isTranslated = true;

        console.log(`[Content:ContentScript] ${timestamp} - Page translation completed successfully`);
        logger.log('Page translation completed');
      } else {
        console.warn(`[Content:ContentScript] ${timestamp} - No translations received in response:`, response);
        logger.warn('No translations received');
      }
    } catch (error) {
      console.error(`[Content:ContentScript] ${timestamp} - Failed to translate page:`, {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
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
