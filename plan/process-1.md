# Process 1: P0 iconBadge.ts に setLoading() + showInlineError() 追加

## Overview
`iconBadge.ts` に翻訳処理中のローディング状態表示（`setLoading`）とエラートースト通知（`showInlineError`）を追加する。`selectionHandler.ts` は既に `iconBadge` への参照を持つため、新メソッドを追加するだけで連携可能。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/iconBadge.ts` | L198 付近（handleClick 直後）に新規追加 | `setLoading(isLoading: boolean): void` |
| `src/content/iconBadge.ts` | L198 付近（setLoading の次）に新規追加 | `showInlineError(message: string): void` |
| `src/content/iconBadge.ts` | L17-25（プロパティ宣言部） | `private errorToastElement: HTMLElement | null = null` を追加 |

## Implementation Notes

### setLoading() 実装方針
```typescript
setLoading(isLoading: boolean): void {
  if (!this.badgeElement) return;
  if (isLoading) {
    // Why: テキスト変更でローディングを示す（外部CSSライブラリ不要）
    this.badgeElement.textContent = '⟳';
    this.badgeElement.style.opacity = '0.7';
    this.badgeElement.style.cursor = 'not-allowed';
    this.badgeElement.style.pointerEvents = 'none';
  } else {
    this.badgeElement.textContent = 'T';
    this.badgeElement.style.opacity = '1';
    this.badgeElement.style.cursor = 'pointer';
    this.badgeElement.style.pointerEvents = 'auto';
  }
}
```

### showInlineError() 実装方針
```typescript
showInlineError(message: string): void {
  // 既存のエラートーストを削除
  this.errorToastElement?.remove();

  const toast = document.createElement('div');
  toast.style.cssText = [
    'position:fixed',
    'bottom:20px',
    'right:20px',
    'background:#d32f2f',
    'color:#fff',
    'padding:8px 16px',
    'border-radius:4px',
    'font-size:14px',
    'z-index:10003',
    'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
  ].join(';');
  toast.textContent = message;
  document.body.appendChild(toast);
  this.errorToastElement = toast;

  // Why: 3秒後に自動消滅させてDOMを汚染しない
  setTimeout(() => {
    toast.remove();
    this.errorToastElement = null;
  }, 3000);
}
```

### 追加プロパティ
```typescript
private errorToastElement: HTMLElement | null = null;
```

---

## Red Phase: テスト作成と失敗確認

- [ ] `tests/unit/content/iconBadge.test.ts` に以下を追加（実装前に失敗確認）:
  - `setLoading(true)` でバッジテキストが `'⟳'` に変わること
  - `setLoading(false)` でバッジテキストが `'T'` に戻ること
  - `setLoading()` をバッジ非表示状態で呼んでも throw しないこと
  - `showInlineError()` でエラートーストがDOMに挿入されること
  - `showInlineError()` から3秒後にトーストが自動消滅すること（`jest.useFakeTimers()` 使用）
- [ ] `npm test -- --testPathPattern=iconBadge` を実行して失敗を確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] `src/content/iconBadge.ts` のプロパティ宣言部に `errorToastElement` を追加
- [ ] `setLoading(isLoading: boolean): void` を `handleClick()` の後に追加
- [ ] `showInlineError(message: string): void` を `setLoading` の後に追加
- [ ] `npm test -- --testPathPattern=iconBadge` を実行して成功を確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] Why コメントが適切に付与されているか確認
- [ ] `npx tsc --noEmit` 通過
- [ ] `npm run lint` クリーン
- [ ] 全テスト（`npm test`）が通ることを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立）
- Blocks: Process 2（selectionHandler 側の連携）, Process 10（テスト追加）
