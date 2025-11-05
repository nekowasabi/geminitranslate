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
| 2025-10-31 | 2.1 | さらなる高速化改善案調査完了 | Claude Code |

---

## 10. 翻訳・表示スピード高速化改善（フェーズ1+2統合実装）

## 概要
- ビューポート内優先翻訳とページ全体翻訳の両フェーズにおいて、翻訳速度と表示速度を大幅に改善します
- キャッシュ効率化、不要な要素除外、GPU アクセラレーション、遅延翻訳により、総合的に 50-95% の高速化を実現します

### goal
- ユーザが翻訳を実行した際、ビューポート内のコンテンツが**即座に**翻訳表示される
- スクロールしても遅延なくスムーズに翻訳コンテンツが表示される
- 大規模ページでもメモリ使用量を抑えながら高速に翻訳できる
- 再翻訳時は永続化キャッシュにより瞬時に表示される

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- `MessageType` と `action` の両方を含むメッセージフォーマットに従うこと
- TypeScript の型安全性を維持すること
- 既存の Viewport-Priority Translation Flow を破壊しないこと
- 段階的な実装とテストを行い、各 process ごとにコミットすること

## 開発のゴール
- **フェーズ1（ビューポート内翻訳）**: 初期表示を 15-30% 高速化
- **フェーズ2（ページ全体翻訳）**: スクロール時の体感速度を 20-40% 改善
- **メモリ効率**: 大規模ページでのメモリ使用量を 30-50% 削減
- **再翻訳**: 永続化キャッシュにより 90% 以上の高速化

## 実装仕様

### 1. キャッシュ戦略改善
- **LRUキャッシュ拡張**: 現在の 1000 エントリから 5000 エントリに拡大
- **IndexedDB 永続化**: ブラウザセッションを跨いだキャッシュ保持
- **キャッシュキー最適化**: 言語ペアとテキストの組み合わせでキー生成
- **期待効果**: 再翻訳時に 90% 以上のキャッシュヒット率、15-30% の高速化

### 2. テキスト抽出最適化
- **不可視要素フィルタリング**: `display:none`, `visibility:hidden`, `opacity:0` の要素を除外
- **アクセシビリティ属性チェック**: `aria-hidden="true"` の要素を除外
- **サイズフィルタリング**: `width: 0`, `height: 0` の要素を除外
- **期待効果**: 翻訳対象テキスト数を 10-20% 削減、API リクエスト数削減

### 3. CSS アニメーション最適化
- **GPU アクセラレーション**: 翻訳適用時に `will-change: contents`, `transform: translate3d(0, 0, 0)` を追加
- **レイヤー最適化**: 翻訳完了後に `will-change` を削除してメモリを解放
- **リフロー最小化**: `DocumentFragment` を活用してバッチ DOM 更新
- **期待効果**: 翻訳適用時の描画速度を 3-5% 改善

### 4. Intersection Observer 遅延翻訳
- **LazyTranslationManager 実装**: ビューポート外の要素を監視し、進入時に翻訳
- **プリロード戦略**: `rootMargin: '200px'` でスクロール前に先行翻訳
- **優先度キュー**: ビューポート中心に近い要素を優先的に翻訳
- **動的コンテンツ対応**: MutationObserver と連携して新規要素を自動監視
- **期待効果**: 大規模ページで初期翻訳時間を 20-40% 短縮、スクロール体感速度向上

## 生成AIの学習用コンテキスト
### ファイルポインタ
- `src/content/content.js`
  - `scanAndTranslate()`: 翻訳フロー全体の制御、フェーズ1/2の実行
  - `extractTextNodes()`: テキストノード抽出ロジック（最適化対象）
  - `applyTranslation()`: 翻訳適用ロジック（CSS最適化対象）
  - `MutationObserver`: 動的コンテンツ検知

- `src/background/translationEngine.js`
  - `TranslationCache`: 現在のメモリキャッシュ実装（拡張対象）
  - `batchTranslate()`: バッチ翻訳処理

- `src/background/openRouterClient.js`
  - `translate()`: API クライアント実装

- `manifest.json`
  - `permissions`: IndexedDB 使用のための権限確認

