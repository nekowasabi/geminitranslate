## 実装仕様

### 1. UIデザイン

#### 配置とスタイリング
- **Position**: `fixed`
- **Location**: 画面右下（`bottom: 20px`, `right: 20px`）
- **Z-index**: `10001`（既存のページコンテンツより上に表示）
- **背景色**:
  - 通常状態: `#4F46E5` (青色)
  - エラー状態: `#EF4444` (赤色)
- **ダークモード対応**: システムまたはページのダークモード設定に応じて自動調整
- **アニメーション**: フェードイン/フェードアウト効果

#### レスポンシブ対応
- モバイル/タブレットでも適切に表示されるよう配慮
- 小画面でも視認性を確保

---

### 2. メッセージ表示タイミング

#### 翻訳開始時
```
翻訳を開始しています... 0%
```
- `translatePage()`メソッド開始直後
- `progressNotification.show()` を呼び出し

#### 各バッチ完了時
```
翻訳中... XX%
```
- バッチ処理が1つ完了するたびに更新
- `MessageType.TRANSLATION_PROGRESS` メッセージを受信時
- `progressNotification.update()` を呼び出し

#### 翻訳完了時
```
翻訳完了 100%
```
- すべてのバッチ処理が正常に完了した時点
- `progressNotification.complete()` を呼び出し

#### エラー時
```
エラー: [エラーメッセージ]
```
- API呼び出しエラー、ネットワークエラー等の発生時
- `MessageType.TRANSLATION_ERROR` メッセージを受信時
- `progressNotification.error(errorMessage)` を呼び出し

---

### 3. 自動非表示動作

#### 成功時の挙動
- 翻訳完了メッセージ表示後、**3秒**待機
- 自動的にフェードアウトアニメーション開始
- DOM要素を削除

#### エラー時の挙動
- エラーメッセージは**自動で消えない**
- ユーザーが手動で閉じる（×ボタンクリック）まで表示継続
- エラー内容を確認する時間を確保

---

### 4. 進捗率計算

#### 計算式
```javascript
const percentage = Math.round((completedBatches / totalBatches) * 100);
```

#### バッチ処理の仕組み
- **並列実行**: 最大10バッチを同時並行で処理（`CONCURRENCY_LIMIT = 10`）
- **進捗カウント**: 完了したバッチ数で進捗率を計算
- **total**: 全体のバッチ数（翻訳対象のテキストノード数を基に算出）
- **current**: これまでに完了したバッチ数

#### 表示例
- `0 / 10` → 0%
- `3 / 10` → 30%
- `10 / 10` → 100%

---

### 5. メッセージングフロー

#### 翻訳開始
```
Content Script → Background Script
MessageType: REQUEST_TRANSLATION
Payload: { texts, targetLanguage, ... }
```

#### 進捗通知（各バッチ完了時）
```
Background Script → Content Script
MessageType: TRANSLATION_PROGRESS
Payload: { current: number, total: number, percentage: number }
```

#### 翻訳完了
```
Background Script → Content Script
MessageType: TRANSLATION_COMPLETED
Payload: { success: true }
```

#### エラー発生
```
Background Script → Content Script
MessageType: TRANSLATION_ERROR
Payload: { error: string, code?: string }
```

#### メッセージング要件
- すべてのメッセージは `type` と `action` プロパティを持つ（CLAUDE.md参照）
- `browser.tabs.sendMessage()` を使用してBackground → Content方向の通信を実現
- Content Scriptは `browser.runtime.onMessage` でメッセージを受信

---

### 6. パフォーマンス考慮事項

#### メッセージ送信頻度
- **頻度**: バッチ数分（通常10回以下）
- **理由**: 並列処理の完了ごとに通知するため、最大でもバッチ数と同じ回数
- **影響**: メッセージングオーバーヘッドは無視できるレベル

#### DOM更新の最適化
- **更新対象**: 通知UIのテキストコンテンツのみ
- **手法**: `textContent` プロパティの変更
- **再レンダリング**: 最小限に抑える（要素の再生成は行わない）
- **アニメーション**: CSS transitionを使用（JavaScriptアニメーションは避ける）

#### メモリ管理
- 翻訳完了後、通知UI要素を適切に削除
- イベントリスナーのクリーンアップを忘れずに実施
- `cleanup()` メソッドでリソース解放

---

### process1 ProgressNotification UI component実装

#### 実装チェックリスト
@target: src/content/progressNotification.ts
- [ ] ProgressNotificationクラスの作成
- [ ] show()メソッドの実装（初期表示）
- [ ] update()メソッドの実装（進捗更新）
- [ ] complete()メソッドの実装（完了通知）
- [ ] error()メソッドの実装（エラー通知）
- [ ] remove()メソッドの実装（通知削除）
- [ ] ダークモード検出ロジックの実装
- [ ] CSS-in-JSによるスタイリング
- [ ] プログレスバーのアニメーション実装
- [ ] 自動削除タイマーの実装

## TDD手順 (process1)

