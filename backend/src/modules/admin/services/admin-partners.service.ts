import { Types } from 'mongoose';
import { Partner, IPartner } from '@/models/Partner';
import { audit } from '@/lib/audit-logger';
import { typedLogger } from '@/lib/typed-logger';
import { User } from '@/models/User';
import { UserRole } from '@/types';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '@/config';
import { broadcastAdminEvent } from '@/lib/websocket';

interface GetPartnersOptions {
  page?: number;
  limit?: number;
  isActive?: boolean;
  category?: string;
  search?: string;
}

export interface PartnerData {
  name: string;
  description?: string;
  logo?: string;
  logoUrl?: string;
  website?: string;
  phone?: string;
  contactPhone?: string;
  contactEmail?: string;
  email?: string;
  categories?: string[];
  locations?: IPartner['locations'];
  isActive?: boolean;
  contractStartDate?: Date;
  contractEndDate?: Date;
  commissionRate?: number;
  paymentTerms?: string;
  contactPerson?: IPartner['contactPerson'];
  businessHours?: IPartner['businessHours'];
  socialMedia?: IPartner['socialMedia'];
  documents?: IPartner['documents'];
  settings?: IPartner['settings'];
}

class AdminPartnersService {
  private static generatePassword() {
    return crypto.randomBytes(8).toString('base64url');
  }

  private static async logAction(
    action: string,
    partnerId: Types.ObjectId,
    adminId: string,
    details: Record<string, unknown> = {}
  ) {
    // Use unified audit logger - writes to both Pino and MongoDB
    await audit.custom({
      userId: adminId,
      userRole: 'admin',
      action,
      resource: 'partner',
      resourceId: partnerId.toString(),
      category: 'admin',
      severity: 'low',
      metadata: details,
    });
  }

  static async getPartners(options: GetPartnersOptions = {}) {
    const { page = 1, limit = 20, isActive, category, search } = options;
    const pageSize = Math.max(1, Math.min(100, limit));
    const skip = (page - 1) * pageSize;

    const query: Record<string, unknown> = {};

    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    if (category) {
      query.categories = category;
    }

    if (search) {
      const regex = new RegExp(search, 'i');
      query.$or = [
        { name: regex },
        { 'contactPerson.name': regex },
        { email: regex },
        { contactEmail: regex },
      ];
    }

    const [partners, total] = await Promise.all([
      Partner.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('name description email phone website contactPerson categories isActive status createdAt updatedAt locations metrics logo logoUrl commissionRate features')
        .lean(),
      Partner.countDocuments(query),
    ]);

    return {
      partners,
      pagination: {
        page,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
    };
  }

  static async getPartner(partnerId: string) {
    const partner = await Partner.findById(partnerId).lean();

    if (!partner) {
      throw new Error('Partner not found');
    }

    return partner;
  }

  static async createPartner(adminId: string, data: PartnerData) {
    try {
      const contactEmail = (data.contactEmail || data.email || data.contactPerson?.email || '').trim().toLowerCase() || undefined;
      const contactPhone = (data.contactPhone || data.phone || '').trim() || undefined;
      const contactPerson = data.contactPerson || {
        name: data.name,
        email: contactEmail || '',
        phone: contactPhone || '',
        position: 'Manager',
      };

      if (!contactEmail) {
        throw new Error('CONTACT_EMAIL_REQUIRED');
      }

      const partner = await Partner.create({
        ...data,
        logo: data.logoUrl || data.logo,
        email: contactEmail,
        phone: contactPhone,
        contactEmail,
        contactPhone,
        contactPerson,
        status: 'active',
        createdBy: adminId,
        updatedBy: adminId,
      });

      // Create a portal user bound to this partner for scanning/analytics
      const portalEmail = contactEmail.toLowerCase();
      const existingUser = await User.findOne({ email: portalEmail }).lean();
      if (existingUser) {
        // If the email already exists for a different account, surface a clear error
        throw new Error('CONTACT_EMAIL_ALREADY_IN_USE');
      }

      const passwordPlain = this.generatePassword();
      const passwordHash = await bcrypt.hash(passwordPlain, config.BCRYPT_ROUNDS);

      const portalUser = await User.create({
        email: portalEmail,
        passwordHash,
        displayName: `${data.name} Portal`,
        role: UserRole.PARTNER,
        partnerId: partner._id,
        points: { available: 0, total: 0, spent: 0 },
      });

      await this.logAction('PARTNER_CREATED', partner._id, adminId, {
        name: partner.name,
        categories: partner.categories,
        portalUser: portalUser._id,
      });

      return {
        partner,
        credentials: {
          email: contactEmail,
          password: passwordPlain,
          partnerId: partner._id.toString(),
          userId: portalUser._id.toString(),
        },
      };
    } catch (error) {
      typedLogger.error('Failed to create partner', { adminId, data, error });
      throw error;
    }
  }

  static async updatePartner(adminId: string, partnerId: string, data: Partial<PartnerData>) {
    try {
      const updates: Partial<PartnerData> = { ...data };
      if (updates.contactEmail !== undefined) {
        updates.email = updates.contactEmail?.toString().trim().toLowerCase() || undefined;
      }
      if (updates.contactPhone !== undefined) {
        updates.phone = updates.contactPhone?.toString().trim() || undefined;
      }
      if (updates.contactPerson) {
        updates.contactPerson = {
          ...updates.contactPerson,
          email: updates.contactPerson.email?.toString().trim().toLowerCase(),
          phone: updates.contactPerson.phone?.toString().trim(),
          name: updates.contactPerson.name || data.name,
        };
      }

      const partner = await Partner.findByIdAndUpdate(
        partnerId,
        {
          ...updates,
          updatedBy: adminId,
        },
        { new: true }
      );

      if (!partner) {
        throw new Error('Partner not found');
      }

      await this.logAction('PARTNER_UPDATED', partner._id, adminId, {
        updatedFields: Object.keys(data),
      });

      return partner;
    } catch (error) {
      typedLogger.error('Failed to update partner', { adminId, partnerId, data, error });
      throw error;
    }
  }

  static async deletePartner(adminId: string, partnerId: string) {
    try {
      const partner = await Partner.findByIdAndUpdate(
        partnerId,
        {
          isActive: false,
          updatedBy: adminId,
        },
        { new: true }
      );

      if (!partner) {
        throw new Error('Partner not found');
      }

      await this.logAction('PARTNER_DELETED', partner._id, adminId, {
        name: partner.name,
      });

      return partner;
    } catch (error) {
      typedLogger.error('Failed to delete partner', { adminId, partnerId, error });
      throw error;
    }
  }

  /**
   * Get the portal account associated with a partner (email + userId)
   */
  static async getPartnerCredentials(partnerId: string) {
    const partner = await Partner.findById(partnerId).lean();
    if (!partner) {
      throw new Error('Partner not found');
    }

    const portalUser = await User.findOne({ partnerId: partner._id, role: UserRole.PARTNER }).lean();
    if (!portalUser) {
      return {
        partnerId,
        email: partner.email || partner.contactPerson?.email || null,
        userId: null,
      };
    }

    return {
      partnerId,
      email: portalUser.email,
      userId: portalUser._id.toString(),
    };
  }

  /**
   * Reset the portal password for a partner (returns the new plaintext password for delivery)
   */
  static async resetPartnerCredentials(
    adminId: string,
    partnerId: string,
    opts: { newPassword?: string } = {}
  ) {
    const partner = await Partner.findById(partnerId);
    if (!partner) {
      throw new Error('Partner not found');
    }

    let portalUser = await User.findOne({ partnerId: partner._id, role: UserRole.PARTNER });

    // If no portal user exists (legacy), create one now using the partner contact email
    if (!portalUser) {
      const targetEmail =
        partner.email?.trim().toLowerCase() ||
        partner.contactPerson?.email?.trim().toLowerCase() ||
        (partner as unknown as { contactEmail?: string }).contactEmail?.trim().toLowerCase();

      if (!targetEmail) {
        throw new Error('CONTACT_EMAIL_REQUIRED');
      }

      const newPassword = opts.newPassword || this.generatePassword();
      const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
      portalUser = await User.create({
        email: targetEmail,
        passwordHash,
        displayName: `${partner.name} Portal`,
        role: UserRole.PARTNER,
        partnerId: partner._id,
        points: { available: 0, total: 0, spent: 0 },
      });

      await this.logAction('PARTNER_PORTAL_CREATED', partner._id, adminId, { portalUser: portalUser._id });
      return {
        partnerId: partner._id.toString(),
        userId: portalUser._id.toString(),
        email: targetEmail,
        password: newPassword,
      };
    }

    const newPassword = opts.newPassword || this.generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, config.BCRYPT_ROUNDS);
    portalUser.passwordHash = passwordHash;
    await portalUser.save();

    await this.logAction('PARTNER_CREDENTIALS_RESET', partner._id, adminId, {
      portalUser: portalUser._id,
      hasCustomPassword: !!opts.newPassword,
    });

    return {
      partnerId: partner._id.toString(),
      userId: portalUser._id.toString(),
      email: portalUser.email,
      password: newPassword,
    };
  }

