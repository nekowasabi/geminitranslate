---
title: "設定画面の設定値自動保存機能と設定消失問題の解決"
status: planning
created: "2026-04-04"
---

# Commander's Intent

## Purpose
Firefox拡張機能の設定画面（Options UI）で、ユーザが設定変更後に保存ボタンを押さずに画面を閉じると設定値が消失する問題を解決する。自動保存機構の追加により、ユーザ操作なしに設定が永続化される状態を実現する。

## End State
設定フィールド変更後300msで自動保存され、ブラウザ/ダイアログ閉じてもdebounce未保留中の変更が保存され、React closure stale参照が解消され、全既存テストがグリーンである状態。

## Key Tasks
- Process 6+7: closure fix + debounce自動保存（300ms）による設定消失の根本解決
- Process 8: visibilitychange + pagehide + open_in_tab による多層防御
- Process 9: StorageManager migration副作用分離 + schemaVersion 3→4

## Constraints
- Firefox MV2 + Chrome MV3 両対応
- 既存のSave Settingsボタンは維持（即時保存手段）
- testConnectionはUI stateを直接参照（自動保存と非競合）
- 外部状態管理ライブラリ不導入
- TDD: Red→Green→Refactor

---

# Progress Map

| Process | Title | Status | File |
|---------|-------|--------|------|
| 6 | closure fix + dirty tracking | ☐ planning | [→ plan/process-06.md](plan/process-06.md) |
| 7 | debounce auto-save (300ms) | ☐ planning | [→ plan/process-07.md](plan/process-07.md) |
| 8 | UX safety net (visibilitychange + pagehide + open_in_tab) | ☐ planning | [→ plan/process-08.md](plan/process-08.md) |
| 9 | StorageManager migration分離 + schemaVersion 3→4 | ☐ planning | [→ plan/process-09.md](plan/process-09.md) |
| 11 | 回帰テスト確認 | ☐ planning | [→ plan/process-11.md](plan/process-11.md) |
| 301 | OODA振り返り | ☐ planning | [→ plan/process-301.md](plan/process-301.md) |

**Overall**: ☐ 0/6 completed

---

# References

| @ref | @target | @test |
|------|---------|-------|
| `src/options/hooks/useSettings.ts` | L68-76 (updateSettings), L81-120 (saveSettings), L128-171 (testConnection) | `tests/unit/options/hooks/useSettings.test.ts` |
| `src/options/App.tsx` | L16-25 (useSettings destructuring), L220-237 (Save button) | `tests/unit/options/App.test.tsx` |
| `src/shared/storage/StorageManager.ts` | L28-32 (get migration), L52-59 (set) | `tests/unit/shared/StorageManager.test.ts` |
| `src/shared/types/index.ts` | DEFAULT_STORAGE, StorageData type | - |
| `public/manifest.v2.json` | L70-73 (options_ui) | - |

---

# Risks

| リスク | 対策 |
|--------|------|
| Firefox MV2 subdialogでbeforeunload非発火 | visibilitychange + pagehide + open_in_tab: true で多重防御 |
| React closure stale参照で古い設定を保存 | useRef pattern で常に最新state参照 |
| debounce未完了時にタブ閉じで最終編集消失 | pagehide で secondary flush + visibilitychange で flush |
