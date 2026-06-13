# Process 3: iframe翻訳対応(all_frames)

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-03.md` を起動した際の自己完結ブリーフ。
- **背景**: manifest両方（v2/v3）のcontent_scriptsにall_frames未設定（デフォルトfalse）のため、iframe内コンテンツにcontent scriptが注入されず構造的に翻訳対象外。「部分的にしか翻訳されない」のサイト依存要因
- **目的**: iframe内テキストも翻訳可能にする
- **変更範囲**: public/manifest.v2.json（content_scripts L41-47）, public/manifest.v3.json（content_scripts L31-36）
- **参照する定数**: なし（設定キー追加のみ）
- **禁止事項**: manifestはall_frames:true追加のみ（matches/run_at/permissions不変）/ dist-*配下を直接編集しない（public/が原本、webpackのcopy-webpack-pluginがdistへ複製）
- **出力順序**: 1)実装 2)セルフレビュー 3)修正 4)再レビュー 5)ドキュメント更新確認 6)品質ゲート実行

## Overview
両manifestのcontent_scripts[0]に`"all_frames": true`を追加する。

## Affected Files
- public/manifest.v2.json: L41-47のcontent_scripts[0]ブロックに"all_frames": true追加
- public/manifest.v3.json: L31-36のcontent_scripts[0]ブロックに"all_frames": true追加

## Symbol Targets
- file: public/manifest.v2.json
  symbols:
    - name: content_scripts
      kind: module-level
      body_start_line: 41
      body_end_line: 47
- file: public/manifest.v3.json
  symbols:
    - name: content_scripts
      kind: module-level
      body_start_line: 31
      body_end_line: 36
  patch_only: true
  disjoint_guarantee: true
  pre_flight_checks:
    - git_clean

# Notes:
# - disjoint_guarantee:true — manifest JSONのみ、他Process非接触（PLAN.md Conflict Matrix参照）

## Implementation Notes
- JSONのキー追加のみ。run_atは追加しない（Why: 手動トリガー主体のためdocument_idle維持で効果薄と判断、Scope外）
- 広告iframe等への注入増はリスク登録済み（PLAN.md Risks）: 翻訳は手動トリガー主体でAPI自動消費はない。問題発生時はmatches絞り込みを後続検討

## Behavior Specification
対象外: 設定値変更のみ（behavior_scope: false）。検証はJSON validity + `npm run lint:ext` 通過 + 手動検証で代替。

## Red Phase: テスト作成と失敗確認
対象外: 自動テストなし（manifest設定はjestの対象外。lint:extと手動検証が代替）

## Green Phase: 最小実装と成功確認
- [ ] ブリーフィング確認
- [ ] 両manifestにall_frames:true追加
- [ ] `npm run build:firefox && npm run lint:ext` が通過することを確認

✅ **Phase Complete**

## Refactor Phase: 品質改善
- [ ] JSON整形の一貫性確認（既存のインデントスタイル維持）
- [ ] `npm run build:chrome` も成功することを確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. `npm run build:firefox` → about:debugging でロード → iframeを含むページ（例: W3SchoolsのTryitエディタ）でAlt+W → iframe内のテキストも翻訳されることを確認
2. dist-firefox/manifest.jsonにall_frames:trueが複製されていることを確認（webpackビルド経由の反映確認）
3. 広告iframeの多いニュースサイトで翻訳 → 体感速度・メモリに顕著な劣化がないこと

---
## Dependencies
- Requires: -
- Blocks: -
