---
title: "geminitranslate レガシーコード修正・ゼロベース再設計実装計画"
status: planning
created: "2026-03-14"
---

# Commander's Intent

## Purpose
Chrome MV3 Service Worker環境でキャッシュが完全無効化（BUG-001）され、毎回APIを呼ぶことでユーザーのAPI利用コストが100%余分に発生している。さらに二重リトライ（最大16回）とバイナリ分割の無制限再帰（最大512回）がAPI quota枯渇リスクを生んでいる。遅延ネットワークでは誤翻訳（BUG-004）も発生する。これらは全て現在進行形の問題であり、放置するほどユーザー被害が拡大する。

## End State
Chrome/Firefox両環境でキャッシュが正常動作し、APIリトライが最大4回・binary-splitが深度1に制限され、本番ログが`logger.ts`経由のみとなった状態でCI（`npm run lint` + 全unitテスト）がグリーンであること。

## Key Tasks
- Process 1+2（P0、並列実施可能）: Chrome MV3キャッシュ無効化とPhase間レースコンディションを解消し、最大のリスクを除去する
- Process 3+4（P1、Process 1完了後）: リトライを単一層に統合し、binary-split深度を1にキャップしてAPI爆発を防ぐ
- Process 5+10（P2、全修正後）: console.logをlogger経由に統一し、回帰テストで安全性を確認してクローズ

## Constraints
- Firefox MV2への影響なし保証: `browser.storage.local` はFirefox MV2でも動作するが、非同期API移行で呼び出しチェーン全体の `await` 追加が必要
- Process 1着手前に `getCachedTranslation()` 呼び出しチェーン全体を確認すること
- `background.ts` / `service.ts` 削除は許可確認後のみ実施
- `retry.ts` のシグネチャ: `retry<T>(fn, options)` — `maxRetries+1` 回実行される点に注意

---

# Progress Map

| Process | Title | Status | File |
|---------|-------|--------|------|
| 1 | P0: sessionStorageバグ修正 (translationEngine.ts) | ☑ done | [→ plan/process-1.md](plan/process-1.md) |
| 2 | P0: レースコンディション修正 (contentScript.ts) | ☑ done | [→ plan/process-2.md](plan/process-2.md) |
| 3 | P1: 二重リトライ統合 (apiClient + translationEngine + retry.ts) | ☑ done | [→ plan/process-3.md](plan/process-3.md) |
| 4 | P1: binary-split深度制限 (translationEngine.ts) | ☑ done | [→ plan/process-4.md](plan/process-4.md) |
| 5 | P2: console.log統一 (全4ファイル) | ☐ planning | [→ plan/process-5.md](plan/process-5.md) |
| 6 | P3: orphanファイル削除 + DRY整理 | ☐ planning | [→ plan/process-6.md](plan/process-6.md) |
| 10 | 修正後の回帰テスト確認 | ☐ planning | [→ plan/process-10.md](plan/process-10.md) |

**Overall**: ☑ 4/7 completed

---

# References

| @ref | @target | @test |
|------|---------|-------|
| `src/background/translationEngine.ts` | L554,561,609,631,632 (Storage) / L753-825 (binary-split) / L827-867 (retry) | `tests/unit/background/translationEngine.test.ts` |
| `src/content/contentScript.ts` | L41,307-309,407-409,650-662 (race condition) | `tests/unit/content/contentScript.test.ts` |
| `src/background/apiClient.ts` | L221 (retry loop) / L224,241,261,275ほか15箇所 (console.log) | `tests/unit/background/apiClient.test.ts` |
| `src/shared/utils/retry.ts` | L98-129 (retry<T> 未使用) | `tests/unit/shared/retry.test.ts` |
| `src/background/messageHandler.ts` | 10箇所 (console.log) | `tests/unit/background/messageHandler.test.ts` |
| `docs/requirements/zero-base-redesign-report.md` | 調査レポート（663行） | - |

---

# Session Log (2026-03-14)

## 実施済み作業

