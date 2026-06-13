# Process 1: BATCH_SIZE縮小+max_tokens明示

## Implementation Brief（コピペ用）
> このセクションは別セッションで `/x @plan/process-01.md` を起動した際の自己完結ブリーフ。
- **背景**: BATCH_SIZE=100で1リクエストに100テキストを連結するが、requestBodyにmax_tokens未指定のため応答がプロバイダ既定値で切り捨てられ、ParseCountMismatchError→バイナリ分割/個別翻訳フォールバック連鎖が翻訳遅延の主因になっている
- **目的**: バッチをBATCH_SIZE（新値）に縮小し、max_tokensを動的計算で明示して応答切り捨てを根絶する
- **変更範囲**: src/shared/constants/config.ts（BATCH_CONFIG L30-64）, src/background/apiClient.ts（translate L176-325のrequestBody L230-233）
- **参照する定数**（数値はPLAN.mdの★Constants表を参照）: BATCH_SIZE, MAX_TOKENS_PER_TEXT, MIN_MAX_TOKENS, MAX_TOKENS_CEILING
- **禁止事項**: apiClientにretryを再導入しない（engine層一元化のWhyコメントL220-221維持）/ 数値リテラルを使用箇所に直書きしない
- **出力順序**: 1)実装（差分） 2)セルフレビュー 3)修正 4)再レビュー 5)ドキュメント更新確認（PLAN.mdのDocs to Update参照） 6)品質ゲート実行

## Overview
config.tsのBATCH_SIZEを縮小し、apiClient.translateのrequestBodyに`max_tokens`を動的計算（式: min(MAX_TOKENS_CEILING, max(MIN_MAX_TOKENS, texts.length × MAX_TOKENS_PER_TEXT))）で追加する。

## Affected Files
- src/shared/constants/config.ts: L40 BATCH_SIZE値変更、L37-39「Optimized for 100k token models」コメント更新、L57 VIEWPORT_PRIORITY_BATCHESコメント「(100 texts)」修正、BATCH_CONFIGにMAX_TOKENS_PER_TEXT/MIN_MAX_TOKENS/MAX_TOKENS_CEILING追加
- src/background/apiClient.ts: L230-233 requestBodyにmax_tokensフィールド追加（計算ヘルパーはprivateメソッド化可）

## Symbol Targets
```yaml
- file: src/shared/constants/config.ts
  symbols:
    - name: BATCH_CONFIG
      kind: module-level
      body_start_line: 30
      body_end_line: 64
      line_hint: 30-64
- file: src/background/apiClient.ts
  symbols:
    - name: OpenRouterClient.translate
      kind: method
      body_start_line: 176
      body_end_line: 325
      line_hint: 230-233が挿入点
patch_only: true
disjoint_guarantee: false
pre_flight_checks:
  - git_clean
  - npm test green on main
  - "grep -rn BATCH_SIZE src/ で参照がconfig経由のみ（確認済: translationEngine.ts:96,766,793,849はthis.BATCH_SIZE経由）"
```

> Notes:
> - disjoint_guarantee:false — Process 05とconfig.ts:BATCH_CONFIG/apiClient.tsを共有するため直列実行（01→04→05）
> - Conflict Matrix (PLAN.md) も併せて参照

## Implementation Notes
- requestBodyへの追加例: `max_tokens: this.calculateMaxTokens(texts.length)`。計算式は★Constants欄外注記のとおり
- Whyコメントを残す: 「Why: max_tokens未指定だとプロバイダ既定値で応答切り捨て→件数不一致→フォールバック連鎖になるため明示」
- config.tsは`as const`オブジェクト。translationEngineは`this.BATCH_SIZE = BATCH_CONFIG.BATCH_SIZE`(L96)で束縛、テストはBATCH_CONFIG参照で書かれており定数変更に自動追随する（件数直書きモックがないかは要確認）

## Behavior Specification
System Type: transformation

