# title: ビューポート優先翻訳機能

## 概要
現在表示中のテキストを最優先で翻訳し、段階的に表示することでユーザー体験を向上させる機能。ビューポート内のテキストを先に翻訳して即座に表示し、その後ページ全体の翻訳を完了する。

### goal
- ユーザーが翻訳開始後、数秒以内に画面内のテキストの翻訳結果を確認できる
- ページ全体の翻訳完了を待たずに内容を読み始められる
- 段階的表示により体感速度が向上する

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること
- メッセージングアーキテクチャでは`type`と`action`の両方を必須とする
- すべての新しいメッセージタイプにはユニットテストを追加すること

## 開発のゴール
- ビューポート内のテキストを優先的に翻訳（Phase 1）
- Phase 1完了後、ページ全体の翻訳を完了（Phase 2）
- フェーズ別進捗表示の実装
- セミ並列処理によるパフォーマンス最適化

---

## 1. 背景と目的

### 1.1 背景
現在、geminitranslate拡張機能には以下の課題が存在します：

1. **翻訳完了まで全く結果が見えない**
   - ページ全体の翻訳が完了するまでユーザーは待つ必要がある
   - 大きなページでは数十秒待たされる可能性がある
   - ユーザーは翻訳が進行しているか不安になる

2. **並列処理のみで段階的表示がない**
   - 現在は全バッチを並列処理（CONCURRENCY_LIMIT: 10）
   - 完了順がランダムでユーザーの読む順序と一致しない
   - ビューポート外の翻訳も同時に進行し、リソースを消費

3. **進捗表示が単純**
   - 単純な「X/Y完了」のみ
   - どの部分が翻訳中か分からない
   - フェーズの概念がない

### 1.2 目的
- **UX改善**: 翻訳開始から数秒で画面内のテキスト翻訳を完了
- **体感速度向上**: 段階的表示により、実際の処理時間が同じでも速く感じる
- **リソース最適化**: ビューポート内を優先することで、ユーザーが必要とする情報を優先的に処理
- **進捗の可視化**: Phase 1/2の表示でユーザーに処理状況を明確に伝達

---

## 2. 現状分析

### 2.1 既存実装の状態

#### ✅ 実装済みコンポーネント
| コンポーネント | ファイルパス | 実装状態 | 備考 |
|--------------|------------|---------|-----|
| translatePage | `src/content/contentScript.ts:171-266` | ✅ 完了 | 翻訳の基本フロー実装済み |
| extractTextNodes | `src/content/domManipulator.ts:31-71` | ✅ 完了 | TreeWalkerによるDOM走査 |
| translateBatch | `src/background/translationEngine.ts:130-216` | ✅ 完了 | バッチ並列処理実装済み |
| ProgressNotification | `src/content/progressNotification.ts:148-164` | ✅ 完了 | 進捗表示UI実装済み |
| BATCH_CONFIG | `src/shared/constants/config.ts:30-50` | ✅ 完了 | バッチ処理設定定義済み |

#### ❌ 未実装機能
1. **ビューポート検出機能**
   - getBoundingClientRect()によるビューポート内/外判定
   - TextNodeに対するビューポート判定

2. **キュー分離ロジック**
   - ビューポート内/外のキュー分離
   - 段階的処理（Phase 1 → Phase 2）

3. **セミ並列実行制御**
   - 最初の2-3バッチを順次処理
   - 残りのバッチを並列処理

4. **フェーズ別進捗表示**
   - Phase 1: ビューポート内翻訳の進捗
   - Phase 2: ページ全体翻訳の進捗

### 2.2 問題点の明確化

#### 問題1: ビューポート検出機能の欠如
**症状**: 全テキストノードを同じ優先度で処理

**原因**:
- `extractTextNodes()`はビューポート判定を行わない
- すべてのノードが同一キューに入る
- 並列処理により完了順がランダム

