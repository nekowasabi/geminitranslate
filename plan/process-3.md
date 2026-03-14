# Process 3: P1 二重リトライ統合 (apiClient.ts + translationEngine.ts + retry.ts)

## Overview
`apiClient.ts`（4試行）× `translationEngine.ts`（4試行）= 最大16 HTTP呼び出しを引き起こす二重リトライを解消する。既存の `src/shared/utils/retry.ts`（import元ゼロ）を唯一のリトライ実装として採用し、重複コードを削除する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/apiClient.ts` | L221-344 | forループリトライを削除、`retry<string[]>(...)` に置き換え |
| `src/background/translationEngine.ts` | L827-867 | `executeTranslationWithRetry()` をリトライなし版に簡素化 |
| `src/shared/utils/retry.ts` | L98-129 | 変更なし（利用拡大のみ） |

## Implementation Notes

### 変更前（現状の問題）
```typescript
// apiClient.ts:221 — 内側リトライ（4試行）
for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
  try { return await this.fetchAndParse(texts, targetLanguage); }
  catch (error) { /* retry */ }
}

// translationEngine.ts:833 — 外側リトライ（4試行）
// 合計: 4 × 4 = 最大16 HTTP呼び出し
for (let attempt = 0; attempt <= RETRY_CONFIG.MAX_RETRIES; attempt++) {
  try { return await operation(); }  // operation() = apiClient.translate()
  catch (error) { /* retry */ }
}
```

### 変更後（目標）
```typescript
// apiClient.ts — retry.ts を唯一のリトライ実装として使用
// Why: manual retry loop → retry() utility
//      double retry stacks multiply to 16 HTTP calls max;
//      single retry layer at apiClient is sufficient.
import { retry } from '../shared/utils/retry';

async translate(texts: string[], targetLanguage: string): Promise<string[]> {
  return await retry(
    () => this.fetchAndParse(texts, targetLanguage),
    {
      maxRetries: RETRY_CONFIG.MAX_RETRIES,
      delay: RETRY_CONFIG.INITIAL_DELAY,
      backoff: 'exponential',
      onError: (error, attempt) => logger.warn(`[API] Retry ${attempt}:`, error),
    }
  );
}

// translationEngine.ts — リトライを除去した単純呼び出し
private async executeTranslation(operation: () => Promise<string[]>): Promise<string[]> {
  return await operation();  // リトライはapiClient側で行う
}
```

### retry.ts のシグネチャ確認
```typescript
// src/shared/utils/retry.ts:98
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions  // maxRetries, delay, backoff, onError
): Promise<T>
// 注意: maxRetries は 0-indexed。attempt <= maxRetries で maxRetries+1 回実行
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `docs/requirements/zero-base-redesign-report.md` BUG-002 セクション
- [ ] `tests/unit/background/apiClient.test.ts` に以下のテストケースを追加:
  - APIが失敗した場合、最大 `MAX_RETRIES+1` 回のみ呼び出されること（現在は最大16回）
  - `retry.ts` の `retry()` が使用されること（spy）
- [ ] `tests/unit/background/translationEngine.test.ts` に以下を追加:
  - `executeTranslationWithRetry` が外側リトライを行わないこと
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `apiClient.ts` の `for(attempt...)` リトライループを `retry()` 呼び出しに置き換え
- [ ] `retry.ts` を import（`import { retry } from '@shared/utils/retry'` または相対パス）
- [ ] `translationEngine.ts` の `executeTranslationWithRetry()` からリトライループを除去
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `RETRY_CONFIG` の定義箇所を確認し、3箇所の同期状態を確認
- [ ] `executeTranslationWithRetry` のメソッド名を `executeTranslation` にリネーム（リトライなしになったため）
- [ ] Whyコメントを追加
- [ ] `npm run lint` がクリーンであることを確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1（translationEngine.ts を変更するため、Storage修正後に実施推奨）
- Blocks: Process 4（同一ファイル translationEngine.ts に依存）
