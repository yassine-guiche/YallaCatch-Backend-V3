import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { ARService } from './ar.service';
import { startARViewSchema, captureARScreenshotSchema, endARSessionSchema } from './ar.schema';

const isErrorWithMessage = (error: unknown): error is Error =>
  error instanceof Error;

/**
 * AR Routes
 */
export default async function arRoutes(fastify: FastifyInstance) {
  // POST /api/ar/view - Start AR view session
  fastify.post<{ Body: z.infer<typeof startARViewSchema> }>(
    '/view/start',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Start AR view session for a prize',
        tags: ['AR'],
        body: startARViewSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              prizeId: { type: 'string' },
              startedAt: { type: 'string' },
              arModel: {
                type: 'object',
                nullable: true
              }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof startARViewSchema> }>, reply: FastifyReply) => {
      try {
        const userId = request.user.sub;
        // Schema validation is now handled by the route schema
        const result = await ARService.startARView(userId, request.body);

        return reply.code(200).send({ success: true, data: result });
      } catch (error: unknown) {
        if (isErrorWithMessage(error) && error.message === 'PRIZE_NOT_FOUND') {
          return reply.code(404).send({ success: false, error: 'PRIZE_NOT_FOUND', message: 'Prize not found' });
        }
        if (isErrorWithMessage(error) && error.message === 'PRIZE_NOT_AVAILABLE') {
          return reply.code(400).send({ success: false, error: 'PRIZE_NOT_AVAILABLE', message: 'Prize is not available' });
        }
        throw error;
      }
    });

  // POST /api/ar/capture - Capture AR screenshot
  fastify.post<{ Body: z.infer<typeof captureARScreenshotSchema> }>(
    '/capture',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Capture AR screenshot during session',
        tags: ['AR'],
        body: captureARScreenshotSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              screenshotUrl: { type: 'string' },
              timestamp: { type: 'string' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof captureARScreenshotSchema> }>, reply: FastifyReply) => {
      try {
        const userId = request.user.sub;

        const result = await ARService.captureARScreenshot(userId, request.body);

        return reply.code(200).send({ success: true, data: result });
      } catch (error: unknown) {
        if (isErrorWithMessage(error) && error.message === 'AR_SESSION_NOT_FOUND') {
          return reply.code(404).send({ success: false, error: 'AR_SESSION_NOT_FOUND', message: 'AR session not found' });
        }
        if (isErrorWithMessage(error) && error.message === 'AR_SESSION_NOT_ACTIVE') {
          return reply.code(400).send({ success: false, error: 'AR_SESSION_NOT_ACTIVE', message: 'AR session is not active' });
        }
        throw error;
      }
    });

  // POST /api/ar/end - End AR session
  fastify.post<{ Body: z.infer<typeof endARSessionSchema> }>(
    '/session/end',
    {
      preHandler: [authenticate],
      schema: {
        description: 'End AR view session',
        tags: ['AR'],
        body: endARSessionSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              sessionId: { type: 'string' },
              duration: { type: 'number' },
              screenshots: { type: 'number' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof endARSessionSchema> }>, reply: FastifyReply) => {
      try {
        const userId = request.user.sub;

        const result = await ARService.endARSession(userId, request.body);

        return reply.code(200).send({ success: true, data: result });
      } catch (error: unknown) {
        if (isErrorWithMessage(error) && error.message === 'AR_SESSION_NOT_FOUND') {
          return reply.code(404).send({ success: false, error: 'AR_SESSION_NOT_FOUND', message: 'AR session not found' });
        }
        if (isErrorWithMessage(error) && error.message === 'AR_SESSION_NOT_ACTIVE') {
          return reply.code(400).send({ success: false, error: 'AR_SESSION_NOT_ACTIVE', message: 'AR session is not active' });
        }
        throw error;
      }
    });

  // GET /api/ar/model/:prizeId - Get AR model for prize
  fastify.get<{ Params: { prizeId: string } }>(
    '/model/:prizeId',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get AR 3D model for a prize',
        tags: ['AR'],
        params: z.object({
          prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID')
        }),
        response: {
          200: {
            type: 'object',
            properties: {
              prizeId: { type: 'string' },
              arModel: {
                type: 'object',
                properties: {
                  modelUrl: { type: 'string', nullable: true },
                  textureUrl: { type: 'string', nullable: true },
                  scale: { type: 'number' },
                  rotation: {
                    type: 'object',
                    properties: {
                      x: { type: 'number' },
                      y: { type: 'number' },
                      z: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { prizeId: string } }>, reply: FastifyReply) => {
      try {
        const { prizeId } = request.params;

        const result = await ARService.getARModel(prizeId);

        return reply.code(200).send({ success: true, data: result });
      } catch (error: unknown) {
        if (isErrorWithMessage(error) && error.message === 'PRIZE_NOT_FOUND') {
          return reply.code(404).send({ success: false, error: 'PRIZE_NOT_FOUND', message: 'Prize not found' });
        }
        throw error;
      }
    });
}