### Process 1 ☑ (TDD完了)
- **変更**: `translationEngine.ts` の `sessionStorage`/`localStorage` 直接参照（9箇所）を `browser.storage.local` に移行
- **async化メソッド**: `getFromStorage()`, `saveToStorage()`, `clearStorageCache()`, `getStorageCacheSize()`, `promoteToHigherTiers()`
- **キャッシュ構造**: 3層（Memory/Session/Local）→ 2層（Memory + browser.storage.local）に統合
- **テスト**: 40 PASS / `tsc --noEmit` PASS
- **Whyコメント**: 全変更箇所に追加済み

### Process 2 ☑ (TDD完了)
- **変更**: `contentScript.ts` の `currentTranslationNodes: TextNode[]`（L41）を `phaseNodes: Map<TranslationPhase, TextNode[]>` に置き換え
- **変更箇所**: L305（Phase1 set）, L403（Phase2 set）, L648-659（handleBatchCompleted 参照）, L558（reset()でclear追加）
- **インポート追加**: `TranslationPhase` from `@shared/messages/types`
- **テスト**: 69 PASS / `tsc --noEmit` PASS

### Process 3 ☑ (TDD完了)
- **retry.ts 拡張**: `RetryOptions` に `shouldRetry?: (error: Error) => boolean` 追加（17 PASS）
- **apiClient.ts**: `for (attempt...)` ループを `retry()` 呼び出しに置き換え。`shouldRetry: (e) => !(e instanceof ParseCountMismatchError)` で除外
- **translationEngine.ts**: `executeTranslationWithRetry()` のリトライループを `retry()` に統合
- **効果**: 最大16回 → 最大4回（`maxRetries+1`）に制限
- **テスト**: 81 PASS / `tsc --noEmit` PASS

### Process 4 ☑ (TDD完了)
- **変更**: `translateByBinarySplit()` シグネチャに `depth: number = 0` 引数追加（L753付近）
- **実装**: `depth >= 1` の場合 `translateIndividually()` へフォールバック（再帰停止）
- **再帰呼び出し**: `depth + 1` を渡すよう変更
- **テスト**: 44 PASS / `tsc --noEmit` PASS
- **Note**: `INDIVIDUAL_FALLBACK_THRESHOLD = 6` のためテストは8件テキストで実施

---

## 次に実施する作業（再開時の手順）

### Process 5（次のステップ）: console.log → logger 統一
**TDD手順:**

**Step 1 RED**: `tests/unit/shared/logger.test.ts` に `logger.debug()` テストを追加 → 失敗確認

**Step 2 GREEN**:
1. `src/shared/utils/logger.ts` に `debug()` メソッドを追加（production では抑制）
2. 以下4ファイルの `console.log/warn/error` を `logger.log/warn/error` に置換:
   - `src/content/contentScript.ts`（約45箇所）
   - `src/background/apiClient.ts`（約19箇所）
   - `src/background/translationEngine.ts`（13箇所: L187, L252, L401, L411, L421, L434, L448, L463, L470, L480, L489, L510, L515）
   - `src/background/messageHandler.ts`（約18箇所）
3. `npm test` で全テスト通過確認

**Step 3 REFACTOR**: `npx tsc --noEmit` 型チェック通過確認

---

### Process 6（要ユーザー確認）: orphanファイル削除
**削除候補**（実行前に必ず確認を取ること）:
- `src/background/background.ts`（14行スタブ、webpack未参照）
- `src/background/service.ts`（16行スタブ、webpack未参照）

**確認後の手順**:
1. 削除実行
2. `npm run build:chrome` と `npm run build:firefox` 両方が成功することを確認

---

### Process 10（最終確認）:
```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```
全グリーンで全完了。

---

# Risks

| リスク | 対策 |
|--------|------|
| Process 1の非同期化で呼び出しチェーン50-100行規模に影響 | 着手前に getCachedTranslation() の全呼び出し元をトレース |
| BUG-004修正で handleBatchCompleted と applyTranslationsAndTrack の二重適用が残存 | Process 2修正時に二重適用の競合も同時解消するか事前決定 |
| Process 3でretry.ts統合後にapiClient.testのmockが崩れる | Process 3とProcess 10を同一PRで実施し、テスト修正を一括で行う |
