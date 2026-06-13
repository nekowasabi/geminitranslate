# Process 11: 統合テスト: Phase遷移耐性

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-11.md` を起動した際の自己完結ブリーフ。
- **背景**: 「Phase 1のタイムアウト/拒否でPhase 2が未実行になる」という部分翻訳の最有力メカニズムをProcess 02で修正するが、Phase遷移の耐性を固定するテストがないと再退行する
- **目的**: Phase 1失敗時のPhase 2継続・プログレス完了を自動テストで固定
- **変更範囲**: tests/unit/content/contentScript.test.ts（既存拡張）のみ。プロダクションコードに触らない
- **参照する定数**: TRANSLATION_MESSAGE_TIMEOUT_MS（テスト内ではAPI_CONFIG参照で書く）
- **禁止事項**: プロダクションコード変更禁止 / handleBatchCompleted関連のテスト変更禁止（Scope外）/ 数値リテラル直書きしない
- **出力順序**: 1)実装（テスト追加） 2)セルフレビュー 3)修正 4)再レビュー 5)品質ゲート実行

## Overview
contentScript.test.tsにPhase遷移耐性シナリオを追加: messageBus.sendモックをPhase 1で reject/timeout させ、Phase 2のsend実行・completePhase(1)・全体complete到達を検証。

## Affected Files
- tests/unit/content/contentScript.test.ts: 新規describe追加（messageBus/progressNotificationのモックは既存パターンに従う）

## Symbol Targets
- file: tests/unit/content/contentScript.test.ts
  symbols:
    - name: 新規describe（phase-transition-resilience）
      kind: module-level
  patch_only: true
  disjoint_guarantee: n/a
  pre_flight_checks:
    - "Process 02が完了済みであること"

# Notes:
# - test-only。jsdom環境。jest 30 + ts-jest、ESM。既存importスタイルに従う

## Implementation Notes
- messageBus.sendのモックを呼び出し順で制御: 1回目（Phase 1）reject、2回目（Phase 2）resolve
- assert対象: (1) Phase 2のsendが呼ばれる (2) completePhase(1)が呼ばれる (3) 例外がテスト外へ漏れない (4) sendの第2引数がTRANSLATION_MESSAGE_TIMEOUT_MS（API_CONFIG経由参照）

## Behavior Specification
System Type: reactive（Process 02のstate_transitions表を検証する。正本はprocess-02側）

| 現状態 | イベント | ガード | 次状態 | 事後条件（テストでassert） |
|---|---|---|---|---|
| Phase1送信中 | send reject | — | Phase2へ継続 | Phase 2 send呼び出し、completePhase(1) |
| Phase1送信中 | sendタイムアウト相当のreject | — | Phase2へ継続 | 同上+例外漏れなし |
| Phase2送信中 | send resolve | — | 完了 | completePhase(2)、プログレス完了 |

### Correctness Criteria
- 上記3遷移のテストがgreen、既存contentScriptテストに退行なし

### Left to Implementation
- モック構築・describe命名

## Frontend Constraints（risk_flags: frontend）
- AbortController: 対象外（テストのみ）
- cleanup必須対象: jest.restoreAllMocks/fake timers解除をafterEachで実施
- stateリセット条件: 各テストでContentScriptインスタンスを新規生成（phaseNodes残留による相互汚染防止）
- エラー時の表示: progressNotificationモックでcompletePhase呼び出しを検証

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] Phase遷移耐性テストを追加（Process 02未完了時点では失敗＝Red）

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] Process 02完了後にテスト実行 → 全green確認

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] モックヘルパーの整理
- [ ] `npm test` 全体green確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
対象外: process-02のManual Verificationでカバー（Slow 3G・大規模ページ）

---
## Dependencies
- Requires: Process 02
- Blocks: Process 100
