# Process 3: P0: 翻訳開始/失敗通知の統合（selectionHandler）

## Overview
Process 2で追加したトースト通知メソッドを、`handleMouseUp` のコールバック内3箇所に統合する。翻訳開始時に「翻訳中...」、失敗時に「翻訳に失敗しました」を表示する。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/selectionHandler.ts` | L207付近（翻訳開始前） | `showSelectionToast('翻訳中...', 'loading')` 追加 |
| `src/content/selectionHandler.ts` | L239-241（翻訳失敗時） | `hideSelectionToast()` + `showSelectionToast('翻訳に失敗しました', 'error')` 追加 |
| `src/content/selectionHandler.ts` | L243-245（例外発生時） | `hideSelectionToast()` + `showSelectionToast('翻訳中にエラーが発生しました', 'error')` 追加 |
| `src/content/selectionHandler.ts` | L229付近（翻訳成功時） | `hideSelectionToast()` 追加（loading トーストを消す） |
| `tests/unit/content/selectionHandler.test.ts` | 新規追加 | 通知統合テスト |

## Implementation Notes

### handleMouseUp コールバック内の変更箇所

```typescript
// L207付近（翻訳開始前）
const onClick = async () => {
  try {
    const targetLanguage = await this.storageManager.getTargetLanguage();
    this.showSelectionToast('翻訳中...', 'loading');  // ★ 追加
    const translatedText = await this.translateSelection(targetLanguage, selectedText);
    
    if (translatedText && selectedText) {
      this.hideSelectionToast();  // ★ 追加（成功時にloadingトーストを消す）
      await this.iconBadge.showTranslationResult(selectedText, translatedText, targetLanguage, position);
    } else {
      this.iconBadge.hide();
      this.showSelectionToast('翻訳に失敗しました', 'error');  // ★ 追加
    }
  } catch (error) {
    logger.error('Failed to handle IconBadge click:', error);
    this.iconBadge.hide();
    this.showSelectionToast('翻訳中にエラーが発生しました', 'error');  // ★ 追加
  }
};
```

### 通知の状態遷移
```
バッジクリック
  → showSelectionToast('翻訳中...', 'loading')   [即時表示]
  → translateSelection() 実行中...
  → 成功: hideSelectionToast() → showTranslationResult()
  → 失敗: iconBadge.hide() → showSelectionToast('翻訳に失敗しました', 'error') [5秒後自動非表示]
  → 例外: iconBadge.hide() → showSelectionToast('翻訳中にエラーが発生しました', 'error') [5秒後自動非表示]
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - バッジクリック後に「翻訳中...」トーストが表示されること
  - 翻訳成功時にloadingトーストが消えること
  - 翻訳失敗時（translateSelection → null）にエラートーストが表示されること
  - 例外発生時にエラートーストが表示されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] handleMouseUp コールバック内の3箇所に通知呼び出しを追加
- [ ] 翻訳成功時のhideSelectionToast() 追加
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] エラーメッセージの定数化を検討
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 2（トースト通知メソッド）
- Blocks: -
