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
   * 生のブラウザAPIオブジェクトを返す
   * Why: method instead of direct property access — enables test mocking via jest.mock
   */
  getBrowser(): any {
    return this.api;
  }

  /**
   * runtime.lastErrorをチェックし、エラーがあればreject、なければresolveする
   * Chrome/Firefox両環境に対応
   * @param resolve Promiseのresolve関数
   * @param reject Promiseのreject関数
   * @param result 成功時の結果（オプション）
   */
  private handleRuntimeError<T>(
    resolve: (value: T) => void,
    reject: (reason?: any) => void,
    result?: T
  ): void {
    if (this.api.runtime.lastError) {
      reject(new Error(this.api.runtime.lastError.message));
    } else {
      resolve(result as T);
    }
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
        return new Promise((resolve, reject) => {
          this.api.storage.local.get(keys, (result) => {
            this.handleRuntimeError(resolve, reject, result as T);
          });
        });
      },

      /**
       * ストレージにデータを保存
       * @param data 保存するデータ
       */
      set: (data: Record<string, any>): Promise<void> => {
        return new Promise((resolve, reject) => {
          this.api.storage.local.set(data, () => {
            this.handleRuntimeError(resolve, reject, undefined as void);
          });
        });
      },

      /**
       * ストレージからデータを削除
       * @param keys 削除するキーの配列
       */
      remove: (keys: string[]): Promise<void> => {
        return new Promise((resolve, reject) => {
          this.api.storage.local.remove(keys, () => {
            this.handleRuntimeError(resolve, reject, undefined as void);
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
      // Why: reject なし + runtime.lastError 無視だと Phase 2 の Promise が永久 pending になる。
      // Phase 1 長時間処理後にメッセージチャネルが不安定化すると Phase 2 がハングする原因。
      sendMessage: <T = any>(message: any): Promise<T> => {
        return new Promise((resolve, reject) => {
          try {
            this.api.runtime.sendMessage(message, (response) => {
              this.handleRuntimeError(resolve, reject, response as T);
            });
          } catch (error) {
            reject(error);
          }
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
      // Why: reject なし + runtime.lastError 無視だと、タブが存在しない場合に Promise が永久 pending になる。
      // runtime.sendMessage と同じパターンで修正。
      sendMessage: <T = any>(tabId: number, message: any): Promise<T> => {
        return new Promise((resolve, reject) => {
          try {
            this.api.tabs.sendMessage(tabId, message, (response) => {
              this.handleRuntimeError(resolve, reject, response as T);
            });
          } catch (error) {
            reject(error);
          }
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
