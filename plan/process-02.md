# Process 2: P0: トースト通知メソッド追加（selectionHandler）

## Overview
選択翻訳の失敗時にユーザーへのフィードバックが皆無な問題を修正するための通知基盤を構築。既存の `ProgressNotification` パターン（色・位置・アニメーション）を踏襲した軽量トースト通知メソッドを `SelectionHandler` に追加する。

## Affected Files
| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/selectionHandler.ts` | constructor | `ProgressNotification` インスタンスの注入（オプショナル） |
| `src/content/selectionHandler.ts` | 新規メソッド | `showSelectionToast(message, type)` private メソッド追加 |
| `src/content/selectionHandler.ts` | 新規メソッド | `hideSelectionToast()` private メソッド追加 |
| `src/content/contentScript.ts` | constructor付近 | SelectionHandler 生成時に progressNotification を渡す |
| `tests/unit/content/selectionHandler.test.ts` | 新規追加 | トースト表示/非表示テスト |

## Implementation Notes

### 方針: ProgressNotification 再利用 vs 独自実装
// Why: ProgressNotification.error() はプログレスバー付きでページ翻訳用に設計されている。
// 選択翻訳にはプログレスバー不要なため、同じスタイル定数を使いつつ独自の軽量トーストを実装する。

### トーストメソッド設計
```typescript
// selectionHandler.ts に追加
private toastElement: HTMLElement | null = null;
private toastTimer: ReturnType<typeof setTimeout> | null = null;

private showSelectionToast(message: string, type: 'loading' | 'error' | 'info'): void {
  this.hideSelectionToast();
  const toast = document.createElement('div');
  toast.className = 'gemini-translate-selection-toast';
  
  const colors = {
    loading: '#4F46E5',  // ProgressNotification NORMAL_BG と同色
    error: '#EF4444',    // ProgressNotification ERROR_BG と同色
    info: '#3B82F6',     // 情報用ブルー
  };
  
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '10001',
    padding: '12px 16px',
    borderRadius: '8px',
    backgroundColor: colors[type],
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '500',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    transition: 'opacity 0.3s ease',
    opacity: '0',
  });
  
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.style.opacity = '1'; });
  this.toastElement = toast;
  
  if (type === 'error' || type === 'info') {
    this.toastTimer = setTimeout(() => this.hideSelectionToast(), 5000);
  }
}

private hideSelectionToast(): void {
  if (this.toastTimer) { clearTimeout(this.toastTimer); this.toastTimer = null; }
  if (this.toastElement?.parentNode) {
    this.toastElement.remove();
    this.toastElement = null;
  }
}
```

### スタイル一貫性
| 要素 | 既存値（ProgressNotification） | トーストで採用 |
|------|------|------|
| 通常背景色 | `#4F46E5` | 同じ |
| エラー背景色 | `#EF4444` | 同じ |
| 位置 | `bottom: 20px, right: 20px` | 同じ |
| z-index | `10001` | 同じ |
| エラー自動非表示 | なし | 5秒（FloatingUI.showErrorと統一） |

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認
- [ ] テストケースを作成（実装前に失敗確認）
  - `showSelectionToast('翻訳中...', 'loading')` でDOM要素が追加されること
  - `showSelectionToast('エラー', 'error')` で5秒後に自動非表示されること
  - `hideSelectionToast()` でDOM要素が除去されること
  - 連続呼び出しで前のトーストが消えてから新しいものが表示されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `selectionHandler.ts` に `toastElement`, `toastTimer` フィールド追加
- [ ] `showSelectionToast()`, `hideSelectionToast()` メソッド実装
- [ ] `contentScript.ts` の SelectionHandler 生成箇所を確認（注入不要なら省略）
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] スタイル定数をconfig等に抽出するか検討（過度な抽象化は避ける）
- [ ] ダークモード対応を検討（matchMedia）
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -
- Blocks: Process 3, Process 5
