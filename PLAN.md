# title: 最速ビューポート翻訳 - バッチストリーミング実装

## 概要
バッチごとに翻訳結果をストリーミングし、最初の10テキスト(1バッチ)を100ms以内にブラウザに表示することで、ユーザー体験を劇的に改善する機能。

### 実装の結果、実現される機能
- **段階的レンダリング**: バッチ完了ごとに即座にDOMに適用し、ユーザーに翻訳結果を表示
- **最速初期表示**: 最初の10テキストが100ms以内に表示される(現在は380ms)
- **リアルタイム進捗**: バッチごとに進捗バーが更新され、翻訳の進行状況が可視化
- **キャッシュ最適化**: キャッシュヒット時は即座に表示(API待ち不要)

### goal
- ユーザーが翻訳開始から**100ms以内**に最初の10テキストの翻訳結果を確認できる
- バッチごとに段階的に翻訳が表示され、待ち時間を感じない
- 進捗バーがリアルタイムで更新され、安心感を提供

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- メッセージングアーキテクチャでは`type`と`action`の両方を必須とする(Background→Content方向は`action`不要)
- すべての新しいメッセージタイプにはユニットテストを追加すること
- 既存の翻訳機能(選択翻訳、クリップボード翻訳)に影響を与えない

## 開発のゴール
- **最速初期表示**: 最初の1バッチ(10テキスト)を100ms以内に表示
- **段階的レンダリング**: バッチごとに即座にDOM適用、ユーザーに進捗を可視化
- **バッチストリーミング**: バックグラウンドからコンテンツへのバッチ完了通知機能
- **優先バッチ数最適化**: VIEWPORT_PRIORITY_BATCHESを3→1に変更
- **キャッシュ即時適用**: キャッシュヒット時は待ち時間ゼロで表示

---

## 1. 背景と目的

### 1.1 現在の問題

#### 問題: 最初のビューポート翻訳が即座に反映されない

**症状**:
- 最初の10テキスト(1バッチ)が100msで翻訳完了しているが、ブラウザには表示されない
- 全バッチ(5バッチ=50テキスト)完了まで380ms待たされる
- ユーザーは「翻訳が遅い」と感じる

**根本原因** (`src/content/contentScript.ts:203-227`):
```typescript
// Phase 1: ビューポート内の翻訳
const response1 = await this.messageBus.send({
  type: MessageType.REQUEST_TRANSLATION,
  action: 'requestTranslation',
  payload: { texts: viewportTexts, targetLanguage, semiParallel: true, priorityCount: 3 },
});

// ↑ この await が全バッチ完了まで返らない

if (response1?.success && response1?.data?.translations) {
  this.domManipulator.applyTranslations(viewport, response1.data.translations);
  // ↑ 全バッチ完了後に一括適用
}
```

**影響**:
- バックグラウンドでバッチ1が100msで完了しても、コンテンツスクリプトには通知されない
- バッチ2(200ms), バッチ3(280ms)が完了しても同様
- 全バッチ完了後(380ms)に初めて `applyTranslations()` が呼ばれる

**タイムライン(現在)**:
```
時刻   イベント                          ユーザーへの表示
0ms    - フェーズ1開始
       - messageBus.send() 開始

100ms  - バッチ1 (10テキスト) 完了      何も表示されない ❌
200ms  - バッチ2 (10テキスト) 完了      何も表示されない ❌
280ms  - バッチ3 (10テキスト) 完了      何も表示されない ❌
380ms  - バッチ4-5 (20テキスト) 完了    何も表示されない ❌
380ms  - messageBus.send() レスポンス受信
380ms  - applyTranslations(50テキスト)  ここで初めて50テキスト全て表示 ✅
```

### 1.2 改善後のタイムライン

**タイムライン(改善後)**:
```
時刻   イベント                          ユーザーへの表示
0ms    - フェーズ1開始
       - messageBus.send() 開始 (非ブロッキング)

100ms  - バッチ1完了                    10テキスト表示 ✅ (74%改善)
       - BATCH_COMPLETED 受信
       - applyTranslations(10テキスト)

180ms  - バッチ2-5完了                  40テキスト追加表示 ✅
       - BATCH_COMPLETED 受信
       - applyTranslations(40テキスト)
```

**改善効果**:
- 最初の10テキスト表示: 380ms → 100ms (**74%高速化**)
- 全体完了時間: 380ms → 180ms (**53%高速化**)
- 体感速度: **劇的に改善**

### 1.3 目的

- **UX改善**: 翻訳開始から100ms以内に最初の10テキストを表示
- **体感速度向上**: 段階的表示により、実際の処理時間が短くても速く感じる
- **進捗の可視化**: バッチごとの進捗更新でユーザーに安心感を提供
- **キャッシュ最適化**: キャッシュヒット時は待ち時間ゼロで表示

---

## 2. 現状分析

### 2.1 調査結果サマリー

| ファイル | 行番号 | 現在の実装 | 問題点 |
|---------|--------|-----------|--------|
| `contentScript.ts` | 203-227 | `await messageBus.send()` で全バッチ完了を待つ | バッチごとの通知なし |
| `translationEngine.ts` | 140-216 | `translateBatchSemiParallel()` でバッチ処理 | 完了通知機能なし |
| `messageHandler.ts` | - | `requestTranslation` ハンドラー | バッチごとの `sendMessage` なし |
| `progressNotification.ts` | 351-456 | `showPhase()`, `completePhase()` のみ | バッチごとの `updatePhase()` なし |

### 2.2 既存実装の詳細

#### コンテンツスクリプト (`src/content/contentScript.ts:203-227`)

**現在のコード**:
```typescript
// Phase 1: ビューポート内の翻訳
if (viewport.length > 0) {
  this.progressNotification.showPhase(1, viewport.length);
  const viewportTexts = viewport.map(node => node.text);

  const response1 = await this.messageBus.send({
    type: MessageType.REQUEST_TRANSLATION,
    action: 'requestTranslation',
    payload: {
      texts: viewportTexts,
      targetLanguage,
      semiParallel: true,
      priorityCount: 3,  // 最初の3バッチを順次処理
    },
  });

  if (response1?.success && response1?.data?.translations) {
    this.domManipulator.applyTranslations(viewport, response1.data.translations);
    this.progressNotification.completePhase(1);
  }
}
```

**問題点**:
- `await messageBus.send()` が全バッチ完了まで返らない
- バッチごとの通知を受け取る仕組みがない
- `applyTranslations()` は一括適用のみ

#### バックグラウンド (`src/background/translationEngine.ts:140-216`)

