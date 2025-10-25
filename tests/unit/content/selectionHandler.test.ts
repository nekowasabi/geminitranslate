/**
 * SelectionHandler Unit Tests
 */

// Mock logger
jest.mock('@shared/utils', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock MessageBus
const mockSend = jest.fn();
jest.mock('@shared/messages/MessageBus', () => {
  return {
    MessageBus: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

import { SelectionHandler } from '@content/selectionHandler';
import { MessageType } from '@shared/messages/types';

describe('SelectionHandler', () => {
  let selectionHandler: SelectionHandler;

  beforeEach(() => {
    selectionHandler = new SelectionHandler();
    jest.clearAllMocks();

    // Reset selection
    window.getSelection()?.removeAllRanges();
  });

  describe('enable', () => {
    it('should add mouseup event listener', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      selectionHandler.enable();

      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });

    it('should not add listener multiple times', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

      selectionHandler.enable();
      selectionHandler.enable();

      expect(addEventListenerSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('disable', () => {
    it('should remove mouseup event listener', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      selectionHandler.enable();
      selectionHandler.disable();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });

    it('should handle disable when not enabled', () => {
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      selectionHandler.disable();

      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });
  });

  describe('getSelectedText', () => {
    it('should return selected text', () => {
      // Create a text node
      const div = document.createElement('div');
      div.textContent = 'Test selection text';
      document.body.appendChild(div);

      // Select the text
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBe('Test selection text');

      // Cleanup
      document.body.removeChild(div);
    });

    it('should return null when no selection', () => {
      window.getSelection()?.removeAllRanges();

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBeNull();
    });

    it('should return null for whitespace-only selection', () => {
      const div = document.createElement('div');
      div.textContent = '   ';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBeNull();

      // Cleanup
      document.body.removeChild(div);
    });

    it('should trim whitespace from selection', () => {
      const div = document.createElement('div');
      div.textContent = '  Trimmed text  ';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBe('Trimmed text');

      // Cleanup
      document.body.removeChild(div);
    });
  });

  describe('translateSelection', () => {
    it('should send translation request via MessageBus', async () => {
      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: ['翻訳されたテキスト'],
          targetLanguage: 'ja',
        },
      });

      // Create selection
      const div = document.createElement('div');
      div.textContent = 'Hello World';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = await selectionHandler.translateSelection('ja');

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.REQUEST_TRANSLATION,
        payload: {
          texts: ['Hello World'],
          targetLanguage: 'ja',
        },
      });

      expect(result).toBe('翻訳されたテキスト');

      // Cleanup
      document.body.removeChild(div);
    });

    it('should return null when no selection', async () => {
      window.getSelection()?.removeAllRanges();

      const result = await selectionHandler.translateSelection('ja');

      expect(result).toBeNull();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should handle translation errors gracefully', async () => {
      mockSend.mockRejectedValue(new Error('Translation failed'));

      // Create selection
      const div = document.createElement('div');
      div.textContent = 'Error test';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = await selectionHandler.translateSelection('ja');

      expect(result).toBeNull();

      // Cleanup
      document.body.removeChild(div);
    });

    it('should handle empty translation response', async () => {
      mockSend.mockResolvedValue({
        type: MessageType.TRANSLATION_RESPONSE,
        payload: {
          translations: [],
          targetLanguage: 'ja',
        },
      });

      // Create selection
      const div = document.createElement('div');
      div.textContent = 'Test text';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const result = await selectionHandler.translateSelection('ja');

      expect(result).toBeNull();

      // Cleanup
      document.body.removeChild(div);
    });
  });

  describe('mouseup event handling', () => {
    it('should detect selection on mouseup', (done) => {
      const div = document.createElement('div');
      div.textContent = 'Click and select me';
      document.body.appendChild(div);

      // Spy on getSelectedText
      const getSelectedTextSpy = jest.spyOn(selectionHandler, 'getSelectedText');

      selectionHandler.enable();

      // Simulate selection
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Simulate mouseup event
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      // Wait for event handler
      setTimeout(() => {
        expect(getSelectedTextSpy).toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(div);
        done();
      }, 10);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple enable/disable cycles', () => {
      selectionHandler.enable();
      selectionHandler.disable();
      selectionHandler.enable();
      selectionHandler.disable();

      // Should not throw errors
      expect(true).toBe(true);
    });

    it('should handle special characters in selection', () => {
      const div = document.createElement('div');
      div.textContent = '特殊文字 & <HTML> "quotes"';
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBe('特殊文字 & <HTML> "quotes"');

      // Cleanup
      document.body.removeChild(div);
    });

    it('should handle long selections', () => {
      const longText = 'A'.repeat(10000);
      const div = document.createElement('div');
      div.textContent = longText;
      document.body.appendChild(div);

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const selectedText = selectionHandler.getSelectedText();

      expect(selectedText).toBe(longText);

      // Cleanup
      document.body.removeChild(div);
    });
  });
});
