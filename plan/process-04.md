# Process 4: 部分成功設計(原文フォールバック)

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-04.md` を起動した際の自己完結ブリーフ。
- **背景**: translationEngine.tsのassertCompleteResults（L739-762）が1件でも欠損があるとthrowしリクエスト全体を失敗扱いにする（fail-fast）。content側はレスポンス失敗時warnのみで救済経路がなく、BATCH_COMPLETED適用分だけが画面に残る=部分翻訳。textFilter.tsのreconstructResults（L180-224）も欠損を空文字で埋めテキスト消失を起こす
- **目的**: 欠損は原文で埋めて全件返却するfail-soft設計へ変更（観測可能性はwarnで維持）
- **変更範囲**: src/background/translationEngine.ts（assertCompleteResults L739-762と呼び出し元L330-334/L494）, src/shared/utils/textFilter.ts（reconstructResults L180-224、空文字埋めはL210-221）
- **参照する定数**: なし
- **禁止事項**: assertCompleteResultsの長さ不一致検査を黙殺化しない（warn+原文ベース正規化で観測可能に）/ handleBatchCompleted/translationsForApplyに触らない / 数値リテラル直書きしない
- **出力順序**: 1)実装 2)セルフレビュー 3)修正 4)再レビュー 5)ドキュメント更新確認 6)品質ゲート実行

## Overview
assertCompleteResultsをthrowから「欠損インデックスを原文で埋めてlogger.warn」へ変更（原文texts配列を引数追加。呼び出し元L330-334/L494は両方ともtextsがスコープ内）。reconstructResultsの空文字埋めも原文フォールバックへ変更。

## Affected Files
- src/background/translationEngine.ts: assertCompleteResults（L739-762）のシグネチャに原文配列追加+throw廃止+warn、呼び出し元2箇所（L330-334, L494）の引数追加
- src/shared/utils/textFilter.ts: reconstructResults（L180-224）の空文字埋め（L210-221）を原文フォールバックへ。シグネチャにoriginalTexts追加またはMap受け（impl_freedom）

## Symbol Targets
- file: src/background/translationEngine.ts
  symbols:
    - name: TranslationEngine.assertCompleteResults
      kind: method
      body_start_line: 739
      body_end_line: 762
    - name: TranslationEngine.translateBatchSemiParallel（callsite）
      kind: method
      line_hint: 330-334
    - name: TranslationEngine.translateBatch（callsite）
      kind: method
      line_hint: 494
- file: src/shared/utils/textFilter.ts
  symbols:
    - name: reconstructResults
      kind: function
      body_start_line: 180
      body_end_line: 224
  patch_only: true
  disjoint_guarantee: false
  pre_flight_checks:
    - git_clean
    - "既存テストで『throwする』ことを期待するテストの有無を確認（期待値反転が必要）"

# Notes:
# - disjoint_guarantee:false — Process 05とtranslationEngine.tsを共有→直列実行（01→04→05）
# - 重要: reconstructResultsはsrc/内に本番呼び出し元ゼロ（テストのみ参照のデッドコード）。本Processでは契約修正のみ行い、利用再開/削除判断はScope外。P4の実効はassertCompleteResults側に集中する

## Implementation Notes
- assertCompleteResultsは関数名が実態と乖離するためensure系へのリネーム可（impl_freedom）。リネーム時は呼び出し元2箇所も追随
- 長さ不一致（results.length !== expectedLength）は契約違反としてwarn必須+原文ベースで全件配列に正規化（黙殺禁止）。undefined要素の埋めと区別して扱う
- Whyコメント: 「Why: fail-fast(throw)を廃止し原文フォールバックに変更 — 1件の欠損で全体が失敗し部分翻訳になるのを防ぐ。欠損はwarnで観測可能性を維持」
- 欠損率が高い場合のTRANSLATION_ERROR通知はimpl_freedom（必須にしない）

## Behavior Specification
System Type: transformation

| ケース | 入力 | 出力 | pre_state | post_state | invariants |
|---|---|---|---|---|---|
| 正常 | results[100]全件string | 検査通過 | 翻訳完了直後 | results不変、warnなし | 戻り値配列は常にlength===expectedLength |
| 異常(欠損) | results[100]中3件undefined | **throwせず**3箇所を原文で上書き | バッチ一部失敗 | results全件string、うち3件は原文、logger.warnに欠損インデックス | 原文フォールバック後undefined 0件 |
| 異常(長さ不一致) | results.length 98≠100 | warn+原文ベースで100件に正規化 | 契約違反 | 呼び出し元へは必ず100件返る | content側applyPhaseTranslationsのindexずれを起こさない |
| reconstructResults | translations欠け | 欠損indexを**原文**で埋めた配列 | — | 空文字0件 | 空文字でノードテキストが消えない |

### Correctness Criteria（観測可能・正誤の基準。固定する）
- translateBatchのモックで一部バッチを全リトライ失敗させ「戻り値が全件string」「欠損位置===原文」「warn出力」をassert
- 既存の「throwする」期待のテストがあれば期待値を反転

### Left to Implementation（実装に任せる細部。仕様で固定しない）
- メソッドリネーム（ensure系）、長さ不一致時の正規化アルゴリズム詳細、warnフォーマット、欠損率閾値通知の有無、reconstructResultsの原文受け渡し方法（引数追加 vs Map）

> api_scope:true だが本Processは結果再構築層のためHTTPステータスは下記のとおりほぼ対象外。

## HTTP Status Coverage
- [ ] 200 — 正常系: 全件返却の検査が通過する
- [ ] 400/401/404/422/429/503 — 対象外: 本ProcessはAPI応答後の結果再構築層であり、HTTPエラーはretry層（既存+Process 05）が担当

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] translationEngine.test.tsに「一部バッチ全失敗でも全件返却・欠損は原文・warn出力」テストを追加、textFilter.test.tsに「欠損index原文埋め・空文字0件」テストを追加
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] ブリーフィング確認
- [ ] assertCompleteResultsのfail-soft化（原文引数追加・throw廃止・warn・呼び出し元2箇所更新）
- [ ] reconstructResultsの原文フォールバック化
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] メソッド名と実態の整合（リネーム検討）、Whyコメント確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. DevToolsでネットワークを一時オフライン→翻訳開始→途中でオンライン復帰 → ページがエラーで停止せず、失敗箇所は原文のまま・プログレスバーが完了に達する → DOM上に空文字化したテキストノードがないことを確認
2. 正常翻訳後にコンソールを確認 → 欠損warnが出ていないこと（誤検知がないこと）

---
## Dependencies
- Requires: Process 01（推奨: 同一テスト群の整合のため先行）
- Blocks: Process 05（translationEngine.ts共有のため直列）, Process 10
