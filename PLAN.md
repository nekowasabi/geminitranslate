---
title: "選択翻訳の無反応バグ修正・通知UI追加"
status: planning
created: "2026-04-03"
---

# Commander's Intent

## Purpose
画像を含むテキスト選択→翻訳ボタンクリック時に無反応になるバグを修正し、翻訳開始/失敗時のユーザーフィードバックを追加する。

## End State
バッジクリック時のmouseup競合が解消され、翻訳失敗時にエラートーストが表示され、MessageBus通信ハング時に30秒でタイムアウトし、画像のみ選択時にフィードバックが表示される状態。CI全グリーン。

## Key Tasks
- Process 1+2+4（P0-P1、並列可）: mouseup競合防止・トースト通知基盤・MessageBusタイムアウト
- Process 3+5（P0-P1、Process 2依存）: 通知統合・画像選択フィードバック
- Process 10（回帰テスト）: 全修正の検証

## Constraints
- Firefox MV2 + Chrome MV3 両対応（browser.runtime.sendMessage互換性）
- TDD ファースト（RED → GREEN → REFACTOR）
- 既存テストを壊さない
- MessageBus.send() のtimeoutはオプショナルパラメータ（後方互換）
- Firefox CSP制約: eval/innerHTML 不可、DOM API使用

---

# Progress Map

| Process | Title | Status | File |
|---------|-------|--------|------|
| 1 | P0: mouseup競合防止（selectionHandler + iconBadge） | ☐ planning | [→ plan/process-01.md](plan/process-01.md) |
| 2 | P0: トースト通知メソッド追加（selectionHandler） | ☐ planning | [→ plan/process-02.md](plan/process-02.md) |
| 3 | P0: 翻訳開始/失敗通知の統合（selectionHandler） | ☐ planning | [→ plan/process-03.md](plan/process-03.md) |
| 4 | P1: MessageBusタイムアウト追加 | ☐ planning | [→ plan/process-04.md](plan/process-04.md) |
| 5 | P1: 画像選択時のフィードバック改善 | ☐ planning | [→ plan/process-05.md](plan/process-05.md) |
| 10 | 回帰テスト確認 | ☐ planning | [→ plan/process-10.md](plan/process-10.md) |
| 300 | OODA振り返り | ☐ planning | [→ plan/process-300.md](plan/process-300.md) |

**Overall**: ☐ 0/7 completed

---

# References

| @ref | @target | @test |
|------|---------|-------|
| `src/content/selectionHandler.ts` | L99-112 (getSelectedText), L120-181 (translateSelection), L186-251 (handleMouseUp) | `tests/unit/content/selectionHandler.test.ts` |
| `src/content/iconBadge.ts` | L31-51 (show), L57-63 (hide), L115-157 (createBadgeElement), L187-198 (handleClick) | `tests/unit/content/iconBadge.test.ts` |
| `src/shared/messages/MessageBus.ts` | L18-25 (send) | `tests/unit/shared/messages/MessageBus.test.ts` |
| `src/content/contentScript.ts` | L127-138 (TRANSLATE_SELECTION), L487-514 (translateSelection) | `tests/unit/content/contentScript.test.ts` |
| `src/content/progressNotification.ts` | L113-142 (show), L265-289 (error) — トーストパターン参照 | - |

---

# Risks

| リスク | 対策 |
|--------|------|
| stopPropagationが他のイベントリスナー（analytics等）を阻害 | バッジ要素のみに限定、document全体には影響させない |
| MessageBusタイムアウトが正常な長時間翻訳を誤中断 | デフォルト30秒。選択翻訳は短文のため十分余裕あり |
| ProgressNotification注入によるSelectionHandler初期化失敗 | オプショナルパラメータ＋loggerフォールバック |
