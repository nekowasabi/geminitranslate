---
task_id: "T-20260613-translation-speed-partial-fix"
title: "翻訳速度・部分翻訳問題の修正（バッチ縮小・fail-soft化・429協調）"
status: planning
created: "2026-06-13"
scope:
  - src/shared/constants/config.ts
  - src/background/{apiClient,translationEngine}.ts
  - src/content/contentScript.ts
  - src/shared/utils/{retry,textFilter}.ts
  - public/manifest.{v2,v3}.json
depends_on: []
risk_flags: [external_api, performance, frontend]
quality_gate:
  command: "npm run lint && npm test && npm run build:firefox && npm run lint:ext"
  min_quality_score: "-"
commit_mode: manual
---
# Commander's Intent
**Purpose**: 大規模ページでの「遅い・途中で止まる・一部しか翻訳されない」を、応答切り捨て防止・部分成功設計・レート制限協調の3軸で解消する。
**End State**: 500ノード級ページ・iframe含有ページ・無料枠429環境のいずれでも翻訳が完走し、欠損箇所は原文表示で全テストgreen。
**Key Tasks**: (1) バッチ縮小+max_tokens明示で応答切り捨て根絶（01） (2) Phase遷移と結果再構築のfail-soft化（02/04） (3) 429協調制御とiframe注入（05/03）
# ★ Constants（唯一の正・他は定数名で参照）
| 定数名 | 値 | 単位 | 備考 |
|-------|-----|------|------|
| BATCH_SIZE | 20 | texts/batch | BATCH_CONFIG。100→20。応答切り捨て連鎖の主因除去 |
| CONCURRENCY_LIMIT | 3 | requests | BATCH_CONFIG。10→3。無料枠15RPMと整合 |
| TRANSLATION_MESSAGE_TIMEOUT_MS | 120000 | ms | 新規(API_CONFIG)。Phase 1/2 sendの第2引数。MessageBus.DEFAULT_TIMEOUT_MSは不変 |
| MAX_DELAY | 30000 | ms | RETRY_CONFIG。10000→30000。retry()クランプ+429待機上限として新規配線 |
| MAX_TOKENS_PER_TEXT | 250 | tokens/text | 新規(BATCH_CONFIG)。max_tokens動的計算の係数 |
| MIN_MAX_TOKENS | 2048 | tokens | 新規。max_tokens下限（少数バッチの長文耐性） |
| MAX_TOKENS_CEILING | 8192 | tokens | 新規。Gemini 2.0 Flash出力上限に整合 |

