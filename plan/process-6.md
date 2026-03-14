# Process 6: P3 orphanファイル削除 + DRY整理

## Overview
webpackエントリに参照されない2つのデッドコードファイルを削除し、コードベースの混乱を防ぐ。新規開発者が誤ってorphanファイルを編集するリスクを排除する。

## Affected Files

| ファイル | 行数 | 変更内容 |
|---------|------|---------|
| `src/background/background.ts` | 14行 | 削除（webpack.chrome.cjs 未参照）|
| `src/background/service.ts` | 30行 | 削除（webpack.firefox.cjs 未参照）|
| `src/background/service.chrome.ts` | - | 削除禁止（Chrome正規エントリポイント）|
| `src/background/background.firefox.ts` | - | 削除禁止（Firefox正規エントリポイント）|

## Implementation Notes

### 削除前の必須確認事項
```bash
# 1. Gitで意図的に残されたファイルでないか確認
git log --oneline --follow src/background/background.ts
git log --oneline --follow src/background/service.ts

# 2. webpackエントリに含まれていないことを再確認
grep -r "background.ts" webpack/
grep -r "service.ts" webpack/

# 3. import元がないことを確認
grep -r "from.*background.ts\|from.*service.ts" src/
```

### 削除後に追加するコメント
`service.chrome.ts` と `background.firefox.ts` の先頭に正規エントリポイントであることを明記:
```typescript
/**
 * Chrome (MV3) 正規エントリポイント
 * webpack/webpack.chrome.cjs から参照される。
 * background.ts は未参照のorphanファイルであり、このファイルが実際のエントリ。
 */
```

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] 削除対象ファイルのimport元がゼロであることをGrepで確認
- [ ] webpackエントリに含まれていないことをgrep確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] **ユーザー許可確認**: `CLAUDE.md` の「許可なしのファイル削除禁止」ルールに従い、削除前にユーザー確認を取ること
- [ ] `src/background/background.ts` 削除
- [ ] `src/background/service.ts` 削除
- [ ] `service.chrome.ts` と `background.firefox.ts` に正規エントリポイントコメントを追加
- [ ] `npm run build:chrome` と `npm run build:firefox` がエラーなく完了することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `git status` で想定外のファイル変更がないことを確認
- [ ] `npm run lint` がクリーンであることを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1-5 全て完了後（最後に実施）
- Blocks: -
