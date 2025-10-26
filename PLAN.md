# title: 翻訳機能のメッセージング修正

## 概要
- Content ScriptからBackground Scriptへの翻訳リクエストメッセージに`action`プロパティを追加し、MessageHandlerが正しくメッセージを処理できるようにする

### goal
- ユーザーがPopupの「Translate」ボタンをクリックした時、ページ全体が正常に翻訳される
- Selection翻訳、Clipboard翻訳も正常に動作する
- メッセージ形式の一貫性が保たれ、将来的なメンテナンスが容易になる

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること

## 開発のゴール
- Content ScriptとBackground Script間のメッセージング仕様を統一する
- MessageHandlerが`action`プロパティを必須としているため、すべての翻訳リクエストメッセージに`action: 'requestTranslation'`を追加する
- 型定義を更新して型安全性を保証する
- 既存のテストを更新し、新しい仕様に対応させる

## 実装仕様

### 技術的詳細

#### 根本原因
1. **Content Script側の問題**
   - `src/content/contentScript.ts`（118-124行）でREQUEST_TRANSLATIONメッセージを送信する際、`action`プロパティが欠落
   - `src/content/selectionHandler.ts`（90-96行）、`src/content/clipboardHandler.ts`（68-74行）も同様の問題

2. **Background Script側の仕様**
   - `src/background/messageHandler.ts`（118-124行）で`message.action`が必須と判定
   - `action`がない場合、エラー「Invalid message format: missing action」を返す

3. **Test Connectionが成功する理由**
   - `src/shared/messages/types.ts`（119-123行）でTestConnectionMessageは`action: 'testConnection'`を持つ
   - そのため、MessageHandlerは正常に処理できる

#### 型定義の不整合
- `TranslationRequestMessage`（38-44行）には`action`プロパティが定義されていない
- `TestConnectionMessage`（119-123行）には`action`プロパティが定義されている
- この不整合が問題の原因

#### 修正方針
1. **TranslationRequestMessage型に`action`プロパティを追加**
   - `action: 'requestTranslation'`を必須プロパティとして定義

2. **Content Script側の送信メッセージに`action`を追加**
   - `contentScript.ts`、`selectionHandler.ts`、`clipboardHandler.ts`の3ファイル

3. **MessageHandlerのフォールバック対応**
   - `action`がない場合、`type`から推測する後方互換性対応（オプション）

4. **テストの更新**
   - 新しいメッセージ形式に対応したテストケースに更新

## 生成AIの学習用コンテキスト

### 対象ファイル
- `src/shared/messages/types.ts`
  - メッセージ型定義の修正
- `src/content/contentScript.ts`
  - ページ全体翻訳のメッセージ送信
- `src/content/selectionHandler.ts`
  - 選択テキスト翻訳のメッセージ送信
- `src/content/clipboardHandler.ts`
  - クリップボード翻訳のメッセージ送信
- `src/background/messageHandler.ts`
  - メッセージハンドラーのフォールバック対応（オプション）
- `tests/unit/content/contentScript.test.ts`
  - Content Scriptのテスト更新
- `tests/unit/background/messageHandler.test.ts`
  - MessageHandlerのテスト更新

## Process

### process1 型定義の修正
@target: `src/shared/messages/types.ts`
- [ ] `TranslationRequestMessage`インターフェースに`action: 'requestTranslation'`プロパティを追加
- [ ] 既存の`TestConnectionMessage`との一貫性を確保
- [ ] JSDコメントで`action`プロパティの目的を文書化

```typescript
/**
 * Translation Request Message
 */
export interface TranslationRequestMessage extends BaseMessage {
  type: MessageType.REQUEST_TRANSLATION;
  action: 'requestTranslation';  // 追加: MessageHandlerのルーティング用
  payload: {
    texts: string[];
    targetLanguage: string;
  };
}
```

