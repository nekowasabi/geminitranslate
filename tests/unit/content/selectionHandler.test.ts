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
const mockSetLoading = jest.fn();
const mockShowInlineError = jest.fn();
jest.mock('@content/iconBadge', () => {
  return {
    IconBadge: Object.assign(
      jest.fn().mockImplementation(() => ({
        show: mockIconBadgeShow,
        hide: mockIconBadgeHide,
        setLoading: mockSetLoading,
        showInlineError: mockShowInlineError,
      })),
      { CLASS_NAME: 'icon-badge' }
    ),
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

  afterEach(() => {
    // Clean up toast elements that may leak between describe blocks
    // Why: IconBadge integration tests trigger showSelectionToast via implementation code,
    // but their describe block has no toast cleanup. Without this, stale toasts persist
    // into the "トースト通知" describe and cause false failures.
    document.querySelectorAll('.gemini-translate-selection-toast').forEach(el => el.remove());
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

    it('should call setLoading(true) then setLoading(false) on successful translation', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: ['翻訳結果'],
        },
      });

      const div = document.createElement('div');
      div.textContent = 'Loading state test';
      document.body.appendChild(div);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      await new Promise(resolve => setTimeout(resolve, 15));

      const onClickCallback = mockIconBadgeShow.mock.calls[0][1];
      await onClickCallback();

      expect(mockSetLoading).toHaveBeenCalledWith(true);
      expect(mockSetLoading).toHaveBeenCalledWith(false);
      // setLoading(true) should be called before setLoading(false)
      const calls = mockSetLoading.mock.calls;
      const trueCallIndex = calls.findIndex((c: unknown[]) => c[0] === true);
      const falseCallIndex = calls.findIndex((c: unknown[]) => c[0] === false);
      expect(trueCallIndex).toBeLessThan(falseCallIndex);

      // Cleanup
      document.body.removeChild(div);
    });

    it('should call showInlineError when translation returns null', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: {
          translations: [],
        },
      });

      const div = document.createElement('div');
      div.textContent = 'Null translation test';
      document.body.appendChild(div);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      await new Promise(resolve => setTimeout(resolve, 15));

      const onClickCallback = mockIconBadgeShow.mock.calls[0][1];
      await onClickCallback();

      expect(mockShowInlineError).toHaveBeenCalledWith('翻訳に失敗しました');

      // Cleanup
      document.body.removeChild(div);
    });

    it('should call showInlineError when translation throws an exception', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const div = document.createElement('div');
      div.textContent = 'Exception test';
      document.body.appendChild(div);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      await new Promise(resolve => setTimeout(resolve, 15));

      const onClickCallback = mockIconBadgeShow.mock.calls[0][1];
      await onClickCallback();

      expect(mockShowInlineError).toHaveBeenCalledWith('翻訳エラーが発生しました');

      // Cleanup
      document.body.removeChild(div);
    });
  });

  describe('トースト通知 (showSelectionToast / hideSelectionToast)', () => {
    afterEach(() => {
      // Ensure fake timers are always restored even if test fails
      jest.useRealTimers();
      // Clean up any toast elements
      document.querySelectorAll('.gemini-translate-selection-toast').forEach(el => el.remove());
    });

    it('showSelectionToast(message, type) でトーストDOM要素が追加されること', () => {
      selectionHandler.showSelectionToast('翻訳中...', 'loading');

      const toast = document.querySelector('.gemini-translate-selection-toast');
      expect(toast).not.toBeNull();
      expect(toast?.textContent).toBe('翻訳中...');
    });

    it('showSelectionToast(message, "loading") で loading スタイル（背景色 #4F46E5）で表示されること', () => {
      selectionHandler.showSelectionToast('翻訳中...', 'loading');

      const toast = document.querySelector('.gemini-translate-selection-toast') as HTMLElement;
      expect(toast).not.toBeNull();
      expect(toast.style.backgroundColor).toBe('rgb(79, 70, 229)'); // #4F46E5
    });

    it('showSelectionToast(message, "error") で error スタイル（背景色 #EF4444）で表示されること', () => {
      selectionHandler.showSelectionToast('エラーが発生しました', 'error');

      const toast = document.querySelector('.gemini-translate-selection-toast') as HTMLElement;
      expect(toast).not.toBeNull();
      expect(toast.style.backgroundColor).toBe('rgb(239, 68, 68)'); // #EF4444
    });

    it('showSelectionToast(message, "info") で info スタイル（背景色 #3B82F6）で表示されること', () => {
      selectionHandler.showSelectionToast('情報メッセージ', 'info');

      const toast = document.querySelector('.gemini-translate-selection-toast') as HTMLElement;
      expect(toast).not.toBeNull();
      expect(toast.style.backgroundColor).toBe('rgb(59, 130, 246)'); // #3B82F6
    });

    it('hideSelectionToast() でトーストが非表示（DOMから除去）になること', () => {
      selectionHandler.showSelectionToast('表示中', 'loading');
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      selectionHandler.hideSelectionToast();
      expect(document.querySelector('.gemini-translate-selection-toast')).toBeNull();
    });

    it('連続呼び出しで前のトーストが消えてから新しいものが表示されること', () => {
      selectionHandler.showSelectionToast('1つ目', 'loading');
      const firstToast = document.querySelector('.gemini-translate-selection-toast');
      expect(firstToast?.textContent).toBe('1つ目');

      selectionHandler.showSelectionToast('2つ目', 'error');
      const toasts = document.querySelectorAll('.gemini-translate-selection-toast');
      // 前のトーストは除去され、新しいものが1つだけ存在
      expect(toasts.length).toBe(1);
      expect(toasts[0].textContent).toBe('2つ目');
    });

    it('error タイプは自動非表示タイマーが設定されること', () => {
      jest.useFakeTimers();

      selectionHandler.showSelectionToast('エラー', 'error');
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      // 5秒経過前にまだ存在
      jest.advanceTimersByTime(4999);
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      // 5秒経過後に除去される
      jest.advanceTimersByTime(2);
      expect(document.querySelector('.gemini-translate-selection-toast')).toBeNull();

      jest.useRealTimers();
    });

    it('info タイプは自動非表示タイマーが設定されること', () => {
      jest.useFakeTimers();

      selectionHandler.showSelectionToast('情報', 'info');
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      jest.advanceTimersByTime(4999);
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      jest.advanceTimersByTime(2);
      expect(document.querySelector('.gemini-translate-selection-toast')).toBeNull();

      jest.useRealTimers();
    });

    it('loading タイプは自動非表示タイマーが設定されないこと', () => {
      jest.useFakeTimers();

      selectionHandler.showSelectionToast('翻訳中...', 'loading');

      // 5秒経過しても残る
      jest.advanceTimersByTime(5000);
      expect(document.querySelector('.gemini-translate-selection-toast')).not.toBeNull();

      jest.useRealTimers();
    });

    it('hideSelectionToast() はトースト未表示時にエラーを投げないこと', () => {
      expect(() => selectionHandler.hideSelectionToast()).not.toThrow();
    });

    it('トーストのスタイルが ProgressNotification と一貫していること（position, zIndex）', () => {
      selectionHandler.showSelectionToast('テスト', 'loading');

      const toast = document.querySelector('.gemini-translate-selection-toast') as HTMLElement;
      expect(toast).not.toBeNull();
      expect(toast.style.position).toBe('fixed');
      expect(toast.style.bottom).toBe('20px');
      expect(toast.style.right).toBe('20px');
      expect(toast.style.zIndex).toBe('10001');
    });
  });

  describe('翻訳開始/失敗通知の統合（トースト通知）', () => {
    let toastShowSpy: jest.SpyInstance;
    let toastHideSpy: jest.SpyInstance;

    beforeEach(() => {
      toastShowSpy = jest.spyOn(selectionHandler, 'showSelectionToast');
      toastHideSpy = jest.spyOn(selectionHandler, 'hideSelectionToast');
    });

    afterEach(() => {
      selectionHandler.disable();
      toastShowSpy.mockClear();
      toastHideSpy.mockClear();
      jest.useRealTimers();
      document.querySelectorAll('.gemini-translate-selection-toast').forEach(el => el.remove());
    });

    /**
     * Helper: テキスト選択 → mouseup → IconBadge表示 → onClickCallback 取得
     */
    const setupSelectionAndGetOnClick = async (text: string): Promise<Function> => {
      const div = document.createElement('div');
      div.textContent = text;
      document.body.appendChild(div);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      await new Promise(resolve => setTimeout(resolve, 15));

      // Use the last call to avoid interference from leftover event listeners of previous tests
      const lastCallIndex = mockIconBadgeShow.mock.calls.length - 1;
      const onClickCallback = mockIconBadgeShow.mock.calls[lastCallIndex][1];

      // Return cleanup function alongside callback
      return onClickCallback;
    };

    it('バッジクリック→翻訳開始時に showSelectionToast("翻訳中...", "loading") が呼ばれること', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['翻訳結果'] },
      });

      const onClickCallback = await setupSelectionAndGetOnClick('Hello world');
      await onClickCallback();

      expect(toastShowSpy).toHaveBeenCalledWith('翻訳中...', 'loading');

      // Cleanup
      const div = document.querySelector('div');
      if (div?.textContent === 'Hello world') document.body.removeChild(div);
    });

    it('翻訳成功時に hideSelectionToast() が呼ばれること', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: { translations: ['翻訳結果'] },
      });

      const onClickCallback = await setupSelectionAndGetOnClick('Success test');
      await onClickCallback();

      expect(toastHideSpy).toHaveBeenCalled();

      // Cleanup
      const div = document.querySelector('div');
      if (div?.textContent === 'Success test') document.body.removeChild(div);
    });

    it('翻訳失敗（API空レスポンス）時に showSelectionToast(エラーメッセージ, "error") が呼ばれること', async () => {
      mockSend.mockResolvedValue({
        success: true,
        data: { translations: [] },
      });

      const onClickCallback = await setupSelectionAndGetOnClick('Fail test');
      await onClickCallback();

      expect(toastShowSpy).toHaveBeenCalledWith('翻訳に失敗しました', 'error');

      // Cleanup
      const div = document.querySelector('div');
      if (div?.textContent === 'Fail test') document.body.removeChild(div);
    });

    it('翻訳例外発生時に showSelectionToast(例外メッセージ, "error") が呼ばれること', async () => {
      mockSend.mockRejectedValue(new Error('Network error'));

      const onClickCallback = await setupSelectionAndGetOnClick('Exception test');
      await onClickCallback();

      expect(toastShowSpy).toHaveBeenCalledWith('翻訳エラーが発生しました', 'error');

      // Cleanup
      const div = document.querySelector('div');
      if (div?.textContent === 'Exception test') document.body.removeChild(div);
    });
  });

  describe('mouseup競合防止', () => {
    it('バッジ要素上のmouseupではhandleMouseUpの本体処理が実行されないこと', (done) => {
      // バッジ要素を模擬的に作成
      const badgeElement = document.createElement('div');
      badgeElement.className = 'icon-badge';
      document.body.appendChild(badgeElement);

      const div = document.createElement('div');
      div.textContent = 'Selected text near badge';
      document.body.appendChild(div);

      selectionHandler.enable();

      // テキストを選択状態にする
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // バッジ要素をtargetにしたmouseupイベントを発火
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
      });
      Object.defineProperty(mouseUpEvent, 'target', {
        value: badgeElement,
        writable: false,
      });
      document.dispatchEvent(mouseUpEvent);

      // handleMouseUp内のsetTimeout(10ms)後に確認
      setTimeout(() => {
        // バッジ要素上のmouseupではIconBadge.showが呼ばれないこと
        expect(mockIconBadgeShow).not.toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(badgeElement);
        document.body.removeChild(div);
        done();
      }, 30);
    });

    it('バッジの子要素上のmouseupでもhandleMouseUpの本体処理が実行されないこと', (done) => {
      // バッジ要素とその子要素を作成
      const badgeElement = document.createElement('div');
      badgeElement.className = 'icon-badge';
      const childSpan = document.createElement('span');
      childSpan.textContent = 'T';
      badgeElement.appendChild(childSpan);
      document.body.appendChild(badgeElement);

      const div = document.createElement('div');
      div.textContent = 'Selected text near badge child';
      document.body.appendChild(div);

      selectionHandler.enable();

      // テキストを選択状態にする
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // バッジの子要素をtargetにしたmouseupイベントを発火
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
      });
      Object.defineProperty(mouseUpEvent, 'target', {
        value: childSpan,
        writable: false,
      });
      document.dispatchEvent(mouseUpEvent);

      // handleMouseUp内のsetTimeout(10ms)後に確認
      setTimeout(() => {
        // バッジ子要素上のmouseupではIconBadge.showが呼ばれないこと
        expect(mockIconBadgeShow).not.toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(badgeElement);
        document.body.removeChild(div);
        done();
      }, 30);
    });

    it('通常のテキスト選択後のmouseupは正常に処理されること', (done) => {
      const div = document.createElement('div');
      div.textContent = 'Normal text selection';
      document.body.appendChild(div);

      selectionHandler.enable();

      // テキストを選択状態にする
      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // 通常要素上でmouseupイベントを発火
      const mouseUpEvent = new MouseEvent('mouseup', {
        bubbles: true,
        clientX: 100,
        clientY: 200,
      });
      document.dispatchEvent(mouseUpEvent);

      // handleMouseUp内のsetTimeout(10ms)後に確認
      setTimeout(() => {
        // 通常のテキスト選択ではIconBadge.showが呼ばれること
        expect(mockIconBadgeShow).toHaveBeenCalled();

        // Cleanup
        document.body.removeChild(div);
        done();
      }, 30);
    });
  });

  describe('画像選択時のフィードバック', () => {
    let toastSpy: jest.SpyInstance;

    beforeEach(() => {
      toastSpy = jest.spyOn(selectionHandler, 'showSelectionToast');
    });

    afterEach(() => {
      toastSpy.mockRestore();
      document.querySelectorAll('.gemini-translate-selection-toast').forEach(el => el.remove());
    });

    it('画像のみ選択時に showSelectionToast が info タイプで呼ばれること', (done) => {
      // img要素を含むdivを作成し、選択状態にする
      const container = document.createElement('div');
      const img = document.createElement('img');
      img.src = 'https://example.com/image.png';
      img.alt = 'test image';
      container.appendChild(img);
      document.body.appendChild(container);

      selectionHandler.enable();

      // imgを含む範囲を選択（selection.toString() は空文字を返す）
      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      setTimeout(() => {
        expect(toastSpy).toHaveBeenCalledWith(
          expect.stringContaining('画像'),
          'info'
        );
        // IconBadgeは表示されないこと
        expect(mockIconBadgeShow).not.toHaveBeenCalled();

        document.body.removeChild(container);
        done();
      }, 30);
    });

    it('テキスト+画像の混在選択時は info トーストが表示されないこと（通常フロー）', (done) => {
      // テキスト + img要素を含むコンテナ
      const container = document.createElement('div');
      const textNode = document.createTextNode('Some text content ');
      container.appendChild(textNode);
      const img = document.createElement('img');
      img.src = 'https://example.com/image.png';
      container.appendChild(img);
      document.body.appendChild(container);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(container);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      setTimeout(() => {
        // 混在選択では selection.toString() がテキスト部分を返すため info トーストは出ない
        expect(toastSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('画像'),
          'info'
        );
        // 代わりにIconBadgeが表示されること（通常フロー）
        expect(mockIconBadgeShow).toHaveBeenCalled();

        document.body.removeChild(container);
        done();
      }, 30);
    });

    it('テキストのみ選択時は info トーストが表示されないこと', (done) => {
      const div = document.createElement('div');
      div.textContent = 'Text only selection';
      document.body.appendChild(div);

      selectionHandler.enable();

      const range = document.createRange();
      range.selectNodeContents(div);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      setTimeout(() => {
        expect(toastSpy).not.toHaveBeenCalledWith(
          expect.any(String),
          'info'
        );
        // IconBadgeが表示されること（通常フロー）
        expect(mockIconBadgeShow).toHaveBeenCalled();

        document.body.removeChild(div);
        done();
      }, 30);
    });

    it('選択なし時は info トーストが表示されないこと', (done) => {
      selectionHandler.enable();

      // 選択なしの状態でmouseup
      window.getSelection()?.removeAllRanges();
      const mouseUpEvent = new MouseEvent('mouseup', { bubbles: true });
      document.dispatchEvent(mouseUpEvent);

      setTimeout(() => {
        expect(toastSpy).not.toHaveBeenCalledWith(
          expect.any(String),
          'info'
        );
        expect(mockIconBadgeShow).not.toHaveBeenCalled();

        done();
      }, 30);
    });
  });
});
