import { Partner } from '@/models/Partner';
import { Reward } from '@/models/Reward';
import { Redemption } from '@/models/Redemption';
import { ListingType, RedemptionStatus } from '@/types';
import { broadcastAdminEvent } from '@/lib/websocket';
import { z } from 'zod';
import { PartnerItemSchema, PartnerLocationSchema, PartnerProfileSchema } from './partner.schema';

export class PartnerService {

    // --- PROFILE MANAGEMENT ---

    static async getProfile(partnerId: string) {
        const partner = await Partner.findById(partnerId).lean();
        if (!partner) throw new Error('PARTNER_NOT_FOUND');
        return partner;
    }

    static async updateProfile(partnerId: string, data: z.infer<typeof PartnerProfileSchema>) {
        const partner = await Partner.findByIdAndUpdate(
            partnerId,
            { $set: data },
            { new: true, runValidators: true }
        ).lean();

        if (!partner) throw new Error('PARTNER_NOT_FOUND');
        return partner;
    }

    // --- LOCATION MANAGEMENT ---

    static async getLocations(partnerId: string) {
        const partner = await Partner.findById(partnerId).lean();
        if (!partner) throw new Error('PARTNER_NOT_FOUND');
        return (partner as any).locations || [];
    }

    static async updateLocation(partnerId: string, data: z.infer<typeof PartnerLocationSchema>) {
        const partner = await Partner.findById(partnerId);
        if (!partner) throw new Error('PARTNER_NOT_FOUND');

        if (data.locationId) {
            const loc = (partner as any).locations.id(data.locationId);
            if (!loc) throw new Error('LOCATION_NOT_FOUND');

            loc.name = data.name;
            loc.address = data.address;
            loc.city = data.city;
            (loc as any).coordinates = [data.lng, data.lat];
            if (data.phone !== undefined) loc.phone = data.phone;
            if (data.isActive !== undefined) loc.isActive = data.isActive;
            if (data.features) (loc as any).features = data.features;
        } else {
            partner.locations.push({
                name: data.name,
                address: data.address,
                city: data.city,
                coordinates: [data.lng, data.lat],
                phone: data.phone,
                isActive: data.isActive ?? true,
                features: data.features,
            } as any);
        }

        await partner.save();
        return { partnerId: partner._id, locations: partner.locations };
    }

    static async removeLocation(partnerId: string, locationId: string) {
        const partner = await Partner.findById(partnerId);
        if (!partner) throw new Error('PARTNER_NOT_FOUND');

        await partner.removeLocation(locationId);
        return partner.locations;
    }

    // --- MARKETPLACE ITEMS ---

    static async getItems(partnerId: string) {
        return await Reward.find({ partnerId, isDeleted: { $ne: true } }).sort({ updatedAt: -1 }).lean();
    }

    static async createItem(partnerId: string, data: z.infer<typeof PartnerItemSchema>) {
        const partner = await Partner.findById(partnerId).lean();
        const commissionRate = (partner as any)?.commissionRate;

        const reward = await Reward.create({
            name: data.name,
            description: data.description,
            category: data.category,
            pointsCost: data.pointsCost,
            stockQuantity: data.stockQuantity,
            stockAvailable: data.stockQuantity,
            imageUrl: data.imageUrl,
            isActive: false, // Inactive until admin approves
            isPopular: data.isPopular ?? false,
            approvalStatus: 'pending',
            partnerId,
            metadata: {
                ...(data.metadata || {}),
                isSponsored: true,
                commissionRate,
                source: 'marketplace',
            },
            listingType: ListingType.MARKETPLACE_ITEM,
        });

        broadcastAdminEvent({
            type: 'marketplace_item_created',
            data: { itemId: reward._id, partnerId, name: reward.name, timestamp: new Date() }
        });

        return reward;
    }

    static async updateItem(partnerId: string, itemId: string, data: Partial<z.infer<typeof PartnerItemSchema>>) {
        const update: Record<string, unknown> = { ...data };
        if (update.stockQuantity !== undefined) update.stockAvailable = update.stockQuantity;

        update.metadata = {
            ...(data.metadata || {}),
            isSponsored: true,
            source: 'marketplace',
        };

        const item = await Reward.findOneAndUpdate(
            { _id: itemId, partnerId },
            update,
            { new: true }
        ).lean();

        if (!item) throw new Error('ITEM_NOT_FOUND');

        broadcastAdminEvent({
            type: 'marketplace_item_updated',
            data: { itemId: item._id, partnerId, name: item.name, timestamp: new Date() }
        });

        return item;
    }

    static async deleteItem(partnerId: string, itemId: string) {
        const item = await Reward.findOneAndUpdate(
            { _id: itemId, partnerId },
            { isActive: false, isDeleted: true, 'metadata.deletedAt': new Date() },
            { new: true }
        ).lean();

        if (!item) throw new Error('ITEM_NOT_FOUND');

        broadcastAdminEvent({
            type: 'marketplace_item_deleted',
            data: { itemId: item._id, partnerId, timestamp: new Date() }
        });

        return true;
    }

