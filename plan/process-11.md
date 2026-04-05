# Process 11: 回帰テスト確認

## Overview
全Process の実装後、既存テスト + 新規テストの全パスを確認し、regression がないことを検証。

## Affected Files
| ファイル | 変更内容 |
|---------|---------|
| 全テストファイル | 実行のみ（変更なし） |

## Implementation Notes

### 自動テスト
```bash
npm run lint
npm test
```

### 手動テストシナリオ
1. **通常設定変更+自動保存**: 范囲変更 → 300ms → 自動保存 → 再表示時復元済み
2. **Save Settings即時保存**: 変更 → Save ボタン → 即時保存 → debounce cancel
3. **debounce中のタブ閉じ**: 変更 → 300ms経過前にタブ閉じ → visibilitychange/pagehide で保存
4. **Firefox MV2 full-tab**: manifest open_in_tab:true → フルタブで表示 → beforeunload 不要
5. **Chrome MV3 full-tab**: 通常動作確認
6. **migration 1回のみ**: lineHeight > 2.0 設定 → get() → migration 実行 → 再 get() → migration skip

---

## Red Phase: テスト作成と失敗確認

N/A（回帰テストのみ）

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] `npm run lint` 全パス
- [ ] `npm test` 全パス
- [ ] 手動テストシナリオ 1-6 全確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

N/A

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 6, 7, 8, 9（全Process完了後）
- Blocks: Process 301