**現在のコード**:
```typescript
async translateBatchSemiParallel(
  texts: string[],
  targetLanguage: string,
  priorityCount: number = 3
): Promise<string[]> {
  const batches = this.chunkArray(uncachedTexts, this.BATCH_SIZE);
  const priorityBatches = batches.slice(0, priorityCount);
  const remainingBatches = batches.slice(priorityCount);

  // 順次処理
  for (const batch of priorityBatches) {
    const batchResults = await this.translateWithRetry(batch, targetLanguage);
    translatedTexts.push(...batchResults);
    // ↑ バッチ完了時の通知なし ❌
  }

  // 並列処理
  if (remainingBatches.length > 0) {
    const parallelResults = await Promise.all(
      remainingBatches.map(batch => this.translateWithRetry(batch, targetLanguage))
    );
    translatedTexts.push(...parallelResults.flat());
    // ↑ 並列完了時の通知なし ❌
  }

  return results;
}
```

**問題点**:
- バッチ完了時のコールバック機構がない
- コンテンツスクリプトへの通知方法がない

---

## 3. 実装仕様

### 3.1 アーキテクチャ設計

#### データフロー

```
[Content Script]                    [Background Script]
     |                                      |
     | (1) REQUEST_TRANSLATION              |
     |------------------------------------->|
     |   payload: { texts, semiParallel }   |
     |                                      |
     |                              [TranslationEngine]
     |                                      |
     |                              (2) translateBatchSemiParallel()
     |                                      ├─ バッチ1処理(100ms)
     |<-------------------------------------|   onBatchComplete() 呼び出し
     | (3) BATCH_COMPLETED                  |
     |   payload: { batchIndex: 0, ... }    |
     |                                      |
     | (4) applyTranslations(batch1)        ├─ バッチ2-5並列処理(80ms)
     | → DOM更新、進捗バー更新              |   onBatchComplete() 呼び出し
     |                                      |
     |<-------------------------------------|
     | (5) BATCH_COMPLETED                  |
     |   payload: { batchIndex: 1-4, ... }  |
     |                                      |
     | (6) applyTranslations(batch2-5)      |
     | → DOM更新、進捗バー更新              |
```

#### コンポーネント構成

| レイヤー | コンポーネント | 役割 | 変更内容 |
|---------|-------------|------|---------|
| Messaging | `types.ts` | メッセージ型定義 | BatchCompletedMessage追加 |
| Content Script | `contentScript.ts` | バッチ受信、DOM適用 | リスナー追加、段階的適用 |
| Background Script | `translationEngine.ts` | バッチ処理、コールバック | onBatchComplete追加 |
| Background Script | `messageHandler.ts` | メッセージルーティング | バッチ送信実装 |
| UI | `progressNotification.ts` | 進捗表示 | updatePhase追加 |
| Config | `config.ts` | 設定定数 | VIEWPORT_PRIORITY_BATCHES変更 |

### 3.2 メッセージフォーマット

#### BatchCompletedMessage

**定義** (`src/shared/messages/types.ts`):
```typescript
export interface BatchCompletedMessage {
  type: MessageType.BATCH_COMPLETED;
  payload: {
    batchIndex: number;        // バッチ番号 (0始まり)
    translations: string[];    // 翻訳結果 (最大10要素)
    nodeIndices: number[];     // 対応するノードインデックス
    phase: 1 | 2;             // フェーズ番号
    progress: {
      current: number;         // 完了バッチ数
      total: number;          // 全バッチ数
      percentage: number;     // 進捗率 (0-100)
    };
  };
}
```

**使用例**:
```typescript
// バッチ1完了時 (10テキスト)
{
  type: MessageType.BATCH_COMPLETED,
  payload: {
    batchIndex: 0,
    translations: ['翻訳1', '翻訳2', ..., '翻訳10'],
    nodeIndices: [0, 1, 2, ..., 9],
    phase: 1,
    progress: { current: 1, total: 5, percentage: 20 },
  },
}
```

### 3.3 設定変更

#### VIEWPORT_PRIORITY_BATCHES

**変更** (`src/shared/constants/config.ts`):
```typescript
export const BATCH_CONFIG = {
  BATCH_SIZE: 10,
  VIEWPORT_PRIORITY_BATCHES: 1,  // 3 → 1 に変更
  CONCURRENCY_LIMIT: 10,
};
```

**理由**:
- 最初の1バッチ(10テキスト)のみ優先処理
- 残りのバッチは完全並列化で高速化
- UXと速度のバランスが最良

---

## 4. 生成AIの学習用コンテキスト

### Content Script
- `src/content/contentScript.ts`
  - 行203-227: translatePage()メソッド - 現在のフェーズ1実装
  - 行93-99: 既存のDOM適用ロジック参照

### Background Script
- `src/background/translationEngine.ts`
  - 行140-216: translateBatchSemiParallel() - バッチ処理ロジック
  - 行55-70: chunkArray() - バッチ分割ロジック参照

- `src/background/messageHandler.ts`
  - 全体: requestTranslation ハンドラー実装参照
  - sender.tab.id の取得方法

### Messaging
- `src/shared/messages/types.ts`
  - 既存のメッセージ型定義を参考にBatchCompletedMessage作成

### UI
- `src/content/progressNotification.ts`
  - 行351-456: showPhase(), completePhase() - 既存の進捗表示実装

### Config
- `src/shared/constants/config.ts`
  - 行30-50: BATCH_CONFIG定義

---

## Process

### process1: BatchCompletedメッセージ型定義

#### sub1: メッセージインターフェース追加
**@target**: `src/shared/messages/types.ts`
**@ref**: `src/shared/messages/types.ts` (既存のメッセージ型)

- [ ] `BatchCompletedMessage` インターフェースを追加
  - `type: MessageType.BATCH_COMPLETED`
  - `payload: { batchIndex, translations, nodeIndices, phase, progress }`
- [ ] JSDocコメントを追加
  - 用途: バッチ完了通知
  - 送信元: Background Script (MessageHandler)
  - 送信先: Content Script
  - **注意**: Background→Content方向なので`action`プロパティは不要

**実装コード例**:
```typescript
/**
 * バッチ完了通知メッセージ
 * Background ScriptからContent Scriptへバッチ翻訳完了を通知
 *
 * @remarks
 * - Background→Content方向のため、actionプロパティは不要
 * - Content Scriptはこのメッセージを受信し、即座にDOM適用を行う
 */
export interface BatchCompletedMessage {
  type: MessageType.BATCH_COMPLETED;
  payload: {
    /** バッチ番号 (0始まり) */
    batchIndex: number;
    /** 翻訳結果配列 (最大BATCH_SIZE個) */
    translations: string[];
    /** 対応するノードインデックス配列 */
    nodeIndices: number[];
    /** 翻訳フェーズ (1: ビューポート内, 2: ページ全体) */
    phase: 1 | 2;
    /** 進捗情報 */
    progress: {
      /** 完了バッチ数 */
      current: number;
      /** 全バッチ数 */
      total: number;
      /** 進捗率 (0-100) */
      percentage: number;
    };
  };
}
```