## Process

### process11 キャッシュ戦略改善（IndexedDB永続化）
#### sub1 IndexedDB キャッシュストア実装
@target: `src/background/persistentCache.js` (新規作成)
@ref: `src/background/translationEngine.js`
- [ ] `PersistentCache` クラスを実装
- [ ] IndexedDB スキーマ定義: `translations` オブジェクトストア (key: `${sourceLang}-${targetLang}-${text}`, value: `{translation, timestamp}`)
- [ ] `init()`: データベース初期化とバージョン管理
- [ ] `get(key)`: キャッシュ取得
- [ ] `set(key, value)`: キャッシュ保存
- [ ] `clear()`: 古いキャッシュクリア（30日以上経過したエントリ）
- [ ] エラーハンドリング: QuotaExceededError の処理

#### sub2 LRUキャッシュサイズ拡張
@target: `src/background/translationEngine.js`
@ref: なし
- [ ] `TranslationCache` の `MAX_SIZE` を 1000 → 5000 に変更
- [ ] メモリ使用量の監視ロジック追加（オプション）
- [ ] LRU アルゴリズムの動作確認テスト

#### sub3 ハイブリッドキャッシュ戦略実装
@target: `src/background/translationEngine.js`
@ref: `src/background/persistentCache.js`
- [ ] `PersistentCache` インスタンスを `TranslationEngine` に統合
- [ ] キャッシュ取得ロジック: メモリキャッシュ → IndexedDB の順で検索
- [ ] キャッシュ保存ロジック: メモリと IndexedDB の両方に保存
- [ ] バックグラウンド同期: メモリキャッシュを定期的に IndexedDB に同期

#### sub4 キャッシュ統計とモニタリング
@target: `src/background/translationEngine.js`
@ref: なし
- [ ] キャッシュヒット率の追跡
- [ ] `getCacheStats()` メソッド実装: `{memoryHits, dbHits, misses, hitRate}`
- [ ] デバッグログ追加: キャッシュヒット/ミスの記録

### process12 テキスト抽出最適化（不可視要素フィルタリング）
#### sub1 不可視要素判定ユーティリティ実装
@target: `src/content/utils/visibility.js` (新規作成)
@ref: なし
- [ ] `isElementVisible(element)` 関数を実装
- [ ] CSS スタイルチェック: `display: none`, `visibility: hidden`, `opacity: 0`
- [ ] サイズチェック: `width === 0`, `height === 0`, `getBoundingClientRect()` で面積 0
- [ ] アクセシビリティ属性チェック: `aria-hidden="true"`
- [ ] 祖先要素の再帰的チェック: 親要素が不可視なら子も不可視

#### sub2 extractTextNodes にフィルタリング統合
@target: `src/content/content.js`
@ref: `src/content/utils/visibility.js`
- [ ] `extractTextNodes()` 内で `isElementVisible()` を呼び出し
- [ ] 不可視要素をスキップするロジック追加
- [ ] TreeWalker のフィルタ条件に統合
- [ ] 除外された要素数をデバッグログに記録

#### sub3 パフォーマンス最適化
@target: `src/content/utils/visibility.js`
@ref: なし
- [ ] 可視性判定結果をキャッシュ（WeakMap 使用）
- [ ] `getBoundingClientRect()` 呼び出しを最小化
- [ ] 早期リターンで不要な計算を回避

### process13 CSSアニメーション最適化（GPU アクセラレーション）
#### sub1 翻訳適用時の GPU レイヤー最適化
@target: `src/content/content.js`
@ref: なし
- [ ] `applyTranslation()` 関数を修正
- [ ] 翻訳適用前に `element.style.willChange = 'contents'` を設定
- [ ] 翻訳適用前に `element.style.transform = 'translate3d(0, 0, 0)'` を設定
- [ ] 翻訳適用後（アニメーション完了後）に `will-change` を削除

#### sub2 バッチ DOM 更新でリフロー最小化
@target: `src/content/content.js`
@ref: なし
- [ ] `DocumentFragment` を使用したバッチ更新実装
- [ ] 同一親要素配下のノードをグループ化
- [ ] `requestAnimationFrame()` でフレーム境界に合わせて適用
- [ ] 更新前に `display: none` で一時的に非表示（オプション）

