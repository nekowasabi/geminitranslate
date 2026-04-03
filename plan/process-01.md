# Process 1: P0: mouseup競合防止（selectionHandler + iconBadge）

## Overview
バッジクリック時にdocumentレベルのmouseupが再発火し、`iconBadge.show()` → `hide()` でバッジが自己破壊される問題を修正。2つの防御層で対処する。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/iconBadge.ts` | L115-157 (createBadgeElement) | mousedown/mouseup に stopPropagation 追加 |
| `src/content/selectionHandler.ts` | L186-190 (handleMouseUp冒頭) | event.target がバッジ要素かチェックし早期リターン |
| `tests/unit/content/selectionHandler.test.ts` | 新規追加 | mouseup競合テスト |
| `tests/unit/content/iconBadge.test.ts` | 新規追加 | stopPropagationテスト |

## Implementation Notes

### 層1: iconBadge.ts — イベント伝搬防止
`createBadgeElement()` 内で作成されるバッジ要素に以下を追加:
```typescript
badge.addEventListener('mousedown', (e) => e.stopPropagation());
badge.addEventListener('mouseup', (e) => e.stopPropagation());
```

### 層2: selectionHandler.ts — event.target ガード
`handleMouseUp` 冒頭に以下を追加:
```typescript
private handleMouseUp(event: MouseEvent): void {
  // Why: stopPropagation単体では将来のUI要素追加時に漏れる可能性あり。二重防御。
  const target = event.target as HTMLElement;
  if (target && target.closest('.icon-badge')) {
    return;
  }
  // ... 既存処理
}
```

### 設計判断
// Why: stopPropagation のみ vs event.target チェックのみ vs 両方 → 両方を採用。
// stopPropagation だけでは他のUI要素で同種の問題が起きうる。
// event.target チェックだけではCSS classに依存し脆い。両方で防御的に。

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - バッジ要素上でのmouseupイベントが `handleMouseUp` の本体処理に到達しないこと
  - バッジのmousedown/mouseupイベントがdocumentまで伝搬しないこと
  - 通常のテキスト選択後のmouseupは正常に処理されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `iconBadge.ts` の `createBadgeElement()` に mousedown/mouseup stopPropagation 追加
- [ ] `selectionHandler.ts` の `handleMouseUp` に event.target ガード追加
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `.icon-badge` クラス名を定数化（IconBadge内で定義、外部参照可能にする）
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -
- Blocks: -
