# Process 10: 統合テスト: 部分成功+429

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-10.md` を起動した際の自己完結ブリーフ。
- **背景**: BATCH_COMPLETEDストリーミング・部分成功・429バックオフという中核機能に統合テストが存在せず、リファクタリングでの退行を検知できない（実際にe90497fを無検証で通過した実績がある）
- **目的**: Process 01/04/05の挙動をend-to-endシナリオで固定し退行を防ぐ
- **変更範囲**: tests/integration/translation-flow.test.ts（既存拡張）のみ。プロダクションコードに触らない
- **参照する定数**: BATCH_SIZE, CONCURRENCY_LIMIT, MAX_DELAY（テスト内でもBATCH_CONFIG/RETRY_CONFIG参照で書き、数値直書きしない）
- **禁止事項**: プロダクションコードの変更禁止（テストが落ちる場合は実装Processに差し戻す）/ 数値リテラル直書きしない
- **出力順序**: 1)実装（テスト追加） 2)セルフレビュー 3)修正 4)再レビュー 5)品質ゲート実行

## Overview
translation-flow.test.tsに2シナリオを追加: (A)一部バッチが全リトライ失敗しても全件返却され欠損は原文（Process 04の固定）、(B)429→Retry-After待機→成功の完走（Process 05の固定）。

## Affected Files
- tests/integration/translation-flow.test.ts: シナリオ追加（既存のfetchモック・jest fake timersパターンに従う）

## Symbol Targets
- file: tests/integration/translation-flow.test.ts
  symbols:
    - name: 新規describe（partial-success / rate-limit）
      kind: module-level
  patch_only: true
  disjoint_guarantee: n/a
  pre_flight_checks:
    - "Process 01/04/05が完了済みであること"

# Notes:
# - test-only。jest 30 + ts-jest、ESM（--experimental-vm-modules）。既存importスタイルに従う
# - moduleNameMapper: @shared/@background/@content が利用可能

## Implementation Notes
- シナリオA: fetchモックで特定バッチのみ常時失敗させ、translateBatchの戻り値が「全件string・欠損位置は原文・warnログ出力」をassert
- シナリオB: fetchモックで初回429（Retry-Afterヘッダ付き）→2回目200を返し、fake timersで待機時間がRetry-After相当（MAX_DELAYクランプ内）であることと最終的な全件成功をassert
- 既存テスト（L292付近の並列数テスト）を拡張し、同時in-flight数≤CONCURRENCY_LIMITも確認

## Behavior Specification
System Type: transformation（Process 01/04/05のspecを統合シナリオとして検証する。正本は各実装Processの表）

| ケース | 入力 | 出力 | pre_state | post_state | invariants |
|---|---|---|---|---|---|
| 部分失敗 | 複数バッチ中1バッチが全リトライ失敗 | 全件返却 | fetchモック設定済 | 欠損位置===原文、warn出力、空文字なし | 戻り値長===入力長 |
| 429回復 | 初回429(Retry-After付)→2回目200 | 全件翻訳 | fake timers有効 | 待機時間===Retry-After相当（MAX_DELAY内）、リトライ1回で成功 | 同時in-flight≤CONCURRENCY_LIMIT |

### Correctness Criteria
- 上記2シナリオがgreenで、既存テストすべてに退行がない

### Left to Implementation
- モックの構築方法、describe/itの命名

## HTTP Status Coverage
- [ ] 200 — シナリオB後半で検証
- [ ] 429 — シナリオBで検証（Retry-After付き/なし両方が望ましい）
- [ ] 400/401/404/422/503 — 対象外: 単体テスト（process-05）でカバー、統合では代表系のみ

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] シナリオA/Bのテストを追加（Process 01/04/05未完了の時点では失敗することを確認＝Red）

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] Process 01/04/05完了後にテスト実行 → 全green確認（本Process自体の実装はテストのみ）

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] テストの重複排除・ヘルパー抽出
- [ ] `npm test` 全体がgreenであることを確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
対象外: 自動統合テストで十分（手動シナリオは各実装Process側に定義済み）

---
## Dependencies
- Requires: Process 01, 04, 05
- Blocks: Process 100
