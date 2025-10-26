# title: テキスト選択翻訳機能の修正と拡張機能アイコン表示対応

## 概要
- テキスト選択時にマウスカーソル近くに拡張機能アイコンを表示し、クリックするとPopup画面に翻訳結果を表示する機能を実装する
- 既存のfeat/update-architectureブランチに実装されているが動作していない選択翻訳機能を修正する

### goal
- ユーザーがWebページ上でテキストを選択すると、選択位置近くに拡張機能アイコンが表示される
- アイコンをクリックすると、選択テキストが翻訳され、ブラウザ拡張のPopup画面（popup.html）に結果が表示される
- 既存のFloatingUI方式と共存し、ユーザーが選択できるようにする

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- TypeScript型定義を厳密に守り、型安全性を確保すること
- 既存のメッセージングアーキテクチャ（MessageBus、MessageType enum）を使用すること
- XSS対策として `textContent` を使用し、`innerHTML` は使用しない
- ブラウザ互換性（Firefox manifest v2 & Chrome manifest v3）を維持すること

## 開発のゴール
- IconBadge コンポーネントを実装し、選択テキスト近くにアイコンを表示
- Popup UI に選択翻訳結果表示コンポーネントを追加
- Content Script と Popup 間の双方向メッセージング実装
- キーボードショートカット設定の不整合（Alt+Y vs Alt+Shift+T）を修正
- 既存のページ翻訳機能、FloatingUI機能との共存を保証

## 実装仕様

### アーキテクチャ概要

#### コンポーネント構成
```
[Content Script Layer]
├── IconBadge (新規)
│   ├── 選択位置近くにアイコン表示
│   ├── z-index: 10002 (最前面)
│   └── クリックイベント処理
├── SelectionHandler (修正)
│   ├── IconBadge表示統合
│   ├── 翻訳完了後のPopup通知
│   └── 競合防止フラグ追加
├── FloatingUI (既存・維持)
│   └── 翻訳結果の直接表示（オプション）
└── ContentScript (修正)
    └── IconBadge ライフサイクル管理

[Popup UI Layer]
├── useSelectionTranslation (新規フック)
│   ├── browser.runtime.onMessage リスナー
│   └── 翻訳結果の状態管理
├── SelectionResult (新規コンポーネント)
│   ├── 選択テキスト表示
│   ├── 翻訳結果表示
│   └── Copy/クリアボタン
└── App.tsx (修正)
    └── SelectionResult コンポーネント配置
```

#### メッセージフロー
```
1. User selects text
   ↓
2. SelectionHandler.handleMouseUp() (10ms delay)
   ↓
3. IconBadge.show(position, onClick)
   ↓
4. User clicks IconBadge
   ↓
5. onClick() → SelectionHandler.translateSelection()
   ↓
6. MessageBus.send(REQUEST_TRANSLATION) → Background
   ↓
7. Background: MessageHandler → TranslationEngine → API
   ↓
8. Response → Content: translation result
   ↓
9. MessageBus.send(SELECTION_TRANSLATED) → Popup
   ↓
10. Popup: useSelectionTranslation receives message
   ↓
11. SelectionResult component displays translation
```

#### 新規メッセージタイプ
```typescript
// src/shared/messages/types.ts
export enum MessageType {
  // ... 既存
  SELECTION_TRANSLATED = 'selectionTranslated',  // 新規
}

export interface SelectionTranslatedMessage extends BaseMessage {
  type: MessageType.SELECTION_TRANSLATED;
  payload: {
    originalText: string;
    translatedText: string;
    targetLanguage: string;
    timestamp: number;
  };
}
```

### 技術仕様

#### Z-index レイヤリング
```
IconBadge:           10002  // 選択アイコン（最前面）
ProgressNotification: 10001  // 翻訳進捗
FloatingUI:           10000  // 翻訳結果フローティング
```

#### パフォーマンス
- IconBadge DOM操作: < 1ms/selection（影響なし）
- 競合防止: `isTranslating` フラグで重複翻訳を防止
- メモリ管理: `cleanup()` で確実にDOM要素削除

#### セキュリティ
- XSS対策: `textContent` のみ使用（`innerHTML` 禁止）
- CSP準拠: inline styles は許可（Firefox/Chrome デフォルト）