#### sub2: MessageType列挙型に追加
**@target**: `src/shared/messages/types.ts`
**@ref**: なし

- [ ] `MessageType.BATCH_COMPLETED = 'BATCH_COMPLETED'` を追加

**実装コード例**:
```typescript
export enum MessageType {
  // ... 既存のタイプ
  TRANSLATION_PROGRESS = 'TRANSLATION_PROGRESS',
  TRANSLATION_ERROR = 'TRANSLATION_ERROR',
  BATCH_COMPLETED = 'BATCH_COMPLETED',  // 追加
}
```

#### sub3: Message union型に追加
**@target**: `src/shared/messages/types.ts`
**@ref**: なし

- [ ] `Message` union型に `BatchCompletedMessage` を追加

**実装コード例**:
```typescript
export type Message =
  | TranslationRequestMessage
  | TranslationProgressMessage
  | TranslationErrorMessage
  | BatchCompletedMessage  // 追加
  | ...;
```

---

### process2: 設定値変更

#### sub1: VIEWPORT_PRIORITY_BATCHES変更
**@target**: `src/shared/constants/config.ts`
**@ref**: `src/shared/constants/config.ts:30-50`

- [ ] `VIEWPORT_PRIORITY_BATCHES` を `3` から `1` に変更
- [ ] JSDocコメントを更新
  - 変更理由: 最初の1バッチのみ優先処理で最速初期表示

**実装コード例**:
```typescript
export const BATCH_CONFIG = {
  /**
   * 1バッチあたりのテキスト数
   */
  BATCH_SIZE: 10,

  /**
   * ビューポート内翻訳で優先処理するバッチ数
   *
   * @remarks
   * - 1: 最初の10テキストのみ順次処理、残りは完全並列化
   * - 最速の初期表示を実現
   */
  VIEWPORT_PRIORITY_BATCHES: 1,  // 変更: 3 → 1

  /**
   * 並列処理の最大同時実行数
   */
  CONCURRENCY_LIMIT: 10,
};
```

---

### process3: TranslationEngineにコールバック追加

#### sub1: BatchProgressCallback型定義
**@target**: `src/background/translationEngine.ts`
**@ref**: なし

- [ ] `BatchProgressCallback` 型を定義
  - 引数: `batchIndex`, `translations`, `nodeIndices`
  - 戻り値: `void`

**実装コード例**:
```typescript
/**
 * バッチ処理完了時のコールバック型
 *
 * @param batchIndex バッチ番号 (0始まり)
 * @param translations 翻訳結果配列
 * @param nodeIndices 対応するノードインデックス配列
 */
type BatchProgressCallback = (
  batchIndex: number,
  translations: string[],
  nodeIndices: number[]
) => void;
```

#### sub2: translateBatchSemiParallelシグネチャ拡張
**@target**: `src/background/translationEngine.ts`
**@ref**: `src/background/translationEngine.ts:140-216`

- [ ] `translateBatchSemiParallel()` のシグネチャに `onBatchComplete?` 引数を追加
- [ ] JSDocを更新

**実装コード例**:
```typescript
/**
 * セミ並列バッチ翻訳
 * 最初の数バッチを順次処理し、残りを並列処理する
 *
 * @param texts 翻訳するテキスト配列
 * @param targetLanguage 翻訳先言語
 * @param priorityCount 順次処理するバッチ数 (デフォルト: 1)
 * @param onBatchComplete バッチ完了時のコールバック (オプション)
 * @returns 翻訳結果配列
 */
async translateBatchSemiParallel(
  texts: string[],
  targetLanguage: string,
  priorityCount: number = 1,  // デフォルト変更: 3 → 1
  onBatchComplete?: BatchProgressCallback  // 追加
): Promise<string[]> {
  // ...
}
```

#### sub3: 順次処理バッチでのコールバック呼び出し
**@target**: `src/background/translationEngine.ts:140-216`
**@ref**: なし

- [ ] `priorityBatches` のループ内で `onBatchComplete()` を呼び出し
  - `batchIndex` を計算 (0始まり)
  - `nodeIndices` を計算 (`startIndex + range(batch.length)`)
- [ ] キャッシュヒット時も即座にコールバック

**実装コード例**:
```typescript
// 順次処理
let processedCount = 0;
for (let i = 0; i < priorityBatches.length; i++) {
  const batch = priorityBatches[i];
  const batchResults = await this.translateWithRetry(batch, targetLanguage);
  translatedTexts.push(...batchResults);

  // コールバック呼び出し
  if (onBatchComplete) {
    const startIndex = processedCount;
    const nodeIndices = Array.from(
      { length: batch.length },
      (_, idx) => startIndex + idx
    );
    onBatchComplete(i, batchResults, nodeIndices);
  }

  processedCount += batch.length;
}
```

#### sub4: 並列処理バッチでのコールバック呼び出し
**@target**: `src/background/translationEngine.ts:140-216`
**@ref**: なし

- [ ] `remainingBatches` の `Promise.all` 後に `onBatchComplete()` を呼び出し
  - 各バッチのインデックスを計算
  - 並列完了時も順序を維持

**実装コード例**:
```typescript
// 並列処理
if (remainingBatches.length > 0) {
  const parallelResults = await Promise.all(
    remainingBatches.map(batch => this.translateWithRetry(batch, targetLanguage))
  );

  parallelResults.forEach((batchResults, idx) => {
    const batchIndex = priorityBatches.length + idx;
    translatedTexts.push(...batchResults);

    // コールバック呼び出し
    if (onBatchComplete) {
      const startIndex = processedCount;
      const nodeIndices = Array.from(
        { length: batchResults.length },
        (_, i) => startIndex + i
      );
      onBatchComplete(batchIndex, batchResults, nodeIndices);
    }

    processedCount += batchResults.length;
  });
}
```

#### sub5: キャッシュヒット時のコールバック
**@target**: `src/background/translationEngine.ts:140-216`
**@ref**: `src/background/translationEngine.ts:85-95` (キャッシュ処理)

- [ ] キャッシュから取得した翻訳も即座に `onBatchComplete()` を呼び出し
  - API呼び出し不要なので待ち時間ゼロ