#### sub3 フォントサイズ保持ロジックの最適化
@target: `src/content/content.js`
@ref: なし
- [ ] 現在の `computedStyle.fontSize` 取得ロジックを維持
- [ ] スタイル取得を `DocumentFragment` 生成前に実行してリフロー削減
- [ ] スタイル適用を `willChange` 設定と同時に実行

### process14 Intersection Observer 遅延翻訳
#### sub1 LazyTranslationManager クラス実装
@target: `src/content/lazyTranslationManager.js` (新規作成)
@ref: なし
- [ ] `LazyTranslationManager` クラスを実装
- [ ] `IntersectionObserver` インスタンス作成: `rootMargin: '200px'`, `threshold: 0.01`
- [ ] 遅延翻訳キューの管理: `Map<Element, TextNode[]>`
- [ ] `observe(element, textNodes)`: 要素を監視対象に追加
- [ ] `handleIntersection(entries)`: ビューポート進入時の翻訳実行
- [ ] 優先度キュー: ビューポート中心からの距離で優先順位決定

#### sub2 scanAndTranslate にビューポート外遅延翻訳統合
@target: `src/content/content.js`
@ref: `src/content/lazyTranslationManager.js`
- [ ] `LazyTranslationManager` インスタンスをグローバルに初期化
- [ ] フェーズ2（ページ全体翻訳）を以下に変更:
  - ビューポート外のテキストノードを即時翻訳**しない**
  - 代わりに `LazyTranslationManager.observe()` で監視登録
- [ ] フェーズ1完了後にフェーズ2の遅延翻訳準備を開始

#### sub3 MutationObserver との連携
@target: `src/content/content.js`
@ref: `src/content/lazyTranslationManager.js`
- [ ] 既存の `MutationObserver` で検知した新規ノードを `LazyTranslationManager` に登録
- [ ] 動的に追加された要素の可視性判定
- [ ] ビューポート内なら即時翻訳、外なら遅延翻訳

#### sub4 遅延翻訳のバッチ処理最適化
@target: `src/content/lazyTranslationManager.js`
@ref: なし
- [ ] 複数要素が同時にビューポート進入した場合のバッチ処理
- [ ] `requestIdleCallback()` で低優先度タスクとして実行
- [ ] 既存のバッチサイズ（10）とコンカレンシー制限（10）を尊重

#### sub5 スクロールパフォーマンス最適化
@target: `src/content/lazyTranslationManager.js`
@ref: なし
- [ ] `IntersectionObserver` のデバウンス処理（必要に応じて）
- [ ] 過去に翻訳済みの要素は再監視しない
- [ ] `unobserve()` で不要な監視を解除してメモリリーク防止

### process50 フォローアップ
#### sub1 メッセージング仕様への準拠確認
@target: `src/content/content.js`, `src/background/messageHandler.js`
@ref: `CLAUDE.md` (Messaging Architecture セクション)
- [ ] 新規メッセージタイプに `type` と `action` の両方が含まれているか確認
- [ ] `MessageType` enum に新規タイプを追加（必要な場合）
- [ ] `MessageHandler` の `actionHandlers` Map に新規ハンドラを登録（必要な場合）

#### sub2 エラーハンドリングとフォールバック
@target: `src/background/persistentCache.js`, `src/content/lazyTranslationManager.js`
@ref: なし
- [ ] IndexedDB が利用不可の場合はメモリキャッシュのみで動作
- [ ] `QuotaExceededError` 発生時に古いキャッシュを自動削除
- [ ] `IntersectionObserver` が利用不可の場合は従来の即時翻訳にフォールバック
- [ ] すべてのエラーをコンソールに記録（デバッグ用）

#### sub3 パフォーマンス測定とログ
@target: `src/content/content.js`
@ref: なし
- [ ] `performance.mark()` で各フェーズの開始/終了を記録
- [ ] `performance.measure()` でフェーズ1/2の所要時間を計測
- [ ] デバッグモードでパフォーマンスログを出力
- [ ] キャッシュヒット率、翻訳対象テキスト数、遅延翻訳数をログ記録

