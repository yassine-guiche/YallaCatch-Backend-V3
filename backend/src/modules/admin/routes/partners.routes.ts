import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminPartnersService, PartnerData } from '../services/admin-partners.service';
import { Partner, IPartnerModel, IPartnerLocation } from '@/models/Partner';
import { IPartnerDocument } from '@/types';
import { Types } from 'mongoose';
import { z } from 'zod';

const NearbyPartnersSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90, { message: 'Latitude must be between -90 and 90' }),
  longitude: z.coerce.number().min(-180).max(180, { message: 'Longitude must be between -180 and 180' }),
  radius: z.coerce.number().min(100).max(50000).default(5000), // 100m to 50km, default 5km
});

const PartnerListSchema = z.object({
  page: z.coerce.number().int().positive({ message: 'Page must be a positive integer' }).default(1),
  limit: z.coerce.number().int().min(1, { message: 'Limit must be at least 1' }).max(100, { message: 'Limit cannot exceed 100' }).default(20),
  search: z.string().optional(),
  status: z.enum(['active', 'inactive', 'pending', 'all'], {
    errorMap: () => ({ message: 'Status must be one of: active, inactive, pending, all' })
  }).default('all'),
  category: z.string().optional(),
});

const CreatePartnerSchema = z.object({
  name: z.string()
    .min(1, { message: 'Partner name is required' })
    .max(100, { message: 'Partner name cannot exceed 100 characters' }),
  description: z.string().max(500, { message: 'Description cannot exceed 500 characters' }).optional(),
  logoUrl: z.string().optional().or(z.literal('')).refine(
    (val) => !val || val.startsWith('/uploads/') || /^https?:\/\/.+/.test(val),
    { message: 'Logo must be a valid URL or uploaded file path' }
  ),
  website: z.string().url({ message: 'Website must be a valid URL (e.g., https://example.com)' }).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  category: z.string()
    .min(1, { message: 'Category is required' })
    .max(50, { message: 'Category cannot exceed 50 characters' }),
  contactEmail: z.string().email({ message: 'Contact email must be a valid email address' }),
  contactPhone: z.string().optional(),
  features: z.array(z.string()).optional(),
  contactPerson: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'pending'], {
    errorMap: () => ({ message: 'Status must be one of: active, inactive, pending' })
  }).default('pending'),
});

const UpdatePartnerSchema = z.object({
  name: z.string()
    .min(1, { message: 'Partner name cannot be empty' })
    .max(100, { message: 'Partner name cannot exceed 100 characters' }).optional(),
  description: z.string().max(500, { message: 'Description cannot exceed 500 characters' }).optional(),
  logoUrl: z.string().optional().or(z.literal('')).refine(
    (val) => !val || val.startsWith('/uploads/') || /^https?:\/\/.+/.test(val),
    { message: 'Logo must be a valid URL or uploaded file path' }
  ).transform(v => v === '' ? undefined : v),
  website: z.string().url({ message: 'Website must be a valid URL (e.g., https://example.com)' }).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  category: z.string()
    .min(1, { message: 'Category cannot be empty' })
    .max(50, { message: 'Category cannot exceed 50 characters' }).optional(),
  contactEmail: z.string().email({ message: 'Contact email must be a valid email address' }).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
  contactPhone: z.string().optional(),
  features: z.array(z.string()).optional(),
  contactPerson: z.object({
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    position: z.string().optional(),
  }).optional(),
  isActive: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'pending'], {
    errorMap: () => ({ message: 'Status must be one of: active, inactive, pending' })
  }).optional(),
});

const PartnerLocationSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().min(1).max(200),
  city: z.string().min(1).max(50),
  coordinates: z.tuple([z.number(), z.number()]),
  isActive: z.boolean().default(true),
  type: z.string().default('branch')
});

const ResetCredentialsSchema = z.object({
  newPassword: z.string().min(8, { message: 'Password must be at least 8 characters' }).optional(),
});