**実装コード例**:
```typescript
// キャッシュチェック
const cachedResults = texts.map(text => this.cache.get(text)).filter(Boolean);
if (cachedResults.length === texts.length) {
  // 全てキャッシュヒット
  if (onBatchComplete) {
    const nodeIndices = Array.from({ length: texts.length }, (_, i) => i);
    onBatchComplete(0, cachedResults, nodeIndices);
  }
  return cachedResults;
}
```

---

### process4: MessageHandlerでバッチ送信実装

#### sub1: requestTranslationハンドラーでsender.tab.id保持
**@target**: `src/background/messageHandler.ts`
**@ref**: `src/background/messageHandler.ts` (requestTranslationハンドラー)

- [ ] `sender.tab.id` を取得して保持
- [ ] `sender.tab` が存在しない場合のエラーハンドリング

**実装コード例**:
```typescript
private async handleRequestTranslation(
  payload: any,
  sendResponse: (response: HandlerResponse) => void,
  sender?: browser.runtime.MessageSender
): Promise<void> {
  try {
    const { texts, targetLanguage, semiParallel, priorityCount } = payload;

    // sender.tab.id を取得
    if (!sender?.tab?.id) {
      throw new Error('sender.tab.id is not available');
    }
    const tabId = sender.tab.id;

    // ...
  } catch (error) {
    // ...
  }
}
```

#### sub2: onBatchCompleteコールバック実装
**@target**: `src/background/messageHandler.ts`
**@ref**: なし

- [ ] `onBatchComplete` コールバック関数を実装
  - `browser.tabs.sendMessage()` で `BATCH_COMPLETED` を送信
  - `batchIndex`, `translations`, `nodeIndices`, `phase`, `progress` を含む

**実装コード例**:
```typescript
const totalBatches = Math.ceil(texts.length / BATCH_CONFIG.BATCH_SIZE);
let completedBatches = 0;

const onBatchComplete = (
  batchIndex: number,
  translations: string[],
  nodeIndices: number[]
) => {
  completedBatches++;
  const percentage = Math.round((completedBatches / totalBatches) * 100);

  // BATCH_COMPLETEDメッセージを送信
  browser.tabs.sendMessage(tabId, {
    type: MessageType.BATCH_COMPLETED,
    payload: {
      batchIndex,
      translations,
      nodeIndices,
      phase: 1,  // フェーズ1固定 (ビューポート翻訳)
      progress: {
        current: completedBatches,
        total: totalBatches,
        percentage,
      },
    },
  } as BatchCompletedMessage);
};
```

#### sub3: translateBatchSemiParallel呼び出し時にコールバック渡す
**@target**: `src/background/messageHandler.ts`
**@ref**: なし

- [ ] `engine.translateBatchSemiParallel()` 呼び出し時に `onBatchComplete` を渡す

**実装コード例**:
```typescript
const translations = semiParallel
  ? await this.engine.translateBatchSemiParallel(
      texts,
      targetLanguage,
      priorityCount || 1,
      onBatchComplete  // コールバックを渡す
    )
  : await this.engine.translateBatch(texts, targetLanguage);
```

---

### process5: ContentScriptにストリーミング受信実装

#### sub1: BATCH_COMPLETEDリスナー追加
**@target**: `src/content/contentScript.ts`
**@ref**: `src/content/contentScript.ts:50-80` (既存のリスナー)

- [ ] `browser.runtime.onMessage.addListener()` に `BATCH_COMPLETED` ハンドラーを追加
- [ ] `handleBatchCompleted()` メソッドを呼び出し

**実装コード例**:
```typescript
private setupBatchCompletedListener(): void {
  browser.runtime.onMessage.addListener((message: Message) => {
    if (message.type === MessageType.BATCH_COMPLETED) {
      this.handleBatchCompleted(message.payload);
    }
  });
}
```

#### sub2: handleBatchCompletedメソッド実装
**@target**: `src/content/contentScript.ts`
**@ref**: なし

- [ ] `handleBatchCompleted()` メソッドを実装
  - `nodeIndices` から対応する `TextNode` を取得
  - `domManipulator.applyTranslations()` で即座にDOM適用
  - `progressNotification.updatePhase()` で進捗更新

**実装コード例**:
```typescript
/**
 * バッチ完了通知を処理
 *
 * @param payload BatchCompletedMessageのペイロード
 */
private handleBatchCompleted(payload: BatchCompletedMessage['payload']): void {
  const { translations, nodeIndices, phase, progress } = payload;

  // nodeIndicesから対応するTextNodeを取得
  const nodes = nodeIndices.map(i => this.currentTranslationNodes[i]);

  // 即座にDOM適用
  this.domManipulator.applyTranslations(nodes, translations);

  // 進捗バー更新
  this.progressNotification.updatePhase(phase, progress.percentage);

  console.log(
    `[ContentScript] Batch ${payload.batchIndex} applied: ${translations.length} texts, ` +
    `Progress: ${progress.current}/${progress.total} (${progress.percentage}%)`
  );
}
```

#### sub3: currentTranslationNodesプロパティ追加
**@target**: `src/content/contentScript.ts`
**@ref**: なし

- [ ] `currentTranslationNodes: TextNode[]` プロパティを追加
  - 翻訳中のノード配列を保持
  - `handleBatchCompleted()` で参照

**実装コード例**:
```typescript
export class ContentScript {
  private domManipulator: DOMManipulator;
  private progressNotification: ProgressNotification;
  private messageBus: MessageBus;
  private currentTranslationNodes: TextNode[] = [];  // 追加

  // ...
}
```

#### sub4: translatePageメソッド変更
**@target**: `src/content/contentScript.ts:203-227`
**@ref**: なし

- [ ] `translatePage()` で `currentTranslationNodes` を設定
- [ ] `await messageBus.send()` を削除 (非ブロッキング化)
- [ ] バッチ完了は `handleBatchCompleted()` で処理

**実装コード例**:
```typescript
private async translatePage(targetLanguage: string): Promise<void> {
  try {
    // Extract text nodes
    this.extractedNodes = this.domManipulator.extractTextNodes();

    // ビューポート内/外の分離
    const { viewport, outOfViewport } = this.domManipulator.detectViewportNodes(
      this.extractedNodes
    );

    console.log(
      `[ContentScript] Viewport nodes: ${viewport.length}, ` +
      `Out of viewport: ${outOfViewport.length}`
    );

    // Phase 1: ビューポート内の翻訳
    if (viewport.length > 0) {
      this.currentTranslationNodes = viewport;  // 保存
      this.progressNotification.showPhase(1, viewport.length);
      const viewportTexts = viewport.map(node => node.text);

      // 非ブロッキングでリクエスト送信
      this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: viewportTexts,
          targetLanguage,
          semiParallel: true,
          priorityCount: 1,  // 変更: 3 → 1
        },
      });
      // ↑ await を削除、バッチ完了は handleBatchCompleted() で処理
    }

    // Phase 2は省略 (今回はビューポート翻訳のみに集中)

  } catch (error) {
    logger.error('Failed to translate page:', error);
    this.progressNotification.error(
      error instanceof Error ? error.message : 'Translation failed'
    );
    throw error;
  }
}
```

