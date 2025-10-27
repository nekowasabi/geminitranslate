// 共通型定義

export interface TranslationRequest {
  action: 'translate' | 'translateSelection' | 'translateClipboard' | 'requestTranslation' | 'reset';
  texts?: string[];
  text?: string;
  targetLanguage?: string;
}

export interface TranslationResponse {
  translations?: string[];
  translation?: string;
  status: 'success' | 'error' | 'started' | 'completed' | 'reset';
  error?: string;
  count?: number;
}

export interface StorageData {
  openRouterApiKey?: string;
  openRouterModel?: string;
  openRouterProvider?: string;
  targetLanguage?: string;
  fontSize?: number;
  lineHeight?: number;
  darkMode?: boolean;
  schemaVersion?: number;
  migrationNoticeShown?: boolean;
  selectionFontSize?: number;
}

export type StorageKeys = keyof StorageData;

export const DEFAULT_STORAGE: StorageData = {
  openRouterApiKey: undefined,
  targetLanguage: 'ja',
  fontSize: 16,
  lineHeight: 1.5,
  darkMode: false,
  openRouterModel: '',
  schemaVersion: 3,
  selectionFontSize: 14,
};