export default async function partnersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  fastify.get<{ Querystring: z.infer<typeof PartnerListSchema> }>('/partners', async (request, reply) => {
    const query = PartnerListSchema.parse(request.query);
    const result = await AdminPartnersService.getPartners({
      page: query.page,
      limit: query.limit,
      isActive: query.status === 'all' ? undefined : query.status === 'active',
      category: query.category,
      search: query.search,
    });
    return reply.send(result);
  });

  fastify.get<{ Params: { id: string } }>('/partners/:id', async (request, reply) => {
    const { id } = request.params;
    const partner = await AdminPartnersService.getPartner(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.send(partner);
  });

  // Get partner portal credentials (email only) for admins
  fastify.get<{ Params: { id: string } }>('/partners/:id/credentials', async (request, reply) => {
    try {
      const { id } = request.params;
      const credentials = await AdminPartnersService.getPartnerCredentials(id);
      return reply.send({ success: true, credentials });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message === 'Partner not found' ? 404 : 500;
      return reply.status(status).send({ error: message || 'FAILED_TO_GET_CREDENTIALS' });
    }
  });

  // Reset partner portal password (returns new password for delivery)
  fastify.post('/partners/:id/reset-credentials', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { id } = request.params;
      const { newPassword } = ResetCredentialsSchema.parse(request.body || {});
      const adminId = request.user?.sub;
      const credentials = await AdminPartnersService.resetPartnerCredentials(adminId, id, { newPassword });
      return reply.send({ success: true, credentials });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message === 'Partner not found' ? 404 : 400;
      return reply.status(status).send({ error: message || 'RESET_CREDENTIALS_FAILED' });
    }
  });

  fastify.post('/partners', async (request: FastifyRequest, reply) => {
    const partnerData = CreatePartnerSchema.parse(request.body);
    const adminId = request.user?.sub;
    if (!adminId) return reply.status(401).send({ error: 'Unauthorized' });
    const { partner, credentials } = await AdminPartnersService.createPartner(adminId, {
      ...partnerData,
      categories: [partnerData.category],
    } as PartnerData);
    return reply.status(201).send({
      partner,
      credentials,
    });
  });

  // Support both PUT and PATCH for partner updates
  const updatePartnerHandler = async (request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdatePartnerSchema> }>, reply: FastifyReply) => {
    const { id } = request.params;
    const updates = UpdatePartnerSchema.parse(request.body) as Record<string, unknown>; // Parsed Zod object is safe to cast for service usage
    const adminId = request.user?.sub;
    const partner = await AdminPartnersService.updatePartner(adminId, id, {
      ...updates,
      categories: updates.category ? [updates.category as string] : undefined,
    } as Partial<PartnerData>);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.send(partner);
  };

  fastify.put('/partners/:id', updatePartnerHandler);
  fastify.patch('/partners/:id', updatePartnerHandler);

  fastify.delete('/partners/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const adminId = request.user?.sub;
    const result = await AdminPartnersService.deletePartner(adminId, id);
    if (!result) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.status(204).send();
  });

  // GET /admin/partners/nearby - Find partners near a location (for map view)
  fastify.get<{ Querystring: z.infer<typeof NearbyPartnersSchema> }>('/partners/nearby', async (request, reply) => {
    try {
      const query = NearbyPartnersSchema.parse(request.query);
      const { latitude, longitude, radius } = query;

      // Use the Partner model's static method for geospatial query
      const partners = await (Partner as IPartnerModel).findNearbyPartners(longitude, latitude, radius)
        .select('name description logo categories locations isActive metrics')
        .limit(50);

      // Format response with distance calculations
      const partnersWithDistance = partners.map((partner) => {
        // Find the nearest location for this partner
        const nearestLocation = partner.locations
          .filter((loc) => loc.isActive)
          .map((loc) => {
            const locObj = loc as any;
            const data = (typeof locObj.toObject === 'function' ? locObj.toObject() : locObj);
            return {
              ...data,
              distance: calculateDistance(latitude, longitude, loc.coordinates[1], loc.coordinates[0])
            };
          })
          .sort((a, b) => a.distance - b.distance)[0];

        return {
          _id: partner._id,
          name: partner.name,
          description: partner.description,
          logo: partner.logo,
          categories: partner.categories,
          isActive: partner.isActive,
          metrics: partner.metrics,
          nearestLocation: nearestLocation || null,
          allLocations: partner.locations.filter((loc: IPartnerLocation) => loc.isActive)
        };
      });

      return reply.send({
        success: true,
        data: partnersWithDistance,
        meta: {
          center: { latitude, longitude },
          radius,
          count: partnersWithDistance.length
        }
      });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch nearby partners', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // GET /admin/partners/:id/locations - Get all locations for a partner
  fastify.get('/partners/:id/locations', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const partner = await AdminPartnersService.getPartner(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.send({
      success: true,
      data: partner.locations,
      meta: {
        partnerId: id,
        partnerName: partner.name,
        totalLocations: partner.locations.length,
        activeLocations: partner.locations.filter((loc: IPartnerLocation) => loc.isActive).length
      }
    });
  });

  // POST /admin/partners/:id/locations - Add a location to a partner
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof PartnerLocationSchema> }>('/partners/:id/locations', async (request, reply) => {
    const { id } = request.params;
    const locationData = PartnerLocationSchema.parse(request.body);

    const partner = await Partner.findById(id) as IPartnerDocument;
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }

    await partner.addLocation(locationData);
    return reply.status(201).send({
      success: true,
      message: 'Location added successfully',
      data: partner.locations[partner.locations.length - 1]
    });
  });

  // PUT /admin/partners/:id/locations/:locationId - Update a partner location
  fastify.put<{ Params: { id: string; locationId: string }; Body: Partial<z.infer<typeof PartnerLocationSchema>> }>('/partners/:id/locations/:locationId', async (request, reply) => {
    const { id, locationId } = request.params;
    const updateData = request.body; // Partial update logic handled by Mongoose or validation? Ideally validate partial.
    // For now, accepting body as partial location.

    const partner = await Partner.findById(id) as IPartnerDocument;
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }

    try {
      await partner.updateLocation(locationId, updateData);
      const locations = partner.locations as unknown as Types.DocumentArray<IPartnerLocation & Types.Subdocument>;
      const updatedLocation = locations.id(locationId);
      return reply.send({
        success: true,
        message: 'Location updated successfully',
        data: updatedLocation
      });
    } catch (error) {
      return reply.status(404).send({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // DELETE /admin/partners/:id/locations/:locationId - Remove a partner location
  fastify.delete('/partners/:id/locations/:locationId', async (request: FastifyRequest<{ Params: { id: string; locationId: string } }>, reply) => {
    const { id, locationId } = request.params;

    const partner = await Partner.findById(id) as IPartnerDocument;
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }

    await partner.removeLocation(locationId);
    return reply.status(204).send();
  });

  // Approve a partner registration
  fastify.post<{ Params: { id: string } }>('/partners/:id/approve', async (request, reply) => {
    const { id } = request.params;
    const adminId = (request.user as any)?.id || 'system';
    const result = await AdminPartnersService.approvePartner(adminId, id);
    return reply.send({
      success: true,
      data: result.partner,
      credentials: result.credentials,
      message: 'Partner approved and portal account created'
    });
  });
}

// Helper function to calculate distance between two coordinates (in meters)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}
