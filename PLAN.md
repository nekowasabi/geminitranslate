# title: 複数段落テキストの選択翻訳修正

## 概要
- 選択テキストが複数段落（複数行）の場合でも、全文が確実に翻訳される機能を実現する

### goal
- ユーザーが複数段落のテキスト（例：Remember The Milkのお知らせ文）を選択してIconBadgeをクリックすると、最初の1行だけでなく全文が翻訳される

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること

## 開発のゴール
- `buildPrompt()`と`parseResponse()`の改行処理を修正し、セパレーター方式で複数段落テキストを確実に区別する
- バッチ翻訳機能との統一性を保ちながら、1要素配列内に複数段落が含まれるケースにも対応する

## 実装仕様

### 現状の問題

#### 問題のフロー
1. 選択テキスト: `["Back in 2005...\n\nBob T. Monkey...\n\nWe want to say..."]` (1要素、複数段落)
2. `buildPrompt()`: `texts.join('\n')` で結合 → 改行が保持される
3. プロンプト: `"Translate... \n\nBack in 2005...\n\nBob T. Monkey...\n\nWe want to say..."`
4. LLMは各段落を個別に翻訳して複数行で返す
5. `parseResponse()`: `split('\n')` で分割 → 複数要素の配列になる
6. `expectedCount = 1` なのに実際は3要素 → **最初の1行だけ返される**

#### 根本原因
- `buildPrompt()`が`texts.join('\n')`で改行結合
- `parseResponse()`が`split('\n')`で改行分割
- 複数段落を含む1要素が、複数要素として誤認識される

### 解決策: セパレーター方式（Option A）

#### セパレーター仕様
- セパレーター文字列: `---NEXT-TEXT---`
- 理由: 通常のテキストに含まれない特殊な文字列

#### buildPrompt()の修正
```typescript
private buildPrompt(texts: string[], targetLanguage: string): string {
  const languageName = getLanguageName(targetLanguage, false);

  // Use special separator to distinguish multi-paragraph texts
  const separator = '\n---NEXT-TEXT---\n';
  const combined = texts.join(separator);

  return `Translate the following texts to ${languageName}.
Texts are separated by "---NEXT-TEXT---".
Return translations in the same format, separated by "---NEXT-TEXT---":

${combined}`;
}
```

#### parseResponse()の修正
```typescript
private parseResponse(content: string, expectedCount: number): string[] {
  const separator = '---NEXT-TEXT---';
  const translations = content
    .trim()
    .split(separator)
    .map((text) => text.trim())
    .filter((text) => text);

  if (translations.length !== expectedCount) {
    logger.warn(`Expected ${expectedCount} translations, got ${translations.length}`);
  }

  return translations;
}
```

## 生成AIの学習用コンテキスト

### Background Script
- `src/background/apiClient.ts`
  - `buildPrompt()`メソッド（Line 299-304）
  - `parseResponse()`メソッド（Line 313-325）

### Content Script
- `src/content/selectionHandler.ts`
  - `translateSelection()`メソッド（Line 89-148）

## Process

### process1: buildPrompt()の修正
@target: `src/background/apiClient.ts`
@ref: なし
- [x] Line 299-304の`buildPrompt()`メソッドを修正
  - `texts.join('\n')` → `texts.join('\n---NEXT-TEXT---\n')`に変更
  - プロンプトメッセージにセパレーターの説明を追加
  - LLMに対して「同じフォーマットで翻訳を返すように」指示

### process2: parseResponse()の修正
@target: `src/background/apiClient.ts`
@ref: なし
- [x] Line 313-325の`parseResponse()`メソッドを修正
  - `split('\n')` → `split('---NEXT-TEXT---')`に変更
  - セパレーター前後の空白をtrim()で除去
  - 空文字列をfilter()で除外

### process10: 型チェックとビルド確認
- [ ] `npx tsc --noEmit` で型チェック実行
- [ ] `npm run build:firefox` でビルド実行
- [ ] エラーがないことを確認

### process50: フォローアップ
今後の改善案:
- LLMがセパレーターを正しく返さない場合のフォールバック処理追加
- セパレーター文字列を定数化してメンテナンス性向上

### process100: 実機テスト
- [ ] 複数段落テキスト（Remember The Milkの例文）で動作確認
  - テキスト選択 → IconBadge表示 → クリック → FloatingUI表示
  - 全段落が翻訳されていることを確認
- [ ] 単一段落テキストでも正常動作することを確認
- [ ] ページ全体翻訳（バッチ翻訳）でも正常動作することを確認

### process200: ドキュメンテーション
- [ ] CLAUDE.mdに選択翻訳の仕様を追記
  - セパレーター方式の説明
  - 複数段落テキスト対応の記述
