# Process 8: P3 TTL + Eviction 戦略設計 (translationEngine.ts + config.ts)

## Overview
CACHE_CONFIG.TTL = 3,600,000ms（1時間）が config.ts で定義されているが、CacheEntry に createdAt がなく TTL チェックも行われていない。またストレージのサイズ上限（Chrome 10MB）に対する eviction 戦略もない。設計が必要。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L647付近 | CacheEntry に `createdAt: number` フィールド追加 |
| `src/background/translationEngine.ts` | getFromStorage() | TTL チェック追加（`Date.now() - entry.createdAt > TTL`） |
| `src/background/translationEngine.ts` | 新規 | 定期クリーンアップメソッド追加 |
| `src/shared/constants/config.ts` | L73 | CACHE_CONFIG に MAX_STORAGE_SIZE 追加 |

## Implementation Notes

### 設計要件（実装前に検討すべき項目）

1. **CacheEntry スキーマ変更**: `{ text, translation }` → `{ text, translation, createdAt }`
   - 既存エントリとの後方互換: createdAt がないエントリは有効期限切れ扱いにするか、永久有効にするか

2. **TTL チェックタイミング**: 読み込み時（lazy eviction）vs 定期クリーンアップ（proactive）vs 両方

3. **ストレージサイズ監視**: `browser.storage.local.getBytesInUse()` の呼び出し頻度
   - Chrome: サポート済み
   - Firefox MV2: 未サポート → フォールバック必要

4. **Eviction 優先順位**: LRU（最近未使用）vs FIFO（最古）vs TTL（期限切れのみ）

### 推奨アプローチ
- Lazy eviction（読み込み時に TTL チェック）+ 定期クリーンアップ（5分間隔）
- 既存エントリに createdAt がなければ `Date.now()` をデフォルト設定（マイグレーション不要）
- Chrome のみ getBytesInUse() でサイズ監視、Firefox はエントリ数で代替

---

## Red Phase: テスト作成と失敗確認

- [x] テスト追加: TTL 超過エントリが null を返すこと
- [x] テスト追加: createdAt なしの既存エントリが正常に処理されること
- [x] テスト追加: クリーンアップで期限切れエントリのみ削除されること

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] CacheEntry に createdAt 追加
- [x] getFromStorage() に TTL チェック追加
- [x] 定期クリーンアップメソッド追加
- [x] `npm test -- translationEngine` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1, 2 完了後（キャッシュ構造が安定してから）
- Blocks: -
