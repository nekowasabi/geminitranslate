# title: 翻訳進捗表示機能の実装

## 概要
- ページ全体翻訳時に、リアルタイムでパーセンテージ表示する進捗通知バナーを実装し、ユーザーに翻訳の進行状況を可視化する

### goal
- ページ全体翻訳を実行した際、翻訳完了までの進捗状況をパーセンテージ（%）で確認できる
- 翻訳開始から完了まで、ページ上部の固定バナーで進捗が更新され続ける
- 翻訳完了時に「翻訳完了」メッセージが表示され、3秒後に自動で非表示になる

## 必須のルール
- 必ず `CLAUDE.md` を参照し、ルールを守ること

## 開発のゴール
- translatePage関数内で、バッチ処理の進捗に応じてリアルタイムに更新される進捗通知バナーを実装する
- ユーザー体験を向上させるため、500ms間隔でスロットル更新を行い、パフォーマンスを維持する
- 既存の「Start Translate」通知と同じ位置に表示し、シームレスなUI体験を提供する

## 実装仕様

### 進捗通知バナーの仕様
- **表示位置**: ページ上部中央（`position: fixed; top: 20px; left: 50%; transform: translateX(-50%);`）
- **表示内容**:
  - 翻訳中: `翻訳中... XX%` （XXは0-100の整数）
  - 完了時: `翻訳完了`
- **更新頻度**: 500ms間隔のスロットル更新
- **表示タイミング**:
  - 開始: translatePage関数の開始直後
  - 更新: 各バッチ処理完了時
  - 終了: 全バッチ処理完了後3秒で自動非表示

### 進捗計算ロジック
- **計算式**: `Math.round((処理済みバッチ数 / 総バッチ数) * 100)`
- **バッチ処理**: CONCURRENCY_LIMIT=10で並列処理されるため、チャンク単位で進捗を更新
- **完了判定**: すべてのバッチ処理（batches.length）が完了した時点で100%

### 参考実装
- クリップボード翻訳の進捗表示（content.js:187-193）
  - `lastUpdate`変数でスロットル管理
  - `Date.now()`で現在時刻を取得し、500ms経過時のみ更新

## 生成AIの学習用コンテキスト
### 実装対象ファイル
- /Users/takets/repos/geminitranslate/content.js
  - translatePage関数（234-380行目）を修正

### 参照ファイル
- /Users/takets/repos/geminitranslate/content.js
  - クリップボード翻訳の進捗表示実装（187-193行目）
  - 既存の通知バナー実装（241-264行目）

## Process

### process1 進捗通知バナーの作成と表示
@target: /Users/takets/repos/geminitranslate/content.js
@ref: /Users/takets/repos/geminitranslate/content.js (241-264行目)
- [ ] translatePage関数の開始時に進捗通知バナーのDOM要素を作成
  - 既存の通知バナースタイルを踏襲（ダークモード対応不要、既存の#4285f4を使用）
  - 初期テキストを「翻訳中... 0%」に設定
- [ ] バナー要素をdocument.bodyに追加
- [ ] バナー要素への参照を変数（例: `progressNotification`）に保存

### process2 進捗計算ロジックの実装
@target: /Users/takets/repos/geminitranslate/content.js
@ref: /Users/takets/repos/geminitranslate/content.js (187-193行目)
- [ ] スロットル用変数 `lastUpdate = 0` を初期化
- [ ] 進捗更新関数 `updateProgress(current, total)` を実装
  - `const now = Date.now()` で現在時刻を取得
  - `if (now - lastUpdate > 500)` で500ms経過を判定
  - パーセンテージ計算: `Math.round((current / total) * 100)`
  - バナーのtextContentを更新: `翻訳中... XX%`
  - `lastUpdate = now` で更新時刻を記録

### process3 バッチ処理完了時の進捗更新
@target: /Users/takets/repos/geminitranslate/content.js
@ref: /Users/takets/repos/geminitranslate/content.js (356-372行目)
- [ ] バッチ処理のforループ（356行目）内で進捗を追跡
  - チャンク処理完了後（`await Promise.all(promises)` の直後）に進捗を更新
  - `updateProgress(i + CONCURRENCY_LIMIT, batches.length)` を呼び出し
  - ただし、`i + CONCURRENCY_LIMIT` が `batches.length` を超えないように調整

### process4 翻訳完了時の処理
@target: /Users/takets/repos/geminitranslate/content.js
- [ ] 全バッチ処理完了後（translateSpecialElements呼び出し後）に完了表示
  - バナーのtextContentを「翻訳完了」に更新
  - 3秒後にバナーを削除するsetTimeoutを設定
  - 既存の通知バナー削除ロジック（260-264行目）を参考

### process5 エッジケースの処理
@target: /Users/takets/repos/geminitranslate/content.js
- [ ] batches.lengthが0の場合の処理
  - 進捗バナーを表示せず、既存の「Start Translate」通知のみ表示
- [ ] 翻訳中にエラーが発生した場合の処理
  - try-catchでエラーをキャッチし、バナーを削除

### process10 ユニットテスト
- [ ] translatePage関数の単体テスト作成（必要に応じて）
  - 進捗計算の正確性を検証
  - スロットルロジックの動作確認

### process100 リファクタリング
- [ ] 進捗更新ロジックを独立した関数として抽出（コードの可読性向上）
- [ ] マジックナンバー（500ms）を定数化（例: `PROGRESS_UPDATE_INTERVAL`）

### process200 ドキュメンテーション
- [ ] CHANGELOG.mdに新機能を追加
  - バージョン番号の更新
  - 「翻訳進捗表示機能の追加」を記載
- [ ] README.mdの更新（必要に応じて）
  - ユーザー向け機能説明の追加