---

### process6: ProgressNotificationにupdatePhase実装

#### sub1: updatePhaseメソッド追加
**@target**: `src/content/progressNotification.ts`
**@ref**: `src/content/progressNotification.ts:351-456`

- [ ] `updatePhase(phase: 1 | 2, percentage: number)` メソッドを追加
  - 進捗バーの幅を更新
  - パーセンテージテキストを更新

**実装コード例**:
```typescript
/**
 * フェーズ内の進捗を更新
 *
 * @param phase 翻訳フェーズ (1: ビューポート内, 2: ページ全体)
 * @param percentage 進捗率 (0-100)
 */
updatePhase(phase: 1 | 2, percentage: number): void {
  const notificationId = phase === 1 ? 'phase1-notification' : 'phase2-notification';
  const element = document.getElementById(notificationId);

  if (element) {
    // 進捗バー更新
    const progressBar = element.querySelector('.progress-bar') as HTMLElement;
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
    }

    // パーセンテージテキスト更新
    const percentageText = element.querySelector('.percentage') as HTMLElement;
    if (percentageText) {
      percentageText.textContent = `${Math.round(percentage)}%`;
    }

    console.log(`[ProgressNotification] Phase ${phase} progress: ${percentage}%`);
  }
}
```

---

### process7: MessageHandlerのインポート確認

#### sub1: browser.tabs.sendMessageインポート確認
**@target**: `src/background/messageHandler.ts`
**@ref**: なし

- [ ] `browser.tabs.sendMessage` が利用可能か確認
  - Firefox拡張機能なので `browser` グローバルが存在
  - 必要に応じて型定義を追加

**確認コード**:
```typescript
// webextension-polyfillを使用している場合
import browser from 'webextension-polyfill';

// または Firefox標準のbrowserグローバルを使用
declare const browser: typeof import('webextension-polyfill');
```

---

### process8: キャッシュヒット時の即時表示実装

#### sub1: キャッシュヒット時のBATCH_COMPLETED送信
**@target**: `src/background/translationEngine.ts`
**@ref**: `src/background/translationEngine.ts:85-95`

- [ ] キャッシュから全翻訳を取得した場合、即座に `onBatchComplete()` を呼び出し
  - API呼び出し不要なので待ち時間ゼロ

**実装コード例**:
```typescript
// キャッシュチェック (translateBatchSemiParallel内)
const cachedResults: string[] = [];
const uncachedTexts: string[] = [];

texts.forEach(text => {
  const cached = this.cache.get(text);
  if (cached) {
    cachedResults.push(cached);
  } else {
    uncachedTexts.push(text);
  }
});

// 全てキャッシュヒット
if (uncachedTexts.length === 0) {
  if (onBatchComplete) {
    const nodeIndices = Array.from({ length: texts.length }, (_, i) => i);
    onBatchComplete(0, cachedResults, nodeIndices);
  }
  return cachedResults;
}
```

---

### process9: インポート確認とコンパイルエラー修正

#### sub1: types.tsのインポート確認
**@target**: 各ファイル
**@ref**: なし

- [ ] `BatchCompletedMessage` が正しくインポートされているか確認
  - `contentScript.ts`
  - `messageHandler.ts`
  - `translationEngine.ts`

**確認コード**:
```typescript
import {
  Message,
  MessageType,
  BatchCompletedMessage,  // 追加
} from '@/shared/messages/types';
```

#### sub2: TypeScriptコンパイルエラー確認
**@target**: プロジェクト全体
**@ref**: なし

- [ ] `npm run build` または `tsc` を実行してコンパイルエラーを確認
- [ ] 型エラーがあれば修正

---

### process10: ユニットテスト

#### sub1: BatchCompletedMessage型テスト
**@target**: `tests/unit/shared/messages/types.test.ts`
**@ref**: なし

- [ ] `BatchCompletedMessage` が正しい構造を持つことをテスト
- [ ] `Message` union型に含まれることをテスト

**実装コード例**:
```typescript
describe('BatchCompletedMessage', () => {
  it('should have correct structure', () => {
    const message: BatchCompletedMessage = {
      type: MessageType.BATCH_COMPLETED,
      payload: {
        batchIndex: 0,
        translations: ['翻訳1'],
        nodeIndices: [0],
        phase: 1,
        progress: {
          current: 1,
          total: 5,
          percentage: 20,
        },
      },
    };

    expect(message.type).toBe(MessageType.BATCH_COMPLETED);
    expect(message.payload.batchIndex).toBe(0);
  });
});
```

#### sub2: TranslationEngine - onBatchCompleteコールバックテスト
**@target**: `tests/unit/background/translationEngine.test.ts`
**@ref**: `tests/unit/background/translationEngine.test.ts`

- [ ] `translateBatchSemiParallel()` がバッチ完了ごとに `onBatchComplete()` を呼び出すことをテスト
- [ ] コールバックの引数 (`batchIndex`, `translations`, `nodeIndices`) が正しいことをテスト

**実装コード例**:
```typescript
describe('TranslationEngine - onBatchComplete', () => {
  it('should call onBatchComplete for each batch', async () => {
    const texts = Array(25).fill('test');  // 3バッチ分 (10+10+5)
    const onBatchComplete = jest.fn();

    await engine.translateBatchSemiParallel(texts, 'ja', 1, onBatchComplete);

    // 3回呼ばれることを確認
    expect(onBatchComplete).toHaveBeenCalledTimes(3);

    // バッチ0の引数確認
    expect(onBatchComplete).toHaveBeenNthCalledWith(
      1,
      0,  // batchIndex
      expect.arrayContaining(['translated']),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]  // nodeIndices
    );
  });

  it('should call onBatchComplete immediately for cache hit', async () => {
    const texts = ['cached1', 'cached2'];
    const onBatchComplete = jest.fn();

    // キャッシュを設定
    engine.cache.set('cached1', '翻訳1');
    engine.cache.set('cached2', '翻訳2');

    await engine.translateBatchSemiParallel(texts, 'ja', 1, onBatchComplete);

    // 即座に呼ばれることを確認
    expect(onBatchComplete).toHaveBeenCalledTimes(1);
    expect(onBatchComplete).toHaveBeenCalledWith(
      0,
      ['翻訳1', '翻訳2'],
      [0, 1]
    );
  });
});
```

