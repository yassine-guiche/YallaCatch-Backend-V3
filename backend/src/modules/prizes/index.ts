import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { z } from 'zod';
import { Types } from 'mongoose';
import { Prize } from '@/models/Prize';
import { User } from '@/models/User';
import { typedLogger } from '@/lib/typed-logger';
import { config, TUNISIA_CITIES } from '@/config';
import { PrizeType, PrizeCategory, PrizeRarity, PrizeStatus, LocationType, IPrizeDocument, IPrizeModel, IUserDocument } from '@/types';
import { calculateGeodesicDistance, isWithinTunisia, findNearestCity } from '@/utils/geo';
import { validateAntiCheat } from '@/utils/anti-cheat';

// Validation schemas
const nearbyPrizesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius: z.number().min(0.1).max(50).default(5), // km
  category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
  rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]).optional(),
  minPoints: z.number().min(1).optional(),
  maxPoints: z.number().min(1).optional(),
  limit: z.number().min(1).max(100).default(50)});

const cityPrizesSchema = z.object({
  city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]),
  category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
  rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]).optional(),
  limit: z.number().min(1).max(100).default(50),
  page: z.number().min(1).default(1)});

const prizeDetailsSchema = z.object({
  prizeId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid prize ID')});

const searchPrizesSchema = z.object({
  query: z.string().min(1).max(100),
  city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]).optional(),
  category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]).optional(),
  limit: z.number().min(1).max(50).default(20),
  page: z.number().min(1).default(1)});

const createPrizeSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().min(10).max(500),
  type: z.enum(Object.values(PrizeType) as [string, ...string[]]),
  category: z.enum(Object.values(PrizeCategory) as [string, ...string[]]),
  points: z.number().min(1).max(10000),
  rarity: z.enum(Object.values(PrizeRarity) as [string, ...string[]]),
  quantity: z.number().min(1).max(1000).default(1),
  location: z.object({
    type: z.enum(Object.values(LocationType) as [string, ...string[]]).default(LocationType.GPS),
    coordinates: z.array(z.number()).length(2), // [lng, lat]
    radius: z.number().min(10).max(500).default(50),
    city: z.enum(Object.keys(TUNISIA_CITIES) as [string, ...string[]]),
    address: z.string().max(200).optional(),
    markerUrl: z.string().url().optional(),
    confidenceThreshold: z.number().min(0.1).max(1.0).default(0.8)}),
  visibility: z.object({
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional()}).optional(),
  expiresAt: z.string().datetime().optional(),
  imageUrl: z.string().url().optional(),
  value: z.number().min(0).optional(),
  tags: z.array(z.string().max(20)).max(10).default([])});

const updatePrizeSchema = createPrizeSchema.partial();

const bulkCreatePrizesSchema = z.object({
  prizes: z.array(createPrizeSchema).min(1).max(100)});

/**
 * Prize service
 */
export class PrizeService {
  /**
   * Get nearby prizes for a user
   */
  static async getNearbyPrizes(
    userId: string,
    data: z.infer<typeof nearbyPrizesSchema>
  ) {
    try {
      // Validate location is within Tunisia
      if (!isWithinTunisia({ lat: data.lat, lng: data.lng })) {
        throw new Error('LOCATION_OUT_OF_BOUNDS');
      }

      // Anti-cheat: block suspicious location signals
      const antiCheatResult = await validateAntiCheat(
        userId,
        { lat: data.lat, lng: data.lng },
        undefined
      );
      if (!antiCheatResult.allowed) {
        typedLogger.warn('Nearby prizes blocked by anti-cheat', {
          userId,
          location: { lat: data.lat, lng: data.lng },
          violations: antiCheatResult.violations,
          riskScore: antiCheatResult.riskScore,
        });
        throw new Error('ANTI_CHEAT_VIOLATION');
      }

      // Find nearby prizes
      const prizes = await Prize.findNearby(
        data.lat,
        data.lng,
        data.radius,
        {
          category: data.category,
          rarity: data.rarity,
          minPoints: data.minPoints,
          maxPoints: data.maxPoints,
          limit: data.limit}
      );

      // Calculate distance for each prize
      const prizesWithDistance = prizes.map(prize => {
        const [lng, lat] = prize.location.coordinates;
        const distance = calculateGeodesicDistance(
          { lat: data.lat, lng: data.lng },
          { lat, lng }
        );

        return {
          ...prize.toJSON(),
          distance: Math.round(distance),
          isWithinRadius: distance <= prize.location.radius};
      });

      // Update user location
      const user = await User.findById(userId);
      if (user) {
        const city = findNearestCity({ lat: data.lat, lng: data.lng });
          user.location = {
            lat: data.lat,
            lng: data.lng,
            city,
            lastUpdated: new Date()
          };
        await user.save();
      }

      typedLogger.info('Nearby prizes retrieved', {
        userId,
        location: { lat: data.lat, lng: data.lng },
        radius: data.radius,
        count: prizes.length});

      return {
        prizes: prizesWithDistance,
        location: {
          lat: data.lat,
          lng: data.lng,
          city: findNearestCity({ lat: data.lat, lng: data.lng })},
        total: prizes.length};

    } catch (error) {
      typedLogger.error('Get nearby prizes error', {
        error: (error as any).message,
        userId,
        location: { lat: data.lat, lng: data.lng }});
      throw error;
    }
  }