### process100 リファクタリング
- [ ] `src/content/content.js` のコードを機能ごとにモジュール分割（visibility, animation, lazy translation）
- [ ] 共通ユーティリティを `src/content/utils/` に集約
- [ ] マジックナンバー（5000, 200px など）を定数化
- [ ] 型定義を `src/shared/types.ts` に追加（PersistentCacheEntry など）
- [ ] 不要なコメントや冗長なコードを削除

### process200 ドキュメンテーション
- [ ] `CLAUDE.md` の Architecture セクションに高速化改善の説明を追加
- [ ] 各新規クラス/関数に JSDoc コメントを追加
- [ ] `README.md` に高速化機能の概要を追加（Performance Optimizations セクション）
- [ ] IndexedDB スキーマとキャッシュ戦略を図解（オプション）
- [ ] パフォーマンス測定結果をドキュメント化（実装後）

---

**このドキュメントは実装開始前に必ずレビューしてください。**

---

## 11. 翻訳品質と精度の改善

# title: 翻訳品質と精度の改善（要約防止とUI要素除外）

## 概要
- 選択テキスト翻訳時にLLMが内容を要約してしまう問題を解決
- GitHubのアクションボタンなどのUI要素が翻訳されてしまう問題を解決

### 実装の結果、実現される機能
- **全文翻訳の保証**: 長文テキストも要約されず、原文の長さと情報量を保持して翻訳
- **UI要素の適切な除外**: ボタン、フォーム、ナビゲーションリンクなどのインタラクティブ要素を翻訳対象から除外
- **翻訳精度の向上**: コンテンツ領域のみを正確に翻訳し、UIノイズを排除

### goal
- ユーザーが選択したテキストを翻訳する際、内容が要約されずに全文が翻訳される
- GitHubなどのWebサイトで、アクションボタンやナビゲーション要素が翻訳されない
- README、コメント、記事本文などのコンテンツのみが正確に翻訳される

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- TypeScriptの型安全性を維持すること
- 既存の翻訳機能（ページ翻訳、選択翻訳、クリップボード翻訳）に影響を与えない

## 開発のゴール
- **プロンプト改善**: LLMに「要約禁止・全文翻訳」の明示的制約を追加
- **DOM フィルタリング強化**: インタラクティブ要素とARIA属性付き要素を除外
- **翻訳精度向上**: コンテンツとUIの適切な分離により翻訳品質を向上

## 実装仕様

### 1. プロンプトに「要約禁止・全文翻訳」制約を追加
**問題**: `apiClient.ts`の`buildPrompt()`メソッドに「要約禁止」の明示的制約がなく、LLMが長文を要約する可能性がある

**解決策**:
```typescript
return `Translate the following texts to ${languageName}.
Texts are separated by "${this.TEXT_SEPARATOR}".

IMPORTANT RULES:
- Translate the ENTIRE text without summarizing or omitting any content
- Preserve the original length and information density
- Do NOT shorten, condense, or paraphrase the text
- Maintain all details, examples, and explanations from the original
- Each text is independent - translate them separately
- Output must have the same number of translations as inputs (1:1 correspondence)
- Return translations in the same format, separated by "${this.TEXT_SEPARATOR}"

${combined}`;
```

**効果**:
- ✅ 「要約しない」を明示的に禁止
- ✅ 「全文を翻訳する」ことを強制
- ✅ 「原文の長さを保つ」ことを指示
- ✅ 複数テキストの統合を防止

### 2. DOMフィルタリングにインタラクティブ要素除外を追加
**問題**: 現在の`DOMManipulator.ts`は`SCRIPT`, `STYLE`, `NOSCRIPT`, `IFRAME`のみを除外し、ボタンやリンクなどのUI要素が翻訳されてしまう

