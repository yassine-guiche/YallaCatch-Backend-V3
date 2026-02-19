import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { Code } from '@/models/Code';
import { Reward } from '@/models/Reward';
import crypto from 'crypto';
import { logAdminAction } from '../utils/audit-helper';

export default async function codesRoutes(fastify: FastifyInstance) {
    fastify.addHook('onRequest', authenticate);
    fastify.addHook('onRequest', requireAdmin);
    fastify.addHook('onRequest', adminRateLimit);

    fastify.get<{
        Querystring: { page?: string; limit?: string; isUsed?: string; isActive?: string }
    }>('/', async (request, reply) => {
        try {
            const { page = '1', limit = '20', isUsed, isActive } = request.query;
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const query: Record<string, unknown> = {};
            if (isUsed !== undefined) query.isUsed = isUsed === 'true';
            if (isActive !== undefined) query.isActive = isActive === 'true';

            const [codes, total] = await Promise.all([
                Code.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 }),
                Code.countDocuments(query)
            ]);

            return reply.send({ codes, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to fetch codes' });
        }
    });

    fastify.post<{
        Body: { count: number; prefix?: string; pointsValue?: number; rewardId?: string; expiresAt?: string }
    }>('/generate', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const { count, prefix = 'YALLA', pointsValue = 0, rewardId, expiresAt } = request.body;

            // Validate: must have either pointsValue or rewardId
            if (!pointsValue && !rewardId) {
                return reply.status(400).send({ error: 'Either pointsValue or rewardId is required' });
            }

            // If rewardId provided, verify it exists
            if (rewardId) {
                const reward = await Reward.findById(rewardId);
                if (!reward) {
                    return reply.status(404).send({ error: 'Reward not found' });
                }
            }

            const codes = [];

            for (let i = 0; i < count; i++) {
                const code = `${prefix}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
                codes.push({
                    code,
                    pointsValue: rewardId ? 0 : pointsValue,
                    rewardId: rewardId || undefined,
                    isActive: true,
                    isUsed: false,
                    expiresAt: expiresAt ? new Date(expiresAt) : undefined
                });
            }

            const createdCodes = await Code.insertMany(codes);

            await logAdminAction(adminId, 'GENERATE_CODES', 'code', 'batch', {
                count: createdCodes.length,
                prefix,
                pointsValue: rewardId ? 0 : pointsValue,
                rewardId: rewardId || null,
                expiresAt
            });

            return reply.status(201).send({ codes: createdCodes, count: createdCodes.length });
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to generate codes' });
        }
    });

    fastify.patch<{
        Params: { id: string }
    }>('/:id/deactivate', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const code = await Code.findByIdAndUpdate(
                request.params.id,
                { isActive: false },
                { new: true }
            );
            if (!code) return reply.status(404).send({ error: 'Code not found' });

            await logAdminAction(adminId, 'DEACTIVATE_CODE', 'code', request.params.id, {
                code: code.code,
                pointsValue: code.pointsValue
            });

            return reply.send(code);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to deactivate code' });
        }
    });

    // Activate a deactivated code
    fastify.patch<{
        Params: { id: string }
    }>('/:id/activate', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const code = await Code.findByIdAndUpdate(
                request.params.id,
                { isActive: true },
                { new: true }
            );
            if (!code) return reply.status(404).send({ error: 'Code not found' });

            await logAdminAction(adminId, 'ACTIVATE_CODE', 'code', request.params.id, {
                code: code.code,
                pointsValue: code.pointsValue
            });

            return reply.send(code);
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to activate code' });
        }
    });

    // Delete a promo code permanently
    fastify.delete<{
        Params: { id: string }
    }>('/:id', async (request, reply) => {
        try {
            const adminId = request.user?.sub;
            const code = await Code.findById(request.params.id);
            if (!code) return reply.status(404).send({ error: 'Code not found' });

            // Don't allow deletion of used codes for audit purposes
            if (code.isUsed) {
                return reply.status(400).send({ error: 'Cannot delete used codes. Deactivate instead.' });
            }

            await Code.findByIdAndDelete(request.params.id);

            await logAdminAction(adminId, 'DELETE_CODE', 'code', request.params.id, {
                code: code.code,
                pointsValue: code.pointsValue
            });

            return reply.status(204).send();
        } catch (error) {
            return reply.status(500).send({ error: 'Failed to delete code' });
        }
    });
}
