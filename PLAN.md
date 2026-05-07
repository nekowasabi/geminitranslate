# 翻訳速度・精度・表示安定性改善計画

## Summary

開いているタブのページ翻訳について、インライン翻訳を維持したままデザイン崩れを最優先で改善する。あわせて、翻訳精度を上げ、MutationObserver や fallback による無限・過剰な API 呼び出しを構造的に防ぐ。

既存コードでは、ストレージ一括キャッシュ、retry 一元化、Phase 別 node 管理、MutationObserver debounce は実装済み。主な残課題は、text node の `trim()` と `textContent` 直接置換による空白・inline 表示崩れ、区切り文字ベースの応答パース、無制限並列、翻訳適用後の MutationObserver 再発火である。

## Key Changes

- DOM 置換を安全化する。
  - `DOMManipulator` の抽出時に、元 text node の前後空白を保持する metadata を `TextNode` に追加する。
  - 翻訳適用時は翻訳本文だけを差し替え、保持した前後空白を復元する。
  - DOM 要素の追加・削除は行わず、既存 text node の値だけを更新する。
  - `reset()` は WeakMap に保存した元テキストへ戻す現行仕様を維持する。

- 翻訳応答を JSON 配列優先にする。
  - `OpenRouterClient.buildPrompt()` を、入力順と同じ長さの JSON string 配列だけを返す指示へ変更する。
  - `parseResponse()` は JSON 配列の抽出と件数一致を最優先にする。
  - JSON 解析に失敗した場合のみ、既存の `---NEXT-TEXT---` separator / 行分割 fallback を使う。

- API 呼び出しが増え続けない構造にする。
  - `TranslationEngine` の `RequestBudgetContext` を維持し、retry / fallback 込みでも `maxApiCalls` 超過時は停止する。
  - dynamic translation 用に、同一 node の「翻訳中」「翻訳済み」「直近失敗」状態を WeakMap で管理する。
  - 翻訳適用による `characterData` mutation は、翻訳済みテキストとして記録済みなら再翻訳しない。
  - 失敗した node は cooldown を置き、同じテキストでは即時再試行しない。
  - 同一 debounce 窓内の同一テキストは 1 回だけ API に送り、結果を複数 node へ適用する。

- 体感速度を維持する。
  - Phase 1 の viewport 優先翻訳は維持する。
  - BATCH_COMPLETED で適用済みの node index を記録し、Phase 完了時は未適用分だけを適用する。
  - remaining batch の `Promise.all` は `BATCH_CONFIG.CONCURRENCY_LIMIT` に従う制限付き並列へ変更する。

## Public Interfaces

- `TextNode` に空白復元用 metadata を追加する。
- 必要な場合のみ、DOM 翻訳単位を表す内部型 `TranslationUnit` を追加する。
- extension messaging の外部 wire format は変更しない。
- 既存の `BATCH_CONFIG.CONCURRENCY_LIMIT` を実際の翻訳並列制御に使用する。

## Test Plan

- `tests/unit/content/domManipulator.test.ts`
  - 前後空白、改行、inline 要素、reset 復元、DOM 構造が増減しないことを追加する。
- `tests/unit/background/apiClient.test.ts`
  - JSON 配列応答、コードフェンス付き JSON、余分な説明文混入、件数不一致、旧 fallback を追加する。
- `tests/unit/background/translationEngine.test.ts`
  - 並列数が上限を超えないこと、API budget 超過時に停止すること、fallback 後も順序が保たれることを追加する。
- `tests/unit/content/contentScript.test.ts`
  - 翻訳適用による MutationObserver 再発火で再翻訳しないこと。
  - 同一 node の翻訳中再入を防ぐこと。
  - 同一テキストを重複 API 送信しないこと。
  - BATCH_COMPLETED 適用済み node を Phase 完了時に二重適用しないこと。

検証コマンド:

```bash
npm test -- --runInBand tests/unit/content/domManipulator.test.ts tests/unit/background/apiClient.test.ts tests/unit/background/translationEngine.test.ts tests/unit/content/contentScript.test.ts
npm run build:chrome
npm run build:firefox
```

## Assumptions

- ページ翻訳はサイドパネル中心ではなく、ページ内インライン反映を維持する。
- 翻訳後の文章長差による自然な折り返し変化は許容する。
- 成功条件は、DOM 構造破壊、空白消失、二重翻訳、無限 API 呼び出しを防ぐこと。
- API の完全停止ではなく、明示的な上限、再入防止、cooldown、重複排除で過剰呼び出しを防ぐ。