**解決策**:
```typescript
// domManipulator.tsに追加
private readonly INTERACTIVE_ELEMENTS = new Set([
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA',
  'A', 'LABEL', 'OPTION'
]);

private readonly SKIP_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab',
  'switch', 'checkbox', 'radio', 'combobox',
  'menubar', 'toolbar', 'navigation'
]);

// acceptNode()に追加のフィルタリング
- インタラクティブ要素のタグ名チェック
- ARIA roleチェック
- aria-label/aria-describedby属性チェック
```

**効果**:
- ✅ GitHubのボタン、フォーム、ナビゲーションが除外される
- ✅ ARIA属性付きUI要素が除外される
- ✅ 汎用的で即効性が高い（80-90%の問題を解決）

## 生成AIの学習用コンテキスト

### Background Script
- `src/background/apiClient.ts`
  - L306-319: `buildPrompt()`メソッド - プロンプト生成ロジック（修正対象）
  - L107-312: `TEXT_SEPARATOR`使用箇所 - 複数テキスト処理

### Content Script
- `src/content/domManipulator.ts`
  - L46-86: `extractTextNodes()`メソッド - テキストノード抽出とフィルタリング（修正対象）
  - L70-80: `acceptNode()`メソッド - フィルタリング条件（拡張対象）
  - L15-20: `IGNORED_TAGS`定数 - 現在の除外タグリスト

### Config
- `src/shared/constants/config.ts`
  - L178-190: `EXCLUSION_SELECTORS`定数 - 定義されているが未使用（参考）

## Process

### process1 プロンプトに「要約禁止・全文翻訳」制約を追加

#### sub1 buildPrompt()メソッドにIMPORTANT RULESセクションを追加
@target: `src/background/apiClient.ts`
@ref: `src/background/apiClient.ts:306-319`

- [ ] `buildPrompt()`メソッド内のプロンプト文字列を修正
- [ ] IMPORTANT RULESセクションを追加
  - "Translate the ENTIRE text without summarizing or omitting any content"
  - "Preserve the original length and information density"
  - "Do NOT shorten, condense, or paraphrase the text"
  - "Maintain all details, examples, and explanations from the original"
  - "Each text is independent - translate them separately"
  - "Output must have the same number of translations as inputs (1:1 correspondence)"
- [ ] JSDocコメントを更新（必要に応じて）

#### sub2 プロンプトトークン増加の影響確認
@target: `src/background/apiClient.ts`
@ref: なし

- [ ] プロンプトトークン数の増加量を確認（約100トークン増加予想）
- [ ] コスト影響が微小であることを確認（全体の1%未満）
- [ ] 既存のテストケースが影響を受けないことを確認

### process2 DOMフィルタリングにインタラクティブ要素除外を追加

#### sub1 インタラクティブ要素とARIA role定数を追加
@target: `src/content/domManipulator.ts`
@ref: `src/content/domManipulator.ts:15-20`

- [ ] `INTERACTIVE_ELEMENTS`定数を追加
  - `Set`型で以下を定義: `BUTTON`, `INPUT`, `SELECT`, `TEXTAREA`, `A`, `LABEL`, `OPTION`
- [ ] `SKIP_ROLES`定数を追加
  - `Set`型で以下を定義: `button`, `link`, `menuitem`, `tab`, `switch`, `checkbox`, `radio`, `combobox`, `menubar`, `toolbar`, `navigation`
- [ ] プライベートメンバーとして宣言

#### sub2 acceptNode()メソッドにフィルタリングロジックを追加
@target: `src/content/domManipulator.ts`
@ref: `src/content/domManipulator.ts:70-80`

- [ ] インタラクティブ要素のタグ名チェックを追加
  ```typescript
  if (this.INTERACTIVE_ELEMENTS.has(parent.tagName)) {
    return NodeFilter.FILTER_REJECT;
  }
  ```
- [ ] ARIA roleチェックを追加
  ```typescript
  const role = parent.getAttribute('role');
  if (role && this.SKIP_ROLES.has(role)) {
    return NodeFilter.FILTER_REJECT;
  }
  ```
- [ ] ARIA属性チェックを追加
  ```typescript
  if (parent.hasAttribute('aria-label') ||
      parent.hasAttribute('aria-describedby')) {
    return NodeFilter.FILTER_REJECT;
  }
  ```

