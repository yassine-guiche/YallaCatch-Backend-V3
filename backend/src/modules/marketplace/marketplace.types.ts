export interface MarketplaceItem {
    id: string;
    title: string;
    description: string;
    category: string;
    pointsCost: number;
    images: string[];
    partnerName: string | null;
    partnerLogo: string | null;
    canAfford: boolean;
    stockStatus: string;
    savings: number | null;
}

export interface MarketplaceResponse {
    items: MarketplaceItem[];
    categories: string[];
    totalItems: number;
    filters: {
        priceRanges: { min: number; max: number; label: string }[];
        categories: { name: string; count: number }[];
        partners: { id: string; name?: string; count: number }[];
    };
    userInfo: {
        currentPoints: number;
        canAfford: number;
        recentPurchases: number;
    };
}

export interface PurchasedItemDetails {
    title: string;
    description: string;
    partnerName?: string;
    originalValue?: number;
    currency: string;
}

export interface PurchaseResult {
    success: boolean;
    redemption: {
        id: string;
        code: string;
        qrCode: string;
        item: PurchasedItemDetails;
        validUntil: string;
        howToRedeem: string;
    };
    userBalance: {
        previousPoints: number;
        pointsSpent: number;
        remainingPoints: number;
    };
    message: string;
}