## 生成AIの学習用コンテキスト

### 既存実装ファイル
- `src/content/selectionHandler.ts`
  - 選択検出とmouseupイベント処理
  - translateSelection() メソッド
- `src/content/floatingUI.ts`
  - フローティングUI表示ロジック
  - 位置計算とビューポート調整
- `src/content/contentScript.ts`
  - Content Scriptのメインオーケストレーター
  - メッセージハンドリング
- `src/popup/App.tsx`
  - Popup UIのルートコンポーネント
- `src/popup/hooks/useTranslation.ts`
  - ページ翻訳の状態管理フック

### 設定ファイル
- `public/manifest.v2.json` (Firefox)
  - キーボードショートカット: Alt+Y
- `src/shared/constants/config.ts`
  - キーボードショートカット: Alt+Shift+T（不整合あり）
  - UI_CONFIG.FLOATING_UI_OFFSET: 10

### メッセージング
- `src/shared/messages/types.ts`
  - MessageType enum定義
  - 各種メッセージインターフェース
- `src/shared/messages/MessageBus.ts`
  - メッセージ送受信の抽象化レイヤー

## Process

### process1 新規メッセージタイプ定義
@target: `src/shared/messages/types.ts`
@ref: `src/shared/messages/types.ts` (既存のメッセージ定義)

- [x] `MessageType.SELECTION_TRANSLATED` を enum に追加
- [x] `SelectionTranslatedMessage` インターフェース定義
  - originalText, translatedText, targetLanguage, timestamp を含む
- [x] `Message` Union型に `SelectionTranslatedMessage` を追加
- [x] JSDocコメント追加（使用例と目的を記述）

### process2 IconBadge コンポーネント実装
@target: `src/content/iconBadge.ts` (新規作成)
@ref: `src/content/floatingUI.ts` (位置計算ロジック参考)

#### sub2-1 IconBadge クラス基本実装
- [ ] IconBadge クラス作成
  - `show(position: Position, onClick: () => void): void`
  - `hide(): void`
  - `private createBadgeElement(): HTMLElement`
  - `private positionElement(position: Position): void`
  - `private handleClick(): void`
- [ ] Position インターフェース定義（既存と互換性確保）
- [ ] logger, UI_CONFIG のインポート

#### sub2-2 スタイリング実装
- [ ] CSS-in-JS でバッジスタイル定義
  - position: 'fixed', zIndex: '10002'
  - width/height: 32px, borderRadius: 50%
  - backgroundColor: '#4F46E5', color: 'white'
  - boxShadow, transition 追加
- [ ] ダークモード対応
  - window.matchMedia('(prefers-color-scheme: dark)') で検出
  - ダークモード時の配色調整

#### sub2-3 位置計算とビューポート調整
- [ ] positionElement() 実装
  - オフセット適用（UI_CONFIG.FLOATING_UI_OFFSET）
  - ビューポート境界チェック
  - 右端・下端からはみ出さないよう調整
- [ ] 負の座標値の防止（Math.max(0, x/y)）

#### sub2-4 イベント処理
- [ ] handleClick() 実装
  - onClick コールバック実行
  - クリック後に自動的に hide()
- [ ] addEventListener/removeEventListener の適切な管理

### process3 SelectionHandler への IconBadge 統合
@target: `src/content/selectionHandler.ts`
@ref: `src/content/iconBadge.ts`

#### sub3-1 IconBadge インスタンス管理
- [ ] IconBadge インスタンスをプライベートフィールドに追加
- [ ] constructor で IconBadge を初期化
- [ ] cleanup/disable メソッドで IconBadge.hide() を呼び出し

#### sub3-2 handleMouseUp 修正
- [ ] 選択テキスト検出後、IconBadge.show() を呼び出し
- [ ] 選択範囲の getBoundingClientRect() で位置取得
- [ ] onClick コールバックで translateSelection() を実行
  - StorageManager から targetLanguage 取得
  - 翻訳実行
  - 成功時に FloatingUI 表示（既存動作）

#### sub3-3 競合防止機構
- [ ] `isTranslating` フラグをプライベートフィールドに追加
- [ ] translateSelection() 開始時にフラグチェック
  - 既に翻訳中の場合は早期リターン
- [ ] try-finally で確実にフラグをリセット