**影響範囲**:
- ユーザーが見ている部分の翻訳が遅れる可能性
- ビューポート外の翻訳に先にリソースを消費

#### 問題2: 段階的表示の欠如
**症状**: 翻訳完了まで全く結果が見えない

**原因**:
- Phase 1/2の概念がない
- すべてのバッチが同時に処理される
- DOM更新が一括で行われる

**影響範囲**:
- 体感速度が遅い
- ユーザーが待ち時間を長く感じる
- 進行状況が分かりにくい

#### 問題3: 進捗表示の単純さ
**症状**: 「X/Y完了」のみで詳細が分からない

**原因**:
- `ProgressNotification`がフェーズの概念を持たない
- 単純なパーセンテージ表示のみ

**影響範囲**: ユーザーが現在どの段階かを把握できない

---

## 3. 要件定義

### 3.1 技術仕様

| 項目 | 仕様 | 実装方法 |
|------|------|---------|
| 処理方式 | 段階的表示（Phase 1 → Phase 2） | ビューポートキュー分離 + 順次実行 |
| 並列処理 | セミ並列（最初2-3バッチ順次、残り並列） | translateBatchSemiParallel() |
| 検出方式 | getBoundingClientRect()によるビューポート判定 | domManipulator.detectViewportNodes() |
| 進捗表示 | フェーズ別（Phase 1: X%, Phase 2: Y%） | progressNotification.updatePhase() |
| バッチサイズ | 10（既存のBATCH_SIZE） | BATCH_CONFIG.BATCH_SIZE |
| 優先バッチ数 | 2-3（順次処理するバッチ数） | VIEWPORT_PRIORITY_BATCHES設定 |

### 3.2 アーキテクチャ設計

| レイヤー | コンポーネント | 役割 |
|---------|-------------|------|
| Content Script | domManipulator.ts | ビューポート検出、キュー分離 |
| Content Script | contentScript.ts | Phase 1/2の制御、DOM更新 |
| Background Script | translationEngine.ts | セミ並列実行制御 |
| UI | progressNotification.ts | フェーズ別進捗表示 |
| 型定義 | types.ts | ViewportQueue, TranslationPhase型 |
| 設定 | config.ts | VIEWPORT_PRIORITY_BATCHES定数 |

### 3.3 影響範囲

| カテゴリ | 影響を受けるファイル | 変更内容 |
|---------|-------------------|---------|
| Content Script | contentScript.ts | translatePage()修正（Phase 1/2処理追加） |
| Content Script | domManipulator.ts | detectViewportNodes()メソッド追加 |
| Background Script | translationEngine.ts | translateBatchSemiParallel()メソッド追加 |
| UI | progressNotification.ts | updatePhase()メソッド追加 |
| 型定義 | types.ts | ViewportQueue, TranslationPhase型追加 |
| 設定 | config.ts | VIEWPORT_PRIORITY_BATCHES設定追加 |

### 3.4 リスク評価

| リスク | レベル | 影響 | 対策 |
|-------|--------|------|------|
| パフォーマンス低下 | Medium | 順次処理によりTotal時間増加の可能性 | 段階的表示でUX改善、Phase 2は並列処理で高速化 |
| ビューポート誤検出 | Low | 不可視要素を優先処理してしまう | getBoundingClientRectは既存実装で実績あり、シンプルで確実 |
| 並列処理の複雑化 | Medium | バグ発生リスク | セミ並列でリスク分散、最初2-3バッチは順次処理で安定性確保 |
| 既存機能への影響 | Low | 既存の並列処理ロジックに影響 | 既存のtranslateBatch()は維持、新規メソッド追加で分離 |

---

## 4. 生成AIコンテキスト

