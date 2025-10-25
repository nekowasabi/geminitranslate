/**
 * BrowserAdapter - Chrome/Firefox API統一層
 * Chrome と Firefox の拡張機能APIの差分を吸収し、単一のインターフェースを提供
 */

type BrowserAPI = typeof chrome | typeof browser;

class BrowserAdapter {
  private api: BrowserAPI;

  constructor() {
    // Chrome優先、Firefoxフォールバック
    this.api = typeof chrome !== 'undefined' && chrome.runtime ? chrome : browser;
  }

  /**
   * Chrome環境かどうかを判定
   */
  get isChrome(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime;
  }

  /**
   * Firefox環境かどうかを判定
   */
  get isFirefox(): boolean {
    return !this.isChrome && typeof browser !== 'undefined' && !!browser.runtime;
  }

  /**
   * Manifest バージョンを取得
   */
  get manifestVersion(): number {
    return this.api.runtime.getManifest().manifest_version;
  }

  /**
   * Storage API - ローカルストレージへのアクセス
   */
  get storage() {
    return {
      /**
       * ストレージからデータを取得
       * @param keys 取得するキーの配列
       * @returns Promise<取得したデータ>
       */
      get: <T extends Record<string, any>>(keys: string[]): Promise<T> => {
        return new Promise((resolve) => {
          this.api.storage.local.get(keys, (result) => {
            resolve(result as T);
          });
        });
      },

      /**
       * ストレージにデータを保存
       * @param data 保存するデータ
       */
      set: (data: Record<string, any>): Promise<void> => {
        return new Promise((resolve) => {
          this.api.storage.local.set(data, () => {
            resolve();
          });
        });
      },

      /**
       * ストレージからデータを削除
       * @param keys 削除するキーの配列
       */
      remove: (keys: string[]): Promise<void> => {
        return new Promise((resolve) => {
          this.api.storage.local.remove(keys, () => {
            resolve();
          });
        });
      },
    };
  }

  /**
   * Runtime API - 拡張機能のランタイム操作
   */
  get runtime() {
    return {
      /**
       * メッセージを送信
       * @param message 送信するメッセージ
       * @returns Promise<レスポンス>
       */
      sendMessage: <T = any>(message: any): Promise<T> => {
        return new Promise((resolve) => {
          this.api.runtime.sendMessage(message, (response) => {
            resolve(response);
          });
        });
      },

      /**
       * メッセージリスナー
       */
      onMessage: this.api.runtime.onMessage,

      /**
       * Manifestを取得
       */
      getManifest: () => this.api.runtime.getManifest(),

      /**
       * オプションページを開く
       */
      openOptionsPage: () => this.api.runtime.openOptionsPage(),
    };
  }

  /**
   * Tabs API - タブ操作
   */
  get tabs() {
    return {
      /**
       * タブを検索
       * @param queryInfo 検索条件
       * @returns Promise<タブの配列>
       */
      query: (queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> => {
        return new Promise((resolve) => {
          this.api.tabs.query(queryInfo, resolve);
        });
      },

      /**
       * タブにメッセージを送信
       * @param tabId タブID
       * @param message 送信するメッセージ
       */
      sendMessage: <T = any>(tabId: number, message: any): Promise<T> => {
        return new Promise((resolve) => {
          this.api.tabs.sendMessage(tabId, message, (response) => {
            resolve(response as T);
          });
        });
      },
    };
  }

  /**
   * Commands API - キーボードショートカット
   */
  get commands() {
    return {
      /**
       * コマンドリスナー
       */
      onCommand: this.api.commands.onCommand,
    };
  }
}

// シングルトンインスタンスをエクスポート
export default new BrowserAdapter();
