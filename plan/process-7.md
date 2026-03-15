# Process 7: P2 MutationObserver debounce (contentScript.ts)

## Overview
queueDynamicTranslation() が queueMicrotask() でバッチ化しているが、SPA等の高頻度DOM変更では microtask が毎フレーム発火し API 呼び出しが連発する可能性がある。setTimeout(50ms) による debounce に変更する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/contentScript.ts` | L784-810 | queueDynamicTranslation() の queueMicrotask → setTimeout debounce |

## Implementation Notes

### 変更前（L784-810）
```typescript
private queueDynamicTranslation(nodes: TextNodeInfo[]): void {
  // ... Set への追加
  queueMicrotask(() => {
    // バッチ処理
  });
}
```

### 変更後
```typescript
private dynamicTranslationTimer: ReturnType<typeof setTimeout> | null = null;

private queueDynamicTranslation(nodes: TextNodeInfo[]): void {
  // ... Set への追加
  // Why: setTimeout(50ms) instead of queueMicrotask — debounce for SPA high-frequency mutations
  if (this.dynamicTranslationTimer) clearTimeout(this.dynamicTranslationTimer);
  this.dynamicTranslationTimer = setTimeout(() => {
    this.dynamicTranslationTimer = null;
    // バッチ処理
  }, 50);
}
```

---

## Red Phase: テスト作成と失敗確認

- [x] テスト追加: 50ms以内の複数呼び出しが1回にまとめられること
- [x] テスト追加: 50ms後に実際のバッチ処理が実行されること

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] queueDynamicTranslation() を修正
- [x] `npm test -- contentScript` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立）
- Blocks: Process 10