### process2 Content Scriptのメッセージ送信修正
#### sub1 ページ全体翻訳のメッセージ修正
@target: `src/content/contentScript.ts`
@ref: `src/shared/messages/types.ts`
- [ ] 118-124行の`this.messageBus.send()`呼び出しに`action: 'requestTranslation'`を追加
- [ ] メッセージ送信のログ出力を確認

```typescript
// Before (line 118-124)
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  payload: {
    texts,
    targetLanguage,
  },
});

// After
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: {
    texts,
    targetLanguage,
  },
});
```

#### sub2 選択テキスト翻訳のメッセージ修正
@target: `src/content/selectionHandler.ts`
@ref: `src/shared/messages/types.ts`
- [ ] 90-96行の`this.messageBus.send()`呼び出しに`action: 'requestTranslation'`を追加
- [ ] 型安全性の確保

```typescript
// Before (line 90-96)
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  payload: {
    texts: [selectedText],
    targetLanguage,
  },
});

// After
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: {
    texts: [selectedText],
    targetLanguage,
  },
});
```

#### sub3 クリップボード翻訳のメッセージ修正
@target: `src/content/clipboardHandler.ts`
@ref: `src/shared/messages/types.ts`
- [ ] 68-74行の`this.messageBus.send()`呼び出しに`action: 'requestTranslation'`を追加
- [ ] エラーハンドリングの確認

```typescript
// Before (line 68-74)
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  payload: {
    texts: [clipboardText],
    targetLanguage,
  },
});

// After
const response = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: {
    texts: [clipboardText],
    targetLanguage,
  },
});
```

### process3 MessageHandlerのフォールバック対応（オプション）
@target: `src/background/messageHandler.ts`
@ref: `src/shared/messages/types.ts`
- [ ] 118-124行のactionチェックロジックを修正
- [ ] `action`がない場合、`type`から推測するフォールバック処理を追加
- [ ] 後方互換性を保証しつつ、将来的な移行をスムーズに

```typescript
// Before (line 117-124)
if (!message.action) {
  sendResponse({
    success: false,
    error: 'Invalid message format: missing action',
  });
  return true;
}

// After（オプション：後方互換性対応）
// actionがない場合、typeから推測
const action = message.action || this.inferActionFromType(message.type);
if (!action) {
  sendResponse({
    success: false,
    error: 'Invalid message format: missing action',
  });
  return true;
}

// Helper method
private inferActionFromType(type: string): string | undefined {
  const typeToActionMap: Record<string, string> = {
    'requestTranslation': 'requestTranslation',
    'testConnection': 'testConnection',
  };
  return typeToActionMap[type];
}
```

### process10 ユニットテスト
#### sub1 Content Scriptテストの更新
@target: `tests/unit/content/contentScript.test.ts`
@ref: `src/content/contentScript.ts`
- [ ] `translatePage`メソッドのテストケースを更新
- [ ] メッセージに`action: 'requestTranslation'`が含まれることを検証
- [ ] モックのsendメソッドが正しいメッセージ形式を受け取ることを確認

```typescript
it('should send REQUEST_TRANSLATION message with action', async () => {
  // Arrange
  const messageBusSendSpy = jest.spyOn(messageBus, 'send');
  messageBusSendSpy.mockResolvedValue({
    payload: { translations: ['translated'] }
  });

  // Act
  await contentScript.translatePage('Japanese');

  // Assert
  expect(messageBusSendSpy).toHaveBeenCalledWith({
    type: MessageType.REQUEST_TRANSLATION,
    action: 'requestTranslation',  // 追加検証
    payload: {
      texts: expect.any(Array),
      targetLanguage: 'Japanese',
    },
  });
});
```

#### sub2 MessageHandlerテストの更新
@target: `tests/unit/background/messageHandler.test.ts`
@ref: `src/background/messageHandler.ts`
- [ ] `handleRequestTranslation`のテストケースを更新
- [ ] `action`プロパティを含むメッセージでテスト
- [ ] `action`がない場合のエラーハンドリングをテスト（フォールバック実装の場合は調整）

