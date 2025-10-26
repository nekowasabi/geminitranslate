/**
 * StorageManager - 型安全なストレージ管理
 * BrowserAdapter を使用してChrome/Firefoxのストレージを統一的に扱う
 */

import BrowserAdapter from '@shared/adapters/BrowserAdapter';
import { StorageData, StorageKeys, DEFAULT_STORAGE } from '@shared/types';

class StorageManager {
  /**
   * ストレージからデータを取得（デフォルト値とマージ）
   * @param keys 取得するキーの配列（省略時は全データ取得）
   * @returns Promise<取得したデータ>
   */
  async get<K extends StorageKeys>(keys?: K[]): Promise<StorageData> {
    try {
      const data = keys
        ? await BrowserAdapter.storage.get<Partial<StorageData>>(keys)
        : await BrowserAdapter.storage.get<Partial<StorageData>>([]);

      // lineHeightマイグレーション処理: 2.0より大きい値を1.5に修正
      if (data.lineHeight && data.lineHeight > 2.0) {
        data.lineHeight = 1.5;
        await this.set({ lineHeight: 1.5 });
      }

      // デフォルト値とマージ
      return { ...DEFAULT_STORAGE, ...data };
    } catch (error) {
      console.error('StorageManager.get error:', error);
      return DEFAULT_STORAGE;
    }
  }

  /**
   * ストレージにデータを保存
   * @param data 保存するデータ
   */
  async set(data: Partial<StorageData>): Promise<void> {
    try {
      await BrowserAdapter.storage.set(data);
    } catch (error) {
      console.error('StorageManager.set error:', error);
      throw error;
    }
  }

  /**
   * ストレージからデータを削除
   * @param keys 削除するキーの配列
   */
  async remove(keys: StorageKeys[]): Promise<void> {
    try {
      await BrowserAdapter.storage.remove(keys);
    } catch (error) {
      console.error('StorageManager.remove error:', error);
      throw error;
    }
  }

  /**
   * ストレージをクリア
   */
  async clear(): Promise<void> {
    try {
      // BrowserAdapterにclearメソッドがないため、直接chrome.storage.local.clearを使用
      const api = typeof chrome !== 'undefined' ? chrome : browser;
      return new Promise((resolve) => {
        api.storage.local.clear(() => {
          resolve();
        });
      });
    } catch (error) {
      console.error('StorageManager.clear error:', error);
      throw error;
    }
  }

  /**
   * APIキーを取得
   * @returns Promise<APIキー | null>
   */
  async getApiKey(): Promise<string | null> {
    try {
      const data = await this.get(['openRouterApiKey']);
      return data.openRouterApiKey || null;
    } catch (error) {
      console.error('StorageManager.getApiKey error:', error);
      return null;
    }
  }

  /**
   * APIキーを保存
   * @param apiKey APIキー
   */
  async setApiKey(apiKey: string): Promise<void> {
    try {
      await this.set({ openRouterApiKey: apiKey });
    } catch (error) {
      console.error('StorageManager.setApiKey error:', error);
      throw error;
    }
  }

  /**
   * ターゲット言語を取得
   * @returns Promise<言語コード>
   */
  async getTargetLanguage(): Promise<string> {
    try {
      const data = await this.get(['targetLanguage']);
      return data.targetLanguage || DEFAULT_STORAGE.targetLanguage!;
    } catch (error) {
      console.error('StorageManager.getTargetLanguage error:', error);
      return DEFAULT_STORAGE.targetLanguage!;
    }
  }

  /**
   * ターゲット言語を保存
   * @param language 言語コード
   */
  async setTargetLanguage(language: string): Promise<void> {
    try {
      await this.set({ targetLanguage: language });
    } catch (error) {
      console.error('StorageManager.setTargetLanguage error:', error);
      throw error;
    }
  }
}

export default StorageManager;
