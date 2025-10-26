/**
 * Migration Manager
 *
 * Handles data migration from v2.x to v3.0.0
 * - Migrates `apiKey` → `openRouterApiKey`
 * - Sets default model: `google/gemini-2.0-flash-exp:free`
 * - Adds schema version tracking
 *
 * @example
 * ```typescript
 * const manager = new MigrationManager();
 * await manager.migrate();
 * ```
 */

import { logger } from '../shared/utils/logger';
import adapter from '../shared/adapters/BrowserAdapter';

/**
 * Current schema version
 */
const CURRENT_VERSION = '3.0.0';

/**
 * Default OpenRouter model
 * Empty string to require users to explicitly set the model
 */
const DEFAULT_MODEL = '';

/**
 * Storage keys for v2.x
 */
interface V2Storage {
  apiKey?: string;
  targetLanguage?: string;
  fontSize?: number;
  lineHeight?: number;
}

/**
 * Storage keys for v3.0.0
 */
interface V3Storage {
  openRouterApiKey?: string;
  openRouterModel?: string;
  targetLanguage?: string;
  fontSize?: number;
  lineHeight?: number;
  version?: string;
}

/**
 * Migration Manager
 */
export class MigrationManager {
  /**
   * Run migration if needed
   */
  async migrate(): Promise<void> {
    try {
      logger.log('Checking migration requirements...');

      const data = await adapter.storage.get([
        'version',
        'apiKey',
        'openRouterApiKey',
        'openRouterModel',
        'targetLanguage',
        'fontSize',
        'lineHeight',
      ]);

      // Check if migration is needed
      const currentVersion = data.version as string | undefined;

      if (currentVersion === CURRENT_VERSION) {
        logger.log(`Already on version ${CURRENT_VERSION}, no migration needed`);
        return;
      }

      if (!currentVersion || currentVersion.startsWith('2.')) {
        logger.log('Migrating from v2.x to v3.0.0...');
        await this.migrateV2ToV3(data as V2Storage);
        logger.log('Migration completed successfully');
      } else {
        logger.log(`Unknown version: ${currentVersion}, skipping migration`);
      }
    } catch (error) {
      logger.error('Migration failed:', error);
      // Don't throw - allow extension to run even if migration fails
    }
  }

  /**
   * Migrate from v2.x to v3.0.0
   */
  private async migrateV2ToV3(oldData: V2Storage): Promise<void> {

    // Prepare new storage data
    const newData: V3Storage = {
      version: CURRENT_VERSION,
      openRouterModel: DEFAULT_MODEL,
    };

    // Migrate apiKey → openRouterApiKey
    if (oldData.apiKey) {
      newData.openRouterApiKey = oldData.apiKey;
      logger.log('Migrated API key to openRouterApiKey');
    }

    // Preserve existing settings
    if (oldData.targetLanguage) {
      newData.targetLanguage = oldData.targetLanguage;
    }
    if (oldData.fontSize) {
      newData.fontSize = oldData.fontSize;
    }
    if (oldData.lineHeight) {
      newData.lineHeight = oldData.lineHeight;
    }

    // Save new data
    await adapter.storage.set(newData);

    // Remove old apiKey if it exists
    if (oldData.apiKey) {
      await adapter.storage.remove(['apiKey']);
      logger.log('Removed old apiKey');
    }

    logger.log('v2 → v3 migration completed', newData);
  }

  /**
   * Get current schema version
   */
  async getCurrentVersion(): Promise<string | undefined> {
    const data = await adapter.storage.get(['version']);
    return data.version as string | undefined;
  }
}

export default MigrationManager;
