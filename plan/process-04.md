# Process 4: P1: MessageBusタイムアウト追加

## Overview
`MessageBus.send()` がPromise未解決のままハングし、`isTranslating` フラグがデッドロックする問題を修正。`Promise.race` パターンでタイムアウトを実装する。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/shared/messages/MessageBus.ts` | L18-25 (send) | timeoutパラメータ追加 + Promise.race実装 |
| `tests/unit/shared/messages/MessageBus.test.ts` | 新規追加 | タイムアウト動作テスト |

## Implementation Notes

### MessageBus.send() の変更
```typescript
// Why: Promise.race パターンを採用。AbortController は browser.runtime.sendMessage に非対応。
static async send(message: Message, timeout: number = 30000): Promise<any> {
  const sendPromise = browser.runtime.sendMessage(message);
  
  if (timeout <= 0) {
    return sendPromise;  // タイムアウト無効化（後方互換）
  }
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`MessageBus timeout after ${timeout}ms`)), timeout);
  });
  
  return Promise.race([sendPromise, timeoutPromise]);
}
```

### 後方互換性の確保
- `timeout` パラメータはオプショナル（デフォルト30秒）
- 既存の呼び出し箇所は変更不要
- `selectionHandler.ts` の `translateSelection` は既に try/finally で `isTranslating = false` をリセットしているため、タイムアウトエラーもfinallyで正しくリセットされる

### タイムアウト値の根拠
// Why: 30秒を採用。選択翻訳は通常1-3文の短文で1-5秒以内に完了する。
// 30秒はネットワーク遅延やAPI負荷時の余裕を十分に確保しつつ、
// ハング時にユーザーが永遠に待つことを防ぐ。

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - 正常応答がタイムアウト前に返る場合、結果が正しく返ること
  - タイムアウト時間を超えた場合、エラーがthrowされること
  - timeout=0 でタイムアウト無効化されること
  - エラーメッセージにタイムアウト時間が含まれること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `MessageBus.send()` に timeout パラメータ追加
- [ ] Promise.race によるタイムアウト実装
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] タイムアウトのデフォルト値をconfig定数に抽出を検討
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -
- Blocks: -
