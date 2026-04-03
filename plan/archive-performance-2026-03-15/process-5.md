# Process 5: P2 isElementVisible() 最適化 (contentScript.ts)

## Overview
isElementVisible() が MutationObserver コールバック内で呼ばれ、全祖先に対して getComputedStyle() を実行する。display:none チェックを先頭に配置して早期リターンし、フルトラバースを削減する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/contentScript.ts` | L875-898 | isElementVisible() を最適化（早期リターン追加） |

## Implementation Notes

### 変更前（現状）
```typescript
private isElementVisible(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    const style = window.getComputedStyle(current); // 毎要素でコスト大
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
}
```

### 変更後
```typescript
private isElementVisible(element: Element): boolean {
  // Fast path 1: hidden 属性チェック（低コスト）
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;

  // Fast path 2: 対象要素自身の display:none を先に確認
  // Why: getComputedStyle を1回だけ呼び、display:none なら即リターン
  const selfStyle = window.getComputedStyle(element);
  if (selfStyle.display === 'none' || selfStyle.visibility === 'hidden') return false;

  // 祖先トラバース（必要な場合のみ）
  let current: Element | null = element.parentElement;
  while (current) {
    // hidden 属性の簡易チェックを先行
    if (current.hasAttribute('hidden') || current.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
}
```

---

## Red Phase: テスト作成と失敗確認

- [x] テスト追加:
  - display:none の要素 → false
  - hidden 属性の祖先 → false
  - aria-hidden の祖先 → false
  - 通常の可視要素 → true
- [x] テスト実行で確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [x] isElementVisible() を書き換え
- [x] `npm test -- contentScript` で成功確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [x] `npx tsc --noEmit` 通過

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立）
- Blocks: Process 10
