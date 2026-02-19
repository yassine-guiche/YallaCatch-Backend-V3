import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin, requireRole } from '@/middleware/auth';
import { UserRole } from '@/types';
import { handleFileUpload, UploadType, deleteFile } from './upload.service';
import { typedLogger } from '@/lib/typed-logger';

export default async function uploadRoutes(fastify: FastifyInstance) {
    /**
     * Upload user avatar
     * POST /upload/avatar
     */
    fastify.post('/avatar', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const userId = request.user?.sub;
            if (!userId) {
                return reply.code(401).send({ success: false, error: 'UNAUTHORIZED' });
            }

            const result = await handleFileUpload(request, 'avatar');

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                message: 'Avatar uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Avatar upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Upload partner logo
     * POST /upload/partner-logo
     */
    fastify.post('/partner-logo', {
        preHandler: [authenticate, requireRole([UserRole.ADMIN, UserRole.PARTNER, UserRole.SUPER_ADMIN, UserRole.MODERATOR]) as any]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await handleFileUpload(request, 'partner');

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                message: 'Partner logo uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Partner logo upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Upload reward image
     * POST /upload/reward-image
     */
    fastify.post('/reward-image', {
        preHandler: [authenticate, requireAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await handleFileUpload(request, 'reward');

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                message: 'Reward image uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Reward image upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Upload prize image
     * POST /upload/prize-image
     */
    fastify.post('/prize-image', {
        preHandler: [authenticate, requireAdmin]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await handleFileUpload(request, 'prize');

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                message: 'Prize image uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Prize image upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Upload marketplace item image
     * POST /upload/marketplace-item
     */
    fastify.post('/marketplace-item', {
        preHandler: [authenticate, requireRole([UserRole.PARTNER, UserRole.ADMIN, UserRole.SUPER_ADMIN]) as any]
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const result = await handleFileUpload(request, 'marketplace');

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                message: 'Marketplace item image uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Marketplace item upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Generic image upload (admin only)
     * POST /upload/image
     */
    fastify.post<{ Querystring: { type?: UploadType } }>('/image', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const type = request.query.type || 'reward';
            const validTypes: UploadType[] = ['avatar', 'partner', 'reward', 'prize', 'marketplace'];

            if (!validTypes.includes(type)) {
                return reply.code(400).send({
                    success: false,
                    error: `Invalid type. Valid types: ${validTypes.join(', ')}`
                });
            }

            const result = await handleFileUpload(request, type);

            if (!result.success) {
                return reply.code(400).send({ success: false, error: result.error });
            }

            return reply.send({
                success: true,
                url: result.url,
                type,
                message: 'Image uploaded successfully',
            });
        } catch (error) {
            typedLogger.error('Generic upload error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Upload failed' });
        }
    });

    /**
     * Delete uploaded file (admin only)
     * DELETE /upload/file
     */
    fastify.delete<{ Body: { url: string } }>('/file', {
        preHandler: [authenticate, requireAdmin]
    }, async (request, reply) => {
        try {
            const { url } = request.body;

            if (!url) {
                return reply.code(400).send({ success: false, error: 'URL is required' });
            }

            const deleted = deleteFile(url);

            if (!deleted) {
                return reply.code(404).send({ success: false, error: 'File not found' });
            }

            return reply.send({
                success: true,
                message: 'File deleted successfully',
            });
        } catch (error) {
            typedLogger.error('File delete error', { error: error instanceof Error ? error.message : 'Unknown' });
            return reply.code(500).send({ success: false, error: 'Delete failed' });
        }
    });
}
