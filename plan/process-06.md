# Process 6: Closure fix + dirty tracking (useSettings.ts)

## Overview
saveSettings の useCallback([settings]) による closure stale 参照を useRef パターンで修正。同時に dirtyKeys による変更追跡で部分更新を実現する。Phase 7-8 の絶対前提。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/options/hooks/useSettings.ts` | L6 (imports) | `useRef` import 追加 |
| `src/options/hooks/useSettings.ts` | L68-76 (updateSettings) | dirtyKeys 更新ロジック追加 |
| `src/options/hooks/useSettings.ts` | L81-120 (saveSettings) | `settingsRef.current` 参照 + partial update |
| `src/options/hooks/useSettings.ts` | L128-171 (testConnection) | `settingsRef.current` 参照に変更 |
| `src/options/hooks/useSettings.ts` | 新規追加 | settingsRef, dirtyKeysRef, isDirty |
| `tests/unit/options/hooks/useSettings.test.ts` | 新規追加 | closure検証テスト + partial update テスト |

## Implementation Notes

### Step 1: useRef 远れの追加
```typescript
import { useRef } from 'react';

// フック内に追加:
const settingsRef = useRef<SettingsState>({});
const dirtyKeysRef = useRef<Set<keyof SettingsState>>(new Set());
```

### Step 2: settingsRef 同期
```typescript
useEffect(() => {
  settingsRef.current = settings;
}, [settings]);
```

### Step 3: updateSettings に dirtyKeys 追加
```typescript
const updateSettings = useCallback(
  <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    dirtyKeysRef.current = new Set(dirtyKeysRef.current).add(key);
  },
  []
);
```

### Step 4: saveSettings の closure fix
```typescript
// Why: useRef for settings — useCallback([settings]) captures stale state when
// saveSettings is called during or after async updates
const saveSettings = useCallback(async () => {
  try {
    setSaving(true);
    const currentSettings = settingsRef.current;
    const currentDirty = dirtyKeysRef.current;

    if (currentDirty.size > 0) {
      // Partial update: save only changed keys
      const partialData: Partial<StorageData> = {};
      for (const key of currentDirty) {
        if (currentSettings[key] !== undefined) {
          partialData[key] = currentSettings[key];
        }
      }
      await storageManager.set(partialData);
      dirtyKeysRef.current = new Set(); // reset dirty
    } else {
      await storageManager.set(currentSettings);
    }

    // RELOAD_CONFIG + verification (既存ロジック維持)
    try {
      await MessageBus.send({ type: MessageType.RELOAD_CONFIG, action: 'reloadConfig', payload: {} });
    } catch {}
    setError(null);
  } catch (err) {
    setError('Failed to save settings');
  } finally {
    setSaving(false);
  }
}, []); // deps空 — ref 経由で最新値参照
```

### Step 5: testConnection の closure fix
```typescript
const testConnection = useCallback(async (): Promise<TestConnectionResult> => {
  const currentSettings = settingsRef.current;
  // ... 既存ロジックで settings → currentSettings に置換
}, []); // deps空
```

### Step 6: isDirty 公開
```typescript
return {
  settings,
  loading,
  saving,
  testing,
  error,
  isDirty: dirtyKeysRef.current.size > 0,
  updateSettings,
  saveSettings,
  testConnection,
};
```

### UseSettingsReturn interface 更新
```typescript
export interface UseSettingsReturn {
  // ... existing fields
  isDirty: boolean;
}
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - 連続updateSettings後にsaveSettingsで最新値が保存されること
  - dirtyKeysがある場合、変更フィールドのみ保存されること
  - saveSettings後にdirtyKeysがリセットされること
  - isDirtyが正しく反映されること
  - testConnectionが最新のsettingsを参照すること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] useSettings.ts に useRef + settingsRef + dirtyKeysRef 追加
- [ ] saveSettings を ref pattern に変更 + partial update 実装
- [ ] testConnection を ref pattern に変更
- [ ] isDirty を return に追加
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] UseSettingsReturn interface の更新（isDirty 追加）
- [ ] App.test.tsx の mock に isDirty: false 追加
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -
- Blocks: Process 7, Process 8