#### sub3: MessageHandler - BATCH_COMPLETED送信テスト
**@target**: `tests/unit/background/messageHandler.test.ts`
**@ref**: `tests/unit/background/messageHandler.test.ts`

- [ ] `requestTranslation` ハンドラーがバッチ完了ごとに `browser.tabs.sendMessage()` を呼び出すことをテスト

**実装コード例**:
```typescript
describe('MessageHandler - BATCH_COMPLETED', () => {
  it('should send BATCH_COMPLETED message for each batch', async () => {
    const sendMessageSpy = jest.spyOn(browser.tabs, 'sendMessage');

    const message: TranslationRequestMessage = {
      type: MessageType.REQUEST_TRANSLATION,
      action: 'requestTranslation',
      payload: {
        texts: Array(25).fill('test'),  // 3バッチ分
        targetLanguage: 'ja',
        semiParallel: true,
        priorityCount: 1,
      },
    };

    const sender: browser.runtime.MessageSender = {
      tab: { id: 123 },
    };

    await messageHandler.handle(message, sender);

    // 3回sendMessageが呼ばれることを確認
    expect(sendMessageSpy).toHaveBeenCalledTimes(3);

    // 最初のBATCH_COMPLETEDメッセージ確認
    expect(sendMessageSpy).toHaveBeenNthCalledWith(1, 123, {
      type: MessageType.BATCH_COMPLETED,
      payload: expect.objectContaining({
        batchIndex: 0,
        translations: expect.any(Array),
        nodeIndices: expect.any(Array),
        phase: 1,
        progress: expect.objectContaining({
          current: 1,
          total: 3,
          percentage: expect.any(Number),
        }),
      }),
    });
  });
});
```

#### sub4: ContentScript - handleBatchCompletedテスト
**@target**: `tests/unit/content/contentScript.test.ts`
**@ref**: `tests/unit/content/contentScript.test.ts`

- [ ] `handleBatchCompleted()` が正しくDOM適用と進捗更新を行うことをテスト

**実装コード例**:
```typescript
describe('ContentScript - handleBatchCompleted', () => {
  it('should apply translations and update progress', () => {
    const contentScript = new ContentScript();
    const applyTranslationsSpy = jest.spyOn(
      contentScript['domManipulator'],
      'applyTranslations'
    );
    const updatePhaseSpy = jest.spyOn(
      contentScript['progressNotification'],
      'updatePhase'
    );

    // currentTranslationNodesを設定
    contentScript['currentTranslationNodes'] = [
      { node: document.createTextNode('test1'), text: 'test1', element: document.body },
      { node: document.createTextNode('test2'), text: 'test2', element: document.body },
    ];

    const payload: BatchCompletedMessage['payload'] = {
      batchIndex: 0,
      translations: ['翻訳1', '翻訳2'],
      nodeIndices: [0, 1],
      phase: 1,
      progress: { current: 1, total: 5, percentage: 20 },
    };

    contentScript['handleBatchCompleted'](payload);

    // applyTranslationsが呼ばれることを確認
    expect(applyTranslationsSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ text: 'test1' }),
        expect.objectContaining({ text: 'test2' }),
      ]),
      ['翻訳1', '翻訳2']
    );

    // updatePhaseが呼ばれることを確認
    expect(updatePhaseSpy).toHaveBeenCalledWith(1, 20);
  });
});
```

#### sub5: ProgressNotification - updatePhaseテスト
**@target**: `tests/unit/content/progressNotification.test.ts`
**@ref**: `tests/unit/content/progressNotification.test.ts`

- [ ] `updatePhase()` が進捗バーとパーセンテージを正しく更新することをテスト

**実装コード例**:
```typescript
describe('ProgressNotification - updatePhase', () => {
  it('should update progress bar width and percentage text', () => {
    const notification = new ProgressNotification();

    // Phase 1通知要素を作成
    const element = document.createElement('div');
    element.id = 'phase1-notification';

    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    element.appendChild(progressBar);

    const percentageText = document.createElement('span');
    percentageText.className = 'percentage';
    element.appendChild(percentageText);

    document.body.appendChild(element);

    notification.updatePhase(1, 50);

    expect(progressBar.style.width).toBe('50%');
    expect(percentageText.textContent).toBe('50%');

    document.body.removeChild(element);
  });
});
```

---

### process20: エラーハンドリング強化

#### sub1: sender.tab.id未定義エラーハンドリング
**@target**: `src/background/messageHandler.ts`
**@ref**: なし

- [ ] `sender.tab.id` が存在しない場合のエラーハンドリング
- [ ] エラーメッセージをログ出力

**実装コード例**:
```typescript
if (!sender?.tab?.id) {
  const error = 'Cannot send BATCH_COMPLETED: sender.tab.id is undefined';
  console.error(`[MessageHandler] ${error}`);
  sendResponse({
    success: false,
    error,
  });
  return;
}
```

#### sub2: browser.tabs.sendMessageエラーハンドリング
**@target**: `src/background/messageHandler.ts`
**@ref**: なし

- [ ] `browser.tabs.sendMessage()` が失敗した場合のエラーハンドリング
- [ ] タブが閉じられている場合を考慮

**実装コード例**:
```typescript
const onBatchComplete = (
  batchIndex: number,
  translations: string[],
  nodeIndices: number[]
) => {
  try {
    browser.tabs.sendMessage(tabId, {
      type: MessageType.BATCH_COMPLETED,
      payload: { batchIndex, translations, nodeIndices, phase: 1, progress },
    } as BatchCompletedMessage);
  } catch (error) {
    console.error(
      `[MessageHandler] Failed to send BATCH_COMPLETED to tab ${tabId}:`,
      error
    );
  }
};
```

#### sub3: handleBatchCompletedエラーハンドリング
**@target**: `src/content/contentScript.ts`
**@ref**: なし

- [ ] `handleBatchCompleted()` で `currentTranslationNodes` が存在しない場合のエラーハンドリング
- [ ] ノードインデックスが範囲外の場合のエラーハンドリング