  /**
   * Get prizes by city
   */
  static async getCityPrizes(data: z.infer<typeof cityPrizesSchema>) {
    try {
      const skip = (data.page - 1) * data.limit;

      const prizes = await Prize.findByCity(data.city, {
        category: data.category,
        rarity: data.rarity,
        limit: data.limit,
        skip});

      const total = await Prize.countDocuments({
        'location.city': data.city,
        status: PrizeStatus.ACTIVE,
        'visibility.startAt': { $lte: new Date() },
        $or: [
          { 'visibility.endAt': { $exists: false } },
          { 'visibility.endAt': { $gt: new Date() } }
        ],
        ...(data.category && { category: data.category }),
        ...(data.rarity && { rarity: data.rarity })});

      return {
        prizes: prizes.map(prize => prize.toJSON()),
        pagination: {
          page: data.page,
          limit: data.limit,
          total,
          pages: Math.ceil(total / data.limit),
          hasNext: skip + data.limit < total,
          hasPrev: data.page > 1}};

    } catch (error) {
      typedLogger.error('Get city prizes error', {
        error: (error as any).message,
        city: data.city});
      throw error;
    }
  }

  /**
   * Get prize details
   */
  static async getPrizeDetails(
    userId: string,
    prizeId: string,
    userLocation?: { lat: number; lng: number }
  ) {
    try {
      const prize = await Prize.findById(prizeId).populate('createdBy', 'displayName');

      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      const result: any = {
        ...prize.toJSON(),
        canClaim: prize.status === 'active' && prize.claimedCount < prize.quantity};

      // Calculate distance if user location provided
      if (userLocation) {
        const antiCheatResult = await validateAntiCheat(
          userId,
          { lat: userLocation.lat, lng: userLocation.lng },
          undefined
        );
        if (!antiCheatResult.allowed) {
          typedLogger.warn('Prize details blocked by anti-cheat', {
            userId,
            prizeId,
            location: userLocation,
            violations: antiCheatResult.violations,
            riskScore: antiCheatResult.riskScore,
          });
          throw new Error('ANTI_CHEAT_VIOLATION');
        }

        const [lng, lat] = prize.location.coordinates;
        const distance = calculateGeodesicDistance(userLocation, { lat, lng });

        result.distance = Math.round(distance);
        result.isWithinRadius = distance <= prize.location.radius;
        result.canClaim = result.canClaim && result.isWithinRadius;
      }

      return result;

    } catch (error) {
      typedLogger.error('Get prize details error', {
        error: (error as any).message,
        userId,
        prizeId});
      throw error;
    }
  }