### 4.1 データフロー
```
ユーザー操作
  ↓
ContentScript.translatePage()
  ↓
DOMManipulator.detectViewportNodes()
  ↓ (ビューポート内/外を分離)
キュー分離（viewport / outOfViewport）
  ↓
[Phase 1] TranslationEngine.translateBatchSemiParallel(viewportNodes)
  ↓ (最初2-3バッチ順次、残り並列)
セミ並列実行
  ↓
ProgressNotification.updatePhase(1, current, total)
  ↓
DOM更新（ビューポート内のみ）
  ↓
[Phase 2] TranslationEngine.translateBatchSemiParallel(outOfViewportNodes)
  ↓ (すべて並列処理)
並列実行
  ↓
ProgressNotification.updatePhase(2, current, total)
  ↓
DOM更新（ページ全体完了）
```

### 4.2 主要な変更点
| ファイル | 変更内容 | 参照行 |
|---------|---------|--------|
| domManipulator.ts | detectViewportNodes()メソッド追加 | - |
| contentScript.ts | translatePage()にPhase 1/2処理追加 | 171-266 |
| translationEngine.ts | translateBatchSemiParallel()メソッド追加 | 130-216 |
| progressNotification.ts | updatePhase()メソッド追加 | 148-164 |
| types.ts | ViewportQueue, TranslationPhase型追加 | - |
| config.ts | VIEWPORT_PRIORITY_BATCHES設定追加 | 30-50 |

### 4.3 参照すべきコード
| ファイルパス | 行番号 | 説明 |
|------------|--------|------|
| `src/content/contentScript.ts` | 171-266 | translatePage()メソッド - 翻訳処理の全体フロー |
| `src/content/domManipulator.ts` | 31-71 | extractTextNodes() - TreeWalkerによるDOM走査パターン |
| `src/background/translationEngine.ts` | 130-216 | translateBatch() - バッチ並列処理の実装 |
| `src/content/progressNotification.ts` | 148-164 | update() - 進捗表示の更新ロジック |
| `src/content/floatingUI.ts` | - | getBoundingClientRect()使用例（位置計算） |
| `src/shared/constants/config.ts` | 30-50 | BATCH_CONFIG - バッチ処理の設定定数 |

---

## 5. 実装計画

### process1: ビューポート検出ロジック実装
**@target**: `src/content/domManipulator.ts`
**@ref**: `src/content/floatingUI.ts`（getBoundingClientRect使用例）

- [ ] detectViewportNodes(nodes: TextNode[]): { viewport: TextNode[], outOfViewport: TextNode[] }メソッド追加
- [ ] getBoundingClientRect()でビューポート内判定（window.innerHeight, window.innerWidthと比較）
- [ ] extractTextNodes()にビューポート判定オプション追加（withViewportDetection: boolean）

**実装詳細**:
```typescript
/**
 * ビューポート内/外のノードを分離
 * @param nodes 全テキストノード
 * @returns ビューポート内/外に分離されたノード
 */
detectViewportNodes(nodes: TextNode[]): { viewport: TextNode[], outOfViewport: TextNode[] } {
  const viewport: TextNode[] = [];
  const outOfViewport: TextNode[] = [];

  nodes.forEach(node => {
    const element = node.element;
    const rect = element.getBoundingClientRect();

    // ビューポート内判定
    const isInViewport = (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );

    if (isInViewport) {
      viewport.push(node);
    } else {
      outOfViewport.push(node);
    }
  });

  return { viewport, outOfViewport };
}
```

---

### process2: キュー分離ロジック実装
**@target**: `src/content/contentScript.ts`
**@ref**: `src/content/domManipulator.ts`

- [ ] translatePage()内でビューポート内/外の分離処理追加
- [ ] this.domManipulator.detectViewportNodes(this.extractedNodes)呼び出し
- [ ] Phase 1: viewportNodesを優先処理
- [ ] Phase 2: outOfViewportNodesを後続処理

