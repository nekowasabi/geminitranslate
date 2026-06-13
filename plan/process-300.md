# Process 300: OODAレトロスペクティブ

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-300.md` を起動した際の自己完結ブリーフ。
- **背景**: 本計画はBATCH_SIZE縮小とCONCURRENCY_LIMIT縮小という性能トレードオフ（API呼び出し約5倍増 vs フォールバック連鎖根絶）を含む。実測なしでは再調整判断ができない
- **目的**: 効果計測・教訓の永続化・残課題のIssue化
- **変更範囲**: コード変更なし（計測・記録・Issue起票のみ）
- **参照する定数**: BATCH_SIZE, CONCURRENCY_LIMIT（再調整判断の対象。値はPLAN.md ★Constants参照）
- **禁止事項**: 計測結果に基づかない定数再変更の禁止 / Issue起票なしでのOUT_OF_SCOPE項目の実装着手禁止
- **出力順序**: 1)計測 2)分析 3)知見保存 4)Issue起票 5)レトロ報告

## Overview
修正後の実測（翻訳完了時間・ParseCountMismatchフォールバック発生率・429発生率）を行い、★Constants再調整の要否を判断。教訓を知識ストアへ永続化し、PLAN.mdのOUT_OF_SCOPE項目をIssue化する。

## Affected Files
- なし（計測ログ・知識ストア・GitHub Issueのみ）

## Symbol Targets
- file: なし
  patch_only: true
  disjoint_guarantee: n/a
  pre_flight_checks:
    - "Process 100, 200 が完了済み"

## Implementation Notes
計測項目（Before/After比較。Beforeは本計画着手前のコミットでビルドして測定）:
1. 大規模ページ（テキストノード500+）の翻訳完了時間と最初の訳文表示までの時間
2. コンソールwarnからParseCountMismatch発生率・フォールバック（binary-split/個別）回数
3. 429発生回数と平均待機時間
4. 判断: フォールバック発生率が依然高ければmax_tokens係数を、翻訳が遅すぎればCONCURRENCY_LIMITを再調整（PLAN.md ★Constantsの更新として別途計画）

残課題のIssue化（PLAN.md OUT_OF_SCOPEから）:
- Structured Output移行 / IntersectionObserver化 / textFilter緩和 / MutationObserver自己トリガー対策 / handleBatchCompletedロジック再評価 / reconstructResultsデッドコード解消

## Behavior Specification
対象外: 計測・記録のみでコード変更なし（behavior_scope: false）

## Red/Green/Refactor Phase
対象外: TDD非適用。代わりに上記Implementation Notesの計測→分析→判断を実施:
- [ ] Before/After計測の実施と記録
- [ ] ★Constants再調整要否の判断（根拠付き）
- [ ] OUT_OF_SCOPE項目のGitHub Issue起票

✅ **Phase Complete**

---
## Knowledge Phase: 知見の永続化

- [ ] .serena/memories/ に教訓を保存（mcp__serena__write_memory、ファイル名は lessons-{topic} 形式。既存の geminitranslate-performance-bottlenecks への統合更新を優先）
- [ ] stigmergy/ に教訓・パターンを記録（stigmergy/lessons.jsonl 追記 または stigmergy/patterns/{category}.md）
- [ ] 重要度が高い知見を Memory（CLAUDE.md）に追記
- [ ] `command -v brv` を確認し、利用可能なら byterover に保存（存在しない場合はスキップ、エラーにしない）

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. 計測レポートにBefore/Afterの数値が両方記載され、再調整判断が根拠付きで記録されていることを確認
2. GitHub Issueが残課題分起票され、PLAN.mdのOUT_OF_SCOPE項目と過不足なく対応していることを確認

---
## Dependencies
- Requires: Process 100, 200
- Blocks: -
