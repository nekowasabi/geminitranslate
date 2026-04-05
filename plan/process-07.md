# Process 7: Debounce auto-save (300ms)

## Overview
updateSettings 呼び出し後に 300ms debounce で自動保存を発火。Save Settings ボタンは即時保存（debounce cancel）として維持。Phase 6 の closure fix が前提。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/options/hooks/useSettings.ts` | 新規追加 | autoSaveTimerRef, AUTO_SAVE_DELAY, debounce ロジック |
| `src/options/hooks/useSettings.ts` | updateSettings 内 | debounce auto-save 発火 |
| `src/options/hooks/useSettings.ts` | saveSettings 内 | debounce cancel |
| `src/options/App.tsx` | L16-25 | isDirty 取得、ボタンラベル更新 |
| `tests/unit/options/hooks/useSettings.test.ts` | 新規追加 | debounce テスト |

## Implementation Notes

### auto-save timer 追加
```typescript
const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const AUTO_SAVE_DELAY = 300; // ms
// Why: 300ms instead of 500ms — storage.local write is ~1-2ms, 300ms balances UX and API call frequency
```

### updateSettings 内で debounce 発火
```typescript
const updateSettings = useCallback(
  <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    dirtyKeysRef.current = new Set(dirtyKeysRef.current).add(key);

    // Debounce auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveSettingsInternal();
    }, AUTO_SAVE_DELAY);
  },
  []
);
```

### saveSettingsInternal (内部保存関数)
saveSettings から保存ロジックを抽出し、ref 経由で呼び出し:
```typescript
const saveSettingsInternalRef = useRef<() => Promise<void>>();

useEffect(() => {
  saveSettingsInternalRef.current = async () => {
    // Phase 6 の saveSettings ロジック（ref経由）
  };
});

const saveSettingsInternal = useCallback(() => {
  return saveSettingsInternalRef.current?.();
}, []);
```

### saveSettings (公開API) — debounce cancel
```typescript
const saveSettings = useCallback(async () => {
  // Clear pending auto-save
  if (autoSaveTimerRef.current) {
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = null;
  }
  await saveSettingsInternal();
}, [saveSettingsInternal]);
```

### cleanup on unmount
```typescript
useEffect(() => {
  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, []);
```

### App.tsx isDirty 表示
```typescript
const { settings, loading, saving, testing, error, isDirty, updateSettings, saveSettings, testConnection } = useSettings();

// Save button:
{saving ? 'Saving...' : isDirty ? 'Save Settings *' : 'Save Settings'}
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（jest.useFakeTimers 使用）
  - updateSettings 後 300ms 経過で自動保存されること
  - 連続変更で最後の値のみ保存されること（debounce）
  - saveSettings 手動呼び出しで debounce timer がキャンセルされること
  - StrictMode 二重マウントで timer がクリーンアップされること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] autoSaveTimerRef + saveSettingsInternal 追加
- [ ] updateSettings に debounce 発火追加
- [ ] saveSettings に debounce cancel 追加
- [ ] cleanup useEffect 追加
- [ ] App.tsx に isDirty 表示追加
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] App.test.tsx の mock に isDirty 追加確認
- [ ] auto-save 時はトースト通知しない（UX上ノイズ防止）
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 6 (closure fix + dirtyKeys)
- Blocks: Process 8
