# Process 4: P1 binary-split深度制限 (translationEngine.ts)

## Overview
`translateByBinarySplit()` の無制限再帰を解消する。100テキストバッチでのParseCountMismatchError発生時、最大512 API呼び出しが発生していた問題を、深度1キャップで100呼び出し以内に制限する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/background/translationEngine.ts` | L753 | `translateByBinarySplit()` シグネチャに `depth: number = 0` 引数を追加 |
| `src/background/translationEngine.ts` | L806-813 | 再帰呼び出し箇所に深度チェックを追加 |
| `src/shared/constants/config.ts` | - | `MAX_BINARY_SPLIT_DEPTH = 1` 定数を追加 |

## Implementation Notes

### 変更前（現状の問題）
```typescript
// translationEngine.ts:753 — 深度制限なし
private async translateByBinarySplit(
  texts: string[],
  targetLanguage: string,
  requestBudget: RequestBudgetContext,
  options: TranslationOptions,
  offset: number
): Promise<string[]> {
  // ...
  // L806-813: 再帰呼び出し（深度制限なし → 最大log2(100)=7層）
  const [leftResult, rightResult] = await Promise.all([
    this.translateByBinarySplit(leftTexts, ...),
    this.translateByBinarySplit(rightTexts, ...)
  ]);
}
```

### 変更後（目標）
```typescript
// config.ts に追加
// Why: unlimited recursion → depth-capped binary split (MAX_BINARY_SPLIT_DEPTH=1)
//      Unbounded recursion causes 512 API calls for 100 texts on persistent ParseCountMismatch.
export const MAX_BINARY_SPLIT_DEPTH = 1;

// translationEngine.ts:753
// Why: depth parameter added to cap recursion
private async translateByBinarySplit(
  texts: string[],
  targetLanguage: string,
  requestBudget: RequestBudgetContext,
  options: TranslationOptions,
  offset: number,
  depth: number = 0  // 追加
): Promise<string[]> {
  // L806-813: 深度チェックを追加
  if (depth >= MAX_BINARY_SPLIT_DEPTH) {
    // 深度上限到達: 個別翻訳にフォールバック
    return await this.translateIndividually(texts, targetLanguage, requestBudget, options, offset);
  }
  const [leftResult, rightResult] = await Promise.all([
    this.translateByBinarySplit(leftTexts, ..., depth + 1),
    this.translateByBinarySplit(rightTexts, ..., depth + 1)
  ]);
}
```

### 期待される効果
- 変更前: ParseCountMismatch × 100テキスト → 最大512 API呼び出し
- 変更後: ParseCountMismatch × 100テキスト → 最大100 API呼び出し（個別翻訳フォールバック）
- 改善率: 80%以上

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `docs/requirements/zero-base-redesign-report.md` BUG-003 セクション
- [ ] `tests/unit/background/translationEngine.test.ts` に以下のテストケースを追加:
  - ParseCountMismatchError発生時、`translateByBinarySplit` が深度2以上で再帰しないこと
  - 深度1到達後は `translateIndividually` が呼ばれること
  - 100テキストバッチでのAPI呼び出し回数が100回以内であること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `config.ts` に `MAX_BINARY_SPLIT_DEPTH = 1` を追加
- [ ] `translateByBinarySplit()` シグネチャに `depth: number = 0` を追加
- [ ] 再帰呼び出し箇所に `depth >= MAX_BINARY_SPLIT_DEPTH` チェックを追加
- [ ] チェック到達時は `translateIndividually()` に委譲
- [ ] 再帰呼び出しに `depth + 1` を渡す
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] Whyコメントを `config.ts` の `MAX_BINARY_SPLIT_DEPTH` 定義箇所と `translateByBinarySplit` シグネチャに追加
- [ ] `npm run lint` がクリーンであることを確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: Process 1（同一ファイル）、Process 3（`executeTranslationWithRetry` 変更後）
- Blocks: Process 5, Process 10
