# Process 100: 品質ゲート

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-100.md` を起動した際の自己完結ブリーフ。
- **背景**: Process 01-05/10/11の変更が揃った時点で、リポジトリ全体の品質ゲートを通過させリリース可能状態にする
- **目的**: lint・全テスト・両ブラウザビルド・拡張lintの全green
- **変更範囲**: 原則なし（ゲート実行のみ。失敗時は該当Processへ差し戻し）
- **参照する定数**: なし
- **禁止事項**: ゲートを通すためのテスト無効化・skip追加の禁止 / プロダクションコードの場当たり修正禁止（必ず該当Processの責務として修正）
- **出力順序**: 1)ゲート実行 2)失敗分類 3)差し戻し or 軽微修正 4)再実行 5)結果報告

## Overview
品質ゲートコマンド一式を実行し、全成功を確認する。カバレッジ低下（jest.config.js collectCoverage: true）がないことも確認。

## Affected Files
- なし（実行のみ）。失敗時の修正は各実装Processの責務

## Symbol Targets
- file: なし
  patch_only: true
  disjoint_guarantee: n/a
  pre_flight_checks:
    - "Process 01,02,03,04,05,10,11 がすべて完了済み"
    - git_clean

## Implementation Notes
実行コマンド（PLAN.md quality_gate.command と同一）:
1. `npm run lint`（eslint、0 error）
2. `npm test`（jest全green、カバレッジ低下なし）
3. `npm run build:firefox` && `npm run build:chrome`（webpack成功、dist-*へmanifest複製確認）
4. `npm run lint:ext`（web-ext lint、manifest変更の妥当性検証。build:firefox後に実行）

## Behavior Specification
対象外: 検証実行のみでコード変更なし（behavior_scope: false）

## Red/Green/Refactor Phase
対象外: TDDサイクル非適用（ゲート実行Process）。代わりに以下を実施:
- [ ] 全ゲートコマンドを順に実行
- [ ] 失敗があれば該当Process（実装/テスト）を特定して差し戻し記録
- [ ] 全green到達を確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. `npm run build:firefox` 後の dist-firefox/ に background.js / content.js / manifest.json（all_frames:true入り）が揃っていることを確認
2. about:debugging でロードし、PLAN.mdのManual一式（大規模ページ/iframe/429完走/オフライン復帰）をスモーク実行

---
## Dependencies
- Requires: Process 01, 02, 03, 04, 05, 10, 11
- Blocks: Process 200, 300
