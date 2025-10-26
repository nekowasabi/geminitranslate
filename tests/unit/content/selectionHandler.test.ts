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

// Mock IconBadge
const mockIconBadgeShow = jest.fn();
const mockIconBadgeHide = jest.fn();
jest.mock('@content/iconBadge', () => {
  return {
    IconBadge: jest.fn().mockImplementation(() => ({
      show: mockIconBadgeShow,
      hide: mockIconBadgeHide,
    })),
  };
});

// Mock StorageManager
const mockGetTargetLanguage = jest.fn();
jest.mock('@shared/storage/StorageManager', () => {
  return jest.fn().mockImplementation(() => ({
    getTargetLanguage: mockGetTargetLanguage,
  }));
});

import { SelectionHandler } from '@content/selectionHandler';
import { MessageType } from '@shared/messages/types';

describe('SelectionHandler', () => {
  let selectionHandler: SelectionHandler;

  beforeEach(() => {
    selectionHandler = new SelectionHandler();
    jest.clearAllMocks();
    mockGetTargetLanguage.mockResolvedValue('Japanese');

    // Mock getBoundingClientRect globally
    Range.prototype.getBoundingClientRect = jest.fn().mockReturnValue({
      x: 100,
      y: 200,
      width: 100,
      height: 20,
      top: 200,
      right: 200,
      bottom: 220,
      left: 100,
      toJSON: () => ({}),
    });

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
      mockSend.mockResolvedValueOnce({
        success: true,
        data: {
          translations: ['翻訳されたテキスト'],
        },
      }).mockResolvedValueOnce({
        success: true,
        data: {},
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
        action: 'requestTranslation',
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
        success: true,
        data: {
          translations: [],
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

  describe('IconBadge integration', () => {
    it('should show IconBadge on text selection', (done) => {
      const div = document.createElement('div');
      div.textContent = 'Select this text';
      document.body.appendChild(div);

      selectionHandler.enable();

      // Simulate selection
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Simulate mouseup event
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      });
      document.dispatchEvent(mouseUpEvent);

      // Wait for event handler
      setTimeout(() => {
        expect(mockIconBadgeShow).toHaveBeenCalled();
        expect(mockIconBadgeShow).toHaveBeenCalledWith(
          expect.objectContaining({
            x: expect.any(Number),
            y: expect.any(Number),
          }),
          expect.any(Function)
        );

        // Cleanup
        document.body.removeChild(div);
        done();
      }, 15);
    });

    it('should hide IconBadge when disabled', () => {
      selectionHandler.enable();
      selectionHandler.disable();

      expect(mockIconBadgeHide).toHaveBeenCalled();
    });

    it('should not show IconBadge when no text is selected', (done) => {
      selectionHandler.enable();

      // Simulate mouseup without selection
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      setTimeout(() => {
        expect(mockIconBadgeShow).not.toHaveBeenCalled();
        done();
      }, 15);
    });

    it('should trigger translation when IconBadge is clicked', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['翻訳結果'],
        },
      });

      const div = document.createElement('div');
      div.textContent = 'Click badge to translate';
      document.body.appendChild(div);

      selectionHandler.enable();

      // Simulate selection
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Simulate mouseup
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      // Wait for icon badge to show
      await new Promise(resolve => setTimeout(resolve, 15));

      // Get the onClick callback from the IconBadge.show call
      const onClickCallback = mockIconBadgeShow.mock.calls[0][1];

      // Simulate IconBadge click
      await onClickCallback();

      expect(mockSend).toHaveBeenCalledWith({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Click badge to translate'],
          targetLanguage: 'Japanese',
        },
      });

      // Cleanup
      document.body.removeChild(div);
    });

    it('should prevent concurrent translations with isTranslating flag', async () => {
      let callCount = 0;
      mockSend.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call - REQUEST_TRANSLATION
          return new Promise(resolve => setTimeout(() => resolve({
            success: true,
            data: { translations: ['結果'] },
          }), 100));
        } else {
          // Second call - SELECTION_TRANSLATED
          return Promise.resolve({ success: true, data: {} });
        }
      });

      const div = document.createElement('div');
      div.textContent = 'Test concurrent';
      document.body.appendChild(div);

      // Simulate selection
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      selectionHandler.enable();

      // Simulate mouseup
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      await new Promise(resolve => setTimeout(resolve, 15));

      // Get onClick callback
      const onClickCallback = mockIconBadgeShow.mock.calls[0][1];

      // Start first translation
      const firstTranslation = onClickCallback();

      // Try to start second translation (should be prevented)
      const secondTranslation = onClickCallback();

      await Promise.all([firstTranslation, secondTranslation]);

      // Should call send twice for successful translation (REQUEST + SELECTION_TRANSLATED)
      // But second concurrent call should be prevented, so still only 2 calls total
      expect(mockSend).toHaveBeenCalledTimes(2);

      // Verify first call was REQUEST_TRANSLATION
      expect(mockSend).toHaveBeenNthCalledWith(1, {
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: ['Test concurrent'],
          targetLanguage: 'Japanese',
        },
      });

      // Cleanup
      document.body.removeChild(div);
    });
  });
});