**実装詳細**:
```typescript
private async translatePage(targetLanguage: string): Promise<void> {
  try {
    // Extract text nodes
    this.extractedNodes = this.domManipulator.extractTextNodes();

    // ビューポート内/外の分離
    const { viewport, outOfViewport } = this.domManipulator.detectViewportNodes(this.extractedNodes);

    console.log(`[ContentScript] Viewport nodes: ${viewport.length}, Out of viewport: ${outOfViewport.length}`);

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
          semiParallel: true,  // NEW: セミ並列処理フラグ
          priorityCount: 3,    // NEW: 優先バッチ数
        },
      });

      if (response1?.success && response1?.data?.translations) {
        this.domManipulator.applyTranslations(viewport, response1.data.translations);
        this.progressNotification.completePhase(1);
      }
    }

    // Phase 2: ページ全体の翻訳
    if (outOfViewport.length > 0) {
      this.progressNotification.showPhase(2, outOfViewport.length);
      const outOfViewportTexts = outOfViewport.map(node => node.text);

      const response2 = await this.messageBus.send({
        type: MessageType.REQUEST_TRANSLATION,
        action: 'requestTranslation',
        payload: {
          texts: outOfViewportTexts,
          targetLanguage,
          semiParallel: false,  // Phase 2は通常の並列処理
        },
      });

      if (response2?.success && response2?.data?.translations) {
        this.domManipulator.applyTranslations(outOfViewport, response2.data.translations);
        this.progressNotification.completePhase(2);
      }
    }

    this.isTranslated = true;
    this.progressNotification.complete();

  } catch (error) {
    logger.error('Failed to translate page:', error);
    this.progressNotification.error(error instanceof Error ? error.message : 'Translation failed');
    throw error;
  }
}
```

---

### process3: セミ並列実行制御実装
**@target**: `src/background/translationEngine.ts`
**@ref**: なし

- [ ] translateBatchSemiParallel(texts: string[], targetLanguage: string, priorityCount: number)メソッド追加
- [ ] priorityCountで最初の順次処理バッチ数指定（デフォルト: 3）
- [ ] 最初のpriorityCountバッチは順次処理（awaitで待機）
- [ ] 残りのバッチは並列処理（Promise.all()）
- [ ] translateBatch()にsemiParallel, priorityCountオプション追加

**実装詳細**:
```typescript
/**
 * セミ並列バッチ翻訳
 * 最初の数バッチを順次処理し、残りを並列処理する
 *
 * @param texts 翻訳するテキスト配列
 * @param targetLanguage 翻訳先言語
 * @param priorityCount 順次処理するバッチ数（デフォルト: 3）
 * @returns 翻訳結果配列
 */
async translateBatchSemiParallel(
  texts: string[],
  targetLanguage: string,
  priorityCount: number = 3
): Promise<string[]> {
  const batches = this.createBatches(texts, BATCH_CONFIG.BATCH_SIZE);
  const results: string[] = [];

  // Phase 1: 最初のpriorityCountバッチを順次処理
  const priorityBatches = batches.slice(0, priorityCount);
  const remainingBatches = batches.slice(priorityCount);

  console.log(`[TranslationEngine] Semi-parallel: ${priorityBatches.length} sequential, ${remainingBatches.length} parallel`);

  // 順次処理
  for (const batch of priorityBatches) {
    const batchResults = await this.client.translate(batch, targetLanguage);
    results.push(...batchResults);

    // 進捗通知
    this.notifyProgress(results.length, texts.length);
  }

  // Phase 2: 残りを並列処理
  if (remainingBatches.length > 0) {
    const parallelPromises = remainingBatches.map(batch =>
      this.client.translate(batch, targetLanguage)
    );

    const parallelResults = await Promise.all(parallelPromises);
    parallelResults.forEach(batchResults => {
      results.push(...batchResults);
    });
  }

  return results;
}

/**
 * バッチ翻訳（既存メソッドを拡張）
 */
async translateBatch(
  texts: string[],
  targetLanguage: string,
  options?: {
    semiParallel?: boolean;
    priorityCount?: number;
  }
): Promise<string[]> {
  if (options?.semiParallel) {
    return this.translateBatchSemiParallel(texts, targetLanguage, options.priorityCount);
  }

  // 既存の並列処理ロジック
  return this.translateBatchParallel(texts, targetLanguage);
}
```

