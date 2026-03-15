# Process 2: P0 キャッシュ読み込みバッチ化 (translationEngine.ts)

## Overview
getCachedTranslation() がループ内で1件ずつ browser.storage.local.get(singleKey) を呼び、N回のIPC往復が発生する。全キーを事前計算し browser.storage.local.get(allKeys) で1回取得するバッチ読み込みに変更する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L213-222 | translateBatchSemiParallel 内のキャッシュチェックループ → `getBulkCachedTranslations()` |
| `src/background/translationEngine.ts` | L437-446 | translateBatch 内のキャッシュチェックループ → 同上 |
| `src/background/translationEngine.ts` | 新規 | `getBulkCachedTranslations(texts[], targetLanguage)` メソッド追加 |

## Implementation Notes

### 変更前（現状）
```typescript
// translationEngine.ts:213-222 — N回のIPC往復
for (let i = 0; i < texts.length; i++) {
  const cached = await this.getCachedTranslation(texts[i], targetLanguage);
  if (cached) { results[i] = cached; this.cacheHits++; }
  else { uncachedIndices.push(i); this.cacheMisses++; }
}
```

### 変更後（目標）
```typescript
// Why: get(keyArray) instead of N individual get() — single IPC round trip
const cachedResults = await this.getBulkCachedTranslations(texts, targetLanguage);
for (let i = 0; i < texts.length; i++) {
  if (cachedResults[i] !== null) {
    results[i] = cachedResults[i]!;
    this.cacheHits++;
  } else {
    uncachedIndices.push(i);
    this.cacheMisses++;
  }
}
```

### 新規メソッド
```typescript
private async getBulkCachedTranslations(
  texts: string[], targetLanguage: string
): Promise<(string | null)[]> {
  const cacheKeys = texts.map(t => this.getCacheKey(t, targetLanguage));
  // Pass 1: memory cache (同期)
  const results: (string | null)[] = cacheKeys.map(
    key => this.memoryCache.get(key) ?? null
  );
  // Pass 2: storage bulk fetch for memory-miss keys
  const missIndices = results.map((r, i) => r === null ? i : -1).filter(i => i >= 0);
  if (missIndices.length > 0) {
    const missKeys = missIndices.map(i => cacheKeys[i]);
    try {
      const storageResult = await browser.storage.local.get(missKeys);
      for (const idx of missIndices) {
        const data = storageResult[cacheKeys[idx]];
        if (data) {
          const entry = JSON.parse(data as string);
          results[idx] = entry.translation;
          this.promoteToMemoryCache(cacheKeys[idx], entry.translation);
        }
      }
    } catch (error) {
      logger.warn('Bulk storage read failed:', error);
    }
  }
  return results;
}
```

---

## Red Phase: テスト作成と失敗確認

- [x] テスト追加:
  - 全件 memory hit → storage.get 呼ばれないこと
  - 全件 miss → storage.get が1回、キー配列で呼ばれること
  - 一部 hit / 一部 miss の混在
  - storage エラー時は null 扱い（graceful degradation）
- [x] テスト実行で失敗を確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] `getBulkCachedTranslations()` メソッドを追加
- [x] translateBatchSemiParallel (L213-222) を置き換え
- [x] translateBatch (L437-446) を置き換え
- [x] `npm test -- translationEngine` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] 2メソッドの重複キャッシュチェックが共通化されたことを確認
- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立、Process 1 と並列可）
- Blocks: Process 10