> 数値の単一ソース。process・コードでは定数名のみ参照。max_tokens式: min(MAX_TOKENS_CEILING, max(MIN_MAX_TOKENS, n×MAX_TOKENS_PER_TEXT))
# Scope
**対象**: frontmatter scope の8ファイル + 対応テスト（tests/unit/{background,shared,content}/*, tests/integration/translation-flow.test.ts）+ CLAUDE.md / CHANGELOG.md
**対象外（理由付き）**:
- Structured Output移行 — 中期施策、parseResponse全面改修になるため
- IntersectionObserver化・textFilter緩和・MutationObserver自己トリガー対策 — 別計画（速度/品質/再現条件未確定）
- handleBatchCompleted/translationsForApply修正 — Process 04完了後に再評価
- 400/401/422の非リトライ化・MAX_BATCH_LENGTH縮小・reconstructResultsデッドコード解消・dynamic翻訳sendタイムアウト — 既存挙動維持を優先、実害が限定的
# Required Sections（risk_flags 連動）
- external_api → External Deps & Fallback（process-01/05 本文）/ performance → 性能影響と計測（process-01/05 本文、process-300 計測）/ frontend → Frontend Constraints（process-02/11 本文）
- 対象外: security / multi_id / data_migration / backwards_incompatible — ストレージスキーマ・メッセージ形式は不変
# Progress Map
| Process | Title | Status | Disjoint | Type | File |
|---------|-------|--------|----------|------|------|
| 01 | BATCH_SIZE縮小+max_tokens明示 | ☐ planning | n | 変換 | [→ plan/process-01.md](plan/process-01.md) |
| 02 | Phase1例外保護+翻訳タイムアウト延長 | ☐ planning | y | react | [→ plan/process-02.md](plan/process-02.md) |
| 03 | iframe翻訳対応(all_frames) | ☐ planning | y | - | [→ plan/process-03.md](plan/process-03.md) |
| 04 | 部分成功設計(原文フォールバック) | ☐ planning | n | 変換 | [→ plan/process-04.md](plan/process-04.md) |
| 05 | 429レート制限対応 | ☐ planning | n | both | [→ plan/process-05.md](plan/process-05.md) |
| 10 | 統合テスト:部分成功+429 | ☐ planning | n.a. | 変換 | [→ plan/process-10.md](plan/process-10.md) |
| 11 | 統合テスト:Phase遷移耐性 | ☐ planning | n.a. | react | [→ plan/process-11.md](plan/process-11.md) |
| 100 | 品質ゲート | ☐ planning | n.a. | - | [→ plan/process-100.md](plan/process-100.md) |
| 200 | ドキュメント更新 | ☐ planning | n.a. | - | [→ plan/process-200.md](plan/process-200.md) |
| 300 | OODAレトロスペクティブ | ☐ planning | n.a. | - | [→ plan/process-300.md](plan/process-300.md) |

**凡例**: Type: 変換=transformation / react=reactive / both / -=behavior_scope:false。Disjoint: y=並列可 / n=symbol共有で直列 / n.a.=非該当（供給元は各processのSymbol Targets）
**DAG**: {01→04→05, 02, 03} → {10,11} → 100 → 200 → 300（`{A,B}`=並列可、`A→B`=A完了後にB）
**Overall**: ☐ 0/10 completed
# Conflict Matrix
| Process | Symbols (file:symbol) | Disjoint | Confidence | Evidence |
|---------|----------------------|----------|------------|----------|
| 01 | config.ts:BATCH_CONFIG, apiClient.ts:OpenRouterClient.translate | false | high | 05とBATCH_CONFIG/apiClient共有(regex+目視) |
| 02 | contentScript.ts:ContentScript.translatePage, config.ts:API_CONFIG | true | high | 単独編集。config.tsはAPI_CONFIGブロックのみ追加 |
| 03 | manifest.v2.json:content_scripts, manifest.v3.json:content_scripts | true | high | manifest単独・他process非接触 |
| 04 | translationEngine.ts:TranslationEngine.assertCompleteResults, textFilter.ts:reconstructResults | false | high | 05とtranslationEngine共有 |
| 05 | retry.ts:retry, retry.ts:RetryOptions, apiClient.ts:ApiError, translationEngine.ts:TranslationEngine.executeTranslationWithRetry, config.ts:RETRY_CONFIG | false | high | 01/04と共有→直列 |
| 10/11/100/200/300 | テスト・ドキュメントのみ | n/a | high | doc/test-only |
# Acceptance Criteria（要約）
**機能要件**: max_tokens式どおりの値がrequestBodyに含まれる / Phase 1失敗時もPhase 2実行・プログレス完了 / iframe内翻訳 / バッチ失敗時も全件返却（欠損は原文、空文字でノード消失なし）/ 429時Retry-After尊重バックオフ / 同時実行≤CONCURRENCY_LIMIT
**品質・安全**: 429ハンドリング新規、503はクランプ付き既存バックオフ、ParseCountMismatchは非リトライ維持。HTTPステータス網羅は各process参照
**ドキュメント**: Docs to Update全完了、変更箇所にWhyコメント
# Docs to Update
| パス | 更新内容 | 必須条件 |
|------|---------|----------|
| CLAUDE.md | BATCH_SIZE/CONCURRENCY_LIMIT記載を新値へ、429/部分成功挙動を1行追記 | Process 01/05完了後 |
| CHANGELOG.md | 修正5本のエントリ | リリース時 |
| README.md, docs/ | 対象外: BATCH_SIZE等への言及なし（grep確認済み） | — |
# Don'ts（禁止事項）
- MessageBus.DEFAULT_TIMEOUT_MSを変更しない（選択/clipboard翻訳が30s前提。延長は呼び出し側第2引数のみ）
- apiClientにretryを再導入しない（engine層一元化のWhyコメント維持、二重retryで最大16試行になる）
- handleBatchCompleted/translationsForApply（contentScript.ts:659-748）に触らない
- shouldRetryのParseCountMismatchError除外を外さない（429分岐と合成。リトライ可否の二軸を混同しない）
- 数値リテラルを使用箇所に直書きしない（★Constants経由。テストはBATCH_CONFIG参照で自動追随）
- manifestはall_frames:true追加のみ／assertCompleteResultsの長さ不一致検査を黙殺化しない（warn+原文ベース正規化で観測可能に）
# Risks
| リスク | 対策 |
|--------|------|
| API呼び出し5倍増でレート制限に当たりやすくなる | Process 05を同一リリースに同梱（01単独リリース禁止）。300で計測し再調整 |
| throw廃止で障害が静かに進行 | 欠損件数をwarn必須出力、統合テスト(10)で欠損時挙動を固定 |
| all_frames:trueで広告iframeにも注入されコスト増 | 手動トリガー主体のため自動消費なし。問題時はmatches絞り込み |
# Verification
**Manual**: 各processのManual Verification参照（拡張ロード/大規模ページ/iframe/429完走/オフライン復帰）
**Automated**: `npm run lint && npm test && npm run build:firefox && npm run lint:ext`