### Red: 失敗するテストを書く
1. テストファイル作成: `tests/unit/content/progressNotification.test.ts`
2. テストケース定義: `describe('ProgressNotification', () => { ... })`
3. 各メソッド(show, update, complete, error, remove)のテストを先に記述
4. テスト実行: `npm test -- tests/unit/content/progressNotification.test.ts` → 失敗を確認

### Green: テストをパスする最小限の実装
1. `src/content/progressNotification.ts`にProgressNotificationクラスを実装
2. show(), update(), complete(), error(), remove()メソッドを最小限実装
3. テスト実行: すべてのテストがパスすることを確認

### Refactor: コードの改善
1. 重複コードの削除(DOM操作の共通化)
2. CSS-in-JS部分の定数化
3. ダークモード検出ロジックの最適化
4. テスト実行: リファクタリング後もすべてのテストがパスすることを確認

## テストケース一覧 (process1)

### 正常系
- [ ] show()メソッドのテスト
  - **Given**: ProgressNotificationインスタンスが存在
  - **When**: show()を呼び出す
  - **Then**: 通知要素がDOMに追加され、初期状態(0%)が表示される
  - **Mock/Stub**: document.createElement, document.body.appendChild

- [ ] update()メソッドのテスト
  - **Given**: 通知が表示されている状態
  - **When**: update(5, 10)を呼び出す
  - **Then**: 進捗率50%が表示され、プログレスバーの幅が50%になる
  - **Mock/Stub**: なし(DOM操作の検証)

- [ ] complete()メソッドのテスト
  - **Given**: 通知が表示されている状態
  - **When**: complete()を呼び出す
  - **Then**: 完了メッセージ(100%)が表示され、3秒後に自動削除される
  - **Mock/Stub**: setTimeout, clearTimeout

- [ ] remove()メソッドのテスト
  - **Given**: 通知が表示されている状態
  - **When**: remove()を呼び出す
  - **Then**: 通知要素がDOMから削除され、タイマーがクリアされる
  - **Mock/Stub**: clearTimeout

### 異常系
- [ ] error()メソッドのテスト
  - **Given**: ProgressNotificationインスタンスが存在
  - **When**: error('Network error')を呼び出す
  - **Then**: エラーメッセージが赤色背景で表示される
  - **Mock/Stub**: document.createElement

- [ ] 通知が表示されていない状態でupdate()を呼ぶ
  - **Given**: show()を呼び出していない
  - **When**: update(5, 10)を呼び出す
  - **Then**: エラーがスローされるか、何も起こらない(実装による)

### 境界値テスト
- [ ] 進捗率0%のテスト
  - **Given**: 通知が表示されている
  - **When**: update(0, 10)を呼び出す
  - **Then**: 0%が表示され、プログレスバーの幅が0になる

- [ ] 進捗率100%のテスト
  - **Given**: 通知が表示されている
  - **When**: update(10, 10)を呼び出す
  - **Then**: 100%が表示され、プログレスバーの幅が100%になる

## モック/スタブ定義 (process1)

```typescript
// Vitest + @testing-library/dom を使用
import { vi } from 'vitest';

// DOMモック
const mockElement = document.createElement('div');
vi.spyOn(document, 'createElement').mockReturnValue(mockElement);
vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockElement);
vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockElement);

// タイマーモック
vi.useFakeTimers();
```

## 動作検証項目 (process1)

- [ ] テストカバレッジ80%以上
- [ ] すべてのテストが独立して実行可能
- [ ] DOM操作のモック呼び出し回数・引数を検証
- [ ] ダークモード対応のテスト(matchMediaモック)
- [ ] TypeScriptコンパイルエラーなし

## テスト実行コマンド (process1)

```bash
# 単一テストファイル実行
npm test -- tests/unit/content/progressNotification.test.ts

# 監視モード
npm test -- --watch tests/unit/content/progressNotification.test.ts

# カバレッジ測定
npm test -- --coverage tests/unit/content/progressNotification.test.ts
```

---

### process4 Content Script統合

#### sub1 ProgressNotification統合
@target: src/content/contentScript.ts
@ref: src/content/progressNotification.ts
- [ ] インポート文にProgressNotificationを追加
- [ ] コンストラクタでProgressNotificationインスタンスを作成
- [ ] cleanupメソッドでprogressNotification.remove()を呼び出す

#### sub2 handleMessageにTRANSLATION_PROGRESSケース追加
@target: src/content/contentScript.ts
@ref: src/shared/messages/types.ts
- [ ] handleMessageメソッドのswitchケースにMessageType.TRANSLATION_PROGRESSを追加
- [ ] TranslationProgressMessageのpayloadから進捗データを取得
- [ ] progressNotification.update()を呼び出して進捗表示を更新
- [ ] sendResponseで成功レスポンスを返す

#### sub3 translatePageメソッドに進捗通知の初期化・完了処理を追加
@target: src/content/contentScript.ts
- [ ] translatePage開始時にprogressNotification.show()を呼び出す（total: extractedNodes.length）
- [ ] 翻訳成功時にprogressNotification.complete()を呼び出す
- [ ] catchブロックでprogressNotification.error()を呼び出す（エラーメッセージを渡す）

