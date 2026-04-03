# Process 4: P1 retry二重実装の一元化 (apiClient + translationEngine)

## Overview
apiClient.translate() と translationEngine.executeTranslationWithRetry() の両方で retry() が呼ばれ、最大 (3+1)×(3+1)=16 回の API 呼び出しが発生しうる。apiClient 側の retry を除去し engine 層に一元化する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/apiClient.ts` | L224 | `retry()` ラッパーを除去し、直接 fetch を実行 |
| `src/background/translationEngine.ts` | L833 | 変更なし（retry 一元化先として残す） |

## Implementation Notes

### 変更前（apiClient.ts:224）
```typescript
return await retry(
  async () => { /* fetch + parse */ },
  { maxRetries: MAX_RETRIES, shouldRetry: (e) => !(e instanceof ParseCountMismatchError) }
);
```

### 変更後
```typescript
// Why: retry を engine 層に一元化 — 二重 retry による最大16試行を防ぐため
// apiClient は単純な fetch + parse のみ担当
const response = await this.fetchWithTimeout(...);
return this.parseResponse(response, texts.length);
```

### 注意: testConnection() への影響
`testConnection()` と `testConnectionWithConfig()` は apiClient を直接呼ぶ。これらはユーザー操作（ボタンクリック）で1回だけ呼ばれるため retry なしで許容。

---

## Red Phase: テスト作成と失敗確認

- [x] apiClient テストで retry 呼び出しの期待値を更新（retry なしに変更）
- [x] translationEngine テストで retry が engine 層でのみ発生することを確認
- [x] テスト実行で差分確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] apiClient.translate() から retry() ラッパーを除去
- [x] エラーハンドリング（ApiError, TimeoutError のスロー）はそのまま維持
- [x] `npm test` で全テスト成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] Why コメント追加
- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立だが Sprint 2 推奨）
- Blocks: Process 10
