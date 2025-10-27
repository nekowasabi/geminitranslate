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
  - [x] `texts.join('\n')` → `texts.join('\n---NEXT-TEXT---\n')`に変更
  - [x] プロンプトメッセージにセパレーターの説明を追加
  - [x] LLMに対して「同じフォーマットで翻訳を返すように」指示

### process2: parseResponse()の修正
@target: `src/background/apiClient.ts`
@ref: なし
- [x] Line 313-325の`parseResponse()`メソッドを修正
  - [x] `split('\n')` → `split('---NEXT-TEXT---')`に変更
  - [x] セパレーター前後の空白をtrim()で除去
  - [x] 空文字列をfilter()で除外

### process10: 型チェックとビルド確認
- [x] `npx tsc --noEmit` で型チェック実行
- [x] `npm run build:firefox` でビルド実行
- [x] エラーがないことを確認

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

#### 詳細な実機テスト手順

##### 事前準備
1. `npm run build:firefox` でビルドを実行
2. Firefoxで `about:debugging#/runtime/this-firefox` を開く
3. 「一時的なアドオンを読み込む」から `dist-firefox/manifest.json` を選択
4. 拡張機能の設定でOpenRouter API Keyとモデルを設定
5. 対象言語を設定（例：Japanese）

##### テストケース1: 複数段落テキストの選択翻訳
1. **準備**: Remember The Milkなど、複数段落のテキストがあるページを開く
   - テスト用テキスト例:
     ```
     Back in 2005, we started Remember The Milk as a simple web-based to-do list.

     Bob T. Monkey has been a core part of Remember The Milk since the beginning.

     We want to say a huge thank you to everyone who's been part of this journey.
     ```
2. **操作**: 上記の複数段落テキスト全体をマウスで選択
3. **期待結果**: IconBadge（翻訳アイコン）が選択範囲の右下に表示される
4. **操作**: IconBadgeをクリック
5. **期待結果**:
   - FloatingUIが表示される
   - **全ての段落が翻訳されて表示される**（最初の段落だけでなく）
   - 各段落の改行が保持されている
6. **検証ポイント**:
   - 翻訳テキストに「2005年に」「Bob T. Monkey」「皆様に感謝」などのキーワードがすべて含まれていること
   - 段落区切りが維持されていること

##### テストケース2: 単一段落テキストの選択翻訳
1. **準備**: 単一段落のテキストを選択
   - テスト用テキスト例: `This is a simple single paragraph text.`
2. **操作**: テキストを選択してIconBadgeをクリック
3. **期待結果**: 正常に翻訳される（例: `これは単純な単一段落のテキストです。`）
4. **検証ポイント**: セパレーター方式でも単一テキストが正常に動作すること

##### テストケース3: ページ全体翻訳（バッチ翻訳）
1. **操作**: ブラウザのツールバーから拡張機能アイコンをクリック
2. **操作**: Popupで「Translate Page」ボタンをクリック
3. **期待結果**: ページ全体が翻訳される
4. **検証ポイント**:
   - バッチ翻訳機能が壊れていないこと
   - 複数の要素が正しく翻訳されること
   - セパレーター方式が干渉していないこと

##### テストケース4: セパレーター文字列の処理
1. **準備**: 万が一テキストに`---NEXT-TEXT---`が含まれている場合
   - テスト用テキスト例: `Text with ---NEXT-TEXT--- separator inside.`
2. **操作**: テキストを選択して翻訳
3. **期待結果**: 誤分割されずに1つのテキストとして翻訳される
4. **検証ポイント**: セパレーター文字列がテキスト中に含まれていても正常動作すること

##### テストケース5: LLMがセパレーターを正しく返さない場合
1. **状況**: LLMがセパレーターなしで改行のみで返した場合
2. **期待動作**:
   - 現在の実装では誤動作する可能性あり
   - process50のフォローアップで改善予定
3. **検証ポイント**: 正常なレスポンスが返ってくることを確認

##### テスト完了条件
- [ ] すべてのテストケースが成功すること
- [ ] コンソールにエラーが出ていないこと
- [ ] 既存機能（ページ全体翻訳、クリップボード翻訳など）が壊れていないこと

### process200: ドキュメンテーション
- [x] CLAUDE.mdに選択翻訳の仕様を追記
  - [x] セパレーター方式の説明
  - [x] 複数段落テキスト対応の記述
  - [x] 実装詳細とサンプルコード