#### TDD手順（Red-Green-Refactor）

##### Red: テストコード作成
1. tests/unit/content/contentScript.test.tsを開く
2. 以下のテストケースを追加（すべて失敗することを確認）:
   - `handleMessage()のTRANSLATION_PROGRESSケース`
   - `translatePage()の進捗通知統合`
   - `cleanup()でのprogressNotification.remove()`

##### Green: 最小限の実装
1. src/content/contentScript.tsにProgressNotificationのインポートを追加
2. コンストラクタでprogressNotificationインスタンスを作成
3. handleMessageメソッドにTRANSLATION_PROGRESSケースを追加
4. translatePageメソッドにshow/complete/error呼び出しを追加
5. cleanupメソッドにremove()呼び出しを追加
6. テストがすべてパスすることを確認

##### Refactor: リファクタリング
1. エラーハンドリングの改善
2. ログ出力の追加
3. 型安全性の向上
4. コードの可読性向上

#### テストケース一覧

##### 正常系
@target: tests/unit/content/contentScript.test.ts
- [ ] TRANSLATION_PROGRESSメッセージ受信時にprogressNotification.update()が呼び出される
  - payload: { current: 5, total: 10, percentage: 50 }
  - update()の引数が正しいことを確認
  - sendResponseが{ success: true }で呼ばれることを確認
- [ ] translatePage開始時にprogressNotification.show()が呼び出される
  - total引数がextractedNodes.lengthと一致することを確認
- [ ] translatePage成功時にprogressNotification.complete()が呼び出される
  - 翻訳レスポンスが成功の場合にcomplete()が呼ばれることを確認
- [ ] cleanup()呼び出し時にprogressNotification.remove()が実行される

##### 異常系
@target: tests/unit/content/contentScript.test.ts
- [ ] translatePage失敗時にprogressNotification.error()が呼び出される
  - エラーメッセージが正しく渡されることを確認
  - エラーがre-throwされることを確認
- [ ] TRANSLATION_PROGRESSメッセージに不正なpayloadが含まれる場合
  - エラーハンドリングが正しく動作することを確認

##### 境界値
@target: tests/unit/content/contentScript.test.ts
- [ ] extractedNodesが空配列の場合
  - show()が呼ばれないことを確認
  - complete()/error()も呼ばれないことを確認
- [ ] progressが0%の場合
  - payload: { current: 0, total: 10, percentage: 0 }
  - update()が正しく呼ばれることを確認
- [ ] progressが100%の場合
  - payload: { current: 10, total: 10, percentage: 100 }
  - update()が正しく呼ばれることを確認

#### モック/スタブ定義

##### ProgressNotificationのモック
```typescript
const mockProgressNotification = {
  show: jest.fn(),
  update: jest.fn(),
  complete: jest.fn(),
  error: jest.fn(),
  remove: jest.fn(),
};

jest.mock('../../../src/content/progressNotification', () => ({
  ProgressNotification: jest.fn(() => mockProgressNotification),
}));
```

##### browser.runtime.onMessageのモック
```typescript
// すでに既存のテストでMessageBusがモックされているため、
// MessageBusのlistenメソッドをモックして使用
```

#### 動作検証項目

##### 統合テスト（手動確認）
- [ ] 翻訳開始時に進捗通知が画面右下に表示される
- [ ] TRANSLATION_PROGRESSメッセージ受信時に進捗バーが更新される
- [ ] 翻訳完了時に「翻訳完了」メッセージが表示され、3秒後に自動消去される
- [ ] 翻訳エラー時にエラーメッセージが表示され、自動消去されない
- [ ] cleanup()呼び出し時に進捗通知が削除される

##### ユニットテスト実行
- [ ] `npm test -- contentScript.test.ts`でテストがすべてパスする
- [ ] カバレッジが80%以上であることを確認

#### テスト実行コマンド

```bash
# 特定のテストファイルのみ実行
npm test -- tests/unit/content/contentScript.test.ts

# ウォッチモード
npm test -- --watch tests/unit/content/contentScript.test.ts

# カバレッジ付き
npm test -- --coverage tests/unit/content/contentScript.test.ts

# すべてのcontentテスト実行
npm test -- tests/unit/content/
```

---

### process5 エラーハンドリング強化

#### sub1 TranslationEngine側でエラー時の通知送信
@target: src/background/translationEngine.ts
@ref: src/shared/messages/types.ts
- [ ] translateBatch()のcatchブロックを拡張
- [ ] エラー発生時にMessageType.TRANSLATION_ERRORメッセージをContent Scriptに送信
- [ ] エラーコード（存在する場合）とエラーメッセージをpayloadに含める
- [ ] MessageBusまたはbrowser.tabs.sendMessageを使用してメッセージ送信

