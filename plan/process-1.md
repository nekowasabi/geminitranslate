# Process 1: P0 キャッシュ書き込みバルク化 + fire-and-forget (translationEngine.ts)

## Overview
setCachedTranslation() がループ内で毎回 await browser.storage.local.set() を呼び、N件のキャッシュ書き込みが直列実行される。memory cache は同期更新し、storage 書き込みは1回のバルク set() で fire-and-forget に変更する。これにより Phase 2 開始遅延を解消する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L351 | translateBatchSemiParallel 内の `await setCachedTranslation()` ループ → `setBulkCachedTranslations()` 呼び出し |
| `src/background/translationEngine.ts` | L503 | translateBatch 内の `await setCachedTranslation()` ループ → 同上 |
| `src/background/translationEngine.ts` | 新規 | `setBulkCachedTranslations(pairs[])` メソッド追加 |

## Implementation Notes

### 変更前（現状）
```typescript
// translationEngine.ts:347-356 — N回のawait、各回がIPC往復
for (let i = 0; i < uncachedIndices.length; i++) {
  const originalIndex = uncachedIndices[i];
  results[originalIndex] = translatedTexts[i];
  await this.setCachedTranslation(texts[originalIndex], targetLanguage, translatedTexts[i]);
}
```

### 変更後（目標）
```typescript
// memory cache 即時更新 + storage バルク fire-and-forget
const pairs = uncachedIndices.map((originalIndex, i) => ({
  text: texts[originalIndex], targetLanguage, translation: translatedTexts[i],
}));
for (let i = 0; i < uncachedIndices.length; i++) {
  results[uncachedIndices[i]] = translatedTexts[i];
}
// Why: fire-and-forget — cache write must not block Phase 2 start
this.setBulkCachedTranslations(pairs);
```

### 新規メソッド
```typescript
private setBulkCachedTranslations(
  pairs: Array<{ text: string; targetLanguage: string; translation: string }>
): void {
  const bulkData: Record<string, string> = {};
  for (const { text, targetLanguage, translation } of pairs) {
    const cacheKey = this.getCacheKey(text, targetLanguage);
    this.memoryCache.set(cacheKey, translation); // 同期、即時
    bulkData[cacheKey] = JSON.stringify({ text, translation });
  }
  // Why: 1回のset()でまとめて書き込み、awaitしない — IPC往復をN回→1回に削減
  browser.storage.local.set(bulkData).catch((error) => {
    logger.warn('Bulk storage write failed:', error);
  });
}
```

---

## Red Phase: テスト作成と失敗確認

- [x] `tests/unit/background/translationEngine.test.ts` に以下を追加:
  - `setBulkCachedTranslations` が `browser.storage.local.set` を **1回だけ** 呼ぶこと
  - memory cache が即時更新されること（同期確認）
  - storage 書き込み失敗が上位に伝播しないこと
- [x] テスト実行で失敗を確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] `setBulkCachedTranslations()` メソッドを追加
- [x] translateBatchSemiParallel (L347-356) のループを置き換え
- [x] translateBatch (L497-508) のループを置き換え
- [x] `npm test -- translationEngine` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] Why コメント追加
- [x] `npx tsc --noEmit` 通過
- [x] `npm run lint` クリーン

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立）
- Blocks: Process 10（回帰テスト）
