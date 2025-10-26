import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import MigrationManager from '@background/migration';
import BrowserAdapter from '@shared/adapters/BrowserAdapter';

// Mock BrowserAdapter
jest.mock('@shared/adapters/BrowserAdapter', () => ({
  __esModule: true,
  default: {
    getBrowser: jest.fn(),
    isFirefox: jest.fn(),
    isChrome: jest.fn(),
  },
}));

describe('MigrationManager', () => {
  let migrationManager: MigrationManager;
  let mockBrowser: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock browser storage
    mockBrowser = {
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn(),
          clear: jest.fn(),
        },
      },
      notifications: {
        create: jest.fn(),
      },
      runtime: {
        getURL: jest.fn((path: string) => `chrome-extension://fake-id/${path}`),
      },
    };

    (BrowserAdapter.getBrowser as jest.Mock).mockReturnValue(mockBrowser);
    (BrowserAdapter.isFirefox as jest.Mock).mockReturnValue(false);
    (BrowserAdapter.isChrome as jest.Mock).mockReturnValue(true);

    migrationManager = new MigrationManager();
  });

  describe('migrate', () => {
    it('should skip migration if already on v3.0.0', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        version: '3.0.0',
        openRouterApiKey: 'test-key',
      });

      await migrationManager.migrate();

      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();
      expect(mockBrowser.storage.local.remove).not.toHaveBeenCalled();
    });

    it('should migrate from v2.x to v3.0.0', async () => {
      // Old v2.x data
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'old-api-key',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 1.5,
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);
      mockBrowser.notifications.create.mockResolvedValue('notification-id');

      await migrationManager.migrate();

      // Should save new data
      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        version: '3.0.0',
        openRouterModel: '',
        openRouterApiKey: 'old-api-key',
        targetLanguage: 'ja',
        fontSize: 16,
        lineHeight: 1.5,
      });

      // Should remove old apiKey
      expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith('apiKey');

      // Should show notification
      expect(mockBrowser.notifications.create).toHaveBeenCalledWith(
        'migration-notice',
        expect.objectContaining({
          type: 'basic',
          title: 'DoganayLab Translate v3.0 Migration',
        })
      );
    });

    it('should migrate without apiKey', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        targetLanguage: 'en',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);

      await migrationManager.migrate();

      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        version: '3.0.0',
        openRouterModel: '',
        targetLanguage: 'en',
      });

      // Should not try to remove apiKey if it didn't exist
      expect(mockBrowser.storage.local.remove).not.toHaveBeenCalled();
    });

    it('should handle migration from no version (fresh install)', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({});

      mockBrowser.storage.local.set.mockResolvedValue(undefined);

      await migrationManager.migrate();

      expect(mockBrowser.storage.local.set).toHaveBeenCalledWith({
        version: '3.0.0',
        openRouterModel: '',
      });
    });

    it('should handle migration errors gracefully', async () => {
      mockBrowser.storage.local.get.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(migrationManager.migrate()).resolves.not.toThrow();
    });
  });

  describe('migrateV2ToV3', () => {
    it('should preserve all v2 settings', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
        targetLanguage: 'ja',
        fontSize: 18,
        lineHeight: 1.8,
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);

      await migrationManager.migrate();

      const setCall = mockBrowser.storage.local.set.mock.calls[0][0];
      expect(setCall.openRouterApiKey).toBe('test-key');
      expect(setCall.targetLanguage).toBe('ja');
      expect(setCall.fontSize).toBe(18);
      expect(setCall.lineHeight).toBe(1.8);
    });

    it('should set default model', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);

      await migrationManager.migrate();

      const setCall = mockBrowser.storage.local.set.mock.calls[0][0];
      expect(setCall.openRouterModel).toBe('');
    });

    it('should add version field', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);

      await migrationManager.migrate();

      const setCall = mockBrowser.storage.local.set.mock.calls[0][0];
      expect(setCall.version).toBe('3.0.0');
    });
  });

  describe('showMigrationNotice', () => {
    it('should show notification on Firefox', async () => {
      (BrowserAdapter.isFirefox as jest.Mock).mockReturnValue(true);
      (BrowserAdapter.isChrome as jest.Mock).mockReturnValue(false);

      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);
      mockBrowser.notifications.create.mockResolvedValue('notification-id');

      await migrationManager.migrate();

      expect(mockBrowser.notifications.create).toHaveBeenCalledWith(
        'migration-notice',
        expect.objectContaining({
          type: 'basic',
          title: 'DoganayLab Translate v3.0 Migration',
          message: 'Your settings have been successfully migrated to v3.0.0',
        })
      );
    });

    it('should show notification on Chrome', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);
      mockBrowser.notifications.create.mockReturnValue('notification-id');

      await migrationManager.migrate();

      expect(mockBrowser.notifications.create).toHaveBeenCalledWith(
        'migration-notice',
        expect.objectContaining({
          type: 'basic',
          title: 'DoganayLab Translate v3.0 Migration',
        })
      );
    });

    it('should handle notification failure gracefully', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);
      mockBrowser.notifications.create.mockRejectedValue(new Error('Notification error'));

      // Should not throw
      await expect(migrationManager.migrate()).resolves.not.toThrow();
    });

    it('should handle missing notifications API', async () => {
      mockBrowser.notifications = undefined;

      mockBrowser.storage.local.get.mockResolvedValue({
        apiKey: 'test-key',
      });

      mockBrowser.storage.local.set.mockResolvedValue(undefined);
      mockBrowser.storage.local.remove.mockResolvedValue(undefined);

      // Should not throw
      await expect(migrationManager.migrate()).resolves.not.toThrow();
    });
  });

  describe('getCurrentVersion', () => {
    it('should return current version', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({
        version: '3.0.0',
      });

      const version = await migrationManager.getCurrentVersion();
      expect(version).toBe('3.0.0');
    });

    it('should return undefined if no version', async () => {
      mockBrowser.storage.local.get.mockResolvedValue({});

      const version = await migrationManager.getCurrentVersion();
      expect(version).toBeUndefined();
    });
  });

  describe('reset', () => {
    it('should clear storage', async () => {
      mockBrowser.storage.local.clear.mockResolvedValue(undefined);

      await migrationManager.reset();

      expect(mockBrowser.storage.local.clear).toHaveBeenCalled();
    });
  });
});