#### sub2 MessageHandlerでエラー通知の転送
@target: src/background/messageHandler.ts
@ref: src/shared/messages/types.ts
- [ ] handleRequestTranslation()のcatchブロックを拡張
- [ ] TranslationEngineでキャッチされなかったエラーの場合、TRANSLATION_ERRORメッセージを送信
- [ ] タブIDを取得してcontent scriptに通知を送信
- [ ] エラーレスポンスも従来通りsendResponse()で返す（後方互換性維持）

#### sub3 Content Script側でエラー通知の受信処理
@target: src/content/contentScript.ts
@ref: src/content/progressNotification.ts
- [ ] handleMessageメソッドにMessageType.TRANSLATION_ERRORケースを追加
- [ ] TranslationErrorMessageのpayloadからエラー情報を取得
- [ ] progressNotification.error()を呼び出してエラー表示
- [ ] ログ出力してデバッグ情報を記録

#### TDD手順（Red-Green-Refactor）

##### Red: テストコード作成
1. tests/unit/background/messageHandler.test.tsを開く
2. TRANSLATION_ERRORメッセージ送信のテストケースを追加（失敗を確認）
3. tests/unit/content/contentScript.test.tsを開く
4. TRANSLATION_ERRORメッセージ受信のテストケースを追加（失敗を確認）

##### Green: 最小限の実装
1. src/background/messageHandler.tsのhandleRequestTranslation()にエラー通知送信を追加
2. browser.tabs.sendMessageをモックしてテストがパスすることを確認
3. src/content/contentScript.tsのhandleMessageにTRANSLATION_ERRORケースを追加
4. すべてのテストがパスすることを確認

##### Refactor: リファクタリング
1. エラーメッセージの統一（ユーザーフレンドリーなメッセージ）
2. エラーコードの定数化
3. ログ出力の充実化
4. 型安全性の向上

#### テストケース一覧

##### 正常系（エラーハンドリングの正常動作）
@target: tests/unit/background/messageHandler.test.ts
- [ ] translateBatch()がエラーをthrowした場合、TRANSLATION_ERRORメッセージが送信される
  - mockEngine.translateBatch()がrejectする
  - browser.tabs.sendMessageが正しいpayloadで呼ばれることを確認
  - payload: { error: string, code?: string }
  - sendResponseもエラーレスポンスで呼ばれることを確認
- [ ] タブIDが正しく取得されてメッセージが送信される
  - sender.tab.idが使用されることを確認

@target: tests/unit/content/contentScript.test.ts
- [ ] TRANSLATION_ERRORメッセージ受信時にprogressNotification.error()が呼び出される
  - payload: { error: 'API Error', code: 'RATE_LIMIT' }
  - error()の引数が正しいことを確認
  - sendResponseが{ success: true }で呼ばれることを確認
- [ ] エラーログが出力される
  - logger.errorが呼ばれることを確認

##### 異常系
@target: tests/unit/background/messageHandler.test.ts
- [ ] sender.tabが存在しない場合
  - メッセージ送信がスキップされる
  - エラーログが出力される
  - sendResponseは通常通りエラーレスポンスを返す
- [ ] browser.tabs.sendMessageが失敗する場合
  - エラーログが出力される
  - sendResponseは通常通りエラーレスポンスを返す（後方互換性）

@target: tests/unit/content/contentScript.test.ts
- [ ] TRANSLATION_ERRORメッセージにpayloadが無い場合
  - エラーハンドリングが正しく動作することを確認
  - デフォルトのエラーメッセージが表示される

##### 境界値
@target: tests/unit/background/messageHandler.test.ts
- [ ] エラーメッセージが非常に長い場合（1000文字以上）
  - メッセージが正しく送信されることを確認
- [ ] エラーコードが空文字列の場合
  - payload: { error: 'Error', code: '' }
  - 正しく処理されることを確認

#### モック/スタブ定義

##### browser.tabs.sendMessageのモック
```typescript
// tests/unit/background/messageHandler.test.ts
const mockSendMessage = jest.fn();
global.browser = {
  tabs: {
    sendMessage: mockSendMessage,
  },
} as any;

// または
jest.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(undefined);
```

##### TranslationEngineのエラーモック
```typescript
// tests/unit/background/messageHandler.test.ts
mockEngine.translateBatch = jest.fn().mockRejectedValue(
  new Error('API rate limit exceeded')
);
```

##### ProgressNotificationのモック
```typescript
// tests/unit/content/contentScript.test.ts
const mockProgressNotification = {
  show: jest.fn(),
  update: jest.fn(),
  complete: jest.fn(),
  error: jest.fn(),
  remove: jest.fn(),
};
```

#### 動作検証項目

##### 統合テスト（手動確認）
- [ ] API keyが無効な場合、エラーメッセージが進捗通知に表示される
- [ ] ネットワークエラー時、エラーメッセージが進捗通知に表示される
- [ ] エラーメッセージは自動で消えず、×ボタンクリックで消える
- [ ] エラー表示中も他の機能（選択範囲翻訳など）が使える

##### ユニットテスト実行
- [ ] `npm test -- messageHandler.test.ts`でテストがすべてパスする
- [ ] `npm test -- contentScript.test.ts`でテストがすべてパスする
- [ ] カバレッジが80%以上であることを確認

