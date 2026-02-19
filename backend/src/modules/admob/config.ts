import { z } from 'zod';
import { Settings } from '../../models/Settings';
import { typedLogger } from '../../lib/typed-logger';

// Default AdMob configuration (camelCase)
export const DEFAULT_ADMOB_CONFIG = {
    maxRewardedAdsPerDay: 10,
    maxInterstitialAdsPerDay: 20,
    rewardedVideoPoints: 100,
    interstitialPoints: 20,
    rewardedVideoEcpm: 8.0, // $8 per 1000 views
    interstitialEcpm: 3.0, // $3 per 1000 views
    bannerEcpm: 0.5, // $0.50 per 1000 impressions
    rewardedCooldown: 300, // seconds
    interstitialCooldown: 180, // seconds
};

const AD_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
let admobConfigFetchedAt = 0;

export const AdmobConfigSchema = z.object({
    maxRewardedAdsPerDay: z.number().int().min(0).optional(),
    maxInterstitialAdsPerDay: z.number().int().min(0).optional(),
    rewardedVideoPoints: z.number().int().nonnegative().optional(),
    interstitialPoints: z.number().int().nonnegative().optional(),
    rewardedVideoEcpm: z.number().nonnegative().optional(),
    interstitialEcpm: z.number().nonnegative().optional(),
    bannerEcpm: z.number().nonnegative().optional(),
    rewardedCooldown: z.number().int().nonnegative().optional(),
    interstitialCooldown: z.number().int().nonnegative().optional(),
});

export const normalizeConfig = (cfg: any) => {
    if (!cfg) return { ...DEFAULT_ADMOB_CONFIG };
    return {
        maxRewardedAdsPerDay: cfg.maxRewardedAdsPerDay ?? cfg.MAX_REWARDED_ADS_PER_DAY ?? DEFAULT_ADMOB_CONFIG.maxRewardedAdsPerDay,
        maxInterstitialAdsPerDay: cfg.maxInterstitialAdsPerDay ?? cfg.MAX_INTERSTITIAL_ADS_PER_DAY ?? DEFAULT_ADMOB_CONFIG.maxInterstitialAdsPerDay,
        rewardedVideoPoints: cfg.rewardedVideoPoints ?? cfg.REWARDED_VIDEO_POINTS ?? DEFAULT_ADMOB_CONFIG.rewardedVideoPoints,
        interstitialPoints: cfg.interstitialPoints ?? cfg.INTERSTITIAL_POINTS ?? DEFAULT_ADMOB_CONFIG.interstitialPoints,
        rewardedVideoEcpm: cfg.rewardedVideoEcpm ?? cfg.REWARDED_VIDEO_ECPM ?? DEFAULT_ADMOB_CONFIG.rewardedVideoEcpm,
        interstitialEcpm: cfg.interstitialEcpm ?? cfg.INTERSTITIAL_ECPM ?? DEFAULT_ADMOB_CONFIG.interstitialEcpm,
        bannerEcpm: cfg.bannerEcpm ?? cfg.BANNER_ECPM ?? DEFAULT_ADMOB_CONFIG.bannerEcpm,
        rewardedCooldown: cfg.rewardedCooldown ?? cfg.REWARDED_COOLDOWN ?? DEFAULT_ADMOB_CONFIG.rewardedCooldown,
        interstitialCooldown: cfg.interstitialCooldown ?? cfg.INTERSTITIAL_COOLDOWN ?? DEFAULT_ADMOB_CONFIG.interstitialCooldown,
    };
};

export async function getAdmobConfig(): Promise<typeof DEFAULT_ADMOB_CONFIG> {
    const now = Date.now();
    if (now - admobConfigFetchedAt < AD_CONFIG_CACHE_TTL && admobConfigCache) {
        return admobConfigCache;
    }

    try {
        const settings = await Settings.findOne({}, { 'custom.admob': 1 }).lean();
        const cfg = (settings as any)?.custom?.get?.('admob') || (settings as any)?.custom?.admob;
        if (cfg) {
            admobConfigCache = normalizeConfig(cfg);
            admobConfigFetchedAt = now;
            return admobConfigCache;
        }

        // Default return without side effects
        admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
        admobConfigFetchedAt = now;
        return admobConfigCache;
    } catch (error) {
        typedLogger.warn('AdMob settings load failed, using defaults', { error: (error as any).message });
        admobConfigCache = { ...DEFAULT_ADMOB_CONFIG };
        admobConfigFetchedAt = now;
        return admobConfigCache;
    }
}

export async function saveAdmobConfig(update: Partial<typeof DEFAULT_ADMOB_CONFIG>, adminId: string) {
    const current = await getAdmobConfig();
    const merged = { ...current, ...update };
    await Settings.findOneAndUpdate(
        {},
        { $set: { 'custom.admob': merged, updatedBy: adminId } },
        { upsert: true }
    );
    admobConfigCache = merged;
    admobConfigFetchedAt = Date.now();
    return merged;
}
