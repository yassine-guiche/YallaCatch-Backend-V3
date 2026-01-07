import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { Types } from 'mongoose';
import { ARSession, ARSessionStatus } from '@/models/ARSession';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { v4 as uuidv4 } from 'uuid';

// Validation schemas
const startARViewSchema = z.object({
  prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID'),
  metadata: z.object({
    deviceModel: z.string().optional(),
    osVersion: z.string().optional(),
    arKitVersion: z.string().optional(),
    arCoreVersion: z.string().optional(),
    cameraPermission: z.boolean(),
    locationPermission: z.boolean()})});

const captureARScreenshotSchema = z.object({
  sessionId: z.string().uuid(),
  screenshot: z.object({
    base64: z.string().min(1), // Base64 encoded image
    location: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180)}).optional()})});

const endARSessionSchema = z.object({
  sessionId: z.string().uuid(),
  duration: z.number().min(0), // seconds
});

/**
 * AR Service
 */
export class ARService {
  /**
   * Start AR view session
   */
  static async startARView(
    userId: string,
    data: z.infer<typeof startARViewSchema>
  ) {
    try {
      // Validate prize exists
      const prize = await Prize.findById(data.prizeId);
      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      if (prize.status !== 'active' || prize.claimedCount >= prize.quantity) {
        throw new Error('PRIZE_NOT_AVAILABLE');
      }

      // Check if user has active AR session
      const activeSession = await ARSession.findOne({
        userId: new Types.ObjectId(userId),
        status: ARSessionStatus.ACTIVE});

      if (activeSession) {
        // Return existing session
        return {
          sessionId: activeSession.sessionId,
          prizeId: activeSession.prizeId,
          startedAt: activeSession.startedAt};
      }

      // Create new AR session
      const sessionId = uuidv4();
      const session = new ARSession({
        userId: new Types.ObjectId(userId),
        prizeId: new Types.ObjectId(data.prizeId),
        sessionId,
        status: ARSessionStatus.ACTIVE,
        startedAt: new Date(),
        metadata: data.metadata,
        screenshots: []});

      await session.save();

      typedLogger.info('AR session started', {
        userId,
        prizeId: data.prizeId,
        sessionId});

      return {
        sessionId: session.sessionId,
        prizeId: session.prizeId,
        startedAt: session.startedAt,
        arModel: (prize as any).arModel || null}; // TODO: Define proper type for arModel in Prize interface
      
    } catch (error: any) {
      typedLogger.error('Start AR view error', {
        userId,
        error: (error as any).message});
      throw error;
    }
  }

  /**
   * Capture AR screenshot
   */
  static async captureARScreenshot(
    userId: string,
    data: z.infer<typeof captureARScreenshotSchema>
  ) {
    try {
      // Find AR session
      const session = await ARSession.findOne({
        sessionId: data.sessionId,
        userId: new Types.ObjectId(userId)});

      if (!session) {
        throw new Error('AR_SESSION_NOT_FOUND');
      }

      if (session.status !== ARSessionStatus.ACTIVE) {
        throw new Error('AR_SESSION_NOT_ACTIVE');
      }

      // Upload screenshot to S3 (simulated - would use AWS SDK in production)
      const screenshotUrl = await this.uploadScreenshotToS3(
        data.screenshot.base64,
        session.sessionId
      );

      // Add screenshot to session
      session.screenshots.push({
        url: screenshotUrl,
        timestamp: new Date(),
        location: data.screenshot.location ? {
          lat: data.screenshot.location.lat,
          lng: data.screenshot.location.lng
        } : undefined});

      await session.save();

      typedLogger.info('AR screenshot captured', {
        userId,
        sessionId: data.sessionId,
        screenshotUrl});

      return {
        screenshotUrl,
        timestamp: new Date()};
      
    } catch (error: any) {
      typedLogger.error('Capture AR screenshot error', {
        userId,
        error: (error as any).message});
      throw error;
    }
  }

