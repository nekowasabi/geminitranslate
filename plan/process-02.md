# Process 2: Phase1例外保護+翻訳タイムアウト延長

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-02.md` を起動した際の自己完結ブリーフ。
- **背景**: contentScript.tsのPhase 1のmessageBus.send（L326-336）にtry-catchがなく、MessageBusのデフォルトタイムアウト（30秒、変更禁止）超過で例外が関数外へ飛びPhase 2（ページ全体翻訳）が未実行になる。これが「部分的にしか翻訳されない」の最有力メカニズム
- **目的**: Phase 1の例外でPhase 2が止まらないfail-soft化と、翻訳リクエスト専用の長いタイムアウトの適用
- **変更範囲**: src/content/contentScript.ts（translatePage L242-505）, src/shared/constants/config.ts（API_CONFIG L10-25にTRANSLATION_MESSAGE_TIMEOUT_MS追加）
- **参照する定数**（数値はPLAN.mdの★Constants表を参照）: TRANSLATION_MESSAGE_TIMEOUT_MS
- **禁止事項**: MessageBus.DEFAULT_TIMEOUT_MS（MessageBus.ts:16）を変更しない（選択/clipboard翻訳が30s前提。延長は呼び出し側第2引数のみ）/ handleBatchCompleted/translationsForApply（L659-748）に触らない
- **出力順序**: 1)実装 2)セルフレビュー 3)修正 4)再レビュー 5)ドキュメント更新確認 6)品質ゲート実行

## Overview
Phase 1のsendをPhase 2と同形式のtry-catch（L412/L455-462と同パターン）で包み、catchでlogger.error+completePhase(1)してPhase 2へ継続。両PhaseのsendにTRANSLATION_MESSAGE_TIMEOUT_MSを第2引数で渡す。

## Affected Files
- src/content/contentScript.ts: L326-336（Phase 1のmessageBus.send、try-catchで包む+timeout第2引数）、L413-423（Phase 2のsend、timeout第2引数のみ追加）
- src/shared/constants/config.ts: API_CONFIG（L10-25）にTRANSLATION_MESSAGE_TIMEOUT_MS追加

## Symbol Targets
- file: src/content/contentScript.ts
  symbols:
    - name: ContentScript.translatePage
      kind: method
      body_start_line: 242
      body_end_line: 505
      line_hint: 326-336（Phase 1 send）, 413-423（Phase 2 send）
- file: src/shared/constants/config.ts
  symbols:
    - name: API_CONFIG
      kind: module-level
      body_start_line: 10
      body_end_line: 25
  patch_only: true
  disjoint_guarantee: true
  pre_flight_checks:
    - git_clean
    - "MessageBus.test.ts:163のデフォルトタイムアウトテストを壊さない（DEFAULT_TIMEOUT_MS自体は変更しないため影響なしのはず）"
    - no_overlapping_wave

# Notes:
# - disjoint_guarantee:true — contentScript.tsは本Processのみが編集。config.tsはAPI_CONFIGブロックのみ追加しBATCH_CONFIG/RETRY_CONFIG（01/05の編集対象）に触れない（regex+目視で確認済み）
# - MessageBus.send()は既に第2引数timeout対応済み（MessageBus.ts:25）→ 呼び出し側変更のみで完結

## Implementation Notes
- Phase 2の既存try-catch（L412開始、catch L455-462）と同じ構造をPhase 1に適用。catch内: logger.error + this.progressNotification.completePhase(1)。**throwしない**（Phase 2へ継続することが本質）
- Whyコメント: 「Why: Phase 1のtimeout/rejectでPhase 2が未実行になる部分翻訳を防ぐ。catchで握りつぶしてPhase 2へ継続する」
- dynamic翻訳のsend（L817）は既存try-catch保護済み（try:754/catch:852）のため対象外
- BATCH_COMPLETED経由の適用はPhase 1失敗時も独立して届くため、catchでの再適用は不要

## Behavior Specification
System Type: reactive

| 現状態 | イベント | ガード | 次状態 | 事後条件 |
|---|---|---|---|---|
| Phase1送信中 | response1成功 | success && translations | Phase1適用→Phase2へ | applyPhaseTranslationsAndTrack(1)実行、completePhase(1) |
| Phase1送信中 | MessageBusタイムアウト（TRANSLATION_MESSAGE_TIMEOUT_MS超過） | — | **Phase2へ継続** | catchでlogger.error+completePhase(1)。throwしない |
| Phase1送信中 | send reject（runtime.lastError等） | — | **Phase2へ継続** | 同上 |
| Phase1送信中 | response1.success===false | — | Phase2へ継続 | 既存挙動（L346のifを素通り）。completePhase(1)必須 |
| Phase2送信中 | timeout/reject | — | 翻訳終了処理 | 既存catch（L455-462）でcompletePhase(2)。タイムアウト値がTRANSLATION_MESSAGE_TIMEOUT_MSになる点のみ変化 |
| 全体 | 外側catch（L485） | Phase1がthrowしなくなり到達経路縮小 | エラー通知 | progressNotification.error表示は維持 |

### Correctness Criteria（観測可能・正誤の基準。固定する）
- messageBus.sendをリジェクトさせるテストで「Phase 2のsendが呼ばれる」「completePhase(1)とcomplete()が呼ばれる」をassert
- 両sendの第2引数がTRANSLATION_MESSAGE_TIMEOUT_MSであることをassert

### Left to Implementation（実装に任せる細部。仕様で固定しない）
- catch内ログ文言、定数のimportスタイル

## Frontend Constraints（risk_flags: frontend）
- AbortController: 不要（MessageBus内部のPromise.raceでタイムアウト処理。fetch中断はbackground側の責務）
- cleanup必須対象: なし（新規タイマー・リスナーを追加しない）
- stateリセット条件: Phase 1失敗時もphaseNodes Map(1)は保持（BATCH_COMPLETED遅延到着分の適用に必要）
- エラー時の表示: progressNotificationはcompletePhase(1)で進行表示を解消し、Phase 2の進行表示に引き継ぐ（フリーズ誤認防止）

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] tests/unit/content/contentScript.test.tsに「Phase 1のsend rejectでもPhase 2のsendが呼ばれる」「completePhase(1)が呼ばれる」「sendの第2引数がTRANSLATION_MESSAGE_TIMEOUT_MS」のテストを追加
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] ブリーフィング確認
- [ ] config.tsのAPI_CONFIGにTRANSLATION_MESSAGE_TIMEOUT_MS追加
- [ ] Phase 1 sendをtry-catchで包む（Whyコメント付き）+両sendにtimeout第2引数
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] コードの品質を改善
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. DevToolsでネットワークをSlow 3G以下に絞り大規模ページをAlt+W翻訳 → Phase 1が長時間化してもPhase 2が開始され、プログレスバーが完了に到達する
2. 通常回線で大規模ページ翻訳 → ビューポート内が先に翻訳され、スクロール先も翻訳済みであること（Phase 2実行の確認）

---
## Dependencies
- Requires: -
- Blocks: Process 11（Phase遷移耐性の統合テスト）
