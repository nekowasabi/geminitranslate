# Process 9: StorageManager migration分離 + schemaVersion 3→4

## Overview
StorageManager.get() 内の lineHeight migration 副作用を分離し、get() を純粋な読み取り操作にする。schemaVersion を 3→4 に bump して migration の再実行を制御。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/shared/storage/StorageManager.ts` | L28-32 (get内migration) | migrateData メソッドに分離 |
| `src/shared/storage/StorageManager.ts` | 新規追加 | private migrateData() メソッド |
| `src/shared/types/index.ts` | DEFAULT_STORAGE | schemaVersion: 3→4 |
| `tests/unit/shared/StorageManager.test.ts` | 新規追加 | migration テスト |

## Implementation Notes

### migrateData メソッド抽出
```typescript
// Why: 分離 — get() 内の副作用は auto-save 導入時に競合の危険がある。
// 読み取り操作に書き込み副作用があると推論が困難。
private async migrateData(data: Partial<StorageData>): Promise<Partial<StorageData>> {
 {
  const migrated = { ...data };

  // Only run lineHeight migration if schema version < 4
  const currentVersion = migrated.schemaVersion ?? 0;
  if (currentVersion < 4 && migrated.lineHeight && migrated.lineHeight > 2.0) {
    migrated.lineHeight = 1.5;
    migrated.schemaVersion = 4;
    await this.set({ lineHeight: 1.5, schemaVersion: 4 });
  }

  return migrated;
}
```

### get() 内の migration 呼び出し変更
```typescript
async get<K extends StorageKeys>(keys?: K[]): Promise<StorageData> {
  try {
    const rawData = keys
      ? await BrowserAdapter.storage.get<Partial<StorageData>>(keys)
      : await BrowserAdapter.storage.get<Partial<StorageData>>([]);

    const data = await this.migrateData(rawData); // ← 分離
    const result = { ...DEFAULT_STORAGE, ...data };
    return result;
  } catch (error) { ... }
}
```

### DEFAULT_STORAGE schemaVersion 更新
```typescript
// src/shared/types/index.ts
export const DEFAULT_STORAGE: StorageData = {
  // ... existing
  schemaVersion: 4,  // 3 → 4
  // ... rest unchanged
};
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成
  - lineHeight > 2.0 + schemaVersion < 4 の場合に migration が実行されること
  - lineHeight > 2.0 + schemaVersion >= 4 の場合に migration がスキップされること
  - lineHeight <= 2.0 の場合に変更されないこと
  - migration 後 schemaVersion が 4 に更新されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] StorageManager.ts に migrateData メソッド追加
- [ ] get() 内の migration を migrateData 呼び出しに変更
- [ ] types/index.ts の schemaVersion を 4 に変更
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] migration が一度だけ実行されることを確認（schemaVersion ガード）
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -
- Blocks: -
