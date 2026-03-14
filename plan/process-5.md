# Process 5: P2 console.log統一（全4ファイル）

## Overview
本番ビルドに混入している40箇所以上のunguarded `console.log()` 呼び出しを `logger.ts` 経由に統一する。`logger.ts` の `logger.log()` はisProduction時に抑制されるが、`console.log()` 直接呼び出しはこのガードをバイパスする。

## Affected Files

| ファイル | console.log件数 | 変更内容 |
|---------|----------------|---------|
| `src/content/contentScript.ts` | 36箇所（最多） | `console.log` → `logger.debug`、`console.warn` → `logger.warn` |
| `src/background/apiClient.ts` | 15箇所 | `console.log` → `logger.debug`、`console.error` → `logger.error` |
| `src/background/translationEngine.ts` | 13箇所 | `console.log` → `logger.debug` |
| `src/background/messageHandler.ts` | 10箇所 | `console.log` → `logger.debug`、`console.warn` → `logger.warn` |

**スコープ外**: `commandHandler.ts`（8箇所）、`StorageManager.ts`（8箇所）、`useSettings.ts`（6箇所）等は別タスクで対応。`logger.ts` 自体の `console.log`（内部実装）は変更不要。

## Implementation Notes

### loggerのインポート確認
各ファイルに `logger` が既にインポートされているか確認してから作業すること:
```typescript
import { logger } from '../shared/utils/logger';  // or similar path
```

### ログレベルの対応
| 現状 | 変更後 | 用途 |
|------|--------|------|
| `console.log(...)` | `logger.debug(...)` | 通常のデバッグログ |
| `console.warn(...)` | `logger.warn(...)` | 警告 |
| `console.error(...)` | `logger.error(...)` | エラー |

### Why コメント（ファイル先頭または最初の変更箇所に追加）
```typescript
// Why: console.log() → logger.debug() throughout this file
//      console.log() bypasses logger.ts production suppression gate (isProduction check);
//      logger.debug() is suppressed in production builds automatically.
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `docs/requirements/zero-base-redesign-report.md` BUG-005 セクション
- [ ] `tests/unit/shared/logger.test.ts` に以下を確認（既存テストの確認のみ）:
  - production モードで `logger.debug()` が `console.log` を呼ばないこと
- [ ] ESLint `no-console` ルールを `eslint.config.js` または `.eslintrc` に追加してLintエラーを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `src/content/contentScript.ts` の36箇所を一括変換
- [ ] `src/background/apiClient.ts` の15箇所を変換
- [ ] `src/background/translationEngine.ts` の13箇所を変換
- [ ] `src/background/messageHandler.ts` の10箇所を変換
- [ ] 各ファイルに logger が正しくインポートされていることを確認
- [ ] `npm run lint` でエラーがないことを確認
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] ESLint `no-console` ルールをCIに追加して再発防止
- [ ] Whyコメントを主要ファイルに追加
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1, 2, 3, 4（全修正後に一括適用推奨）
- Blocks: Process 10
