# Process 2: P1 selectionHandler.ts クリックコールバックに状態連携追加

## Overview
`selectionHandler.ts` の IconBadge クリックコールバック（L207-246）に `setLoading(true/false)` と `showInlineError()` の呼び出しを追加する。Process 1 で追加した新メソッドを利用する。`FloatingUI` の新規インポートは不要。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/selectionHandler.ts` | L207（コールバック冒頭） | `this.iconBadge.setLoading(true)` を追加 |
| `src/content/selectionHandler.ts` | L221（translateSelection 後） | try-finally で `setLoading(false)` を確実に実行 |
| `src/content/selectionHandler.ts` | L239-241（失敗時 else 節） | `iconBadge.hide()` → `iconBadge.showInlineError('翻訳に失敗しました')` に変更 |
| `src/content/selectionHandler.ts` | L243-246（catch 節） | `iconBadge.hide()` → `iconBadge.showInlineError('翻訳エラーが発生しました')` に変更 |

## Implementation Notes

### 変更前（現状: L207-246）
```typescript
this.iconBadge.show(position, async () => {
  try {
    const targetLanguage = await this.storageManager.getTargetLanguage();
    if (!targetLanguage) {
      this.iconBadge.hide();  // 言語未設定
      return;
    }
    const translatedText = await this.translateSelection(targetLanguage, selectedText);
    if (translatedText && selectedText) {
      await this.iconBadge.showTranslationResult(...);
    } else {
      this.iconBadge.hide();  // ← 失敗時: ユーザー通知なし
    }
  } catch (error) {
    logger.error('Failed to handle IconBadge click:', error);
    this.iconBadge.hide();  // ← エラー時: ユーザー通知なし
  }
});
```

### 変更後（目標）
```typescript
this.iconBadge.show(position, async () => {
  this.iconBadge.setLoading(true);  // ← 追加: クリック直後にローディング表示
  try {
    const targetLanguage = await this.storageManager.getTargetLanguage();
    if (!targetLanguage) {
      this.iconBadge.hide();
      return;
    }
    const translatedText = await this.translateSelection(targetLanguage, selectedText);
    if (translatedText && selectedText) {
      await this.iconBadge.showTranslationResult(...);
    } else {
      // Why: hide()のみだとユーザーが翻訳失敗に気付けない
      this.iconBadge.showInlineError('翻訳に失敗しました');
    }
  } catch (error) {
    logger.error('Failed to handle IconBadge click:', error);
    // Why: hide()のみだとエラー原因が不明のまま消える
    this.iconBadge.showInlineError('翻訳エラーが発生しました');
  } finally {
    // Why: 成功・失敗問わず必ずローディングを解除する
    this.iconBadge.setLoading(false);
  }
});
```

### 注意事項
- `setLoading(false)` は `finally` で呼ぶことで、成功・失敗・例外のすべてのパスで確実に解除
- `showTranslationResult()` は async なので await を維持すること
- `showInlineError()` 呼び出し後に `hide()` は不要（バッジ自体はそのまま残す）

---

## Red Phase: テスト作成と失敗確認

- [ ] `tests/unit/content/contentScript.test.ts` または `selectionHandler` 関連テストに以下を追加:
  - 翻訳成功時に `setLoading(true)` → `setLoading(false)` の順で呼ばれること
  - 翻訳失敗時（null返却）に `showInlineError()` が呼ばれること
  - 翻訳例外時に `showInlineError()` が呼ばれること
- [ ] `npm test` を実行して失敗を確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] `src/content/selectionHandler.ts` L207 コールバック冒頭に `setLoading(true)` を追加
- [ ] L239-241 の `iconBadge.hide()` を `showInlineError('翻訳に失敗しました')` に変更
- [ ] L243-246 の `iconBadge.hide()` を `showInlineError('翻訳エラーが発生しました')` に変更
- [ ] `finally` ブロックを追加して `setLoading(false)` を呼ぶ
- [ ] `npm test` を実行して成功を確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] Why コメントが適切に付与されているか確認
- [ ] `npx tsc --noEmit` 通過
- [ ] `npm run lint` クリーン
- [ ] 全テスト（`npm test`）が通ることを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1（iconBadge.ts の setLoading/showInlineError が必要）
- Blocks: Process 10（テスト追加）
