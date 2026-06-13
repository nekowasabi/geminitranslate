# Process 5: 429レート制限対応

## Implementation Brief（コピペ用）
> 別セッションで `/x @plan/process-05.md` を起動した際の自己完結ブリーフ。
- **背景**: CONCURRENCY_LIMIT=10の一斉並列がGemini無料枠（約15RPM）で即429になるが、retry()は429を特別扱いせず（shouldRetryはParseCountMismatchError以外一律、translationEngine.ts:727）、Retry-Afterヘッダも見ない。RETRY_CONFIG.MAX_DELAY（config.ts:103）は定義済みだが未配線、ApiError.isRateLimitError（apiClient.ts:71-80）も定義済みだが誰もimportしていない——**既存資産の配線で実装できる**
- **目的**: 429時にRetry-Afterを尊重した協調バックオフを行い、並列度を無料枠と整合させる
- **変更範囲**: src/shared/utils/retry.ts, src/background/apiClient.ts, src/background/translationEngine.ts, src/shared/constants/config.ts
- **参照する定数**（数値はPLAN.mdの★Constants表を参照）: CONCURRENCY_LIMIT, MAX_DELAY
- **禁止事項**: shouldRetryのParseCountMismatchError除外を外さない（429分岐と合成。リトライ可否の二軸を混同しない）/ apiClientにretryを再導入しない / retry.tsをApiErrorに直接依存させない（汎用ユーティリティのため疎結合に）/ 数値リテラル直書きしない
- **出力順序**: 1)実装 2)セルフレビュー 3)修正 4)再レビュー 5)ドキュメント更新確認 6)品質ゲート実行

## Overview
(1) retry.tsのRetryOptions（L36-75）に`maxDelay`と`getDelayOverrideMs?: (error) => number | undefined`を追加し、retry()本体（L110-146）のwaitTime計算（L134-141）にクランプ+オーバーライド分岐を実装。(2) apiClient.tsのApiError（L71-80）に`retryAfterMs`追加、429ハンドリング（L270-289）でRetry-Afterヘッダ取得。(3) translationEngine.tsのexecuteTranslationWithRetry（L702-737）にmaxDelay+429用delayオーバーライドを配線（ApiErrorのimport追加、現在L29はOpenRouterClientとParseCountMismatchErrorのみ）。(4) config.tsのCONCURRENCY_LIMIT（L34）とMAX_DELAY（L103）を新値へ。

## Affected Files
- src/shared/utils/retry.ts: RetryOptions（L36-75）拡張、retry()のwaitTime計算（L134-141）にmin(計算値, maxDelay)クランプ+オーバーライド
- src/background/apiClient.ts: ApiError（L71-80）にretryAfterMsフィールド、429レスポンス処理（L270-289）でRetry-Afterヘッダをパース（秒単位、HTTP-date形式は無視可）
- src/background/translationEngine.ts: executeTranslationWithRetry（L702-737）のretryオプション配線、ApiError import追加（L29）
- src/shared/constants/config.ts: CONCURRENCY_LIMIT（L34）、RETRY_CONFIG.MAX_DELAY（L103）

## Symbol Targets
- file: src/shared/utils/retry.ts
  symbols:
    - name: RetryOptions
      kind: module-level
      body_start_line: 36
      body_end_line: 75
    - name: retry
      kind: function
      body_start_line: 110
      body_end_line: 146
- file: src/background/apiClient.ts
  symbols:
    - name: ApiError
      kind: class
      body_start_line: 71
      body_end_line: 80
    - name: OpenRouterClient.translate（429ハンドリング部）
      kind: method
      line_hint: 270-289
- file: src/background/translationEngine.ts
  symbols:
    - name: TranslationEngine.executeTranslationWithRetry
      kind: method
      body_start_line: 702
      body_end_line: 737
- file: src/shared/constants/config.ts
  symbols:
    - name: BATCH_CONFIG（CONCURRENCY_LIMITのみ）
      kind: module-level
      line_hint: 34
    - name: RETRY_CONFIG
      kind: module-level
      body_start_line: 89
      body_end_line: 109
  patch_only: true
  disjoint_guarantee: false
  pre_flight_checks:
    - git_clean
    - "grep -rn ApiError src/ でimport追加が他に波及しないこと（確認済: import 0件）"
    - "Process 01/04の完了（config.ts/apiClient.ts/translationEngine.ts共有のため直列）"

# Notes:
# - disjoint_guarantee:false — 01/04とファイル共有→直列実行（01→04→05）
# - 設計推奨: retry.tsは汎用ユーティリティのためApiError型へ依存させず、getDelayOverrideMsコールバックで疎結合にする。translationEngine側でApiErrorをinstanceof判定しretryAfterMsを返す

## Implementation Notes
- waitTime計算の変更点: ①オーバーライド値があれば min(オーバーライド値, maxDelay) ②なければ min(既存指数計算, maxDelay)。maxDelay未指定時は既存挙動維持（クランプなし）で後方互換
- Whyコメント例: 「Why: maxDelay+コールバック方式を採用しRateLimitError型直接参照を却下 — retry.tsを特定エラー型に依存させないため」
- mapWithConcurrencyLimit（translationEngine.ts:871-896）はCONCURRENCY_LIMIT定数を参照済みのため、config変更だけで並列度が変わる