#### テスト実行コマンド

```bash
# MessageHandlerのテスト
npm test -- tests/unit/background/messageHandler.test.ts

# ContentScriptのテスト
npm test -- tests/unit/content/contentScript.test.ts

# 両方まとめて実行
npm test -- --testNamePattern="TRANSLATION_ERROR"

# ウォッチモード
npm test -- --watch tests/unit/background/messageHandler.test.ts

# カバレッジ付き
npm test -- --coverage tests/unit/background/messageHandler.test.ts tests/unit/content/contentScript.test.ts
```

---

### process6 メッセージング型定義拡張

#### sub1 既存のTRANSLATION_PROGRESSメッセージ型の確認
@target: src/shared/messages/types.ts
- [ ] TranslationProgressMessageインターフェースが正しく定義されているか確認
- [ ] payload構造: { current: number, total: number, percentage: number }
- [ ] MessageType列挙型にTRANSLATION_PROGRESSが含まれているか確認
- [ ] Message Union型にTranslationProgressMessageが含まれているか確認

#### sub2 TRANSLATION_ERRORメッセージ型の確認と拡張
@target: src/shared/messages/types.ts
- [ ] TranslationErrorMessageインターフェースが正しく定義されているか確認
- [ ] payload構造: { error: string, code?: string }
- [ ] MessageType列挙型にTRANSLATION_ERRORが含まれているか確認
- [ ] Message Union型にTranslationErrorMessageが含まれているか確認
- [ ] 必要に応じてJSDocコメントを追加（エラーコードの例など）

#### sub3 型安全性の検証
@target: tests/unit/shared/messages/types.test.ts（新規作成の可能性）
- [ ] TranslationProgressMessageの型チェックテストを追加
- [ ] TranslationErrorMessageの型チェックテストを追加
- [ ] payloadプロパティの型制約が正しく機能することを確認
- [ ] MessageListener型がすべてのメッセージタイプで動作することを確認

#### TDD手順（Red-Green-Refactor）

##### Red: テストコード作成
1. tests/unit/shared/messages/types.test.tsを作成（存在しない場合）
2. TranslationProgressMessage/TranslationErrorMessageの型チェックテストを追加
3. テスト実行（型定義が不完全な場合は失敗）

##### Green: 最小限の実装
1. src/shared/messages/types.tsでTranslationProgressMessage/TranslationErrorMessageが正しく定義されていることを確認
2. MessageType enumにTRANSLATION_PROGRESS/TRANSLATION_ERRORが含まれることを確認
3. Message Union型に両メッセージタイプが含まれることを確認
4. テストがすべてパスすることを確認

##### Refactor: リファクタリング
1. JSDocコメントの追加・充実化
2. エラーコードの例をJSDocに追加
3. 型定義の整理と統一
4. 使用例のコードスニペット追加

#### テストケース一覧

##### 正常系（型定義の検証）
@target: tests/unit/shared/messages/types.test.ts
- [ ] TranslationProgressMessageが正しく定義されている
  - type: MessageType.TRANSLATION_PROGRESS
  - payload: { current: number, total: number, percentage: number }
  - すべてのプロパティが必須であることを確認
- [ ] TranslationErrorMessageが正しく定義されている
  - type: MessageType.TRANSLATION_ERROR
  - payload: { error: string, code?: string }
  - errorは必須、codeはオプショナルであることを確認
- [ ] Message Union型に両メッセージタイプが含まれる
  - TranslationProgressMessageがMessageに代入可能
  - TranslationErrorMessageがMessageに代入可能

##### 異常系（型エラーの検証）
@target: tests/unit/shared/messages/types.test.ts
- [ ] TranslationProgressMessageのpayloadが不正な型の場合、TypeScriptコンパイルエラーになる
  - payload: { current: string, ... } → エラー
  - payload: { current: number } → エラー（totalが無い）
- [ ] TranslationErrorMessageのpayloadが不正な型の場合、TypeScriptコンパイルエラーになる
  - payload: { error: number, ... } → エラー
  - payload: {} → エラー（errorが無い）

##### 境界値
@target: tests/unit/shared/messages/types.test.ts
- [ ] TranslationProgressMessageのpercentageが0の場合
  - payload: { current: 0, total: 10, percentage: 0 } → 正常
- [ ] TranslationProgressMessageのpercentageが100の場合
  - payload: { current: 10, total: 10, percentage: 100 } → 正常
- [ ] TranslationErrorMessageのcodeが空文字列の場合
  - payload: { error: 'Error', code: '' } → 正常
- [ ] TranslationErrorMessageのcodeがundefinedの場合
  - payload: { error: 'Error' } → 正常（オプショナル）

#### モック/スタブ定義

このプロセスでは型定義の検証が主な目的なので、モック/スタブは不要です。
TypeScriptのコンパイルタイムチェックとランタイムの型アサーションを使用します。