```typescript
describe('handleRequestTranslation', () => {
  it('should handle translation request with action', async () => {
    // Arrange
    const message = {
      type: MessageType.REQUEST_TRANSLATION,
      action: 'requestTranslation',  // 追加
      payload: {
        texts: ['Hello'],
        targetLanguage: 'Japanese',
      },
    };

    // Act
    await messageHandler.handle(message, sender, sendResponse);

    // Assert
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: { translations: expect.any(Array) },
    });
  });

  it('should return error when action is missing', async () => {
    // Arrange
    const message = {
      type: MessageType.REQUEST_TRANSLATION,
      // action: missing
      payload: {
        texts: ['Hello'],
        targetLanguage: 'Japanese',
      },
    };

    // Act
    await messageHandler.handle(message, sender, sendResponse);

    // Assert
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid message format: missing action',
    });
  });
});
```

#### sub3 SelectionHandlerとClipboardHandlerのテスト確認
@target: `tests/unit/content/selectionHandler.test.ts`, `tests/unit/content/clipboardHandler.test.ts`
- [ ] 各テストファイルが存在する場合、メッセージ形式を更新
- [ ] `action: 'requestTranslation'`が含まれることを検証

### process50 動作確認
#### sub1 ローカルビルドと拡張機能の読み込み
- [ ] `npm run build`でプロジェクトをビルド
- [ ] Firefox の`about:debugging`から拡張機能を読み込み
- [ ] Popupを開いてAPI Keyが設定されていることを確認

#### sub2 ページ全体翻訳の動作確認
- [ ] 任意のWebページを開く
- [ ] Popupの「Translate」ボタンをクリック
- [ ] ページ全体が翻訳されることを確認
- [ ] 開発者コンソールでエラーがないことを確認
- [ ] Background Scriptのログで「requestTranslation action」が実行されていることを確認

#### sub3 Selection翻訳の動作確認
- [ ] Webページ上でテキストを選択
- [ ] Floating UIが表示され、翻訳が実行されることを確認
- [ ] メッセージに`action`プロパティが含まれていることをログで確認

#### sub4 Clipboard翻訳の動作確認
- [ ] クリップボードにテキストをコピー
- [ ] Popupから「Translate Clipboard」機能を実行（存在する場合）
- [ ] 翻訳が正常に表示されることを確認

#### sub5 Test Connection機能の確認
- [ ] Popupの「Test Connection」ボタンをクリック
- [ ] 既存機能が引き続き正常に動作することを確認（回帰テスト）

### process100 リファクタリング
#### sub1 コードの可読性向上
@target: `src/shared/messages/types.ts`
- [ ] 各メッセージ型のJSDocコメントを充実
- [ ] `action`プロパティの役割と使い方を明確に文書化

```typescript
/**
 * Translation Request Message
 *
 * Content ScriptからBackground Scriptへ翻訳リクエストを送信する際に使用。
 * MessageHandlerは`action`プロパティを使用してハンドラーをルーティングする。
 *
 * @example
 * ```typescript
 * const message: TranslationRequestMessage = {
 *   type: MessageType.REQUEST_TRANSLATION,
 *   action: 'requestTranslation',
 *   payload: {
 *     texts: ['Hello', 'World'],
 *     targetLanguage: 'Japanese',
 *   },
 * };
 * ```
 */
export interface TranslationRequestMessage extends BaseMessage {
  type: MessageType.REQUEST_TRANSLATION;
  action: 'requestTranslation';
  payload: {
    texts: string[];
    targetLanguage: string;
  };
}
```

#### sub2 MessageBusの型安全性向上（オプション）
@target: `src/shared/messages/MessageBus.ts`
@ref: `src/shared/messages/types.ts`
- [ ] `send`メソッドのジェネリック型パラメータを活用
- [ ] メッセージ型の不整合をコンパイル時に検出

#### sub3 エラーメッセージの改善
@target: `src/background/messageHandler.ts`
- [ ] エラーメッセージをより具体的にする
- [ ] デバッグしやすいログ出力を追加

