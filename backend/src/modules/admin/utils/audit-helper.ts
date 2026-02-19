import { audit } from '@/lib/audit-logger';

// Helper to log admin actions using unified audit logger
export async function logAdminAction(adminId: string, action: string, resource: string, resourceId: string, details?: any) {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
        userId: adminId,
        userRole: 'admin',
        action: action.toUpperCase(),
        resource,
        resourceId,
        category: 'admin',
        severity: action.includes('DELETE') ? 'medium' : 'low',
        metadata: details,
    });
}
