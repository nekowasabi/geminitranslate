# Process 6: P1 キャッシュキー安全化 (translationEngine.ts)

## Overview
getCacheKey() が `translation:${text}:${lang}` の文字列連結でキーを生成しており、テキストにコロンが含まれる場合のキー衝突リスクがある。encodeURIComponent でエンコードして安全化する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L647 | getCacheKey() のテキスト部分を encodeURIComponent でエンコード |

## Implementation Notes

### 変更前
```typescript
private getCacheKey(text: string, targetLanguage: string): string {
  return `translation:${text}:${targetLanguage}`;
}
```

### 変更後
```typescript
private getCacheKey(text: string, targetLanguage: string): string {
  // Why: encodeURIComponent instead of raw text — prevent key collision when text contains ':'
  return `translation:${encodeURIComponent(text)}:${targetLanguage}`;
}
```

### 注意: 既存キャッシュとの互換性
キー形式が変わるため、既存のストレージキャッシュはヒットしなくなる。翻訳キャッシュはベストエフォートなので、キャッシュミスによる再翻訳は許容。

---

## Red Phase: テスト作成と失敗確認

- [x] テスト追加: コロン含むテキストで異なるキーが生成されること
- [x] テスト追加: 日本語テキストでキーが正しくエンコードされること

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] getCacheKey() を修正
- [x] `npm test -- translationEngine` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1, 2 完了後推奨（キャッシュキーが変わるため）
- Blocks: Process 10
