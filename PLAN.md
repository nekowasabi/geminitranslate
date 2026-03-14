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
| 1 | P0: sessionStorageバグ修正 (translationEngine.ts) | ☐ planning | [→ plan/process-1.md](plan/process-1.md) |
| 2 | P0: レースコンディション修正 (contentScript.ts) | ☐ planning | [→ plan/process-2.md](plan/process-2.md) |
| 3 | P1: 二重リトライ統合 (apiClient + translationEngine + retry.ts) | ☐ planning | [→ plan/process-3.md](plan/process-3.md) |
| 4 | P1: binary-split深度制限 (translationEngine.ts) | ☐ planning | [→ plan/process-4.md](plan/process-4.md) |
| 5 | P2: console.log統一 (全4ファイル) | ☐ planning | [→ plan/process-5.md](plan/process-5.md) |
| 6 | P3: orphanファイル削除 + DRY整理 | ☐ planning | [→ plan/process-6.md](plan/process-6.md) |
| 10 | 修正後の回帰テスト確認 | ☐ planning | [→ plan/process-10.md](plan/process-10.md) |

**Overall**: ☐ 0/7 completed

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

# Risks

| リスク | 対策 |
|--------|------|
| Process 1の非同期化で呼び出しチェーン50-100行規模に影響 | 着手前に getCachedTranslation() の全呼び出し元をトレース |
| BUG-004修正で handleBatchCompleted と applyTranslationsAndTrack の二重適用が残存 | Process 2修正時に二重適用の競合も同時解消するか事前決定 |
| Process 3でretry.ts統合後にapiClient.testのmockが崩れる | Process 3とProcess 10を同一PRで実施し、テスト修正を一括で行う |
