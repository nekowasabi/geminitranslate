# Process 8: UX safety net (visibilitychange + pagehide + open_in_tab)

## Overview
debounce 未完了の変更を保護するための多層防御。Firefox MV2 subdialog では beforeunload が発火しないため、visibilitychange + pagehide に切り替え。さらに manifest.v2.json に open_in_tab: true を追加して subdialog を完全排除。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/options/hooks/useSettings.ts` | 新規追加 | visibilitychange + pagehide リスナー |
| `public/manifest.v2.json` | L70-73 (options_ui) | `open_in_tab: true` 追加 |
| `tests/unit/options/hooks/useSettings.test.ts` | 新規追加 | イベントリスナーテスト |

## Implementation Notes

### visibilitychange リスナー
```typescript
// Why: visibilitychange instead of beforeunload — Firefox subdialog では
// beforeunload が発火しない可能性がある。visibilitychange は Page Lifecycle API の一部。
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && dirtyKeysRef.current.size > 0) {
      // Flush pending changes immediately
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      saveSettingsInternal();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [saveSettingsInternal]);
```

### pagehide リスナー
```typescript
// Why: pagehide fires on page unload (including subdialog close).
// Synchronous write attempt as last resort — no preventDefault support.
useEffect(() => {
  const handlePageHide = () => {
    if (dirtyKeysRef.current.size > 0) {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      saveSettingsInternal();
    }
  };
  document.addEventListener('pagehide', handlePageHide);
  return () => document.removeEventListener('pagehide', handlePageHide);
}, [saveSettingsInternal]);
```

### manifest.v2.json 変更
```json
"options_ui": {
  "page": "options.html",
  "browser_style": false,
  "open_in_tab": true
}
```
// Why: open_in_tab: true — Chrome MV3 と同じフルタブ動作に統一。
// Firefox subdialog の beforeunload 不確実性を完全に排除。

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成
  - visibilitychange(hidden) 発火時に dirty な設定が保存されること
  - visibilitychange(visible) 発火時は保存されないこと
  - pagehide 発火時に dirty な設定が保存されること
  - dirty なしの場合は保存されないこと
  - unmount 時にリスナーが除去されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] useSettings.ts に visibilitychange リスナー追加
- [ ] useSettings.ts に pagehide リスナー追加
- [ ] manifest.v2.json に open_in_tab: true 追加
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] beforeunload は追加しない（Firefox subdialog で非信頼のため）
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 6 (closure fix), Process 7 (debounce auto-save)
- Blocks: -
