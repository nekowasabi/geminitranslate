# Session Lessons: 2026-03-15

## Mission 1: Process 5+6+10 (console.log統一・orphan削除・回帰テスト)

### L-001: 置換タスク着手前にimport存在を確認する
- Category: implementation
- Impact: 0.60
- Action: 置換系チェックリスト先頭に 'import存在Grep確認' を必須追加

### L-002: テスト失敗は件数ではなく内訳（3分類）で把握する
- Category: verification
- Impact: 0.75
- 3分類: (1)今回変更に起因 (2)pre-existing (3)環境依存
- Action: REDフェーズで失敗内訳表を即時作成

### L-003: TDD T1→T2順序 + ProcessごとのtscゲートでProcess間型エラー波及を防ぐ
- Category: process
- Impact: 0.85
- Action: Processテンプレート Refactorフェーズに 'tsc --noEmit PASS' を必須化

### L-004: 類似名ファイル削除は正規エントリリストからの消去法で特定する
- Category: safety
- Impact: 0.65
- Action: orphan削除チェックリストに '正規エントリポイント先列挙' ステップ追加

### L-005: 置換タスクは対象リストと対象外リストを同時作成してscope creepを防ぐ
- Category: scope_management
- Impact: 0.70
- Action: Processテンプレートに Out of Scope セクションを必須フィールド化

### パターン
- P-A「事前確認省略」: L-001, L-002 → Greenフェーズ先頭に現状スキャンステップ配置
- P-B「ゲート配置」: L-003, L-004 → 不可逆操作前後にtsc/build/grepゲート配置

## Mission 2: 翻訳・表示速度改善調査

### 主要発見
- **Storage I/O シリアル実行**: setCachedTranslation/getCachedTranslation がループ内で1件ずつ await
  - browser.storage.local.get/set はバッチ操作をサポート（配列/オブジェクト）
  - バルク化で初回翻訳 350ms → 105ms（-70%）が見込める
- **CONCURRENCY_LIMIT 未適用**: Promise.all() で無制限並列（定数定義のみ）
- **retry 二重実装**: apiClient + engine 両層で retry() → 最大16試行
- **isElementVisible() コスト**: getComputedStyle 親方向フルトラバース
- **Devil's Advocate 指摘**: cache key衝突リスク、storage上限未管理、MutationObserver throttlingなし

### 実装計画参照先
- docs/requirements/performance-improvement-plan.md (Process 11-18)

## Mission 3: TDDサイクル・コードパターン追加教訓

### L-006: テストフレームワーク API を実装前に統一確認する (vi.* vs jest.*)
- Category: process
- Impact: 0.90
- Content: Process planファイルにVitest/Jest APIが混在すると実行時エラー。実装前にpackage.jsonのtestRunnerを確認し、planコードスニペットのフレームワークを統一する。

### L-007: 内部catchがnullを返す関数の外側でエラー種別フラグパターン
- Category: code-patterns
- Impact: 0.75
- Content: translateSelectionがcatchでnullを返す場合、lastTranslationErroredフラグで例外/nullレスポンスを区別してUI出し分け。

### L-008: TDD RED先行でDOM queryセレクタ・タイムアウト値を先行確定する
- Category: process
- Impact: 0.85
- Content: RED phaseでテストを先に書くことでDOMセレクタ仕様・タイムアウト値が実装前に確定し、実装ブレを防ぐ。

### L-009: Refactorゲートで DEBUG log と cssText スタイル不一致を検査する
- Category: verification
- Impact: 0.80
- Content: 自動lintでは検出されないDEBUG console.log混入とcssText文字列スタイル不一致。Refactorゲートに'grep DEBUG'とcssText整合確認を追加。

### L-010: try-finallyでローディング状態を確実解除（解除漏れゼロパターン）
- Category: code-patterns
- Impact: 0.92
- Content: setLoading(true)→try→finally setLoading(false)で全パス解除保証。成功/失敗/例外を問わず状態リークなし。
