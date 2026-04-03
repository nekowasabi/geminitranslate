# Process 5: P1: 画像選択時のフィードバック改善

## Overview
画像のみ選択時に `selection.toString()` が空文字を返しバッジが表示されない問題に対し、ユーザーフィードバックを追加する。画像翻訳機能はスコープ外とし、情報提示のみに留める。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/selectionHandler.ts` | L186-210 (handleMouseUp内) | 画像検出ロジック追加 + infoトースト表示 |
| `tests/unit/content/selectionHandler.test.ts` | 新規追加 | 画像選択フィードバックテスト |

## Implementation Notes

### 画像検出ロジック
`handleMouseUp` 内で `selectedText` がnullの場合に、選択範囲内に画像が含まれるかチェック:

```typescript
// handleMouseUp 内、selectedText が falsy の場合
if (!selectedText) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.cloneContents();
    const hasImages = container.querySelectorAll('img').length > 0;
    if (hasImages) {
      // Why: 画像翻訳は大規模機能（OCR等が必要）でスコープ外。
      // ユーザーが「なぜ反応しないか」を理解できるフィードバックに留める。
      this.showSelectionToast('画像を含む選択ではテキスト部分のみ翻訳できます', 'info');
    }
  }
  return; // 既存のフロー通りバッジは表示しない
}
```

### 考慮事項
- `range.cloneContents()` は選択範囲のDocumentFragmentを返す。パフォーマンスへの影響は軽微（選択範囲は通常小さいため）
- `<img>` 以外の画像表示方法（CSS background-image、SVG、canvas）は検出対象外とする（過剰な検出は避ける）
- テキスト+画像の混在選択の場合、`selection.toString()` はテキスト部分を返すため、このロジックには到達しない（正常動作）

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - 画像のみ選択時にinfoトーストが表示されること
  - テキスト+画像の混在選択時はinfoトーストが表示されないこと（通常フロー）
  - テキストのみ選択時はinfoトーストが表示されないこと
  - 選択なし時はinfoトーストが表示されないこと
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] handleMouseUp 内に画像検出ロジック追加
- [ ] `showSelectionToast()` で情報トースト表示
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] 画像検出を別メソッドに抽出を検討
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 2（トースト通知メソッド）
- Blocks: -
