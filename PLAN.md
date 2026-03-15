---
title: "翻訳・表示速度改善 実装計画"
status: completed
created: "2026-03-15"
---

# Commander's Intent

## Purpose
Storage I/O のシリアル実行（キャッシュ読み書きが1件ずつ await）により、初回翻訳で約300msの不要な遅延が発生している。Viewport-Priority + Batch Streaming による74%改善（380ms→100ms）は達成済みだが、storage層の最適化でさらに70%の追加改善が可能。

## End State
browser.storage.local のバルク操作により初回翻訳の体感速度が350ms→105ms に改善され、retry が単一層に統合（最大4試行）、DOM操作が最適化された状態で CI 全グリーンであること。

## Key Tasks
- Process 1+2（P0、並列可）: storage読み書きのバルク化で最大効果の即効改善
- Process 4+5（P1-P2、Sprint 2）: retry一元化とDOM操作最適化で安定性向上
- Process 8（P3、要設計）: TTL + eviction でストレージ肥大化を防止

## Constraints
- Firefox MV2 + Chrome MV3 両対応必須（browser.storage.local API のバッチ操作互換性確認）
- TDD ファースト（RED → GREEN → REFACTOR）
- 既存テスト（731 PASS）を壊さない
- fire-and-forget 書き込みの失敗は catch + logger.warn で記録

---

# Progress Map

| Process | Title | Status | File |
|---------|-------|--------|------|
| 1 | P0: キャッシュ書き込みバルク化 + fire-and-forget (translationEngine.ts) | ☑ done | [→ plan/process-1.md](plan/process-1.md) |
| 2 | P0: キャッシュ読み込みバッチ化 (translationEngine.ts) | ☑ done | [→ plan/process-2.md](plan/process-2.md) |
| 3 | P3: promoteToHigherTiers() デッドコード削除 | ☑ done | [→ plan/process-3.md](plan/process-3.md) |
| 4 | P1: retry二重実装の一元化 (apiClient + translationEngine) | ☑ done | [→ plan/process-4.md](plan/process-4.md) |
| 5 | P2: isElementVisible() 最適化 (contentScript.ts) | ☑ done | [→ plan/process-5.md](plan/process-5.md) |
| 6 | P1: キャッシュキー安全化 (translationEngine.ts) | ☑ done | [→ plan/process-6.md](plan/process-6.md) |
| 7 | P2: MutationObserver debounce (contentScript.ts) | ☑ done | [→ plan/process-7.md](plan/process-7.md) |
| 8 | P3: TTL + Eviction 戦略設計 (translationEngine.ts + config.ts) | ☑ done | [→ plan/process-8.md](plan/process-8.md) |
| 10 | 修正後の回帰テスト確認 | ☑ done | [→ plan/process-10.md](plan/process-10.md) |

**Overall**: ☑ 9/9 completed

---

# References

| @ref | @target | @test |
|------|---------|-------|
| `src/background/translationEngine.ts` | L214,351,438,503 (cache I/O) / L320 (Promise.all) / L601 (dead code) / L647 (cacheKey) / L833 (retry) | `tests/unit/background/translationEngine.test.ts` |
| `src/background/apiClient.ts` | L224 (retry) | `tests/unit/background/apiClient.test.ts` |
| `src/content/contentScript.ts` | L784-810 (queueDynamic) / L875-898 (isElementVisible) | `tests/unit/content/contentScript.test.ts` |
| `src/shared/constants/config.ts` | L34 (CONCURRENCY_LIMIT) / L40 (BATCH_SIZE) / L73 (TTL) | - |
| `docs/requirements/performance-improvement-plan.md` | 調査レポート（Sprint 1-3 詳細） | - |

---

# Risks

| リスク | 対策 |
|--------|------|
| fire-and-forget でストレージ書き込み失敗が無音化 | catch + logger.warn で記録。翻訳キャッシュはベストエフォート |
| apiClient retry 削除で testConnection() に影響 | testConnection はユーザー操作なので retry なし許容 |
| browser.storage.local のサイズ上限（Chrome 10MB） | Process 8 で TTL + eviction 戦略を設計 |