#### sub3-4 エラーハンドリング強化
- [ ] translateSelection() の catch ブロック修正
  - FloatingUI.showError() を呼び出し（要実装）
  - ユーザーにエラーメッセージを表示

### process4 ContentScript への統合
@target: `src/content/contentScript.ts`
@ref: `src/content/selectionHandler.ts`

- [ ] IconBadge インスタンスをフィールドに追加（不要な場合は省略）
- [ ] translatePage() 開始時に IconBadge.hide() を呼び出し
  - ページ翻訳中に選択翻訳のUIが表示されるのを防止
- [ ] cleanup() メソッドで IconBadge のクリーンアップを確認

### process5 useSelectionTranslation フック実装
@target: `src/popup/hooks/useSelectionTranslation.ts` (新規作成)
@ref: `src/popup/hooks/useTranslation.ts`

#### sub5-1 状態管理
- [ ] SelectionData インターフェース定義
  - originalText, translatedText, targetLanguage, timestamp
- [ ] useState で翻訳データを管理
- [ ] clear() 関数でデータをリセット

#### sub5-2 メッセージリスナー
- [ ] useEffect で browser.runtime.onMessage リスナー登録
- [ ] SELECTION_TRANSLATED メッセージ受信時に状態更新
- [ ] クリーンアップ関数でリスナー削除（メモリリーク防止）

#### sub5-3 戻り値
- [ ] { data, clear } を返すインターフェース定義
- [ ] TypeScript型定義を厳密に

### process6 SelectionResult コンポーネント実装
@target: `src/popup/components/SelectionResult.tsx` (新規作成)
@ref: `src/popup/components/StatusIndicator.tsx`

#### sub6-1 基本構造
- [ ] React.FC でコンポーネント定義
- [ ] useSelectionTranslation フックを使用
- [ ] 翻訳データがない場合は null を返す（非表示）

#### sub6-2 UI構成
- [ ] 選択テキスト表示エリア
  - ラベル: "選択テキスト"
  - テキスト表示（scrollable）
- [ ] 翻訳結果表示エリア
  - ラベル: "翻訳結果"
  - テキスト表示（scrollable）
- [ ] アクションボタン
  - Copy ボタン（navigator.clipboard.writeText）
  - クリアボタン（clear() 呼び出し）

#### sub6-3 スタイリング
- [ ] CSS クラス名: `.selection-result-container`
- [ ] フレックスボックスレイアウト
- [ ] ダークモード対応クラス
- [ ] アニメーション（フェードイン）

### process7 App.tsx への SelectionResult 統合
@target: `src/popup/App.tsx`
@ref: `src/popup/components/SelectionResult.tsx`

- [ ] SelectionResult コンポーネントをインポート
- [ ] JSX に `<SelectionResult />` を追加
  - 配置位置: StatusIndicator の下
- [ ] 条件付きレンダリング不要（コンポーネント内で制御）

### process8 Popup CSS 拡張
@target: `src/styles/popup.css`
@ref: `src/popup/components/SelectionResult.tsx`

#### sub8-1 SelectionResult スタイル
- [ ] `.selection-result-container` スタイル定義
  - margin, padding, border
  - backgroundColor, borderRadius
- [ ] `.original-text`, `.translated-text` スタイル
  - fontSize, lineHeight, wordBreak
  - maxHeight, overflow-y: auto
- [ ] `.selection-actions` ボタンスタイル
  - Copy/Clear ボタンのスタイリング

#### sub8-2 ダークモード対応
- [ ] `@media (prefers-color-scheme: dark)` でスタイル追加
- [ ] 既存のダークモードスタイルと統一感を確保

#### sub8-3 アニメーション
- [ ] `@keyframes fadeIn` 定義
- [ ] SelectionResult の表示時にアニメーション適用

### process9 キーボードショートカット統一
@target: `src/shared/constants/config.ts`
@ref: `public/manifest.v2.json`

- [ ] `KEYBOARD_SHORTCUTS.TRANSLATE_SELECTION` を `'Alt+Y'` に変更
  - 現在: 'Alt+Shift+T'
  - 修正後: 'Alt+Y'（manifest.json と統一）
- [ ] コメント追加（manifest.json と同期することを明記）

### process10 ユニットテスト

