# Process 10: 修正後の回帰テスト確認

## Overview
Process 1-6の全修正完了後、既存テストが破壊されていないことを確認し、各バグ修正のテストケースが適切に追加・更新されていることを検証する。

## Affected Files

| テストファイル | 確認内容 |
|--------------|---------|
| `tests/unit/background/translationEngine.test.ts` | BUG-001: browser.storage.local モック / BUG-003: 深度制限テスト / BUG-002: リトライ回数検証 |
| `tests/unit/background/apiClient.test.ts` | BUG-002: retry.ts統合後のリトライ回数（最大4回）|
| `tests/unit/content/contentScript.test.ts` | BUG-004: Phase分離後の正しいノード参照 |
| `tests/unit/shared/retry.test.ts` | 既存テスト回帰確認 |
| `tests/unit/background/messageHandler.test.ts` | BUG-005: console.log → logger変更後の動作確認 |
| `tests/unit/shared/logger.test.ts` | production環境でのlog抑制確認 |
| `tests/integration/translation-flow.test.ts` | フロー全体の回帰確認 |

## Implementation Notes

### テスト実行コマンド
```bash
# 全テスト実行
npm test

# 個別ファイル実行
npm test -- translationEngine
npm test -- apiClient
npm test -- contentScript

# カバレッジ確認
npm run test:coverage
```

### browser.storage.local モック設定（Process 1対応）
```typescript
// tests/__mocks__/browser.ts に追加が必要な場合
const mockStorage = new Map<string, unknown>();
browser.storage.local.get = jest.fn((keys) => {
  // keysが文字列の場合の実装
  return Promise.resolve({ [keys as string]: mockStorage.get(keys as string) });
});
browser.storage.local.set = jest.fn((items) => {
  Object.entries(items).forEach(([k, v]) => mockStorage.set(k, v));
  return Promise.resolve();
});
```

### retry.ts統合後のAPIリトライ検証（Process 3対応）
```typescript
// apiClient.test.ts に追加
it('should retry at most MAX_RETRIES+1 times (not 16 times)', async () => {
  const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
  // fetchが何回呼ばれたかを確認
  await expect(client.translate(['text'], 'Japanese')).rejects.toThrow();
  expect(mockFetch).toHaveBeenCalledTimes(RETRY_CONFIG.MAX_RETRIES + 1);  // 4回以内
  expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);  // 16回でないこと
});
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `PLAN.md` の Progress Map でProcess 1-6が全て ✅ であることを確認
- [ ] `npm test` を実行してベースラインを確認
- [ ] 各Processで追加されたテストケースが存在することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `npm test` を実行して全テストがグリーンであることを確認
- [ ] `npm run lint` でlintエラーがないことを確認
- [ ] カバレッジが許容範囲内であることを確認（既存カバレッジ以上を維持）
- [ ] Firefox MV2の動作に影響がないことを手動確認（`FIREFOX_REGRESSION.md` 参照）

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `npm run build:chrome` と `npm run build:firefox` が両方成功することを確認
- [ ] `PLAN.md` の Progress Map を全て ✅ に更新
- [ ] `docs/requirements/zero-base-redesign-report.md` に「実装済み」の注記を追加（任意）

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1, 2, 3, 4, 5, 6 全て完了後
- Blocks: -（最終確認フェーズ）