```typescript
// tests/unit/shared/messages/types.test.ts
import { MessageType, TranslationProgressMessage, TranslationErrorMessage, Message } from '@shared/messages/types';

// 型チェックのヘルパー関数
function assertType<T>(value: T): void {
  // コンパイル時の型チェックのみ
}

// 型制約の検証
function expectTypeError<T>(value: T): void {
  // @ts-expect-error で期待されるエラーを検証
}
```

#### 動作検証項目

##### コンパイル時チェック
- [ ] src/shared/messages/types.tsがTypeScriptコンパイルエラーなくビルドできる
- [ ] TranslationProgressMessage/TranslationErrorMessageを使用する全てのファイルがコンパイルできる
- [ ] 型推論が正しく動作する（IDEでの補完が機能する）

##### ランタイムチェック
- [ ] 型定義がランタイムでも正しく機能する（オプショナルプロパティの扱いなど）
- [ ] JSDocコメントがIDEで表示される

##### ユニットテスト実行
- [ ] `npm test -- types.test.ts`でテストがすべてパスする
- [ ] `npm run build`でビルドエラーが発生しない
- [ ] `npm run lint`でlintエラーが発生しない

#### テスト実行コマンド

```bash
# 型定義のテスト
npm test -- tests/unit/shared/messages/types.test.ts

# TypeScriptコンパイルチェック
npm run build

# 型チェックのみ
npx tsc --noEmit

# Lint実行
npm run lint

# ウォッチモード
npm test -- --watch tests/unit/shared/messages/types.test.ts

# 全sharedテスト実行
npm test -- tests/unit/shared/
```

#### 補足: 型定義テストの実装例

```typescript
// tests/unit/shared/messages/types.test.ts
import { MessageType, TranslationProgressMessage, TranslationErrorMessage, Message } from '../../../src/shared/messages/types';

describe('Message Type Definitions', () => {
  describe('TranslationProgressMessage', () => {
    it('should accept valid progress message', () => {
      const message: TranslationProgressMessage = {
        type: MessageType.TRANSLATION_PROGRESS,
        payload: {
          current: 5,
          total: 10,
          percentage: 50,
        },
      };

      expect(message.type).toBe(MessageType.TRANSLATION_PROGRESS);
      expect(message.payload.current).toBe(5);
      expect(message.payload.total).toBe(10);
      expect(message.payload.percentage).toBe(50);
    });

    it('should be assignable to Message union type', () => {
      const progressMessage: TranslationProgressMessage = {
        type: MessageType.TRANSLATION_PROGRESS,
        payload: { current: 1, total: 10, percentage: 10 },
      };

      const message: Message = progressMessage; // Should compile
      expect(message.type).toBe(MessageType.TRANSLATION_PROGRESS);
    });
  });

  describe('TranslationErrorMessage', () => {
    it('should accept valid error message with code', () => {
      const message: TranslationErrorMessage = {
        type: MessageType.TRANSLATION_ERROR,
        payload: {
          error: 'API Error',
          code: 'RATE_LIMIT',
        },
      };

      expect(message.type).toBe(MessageType.TRANSLATION_ERROR);
      expect(message.payload.error).toBe('API Error');
      expect(message.payload.code).toBe('RATE_LIMIT');
    });

    it('should accept valid error message without code', () => {
      const message: TranslationErrorMessage = {
        type: MessageType.TRANSLATION_ERROR,
        payload: {
          error: 'Unknown error',
        },
      };

      expect(message.type).toBe(MessageType.TRANSLATION_ERROR);
      expect(message.payload.error).toBe('Unknown error');
      expect(message.payload.code).toBeUndefined();
    });
  });
});
```

---

### process10 ユニットテスト

#### sub1 ProgressNotificationのテスト
@target: tests/unit/content/progressNotification.test.ts
- [ ] show()メソッドのテスト
  - 通知要素が正しく作成されることを確認
  - 初期状態（current: 0, total）が正しく表示されることを確認
  - DOMに追加されることを確認
- [ ] update()メソッドのテスト
  - 進捗状態（current, total, percentage）が正しく更新されることを確認
  - プログレスバーの幅が正しく計算されることを確認（percentage値に基づく）
  - テキスト表示が正しく更新されることを確認
- [ ] complete()メソッドのテスト
  - 完了メッセージが表示されることを確認
  - 一定時間後に自動的に削除されることを確認（setTimeout/setTimeoutのモック）
  - 完了状態のスタイルが適用されることを確認
- [ ] error()メソッドのテスト
  - エラーメッセージが表示されることを確認
  - エラー状態のスタイルが適用されることを確認（赤色など）
  - 一定時間後に自動的に削除されることを確認
- [ ] remove()メソッドのテスト
  - 通知要素がDOMから削除されることを確認
  - タイマーがクリアされることを確認（clearTimeoutのモック）
- [ ] ダークモード対応のテスト
  - matchMediaのモックを使用してダークモードを検証
  - ダークモード時の適切なスタイル適用を確認