#### sub10-1 IconBadge テスト
@target: `tests/unit/content/iconBadge.test.ts` (新規作成)
@ref: `src/content/iconBadge.ts`

- [ ] IconBadge.show() テスト
  - 正しい位置にバッジが表示されるか
  - オフセットが適用されているか
- [ ] IconBadge.hide() テスト
  - DOM要素が削除されるか
  - 複数回呼び出しても問題ないか
- [ ] IconBadge クリックテスト
  - onClick コールバックが呼ばれるか
  - クリック後に自動的に hide() されるか
- [ ] ビューポート境界テスト
  - 右端・下端でのポジション調整

#### sub10-2 useSelectionTranslation テスト
@target: `tests/unit/popup/hooks/useSelectionTranslation.test.ts` (新規作成)
@ref: `src/popup/hooks/useSelectionTranslation.ts`

- [ ] メッセージリスナー登録テスト
- [ ] SELECTION_TRANSLATED メッセージ受信テスト
  - 状態が正しく更新されるか
- [ ] clear() 関数テスト
  - データがリセットされるか
- [ ] クリーンアップテスト
  - リスナーが削除されるか（メモリリーク防止）

#### sub10-3 SelectionResult コンポーネントテスト
@target: `tests/unit/popup/components/SelectionResult.test.tsx` (新規作成)
@ref: `src/popup/components/SelectionResult.tsx`

- [ ] レンダリングテスト
  - 翻訳データがある場合に表示されるか
  - 翻訳データがない場合に非表示か
- [ ] Copy ボタンテスト
  - navigator.clipboard.writeText が呼ばれるか
- [ ] クリアボタンテスト
  - clear() が呼ばれるか

#### sub10-4 SelectionHandler テスト更新
@target: `tests/unit/content/selectionHandler.test.ts`
@ref: `src/content/selectionHandler.ts`

- [ ] IconBadge.show() 呼び出しテスト
- [ ] 競合防止フラグ（isTranslating）のテスト
- [ ] エラーハンドリングテスト

### process50 統合テスト

#### sub50-1 E2E フロー検証
@target: `tests/integration/selection-translation.test.ts` (新規作成)

- [ ] テキスト選択 → IconBadge表示 テスト
- [ ] IconBadge クリック → 翻訳実行 テスト
- [ ] 翻訳完了 → Popup表示 テスト
- [ ] 複数回の連続選択テスト（競合防止確認）

#### sub50-2 ブラウザ互換性テスト
- [ ] Firefox での動作確認
  - manifest v2
  - browser.runtime API
- [ ] Chrome での動作確認
  - manifest v3
  - chrome.runtime API

#### sub50-3 エラーケーステスト
- [ ] API失敗時のエラー表示
- [ ] ネットワークエラー時の挙動
- [ ] 翻訳中のページ翻訳開始（競合テスト）

### process100 リファクタリング

#### sub100-1 FloatingUI.showError() 実装
@target: `src/content/floatingUI.ts`

- [ ] showError(errorMessage: string) メソッド追加
- [ ] エラー用のスタイリング（赤背景）
- [ ] 自動非表示タイマー（5秒）

#### sub100-2 コード品質改善
- [ ] ESLint エラー修正
- [ ] TypeScript strict モードエラー修正
- [ ] 不要なコメント削除
- [ ] import 文の整理

### process200 ドキュメンテーション

#### sub200-1 ユーザードキュメント更新
@target: `docs/USER_GUIDE.md`

- [ ] 選択翻訳機能の使い方セクション追加
  - IconBadgeの説明
  - Popup表示の説明
  - FloatingUI との使い分け

#### sub200-2 開発者ドキュメント更新
@target: `ARCHITECTURE.md`

- [ ] IconBadge コンポーネントの説明追加
- [ ] メッセージフロー図更新
- [ ] 依存関係グラフ更新

#### sub200-3 CHANGELOG 更新
@target: `CHANGELOG.md`

- [ ] 新機能: IconBadge選択翻訳
- [ ] 修正: キーボードショートカット統一（Alt+Y）
- [ ] 改善: エラーハンドリング強化

#### sub200-4 README 更新
@target: `README.md`

- [ ] 機能リストに選択翻訳（Popup表示）を追加
- [ ] スクリーンショット追加（可能であれば）