```typescript
if (!action) {
  logger.error('MessageHandler: Invalid message format', {
    type: message.type,
    hasAction: !!message.action,
    message,
  });
  sendResponse({
    success: false,
    error: `Invalid message format: missing action property (type: ${message.type})`,
  });
  return true;
}
```

### process200 ドキュメンテーション
#### sub1 CHANGELOG.mdの更新
@target: `CHANGELOG.md`
- [ ] 今回の修正内容を追加
- [ ] Breaking Changeセクションに型定義の変更を記載（該当する場合）

```markdown
## [Unreleased]

### Fixed
- Fixed translation functionality not working due to missing `action` property in REQUEST_TRANSLATION messages
  - Added `action: 'requestTranslation'` to TranslationRequestMessage type definition
  - Updated Content Script message sending in contentScript.ts, selectionHandler.ts, clipboardHandler.ts
  - Enhanced MessageHandler to handle action-based routing correctly

### Changed
- **Breaking Change**: TranslationRequestMessage now requires `action` property
  - All REQUEST_TRANSLATION messages must include `action: 'requestTranslation'`
```

#### sub2 CLAUDE.mdの更新
@target: `CLAUDE.md`
- [ ] メッセージング仕様のセクションを追加
- [ ] 今後の開発者が同じ問題を起こさないようにガイドラインを記載

```markdown
## Messaging Architecture

### Message Format
All messages between Content Script and Background Script must include:
- `type`: MessageType enum value
- `action`: String identifier for MessageHandler routing
- `payload`: Message-specific data (optional)

Example:
\`\`\`typescript
{
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: {
    texts: ['Hello'],
    targetLanguage: 'Japanese',
  },
}
\`\`\`

### Adding New Message Types
1. Define interface in `src/shared/messages/types.ts`
2. Include both `type` and `action` properties
3. Add handler in `src/background/messageHandler.ts`
4. Update tests in `tests/unit/background/messageHandler.test.ts`
```

#### sub3 実装完了後の確認
- [ ] すべてのプロセスが完了していることを確認
- [ ] テストが全てパスすることを確認
- [ ] ドキュメントが最新の状態に更新されていることを確認
- [ ] Git commitメッセージを生成（ルールに従う）

## 期待される結果

### 機能面
- ✅ Popupの「Translate」ボタンでページ全体が翻訳される
- ✅ Selection翻訳が正常に動作する
- ✅ Clipboard翻訳が正常に動作する
- ✅ Test Connection機能が引き続き正常に動作する

### 技術面
- ✅ メッセージ型定義が一貫性を持つ
- ✅ 型安全性が保証される
- ✅ MessageHandlerがactionプロパティを使用してルーティングする
- ✅ すべてのテストがパスする

### 保守性
- ✅ コードの可読性が向上する
- ✅ ドキュメントが充実する
- ✅ 今後の開発者が同じ問題を起こさない

## 注意事項

### リスク
1. **Breaking Change**: 既存の他のメッセージ送信箇所が影響を受ける可能性
   - 対策: 全てのREQUEST_TRANSLATIONメッセージ送信箇所を確認

2. **テストの網羅性**: 全ての翻訳フローがテストされているか
   - 対策: process10で各翻訳タイプのテストを実施

3. **型定義の不整合**: 他のメッセージ型も同様の問題を抱えている可能性
   - 対策: process100でメッセージ型全体をレビュー

### 実装の優先順位
1. **高**: process1（型定義）、process2（メッセージ送信修正）
2. **中**: process10（テスト）、process50（動作確認）
3. **低**: process100（リファクタリング）、process200（ドキュメンテーション）

### 開発フロー
```
1. 型定義修正 (process1)
   ↓
2. Content Script修正 (process2)
   ↓
3. テスト更新・実行 (process10)
   ↓
4. 動作確認 (process50)
   ↓
5. リファクタリング (process100)
   ↓
6. ドキュメンテーション (process200)
   ↓
7. Git commit & push
```
