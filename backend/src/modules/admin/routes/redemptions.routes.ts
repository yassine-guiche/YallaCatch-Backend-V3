import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Redemption } from '@/models/Redemption';
import { Reward } from '@/models/Reward';
import { logAdminAction } from '../utils/audit-helper';

export default async function redemptionsRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    // GET / — List redemptions with pagination and filters
    fastify.get('/', async (request: FastifyRequest<{
        Querystring: { page?: string; limit?: string; status?: string; userId?: string }
    }>, reply) => {
        try {
            const { page = '1', limit = '20', status, userId } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (status && status !== 'all') query.status = status;
            if (userId) query.userId = userId;

            const [redemptions, total] = await Promise.all([
                Redemption.find(query).populate('userId rewardId').skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Redemption.countDocuments(query)
            ]);

            return reply.send({
                redemptions,
                items: redemptions,
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                hasMore: skip + parseInt(limit) < total,
            });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch redemptions' });
        }
    });

    // GET /statistics — Aggregate redemption stats
    fastify.get('/statistics', async (_request, reply) => {
        try {
            const [total, pending, processing, fulfilled, rejected, cancelled] = await Promise.all([
                Redemption.countDocuments(),
                Redemption.countDocuments({ status: 'pending' }),
                Redemption.countDocuments({ status: 'processing' }),
                Redemption.countDocuments({ status: 'fulfilled' }),
                Redemption.countDocuments({ status: 'rejected' }),
                Redemption.countDocuments({ status: 'cancelled' }),
            ]);

            return reply.send({
                success: true,
                data: { total, pending, processing, shipped: 0, delivered: fulfilled, fulfilled, rejected, cancelled },
            });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch redemption statistics' });
        }
    });

    // GET /export — Export redemptions as JSON (CSV conversion left to frontend)
    fastify.get('/export', async (request: FastifyRequest<{
        Querystring: { status?: string; userId?: string }
    }>, reply) => {
        try {
            const { status, userId } = request.query;
            const query: Record<string, unknown> = {};
            if (status && status !== 'all') query.status = status;
            if (userId) query.userId = userId;

            const redemptions = await Redemption.find(query)
                .populate('userId', 'username email')
                .populate('rewardId', 'name pointsCost category')
                .sort({ createdAt: -1 })
                .limit(5000)
                .lean();

            return reply.send({ success: true, data: redemptions, total: redemptions.length });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to export redemptions' });
        }
    });

    // GET /:id — Get single redemption by ID
    fastify.get('/:id', async (request: FastifyRequest<{
        Params: { id: string }
    }>, reply) => {
        try {
            const redemption = await Redemption.findById(request.params.id)
                .populate('userId rewardId');
            if (!redemption) return reply.status(404).send({ error: 'Redemption not found' });
            return reply.send({ success: true, data: redemption });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch redemption' });
        }
    });

    // PATCH /:id/status — Update redemption status
    fastify.patch('/:id/status', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { status: string; notes?: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { status, notes } = request.body;
            const updateFields: Record<string, unknown> = { status };
            if (notes) updateFields.notes = notes;
            if (status === 'fulfilled') updateFields.fulfilledAt = new Date();

            const redemption = await Redemption.findByIdAndUpdate(
                request.params.id,
                updateFields,
                { new: true }
            ).populate('userId rewardId');
            if (!redemption) return reply.status(404).send({ error: 'Redemption not found' });

            await logAdminAction(adminId, 'UPDATE_REDEMPTION_STATUS', 'redemption', request.params.id, {
                userId: String((redemption.userId as unknown as { _id?: { toString(): string } })?._id ?? redemption.userId),
                newStatus: status,
                notes,
            });

            return reply.send({ success: true, data: redemption });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to update redemption status' });
        }
    });

    // PATCH /:id/tracking — Update tracking information
    fastify.patch('/:id/tracking', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { tracking: { carrier?: string; trackingNumber?: string; status?: string } }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { tracking } = request.body;

            const redemption = await Redemption.findByIdAndUpdate(
                request.params.id,
                { $set: { 'metadata.tracking': tracking } },
                { new: true }
            ).populate('userId rewardId');
            if (!redemption) return reply.status(404).send({ error: 'Redemption not found' });

            await logAdminAction(adminId, 'UPDATE_REDEMPTION_TRACKING', 'redemption', request.params.id, {
                carrier: tracking.carrier,
                trackingNumber: tracking.trackingNumber,
            });

            return reply.send({ success: true, data: redemption });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to update tracking information' });
        }
    });

    // POST /:id/cancel — Cancel a redemption with reason
    fastify.post('/:id/cancel', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { reason: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { reason } = request.body;

            const redemption = await Redemption.findById(request.params.id);
            if (!redemption) return reply.status(404).send({ error: 'Redemption not found' });

            // Only pending/processing redemptions can be cancelled
            const cancellableStatuses = ['pending', 'processing'];
            if (!cancellableStatuses.includes(redemption.status as string)) {
                return reply.status(400).send({ error: `Cannot cancel redemption with status: ${redemption.status}` });
            }

            // Refund points to user
            const pointsToRefund = redemption.pointsSpent || 0;
            if (pointsToRefund > 0) {
                const User = (await import('@/models/User')).User;
                await User.findByIdAndUpdate(redemption.userId, { $inc: { points: pointsToRefund } });
            }

            redemption.status = 'cancelled' as any;
            redemption.set('metadata.cancelReason', reason);
            redemption.set('metadata.cancelledAt', new Date());
            redemption.set('metadata.cancelledBy', adminId);
            await redemption.save();
            await redemption.populate('userId rewardId');

            await logAdminAction(adminId, 'CANCEL_REDEMPTION', 'redemption', request.params.id, {
                userId: String((redemption.userId as unknown as { _id?: { toString(): string } })?._id ?? redemption.userId),
                reason,
                pointsRefunded: pointsToRefund,
            });

            return reply.send({ success: true, data: redemption, message: 'Redemption cancelled and points refunded' });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to cancel redemption' });
        }
    });

    // POST /bulk-update — Bulk update redemption statuses
    fastify.post('/bulk-update', async (request: FastifyRequest<{
        Body: { redemptionIds: string[]; status: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { redemptionIds, status } = request.body;

            if (!Array.isArray(redemptionIds) || redemptionIds.length === 0) {
                return reply.status(400).send({ error: 'redemptionIds must be a non-empty array' });
            }

            const result = await Redemption.updateMany(
                { _id: { $in: redemptionIds } },
                { status, ...(status === 'fulfilled' ? { fulfilledAt: new Date() } : {}) }
            );

            await logAdminAction(adminId, 'BULK_UPDATE_REDEMPTIONS', 'redemption', 'bulk', {
                count: redemptionIds.length,
                newStatus: status,
                matchedCount: result.modifiedCount,
            });

            return reply.send({
                success: true,
                data: { updated: result.modifiedCount, total: redemptionIds.length },
            });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to bulk update redemptions' });
        }
    });

    // POST /:id/validate — Validate/Reject redemption (legacy endpoint)
    fastify.post('/:id/validate', async (request: FastifyRequest<{
        Params: { id: string }
        Body: { validated: boolean; notes?: string }
    }>, reply) => {
        try {
            const adminId = request.user?.sub;
            const { validated, notes } = request.body;
            const redemption = await Redemption.findByIdAndUpdate(
                request.params.id,
                { status: validated ? 'fulfilled' : 'rejected', notes, fulfilledAt: validated ? new Date() : undefined },
                { new: true }
            ).populate('userId rewardId');
            if (!redemption) return reply.status(404).send({ error: 'Redemption not found' });

            await logAdminAction(adminId, validated ? 'VALIDATE_REDEMPTION' : 'REJECT_REDEMPTION', 'redemption', request.params.id, {
                userId: String((redemption.userId as unknown as { _id?: { toString(): string } })?._id ?? redemption.userId),
                rewardName: (redemption.rewardId as unknown as { name?: string })?.name,
                notes
            });

            return reply.send(redemption);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to validate redemption' });
        }
    });

    // POST /qr-scan — QR code scan for redemption fulfillment
    fastify.post('/qr-scan', async (request: FastifyRequest<{
        Body: { qrCode: string; scannedBy: string }
    }>, reply) => {
        try {
            const currentUser = request.user;
            const adminId = currentUser?.sub;
            const { qrCode, scannedBy } = request.body;

            // Find redemption first to check authorization
            const redemption = await Redemption.findOne({
                $or: [
                    { 'metadata.redemptionCode': qrCode },
                    { qrCode: qrCode }
                ],
                status: 'pending'
            }).populate('userId rewardId');

            if (!redemption) {
                return reply.status(404).send({ error: 'Invalid or already used QR code' });
            }

            // Get the reward to check partner ownership
            const reward = await Reward.findById(redemption.rewardId).populate('partnerId', 'name _id');
            if (!reward) {
                return reply.status(404).send({ error: 'Reward not found' });
            }

            // Security check: Only allow fulfillment by:
            // 1. Admin/SuperAdmin/Moderator
            // 2. Partner user whose partnerId matches the reward's partnerId
            const isAdmin = ['admin', 'super_admin', 'moderator'].includes(currentUser?.role?.toLowerCase() || '');
            const isAuthorizedPartner = currentUser?.role?.toLowerCase() === 'partner'
                && (currentUser as any)?.partnerId
                && reward.partnerId
                && (currentUser as any).partnerId.toString() === (reward.partnerId as unknown as { _id?: { toString(): string } })?._id?.toString();

            if (!isAdmin && !isAuthorizedPartner) {
                return reply.status(403).send({
                    error: 'UNAUTHORIZED_FULFILLMENT',
                    message: 'Only the related partner can fulfill this redemption'
                });
            }

            // Update redemption status
            redemption.status = 'fulfilled' as any;
            redemption.set('fulfilledAt', new Date());
            redemption.set('fulfilledBy', adminId);
            await redemption.save();

            await logAdminAction(adminId, 'QR_SCAN_REDEMPTION', 'redemption', String(redemption._id), {
                userId: String((redemption.userId as unknown as { _id?: { toString(): string } })?._id ?? redemption.userId),
                rewardName: (reward as unknown as { name?: string })?.name,
                partnerName: (reward.partnerId as unknown as { name?: string })?.name || 'Unknown',
                scannedBy,
                qrCode: qrCode.substring(0, 10) + '...'
            });

            return reply.send({
                success: true,
                redemption,
                message: 'Redemption fulfilled successfully'
            });
        } catch (error) {
            console.error('QR scan error:', error);
            return reply.status(500).send({ error: 'Failed to process QR scan' });
        }
    });
}
