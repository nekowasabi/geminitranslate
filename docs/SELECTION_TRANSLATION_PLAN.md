# title: テキスト選択翻訳機能の実装

## 概要
Webページ上でテキストを選択すると、マウスカーソル付近に拡張機能のアイコンが表示され、クリックすることでポップアップUI(popup.html)に翻訳結果を表示する機能を実装します。

### goal
- ユーザーがWebページ上のテキストを選択するだけで、瞬時に翻訳アイコンが表示される
- アイコンをクリックすると、拡張機能のPopup UIに翻訳結果が表示される
- 既存のAlt+Y キーボードショートカットでも同じ機能が動作する

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- メッセージングアーキテクチャでは`type`と`action`の両方を必須とする
- Content Script → Background Scriptのメッセージには`action`プロパティが必須
- Background Script → Content Scriptの通知メッセージには`action`不要
- すべての新しいメッセージタイプにはユニットテストを追加すること

## 開発のゴール
- テキスト選択時に翻訳アイコン（IconBadge）を表示
- アイコンクリックで翻訳を実行し、Popup UIに結果を表示
- Popup UIとContent Script間の双方向通信を確立
- キーボードショートカットの不整合を解消（Alt+Y vs Alt+Shift+T）
- 既存の非動作実装を修正し、動作する状態にする

---

## 1. 背景と目的

### 1.1 背景
現在、geminitranslate拡張機能には以下の課題が存在します：

1. **選択翻訳機能が実装されているが動作しない**
   - `SelectionHandler`、`FloatingUI`は存在するが、統合が不完全
   - IconBadge（拡張機能アイコン）の表示機能が未実装
   - Popup UIへの翻訳結果表示が未実装

2. **キーボードショートカットの不整合**
   - `manifest.json`: Alt+Y (translate-selection)
   - `src/shared/constants/config.ts`: Alt+Shift+T (TRANSLATE_SELECTION)
   - 実際の動作が不明瞭

3. **Popup UIとContent Scriptの通信が片方向**
   - Popup → Content Scriptへのメッセージ送信は可能（TRANSLATE_PAGEなど）
   - Content Script → Popupへの翻訳結果送信が未実装

### 1.2 目的
- **UX改善**: テキスト選択から翻訳結果表示までのフローを直感的にする
- **既存機能の完成**: 半実装状態の選択翻訳機能を完全に動作させる
- **アーキテクチャの整合性**: メッセージング仕様に準拠した実装
- **保守性向上**: テストカバレッジの確保とドキュメント整備

---

## 2. 現状分析

### 2.1 既存実装の状態

#### ✅ 実装済みコンポーネント
| コンポーネント | ファイルパス | 実装状態 | 備考 |
|--------------|------------|---------|-----|
| SelectionHandler | `src/content/selectionHandler.ts` | ⚠️ 部分実装 | テキスト選択検出とAPI呼び出しは可能だが、UI連携なし |
| FloatingUI | `src/content/floatingUI.ts` | ⚠️ 部分実装 | UI表示機能はあるが、IconBadge未実装 |
| MessageType定義 | `src/shared/messages/types.ts` | ✅ 完了 | TRANSLATE_SELECTION型は定義済み |
| CommandHandler | `src/background/commandHandler.ts` | ✅ 完了 | Alt+Yショートカット対応済み |
| Popup UI | `src/popup/App.tsx` | ⚠️ 部分実装 | 翻訳結果表示UIはあるが、選択翻訳結果受信なし |

#### ❌ 未実装機能
1. **IconBadge（翻訳アイコン）の表示**
   - 選択時にマウスカーソル付近にアイコンを表示する機能
   - アイコンクリックイベントのハンドリング

2. **Popup UIへの翻訳結果表示**
   - Content ScriptからPopup UIへの結果送信
   - Popup UI側での結果受信とレンダリング

3. **メッセージリスナーの実装**
   - Popup UI側で`TRANSLATE_SELECTION`結果を受信するリスナー
   - `useTranslation` hookへの選択翻訳ステート管理追加

### 2.2 問題点の明確化

#### 問題1: IconBadge未実装
**症状**: テキスト選択時に何も表示されない

**原因**:
- `FloatingUI.ts`には翻訳結果表示のUIはあるが、選択直後に表示するIconBadgeがない
- `SelectionHandler`の`handleMouseUp`メソッドが選択検出後に何もアクションを起こさない

**影響範囲**:
- ユーザーが選択翻訳機能の存在に気づけない
- キーボードショートカット以外の起動手段がない

#### 問題2: Popup UIとの通信欠如
**症状**: 選択翻訳の結果がPopup UIに表示されない

**原因**:
- Content ScriptからPopup UIへのメッセージ送信パスが存在しない
- Popup UI (`App.tsx`, `useTranslation.ts`) に選択翻訳結果を受信するロジックがない
- `chrome.runtime.sendMessage` vs `chrome.tabs.sendMessage`の方向性理解不足

**影響範囲**:
- 翻訳は実行されるが、ユーザーに結果が届かない
- ユーザーエクスペリエンスが著しく損なわれる

#### 問題3: キーボードショートカット不整合
**症状**: 設定ファイルとmanifestでショートカット定義が異なる

**詳細**:
```javascript
// manifest.json
"translate-selection": {
  "suggested_key": { "default": "Alt+Y" }
}

// src/shared/constants/config.ts
KEYBOARD_SHORTCUTS = {
  TRANSLATE_SELECTION: 'Alt+Shift+T'
}
```

