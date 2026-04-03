# Process 10: テスト: iconBadge.test.ts カバレッジ更新

## Overview
Process 1 で追加した `setLoading()` と `showInlineError()` の新メソッドに対するテストケースを `tests/unit/content/iconBadge.test.ts` に追加する。既存の11テストケースを破壊せず、新しい `describe` ブロックとして追加する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `tests/unit/content/iconBadge.test.ts` | L236 以降（末尾に追加） | `describe('setLoading()')` ブロック追加（3ケース） |
| `tests/unit/content/iconBadge.test.ts` | setLoading ブロックの後 | `describe('showInlineError()')` ブロック追加（2ケース） |

## Implementation Notes

### setLoading() テストケース
```typescript
describe('setLoading()', () => {
  it('should show loading state when setLoading(true) is called', () => {
    const badge = new IconBadge(mockStorageManager);
    badge.show({ x: 100, y: 100 }, jest.fn());
    badge.setLoading(true);
    // バッジテキストが '⟳' に変わること
    const badgeEl = document.querySelector('.icon-badge') as HTMLElement;
    expect(badgeEl.textContent).toBe('⟳');
    expect(badgeEl.style.pointerEvents).toBe('none');
  });

  it('should restore normal state when setLoading(false) is called', () => {
    const badge = new IconBadge(mockStorageManager);
    badge.show({ x: 100, y: 100 }, jest.fn());
    badge.setLoading(true);
    badge.setLoading(false);
    const badgeEl = document.querySelector('.icon-badge') as HTMLElement;
    expect(badgeEl.textContent).toBe('T');
    expect(badgeEl.style.pointerEvents).toBe('auto');
  });

  it('should not throw when called before show()', () => {
    const badge = new IconBadge(mockStorageManager);
    // バッジ未表示状態でも例外を投げないこと
    expect(() => badge.setLoading(true)).not.toThrow();
    expect(() => badge.setLoading(false)).not.toThrow();
  });
});
```

### showInlineError() テストケース
```typescript
describe('showInlineError()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should insert error toast into DOM', () => {
    const badge = new IconBadge(mockStorageManager);
    badge.showInlineError('翻訳エラーが発生しました');
    // エラートーストがDOMに存在すること
    const toasts = document.querySelectorAll('[style*="background:#d32f2f"]');
    expect(toasts.length).toBeGreaterThan(0);
    expect(toasts[0].textContent).toBe('翻訳エラーが発生しました');
  });

  it('should auto-remove error toast after 3 seconds', () => {
    const badge = new IconBadge(mockStorageManager);
    badge.showInlineError('翻訳エラーが発生しました');
    expect(document.querySelectorAll('[style*="background:#d32f2f"]').length).toBe(1);
    jest.advanceTimersByTime(3000);
    // 3秒後に自動消滅すること
    expect(document.querySelectorAll('[style*="background:#d32f2f"]').length).toBe(0);
  });
});
```

### 注意事項
- `jest.useFakeTimers()` と `jest.useRealTimers()` を `beforeEach/afterEach` で対にすること
- DOM クエリは `document.querySelector('.icon-badge')` で取得（既存テストと同じパターン）
- テスト後は `document.body.innerHTML = ''` でDOMをクリーンアップすること（他テストとの干渉防止）

---

## Red Phase: テスト作成と失敗確認

- [ ] 上記テストケースを `tests/unit/content/iconBadge.test.ts` の末尾に追加
- [ ] `npm test -- --testPathPattern=iconBadge` を実行
- [ ] `setLoading` / `showInlineError` が未実装のため失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] Process 1 が完了していることを確認（`setLoading` / `showInlineError` 実装済み）
- [ ] `npm test -- --testPathPattern=iconBadge` を実行して成功を確認
- [ ] 既存テスト（11件）が引き続き成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] テストコードの重複がないか確認
- [ ] `npm test` 全件（771+新規）が通ることを確認
- [ ] カバレッジレポートで `iconBadge.ts` の新メソッドがカバーされていることを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1（setLoading/showInlineError の実装）, Process 2（selectionHandler 変更）
- Blocks: -（最終タスク）
