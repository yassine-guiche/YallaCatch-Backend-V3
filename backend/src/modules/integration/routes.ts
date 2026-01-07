import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { Partner } from '@/models/Partner';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { typedLogger } from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { normalizeError } from '@/utils/api-errors';

/**
 * Integration-specific endpoints for React Admin Panel and Unity Game
 * These endpoints are optimized for frontend integration with proper data formatting
 */

// Schemas for integration endpoints
const ReactTableQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  filters: z.string().optional(), // JSON string of filters
});

const UnityMapBoundsSchema = z.object({
  centerLat: z.coerce.number().min(-90).max(90),
  centerLng: z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().min(0.1).max(50).default(5),
  maxPrizes: z.coerce.number().min(1).max(500).default(100)});

const ReactDashboardFiltersSchema = z.object({
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime()}).optional(),
  city: z.string().optional(),
  governorate: z.string().optional(),
  category: z.string().optional()});

export class IntegrationService {
  private static redis = redisClient;

  /**
   * Get React-optimized user data with pagination and filtering
   */
  static async getReactUsersTable(query: any) {
    try {
      const { page, limit, sortBy = 'createdAt', sortOrder, search, filters } = query;
      const skip = (page - 1) * limit;

      // Build query
      let mongoQuery: any = {};
      
      if (search) {
        mongoQuery.$or = [
          { displayName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }];
      }

      if (filters) {
        const parsedFilters = JSON.parse(filters);
        if (parsedFilters.status) {
          if (parsedFilters.status === 'active') mongoQuery.isActive = true;
          if (parsedFilters.status === 'banned') mongoQuery.isBanned = true;
          if (parsedFilters.status === 'inactive') mongoQuery.isActive = false;
        }
        if (parsedFilters.role) mongoQuery.role = parsedFilters.role;
        if (parsedFilters.city) mongoQuery['location.city'] = parsedFilters.city;
      }

      // Build sort
      const sortObj: any = {};
      sortObj[sortBy] = sortOrder === 'asc' ? 1 : -1;

      const [users, total] = await Promise.all([
        User.find(mongoQuery)
          .select('email displayName role level points isBanned lastActive createdAt location stats')
          .sort(sortObj)
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(mongoQuery)]);

      // Bulk fetch claim stats for all users to avoid N+1 queries
      const userIds = users.map(user => user._id);
      const claimStats = await Claim.aggregate([
        {
          $match: {
            userId: { $in: userIds }
          }
        },
        {
          $group: {
            _id: '$userId',
            totalClaims: { $sum: 1 },
            totalDistance: { $sum: '$distance' },
            totalPointsFromClaims: { $sum: '$pointsAwarded' }
          }
        }
      ]);

      // Create a map for quick lookup of claim stats
      const claimStatsMap = new Map();
      claimStats.forEach(stat => {
        claimStatsMap.set(stat._id.toString(), stat);
      });

      // Format for React Table
      const formattedUsers = users.map(user => {
        const userClaimStats = claimStatsMap.get(user._id.toString()) || { totalClaims: 0, totalDistance: 0 };

        return {
          id: user._id,
          email: user.email,
          displayName: user.displayName,
          fullName: user.displayName,
          role: user.role,
          level: user.level,
          points: user.points,
          status: user.isBanned ? 'banned' :
            (user.lastActive && new Date().getTime() - new Date(user.lastActive).getTime() < 7 * 24 * 60 * 60 * 1000 ? 'active' : 'inactive'),
          isEmailVerified: !!user.email,  // Assuming email presence indicates verification
          city: user.location?.city,
          governorate: null,  // Governorate field does not exist in the schema
          totalClaims: userClaimStats.totalClaims,
          totalDistance: Math.round(userClaimStats.totalDistance / 1000 * 100) / 100, // km
          lastActive: user.lastActive,
          createdAt: user.createdAt,
          avatar: user.avatar};
      });

      return {
        data: formattedUsers,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)},
        meta: {
          sortBy,
          sortOrder,
          search,
          filters: filters ? JSON.parse(filters) : null}};
    } catch (error) {
      typedLogger.error('Get React users table error', { error: (error as any).message, query });
      throw error;
    }
  }

  /**
   * Get Unity-optimized map data with performance optimizations
   */
  static async getUnityMapData(query: any, userId: string) {
    try {
      const { centerLat, centerLng, radiusKm, maxPrizes } = query;
      
      // Calculate bounding box for efficient querying
      const radiusInDegrees = radiusKm / 111.32; // Approximate conversion
      const bounds = {
        north: centerLat + radiusInDegrees,
        south: centerLat - radiusInDegrees,
        east: centerLng + (radiusInDegrees / Math.cos(centerLat * Math.PI / 180)),
        west: centerLng - (radiusInDegrees / Math.cos(centerLat * Math.PI / 180))};

      // Get active prizes within bounds
      const prizes = await Prize.find({
        status: 'active',
        'location.coordinates': {
          $geoWithin: {
            $box: [[bounds.west, bounds.south], [bounds.east, bounds.north]]
          }
        }
      })
      .select('name category points rarity location expiresAt partnerId')
      .limit(maxPrizes)
      .lean();

      // Get user's claimed prizes to exclude
      const userClaims = await Claim.find({ userId }).select('prizeId').lean();
      const claimedPrizeIds = new Set(userClaims.map(claim => claim.prizeId.toString()));

      // Filter and format for Unity
      const unityPrizes = prizes
        .filter(prize => !claimedPrizeIds.has(prize._id.toString()))
        .map(prize => ({
          id: prize._id.toString(),
          title: prize.name,
          category: prize.category,
          points: prize.points,
          rarity: prize.rarity,
          position: {
            lat: (prize as any).location.coordinates[1],
            lng: (prize as any).location.coordinates[0]},
          expiresAt: prize.expiresAt?.toISOString(),
          // Unity-specific optimizations
          distanceFromCenter: this.calculateDistance(
            centerLat, centerLng,
            prize.location.coordinates[1], prize.location.coordinates[0]
          )}))
        .sort((a, b) => a.distanceFromCenter - b.distanceFromCenter); // Closest first

      // Get nearby partners for context
      const nearbyPartners = await Partner.find({
        'locations.coordinates': {
          $geoWithin: {
            $centerSphere: [[centerLng, centerLat], radiusKm / 6378.1] // Earth radius in km
          }
        },
        isActive: true})
      .select('name logo locations')
      .limit(20)
      .lean();

      const unityPartners = nearbyPartners.map(partner => ({
        id: partner._id.toString(),
        name: partner.name,
        logo: partner.logo,
        locations: partner.locations
          .filter(loc => loc.isActive)
          .map(loc => ({
            id: loc._id.toString(),
            name: loc.name,
            position: {
              lat: loc.coordinates[1],
              lng: loc.coordinates[0]}}))}));

      const markers = [
        ...unityPrizes.map((p) => ({
          id: p.id,
          type: 'prize' as const,
          title: p.title,
          position: p.position,
          category: p.category,
          rarity: p.rarity,
          points: p.points,
        })),
        ...unityPartners.flatMap((partner) =>
          partner.locations.map((loc) => ({
            id: loc.id,
            type: 'partner' as const,
            title: partner.name,
            position: loc.position,
            category: partner.id,
            logo: partner.logo,
          }))
        ),
      ];

      return {
        prizes: unityPrizes,
        partners: unityPartners,
        markers,
        bounds,
        center: { lat: centerLat, lng: centerLng },
        radiusKm,
        timestamp: new Date().toISOString(),
        performance: {
          totalPrizesInArea: prizes.length,
          availablePrizes: unityPrizes.length,
          claimedByUser: claimedPrizeIds.size}};
    } catch (error) {
      typedLogger.error('Get Unity map data error', { error: (error as any).message, query, userId });
      throw error;
    }
  }

  /**
   * Get React dashboard analytics with real-time data
   */
  static async getReactDashboardAnalytics(filters: any = {}) {
    try {
      const now = new Date();
      const { dateRange, city, governorate, category } = filters;
      
      // Default to last 7 days if no date range provided
      const startDate = dateRange?.start ? new Date(dateRange.start) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endDate = dateRange?.end ? new Date(dateRange.end) : now;

      // Build filter query
      let filterQuery: any = {
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (city) filterQuery.city = city;
      if (governorate) filterQuery.governorate = governorate;
      if (category) filterQuery.category = category;

      // Parallel queries for dashboard data
      const [
        userStats,
        claimStats,
        prizeStats,
        revenueStats,
        geographicData,
        categoryData,
        timeSeriesData
      ] = await Promise.all([
        this.getUserAnalytics(filterQuery),
        this.getClaimAnalytics(filterQuery),
        this.getPrizeAnalytics(filterQuery),
        this.getRevenueAnalytics(filterQuery),
        this.getGeographicAnalytics(filterQuery),
        this.getCategoryAnalytics(filterQuery),
        this.getTimeSeriesAnalytics(startDate, endDate, filterQuery)]);

      return {
        summary: {
          users: userStats,
          claims: claimStats,
          prizes: prizeStats,
          revenue: revenueStats},
        charts: {
          geographic: geographicData,
          categories: categoryData,
          timeSeries: timeSeriesData},
        filters: {
          dateRange: { start: startDate, end: endDate },
          city,
          governorate,
          category},
        lastUpdated: now.toISOString()};
    } catch (error) {
      typedLogger.error('Get React dashboard analytics error', { error: (error as any).message, filters });
      throw error;
    }
  }

  /**
   * Get Unity-optimized leaderboard with social features
   */
  static async getUnityLeaderboard(userId: string, type: string = 'points', limit: number = 50) {
    try {
      let sortField = 'points';
      let displayField = 'points';
      
      switch (type) {
        case 'claims':
          sortField = 'stats.totalClaims';
          displayField = 'totalClaims';
          break;
        case 'distance':
          sortField = 'stats.totalDistance';
          displayField = 'totalDistance';
          break;
        case 'level':
          sortField = 'level';
          displayField = 'level';
          break;
      }

      // Get top players
      const topPlayers = await User.find({ 
        isBanned: false,
        isActive: true 
      })
        .select('displayName level points stats.totalClaims stats.totalDistance avatar location.city')
        .sort({ [sortField]: -1 })
        .limit(limit)
        .lean();

      // Get current user's rank
      const currentUser = await User.findById(userId).select(sortField).lean();
      if (!currentUser) {
        throw new Error('USER_NOT_FOUND');
      }

      // Get current user's value for comparison
      const userValue = this.getSortFieldValue(currentUser, sortField);

      const userRank = await User.countDocuments({
        isBanned: false,
        isActive: true,
        [sortField]: { $gt: userValue }
      }) + 1;

      // Get user's friends/nearby players (if implemented)
      const nearbyUser = await User.findById(userId).select('location.city level points stats').lean();
      const nearbyPlayers = await User.find({
        isBanned: false,
        isActive: true,
        'location.city': (nearbyUser as any)?.location?.city,
        _id: { $ne: userId }
      })
        .select('displayName level points stats.totalClaims stats.totalDistance avatar')
        .sort({ [sortField]: -1 })
        .limit(10)
        .lean();

      // Format for Unity
      const leaderboard = topPlayers.map((player, index) => ({
        rank: index + 1,
        userId: player._id.toString(),
        displayName: player.displayName,
        level: player.level,
        points: player.points,
        totalClaims: (player as any).stats?.totalClaims || 0,
        totalDistance: Math.round(((player as any).stats?.totalDistance || 0) / 1000 * 100) / 100, // km
        avatar: (player as any).avatar,
        city: (player as any).location?.city,
        isCurrentUser: player._id.toString() === userId,
        value: this.getDisplayValue(player, type)}));

      const nearbyLeaderboard = nearbyPlayers.map((player, index) => ({
        rank: index + 1,
        userId: player._id.toString(),
        displayName: player.displayName,
        level: player.level,
        points: player.points,
        totalClaims: (player as any).stats?.totalClaims || 0,
        totalDistance: Math.round(((player as any).stats?.totalDistance || 0) / 1000 * 100) / 100,
        avatar: (player as any).avatar,
        isCurrentUser: false,
        value: this.getDisplayValue(player, type)}));

      return {
        global: leaderboard,
        nearby: nearbyLeaderboard,
        currentUser: {
          rank: userRank,
          userId,
          ...leaderboard.find(p => p.isCurrentUser) || {}},
        type,
        limit,
        timestamp: new Date().toISOString()};
    } catch (error) {
      typedLogger.error('Get Unity leaderboard error', { error: (error as any).message, userId, type });
      throw error;
    }
  }

  // Helper methods for analytics
  private static async getUserAnalytics(filterQuery: any) {
    const [total, active, newUsers, growth] = await Promise.all([
      User.countDocuments({ isBanned: false }),
      User.countDocuments({ 
        isBanned: false, 
        lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      User.countDocuments(filterQuery),
      User.countDocuments({
        ...filterQuery,
        createdAt: { 
          $gte: new Date(filterQuery.createdAt.$gte.getTime() - (filterQuery.createdAt.$lte.getTime() - filterQuery.createdAt.$gte.getTime())),
          $lt: filterQuery.createdAt.$gte
        }
      })]);

    return {
      total,
      active,
      new: newUsers,
      growth: growth > 0 ? ((newUsers - growth) / growth * 100) : 0};
  }

  private static async getClaimAnalytics(filterQuery: any) {
    const claimQuery = { claimedAt: filterQuery.createdAt };
    if (filterQuery.city) claimQuery['city'] = filterQuery.city;
    if (filterQuery.category) claimQuery['category'] = filterQuery.category;

    const [totalClaims, totalPoints, avgPoints] = await Promise.all([
      Claim.countDocuments(claimQuery),
      Claim.aggregate([
        { $match: claimQuery },
        { $group: { _id: null, total: { $sum: '$pointsAwarded' } } }
      ]),
      Claim.aggregate([
        { $match: claimQuery },
        { $group: { _id: null, avg: { $avg: '$pointsAwarded' } } }
      ])]);

    return {
      total: totalClaims,
      points: totalPoints[0]?.total || 0,
      average: Math.round(avgPoints[0]?.avg || 0)};
  }

  private static async getPrizeAnalytics(filterQuery: any) {
    const prizeQuery: any = { createdAt: filterQuery.createdAt };
    if (filterQuery.city) prizeQuery.city = filterQuery.city;
    if (filterQuery.category) prizeQuery.category = filterQuery.category;

    const [total, active, claimed] = await Promise.all([
      Prize.countDocuments(prizeQuery),
      Prize.countDocuments({ ...prizeQuery, status: 'active' }),
      Prize.countDocuments({ ...prizeQuery, currentClaims: { $gt: 0 } })]);

    return {
      total,
      active,
      claimed,
      claimRate: total > 0 ? (claimed / total * 100) : 0};
  }

  private static async getRevenueAnalytics(filterQuery: any) {
    // Placeholder for revenue analytics
    return {
      totalRedemptions: 0,
      partnerPayouts: 0,
      conversionRate: 0};
  }

  private static async getGeographicAnalytics(filterQuery: any) {
    const geographic = await Claim.aggregate([
      { $match: { claimedAt: filterQuery.createdAt } },
      { 
        $group: {
          _id: { city: '$city', governorate: '$governorate' },
          claims: { $sum: 1 },
          points: { $sum: '$pointsAwarded' }}
      },
      { $sort: { claims: -1 } },
      { $limit: 20 }]);

    return geographic.map(item => ({
      city: (item as any)._id.city,
      governorate: (item as any)._id.governorate,
      claims: (item as any).claims,
      points: (item as any).points}));
  }

  private static async getCategoryAnalytics(filterQuery: any) {
    const categories = await Claim.aggregate([
      { $match: { claimedAt: filterQuery.createdAt } },
      { 
        $group: {
          _id: '$category',
          claims: { $sum: 1 },
          points: { $sum: '$pointsAwarded' }}
      },
      { $sort: { claims: -1 } }]);

    const total = categories.reduce((sum, cat) => sum + (cat as any).claims, 0);

    return categories.map(item => ({
      category: (item as any)._id,
      claims: (item as any).claims,
      points: (item as any).points,
      percentage: total > 0 ? ((item as any).claims / total * 100) : 0}));
  }

  private static async getTimeSeriesAnalytics(startDate: Date, endDate: Date, filterQuery: any) {
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const timeSeries = [];

    for (let i = 0; i < days; i++) {
      const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
      const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

      const [claims, users, sessions] = await Promise.all([
        Claim.countDocuments({
          claimedAt: { $gte: date, $lt: nextDate }}),
        User.countDocuments({
          createdAt: { $gte: date, $lt: nextDate }}),
        // Sessions would need to be implemented
        0]);

      timeSeries.push({
        date: date.toISOString().split('T')[0],
        claims,
        users,
        sessions});
    }

    return timeSeries;
  }

  private static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private static getDisplayValue(player: any, type: string): number {
    switch (type) {
      case 'claims':
        return player.stats?.totalClaims || 0;
      case 'distance':
        return Math.round((player.stats?.totalDistance || 0) / 1000 * 100) / 100;
      case 'level':
        return player.level;
      default:
        return player.points;
    }
  }

  private static getSortFieldValue(user: any, sortField: string): number {
    if (sortField === 'level') {
      return user.level;
    } else if (sortField === 'points') {
      return user.points;
    } else if (sortField === 'stats.totalClaims') {
      return user.stats?.totalClaims || 0;
    } else if (sortField === 'stats.totalDistance') {
      return user.stats?.totalDistance || 0;
    } else {
      // Default to points if unknown field
      return user.points;
    }
  }
}

export default async function integrationRoutes(fastify: FastifyInstance) {
  // React Admin Panel Endpoints
  
  // Get React-optimized users table
  fastify.get('/react/users', {
    preHandler: [authenticate],
    schema: {
      querystring: ReactTableQuerySchema
    }
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof ReactTableQuerySchema> }>, reply) => {
    try {
      const result = await IntegrationService.getReactUsersTable(request.query);
      reply.send({ success: true, ...result });
    } catch (error) {
      const normalized = normalizeError(error, 'React users fetch failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Get React dashboard analytics
  fastify.get('/react/dashboard/analytics', {
    preHandler: [authenticate],
    schema: {
      querystring: ReactDashboardFiltersSchema
    }
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof ReactDashboardFiltersSchema> }>, reply) => {
    try {
      const result = await IntegrationService.getReactDashboardAnalytics(request.query);
      reply.send({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error, 'React dashboard analytics failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Unity Game Endpoints

  // Get Unity-optimized map data
  fastify.get('/unity/map', {
    preHandler: [authenticate],
    schema: {
      querystring: UnityMapBoundsSchema
    }
  }, async (request: FastifyRequest<{ Querystring: z.infer<typeof UnityMapBoundsSchema> }>, reply) => {
    try {
      const result = await IntegrationService.getUnityMapData(request.query, request.user.sub);
      reply.send({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error, 'Unity map fetch failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Get Unity leaderboard with social features
  fastify.get('/unity/leaderboard', {
    preHandler: [authenticate],
    schema: {
      querystring: z.object({
        type: z.enum(['points', 'claims', 'distance', 'level']).default('points'),
        limit: z.coerce.number().min(1).max(100).default(50)
      })
    }
  }, async (request: FastifyRequest<{ Querystring: { type?: 'points' | 'claims' | 'distance' | 'level'; limit?: string } }>, reply: FastifyReply) => {
    try {
      const result = await IntegrationService.getUnityLeaderboard(
        request.user.sub,
        request.query.type || 'points',
        request.query.limit ? parseInt(request.query.limit, 10) : 50
      );
      reply.send({ success: true, data: result });
    } catch (error) {
      const normalized = normalizeError(error, 'Unity leaderboard failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Health check for integrations
  fastify.get('/health', async (request: FastifyRequest, reply) => {
    reply.send({
      status: 'healthy',
      integration: {
        react: 'ready',
        unity: 'ready'},
      timestamp: new Date().toISOString()});
  });

  // Marketplace integration endpoints for React Admin Panel
  // Get marketplace categories
  fastify.get('/marketplace/categories', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      // Get unique categories from rewards
      const categories = await Reward.distinct('category');

      const formattedCategories = categories.map((cat, index) => ({
        id: index + 1,
        name: cat,
        slug: cat.toLowerCase().replace(/\s+/g, '-'),
        count: 0 // Will be populated on request
      }));

      reply.send({ success: true, categories: formattedCategories });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get marketplace items for admin panel
  fastify.get('/admin/marketplace/items', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const { page = '1', limit = '20', category, search } = request.query as {
        page?: string;
        limit?: string;
        category?: string;
        search?: string;
      };

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const skip = (pageNum - 1) * limitNum;

      let query: any = { isActive: true };
      if (category) query.category = category;
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }

      const [items, total] = await Promise.all([
        Reward.find(query)
          .populate('partnerId', 'name logo')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Reward.countDocuments(query)
      ]);

      const formattedItems = items.map(item => ({
        id: item._id,
        name: item.name,
        description: item.description,
        category: item.category,
        pointsCost: item.pointsCost,
        stockQuantity: item.stockQuantity,
        stockAvailable: item.stockAvailable,
        isActive: item.isActive,
        isPopular: item.isPopular,
        partner: item.partnerId ? {
          id: (item as any).partnerId._id,
          name: (item as any).partnerId.name,
          logo: (item as any).partnerId.logo
        } : null,
        imageUrl: item.imageUrl,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }));

      reply.send({
        success: true,
        data: {
          items: formattedItems,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Get marketplace items for Unity/Client
  fastify.get('/marketplace', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const { page = '1', limit = '20', category, minCost, maxCost } = request.query as {
        page?: string;
        limit?: string;
        category?: string;
        minCost?: string;
        maxCost?: string;
      };

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;
      const skip = (pageNum - 1) * limitNum;

      let query: any = {
        isActive: true,
        stockAvailable: { $gt: 0 }  // Only available items
      };

      if (category) query.category = category;
      if (minCost) query.pointsCost = { ...query.pointsCost, $gte: parseInt(minCost, 10) };
      if (maxCost) query.pointsCost = { ...query.pointsCost, $lte: parseInt(maxCost, 10) };

      const [items, total] = await Promise.all([
        Reward.find(query)
          .populate('partnerId', 'name logo')
          .sort({ isPopular: -1, createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Reward.countDocuments(query)
      ]);

      const formattedItems = items.map(item => ({
        id: item._id,
        title: item.name,
        description: item.description,
        category: item.category,
        pointsCost: item.pointsCost,
        stockAvailable: item.stockAvailable,
        isFeatured: item.isPopular,
        partner: item.partnerId ? {
          id: (item as any).partnerId._id,
          name: (item as any).partnerId.name,
          logo: (item as any).partnerId.logo
        } : null,
        imageUrl: item.imageUrl,
        createdAt: item.createdAt
      }));

      reply.send({
        success: true,
        data: {
          items: formattedItems,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Marketplace fetch failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });

  // Get user's marketplace history
  fastify.get('/marketplace/history', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const userId = request.user.sub;
      const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number; };

      const pageNum = page;
      const limitNum = limit;
      const skip = (pageNum - 1) * limitNum;

      const [history, total] = await Promise.all([
        Redemption.find({ userId, 'metadata.source': 'marketplace' })
          .populate('rewardId', 'name description category pointsCost imageUrl')
          .populate('userId', 'displayName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        Redemption.countDocuments({ userId, 'metadata.source': 'marketplace' })
      ]);

      const formattedHistory = history.map(item => {
        const populatedReward = (item as any).rewardId;
        const populatedUser = (item as any).userId;

        return {
          id: item._id,
          userId: item.userId,
          user: populatedUser ? {
            id: populatedUser._id,
            displayName: populatedUser.displayName,
            email: populatedUser.email
          } : null,
          rewardId: item.rewardId,
          reward: populatedReward ? {
            id: populatedReward._id,
            name: populatedReward.name,
            description: populatedReward.description,
            category: populatedReward.category,
            pointsCost: populatedReward.pointsCost,
            imageUrl: populatedReward.imageUrl
          } : null,
          pointsSpent: item.pointsSpent,
          status: item.status,
          createdAt: item.createdAt,
          redeemedAt: item.redeemedAt
        };
      });

      reply.send({
        success: true,
        data: {
          history: formattedHistory,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      const normalized = normalizeError(error, 'Marketplace history failed');
      reply.code(500).send({ success: false, error: normalized.code, message: normalized.message });
    }
  });
}
