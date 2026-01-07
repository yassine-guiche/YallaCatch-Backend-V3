import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requireAdmin } from '@/middleware/auth';
import { adminRateLimit } from '@/middleware/distributed-rate-limit';
import { AdminPartnersService } from '../services/admin-partners.service';
import { Partner } from '@/models/Partner';
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
  logoUrl: z.string().url({ message: 'Logo URL must be a valid URL (e.g., https://example.com/logo.png)' }).optional().or(z.literal('')),
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
  logoUrl: z.string().url({ message: 'Logo URL must be a valid URL (e.g., https://example.com/logo.png)' }).optional().or(z.literal('')).transform(v => v === '' ? undefined : v),
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

const ResetCredentialsSchema = z.object({
  newPassword: z.string().min(8, { message: 'Password must be at least 8 characters' }).optional(),
});

export default async function partnersRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireAdmin);
  fastify.addHook('preHandler', adminRateLimit);

  fastify.get('/partners', async (request: FastifyRequest, reply) => {
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

  fastify.get('/partners/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const partner = await AdminPartnersService.getPartner(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.send(partner);
  });

  // Get partner portal credentials (email only) for admins
  fastify.get('/partners/:id/credentials', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { id } = request.params;
      const credentials = await AdminPartnersService.getPartnerCredentials(id);
      return reply.send({ success: true, credentials });
    } catch (error: any) {
      const status = error?.message === 'Partner not found' ? 404 : 500;
      return reply.status(status).send({ error: error?.message || 'FAILED_TO_GET_CREDENTIALS' });
    }
  });

  // Reset partner portal password (returns new password for delivery)
  fastify.post('/partners/:id/reset-credentials', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    try {
      const { id } = request.params;
      const { newPassword } = ResetCredentialsSchema.parse(request.body || {});
      const adminId = (request as any).user?.sub || (request as any).userId;
      const credentials = await AdminPartnersService.resetPartnerCredentials(adminId, id, { newPassword });
      return reply.send({ success: true, credentials });
    } catch (error: any) {
      const status = error?.message === 'Partner not found' ? 404 : 400;
      return reply.status(status).send({ error: error?.message || 'RESET_CREDENTIALS_FAILED' });
    }
  });

  fastify.post('/partners', async (request: FastifyRequest, reply) => {
    const partnerData = CreatePartnerSchema.parse(request.body);
    const adminId = (request as any).user?.sub || (request as any).userId;
    const { partner, credentials } = await AdminPartnersService.createPartner(adminId, {
      ...partnerData,
      categories: [partnerData.category],
    } as any);
    return reply.status(201).send({
      partner,
      credentials,
    });
  });

  // Support both PUT and PATCH for partner updates
  const updatePartnerHandler = async (request: FastifyRequest<{ Params: { id: string } }>, reply: any) => {
    const { id } = request.params;
    const updates = UpdatePartnerSchema.parse(request.body);
    const adminId = (request as any).user?.sub || (request as any).userId;
    const partner = await AdminPartnersService.updatePartner(adminId, id, {
      ...updates,
      categories: updates.category ? [updates.category] : undefined,
    } as any);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.send(partner);
  };

  fastify.put('/partners/:id', updatePartnerHandler);
  fastify.patch('/partners/:id', updatePartnerHandler);

  fastify.delete('/partners/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const adminId = (request as any).user?.sub || (request as any).userId;
    const result = await AdminPartnersService.deletePartner(adminId, id);
    if (!result) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    return reply.status(204).send();
  });

  // GET /admin/partners/nearby - Find partners near a location (for map view)
  fastify.get('/partners/nearby', async (request: FastifyRequest, reply) => {
    try {
      const query = NearbyPartnersSchema.parse(request.query);
      const { latitude, longitude, radius } = query;
      
      // Use the Partner model's static method for geospatial query
      const partners = await (Partner as any).findNearbyPartners(longitude, latitude, radius)
        .select('name description logo categories locations isActive metrics')
        .limit(50);
      
      // Format response with distance calculations
      const partnersWithDistance = partners.map((partner: any) => {
        // Find the nearest location for this partner
        const nearestLocation = partner.locations
          .filter((loc: any) => loc.isActive)
          .map((loc: any) => ({
            ...loc.toObject(),
            distance: calculateDistance(latitude, longitude, loc.coordinates[1], loc.coordinates[0])
          }))
          .sort((a: any, b: any) => a.distance - b.distance)[0];
        
        return {
          _id: partner._id,
          name: partner.name,
          description: partner.description,
          logo: partner.logo,
          categories: partner.categories,
          isActive: partner.isActive,
          metrics: partner.metrics,
          nearestLocation: nearestLocation || null,
          allLocations: partner.locations.filter((loc: any) => loc.isActive)
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
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid query parameters', details: error.errors });
      }
      return reply.status(500).send({ error: 'Failed to fetch nearby partners', message: error.message });
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
        activeLocations: partner.locations.filter((loc: any) => loc.isActive).length
      }
    });
  });

  // POST /admin/partners/:id/locations - Add a location to a partner
  fastify.post('/partners/:id/locations', async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const { id } = request.params;
    const locationData = request.body as any;
    
    const partner = await Partner.findById(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    
    await (partner as any).addLocation(locationData);
    return reply.status(201).send({
      success: true,
      message: 'Location added successfully',
      data: partner.locations[partner.locations.length - 1]
    });
  });

  // PUT /admin/partners/:id/locations/:locationId - Update a partner location
  fastify.put('/partners/:id/locations/:locationId', async (request: FastifyRequest<{ Params: { id: string; locationId: string } }>, reply) => {
    const { id, locationId } = request.params;
    const updateData = request.body as any;
    
    const partner = await Partner.findById(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    
    try {
      await (partner as any).updateLocation(locationId, updateData);
      const updatedLocation = (partner.locations as any).id(locationId);
      return reply.send({
        success: true,
        message: 'Location updated successfully',
        data: updatedLocation
      });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  // DELETE /admin/partners/:id/locations/:locationId - Remove a partner location
  fastify.delete('/partners/:id/locations/:locationId', async (request: FastifyRequest<{ Params: { id: string; locationId: string } }>, reply) => {
    const { id, locationId } = request.params;
    
    const partner = await Partner.findById(id);
    if (!partner) {
      return reply.status(404).send({ error: 'Partner not found' });
    }
    
    await (partner as any).removeLocation(locationId);
    return reply.status(204).send();
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