  /**
   * Search prizes
   */
  static async searchPrizes(data: z.infer<typeof searchPrizesSchema>) {
    try {
      const skip = (data.page - 1) * data.limit;

      const query: any = {
        $text: { $search: data.query },
        status: PrizeStatus.ACTIVE,
        'visibility.startAt': { $lte: new Date() },
        $or: [
          { 'visibility.endAt': { $exists: false } },
          { 'visibility.endAt': { $gt: new Date() } }
        ]};

      if (data.city) {
        query['location.city'] = data.city;
      }

      if (data.category) {
        query.category = data.category;
      }

      const prizes = await Prize.find(query)
        .sort({ score: { $meta: 'textScore' }, points: -1 })
        .limit(data.limit)
        .skip(skip);

      const total = await Prize.countDocuments(query);

      return {
        prizes: prizes.map(prize => prize.toJSON()),
        query: data.query,
        pagination: {
          page: data.page,
          limit: data.limit,
          total,
          pages: Math.ceil(total / data.limit),
          hasNext: skip + data.limit < total,
          hasPrev: data.page > 1}};

    } catch (error) {
      typedLogger.error('Search prizes error', {
        error: (error as any).message,
        query: data.query});
      throw error;
    }
  }

  /**
   * Create a new prize (admin only)
   */
  static async createPrize(
    adminId: string,
    data: z.infer<typeof createPrizeSchema>
  ) {
    try {
      // Validate coordinates are within Tunisia
      const [lng, lat] = data.location.coordinates;
      if (!isWithinTunisia({ lat, lng })) {
        throw new Error('COORDINATES_OUT_OF_BOUNDS');
      }

      // Auto-detect city if not matching coordinates
      const detectedCity = findNearestCity({ lat, lng });
      if (data.location.city !== detectedCity) {
        typedLogger.warn('City mismatch detected', {
          provided: data.location.city,
          detected: detectedCity,
          coordinates: [lng, lat]});
      }

      const prize = new Prize({
        ...data,
        createdBy: new Types.ObjectId(adminId),
        visibility: {
          startAt: data.visibility?.startAt ? new Date(data.visibility.startAt) : new Date(),
          endAt: data.visibility?.endAt ? new Date(data.visibility.endAt) : undefined},
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined});

      await prize.save();

      typedLogger.info('Prize created', {
        prizeId: prize._id,
        adminId,
        name: prize.name,
        location: prize.location});

      return prize.toJSON();

    } catch (error) {
      typedLogger.error('Create prize error', {
        error: (error as any).message,
        adminId,
        prizeName: data.name});
      throw error;
    }
  }

  /**
   * Update a prize (admin only)
   */
  static async updatePrize(
    adminId: string,
    prizeId: string,
    data: z.infer<typeof updatePrizeSchema>
  ) {
    try {
      const prize = await Prize.findById(prizeId);

      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      // Validate coordinates if provided
      if (data.location?.coordinates) {
        const [lng, lat] = data.location.coordinates;
        if (!isWithinTunisia({ lat, lng })) {
          throw new Error('COORDINATES_OUT_OF_BOUNDS');
        }
      }

      // Update fields
      Object.keys(data).forEach(key => {
        if (data[key] !== undefined) {
          if (key === 'visibility' && data.visibility) {
            prize.visibility = {
              startAt: data.visibility.startAt ? new Date(data.visibility.startAt) : prize.visibility.startAt,
              endAt: data.visibility.endAt ? new Date(data.visibility.endAt) : prize.visibility.endAt};
          } else if (key === 'expiresAt' && data.expiresAt) {
            prize.expiresAt = new Date(data.expiresAt);
          } else {
            prize[key] = data[key];
          }
        }
      });

      await prize.save();

      typedLogger.info('Prize updated', {
        prizeId: prize._id,
        adminId,
        updates: Object.keys(data)});

      return prize.toJSON();

    } catch (error) {
      typedLogger.error('Update prize error', {
        error: (error as any).message,
        adminId,
        prizeId});
      throw error;
    }
  }

  /**
   * Delete a prize (admin only) - Hard delete
   */
  static async deletePrize(adminId: string, prizeId: string) {
    try {
      const prize = await Prize.findById(prizeId);

      if (!prize) {
        throw new Error('PRIZE_NOT_FOUND');
      }

      const prizeName = prize.name;
      
      // Hard delete - actually remove from database
      await Prize.findByIdAndDelete(prizeId);

      typedLogger.info('Prize deleted', {
        prizeId,
        adminId,
        name: prizeName
      });

      return { success: true };

    } catch (error) {
      typedLogger.error('Delete prize error', {
        error: (error as any).message,
        adminId,
        prizeId});
      throw error;
    }
  }

