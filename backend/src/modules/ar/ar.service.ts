import { z } from 'zod';
import { Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { ARSession, ARSessionStatus } from '@/models/ARSession';
import { Prize } from '@/models/Prize';
import { typedLogger } from '@/lib/typed-logger';
import { startARViewSchema, captureARScreenshotSchema, endARSessionSchema } from './ar.schema';

const isErrorWithMessage = (error: unknown): error is Error =>
    error instanceof Error;

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

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
                status: ARSessionStatus.ACTIVE
            });

            if (activeSession) {
                // Return existing session
                return {
                    sessionId: activeSession.sessionId,
                    prizeId: activeSession.prizeId,
                    startedAt: activeSession.startedAt
                };
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
                screenshots: []
            });

            await session.save();

            typedLogger.info('AR session started', {
                userId,
                prizeId: data.prizeId,
                sessionId
            });

            return {
                sessionId: session.sessionId,
                prizeId: session.prizeId,
                startedAt: session.startedAt,
                arModel: prize.arModel ?? null
            };

        } catch (error: unknown) {
            typedLogger.error('Start AR view error', {
                userId,
                error: getErrorMessage(error)
            });
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
                userId: new Types.ObjectId(userId)
            });

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
                } : undefined
            });

            await session.save();

            typedLogger.info('AR screenshot captured', {
                userId,
                sessionId: data.sessionId,
                screenshotUrl
            });

            return {
                screenshotUrl,
                timestamp: new Date()
            };

        } catch (error: unknown) {
            typedLogger.error('Capture AR screenshot error', {
                userId,
                error: getErrorMessage(error)
            });
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
                userId: new Types.ObjectId(userId)
            });

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
                screenshots: session.screenshots.length
            });

            return {
                sessionId: session.sessionId,
                duration: session.duration,
                screenshots: session.screenshots.length
            };

        } catch (error: unknown) {
            typedLogger.error('End AR session error', {
                userId,
                error: getErrorMessage(error)
            });
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

            const arModel = prize.arModel ?? {
                modelUrl: null,
                textureUrl: null,
                scale: 1.0,
                rotation: { x: 0, y: 0, z: 0 }
            };

            return {
                prizeId: prize._id,
                arModel
            };

        } catch (error: unknown) {
            typedLogger.error('Get AR model error', {
                prizeId,
                error: getErrorMessage(error)
            });
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