| ケース | 入力 | 出力 | pre_state | post_state | invariants |
|---|---|---|---|---|---|
| 正常 | translate(texts[BATCH_SIZE], 'Japanese') | string[BATCH_SIZE] | config初期化済 | requestBody.max_tokens === BATCH_SIZE×MAX_TOKENS_PER_TEXT、戻り値全件string | 戻り値長===入力長、max_tokens∈[MIN_MAX_TOKENS, MAX_TOKENS_CEILING] |
| 正常(少数) | translate(texts[2]) | string[2] | 同上 | max_tokens === MIN_MAX_TOKENS（下限適用） | 下限が係数計算を上回る |
| 正常(上限) | translate(texts[40]) | string[40] | 同上 | max_tokens === MAX_TOKENS_CEILING（上限クランプ） | 上限クランプ |
| バッチ分割 | translateBatchへ100テキスト | string[100] | — | エンジンがBATCH_SIZE件単位のバッチに分割、results全件string | 分割はchunkByBatchSize(L849)がBATCH_SIZEを参照 |

### Correctness Criteria（観測可能・正誤の基準。固定する）
- apiClient.test.tsでfetchモックのbodyをJSON.parseし、max_tokensの値・クランプ3ケース（通常/下限/上限）を検証
- translationEngine.test.tsのバッチ分割テストが新BATCH_SIZEでgreen

### Left to Implementation（実装に任せる細部。仕様で固定しない）
- max_tokens計算式への文字数項追加の有無、計算ヘルパーのprivateメソッド化、内部変数名

> api_scope:true のため下記HTTP Status Coverageは本セクション異常系の派生。ここを正本とする。

## HTTP Status Coverage
- [ ] 200 — 正常系: requestBodyにmax_tokensが含まれ、応答が全件パースされる
- [ ] 400 — 対象外: 既存挙動維持（max_tokens値はMAX_TOKENS_CEILING以下のため不正値にならない）
- [ ] 401 — 対象外: 既存挙動維持（本Processは認証に触れない）
- [ ] 404 — 対象外: 既存挙動維持
- [ ] 422 — 対象外: 既存挙動維持
- [ ] 429 — 対象外: Process 05で対応
- [ ] 503 — 対象外: 既存挙動維持

## External Deps & Fallback（risk_flags: external_api）
- OpenRouter Chat Completions APIの`max_tokens`パラメータに依存。プロバイダがクランプした場合も応答自体は返るため、既存のparseResponse→フォールバック経路が安全網として残る

## 性能影響と計測（risk_flags: performance）
- API呼び出し回数が約5倍（100件/req→BATCH_SIZE件/req）。定型プロンプト重複によるトークン増は+5%程度（出力トークン不変）。Process 300で翻訳完了時間・フォールバック発生率を計測

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] apiClient.test.tsにmax_tokens検証3ケース（通常/下限クランプ/上限クランプ）を追加（fetchモックのbody検証）
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] ブリーフィング確認
- [ ] config.tsのBATCH_CONFIG更新（BATCH_SIZE変更+3定数追加+コメント修正）
- [ ] apiClient.translateのrequestBodyにmax_tokens追加（Whyコメント付き）
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] コードの品質を改善（計算ヘルパーの抽出等）
- [ ] テストが継続して成功することを確認（translationEngine.test.ts含む全テスト）

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. `npm run build:firefox` → about:debugging でロード → 英語版Wikipediaの長大記事をAlt+Wで翻訳 → DevToolsのNetworkタブでrequestBodyにmax_tokensが含まれることを確認 → コンソールにParseCountMismatch warnが（ほぼ）出ないこと、全ノードが翻訳されることを確認
2. 短いページ（テキスト数件）で翻訳 → max_tokensがMIN_MAX_TOKENS（下限）になっていることをNetworkタブで確認 → 翻訳が正常完了

---
## Dependencies
- Requires: -
- Blocks: Process 04（同一テスト群の整合）, Process 05（config.ts/apiClient.ts共有のため直列）