#### sub3 フィルタリングのパフォーマンス最適化
@target: `src/content/domManipulator.ts`
@ref: なし

- [ ] `Set`型の使用により、O(1)でのルックアップを保証
- [ ] 早期リターンにより不要な処理を回避
- [ ] `getAttribute()`呼び出しを最小化

### process10 ユニットテスト

#### sub1 buildPrompt()の要約禁止ルールテスト
@target: `tests/unit/background/apiClient.test.ts`
@ref: なし

- [ ] `buildPrompt()`が正しくIMPORTANT RULESを含むことをテスト
- [ ] プロンプトに"ENTIRE text", "Do NOT shorten"などのキーワードが含まれることを確認
- [ ] 複数テキスト時に"1:1 correspondence"が含まれることを確認

#### sub2 acceptNode()のインタラクティブ要素除外テスト
@target: `tests/unit/content/domManipulator.test.ts`
@ref: なし

- [ ] `BUTTON`要素のテキストが除外されることをテスト
- [ ] `INPUT`要素のテキストが除外されることをテスト
- [ ] `role="button"`を持つ要素が除外されることをテスト
- [ ] `aria-label`を持つ要素が除外されることをテスト
- [ ] 通常の`<p>`要素は除外されないことをテスト（リグレッション防止）

#### sub3 統合テスト - 選択翻訳で要約が起きないことを確認
@target: `tests/integration/translation.test.ts`
@ref: なし

- [ ] 500-1000文字の長文を選択翻訳してテスト
- [ ] 翻訳結果の文字数が大幅に減少していないことを確認（±20%以内）
- [ ] 複数段落のテキストで全段落が翻訳されることを確認

#### sub4 統合テスト - GitHubページでUI要素が除外されることを確認
@target: `tests/integration/github.test.ts`
@ref: なし

- [ ] GitHubのREADMEページをテスト対象とする
- [ ] ボタン（"Fork", "Star"など）のテキストが翻訳されないことを確認
- [ ] ナビゲーションリンクが翻訳されないことを確認
- [ ] README本文は正しく翻訳されることを確認

### process50 フォローアップ

#### sub1 リンクテキストの扱いに関するフィードバック収集
@target: なし
@ref: なし

- [ ] 実装後、ユーザーフィードバックを収集
- [ ] コンテンツ領域内のリンクテキストが翻訳されない問題が報告された場合、条件分岐を追加
  - 例: `article`, `.markdown-body`内の`<a>`タグのみ翻訳対象とする

#### sub2 他サイトでの動作確認
@target: なし
@ref: なし

- [ ] Twitter、YouTube、Wikipedia等で動作確認（オプション）
- [ ] サイト固有の問題が発見された場合、Phase 2（サイト別セレクター）の実装を検討

### process100 リファクタリング

#### sub1 定数の整理
@target: `src/content/domManipulator.ts`
@ref: `src/shared/constants/config.ts`

- [ ] `INTERACTIVE_ELEMENTS`と`SKIP_ROLES`を`config.ts`に移動するか検討
- [ ] 現状は`domManipulator.ts`のプライベートメンバーとして保持（シンプル性優先）

#### sub2 コードコメントの充実
@target: `src/content/domManipulator.ts`, `src/background/apiClient.ts`
@ref: なし

- [ ] 各フィルタリング条件にコメントを追加
- [ ] なぜその要素を除外するのか理由を明記

### process200 ドキュメンテーション

#### sub1 CLAUDE.mdの更新
@target: `CLAUDE.md`
@ref: `CLAUDE.md`

- [ ] Translation Flowセクションに「要約防止プロンプト」を追記
- [ ] Key Componentsセクションに「インタラクティブ要素フィルタリング」を追加
- [ ] Messaging Architectureセクションは変更なし（メッセージ型は追加されないため）

#### sub2 実装変更のCHANGELOG記録
@target: `CHANGELOG.md`
@ref: なし

