---
title: "翻訳・表示速度改善 調査レポート＋実装計画"
status: planning
created: "2026-03-15"
mission_id: "mission-20260315-100500"
---

# 翻訳・表示速度改善 調査レポート＋実装計画

## Executive Summary

既存の Viewport-Priority + Batch Streaming により知覚速度は 380ms → 100ms（74%改善）に到達済み。
本調査では **storage I/O のシリアル実行** を主要ボトルネックとして特定し、さらに **70% の追加改善**（初回翻訳 350ms → 105ms）が可能と見積もった。

Multi-LLM Council（Advocate + Devil's Advocate + Arbiter）による審議結果: **APPROVE_WITH_CONDITIONS**

---

## 発見されたボトルネック

### P0: Storage I/O シリアル実行（即効性最大）

| ID | 問題 | 場所 | 影響 |
|----|------|------|------|
| **A+G** | setCachedTranslation() がループ内で毎回 await → Phase 2 開始をブロック | translationEngine.ts:347-356, 497-508 | 100件 × ~1ms = ~100ms のフェーズ間遅延 |
| **B** | getCachedTranslation() が1件ずつ storage.get() | translationEngine.ts:213-222, 437-446 | 200件 × ~1ms = ~200ms のキャッシュチェック遅延 |

### P1: 並列度・リトライ制御

| ID | 問題 | 場所 | 影響 |
|----|------|------|------|
| **C** | CONCURRENCY_LIMIT=10 が定義のみ（Promise.all 無制限） | translationEngine.ts:308-319, config.ts:34 | 大規模ページでレート制限エラーリスク |
| **D** | retry 二重実装（apiClient + engine 両層で retry()）| apiClient.ts:224, translationEngine.ts:833 | 最大 (3+1)×(3+1)=16 試行の可能性 |

### P2: DOM 操作効率

| ID | 問題 | 場所 | 影響 |
|----|------|------|------|
| **E** | isElementVisible() が getComputedStyle を親方向フルトラバース | contentScript.ts:875-898 | MutationObserver 高頻度呼び出し時のレイアウト強制 |

### P3: コード品質・長期安定性

| ID | 問題 | 場所 | 影響 |
|----|------|------|------|
| **F** | promoteToHigherTiers() デッドコード | translationEngine.ts:601-603 | なし（削除可能） |
| **H** | CACHE_CONFIG.TTL=3600000 が未実装（期限切れチェックなし） | config.ts:73 | ストレージ肥大化 |

---

## Devil's Advocate が指摘した追加リスク

| ID | 指摘 | 深刻度 | 対応方針 |
|----|------|--------|----------|
| **DA-1** | cache key が `translation:TEXT:LANG` の文字列連結 → `:` 含むテキストで衝突リスク | MEDIUM | H2 で getCacheKey() のエンコード改善 |
| **DA-2** | browser.storage.local のサイズ上限未管理（Chrome 10MB / Firefox 5MB） | MEDIUM | H3-H の TTL 実装時に eviction 戦略も追加 |
| **DA-3** | MutationObserver の throttling なし → SPA で API 連発リスク | MEDIUM | H2 で debounce(50-100ms) 追加検討 |
| **DA-4** | translateBatch() (非semiParallel) も同じ直列 await 問題あり | HIGH | A+G 修正時に両メソッド同時対応必須 |
| **DA-5** | Phase1/Phase2 の二重翻訳適用 → 冪等性の検証が必要 | LOW | E 修正前に applyTranslations() の冪等性を確認 |
| **DA-6** | C (並列制限) は典型ページ 2-5 バッチでは不要。実測優先を推奨 | INFO | C は DEFER (実測後に判断) |

---

## 実装計画

### Three Horizons

```
H1 (即効・1-2日):  A+G → B → F    ← storage I/O 最適化で最大効果
H2 (短期・3-7日):  D → E → DA-1 → DA-3
H3 (中期・要設計): H + DA-2 (TTL + eviction + storage上限管理)
DEFER:             C (実測後に判断)
```

### Sprint 1 (H1): Storage I/O 最適化

#### Process 11: キャッシュ書き込みバルク化 + fire-and-forget (A+G)

**対象ファイル**: `src/background/translationEngine.ts`
**対象メソッド**: translateBatchSemiParallel() :347-356, translateBatch() :497-508

**変更概要**:
1. `setBulkCachedTranslations(pairs[])` メソッドを新設
2. memory cache は同期で即時更新（翻訳結果の即時利用を保証）
3. browser.storage.local.set() は1回のバルク書き込み、void で fire-and-forget
4. translateBatchSemiParallel() と translateBatch() の両方を修正

**TDD手順**:
- RED: setBulkCachedTranslations のテスト追加（storage.set が1回呼ばれること、memory cache が即時更新されること）
- GREEN: 実装
- REFACTOR: tsc --noEmit

**リスク対策**:
- fire-and-forget の書き込み失敗は catch + logger.warn で記録
- 並列バッチでの同一キー競合は last-write-wins で許容（翻訳結果は同一なため）

