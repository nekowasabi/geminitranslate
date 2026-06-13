# Process 200: ドキュメント更新

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-200.md` を起動した際の自己完結ブリーフ。
- **背景**: CLAUDE.mdにBATCH_SIZE/CONCURRENCY_LIMITの旧値が記載されており、実装とドキュメントの乖離が今回の問題発見を遅らせた（ドキュメントはBATCH_SIZE=10前提で書かれていたが実装は100だった）
- **目的**: ドキュメント記載値を★Constantsの新値と一致させ、新挙動（429協調・部分成功）を記録する
- **変更範囲**: CLAUDE.md, CHANGELOG.md
- **参照する定数**: BATCH_SIZE, CONCURRENCY_LIMIT（値はPLAN.md ★Constants参照。ドキュメントには新値を転記するが、本processファイルには数値を書かない）
- **禁止事項**: コード変更禁止 / CLAUDE.mdの構成・他セクションの「ついで修正」禁止（surgical changes）
- **出力順序**: 1)更新 2)実コードとの整合確認（grep） 3)レビュー

## Overview
CLAUDE.mdの数値記載3箇所を新値へ更新し、Key Componentsに429協調・部分成功の挙動を1行追記。CHANGELOG.mdに修正5本のエントリを追加。

## Affected Files
- CLAUDE.md: L47付近「CONCURRENCY_LIMIT: 10」、L60付近「BATCH_SIZE = 10」、L31付近「First 1 batch (10 texts)」を★Constantsの新値へ。Key Componentsセクションに「Rate-Limit Cooperation」「Partial-Success Fallback」を各1行追記
- CHANGELOG.md: バージョンエントリ（3.0.9想定）に修正5本（max_tokens明示・Phase遷移fail-soft・all_frames・部分成功・429協調）を記載

## Symbol Targets
- file: CLAUDE.md
  symbols:
    - name: Translation Flow / Key Components セクション
      kind: module-level
      line_hint: 31, 47, 60付近
- file: CHANGELOG.md
  symbols:
    - name: 新バージョンエントリ
      kind: module-level
  patch_only: true
  disjoint_guarantee: n/a
  pre_flight_checks:
    - "Process 01, 05 が完了済み（数値の最終確定後）"

# Notes:
# - doc-only。grep で「10 texts」「BATCH_SIZE」「CONCURRENCY」をCLAUDE.md内検索し、取りこぼしゼロを確認すること

## Behavior Specification
対象外: ドキュメント更新のみ（behavior_scope: false）

## Red/Green/Refactor Phase
対象外: TDD非適用（doc-only）。代わりに以下を実施:
- [ ] CLAUDE.mdの数値記載をgrepで全件特定し更新
- [ ] CHANGELOG.mdエントリ追加
- [ ] 更新後、実コード（config.ts）との整合をgrepで確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. `grep -n "BATCH_SIZE\|CONCURRENCY\|10 texts" CLAUDE.md` → 全ヒットが新値・新記述と一致することを確認

---
## Dependencies
- Requires: Process 01, 05（数値確定後）
- Blocks: Process 300