- [ ] バージョン番号を更新（例: v1.3.0）
- [ ] 変更内容を記載
  ```markdown
  ## [1.3.0] - 2025-XX-XX

  ### Fixed
  - 選択テキスト翻訳時に内容が要約される問題を修正（プロンプトに要約禁止制約を追加）
  - GitHubのアクションボタンやUI要素が翻訳される問題を修正（インタラクティブ要素フィルタリング強化）

  ### Changed
  - apiClient.buildPrompt(): IMPORTANT RULESセクションを追加（全文翻訳を強制）
  - domManipulator.acceptNode(): インタラクティブ要素とARIA属性のフィルタリングを追加
  ```

#### sub3 README.mdの更新（オプション）
@target: `README.md`
@ref: なし

- [ ] Features セクションに「正確な全文翻訳」と「UI要素の適切な除外」を追加（必要に応じて）

---

## 検証基準

### 機能検証
- [ ] 500-1000文字の長文選択翻訳で要約が起きない
- [ ] GitHubのボタン、フォーム、ナビゲーションが翻訳されない
- [ ] README、Issue、コメント本文は正しく翻訳される
- [ ] 既存の選択翻訳機能に影響がない
- [ ] 既存のページ翻訳機能に影響がない
- [ ] 既存のクリップボード翻訳機能に影響がない

### コード品質検証
- [ ] すべてのユニットテストがパス
- [ ] `npm run lint` がエラーなく完了
- [ ] TypeScriptコンパイルエラーなし
- [ ] 型安全性が維持されている

### パフォーマンス検証
- [ ] プロンプトトークン増加が微小（100トークン程度）
- [ ] DOM走査のパフォーマンス劣化がない
- [ ] メモリリークがない

---

## リスク管理

### リスク1: リンクテキストの翻訳が完全に除外される
**発生確率**: Medium
**影響**: 記事内のハイパーリンクテキスト（「詳細はこちら」など）も翻訳されなくなる

**軽減策**:
- 実装後、実際のGitHubページでテスト
- 問題が確認された場合、コンテンツ領域内（`article`, `.markdown-body`）の`<a>`タグのみ翻訳対象とする条件分岐を追加
- ユーザーフィードバックに基づいて調整

### リスク2: LLMが指示に従わない可能性
**発生確率**: Low
**影響**: 一部のLLMモデルが依然として要約を行う可能性

**軽減策**:
- 複数の強調表現を使用（"ENTIRE", "DO NOT", "Preserve"）
- 大文字・否定形・肯定形を組み合わせて指示を強化
- 必要に応じてモデル固有のプロンプト調整を実施

### リスク3: 誤検知によるコンテンツの翻訳漏れ
**発生確率**: Low
**影響**: 正当なコンテンツが誤ってUI要素と判定され、翻訳されない

**軽減策**:
- Phase 1実装後、実際のGitHubページで動作テスト
- 翻訳されるべきコンテンツが除外されていないか確認
- 問題があれば、フィルタリング条件を微調整

---

## 実装時間見積もり

| Process | タスク | 見積時間 | 備考 |
|---------|--------|---------|------|
| process1 | プロンプト改善 | 30分 | シンプルな文字列修正 |
| process2 | DOM フィルタリング強化 | 1.5時間 | 定数追加とロジック実装 |
| process10 | ユニットテスト | 2時間 | 4つのテストファイル作成 |
| process50 | フォローアップ | 30分 | 動作確認とフィードバック |
| process100 | リファクタリング | 30分 | コード整理とコメント |
| process200 | ドキュメンテーション | 45分 | 3つのドキュメント更新 |

**合計**: 約5.5時間

---

## 完了基準

### 技術的完了基準
- ✅ すべてのprocess (1-200) が完了
- ✅ すべてのユニットテストがパス
- ✅ `npm run lint` がエラーなく完了
- ✅ TypeScriptコンパイルエラーなし

### 機能完了基準
- ✅ 長文選択翻訳で要約が起きない
- ✅ GitHubのUI要素が翻訳されない
- ✅ README本文は正しく翻訳される
- ✅ 既存機能に影響がない

### ドキュメント完了基準
- ✅ CLAUDE.mdが更新されている
- ✅ CHANGELOG.mdが更新されている

---

**このセクションは2025-XX-XX時点の調査結果に基づいています。実装開始前に最新のコードベースを確認してください。**