---

### process4: フェーズ別進捗表示実装
**@target**: `src/content/progressNotification.ts`
**@ref**: なし

- [ ] updatePhase(phase: 1 | 2, current: number, total: number)メソッド追加
- [ ] Phase 1: "ビューポート内を翻訳中... X%"
- [ ] Phase 2: "ページ全体を翻訳中... Y%"
- [ ] contentScript.tsからupdatePhase()呼び出し実装

**実装詳細**:
```typescript
/**
 * 現在のフェーズ（1 or 2）
 */
private currentPhase: 1 | 2 | null = null;

/**
 * フェーズ別進捗表示
 *
 * @param phase 翻訳フェーズ（1: ビューポート内, 2: ページ全体）
 * @param current 現在の完了数
 * @param total 全体数
 */
updatePhase(phase: 1 | 2, current: number, total: number): void {
  this.currentPhase = phase;
  const percentage = Math.round((current / total) * 100);

  const phaseMessage = phase === 1
    ? `ビューポート内を翻訳中... ${percentage}%`
    : `ページ全体を翻訳中... ${percentage}%`;

  this.updateMessage(phaseMessage);
  this.updatePercentage(percentage);

  console.log(`[ProgressNotification] Phase ${phase}: ${current}/${total} (${percentage}%)`);
}

/**
 * フェーズ開始通知
 */
showPhase(phase: 1 | 2, total: number): void {
  this.currentPhase = phase;
  const phaseMessage = phase === 1
    ? `ビューポート内を翻訳中... 0%`
    : `ページ全体を翻訳中... 0%`;

  this.show(total);
  this.updateMessage(phaseMessage);
}

/**
 * フェーズ完了通知
 */
completePhase(phase: 1 | 2): void {
  const phaseMessage = phase === 1
    ? `ビューポート内の翻訳完了`
    : `ページ全体の翻訳完了`;

  this.updateMessage(phaseMessage);
  console.log(`[ProgressNotification] Phase ${phase} completed`);
}
```

---

### process5: 型定義追加
**@target**: `src/shared/types/index.ts`
**@ref**: なし

- [ ] ViewportQueue型追加（viewport: TextNode[], outOfViewport: TextNode[]）
- [ ] TranslationPhase型追加（type TranslationPhase = 1 | 2）

**実装詳細**:
```typescript
/**
 * ビューポート内/外のキュー
 */
export interface ViewportQueue {
  /**
   * ビューポート内のテキストノード
   */
  viewport: TextNode[];

  /**
   * ビューポート外のテキストノード
   */
  outOfViewport: TextNode[];
}

/**
 * 翻訳フェーズ
 * 1: ビューポート内優先翻訳
 * 2: ページ全体翻訳
 */
export type TranslationPhase = 1 | 2;

/**
 * 翻訳リクエストペイロード（拡張）
 */
export interface TranslationRequestPayload {
  texts: string[];
  targetLanguage: string;

  /**
   * セミ並列処理を使用するか（オプション）
   */
  semiParallel?: boolean;

  /**
   * 優先バッチ数（セミ並列処理時のみ有効）
   */
  priorityCount?: number;
}
```

---

### process10: ユニットテスト
**@target**:
- `tests/unit/content/domManipulator.test.ts`
- `tests/unit/background/translationEngine.test.ts`
- `tests/unit/content/progressNotification.test.ts`

**@ref**: なし

- [ ] domManipulator: detectViewportNodes()のテスト（ビューポート内外判定、境界値）
- [ ] translationEngine: translateBatchSemiParallel()のテスト（順次→並列処理、priorityCount）
- [ ] progressNotification: updatePhase()のテスト（Phase 1/2メッセージ）

