# Process 2: P0 レースコンディション修正 (contentScript.ts)

## Overview
Phase 1→Phase 2でインスタンス変数`currentTranslationNodes`が上書きされ、遅延到着した Phase 1 の BATCH_COMPLETED が誤ったDOMノードに翻訳を適用する問題を解消する。クロージャスナップショットまたはMap分離で競合を排除する。

## Affected Files

| ファイル | 行番号 | 変更内容 |
|---------|--------|---------|
| `src/content/contentScript.ts` | L41 | `currentTranslationNodes: TextNode[]` インスタンス変数を削除または `Map<1\|2, TextNode[]>` に変更 |
| `src/content/contentScript.ts` | L307-309 | Phase1ノード代入 → `const phase1Snapshot = originalIndices.map(...)` のローカル定数化 |
| `src/content/contentScript.ts` | L407-409 | Phase2ノード代入 → `const phase2Snapshot = oovIndices.map(...)` のローカル定数化 |
| `src/content/contentScript.ts` | L650-662 | `handleBatchCompleted` 内の参照を phaseキーで分岐するMapから参照 |

## Implementation Notes

### 変更前（現状の問題）
```typescript
// contentScript.ts:41
private currentTranslationNodes: TextNode[] = [];

// L307-309: Phase1開始
this.currentTranslationNodes = originalIndices.map(i => viewport[i]);
await this.messageBus.send(...);  // Phase1の非同期完了を待つ

// L407-409: Phase2開始（Phase1のBATCH_COMPLETEDが未完了でも上書き）
this.currentTranslationNodes = oovIndices.map(i => outOfViewport[i]);

// L650-662: BATCH_COMPLETED handler（Phase1の遅延メッセージがPhase2のノードを参照）
const node = this.currentTranslationNodes[batchIndex];  // 誤参照
```

### 変更後（推奨案A: Mapによるフェーズ分離）
```typescript
// Why: shared mutable instance var → phase-keyed Map
//      currentTranslationNodes was overwritten before Phase 1 BATCH_COMPLETED messages
//      arrived, causing wrong DOM nodes to receive translations.
private phaseNodes: Map<1 | 2, TextNode[]> = new Map();

// Phase1開始
this.phaseNodes.set(1, originalIndices.map(i => viewport[i]));
await this.messageBus.send({ phase: 1, ... });

// Phase2開始（Phase1のMapエントリは維持される）
this.phaseNodes.set(2, oovIndices.map(i => outOfViewport[i]));

// BATCH_COMPLETED handler
const phaseNodes = this.phaseNodes.get(payload.phase);
if (!phaseNodes) return;  // 不明なphaseは無視
const node = phaseNodes[batchIndex];
```

### 事前確認事項
- `payload.phase` フィールドが実際に BATCH_COMPLETED メッセージに存在するか確認（L642付近）
- `applyTranslationsAndTrack` の二重適用（L346-355 と L680-681）が競合していないか確認

---

## Red Phase: テスト作成と失敗確認

- [ ] ブリーフィング確認: `docs/requirements/zero-base-redesign-report.md` BUG-004 セクション
- [ ] `tests/unit/content/contentScript.test.ts` に以下のテストケースを追加:
  - Phase1の BATCH_COMPLETED が Phase2開始後に到達した場合、Phase2のノードに誤適用されないこと
  - Phase1のノードがPhase2開始後も正しく参照されること
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---

## Green Phase: 最小実装と成功確認

- [ ] ブリーフィング確認
- [ ] `currentTranslationNodes` インスタンス変数を `phaseNodes: Map<1 | 2, TextNode[]>` に変更
- [ ] `translatePage()` 内のPhase1/Phase2ノード代入を `phaseNodes.set()` に変更
- [ ] `handleBatchCompleted()` 内の参照を `phaseNodes.get(payload.phase)` に変更
- [ ] Phase完了後に `phaseNodes.delete(phase)` でメモリ解放
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---

## Refactor Phase: 品質改善

- [ ] `applyTranslationsAndTrack` の二重適用問題を確認し、残存していれば解消
- [ ] Whyコメントを追加
- [ ] `npm run lint` がクリーンであることを確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---

## Dependencies
- Requires: -（独立して実施可能、Process 1と並列実施可）
- Blocks: Process 5（同一ファイル contentScript.ts に依存）
