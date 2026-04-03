---
title: "選択翻訳ボタン UXフィードバック改善（Pattern B）"
status: done
created: "2026-03-15"
---

# Commander's Intent

## Purpose
テキスト選択後の翻訳ボタン（IconBadge）クリック時、翻訳処理中および失敗時の UX フィードバックが欠如している。クリック後にバッジが静止したまま（処理中か失敗か不明）という問題を解消する。

## End State
クリック直後にバッジがローディング状態を表示し、エラー時はトースト通知でユーザーにメッセージが表示される状態で CI 全グリーンであること。

## Key Tasks
- Process 1（P0、先行）: `iconBadge.ts` に `setLoading()` + `showInlineError()` を追加
- Process 2（P1、Process 1 依存）: `selectionHandler.ts` クリックコールバックに状態連携を追加
- Process 10（テスト、Process 1+2 依存）: `iconBadge.test.ts` に新メソッドのテストケースを追加

## Constraints
- `FloatingUI` を `selectionHandler.ts` に新規インポートしない（既存アーキテクチャ維持）
- TDD ファースト（RED → GREEN → REFACTOR）
- 既存テスト（771 PASS）を壊さない
- `try-finally` で `setLoading(false)` を確実に実行（解除漏れ防止）

---

# Progress Map

| Process | Title | Status | File |
|---------|-------|--------|------|
| 1 | P0: iconBadge.ts に setLoading() + showInlineError() 追加 | ☑ done | [→ plan/process-1.md](plan/process-1.md) |
| 2 | P1: selectionHandler.ts クリックコールバックに状態連携追加 | ☑ done | [→ plan/process-2.md](plan/process-2.md) |
| 10 | テスト: iconBadge.test.ts カバレッジ更新 | ☑ done | [→ plan/process-10.md](plan/process-10.md) |

**Overall**: ☑ 3/3 completed

---

# References

| @ref | @target | @test |
|------|---------|-------|
| `src/content/iconBadge.ts` | L188-198 (handleClick) / 新規 setLoading (L198付近) / 新規 showInlineError | `tests/unit/content/iconBadge.test.ts` |
| `src/content/selectionHandler.ts` | L207-246 (クリックコールバック) / L239-241 (失敗時) / L243-246 (catch節) | - |
| `src/content/floatingUI.ts` | L61-82 (showError 実装参考・Position 型) | - |

---

# Risks

| リスク | 対策 |
|--------|------|
| setLoading(false) 解除漏れ（成功・失敗両パス） | try-finally ブロックで確実に解除 |
| エラートーストが翻訳結果パネルと重なる | z-index を floatingResultElement より低いレイヤーに設定 |
| 既存クリックテストとの干渉 | iconBadge.test.ts 既存11テストを非破壊で拡張 |