  /**
   * End AR session
   */
  static async endARSession(
    userId: string,
    data: z.infer<typeof endARSessionSchema>
  ) {
    try {
      // Find AR session
      const session = await ARSession.findOne({
        sessionId: data.sessionId,
        userId: new Types.ObjectId(userId)});

      if (!session) {
        throw new Error('AR_SESSION_NOT_FOUND');
      }

      if (session.status !== ARSessionStatus.ACTIVE) {
        throw new Error('AR_SESSION_NOT_ACTIVE');
      }

      // Update session
      session.status = ARSessionStatus.COMPLETED;
      session.completedAt = new Date();
      session.duration = data.duration;

      await session.save();

      typedLogger.info('AR session ended', {
        userId,
        sessionId: data.sessionId,
        duration: data.duration,
        screenshots: session.screenshots.length});

      return {
        sessionId: session.sessionId,
        duration: session.duration,
        screenshots: session.screenshots.length};
      
    } catch (error: any) {
      typedLogger.error('End AR session error', {
        userId,
        error: (error as any).message});
      throw error;
    }
  }

  /**
   * Get AR model for prize
   */
  static async getARModel(prizeId: string) {
    try {
      const prize = await Prize.findById(prizeId);
      
      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      const arModel = prize.model || {
        modelUrl: null,
        textureUrl: null,
        scale: 1.0,
        rotation: { x: 0, y: 0, z: 0 }};

      return {
        prizeId: prize._id,
        arModel};
      
    } catch (error: any) {
      typedLogger.error('Get AR model error', {
        prizeId,
        error: (error as any).message});
      throw error;
    }
  }

  /**
   * Upload screenshot to S3 (simulated)
   * In production, use AWS SDK
   */
  private static async uploadScreenshotToS3(
    base64Image: string,
    sessionId: string
  ): Promise<string> {
    // Simulated S3 upload
    // In production:
    // 1. Decode base64
    // 2. Upload to S3 bucket
    // 3. Return public URL
    
    const timestamp = Date.now();
    const filename = `ar-screenshots/${sessionId}/${timestamp}.jpg`;
    
    // Simulated URL
    return `https://yallacatch-ar-assets.s3.amazonaws.com/${filename}`;
  }
}

/**
 * AR Routes
 */
export default async function arRoutes(fastify: FastifyInstance) {
  // POST /api/ar/view - Start AR view session
  fastify.post<{ Body: z.infer<typeof startARViewSchema> }>(
    '/view',
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
                nullable: true}}}}}
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof startARViewSchema> }>, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;
      // Schema validation is now handled by the route schema
      const result = await ARService.startARView(userId, request.body);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'PRIZE_NOT_FOUND') {
        return reply.code(404).send({ error: 'PRIZE_NOT_FOUND', message: 'Prize not found' });
      }
      if ((error as any).message === 'PRIZE_NOT_AVAILABLE') {
        return reply.code(400).send({ error: 'PRIZE_NOT_AVAILABLE', message: 'Prize is not available' });
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
              timestamp: { type: 'string' }}}}
      }
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof captureARScreenshotSchema> }>, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;

      const result = await ARService.captureARScreenshot(userId, request.body);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'AR_SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'AR_SESSION_NOT_FOUND', message: 'AR session not found' });
      }
      if ((error as any).message === 'AR_SESSION_NOT_ACTIVE') {
        return reply.code(400).send({ error: 'AR_SESSION_NOT_ACTIVE', message: 'AR session is not active' });
      }
      throw error;
    }
  });

  // POST /api/ar/end - End AR session
  fastify.post<{ Body: z.infer<typeof endARSessionSchema> }>(
    '/end',
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
              screenshots: { type: 'number' }}}}
      }
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof endARSessionSchema> }>, reply: FastifyReply) => {
    try {
      const userId = request.user.sub;

      const result = await ARService.endARSession(userId, request.body);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'AR_SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'AR_SESSION_NOT_FOUND', message: 'AR session not found' });
      }
      if ((error as any).message === 'AR_SESSION_NOT_ACTIVE') {
        return reply.code(400).send({ error: 'AR_SESSION_NOT_ACTIVE', message: 'AR session is not active' });
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
                      z: { type: 'number' }}}}}}}}
      }
    },
    async (request: FastifyRequest<{ Params: { prizeId: string } }>, reply: FastifyReply) => {
    try {
      const { prizeId } = request.params;

      const result = await ARService.getARModel(prizeId);

      return reply.code(200).send(result);
    } catch (error: any) {
      if ((error as any).message === 'PRIZE_NOT_FOUND') {
        return reply.code(404).send({ error: 'PRIZE_NOT_FOUND', message: 'Prize not found' });
      }
      throw error;
    }
  });
}