## Behavior Specification
System Type: both

state_transitions（retryループ内分岐）:
| 現状態 | イベント | ガード | 次状態 | 事後条件 |
|---|---|---|---|---|
| attempt n実行 | ApiError(429, retryAfterMsあり) | shouldRetry true && attempt < maxRetries | 待機→attempt n+1 | waitTime === min(retryAfterMs, MAX_DELAY)。指数計算を使わない |
| attempt n実行 | ApiError(429, retryAfterMsなし) | 同上 | 待機→attempt n+1 | waitTime === min(指数計算, MAX_DELAY) |
| attempt n実行 | ApiError(503)等 | 同上 | 待機→attempt n+1 | waitTime === min(指数計算, MAX_DELAY)（クランプ新設） |
| attempt n実行 | ParseCountMismatchError | shouldRetry false | 即throw | リトライ0回（既存維持） |
| attempt==maxRetries | 任意エラー | — | throw lastError | 待機なしで終了（retry.ts L133-141既存維持） |

io_mapping（apiClient側）:
| ケース | 入力 | 出力 | pre_state | post_state | invariants |
|---|---|---|---|---|---|
| 429+ヘッダ | HTTP 429, Retry-After: 5 | ApiError{statusCode:429, isRateLimitError:true, retryAfterMs:5秒相当} | リクエスト送信済 | エラーがthrowされengine層のretryへ | retryAfterMsは秒→ms変換済み |
| 429ヘッダなし | HTTP 429 | ApiError{429, isRateLimitError:true, retryAfterMs:undefined} | 同上 | 同上 | undefinedで指数バックオフへ |

### Correctness Criteria（観測可能・正誤の基準。固定する）
- retry.test.tsでjest fake timersにより待機時間をassert（Retry-After尊重/MAX_DELAYクランプ/指数の3系統）
- translation-flow.test.tsで並列実行中の同時in-flight数≤CONCURRENCY_LIMITをassert（既存L292のテスト拡張）

### Left to Implementation（実装に任せる細部。仕様で固定しない）
- retry.tsのオプション命名、Retry-AfterのHTTP-date形式対応の有無、ログ文言

> api_scope:true のため下記は本セクション異常系の派生。

## HTTP Status Coverage
- [ ] 200 — 正常系: リトライなしで全件パース
- [ ] 400 — 対象外: 既存retry経路維持（非リトライ化はScope外）
- [ ] 401 — 対象外: 既存挙動維持（リトライ後ユーザーへエラー通知）
- [ ] 404 — 対象外: 既存挙動維持（モデル名不正）
- [ ] 422 — 対象外: OpenRouterは通常400系で返し発生経路が限定的、特別扱いなし
- [ ] 429 — **新規対象**: ApiError(429, isRateLimitError, retryAfterMs) → Retry-After尊重バックオフ
- [ ] 503 — 対象: 既存指数バックオフにMAX_DELAYクランプが新たに適用される

## External Deps & Fallback（risk_flags: external_api）
- OpenRouterのRetry-Afterヘッダに依存。ヘッダ欠落時は指数バックオフへフォールバック（必須経路）

## 性能影響と計測（risk_flags: performance）
- CONCURRENCY_LIMIT縮小でフルページ翻訳のスループットは理論上低下するが、429再送の削減で実効速度はむしろ改善見込み。Process 300で翻訳完了時間を計測し再調整

---
## Red Phase: テスト作成と失敗確認
- [ ] ブリーフィング確認
- [ ] retry.test.ts（fake timersで3系統の待機時間）、apiClient.test.ts（Retry-Afterパース2ケース）、translationEngine.test.ts（429配線・in-flight上限）を追加
- [ ] テストを実行して失敗することを確認

✅ **Phase Complete**

---
## Green Phase: 最小実装と成功確認
- [ ] ブリーフィング確認
- [ ] retry.tsのmaxDelay+オーバーライド実装（後方互換維持）
- [ ] ApiErrorのretryAfterMs+429ヘッダパース
- [ ] translationEngineの配線+config定数変更
- [ ] テストを実行して成功することを確認

✅ **Phase Complete**

---
## Refactor Phase: 品質改善
- [ ] 疎結合設計の確認（retry.tsにApiError依存がないこと）、Whyコメント確認
- [ ] テストが継続して成功することを確認

✅ **Phase Complete**

---
## Manual Verification（手動検証シナリオ）
1. 無料枠OpenRouterモデルで大規模ページを連続翻訳 → 429発生時もエラー終了せず、待機後に翻訳が完走（コンソールでretry attemptログと待機時間を確認）
2. DevToolsのNetworkタブで翻訳中の同時接続数を観察 → 常にCONCURRENCY_LIMIT以下

---
## Dependencies
- Requires: Process 01, Process 04（config.ts/apiClient.ts/translationEngine.ts共有のため直列）
- Blocks: Process 10