**原因**: 開発途中での仕様変更の反映漏れ

**影響範囲**: ドキュメントとコードの不整合、ユーザーの混乱

---

## 3. 要件定義

### 3.1 機能要件

#### FR-1: IconBadge表示
- **要件ID**: FR-1
- **優先度**: 高
- **説明**: テキスト選択時にマウスカーソル付近に翻訳アイコンを表示
- **詳細**:
  - 選択終了後100ms以内にアイコンを表示
  - アイコンは選択範囲の右上または左上に配置（viewport内に収まるよう調整）
  - アイコンサイズ: 32x32px（拡張機能の19px/38pxアイコンを使用）
  - ホバー時にツールチップ「翻訳する」を表示
  - 選択解除時、または他の場所をクリック時にアイコンを非表示

#### FR-2: 翻訳実行とPopup表示
- **要件ID**: FR-2
- **優先度**: 高
- **説明**: IconBadgeクリック時に翻訳を実行し、Popup UIに結果を表示
- **詳細**:
  - アイコンクリック時にBackground ScriptのTranslationEngineを呼び出し
  - 翻訳処理中はPopup UIにローディング表示
  - 翻訳完了後、Popup UIの専用エリアに結果を表示
  - エラー時はPopup UIにエラーメッセージを表示

#### FR-3: キーボードショートカット対応
- **要件ID**: FR-3
- **優先度**: 中
- **説明**: Alt+Yでの選択翻訳を動作させる
- **詳細**:
  - 既存のCommandHandler経由で動作
  - IconBadgeクリックと同じ翻訳フローを使用
  - ショートカット定義を`manifest.json`の`Alt+Y`に統一

#### FR-4: Popup UI更新
- **要件ID**: FR-4
- **優先度**: 高
- **説明**: Popup UIに選択翻訳結果を表示するセクションを追加
- **詳細**:
  - 既存のQuickTranslateコンポーネントと別セクション
  - 「選択翻訳」タブまたはアコーディオン形式で表示
  - 原文と翻訳文を並べて表示
  - コピー機能を提供

### 3.2 非機能要件

#### NFR-1: パフォーマンス
- IconBadge表示レイテンシ: 選択後100ms以内
- 翻訳API呼び出し: 既存のBATCH_CONFIG制約に従う
- UI応答性: Popup表示まで500ms以内（API応答時間を除く）

#### NFR-2: 互換性
- Firefox 58.0以上（manifest.jsonの最小バージョン）
- TypeScript型安全性の維持
- 既存のメッセージング仕様への準拠

#### NFR-3: 保守性
- すべての新規メッセージタイプにユニットテストを追加
- JSDocによる詳細なドキュメンテーション
- CLAUDE.mdのメッセージング規約に準拠

---

## 4. アーキテクチャ設計