#### sub2 TranslationEngineのコールバック機能テスト
@target: tests/unit/background/translationEngine.test.ts
@ref: src/background/translationEngine.ts
- [ ] translateBatch()のonProgressコールバックテスト
  - バッチ処理の各ステップでonProgressが呼び出されることを確認
  - 正しい進捗データ（current, total, percentage）が渡されることを確認
  - コールバックが複数回呼び出されることを確認（バッチサイズに応じて）
- [ ] 進捗計算の正確性テスト
  - 100個のテキストを10個ずつのバッチで処理する場合の進捗計算を検証
  - percentageが0%から100%まで正しく増加することを確認
- [ ] エラー発生時のonProgressコールバックテスト
  - エラー発生時もonProgressが適切に呼び出されることを確認
  - エラー情報が正しく伝達されることを確認

#### sub3 MessageHandlerの進捗メッセージ送信テスト
@target: tests/unit/background/messageHandler.test.ts
@ref: src/background/messageHandler.ts
- [ ] handleRequestTranslation()内の進捗コールバックテスト
  - TranslationEngineのonProgressコールバックが設定されることを確認
  - コールバック内でbrowser.tabs.sendMessageが呼び出されることを確認
  - 送信されるメッセージがTranslationProgressMessage型に適合することを確認
  - 正しいタブIDにメッセージが送信されることを確認
- [ ] エラー通知送信のテスト
  - TranslationEngine内でエラー発生時にTRANSLATION_ERRORメッセージが送信されることを確認
  - MessageHandler内でエラー発生時にTRANSLATION_ERRORメッセージが送信されることを確認
  - エラーメッセージとコードが正しくpayloadに含まれることを確認

#### sub4 ContentScriptの進捗メッセージ処理テスト
@target: tests/unit/content/contentScript.test.ts
@ref: src/content/contentScript.ts
- [ ] handleMessage()のTRANSLATION_PROGRESSケーステスト
  - TRANSLATION_PROGRESSメッセージ受信時にprogressNotification.update()が呼び出されることを確認
  - 正しい進捗データがupdate()に渡されることを確認
  - 成功レスポンスが返されることを確認
- [ ] handleMessage()のTRANSLATION_ERRORケーステスト
  - TRANSLATION_ERRORメッセージ受信時にprogressNotification.error()が呼び出されることを確認
  - エラーメッセージが正しく表示されることを確認
  - エラーログが出力されることを確認
- [ ] translatePage()の進捗通知統合テスト
  - 翻訳開始時にprogressNotification.show()が呼び出されることを確認
  - 翻訳成功時にprogressNotification.complete()が呼び出されることを確認
  - 翻訳エラー時にprogressNotification.error()が呼び出されることを確認
- [ ] cleanup()でのprogressNotification.remove()テスト
  - cleanup()呼び出し時にprogressNotification.remove()が実行されることを確認

---

### process50 フォローアップ

#### sub1 仕様変更の余地
@target: N/A（将来の仕様変更用プレースホルダー）
- [ ] ユーザーフィードバックに基づく進捗通知UIの改善
  - 通知の位置調整（画面の別の場所に配置する要望）
  - 通知のサイズ調整（小さすぎる/大きすぎる）
  - アニメーション効果の追加/削除
- [ ] 進捗通知の表示/非表示オプション追加
  - ユーザー設定で進捗通知をオフにできる機能
  - 進捗通知の表示時間のカスタマイズ
- [ ] より詳細な進捗情報の表示
  - 現在処理中のバッチ番号
  - 推定残り時間の表示
  - 翻訳速度の表示（文字数/秒）
- [ ] パフォーマンス最適化
  - 進捗メッセージの送信頻度の調整（デバウンス/スロットル）
  - 大量のテキスト翻訳時のメモリ使用量の最適化

#### sub2 A/Bテストの可能性
@target: N/A（将来の実験用プレースホルダー）
- [ ] 進捗通知のデザインパターンA/Bテスト
  - パターンA: 現在の実装（プログレスバー + パーセンテージ）
  - パターンB: スピナー + メッセージのみ
  - パターンC: トースト通知スタイル
- [ ] メッセージ送信頻度の最適化テスト
  - 頻度A: 毎バッチ（現在の実装）
  - 頻度B: 10%進捗ごと
  - 頻度C: 5秒ごと（時間ベース）

---

### process100 リファクタリング

#### sub1 共通UI パターンの抽出
@target: src/content/baseNotification.ts（新規作成の可能性）
@ref: src/content/floatingUI.ts, src/content/progressNotification.ts
- [ ] FloatingUIとProgressNotificationの共通部分を抽出
  - ダークモード検出ロジックの共通化
  - DOM要素作成パターンの共通化
  - 位置計算ロジックの共通化（必要に応じて）
- [ ] BaseNotificationクラスの作成
  - 共通メソッド: createElement(), applyDarkMode(), remove()
  - 共通プロパティ: container, isDarkMode
  - 継承クラス: FloatingUI, ProgressNotificationが継承
- [ ] 各UIクラスのリファクタリング
  - FloatingUIをBaseNotificationを継承するように変更
  - ProgressNotificationをBaseNotificationを継承するように変更
  - 重複コードの削除

