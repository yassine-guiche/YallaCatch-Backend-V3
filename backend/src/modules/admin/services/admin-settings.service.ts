import { Types } from 'mongoose';
import { Settings } from '@/models/Settings';
import { typedLogger } from '@/lib/typed-logger';
import { configService } from '@/services/config';
import { audit } from '@/lib/audit-logger';

export class AdminSettingsService {
  static async getSettings() {
    typedLogger.info('Fetching all settings');
    return Settings.findOne();
  }

  static async updateSettings(adminId: string, update: any) {
    typedLogger.info('Updating settings', { adminId });
    const updated = await Settings.findOneAndUpdate(
      {},
      { ...update, updatedBy: new Types.ObjectId(adminId) },
      { new: true, upsert: true }
    );
    
    // Broadcast config change
    if (updated) {
      await configService.reload();
    }
    
    // Audit log
    await audit.settingsUpdated(adminId, 'global', { metadata: { changes: Object.keys(update) } });
    
    return updated;
  }

  static async getSettingsSection(section: string) {
    typedLogger.info('Fetching settings section', { section });
    // Use ConfigService for better caching and pub/sub support
    return configService.getConfigSection(section);
  }

  static async updateSettingsSection(adminId: string, section: string, data: any) {
    typedLogger.info('Updating settings section', { adminId, section });
    
    // Validate before updating
    const validation = await configService.validateConfigUpdate(section, data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Use ConfigService for hot-reload support
    return configService.updateConfigSection(section, data, adminId);
  }

  static async getMaintenanceStatus() {
    typedLogger.info('Fetching maintenance status');
    const settings = await Settings.findOne();
    return {
      enabled: settings?.maintenance?.maintenanceMode ?? false,
      message: settings?.maintenance?.maintenanceMessage ?? null
    };
  }

  static async startMaintenance(adminId: string, message?: string) {
    typedLogger.info('Starting maintenance mode', { adminId });
    const result = await Settings.findOneAndUpdate(
      {},
      {
        maintenanceMode: true,
        maintenanceMessage: message || 'System is under maintenance',
        updatedBy: new Types.ObjectId(adminId)
      },
      { new: true, upsert: true }
    );
    
    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'START_MAINTENANCE',
      resource: 'settings',
      category: 'admin',
      severity: 'high',
      description: 'Started maintenance mode',
      metadata: { message },
    });
    
    return result;
  }

  static async stopMaintenance(adminId: string) {
    typedLogger.info('Stopping maintenance mode', { adminId });
    const result = await Settings.findOneAndUpdate(
      {},
      {
        maintenanceMode: false,
        maintenanceMessage: null,
        updatedBy: new Types.ObjectId(adminId)
      },
      { new: true, upsert: true }
    );
    
    // Audit log
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action: 'STOP_MAINTENANCE',
      resource: 'settings',
      category: 'admin',
      severity: 'high',
      description: 'Stopped maintenance mode',
    });
    
    return result;
  }
}

export default AdminSettingsService;