### 4.1 システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                        Web Page (DOM)                        │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Content Script (content.js)            │     │
│  │                                                      │     │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │     │
│  │  │SelectionHandler│→│  IconBadge  │  │FloatingUI│ │     │
│  │  │              │  │ (NEW)       │  │          │ │     │
│  │  └──────────────┘  └──────────────┘  └──────────┘ │     │
│  │         ↓                  ↓                        │     │
│  │  ┌─────────────────────────────────────────┐       │     │
│  │  │       ContentScript (Orchestrator)       │       │     │
│  │  └─────────────────────────────────────────┘       │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                             ↕ MessageBus
┌─────────────────────────────────────────────────────────────┐
│           Background Script (background.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │CommandHandler│  │MessageHandler│  │TranslationEngine│   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                             ↕ chrome.runtime.sendMessage
┌─────────────────────────────────────────────────────────────┐
│                  Popup UI (popup.html/App.tsx)              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │QuickTranslate│  │useTranslation│  │SelectionResult  │   │
│  │              │  │ (Enhanced)   │  │ (NEW Component) │   │
│  └──────────────┘  └──────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 データフロー

#### フロー1: IconBadge表示フロー
```
1. User selects text on page
   ↓
2. SelectionHandler.handleMouseUp() detects selection
   ↓
3. SelectionHandler calls IconBadge.show(position)
   ↓
4. IconBadge creates and positions icon element
   ↓
5. Icon rendered near mouse cursor
```

#### フロー2: 翻訳実行フロー（IconBadgeクリック）
```
1. User clicks IconBadge
   ↓
2. IconBadge.handleClick() → SelectionHandler.translateSelection()
   ↓
3. SelectionHandler sends TranslationRequestMessage to Background
   {
     type: MessageType.REQUEST_TRANSLATION,
     action: 'requestTranslation',
     payload: { texts: [selectedText], targetLanguage: 'Japanese' }
   }
   ↓
4. Background MessageHandler routes to TranslationEngine
   ↓
5. TranslationEngine calls OpenRouter API
   ↓
6. Background sends response back to Content Script
   {
     success: true,
     data: { translations: ['翻訳結果'] }
   }
   ↓
7. Content Script sends SelectionTranslationResultMessage to Popup
   {
     type: MessageType.SELECTION_TRANSLATION_RESULT,
     payload: {
       originalText: 'Hello',
       translatedText: 'こんにちは',
       targetLanguage: 'Japanese'
     }
   }
   ↓
8. Popup's useTranslation hook receives message
   ↓
9. Popup renders SelectionResult component with translation
```

#### フロー3: キーボードショートカットフロー（Alt+Y）
```
1. User presses Alt+Y with text selected
   ↓
2. Browser fires 'commands' event
   ↓
3. Background CommandHandler receives 'translate-selection'
   ↓
4. CommandHandler sends SelectionTranslationMessage to active tab
   {
     type: MessageType.TRANSLATE_SELECTION,
     payload: { targetLanguage: 'Japanese' }
   }
   ↓
5. Content Script receives message
   ↓
6. ContentScript calls SelectionHandler.translateSelection()
   ↓
7. (Same as Flow 2, steps 3-9)
```

### 4.3 新規メッセージタイプ定義

#### SELECTION_TRANSLATION_RESULT
```typescript
/**
 * Selection Translation Result Message
 *
 * Content ScriptからPopup UIへ選択翻訳の結果を送信する際に使用。
 * Popupが開いていない場合、メッセージは無視される。
 *
 * **Direction**: Content Script → Popup UI
 * **Trigger**: IconBadgeクリックまたはAlt+Yショートカット後の翻訳完了
 * **Handler**: Popup's useTranslation.useEffect() listener
 *
 * @example
 * ```typescript
 * // Content Script sends result to Popup
 * chrome.runtime.sendMessage({
 *   type: MessageType.SELECTION_TRANSLATION_RESULT,
 *   payload: {
 *     originalText: 'Hello World',
 *     translatedText: 'こんにちは世界',
 *     targetLanguage: 'Japanese',
 *     timestamp: 1704067200000,
 *   },
 * });
 * ```
 */
export interface SelectionTranslationResultMessage extends BaseMessage {
  type: MessageType.SELECTION_TRANSLATION_RESULT;
  payload: {
    /**
     * 選択された原文
     */
    originalText: string;

    /**
     * 翻訳結果
     */
    translatedText: string;

    /**
     * 翻訳先言語
     */
    targetLanguage: string;

    /**
     * 翻訳実行時刻（Unix timestamp）
     */
    timestamp: number;
  };
}
```

### 4.4 コンポーネント責務

#### IconBadge（新規作成）
**ファイル**: `src/content/ui/IconBadge.ts`

**責務**:
- 拡張機能アイコンの表示/非表示管理
- マウスカーソル位置に基づいた配置計算
- viewport境界チェックと位置調整
- クリックイベントの検出とハンドラー呼び出し

**主要メソッド**:
```typescript
class IconBadge {
  show(position: Position, onClickCallback: () => void): void
  hide(): void
  private createIconElement(): HTMLElement
  private positionElement(position: Position): void
  private handleClick(): void
}
```

#### SelectionHandler（拡張）
**既存ファイル**: `src/content/selectionHandler.ts`

**追加責務**:
- IconBadgeのライフサイクル管理
- IconBadgeクリック時の翻訳実行
- Popup UIへの翻訳結果送信

**変更点**:
```typescript
class SelectionHandler {
  private iconBadge: IconBadge | null = null; // NEW

  // 既存メソッド拡張
  private handleMouseUp(event: MouseEvent): void {
    // 既存: 選択検出
    // NEW: IconBadge表示
  }

  // NEW: IconBadgeクリック時のハンドラー
  private async handleIconClick(): Promise<void> {
    const translation = await this.translateSelection(targetLanguage);
    this.sendResultToPopup(translation);
  }

  // NEW: Popup UIへ結果送信
  private sendResultToPopup(translation: string): void {
    chrome.runtime.sendMessage({...});
  }
}
```

#### SelectionResult（新規作成）
**ファイル**: `src/popup/components/SelectionResult.tsx`

**責務**:
- 選択翻訳結果の表示
- 原文/翻訳文の並列表示
- コピー機能の提供

**Props**:
```typescript
interface SelectionResultProps {
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  timestamp: number;
}
```

#### useTranslation（拡張）
**既存ファイル**: `src/popup/hooks/useTranslation.ts`

**追加責務**:
- 選択翻訳結果メッセージのリスニング
- 選択翻訳ステート管理（originalText, translatedText）

**変更点**:
```typescript
export interface TranslationState {
  status: TranslationStatus;
  error: string | null;
  progress: number;
  // NEW: Selection translation result
  selectionResult: {
    originalText: string;
    translatedText: string;
    targetLanguage: string;
    timestamp: number;
  } | null;
}

export function useTranslation(): UseTranslationReturn {
  const [selectionResult, setSelectionResult] = useState(null);

  useEffect(() => {
    // NEW: Listen for selection translation results
    const handleMessage = (message) => {
      if (message.type === MessageType.SELECTION_TRANSLATION_RESULT) {
        setSelectionResult(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, []);

  // ...
}
```

---

## 5. 実装計画

### Phase 1: メッセージタイプ定義とテスト（1-2時間）
**優先度**: 🔴 最高

#### Task 1.1: メッセージタイプ定義
**@target**: `src/shared/messages/types.ts`
**@ref**: `CLAUDE.md` (Messaging Architecture)

- [ ] `SELECTION_TRANSLATION_RESULT`をMessageType enumに追加
- [ ] `SelectionTranslationResultMessage`インターフェースを定義
- [ ] JSDocドキュメントを追加（例を含む）
- [ ] Message union typeに追加

#### Task 1.2: ユニットテスト作成
**@target**: `tests/unit/shared/messages/types.test.ts`

- [ ] `SelectionTranslationResultMessage`の型チェックテスト
- [ ] payloadバリデーションテスト
- [ ] タイムスタンプ形式テスト

**完了基準**:
- ✅ `npm run lint`がエラーなく完了
- ✅ 型定義がCLAUDE.mdの規約に準拠
- ✅ すべてのテストがパス

---

### Phase 2: IconBadge実装（2-3時間）
**優先度**: 🔴 最高

#### Task 2.1: IconBadgeクラス作成
**@target**: `src/content/ui/IconBadge.ts`（新規作成）
**@ref**:
- `src/content/floatingUI.ts`（位置計算ロジック参考）
- `src/shared/constants/config.ts`（UI_CONFIG使用）

**実装内容**:
- [ ] IconBadgeクラスの基本構造作成
- [ ] `show(position, onClickCallback)`メソッド実装
  - 拡張機能アイコン（38px）を使用
  - ツールチップ「翻訳する」を追加
  - クリックイベントリスナー登録
- [ ] `hide()`メソッド実装
  - DOM要素の削除
  - イベントリスナーのクリーンアップ
- [ ] `createIconElement()`プライベートメソッド
  - `<img>`タグで`browser.runtime.getURL('icons/translate-38.png')`を読み込み
  - スタイル適用（position: fixed, zIndex: 10001）
- [ ] `positionElement(position)`プライベートメソッド
  - FloatingUIと同様のviewport境界チェック
  - 選択範囲の右上を基本位置とする
  - 画面外にはみ出す場合は左上または下側に調整

#### Task 2.2: ダークモード対応
**@target**: `src/content/ui/IconBadge.ts`

- [ ] `window.matchMedia('(prefers-color-scheme: dark)')`でダークモード検出
- [ ] ダークモード時はアイコンに白いボーダーを追加（視認性向上）

#### Task 2.3: ユニットテスト
**@target**: `tests/unit/content/ui/IconBadge.test.ts`（新規作成）

- [ ] `show()`メソッドのテスト
  - DOM要素が作成されることを確認
  - 正しい位置に配置されることを確認
- [ ] `hide()`メソッドのテスト
  - DOM要素が削除されることを確認
- [ ] クリックイベントのテスト
  - コールバックが呼ばれることを確認

**完了基準**:
- ✅ IconBadgeが画面に表示される
- ✅ クリック時にコールバックが実行される
- ✅ 画面外にはみ出さない
- ✅ すべてのテストがパス

---

### Phase 3: SelectionHandler拡張（2-3時間）
**優先度**: 🔴 最高

#### Task 3.1: IconBadge統合
**@target**: `src/content/selectionHandler.ts`
**@ref**: `src/content/ui/IconBadge.ts`

- [ ] IconBadgeインスタンスをprivateプロパティとして追加
- [ ] `handleMouseUp()`メソッド拡張
  ```typescript
  private handleMouseUp(event: MouseEvent): void {
    setTimeout(() => {
      const selectedText = this.getSelectedText();
      if (selectedText) {
        // IconBadge表示
        const position = { x: event.clientX, y: event.clientY };
        this.iconBadge.show(position, () => this.handleIconClick());
      } else {
        // 選択解除時はIconBadge非表示
        this.iconBadge?.hide();
      }
    }, 10);
  }
  ```

#### Task 3.2: 翻訳実行とPopup通知
**@target**: `src/content/selectionHandler.ts`

- [ ] `handleIconClick()`メソッド実装
  ```typescript
  private async handleIconClick(): Promise<void> {
    const selectedText = this.getSelectedText();
    if (!selectedText) return;

    const targetLanguage = await this.getTargetLanguage();
    const translation = await this.translateSelection(targetLanguage);

    if (translation) {
      this.sendResultToPopup(selectedText, translation, targetLanguage);
      this.iconBadge?.hide();
    }
  }
  ```

- [ ] `sendResultToPopup()`メソッド実装
  ```typescript
  private sendResultToPopup(
    originalText: string,
    translatedText: string,
    targetLanguage: string
  ): void {
    chrome.runtime.sendMessage({
      type: MessageType.SELECTION_TRANSLATION_RESULT,
      payload: {
        originalText,
        translatedText,
        targetLanguage,
        timestamp: Date.now(),
      },
    });
    logger.log('Selection translation result sent to Popup');
  }
  ```

- [ ] `getTargetLanguage()`ヘルパーメソッド
  ```typescript
  private async getTargetLanguage(): Promise<string> {
    const storageManager = new StorageManager();
    return await storageManager.getTargetLanguage();
  }
  ```

#### Task 3.3: 選択解除時のIconBadge非表示
**@target**: `src/content/selectionHandler.ts`

- [ ] `enable()`メソッドに`mousedown`イベントリスナー追加
  ```typescript
  enable(): void {
    this.mouseUpHandler = this.handleMouseUp.bind(this);
    this.mouseDownHandler = this.handleMouseDown.bind(this);
    document.addEventListener('mouseup', this.mouseUpHandler);
    document.addEventListener('mousedown', this.mouseDownHandler);
  }
  ```

- [ ] `handleMouseDown()`メソッド追加
  ```typescript
  private handleMouseDown(): void {
    // クリック時にIconBadgeを非表示（ただしIconBadge自体のクリックは除外）
    this.iconBadge?.hide();
  }
  ```

#### Task 3.4: ユニットテスト拡張
**@target**: `tests/unit/content/selectionHandler.test.ts`

- [ ] IconBadge表示のテスト
- [ ] IconBadgeクリック時の翻訳実行テスト
- [ ] Popup通知メッセージ送信テスト
- [ ] 選択解除時のIconBadge非表示テスト

**完了基準**:
- ✅ テキスト選択時にIconBadge表示
- ✅ IconBadgeクリックで翻訳実行
- ✅ Popup UIへメッセージ送信
- ✅ すべてのテストがパス

---

### Phase 4: Popup UI実装（3-4時間）
**優先度**: 🔴 最高

#### Task 4.1: SelectionResultコンポーネント作成
**@target**: `src/popup/components/SelectionResult.tsx`（新規作成）
**@ref**: `src/popup/components/QuickTranslate.tsx`（スタイル参考）

**実装内容**:
- [ ] コンポーネント基本構造
  ```tsx
  export const SelectionResult: React.FC<SelectionResultProps> = ({
    originalText,
    translatedText,
    targetLanguage,
    timestamp,
  }) => {
    return (
      <div className="selection-result">
        <div className="result-header">
          <h3>選択翻訳</h3>
          <span className="timestamp">{formatTimestamp(timestamp)}</span>
        </div>

        <div className="result-body">
          <div className="original-text">
            <label>原文</label>
            <p>{originalText}</p>
          </div>

          <div className="translated-text">
            <label>翻訳（{targetLanguage}）</label>
            <p>{translatedText}</p>
          </div>
        </div>

        <div className="result-actions">
          <button onClick={handleCopy}>コピー</button>
        </div>
      </div>
    );
  };
  ```

- [ ] コピー機能実装
  ```tsx
  const handleCopy = async () => {
    await navigator.clipboard.writeText(translatedText);
    // Toast通知（オプション）
  };
  ```

- [ ] タイムスタンプフォーマット
  ```tsx
  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('ja-JP');
  };
  ```

#### Task 4.2: スタイル追加
**@target**: `src/styles/popup.css`

- [ ] `.selection-result`セクションのスタイル
  - カード形式のレイアウト
  - 原文/翻訳文の並列表示（flexbox）
  - ダークモード対応
- [ ] アニメーション追加（フェードイン）

#### Task 4.3: useTranslation hook拡張
**@target**: `src/popup/hooks/useTranslation.ts`

- [ ] ステート追加
  ```typescript
  const [selectionResult, setSelectionResult] = useState<{
    originalText: string;
    translatedText: string;
    targetLanguage: string;
    timestamp: number;
  } | null>(null);
  ```

- [ ] メッセージリスナー実装
  ```typescript
  useEffect(() => {
    const handleMessage = (
      message: any,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === MessageType.SELECTION_TRANSLATION_RESULT) {
        console.log('[Popup:useTranslation] Received selection translation result', message.payload);
        setSelectionResult(message.payload);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);
  ```

- [ ] 戻り値にselectionResult追加
  ```typescript
  return {
    status,
    error,
    progress,
    selectionResult, // NEW
    translate,
    reset,
  };
  ```

#### Task 4.4: App.tsx統合
**@target**: `src/popup/App.tsx`

- [ ] SelectionResultコンポーネントのインポート
- [ ] useTranslationからselectionResultを取得
- [ ] 条件付きレンダリング
  ```tsx
  export const App: React.FC = () => {
    const { status, error, progress, selectionResult } = useTranslation();

    return (
      <div className="popup-container">
        <header className="popup-header">...</header>

        <main className="popup-main">
          <ApiKeyWarning hasApiKey={hasApiKey} />

          {/* 選択翻訳結果表示（存在する場合） */}
          {selectionResult && (
            <SelectionResult
              originalText={selectionResult.originalText}
              translatedText={selectionResult.translatedText}
              targetLanguage={selectionResult.targetLanguage}
              timestamp={selectionResult.timestamp}
            />
          )}

          <div className="controls-section">
            <LanguageSelector />
            <QuickTranslate />
          </div>

          <StatusIndicator status={status} progress={progress} error={error} />
        </main>

        <footer className="popup-footer">...</footer>
      </div>
    );
  };
  ```

#### Task 4.5: ユニットテスト
**@target**: `tests/unit/popup/components/SelectionResult.test.tsx`（新規作成）

- [ ] レンダリングテスト
- [ ] コピー機能テスト
- [ ] タイムスタンプ表示テスト

**@target**: `tests/unit/popup/hooks/useTranslation.test.ts`

- [ ] selectionResultステート管理テスト
- [ ] メッセージリスナーテスト

**完了基準**:
- ✅ Popup UIに選択翻訳結果が表示される
- ✅ コピー機能が動作する
- ✅ ダークモード対応
- ✅ すべてのテストがパス

---

### Phase 5: CommandHandler統合（1時間）
**優先度**: 🟡 中

#### Task 5.1: Alt+Yショートカット動作確認
**@target**: `src/background/commandHandler.ts`
**@target**: `src/content/contentScript.ts`

- [ ] ContentScriptのメッセージハンドラーで`TRANSLATE_SELECTION`受信時の処理確認
- [ ] 既存の`sendTranslateSelectionMessage()`が正しく動作することを確認
- [ ] 必要に応じてログ追加

#### Task 5.2: 統合テスト
**@target**: `tests/integration/selectionTranslation.test.ts`（新規作成）

- [ ] Alt+Yショートカットのエンドツーエンドテスト
- [ ] IconBadgeクリックのエンドツーエンドテスト
- [ ] Popup UI表示のテスト

**完了基準**:
- ✅ Alt+Yでの選択翻訳が動作
- ✅ 統合テストがパス

---

### Phase 6: キーボードショートカット統一（30分）
**優先度**: 🟢 低

#### Task 6.1: config.ts修正
**@target**: `src/shared/constants/config.ts`

- [ ] `KEYBOARD_SHORTCUTS.TRANSLATE_SELECTION`を`'Alt+Y'`に変更
  ```typescript
  export const KEYBOARD_SHORTCUTS = {
    TRANSLATE_PAGE: 'Alt+W',
    TRANSLATE_SELECTION: 'Alt+Y', // Alt+Shift+T から変更
    TOGGLE_AUTO_TRANSLATE: 'Alt+Shift+A',
  } as const;
  ```

#### Task 6.2: ドキュメント確認
**@target**: `CLAUDE.md`

- [ ] キーボードショートカットのドキュメントを確認・更新

**完了基準**:
- ✅ manifest.jsonとconfig.tsの定義が一致
- ✅ ドキュメントが最新

---

### Phase 7: E2Eテストとデバッグ（2-3時間）
**優先度**: 🔴 最高

#### Task 7.1: 手動E2Eテスト
**@target**: 拡張機能全体

テストシナリオ:
1. **IconBadge表示テスト**
   - [ ] 任意のWebページでテキストを選択
   - [ ] IconBadgeが選択範囲付近に表示されることを確認
   - [ ] 選択解除時にIconBadgeが消えることを確認

2. **IconBadgeクリックテスト**
   - [ ] テキスト選択 → IconBadgeクリック
   - [ ] Popup UIが開くことを確認（既に開いていればフォーカス）
   - [ ] SelectionResultコンポーネントに翻訳結果が表示されることを確認

3. **Alt+Yショートカットテスト**
   - [ ] テキスト選択 → Alt+Y押下
   - [ ] Popup UIに翻訳結果が表示されることを確認

4. **エラーハンドリングテスト**
   - [ ] API Key未設定時の動作確認
   - [ ] ネットワークエラー時の動作確認

5. **複数選択テスト**
   - [ ] 1つ目のテキストを翻訳 → 2つ目のテキストを選択・翻訳
   - [ ] Popup UIに最新の翻訳結果のみ表示されることを確認

6. **パフォーマンステスト**
   - [ ] 長文選択時のレスポンス確認
   - [ ] 連続選択時のメモリリーク確認

#### Task 7.2: デバッグログ確認
**@target**: 各コンポーネント

- [ ] すべてのログ出力を確認
- [ ] 本番ビルド時のログ削除確認（ENABLE_DEBUG_LOGGING）

#### Task 7.3: ブラウザ互換性確認
**@target**: Firefox 58+

- [ ] Firefox最新版での動作確認
- [ ] Firefox 58（最小サポートバージョン）での動作確認

**完了基準**:
- ✅ すべてのE2Eテストシナリオが成功
- ✅ エラーハンドリングが適切
- ✅ パフォーマンス要件を満たす

---

### Phase 8: ドキュメンテーション（1-2時間）
**優先度**: 🟡 中

#### Task 8.1: CLAUDE.md更新
**@target**: `CLAUDE.md`

- [ ] 選択翻訳機能のアーキテクチャ説明追加
- [ ] IconBadgeとSelectionHandlerの責務記載
- [ ] メッセージフロー図の更新

#### Task 8.2: README更新
**@target**: `README.md`（存在する場合）

- [ ] 選択翻訳機能の使い方を追加
- [ ] スクリーンショット追加（オプション）

#### Task 8.3: JSDocレビュー
**@target**: 全コンポーネント

- [ ] すべてのpublicメソッドにJSDocが存在することを確認
- [ ] 例示コードが正しいことを確認

**完了基準**:
- ✅ ドキュメントが最新
- ✅ JSDocカバレッジ100%

---

### Phase 9: コードレビューとリファクタリング（1-2時間）
**優先度**: 🟡 中

#### Task 9.1: コードレビュー
- [ ] TypeScript型安全性の確認
- [ ] eslintルール違反の確認
- [ ] 不要なコメント削除
- [ ] Magic numberの定数化

#### Task 9.2: パフォーマンス最適化
- [ ] 不要な再レンダリングの削減（React.memo）
- [ ] イベントリスナーのメモリリーク確認
- [ ] IconBadge要素のDOM操作最適化

#### Task 9.3: アクセシビリティ確認
- [ ] IconBadgeにaria-label追加
- [ ] キーボードナビゲーション対応（オプション）

**完了基準**:
- ✅ `npm run lint`がエラーなく完了
- ✅ コードレビュー指摘事項すべて対応

---

### Phase 10: 最終検証とリリース準備（1時間）
**優先度**: 🔴 最高

#### Task 10.1: ビルドとテスト
- [ ] `npm run build`が成功することを確認
- [ ] `npm run lint`が成功することを確認
- [ ] すべてのユニットテストがパス
- [ ] すべての統合テストがパス

#### Task 10.2: Gitコミット準備
- [ ] `git diff`で変更ファイル確認
- [ ] 不要な変更の除外
- [ ] コミットメッセージ作成
  ```
  feat(selection): Implement selection translation with IconBadge

  - Add IconBadge UI component for text selection translation
  - Extend SelectionHandler to show IconBadge and send results to Popup
  - Add SelectionResult component in Popup UI
  - Enhance useTranslation hook to receive selection translation results
  - Define SELECTION_TRANSLATION_RESULT message type
  - Fix keyboard shortcut inconsistency (Alt+Y unified)
  - Add comprehensive unit tests and integration tests

  Closes #XXX
  ```

#### Task 10.3: リリースノート作成
- [ ] CHANGELOGに追加
  ```markdown
  ## [3.1.0] - 2025-XX-XX
  ### Added
  - Selection translation with IconBadge UI
  - Popup UI display for selection translation results
  - Alt+Y keyboard shortcut for selection translation

  ### Fixed
  - Keyboard shortcut inconsistency between manifest and config
  ```

**完了基準**:
- ✅ すべてのビルドとテストが成功
- ✅ コミット準備完了
- ✅ リリースノート作成完了

---

## 6. 影響を受けるファイル

### 新規作成ファイル
| ファイルパス | 種別 | 目的 |
|------------|-----|-----|
| `src/content/ui/IconBadge.ts` | Component | 選択時のアイコン表示 |
| `src/popup/components/SelectionResult.tsx` | Component | Popup UI翻訳結果表示 |
| `tests/unit/content/ui/IconBadge.test.ts` | Test | IconBadgeユニットテスト |
| `tests/unit/popup/components/SelectionResult.test.tsx` | Test | SelectionResultユニットテスト |
| `tests/integration/selectionTranslation.test.ts` | Test | E2E統合テスト |

### 変更ファイル
| ファイルパス | 変更内容 | 影響範囲 |
|------------|---------|---------|
| `src/shared/messages/types.ts` | SELECTION_TRANSLATION_RESULT追加 | メッセージング全体 |
| `src/content/selectionHandler.ts` | IconBadge統合、Popup通知機能追加 | Content Script |
| `src/popup/hooks/useTranslation.ts` | メッセージリスナー追加、ステート拡張 | Popup UI |
| `src/popup/App.tsx` | SelectionResultコンポーネント統合 | Popup UI |
| `src/shared/constants/config.ts` | KEYBOARD_SHORTCUTS.TRANSLATE_SELECTION修正 | 設定管理 |
| `src/styles/popup.css` | SelectionResultスタイル追加 | UI |
| `CLAUDE.md` | アーキテクチャドキュメント更新 | ドキュメント |

### 読み取り専用参照ファイル
| ファイルパス | 参照目的 |
|------------|---------|
| `src/content/floatingUI.ts` | 位置計算ロジック参考 |
| `src/popup/components/QuickTranslate.tsx` | UIスタイル参考 |
| `src/background/commandHandler.ts` | 既存メッセージフロー理解 |
| `dist-firefox/manifest.json` | キーボードショートカット定義確認 |

---

## 7. テスト計画

### 7.1 ユニットテスト

#### IconBadge.test.ts
```typescript
describe('IconBadge', () => {
  it('should show icon at specified position', () => {});
  it('should hide icon when hide() is called', () => {});
  it('should call callback on click', () => {});
  it('should adjust position to stay within viewport', () => {});
  it('should support dark mode', () => {});
});
```

#### SelectionHandler.test.ts（拡張）
```typescript
describe('SelectionHandler - IconBadge integration', () => {
  it('should show IconBadge on text selection', () => {});
  it('should hide IconBadge on selection clear', () => {});
  it('should translate and send result to Popup on icon click', () => {});
  it('should send correct message format', () => {});
});
```

#### SelectionResult.test.tsx
```typescript
describe('SelectionResult', () => {
  it('should render original and translated text', () => {});
  it('should copy translated text on button click', () => {});
  it('should format timestamp correctly', () => {});
});
```

#### useTranslation.test.ts（拡張）
```typescript
describe('useTranslation - selection translation', () => {
  it('should receive selection translation result message', () => {});
  it('should update selectionResult state', () => {});
  it('should clean up message listener on unmount', () => {});
});
```

### 7.2 統合テスト

#### selectionTranslation.test.ts
```typescript
describe('Selection Translation E2E', () => {
  it('should complete full flow: selection → IconBadge → translation → Popup display', async () => {
    // 1. シミュレートテキスト選択
    // 2. IconBadge表示確認
    // 3. IconBadgeクリック
    // 4. Background Script呼び出し確認
    // 5. Popup UIに結果表示確認
  });

  it('should work with Alt+Y keyboard shortcut', async () => {});
});
```

### 7.3 手動テストチェックリスト

#### 基本機能
- [ ] テキスト選択時にIconBadge表示
- [ ] IconBadgeクリックで翻訳実行
- [ ] Popup UIに翻訳結果表示
- [ ] Alt+Yショートカットで翻訳実行

#### エッジケース
- [ ] 長文選択（1000文字以上）
- [ ] 連続選択（5回以上）
- [ ] 選択解除時のIconBadge非表示
- [ ] Popup閉じた状態での翻訳実行

#### エラーハンドリング
- [ ] API Key未設定時のエラー表示
- [ ] ネットワークエラー時のエラー表示
- [ ] 翻訳失敗時のエラー表示

#### パフォーマンス
- [ ] IconBadge表示レイテンシ < 100ms
- [ ] Popup UI応答時間 < 500ms（API除く）

---

## 8. 完了基準

### 8.1 機能完了基準
- ✅ テキスト選択時にIconBadgeが選択範囲付近に表示される
- ✅ IconBadgeクリック時に翻訳が実行され、Popup UIに結果が表示される
- ✅ Alt+Yキーボードショートカットが動作する
- ✅ Popup UIにSelectionResultコンポーネントが統合される
- ✅ 原文と翻訳文が並べて表示される
- ✅ コピー機能が動作する

### 8.2 品質基準
- ✅ すべてのユニットテストがパス（カバレッジ80%以上）
- ✅ すべての統合テストがパス
- ✅ `npm run lint`がエラーなく完了
- ✅ TypeScriptコンパイルエラーなし
- ✅ JSDocドキュメントカバレッジ100%（publicメソッド）

### 8.3 パフォーマンス基準
- ✅ IconBadge表示レイテンシ < 100ms
- ✅ Popup UI応答時間 < 500ms（API応答時間を除く）
- ✅ メモリリークなし（連続100回選択後）

### 8.4 ドキュメント基準
- ✅ CLAUDE.mdに選択翻訳アーキテクチャが記載されている
- ✅ すべてのpublicメソッドにJSDocが存在する
- ✅ READMEに使い方が記載されている（存在する場合）

### 8.5 コード品質基準
- ✅ メッセージング規約（CLAUDE.md）に準拠
- ✅ TypeScript型安全性が維持されている
- ✅ 不要なコメントが削除されている
- ✅ Magic numberが定数化されている

---

## 9. リスクと対策

### リスク1: Popup UIとContent Script間の通信失敗
**リスク内容**: `chrome.runtime.sendMessage`がPopupに届かない可能性

**発生確率**: 中

**対策**:
1. Popup UIが開いていない場合のメッセージ損失を許容
2. 必要に応じてFloatingUIに翻訳結果を表示する代替手段を用意
3. ログ出力で通信状況をデバッグ可能にする

### リスク2: IconBadge位置計算の不具合
**リスク内容**: 特定のページレイアウトでIconBadgeが画面外に表示される

**発生確率**: 低

**対策**:
1. FloatingUIの実績あるロジックを流用
2. viewport境界チェックを厳密に実装
3. E2Eテストで複数のWebページで検証

### リスク3: パフォーマンス劣化
**リスク内容**: IconBadge表示やメッセージ送信が遅延し、UXが悪化

**発生確率**: 低

**対策**:
1. IconBadge表示は非同期処理（setTimeout使用）
2. DOM操作を最小限に抑える
3. パフォーマンステストで計測

### リスク4: 既存機能への影響
**リスク内容**: SelectionHandler拡張により、既存のページ翻訳機能が影響を受ける

**発生確率**: 低

**対策**:
1. 既存のユニットテストをすべて実行し、リグレッションがないことを確認
2. 統合テストで既存機能の動作を検証
3. コードレビューで変更範囲を厳密にチェック

---

## 10. 進捗追跡

### マイルストーン
| マイルストーン | 完了予定 | ステータス |
|--------------|---------|-----------|
| Phase 1完了 | Day 1 | ⬜ 未着手 |
| Phase 2完了 | Day 1 | ⬜ 未着手 |
| Phase 3完了 | Day 2 | ⬜ 未着手 |
| Phase 4完了 | Day 2 | ⬜ 未着手 |
| Phase 5-6完了 | Day 3 | ⬜ 未着手 |
| Phase 7完了 | Day 3 | ⬜ 未着手 |
| Phase 8-10完了 | Day 4 | ⬜ 未着手 |

### 実装時間見積もり
- Phase 1: 1-2時間
- Phase 2: 2-3時間
- Phase 3: 2-3時間
- Phase 4: 3-4時間
- Phase 5: 1時間
- Phase 6: 30分
- Phase 7: 2-3時間
- Phase 8: 1-2時間
- Phase 9: 1-2時間
- Phase 10: 1時間

**合計**: 15-22時間（約2-3日）

---

## 11. 今後の拡張予定

### 短期（次バージョン）
- [ ] 選択翻訳履歴機能（Popup UIに過去の翻訳を表示）
- [ ] FloatingUIへの翻訳結果表示（Popup代替）
- [ ] 翻訳先言語の一時変更機能

### 中期
- [ ] 翻訳結果の音声読み上げ
- [ ] 翻訳結果の共有機能（Twitter, メールなど）
- [ ] 複数言語同時翻訳

### 長期
- [ ] AI要約機能（長文選択時）
- [ ] コンテキスト解析による翻訳精度向上
- [ ] オフライン翻訳対応

---

## 12. 参考資料

### 内部ドキュメント
- `CLAUDE.md` - プロジェクトアーキテクチャとメッセージング規約
- `src/shared/messages/types.ts` - メッセージタイプ定義
- `src/shared/constants/config.ts` - 設定定数

### 外部リソース
- [Chrome Extensions Messaging](https://developer.chrome.com/docs/extensions/mv3/messaging/)
- [WebExtensions API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

---

## 変更履歴
| 日付 | バージョン | 変更内容 | 著者 |
|-----|-----------|---------|-----|
| 2025-10-26 | 1.0 | 初版作成 | Claude Code |

---

**このドキュメントは実装開始前に必ずレビューしてください。**