**実装詳細**:

#### domManipulator.test.ts
```typescript
describe('DOMManipulator - detectViewportNodes', () => {
  it('should detect nodes in viewport', () => {
    // Setup: ビューポート内のノードを作成
    const inViewportNode = createMockNode({ top: 100, bottom: 200, left: 100, right: 200 });
    const nodes = [inViewportNode];

    const result = manipulator.detectViewportNodes(nodes);

    expect(result.viewport.length).toBe(1);
    expect(result.outOfViewport.length).toBe(0);
  });

  it('should detect nodes out of viewport', () => {
    // Setup: ビューポート外のノードを作成（画面下）
    const outOfViewportNode = createMockNode({ top: 2000, bottom: 2100, left: 100, right: 200 });
    const nodes = [outOfViewportNode];

    const result = manipulator.detectViewportNodes(nodes);

    expect(result.viewport.length).toBe(0);
    expect(result.outOfViewport.length).toBe(1);
  });

  it('should handle boundary cases', () => {
    // 境界線上のノード
    const boundaryNode = createMockNode({ top: window.innerHeight - 10, bottom: window.innerHeight + 10 });
    const nodes = [boundaryNode];

    const result = manipulator.detectViewportNodes(nodes);

    // 一部が見えていればビューポート内とする
    expect(result.viewport.length).toBe(1);
  });
});
```

#### translationEngine.test.ts
```typescript
describe('TranslationEngine - translateBatchSemiParallel', () => {
  it('should process priority batches sequentially', async () => {
    const texts = Array(50).fill('test');  // 5バッチ分
    const callOrder: number[] = [];

    mockClient.translate.mockImplementation(async (batch) => {
      callOrder.push(batch.length);
      return batch.map(() => 'translated');
    });

    await engine.translateBatchSemiParallel(texts, 'ja', 3);

    // 最初の3バッチが順次処理されることを確認
    expect(callOrder.slice(0, 3)).toEqual([10, 10, 10]);
  });

  it('should process remaining batches in parallel', async () => {
    const texts = Array(50).fill('test');

    const result = await engine.translateBatchSemiParallel(texts, 'ja', 2);

    expect(result.length).toBe(50);
    // 残りのバッチが並列処理されることを確認（完了順が順不同）
  });

  it('should respect priorityCount parameter', async () => {
    const texts = Array(30).fill('test');  // 3バッチ分

    await engine.translateBatchSemiParallel(texts, 'ja', 1);

    // priorityCount=1の場合、最初の1バッチのみ順次処理
    expect(mockClient.translate).toHaveBeenCalledTimes(3);
  });
});
```

#### progressNotification.test.ts
```typescript
describe('ProgressNotification - updatePhase', () => {
  it('should display Phase 1 message', () => {
    notification.updatePhase(1, 5, 10);

    expect(notification.getMessage()).toContain('ビューポート内を翻訳中');
    expect(notification.getPercentage()).toBe(50);
  });

  it('should display Phase 2 message', () => {
    notification.updatePhase(2, 8, 10);

    expect(notification.getMessage()).toContain('ページ全体を翻訳中');
    expect(notification.getPercentage()).toBe(80);
  });

  it('should update phase completion', () => {
    notification.showPhase(1, 10);
    notification.completePhase(1);

    expect(notification.getMessage()).toContain('ビューポート内の翻訳完了');
  });
});
```

---

### process200: ドキュメンテーション
**@target**: `CLAUDE.md`
**@ref**: なし

- [ ] Translation Flowセクションにビューポート優先翻訳の説明追加
- [ ] 段階的表示の仕組み、セミ並列処理、フェーズ別進捗の説明
- [ ] Content Script Featuresセクションに"Viewport-priority translation with progressive rendering"追加