**期待効果**: Phase 2 開始遅延 ~100ms → 0ms

---

#### Process 12: キャッシュ読み込みバッチ化 (B)

**対象ファイル**: `src/background/translationEngine.ts`
**対象メソッド**: translateBatchSemiParallel() :213-222, translateBatch() :437-446

**変更概要**:
1. `getBulkCachedTranslations(texts[], targetLanguage)` メソッドを新設
2. Pass 1: memory cache 全件チェック（同期）
3. Pass 2: memory miss のキーを収集し browser.storage.local.get(missKeys[]) で1回取得
4. ヒットしたエントリは memory cache に promote
5. translateBatchSemiParallel() と translateBatch() の共通処理を統合

**TDD手順**:
- RED: getBulkCachedTranslations のテスト追加（全件 memory hit / 全件 miss / 混在の3ケース）
- GREEN: 実装
- REFACTOR: 重複していた2メソッドのキャッシュチェックを共通化

**リスク対策**:
- storage エラー時は null 扱い（graceful degradation）
- 返却オブジェクトサイズ: 1000件×100byte ≈ 100KB、許容範囲

**期待効果**: キャッシュチェック ~200ms → ~5ms（初回）

---

#### Process 13: promoteToHigherTiers() デッドコード削除 (F)

**対象**: translationEngine.ts:601-603
**変更**: メソッド削除のみ
**テスト**: tsc + grep で参照なし確認

---

### Sprint 2 (H2): リトライ・DOM・堅牢性

#### Process 14: retry 二重実装の一元化 (D)

**対象ファイル**: `src/background/apiClient.ts`, `src/background/translationEngine.ts`

**変更概要**:
1. apiClient.translate() から retry() ラッパーを除去
2. engine.executeTranslationWithRetry() の retry() に一元化
3. testConnection() は engine 層を経由しないため個別対処：retry なしで1回のみ試行（ユーザー操作のため許容）

**注意**: apiClient 単体テストの更新が必要

**期待効果**: 最悪ケース 16 試行 → 4 試行（最大待機 30秒 → 7秒）

---

#### Process 15: isElementVisible() 最適化 (E)

**対象ファイル**: `src/content/contentScript.ts:875-898`

**変更概要**:
- DA の指摘を受け、offsetParent 方式ではなく **getComputedStyle 早期リターン方式** を採用
- display:none チェックを先頭に配置して early return（visibility:hidden のフルトラバースを回避）
- closest('[hidden],[aria-hidden="true"]') を先行チェック

**期待効果**: MutationObserver 応答速度改善（動的コンテンツの多い SPA で顕著）

---

#### Process 16: キャッシュキー安全化 (DA-1)

**対象**: translationEngine.ts getCacheKey()
**変更**: `translation:${text}:${lang}` → `translation:${encodeURIComponent(text)}:${lang}` (同期、依存なし)

---

#### Process 17: MutationObserver debounce (DA-3)

**対象**: contentScript.ts queueDynamicTranslation()
**変更**: queueMicrotask() → setTimeout(fn, 50) で 50ms debounce

---

### Sprint 3 (H3): 長期安定性

#### Process 18: TTL + Eviction 戦略 (H + DA-2)

**設計が必要な項目**:
- CacheEntry に createdAt フィールド追加（スキーマ変更）
- 既存キャッシュとの後方互換性
- 定期クリーンアップのタイミング設計
- storage.local.getBytesInUse() によるサイズ監視
- LRU eviction（storage 側）

---

## DAG（依存グラフ）

```
Sprint 1:
  P11 (A+G: バルク書き込み) ──┐
                              ├──→ npm test ──→ Sprint 2
  P12 (B: バルク読み込み)   ──┘        ↑
  P13 (F: デッドコード)     ──────────┘

Sprint 2:
  P14 (D: retry一元化) ──┐
  P15 (E: isVisible)   ──┤
  P16 (DA-1: cacheKey) ──┼──→ npm test ──→ Sprint 3
  P17 (DA-3: debounce) ──┘

Sprint 3:
  P18 (H+DA-2: TTL設計) ──→ 設計レビュー → 実装

DEFER:
  C (並列制限) ← API rate limit 実測後に判断
```

---

## 期待効果サマリー

| シナリオ | 改善前 | Sprint 1 後 | 削減率 |
|---------|--------|-------------|--------|
| 初回翻訳（200テキスト、50%キャッシュミス） | ~350ms | ~105ms | **-70%** |
| 2回目翻訳（全件キャッシュヒット） | ~200ms | ~5ms | **-97%** |
| 最悪リトライ（Sprint 2 後） | ~30秒 | ~7秒 | **-77%** |

---

## Noticed but Not in Scope

- `translateBatch()` と `translateBatchSemiParallel()` のコード重複（P12 で部分解消）
- LRU Cache の FIFO/LRU 命名混乱（機能上は正常）
- Phase1/Phase2 の applyTranslations 冪等性（DA-5、実害なしと判断）
- commandHandler.ts / StorageManager.ts / useSettings.ts の未置換 console.log（前ミッションのスコープ外）