    // --- STATISTICS & REDEMPTIONS ---

    static async getStats(partnerId: string, limitRecent = 5) {
        const rewardsForPartner = await Reward.find({ partnerId }).select('_id category');
        const rewardIds = rewardsForPartner.map(r => r._id);

        if (!rewardIds.length) {
            return {
                totals: { pending: 0, fulfilled: 0, cancelled: 0, total: 0, todayFulfilled: 0, thisWeekRedemptions: 0 },
                byCategory: [],
                recent: []
            };
        }

        // Date boundaries for analytics
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        weekStart.setHours(0, 0, 0, 0);

        const [statusAgg, categoryAgg, recent, todayAgg, weekAgg] = await Promise.all([
            Redemption.aggregate([
                { $match: { rewardId: { $in: rewardIds } } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Redemption.aggregate([
                { $match: { rewardId: { $in: rewardIds } } },
                { $lookup: { from: 'rewards', localField: 'rewardId', foreignField: '_id', as: 'reward' } },
                { $unwind: '$reward' },
                { $group: { _id: '$reward.category', count: { $sum: 1 } } }
            ]),
            Redemption.find({ rewardId: { $in: rewardIds } })
                .populate('rewardId', 'name category imageUrl')
                .populate('userId', 'displayName email')
                .sort({ createdAt: -1 })
                .limit(limitRecent)
                .lean(),
            // Today's fulfilled redemptions
            Redemption.countDocuments({
                rewardId: { $in: rewardIds },
                status: RedemptionStatus.FULFILLED,
                updatedAt: { $gte: todayStart }
            }),
            // This week's total redemptions
            Redemption.countDocuments({
                rewardId: { $in: rewardIds },
                createdAt: { $gte: weekStart }
            }),
        ]);

        const totals: any = {
            pending: statusAgg.find(s => s._id === RedemptionStatus.PENDING)?.count || 0,
            fulfilled: statusAgg.find(s => s._id === RedemptionStatus.FULFILLED)?.count || 0,
            cancelled: statusAgg.find(s => s._id === RedemptionStatus.CANCELLED)?.count || 0,
            todayFulfilled: todayAgg,
            thisWeekRedemptions: weekAgg,
        };
        totals.total = totals.pending + totals.fulfilled + totals.cancelled;

        return {
            totals,
            byCategory: categoryAgg.map(c => ({ category: c._id, count: c.count })),
            recent: recent.map((r: any) => ({
                id: r._id,
                status: r.status,
                createdAt: r.createdAt,
                reward: r.rewardId ? { id: r.rewardId._id, name: r.rewardId.name, category: r.rewardId.category, imageUrl: r.rewardId.imageUrl } : null,
                user: r.userId ? { id: r.userId._id, displayName: r.userId.displayName, email: r.userId.email } : null,
            })),
        };
    }

    static async getPendingRedemptions(partnerId: string, limit = 50) {
        const rewardsForPartner = await Reward.find({ partnerId }).select('_id');
        const rewardIds = rewardsForPartner.map(r => r._id);

        const redemptions = await Redemption.find({
            status: RedemptionStatus.PENDING,
            rewardId: { $in: rewardIds }
        })
            .populate('rewardId', 'name category partnerId')
            .populate('userId', 'displayName email')
            .sort({ createdAt: 1 })
            .limit(limit)
            .lean();

        return redemptions.map((r: any) => ({
            id: r._id,
            user: r.userId,
            reward: r.rewardId,
            status: r.status,
            createdAt: r.createdAt
        }));
    }

    static async getAnalytics(partnerId: string) {
        const partner = await Partner.findById(partnerId).lean();
        const commissionRateDefault = (partner as any)?.commissionRate || 0;

        const partnerRewards = await Reward.find({ partnerId }).select('_id pointsCost').lean();
        const rewardIds = partnerRewards.map(r => r._id);
        const itemsCount = partnerRewards.length;

        const redemptions = await Redemption.find({
            'metadata.source': 'marketplace',
            status: { $ne: 'CANCELLED' },
            rewardId: { $in: rewardIds }
        }).populate('rewardId', 'pointsCost metadata partnerId').lean();

        const totalRedemptions = redemptions.length;
        const pointsSpent = redemptions.reduce((sum, r: any) => sum + (r.pointsSpent || r.rewardId?.pointsCost || 0), 0);
        const commission = redemptions.reduce((sum, r: any) => {
            const rate = r.rewardId?.metadata?.commissionRate ?? commissionRateDefault;
            const pts = r.pointsSpent || r.rewardId?.pointsCost || 0;
            return sum + pts * (rate / 100);
        }, 0);

        return {
            itemsCount,
            totalRedemptions,
            pointsSpent,
            commission,
            commissionRate: commissionRateDefault,
        };
    }
}