  /**
   * Register a new partner (self-registration, status: pending)
   */
  static async registerPartner(data: PartnerData) {
    try {
      const contactEmail = (data.contactEmail || data.email || data.contactPerson?.email || '').trim().toLowerCase() || undefined;
      const contactPhone = (data.contactPhone || data.phone || '').trim() || undefined;

      if (!contactEmail) {
        throw new Error('CONTACT_EMAIL_REQUIRED');
      }

      // Check if partner email already exists
      const existingPartner = await Partner.findOne({
        $or: [
          { email: contactEmail },
          { contactEmail: contactEmail },
        ]
      });

      if (existingPartner) {
        throw new Error('PARTNER_EMAIL_ALREADY_EXISTS');
      }

      const partner = await Partner.create({
        ...data,
        email: contactEmail,
        contactEmail,
        phone: contactPhone,
        contactPhone,
        status: 'pending',
        isActive: false,
      });

      // Broadcast to admins
      broadcastAdminEvent({
        type: 'partner_update',
        data: {
          type: 'new_registration',
          partnerId: partner._id,
          name: partner.name,
          timestamp: new Date()
        }
      });

      return partner;
    } catch (error) {
      typedLogger.error('Failed to register partner', { data, error });
      throw error;
    }
  }

  /**
   * Approve a pending partner registration
   */
  static async approvePartner(adminId: string, partnerId: string) {
    try {
      const partner = await Partner.findById(partnerId);
      if (!partner) {
        throw new Error('Partner not found');
      }

      if (partner.status !== 'pending') {
        throw new Error('PARTNER_NOT_PENDING');
      }

      // Update status
      partner.status = 'active';
      partner.isActive = true;
      partner.updatedBy = adminId;
      await partner.save();

      // Create portal user (reusing reset logic which auto-creates if missing)
      const credentials = await this.resetPartnerCredentials(adminId, partnerId);

      await this.logAction('PARTNER_APPROVED', partner._id, adminId, {
        portalUser: credentials.userId
      });

      return {
        partner,
        credentials
      };
    } catch (error) {
      typedLogger.error('Failed to approve partner', { adminId, partnerId, error });
      throw error;
    }
  }
}

export { AdminPartnersService };
export default AdminPartnersService;