#### sub2 メッセージ送信頻度の最適化
@target: src/background/translationEngine.ts
@ref: src/shared/utils/debounce.ts（新規作成の可能性）
- [ ] デバウンス/スロットルユーティリティの実装
  - 進捗メッセージ送信の頻度制限関数を作成
  - 最小間隔（例: 100ms）を設定して過度なメッセージ送信を防ぐ
- [ ] TranslationEngineでのデバウンス適用
  - onProgressコールバック内でデバウンス関数を使用
  - 最後の進捗（100%）は必ず送信されるように保証
- [ ] パフォーマンステスト
  - 大量のテキスト（1000+）翻訳時のメッセージ送信頻度を測定
  - メモリ使用量とCPU使用率の改善を検証

#### sub3 型定義の統一と整理
@target: src/shared/messages/types.ts
- [ ] 進捗関連型の整理
  - ProgressData型の定義を明確化
  - TranslationProgressMessage, TranslationErrorMessageの型定義を整理
- [ ] JSDocコメントの充実化
  - 各メッセージタイプの使用例を追加
  - payload構造の詳細説明を追加
  - エラーコードの一覧と説明を追加（必要に応じて）

#### sub4 エラーハンドリングの統一
@target: src/shared/errors/translationErrors.ts（新規作成の可能性）
@ref: src/background/translationEngine.ts, src/background/messageHandler.ts
- [ ] カスタムエラークラスの作成
  - TranslationError基底クラス
  - NetworkError, APIError, ValidationErrorなどの派生クラス
  - エラーコードの定数定義
- [ ] エラーハンドリングの統一
  - TranslationEngineでカスタムエラーを使用
  - MessageHandlerでカスタムエラーを使用
  - エラーメッセージの多言語化（必要に応じて）

---

### process200 ドキュメンテーション

#### sub1 CLAUDE.mdの更新
@target: CLAUDE.md
- [ ] Content Script Featuresセクションに進捗通知機能を追加
  - "Progress notification during page translation"を追記
  - リアルタイムの進捗表示機能の説明を追加
- [ ] Messaging Architectureセクションの更新
  - TRANSLATION_PROGRESSメッセージタイプの説明を追加
  - TRANSLATION_ERRORメッセージタイプの説明を追加
  - メッセージフローの図解を追加（必要に応じて）
- [ ] Adding New Message Typesセクションの具体例追加
  - TranslationProgressMessageを例として追加
  - onProgressコールバックパターンの説明を追加

#### sub2 JSDocコメントの追加
@target: src/content/progressNotification.ts
- [ ] クラスレベルのJSDoc
  - ProgressNotificationクラスの目的と使用方法を説明
  - 使用例のコードスニペットを追加
  - ダークモード対応の説明を追加
- [ ] メソッドレベルのJSDoc
  - show(): 初期表示時のパラメータと動作を説明
  - update(): 進捗更新時のパラメータと動作を説明
  - complete(): 完了時の動作と自動削除タイミングを説明
  - error(): エラー時のパラメータと表示方法を説明
  - remove(): 削除時の動作とタイマークリアを説明

#### sub3 TranslationEngineのJSDocコメント更新
@target: src/background/translationEngine.ts
- [ ] translateBatch()メソッドのJSDoc更新
  - onProgressコールバックパラメータの説明を追加
  - コールバックの呼び出しタイミングを説明
  - 使用例のコードスニペットを追加

#### sub4 MessageHandlerのJSDocコメント更新
@target: src/background/messageHandler.ts
- [ ] handleRequestTranslation()メソッドのJSDoc更新
  - 進捗メッセージ送信の仕組みを説明
  - エラーハンドリングの動作を説明
  - タブIDの取得方法を説明

#### sub5 ContentScriptのJSDocコメント更新
@target: src/content/contentScript.ts
- [ ] handleMessage()メソッドのJSDoc更新
  - TRANSLATION_PROGRESSケースの説明を追加
  - TRANSLATION_ERRORケースの説明を追加
- [ ] translatePage()メソッドのJSDoc更新
  - 進捗通知の統合方法を説明
  - 初期化、更新、完了/エラーのフローを説明

#### sub6 README.mdの更新（必要に応じて）
@target: README.md（存在する場合）
- [ ] 機能一覧に進捗通知機能を追加
- [ ] スクリーンショットの追加（進捗通知のUI）
- [ ] ユーザーガイドの更新
  - 進捗通知の動作説明
  - 翻訳中の画面イメージ

#### sub7 アーキテクチャ図の更新（必要に応じて）
@target: docs/architecture.md または ARCHITECTURE.md（存在する場合）
- [ ] メッセージフロー図の更新
  - TRANSLATION_PROGRESSメッセージのフローを追加
  - TRANSLATION_ERRORメッセージのフローを追加
- [ ] コンポーネント図の更新
  - ProgressNotificationコンポーネントを追加
  - TranslationEngineとContentScript間の進捗通知フローを図示