**実装コード例**:
```typescript
private handleBatchCompleted(payload: BatchCompletedMessage['payload']): void {
  try {
    const { translations, nodeIndices, phase, progress } = payload;

    if (!this.currentTranslationNodes || this.currentTranslationNodes.length === 0) {
      console.warn('[ContentScript] currentTranslationNodes is empty');
      return;
    }

    // nodeIndicesから対応するTextNodeを取得
    const nodes = nodeIndices
      .filter(i => i < this.currentTranslationNodes.length)  // 範囲外を除外
      .map(i => this.currentTranslationNodes[i]);

    if (nodes.length !== translations.length) {
      console.warn(
        `[ContentScript] Mismatch: nodes(${nodes.length}) vs translations(${translations.length})`
      );
    }

    // 即座にDOM適用
    this.domManipulator.applyTranslations(nodes, translations);

    // 進捗バー更新
    this.progressNotification.updatePhase(phase, progress.percentage);

  } catch (error) {
    console.error('[ContentScript] Failed to handle batch completed:', error);
  }
}
```

---

### process30: 統合テスト

#### sub1: E2Eテストシナリオ作成
**@target**: `tests/e2e/viewport-translation.test.ts`
**@ref**: なし

- [ ] E2Eテストシナリオを作成
  - 最初の10テキストが100ms以内に表示されることを確認
  - バッチごとに進捗バーが更新されることを確認

**実装コード例**:
```typescript
describe('Viewport Translation - E2E', () => {
  it('should display first 10 texts within 100ms', async () => {
    // テストページを読み込み
    await page.goto('http://localhost:3000/test-page.html');

    // 翻訳開始
    const startTime = Date.now();
    await page.click('#translate-button');

    // 最初の10テキストが表示されるまで待機
    await page.waitForSelector('.translated-text:nth-child(10)');
    const firstBatchTime = Date.now() - startTime;

    expect(firstBatchTime).toBeLessThan(150);  // 100ms + マージン
  });

  it('should update progress bar for each batch', async () => {
    await page.goto('http://localhost:3000/test-page.html');
    await page.click('#translate-button');

    // 進捗バーが段階的に更新されることを確認
    const progressUpdates: number[] = [];
    page.on('console', msg => {
      if (msg.text().includes('Progress:')) {
        const match = msg.text().match(/(\d+)%/);
        if (match) {
          progressUpdates.push(parseInt(match[1]));
        }
      }
    });

    await page.waitForSelector('.translation-complete');

    expect(progressUpdates.length).toBeGreaterThan(1);
    expect(progressUpdates[0]).toBeLessThan(progressUpdates[1]);
  });
});
```

---

### process50: フォローアップ

*(実装後に仕様変更が発生した場合、ここにProcessを追加)*

---

### process100: リファクタリング

#### sub1: コード重複の削減
**@target**: 各ファイル
**@ref**: なし

- [ ] バッチインデックス計算ロジックを共通関数化
- [ ] `onBatchComplete` 呼び出しを共通化

#### sub2: 型安全性の向上
**@target**: 各ファイル
**@ref**: なし

- [ ] `nodeIndices` の型を明確化 (`number[]`)
- [ ] `BatchProgressCallback` をエクスポートして共有

#### sub3: Magic numberの定数化
**@target**: 各ファイル
**@ref**: なし

- [ ] 100ms, 380msなどのタイムアウト値を定数化
- [ ] `BATCH_CONFIG` に追加

---

### process200: ドキュメンテーション

#### sub1: CLAUDE.md更新
**@target**: `CLAUDE.md`
**@ref**: `CLAUDE.md:670-710`

- [ ] Translation Flowセクションにバッチストリーミング型翻訳を追記
- [ ] Messaging Architectureセクションに `BATCH_COMPLETED` メッセージを追記
- [ ] Key Componentsセクションに「Batch Streaming」を追加

**実装内容**:
```markdown
## Translation Flow

### Viewport-Priority Translation Flow with Batch Streaming
1. User triggers translation via popup button or keyboard shortcut (Alt+W)
2. background.js receives command and forwards to content.js via message passing
3. content.js performs the following phases:

**Phase 1: Viewport-Priority Translation with Streaming**
- Scan DOM and extract all text nodes using TreeWalker
- Detect viewport nodes using getBoundingClientRect()
- Separate nodes into viewport/outOfViewport queues
- Send viewport texts to background for semi-parallel translation:
  - First 1 batch (10 texts) processed sequentially → **100ms**
  - Remaining batches processed in parallel → **+80ms**
- **Background sends BATCH_COMPLETED message for each batch**
- **Content applies translations immediately upon receiving each batch**
- Show Phase 1 progress: "ビューポート内を翻訳中... X%" (updates per batch)

**Key Improvement**: Progressive Rendering
- **Before**: All batches complete (380ms) → Apply all translations
- **After**: Each batch completes → Apply immediately (first batch at 100ms)
- **Result**: 74% faster perceived speed (380ms → 100ms)

### Key Components
- **Batch Streaming**: Real-time translation result delivery via BATCH_COMPLETED messages
- **Progressive Rendering**: DOM updates immediately upon each batch completion
- **Priority Batch Optimization**: Only first batch sequential, remaining parallel
```

#### sub2: README.md更新
**@target**: `README.md`
**@ref**: なし

- [ ] 「段階的レンダリング」機能を追加
- [ ] パフォーマンス改善の数値を記載

**実装内容**:
```markdown
## Features

- 🚀 **Progressive Rendering**: First 10 texts displayed within 100ms
- 📊 **Real-time Progress**: Batch-by-batch progress updates
- ⚡ **74% Faster Initial Display**: 380ms → 100ms
- ...
```

#### sub3: JSDocコメント充実
**@target**: 各ファイルの新規メソッド
**@ref**: なし

- [ ] すべての新規publicメソッドにJSDocを追加
  - `BatchProgressCallback`
  - `handleBatchCompleted()`
  - `updatePhase()`
  - `onBatchComplete()`

#### sub4: CHANGELOG.md更新
**@target**: `CHANGELOG.md`
**@ref**: なし

- [ ] バージョン番号を更新 (例: v2.1.0)
- [ ] 変更内容を記載

**実装内容**:
```markdown
## [2.1.0] - 2025-10-31

### Added
- Batch streaming for progressive rendering
- BATCH_COMPLETED message type for real-time translation updates
- Progressive DOM updates (batch-by-batch)

### Changed
- VIEWPORT_PRIORITY_BATCHES: 3 → 1 (optimize for fastest initial display)
- Translation flow: Blocking → Non-blocking with streaming

### Performance
- First 10 texts display time: 380ms → 100ms (74% faster)
- Overall translation completion: 380ms → 180ms (53% faster)
```

---

## 5. 検証基準

### 5.1 機能検証

- [ ] 最初の10テキストが100ms以内に表示される
- [ ] バッチごとに進捗バーが更新される
- [ ] キャッシュヒット時は即座に表示される (待ち時間ゼロ)
- [ ] エラー時も部分翻訳が適用される
- [ ] 既存の選択翻訳機能に影響がない
- [ ] 既存のクリップボード翻訳機能に影響がない
- [ ] ページ全体翻訳(Phase 2)は今回対象外だが、将来的に拡張可能な設計

