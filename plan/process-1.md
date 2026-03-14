# Process 1: P0 sessionStorageバグ修正 (translationEngine.ts)

## Overview
Chrome MV3 Service Workerで動作しないsessionStorage/localStorageを`browser.storage.local`（非同期API）に置き換え、3層キャッシュの2層が無音で失敗していた問題を解消する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L554, 561 | `getFromStorage(sessionStorage/localStorage, ...)` → `browser.storage.local.get()` |
| `src/background/translationEngine.ts` | L609, 631, 632 | `saveToStorage(sessionStorage/localStorage, ...)` → `browser.storage.local.set()` |
| `src/background/translationEngine.ts` | L1014, 1018 | `clearStorageCache(sessionStorage/localStorage)` → `browser.storage.local.remove/clear()` |
| `src/background/translationEngine.ts` | L1033, 1057, 1058, 1066 | Storage関連メソッドを非同期に書き換え |

## Implementation Notes

### 変更前（現状）
```typescript
// translationEngine.ts:554 - Chrome MV3 SWでは動作しない（ReferenceError）
const sessionHit = this.getFromStorage(sessionStorage, cacheKey);
const localHit = this.getFromStorage(localStorage, cacheKey);
```

### 変更後（目標）
```typescript
// browser.storage.local は Chrome MV3 SW で唯一使用可能なストレージ
// Why: sessionStorage/localStorage → browser.storage.local
//      Chrome MV3 Service Worker does not have DOM Storage APIs
const stored = await browser.storage.local.get(cacheKey);
const hit = stored[cacheKey] as CacheEntry | undefined;
```

### 影響範囲の事前確認（必須）
`getCachedTranslation()` が `async` になるため、呼び出しチェーン全体に `await` が必要:
- `getCachedTranslation()` → `async`
- `translateText()` → 既存 or 要確認
- `translateBatch()` → 既存 or 要確認

着手前に呼び出し元を全トレースすること。

### Whyコメント追加箇所
各Storage変更箇所に以下を追記:
```typescript
// Why: sessionStorage/localStorage instead of browser.storage.local
//      Chrome MV3 Service Worker does not have DOM Storage APIs;
//      silent try/catch caused 3-tier cache to degrade to 1-tier with no warning.
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `docs/requirements/zero-base-redesign-report.md` BUG-001 セクション
- [ ] `tests/unit/background/translationEngine.test.ts` に以下のテストケースを追加（実装前）:
  - `sessionStorage`/`localStorage` が呼ばれないこと（spyで確認）
  - `browser.storage.local.get` が呼ばれること
  - `browser.storage.local.set` が呼ばれること
- [ ] テストを実行して失敗することを確認 (`npm test -- translationEngine`)

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `getCachedTranslation()` を `async` に変更し `browser.storage.local.get()` を使用
- [ ] `setCachedTranslation()` を `async` に変更し `browser.storage.local.set()` を使用
- [ ] `clearStorageCache()` を `browser.storage.local.remove()` / `clear()` に変更
- [ ] 呼び出しチェーン全体に `await` を追加
- [ ] Firefox MV2 で動作確認（`browser.storage.local` はFirefox MV2でも動作）
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `getFromStorage()` / `saveToStorage()` メソッドを削除（dead code）
- [ ] `getStorageCacheSize()` を `browser.storage.local.getBytesInUse()` ベースに書き換えまたは削除
- [ ] Whyコメントを全変更箇所に追加
- [ ] `npm run lint` がクリーンであることを確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立して実施可能、Process 2と並列実施可）
- Blocks: Process 3, Process 4（同一ファイル translationEngine.ts に依存）
