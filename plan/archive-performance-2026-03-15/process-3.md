# Process 3: P3 promoteToHigherTiers() デッドコード削除

## Overview
`promoteToHigherTiers()` は `promoteToMemoryCache()` と全く同じ処理で、どこからも呼ばれていないデッドコード。削除する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L601-603 | `promoteToHigherTiers()` メソッドを削除 |

## Implementation Notes
削除のみ。grep で参照がないことを確認してから実施。

---

## Red Phase: テスト作成と失敗確認
- [x] `grep -r "promoteToHigherTiers" src/` で呼び出し元がないことを確認
- [x] 既存テストが通ることを確認（変更前ベースライン）

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認
- [x] メソッド定義（L601-603）を削除
- [x] `npm test -- translationEngine` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善
- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立）
- Blocks: -
