import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Reward } from '@/models/Reward';
import { ListingType } from '@/types';
import { Redemption } from '@/models/Redemption';
import { CacheService } from '@/services/cache';
import { broadcastAdminEvent } from '@/lib/websocket';
import { logAdminAction } from '../utils/audit-helper';
import { z } from 'zod';

const MarketplaceItemSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    category: z.string().optional(),
    pointsCost: z.number().int().positive().or(z.string().transform(Number)),
    stockQuantity: z.number().int().min(0).or(z.string().transform(Number)).optional(),
    stockAvailable: z.number().int().min(0).or(z.string().transform(Number)).optional(),
    imageUrl: z.string().optional(),
    isActive: z.boolean().or(z.string().transform(v => v === 'true')).optional().default(true),
    isPopular: z.boolean().or(z.string().transform(v => v === 'true')).optional().default(false),
    partnerId: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
});

export default async function marketplaceRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    // GET marketplace items with caching
    fastify.get('/items', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; category?: string; isActive?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', category, isActive } = request.query;
            const cacheKey = `admin:marketplace:${page}:${limit}:${category || 'all'}:${isActive || 'all'}`;

            // Try cache first
            const cached = await CacheService.get(cacheKey);
            if (cached) {
                return reply.send(cached);
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (category) query.category = category;
            if (isActive !== undefined) query.isActive = isActive === 'true';

            // Enforce marketplace items only
            query.listingType = ListingType.MARKETPLACE_ITEM;

            const [items, total] = await Promise.all([
                Reward.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Reward.countDocuments(query)
            ]);

            const result = { items, total, page: parseInt(page), limit: parseInt(limit) };
            await CacheService.set(cacheKey, result, { ttl: 300 }); // 5 min cache

            return reply.send(result);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch marketplace items' });
        }
    });

    fastify.get('/items/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const item = await Reward.findById(request.params.id);
            if (!item) return reply.status(404).send({ error: 'Item not found' });
            return reply.send(item);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch item' });
        }
    });

    fastify.post<{
        Body: z.infer<typeof MarketplaceItemSchema>
    }>('/items', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const body = MarketplaceItemSchema.parse(request.body);

            // Ensure required fields have defaults
            const itemData = {
                name: body.name,
                description: body.description,
                category: body.category,
                pointsCost: body.pointsCost || 100,
                stockQuantity: body.stockQuantity || 0,
                stockAvailable: body.stockAvailable ?? body.stockQuantity ?? 0,
                imageUrl: body.imageUrl || '',
                isActive: body.isActive,
                isPopular: body.isPopular,
                partnerId: body.partnerId,
                metadata: body.metadata || {},
                listingType: ListingType.MARKETPLACE_ITEM
            };

            const item = await Reward.create(itemData);

            // Log action
            await logAdminAction(adminId, 'CREATE', 'marketplace_item', item._id.toString(), { name: item.name });

            // Invalidate cache
            await CacheService.invalidate('admin:marketplace:*');

            // Broadcast event
            broadcastAdminEvent({ type: 'marketplace_item_created', item });

            return reply.status(201).send({ success: true, data: item });
        } catch (error) {
            const err = error as Error & { name?: string };
            console.error('Failed to create marketplace item:', error);
            // Return validation errors if available
            if (err.name === 'ValidationError') {
                return reply.status(400).send({
                    success: false,
                    error: 'Validation failed',
                    details: err.message
                });
            }
            return reply.status(500).send({ success: false, error: err.message || 'Failed to create item' });
        }
    });

    fastify.put<{
        Params: { id: string }
        Body: Partial<z.infer<typeof MarketplaceItemSchema>>
    }>('/items/:id', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const item = await Reward.findById(request.params.id);

            if (!item) return reply.status(404).send({ error: 'Item not found' });

            // Update fields manually to trigger pre-save hooks (important for stock consistency)
            const updates = request.body;
            if (updates.name) item.name = updates.name;
            if (updates.description) item.description = updates.description;
            if (updates.category) item.category = updates.category as any;
            if (updates.pointsCost) item.pointsCost = updates.pointsCost;
            if (updates.stockQuantity !== undefined) item.stockQuantity = updates.stockQuantity;
            if (updates.stockAvailable !== undefined) item.stockAvailable = updates.stockAvailable;
            if (updates.imageUrl) item.imageUrl = updates.imageUrl;
            if (updates.isActive !== undefined) item.isActive = updates.isActive;
            if (updates.isPopular !== undefined) item.isPopular = updates.isPopular;
            if (updates.partnerId) item.partnerId = updates.partnerId as any; // Cast for ObjectId
            if (updates.metadata) item.metadata = { ...item.metadata, ...updates.metadata };

            item.updatedBy = adminId as any;

            await item.save();
            console.log(`[Marketplace] Item ${item._id} saved. New stock: ${item.stockAvailable}`);

            // Log action
            await logAdminAction(adminId, 'UPDATE', 'marketplace_item', request.params.id, { changes: request.body });

            // Invalidate cache
            const deleted = await CacheService.invalidate('admin:marketplace:*');
            console.log(`[Marketplace] Cache invalidated for admin:marketplace:*. Keys deleted: ${deleted}`);

            // Broadcast event
            broadcastAdminEvent({ type: 'marketplace_item_updated', item });
            console.log(`[Marketplace] Event broadcasted for item ${item._id}`);

            return reply.send(item);
        } catch (error) {
            console.error('Failed to update marketplace item:', error);
            return reply.status(500).send({ error: 'Failed to update item' });
        }
    });

    fastify.delete('/items/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const item = await Reward.findByIdAndDelete(request.params.id);
            if (!item) return reply.status(404).send({ error: 'Item not found' });

            // Log action
            await logAdminAction(adminId, 'DELETE', 'marketplace_item', request.params.id, { name: item.name });

            // Invalidate cache
            await CacheService.invalidate('admin:marketplace:*');

            // Broadcast event
            broadcastAdminEvent({ type: 'marketplace_item_deleted', itemId: request.params.id });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to delete item' });
        }
    });

    fastify.get('/stats', async (_request, reply) => {
        try {
            const [totalItems, activeItems, totalRedemptions, pendingRedemptions, pendingApproval] = await Promise.all([
                Reward.countDocuments({ listingType: ListingType.MARKETPLACE_ITEM }),
                Reward.countDocuments({ listingType: ListingType.MARKETPLACE_ITEM, isActive: true }),
                Redemption.countDocuments(),
                Redemption.countDocuments({ status: 'pending' }),
                Reward.countDocuments({ listingType: ListingType.MARKETPLACE_ITEM, approvalStatus: 'pending' })
            ]);

            return reply.send({ totalItems, activeItems, totalRedemptions, pendingRedemptions, pendingApproval });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch marketplace stats' });
        }
    });

    // Get items pending approval
    fastify.get('/pending', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20' } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);

            const query = {
                listingType: ListingType.MARKETPLACE_ITEM,
                approvalStatus: 'pending'
            };

            const [items, total] = await Promise.all([
                Reward.find(query)
                    .populate('partnerId', 'name email logo')
                    .skip(skip)
                    .limit(parseInt(limit))
                    .sort({ createdAt: -1 }),
                Reward.countDocuments(query)
            ]);

            return reply.send({ items, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch pending items' });
        }
    });

    // Approve marketplace item
    fastify.post<{
        Params: { id: string }
    }>('/items/:id/approve', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const item = await Reward.findById(request.params.id);

            if (!item) {
                return reply.status(404).send({ success: false, error: 'Item not found' });
            }

            if (item.approvalStatus !== 'pending') {
                return reply.status(400).send({ success: false, error: 'Item is not pending approval' });
            }

            item.approvalStatus = 'approved';
            item.isActive = true;
            item.approvedBy = adminId as any;
            item.approvedAt = new Date();
            await item.save();

            // Log action
            await logAdminAction(adminId, 'APPROVE', 'marketplace_item', request.params.id, { name: item.name });

            // Invalidate cache
            await CacheService.invalidate('admin:marketplace:*');

            // Broadcast event
            broadcastAdminEvent({
                type: 'marketplace_item_approved',
                item,
                data: { itemId: item._id, partnerId: item.partnerId, name: item.name }
            });

            return reply.send({ success: true, item });
        } catch (error) {
            console.error('Failed to approve item:', error);
            return reply.status(500).send({ success: false, error: 'Failed to approve item' });
        }
    });

    // Reject marketplace item
    fastify.post<{
        Params: { id: string },
        Body: { reason?: string }
    }>('/items/:id/reject', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const { reason } = request.body || {};
            const item = await Reward.findById(request.params.id);

            if (!item) {
                return reply.status(404).send({ success: false, error: 'Item not found' });
            }

            if (item.approvalStatus !== 'pending') {
                return reply.status(400).send({ success: false, error: 'Item is not pending approval' });
            }

            item.approvalStatus = 'rejected';
            item.isActive = false;
            item.metadata = {
                ...(item.metadata || {}),
                rejectionReason: reason,
                rejectedAt: new Date(),
                rejectedBy: adminId
            };
            await item.save();

            // Log action
            await logAdminAction(adminId, 'REJECT', 'marketplace_item', request.params.id, { name: item.name, reason });

            // Invalidate cache
            await CacheService.invalidate('admin:marketplace:*');

            // Broadcast event
            broadcastAdminEvent({
                type: 'marketplace_item_rejected',
                item,
                data: { itemId: item._id, partnerId: item.partnerId, name: item.name, reason }
            });

            return reply.send({ success: true, item });
        } catch (error) {
            console.error('Failed to reject item:', error);
            return reply.status(500).send({ success: false, error: 'Failed to reject item' });
        }
    });

    // GET /redemptions — Admin marketplace purchase/redemption list
    fastify.get('/redemptions', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; status?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', status } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (status && status !== 'all') query.status = status;

            const [redemptions, total] = await Promise.all([
                Redemption.find(query)
                    .populate('userId', 'username email')
                    .populate('rewardId', 'name pointsCost category listingType')
                    .skip(skip)
                    .limit(parseInt(limit))
                    .sort({ createdAt: -1 }),
                Redemption.countDocuments(query),
            ]);

            return reply.send({
                success: true,
                redemptions,
                items: redemptions,
                total,
                page: parseInt(page),
                limit: parseInt(limit),
            });
        } catch (error) {
            return reply.status(500).send({ success: false, error: 'Failed to fetch marketplace redemptions' });
        }
    });
}