  /**
   * Bulk create prizes (admin only)
   */
  static async bulkCreatePrizes(
    adminId: string,
    data: z.infer<typeof bulkCreatePrizesSchema>
  ) {
    try {
      const results = [];
      const errors = [];

      for (let i = 0; i < data.prizes.length; i++) {
        try {
          const prize = await this.createPrize(adminId, data.prizes[i]);
          results.push({ index: i, success: true, prize });
        } catch (error) {
          errors.push({ index: i, error: (error as any).message });
        }
      }

      typedLogger.info('Bulk prizes created', {
        adminId,
        total: data.prizes.length,
        successful: results.length,
        failed: errors.length});

      return {
        successful: results,
        failed: errors,
        summary: {
          total: data.prizes.length,
          successful: results.length,
          failed: errors.length}};

    } catch (error) {
      typedLogger.error('Bulk create prizes error', {
        error: (error as any).message,
        adminId,
        count: data.prizes.length});
      throw error;
    }
  }

  /**
   * Get prize statistics
   */
  static async getPrizeStats(city?: string) {
    try {
      const stats = await Prize.getStatsByCity();

      if (city) {
        return stats.find(stat => stat._id === city) || {
          _id: city,
          totalPrizes: 0,
          activePrizes: 0,
          claimedPrizes: 0,
          totalPoints: 0,
          averagePoints: 0,
          rarityDistribution: []};
      }

      return stats;

    } catch (error) {
      typedLogger.error('Get prize stats error', {
        error: (error as any).message,
        city});
      throw error;
    }
  }

  /**
   * Get heatmap data for prizes
   */
  static async getHeatmapData(city?: string) {
    try {
      return await Prize.getHeatmapData(city);
    } catch (error) {
      typedLogger.error('Get heatmap data error', {
        error: (error as any).message,
        city});
      throw error;
    }
  }
}

/**
 * Prize routes
 */
export default async function prizeRoutes(fastify: FastifyInstance) {
  // Get nearby prizes
  fastify.get('/nearby', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await PrizeService.getNearbyPrizes(
        request.user!.sub,
        request.query
      );

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const message = (error as any).message;
      const statusCode = message === 'LOCATION_OUT_OF_BOUNDS'
        ? 400
        : message === 'ANTI_CHEAT_VIOLATION'
          ? 403
          : 500;
      reply.code(statusCode).send({
        success: false,
        error: message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get prizes by city
  fastify.get<{ Params: { city: string }, Querystring: z.infer<typeof cityPrizesSchema> }>('/city/:city', {
    preHandler: [authenticate],
    schema: {
      params: {
        type: 'object',
        required: ['city'],
        properties: {
          city: { type: 'string', enum: Object.keys(TUNISIA_CITIES) }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: Object.values(PrizeCategory) },
          rarity: { type: 'string', enum: Object.values(PrizeRarity) },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          page: { type: 'number', minimum: 1, default: 1 }
        }
      },
    }
  }, async (request, reply) => {
    try {
      const result = await PrizeService.getCityPrizes({
        ...request.query,
        city: request.params.city});

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

  // Get prize details
  fastify.get<{ Params: { prizeId: string }, Querystring: { lat?: number, lng?: number } }>('/:prizeId', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userLocation = request.query.lat && request.query.lng ? {
        lat: request.query.lat,
        lng: request.query.lng} : undefined;

      const result = await PrizeService.getPrizeDetails(
        request.user!.sub,
        request.params.prizeId,
        userLocation
      );

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      const message = (error as any).message;
      const statusCode = message === 'PRIZE_NOT_FOUND'
        ? 404
        : message === 'ANTI_CHEAT_VIOLATION'
          ? 403
          : 500;
      reply.code(statusCode).send({
        success: false,
        error: message,
        timestamp: new Date().toISOString()});
    }
  });

  // Search prizes
  fastify.get('/search', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await PrizeService.searchPrizes(request.query);

      reply.send({
        success: true,
        data: result,
        timestamp: new Date().toISOString()});
    } catch (error) {
      reply.code(500).send({
        success: false,
        error: (error as any).message,
        timestamp: new Date().toISOString()});
    }
  });

}