**実装詳細**:

#### CLAUDE.md更新内容
```markdown
## Translation Flow (更新)

### Viewport-Priority Translation Flow
1. User triggers translation via popup button or keyboard shortcut (Alt+W)
2. background.js receives command and forwards to content.js via message passing
3. content.js performs the following phases:

**Phase 1: Viewport-Priority Translation**
- Scan DOM and extract all text nodes using TreeWalker
- Detect viewport nodes using getBoundingClientRect()
- Separate nodes into viewport/outOfViewport queues
- Send viewport texts to background for semi-parallel translation:
  - First 2-3 batches processed sequentially
  - Remaining batches processed in parallel
- Apply translations to viewport nodes immediately
- Show Phase 1 progress: "ビューポート内を翻訳中... X%"

**Phase 2: Full-Page Translation**
- Send outOfViewport texts to background for parallel translation
- All batches processed in parallel (standard CONCURRENCY_LIMIT)
- Apply translations to remaining nodes
- Show Phase 2 progress: "ページ全体を翻訳中... Y%"

4. MutationObserver detects dynamic content changes for real-time translation

### Key Components
- **Translation Cache**: Map-based caching system to avoid duplicate API calls
- **Batch Processing**: Groups text elements for efficient API usage (BATCH_SIZE = 10)
- **Semi-Parallel Processing**: First 2-3 batches sequential, remaining parallel
- **Viewport Detection**: getBoundingClientRect() for accurate viewport identification
- **Phase-Based Progress**: Real-time progress updates with phase distinction
- **MutationObserver**: Detects dynamic content changes for real-time translation
- **Font Size Preservation**: Maintains original styling after translation

### Content Script Features
- Selection-based translation with floating UI
- Clipboard content translation
- Dynamic content detection and translation
- Dark mode support with automatic theme detection
- **Viewport-priority translation with progressive rendering** (NEW)
- **Phase-based progress notification** (NEW)
- **Semi-parallel batch processing** (NEW)
```

---

## 6. 完了基準

### 6.1 機能完了基準
- ✅ ビューポート内のテキストが優先的に翻訳される（Phase 1）
- ✅ Phase 1完了後、ページ全体の翻訳が実行される（Phase 2）
- ✅ フェーズ別進捗表示が正しく動作する（"ビューポート内..." → "ページ全体..."）
- ✅ セミ並列処理により、最初の2-3バッチが順次処理される
- ✅ Phase 2では標準の並列処理が使用される

### 6.2 品質基準
- ✅ すべてのユニットテストがパス（カバレッジ80%以上）
- ✅ `npm run lint`がエラーなく完了
- ✅ TypeScriptコンパイルエラーなし
- ✅ JSDocドキュメントカバレッジ100%（publicメソッド）

### 6.3 パフォーマンス基準
- ✅ ビューポート内の翻訳が数秒以内に完了
- ✅ Total処理時間が既存実装から大幅に増加しない（±10%以内）
- ✅ メモリリークなし

### 6.4 ドキュメント基準
- ✅ CLAUDE.mdにビューポート優先翻訳が記載されている
- ✅ すべてのpublicメソッドにJSDocが存在する

### 6.5 コード品質基準
- ✅ メッセージング規約（CLAUDE.md）に準拠
- ✅ TypeScript型安全性が維持されている
- ✅ 不要なコメントが削除されている
- ✅ Magic numberが定数化されている

---

## 7. リスクと対策

### リスク1: パフォーマンス低下
**リスク内容**: 順次処理によりTotal処理時間が増加する可能性

**発生確率**: Medium

**対策**:
1. 段階的表示によりUXは向上（体感速度が速くなる）
2. Phase 1のバッチ数を2-3に限定し、影響を最小化
3. Phase 2は標準の並列処理で高速化
4. パフォーマンステストで計測し、必要に応じて調整