### 5.2 パフォーマンス検証

- [ ] 最初の10テキスト表示時間: 380ms → 100ms (目標: 150ms以内)
- [ ] 全体完了時間: 380ms → 180ms (目標: 200ms以内)
- [ ] メモリリークなし (Chrome DevTools Memory Profilerで確認)

### 5.3 コード品質検証

- [ ] すべてのユニットテストがパス (カバレッジ80%以上)
- [ ] `npm run lint` がエラーなく完了
- [ ] TypeScriptコンパイルエラーなし
- [ ] JSDocドキュメントカバレッジ100% (publicメソッド)
- [ ] メッセージング規約 (CLAUDE.md) に準拠

### 5.4 ドキュメント検証

- [ ] CLAUDE.mdにバッチストリーミング型翻訳が記載されている
- [ ] README.mdにパフォーマンス改善が記載されている
- [ ] CHANGELOG.mdに変更内容が記載されている
- [ ] すべてのpublicメソッドにJSDocが存在する

---

## 6. リスク管理

### リスク1: メッセージ順序保証

**リスク内容**: 並列処理時にバッチ2がバッチ1より先にContent Scriptに到着する可能性

**発生確率**: Low

**影響**: バッチ順序が逆転し、表示が不自然になる

**軽減策**:
1. `batchIndex` を使って順序を明示
2. Content Script側で到着順に適用 (順序は気にしない設計)
3. 並列バッチは全て完了後に一括適用 (順次バッチのみ段階的適用)

**検出方法**: E2Eテストで表示順序を検証

---

### リスク2: メモリ使用量増加

**リスク内容**: `currentTranslationNodes` の保持により一時的にメモリ増加

**発生確率**: Low

**影響**: 大量のテキストノード (1000+) でメモリ不足の可能性

**軽減策**:
1. 翻訳完了後に `currentTranslationNodes` をクリア
2. WeakMap使用の検討 (将来的改善)
3. ビューポート内のみ保持 (Phase 2は対象外)

**検出方法**: Chrome DevTools Memory Profilerで計測

---

### リスク3: エラー時の部分翻訳

**リスク内容**: バッチ途中でエラー発生時、一部のテキストが未翻訳のまま残る

**発生確率**: Medium

**影響**: ユーザーが混乱する可能性

**軽減策**:
1. エラー時も既に適用済みの翻訳は残す
2. エラー通知を表示 (progressNotification.error())
3. 再試行機能の実装 (将来的改善)

**検出方法**: ユニットテストでエラーケースを網羅

---

### リスク4: 既存機能への影響

**リスク内容**: contentScript.ts修正により既存の翻訳機能が影響を受ける

**発生確率**: Low

**影響**: 選択翻訳、クリップボード翻訳が動作不良

**軽減策**:
1. 既存のユニットテストをすべて実行し、リグレッションチェック
2. 統合テストで既存機能の動作を検証
3. コードレビューで変更範囲を厳密にチェック

**検出方法**: 既存のテストスイート実行

---

### リスク5: browser.tabs.sendMessage失敗

**リスク内容**: タブが閉じられている場合、`browser.tabs.sendMessage()` が失敗

**発生確率**: Medium

**影響**: エラーログが大量に出力される

**軽減策**:
1. `try-catch` でエラーハンドリング
2. タブが存在するか事前確認 (`browser.tabs.get()`)
3. エラー時はログ出力のみ (処理は継続)

**検出方法**: E2Eテストでタブクローズシナリオを検証

---

## 7. 実装時間見積もり

| Process | タスク | 見積時間 | 備考 |
|---------|--------|---------|------|
| process1 | メッセージ型定義 | 30分 | シンプルな型追加 |
| process2 | 設定値変更 | 10分 | 定数変更のみ |
| process3 | TranslationEngineコールバック | 1時間 | コールバック機構追加 |
| process4 | MessageHandlerバッチ送信 | 1.5時間 | sender.tab.id処理、エラーハンドリング |
| process5 | ContentScriptストリーミング受信 | 2時間 | リスナー追加、段階的適用 |
| process6 | ProgressNotification拡張 | 30分 | updatePhaseメソッド追加 |
| process7 | インポート確認 | 15分 | 簡単な確認作業 |
| process8 | キャッシュ最適化 | 45分 | キャッシュヒット時の処理 |
| process9 | コンパイルエラー修正 | 30分 | 型エラー修正 |
| process10 | ユニットテスト | 3時間 | 5つのテストファイル作成 |
| process20 | エラーハンドリング | 1時間 | 3つのエラーケース |
| process30 | 統合テスト | 2時間 | E2Eテスト作成 |
| process100 | リファクタリング | 1時間 | コード整理 |
| process200 | ドキュメンテーション | 1.5時間 | 4つのドキュメント更新 |

**合計**: 約15時間 (約2日)

---

## 8. 完了基準

### 8.1 技術的完了基準

- ✅ すべてのprocess (1-200) が完了
- ✅ すべてのユニットテストがパス
- ✅ すべての統合テストがパス
- ✅ `npm run lint` がエラーなく完了
- ✅ TypeScriptコンパイルエラーなし

### 8.2 機能完了基準

- ✅ 最初の10テキストが100ms以内に表示される
- ✅ バッチごとに進捗バーが更新される
- ✅ キャッシュヒット時は即座に表示される
- ✅ エラー時も部分翻訳が適用される
- ✅ 既存機能に影響がない

### 8.3 ドキュメント完了基準

- ✅ CLAUDE.mdが更新されている
- ✅ README.mdが更新されている
- ✅ CHANGELOG.mdが更新されている
- ✅ すべてのpublicメソッドにJSDocが存在する

---

## 9. 参考資料

### 内部ドキュメント
- `CLAUDE.md` - プロジェクトアーキテクチャとメッセージング規約
- `src/content/contentScript.ts` - 翻訳処理の全体フロー
- `src/background/translationEngine.ts` - バッチ翻訳エンジン
- `src/background/messageHandler.ts` - メッセージルーティング
- `src/content/progressNotification.ts` - 進捗表示UI

### 外部リソース
- [browser.tabs.sendMessage - MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/sendMessage)
- [browser.runtime.onMessage - MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessage)
- [Progressive Rendering - Web.dev](https://web.dev/rendering-performance/)

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 著者 |
|-----|-----------|---------|-----|
| 2025-10-31 | 2.0 | バッチストリーミング実装計画作成 | Claude Code |

---

**このドキュメントは実装開始前に必ずレビューしてください。**