### リスク2: ビューポート誤検出
**リスク内容**: 特定のCSSレイアウトでビューポート判定が不正確になる

**発生確率**: Low

**対策**:
1. getBoundingClientRect()は既存実装（floatingUI.ts）で実績あり
2. シンプルな判定ロジック（top/bottom/left/rightの範囲チェック）で確実性を確保
3. E2Eテストで複数のWebページで検証

### リスク3: 並列処理の複雑化
**リスク内容**: セミ並列処理の導入によりバグ発生リスク増加

**発生確率**: Medium

**対策**:
1. 既存のtranslateBatch()は維持し、新規メソッドで分離
2. 最初2-3バッチは順次処理で安定性確保
3. 包括的なユニットテストでロジック検証
4. 段階的ロールアウト（オプション機能として提供）

### リスク4: 既存機能への影響
**リスク内容**: contentScript.ts修正により既存の翻訳機能が影響を受ける

**発生確率**: Low

**対策**:
1. 既存のユニットテストをすべて実行し、リグレッションチェック
2. 統合テストで既存機能の動作を検証
3. コードレビューで変更範囲を厳密にチェック

---

## 8. 進捗追跡

### マイルストーン
| フェーズ | 完了予定 | ステータス |
|---------|---------|-----------|
| process1完了（ビューポート検出） | Day 1 | ⬜ 未着手 |
| process2完了（キュー分離） | Day 1 | ⬜ 未着手 |
| process3完了（セミ並列実行） | Day 2 | ⬜ 未着手 |
| process4完了（進捗表示） | Day 2 | ⬜ 未着手 |
| process5完了（型定義） | Day 2 | ⬜ 未着手 |
| process10完了（ユニットテスト） | Day 3 | ⬜ 未着手 |
| process200完了（ドキュメント） | Day 3 | ⬜ 未着手 |

### 実装時間見積もり
- process1: 2-3時間（ビューポート検出ロジック）
- process2: 3-4時間（キュー分離とPhase制御）
- process3: 3-4時間（セミ並列実行制御）
- process4: 2-3時間（フェーズ別進捗表示）
- process5: 1時間（型定義）
- process10: 4-5時間（ユニットテスト）
- process200: 1-2時間（ドキュメンテーション）

**合計**: 16-22時間（約2-3日）

---

## 9. 今後の拡張予定

### 短期（次バージョン）
- [ ] ビューポート優先度の動的調整（ユーザーのスクロール速度に応じて）
- [ ] 翻訳済みノードのハイライト表示（Phase 1完了部分を視覚化）
- [ ] Phase 1/2の境界を設定可能にする（ユーザー設定）

### 中期
- [ ] IntersectionObserverによるより高精度なビューポート検出
- [ ] スクロール予測による先読み翻訳
- [ ] ユーザーの読み進め速度に応じた適応的翻訳

### 長期
- [ ] Machine Learning による優先度学習
- [ ] ユーザーの視線追跡（WebGazer.js）との統合
- [ ] リアルタイム翻訳（文字入力と同時に翻訳）

---

## 10. 参考資料

### 内部ドキュメント
- `CLAUDE.md` - プロジェクトアーキテクチャとメッセージング規約
- `src/content/contentScript.ts` - 翻訳処理の全体フロー
- `src/content/domManipulator.ts` - DOM走査とテキスト抽出
- `src/background/translationEngine.ts` - バッチ翻訳エンジン
- `src/content/progressNotification.ts` - 進捗表示UI

### 外部リソース
- [Element.getBoundingClientRect() - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
- [Intersection Observer API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [Progressive Rendering - Web.dev](https://web.dev/rendering-performance/)

---

## 変更履歴
| 日付 | バージョン | 変更内容 | 著者 |
|-----|-----------|---------|-----|
| 2025-10-28 | 1.0 | 初版作成 | Claude Code |

---

**このドキュメントは実装開始前に必ずレビューしてください。**

