/**
 * YallaCatch! Data Mappers
 * Convertit les structures de données du backend Node.js vers le format attendu par le frontend
 */

/**
 * Mapper pour les utilisateurs
 * ✅ CORRIGÉ : Utilise les champs réels du backend (points, level, stats)
 */
export const mapBackendUser = (user) => {
  if (!user) return null;
  
  // Mapping niveau enum → nombre
  const LEVEL_TO_NUMBER = {
    'bronze': 1,
    'silver': 2,
    'gold': 3,
    'platinum': 4,
    'diamond': 5
  };
  
  const numericPoints = typeof user.points === 'number' ? user.points : null;
  const pointsObj = typeof user.points === 'object' && user.points !== null ? user.points : {};
  // Use available points (current balance) for display, fallback to total if available is not set
  const availablePoints = pointsObj.available ?? pointsObj.total ?? numericPoints ?? 0;
  const totalPoints = pointsObj.total ?? pointsObj.available ?? numericPoints ?? 0;
  const totalClaims =
    user.stats?.totalClaims ??
    user.stats?.claims ??
    user.stats?.claimsCount ??
    user.stats?.prizesFound ??
    0;

  return {
    // Identifiants
    id: user._id || user.id,
    email: user.email,
    username: user.username,
    name: user.displayName || user.username || user.email?.split('@')[0],
    displayName: user.displayName,
    
    // Rôle et permissions
    role: user.role,
    permissions: user.role === 'admin' ? ['*'] : [],
    
    // Statut
    status: user.isBanned ? 'banned' : (user.status || 'active'),
    isBanned: user.isBanned || false,
    banInfo: user.isBanned ? {
      reason: user.banReason || user.bannedReason,
      expiresAt: user.banExpiresAt || user.bannedUntil || user.banUntil || null,
      bannedAt: user.bannedAt || user.bannedAt || null,
    } : null,
    
    // Profil (non implémenté dans le backend)
    avatar: null,
    bio: '',
    
    // Localisation
    location: user.location
      ? {
          lat: user.location.lat ?? user.location.coordinates?.[1],
          lng: user.location.lng ?? user.location.coordinates?.[0],
          city: user.location.city,
          lastUpdated: user.location.lastUpdated,
          coordinates: user.location.coordinates,
        }
      : null,

    // Devices
    devices: Array.isArray(user.devices) ? user.devices : [],
    
    // Progression (✅ CORRIGÉ)
    level: LEVEL_TO_NUMBER[user.level] || 1,
    levelName: user.level || 'bronze',
    points: availablePoints, // Current available balance
    pointsTotal: totalPoints, // Lifetime total earned
    pointsAvailable: availablePoints,
    pointsSpent: pointsObj.spent || 0,
    
    // Statistiques (✅ CORRIGÉ)
    captures: totalClaims,
    totalClaims,
    prizesFound: user.stats?.prizesFound || 0,
    rewardsRedeemed: user.stats?.rewardsRedeemed || 0,
    sessionsCount: user.stats?.sessionsCount || 0,
    totalPlayTime: user.stats?.totalPlayTime || 0,
    currentStreak: user.stats?.currentStreak || 0,
    longestStreak: user.stats?.longestStreak || 0,
    favoriteCity: user.stats?.favoriteCity || null,
    lastClaimDate: user.stats?.lastClaimDate ? new Date(user.stats.lastClaimDate) : null,
    dailyClaimsCount: user.stats?.dailyClaimsCount || 0,
    stats: user.stats || {},
    
    // Réseau & IP
    lastIp: user.lastIp || user.ipAddress || user.last_ip || null,
    lastUserAgent: user.lastUserAgent || user.userAgent || null,
    
    // Appareils (avec mapping complet)
    devices: (user.devices || []).map(d => ({
      deviceId: d.deviceId || d.device_id || d.id,
      platform: d.platform || 'unknown',
      model: d.model || d.deviceModel || d.device_model || null,
      osVersion: d.osVersion || d.os_version || d.systemVersion || null,
      appVersion: d.appVersion || d.app_version || null,
      fcmToken: d.fcmToken || d.fcm_token || null,
      userAgent: d.userAgent || d.user_agent || null,
      lastUsed: d.lastUsed || d.last_used || d.lastActive || null,
      isActive: d.isActive ?? d.is_active ?? true,
    })),
    
    // Préférences
    preferences: user.preferences || {
      notifications: true,
      language: 'fr',
      theme: 'light'
    },

    createdAt: user.createdAt || user.created_at || null,
    lastActive: user.lastActive || user.last_active || null,
    
    updatedAt: user.updatedAt ? new Date(user.updatedAt) : null,
  };
};

/**
 * Mapper pour les prix
 * ✅ CORRIGÉ: Extrait city de location, ajoute category, value, quantity
 */
export const mapBackendPrize = (prize) => {
  if (!prize) return null;
  
  // Extract coordinates from nested location object
  const lat = prize.location?.coordinates?.[1] || prize.location?.lat || prize.latitude;
  const lng = prize.location?.coordinates?.[0] || prize.location?.lng || prize.longitude;
  const city = prize.location?.city || prize.city || 'Unknown';
  const radius = prize.location?.radius || prize.radius || 50;
  
  return {
    id: prize._id || prize.id,
    type: prize.type || 'physical',
    name: prize.name,
    description: prize.description,
    // Points can be in points field or value field
    points: prize.points ?? prize.value ?? prize.pointsReward?.amount ?? 0,
    value: prize.value ?? prize.points ?? 0,
    // Category is important for display
    category: prize.category || 'lifestyle',
    // Location with city extracted
    location: {
      lat: lat,
      lng: lng,
      type: prize.location?.type || 'gps',
      city: city,
      radius: radius,
      address: prize.location?.address,
    },
    // Direct city access for convenience
    city: city,
    latitude: lat,
    longitude: lng,
    radius: radius,
    status: prize.status || 'active',
    rarity: prize.rarity || 'common',
    // Quantity info
    quantity: prize.quantity ?? 1,
    claimedCount: prize.claimedCount ?? 0,
    // Content for mystery boxes etc
    content: prize.content || {},
    contentType: prize.contentType || 'points',
    displayType: prize.displayType || 'standard',
    // Images
    imageUrl: prize.imageUrl,
    // Ownership & claiming
    spawnedBy: prize.spawnedBy,
    createdBy: prize.createdBy,
    claimedBy: prize.claimedBy,
    claimedAt: prize.claimedAt ? new Date(prize.claimedAt) : null,
    expiresAt: prize.expiresAt ? new Date(prize.expiresAt) : null,
    // Visibility
    visibility: prize.visibility,
    // Extra data
    metadata: prize.metadata || {},
    directReward: prize.directReward || (prize.metadata?.rewardId ? {
      rewardId: prize.metadata.rewardId,
      autoRedeem: prize.metadata.autoRedeem ?? true,
      probability: prize.metadata.probability ?? 1,
    } : undefined),
    rewardId: prize.directReward?.rewardId || prize.metadata?.rewardId,
    tags: prize.tags || [],
    // Timestamps
    createdAt: prize.createdAt ? new Date(prize.createdAt) : null,
    updatedAt: prize.updatedAt ? new Date(prize.updatedAt) : null,
  };
};

/**
 * Mapper pour les captures
 */
export const mapBackendCapture = (capture) => {
  if (!capture) return null;
  
  return {
    id: capture._id || capture.id,
    userId: capture.userId,
    prizeId: capture.prizeId,
    location: capture.location ? {
      lat: capture.location.coordinates?.[1] || capture.location.lat,
      lng: capture.location.coordinates?.[0] || capture.location.lng
    } : null,
    accuracy: capture.accuracy,
    method: capture.method,
    status: capture.status,
    pointsAwarded: capture.pointsAwarded,
    antiCheatScore: capture.antiCheatScore,
    metadata: capture.metadata || {},
    validatedBy: capture.validatedBy,
    validatedAt: capture.validatedAt ? new Date(capture.validatedAt) : null,
    rejectionReason: capture.rejectionReason,
    createdAt: capture.createdAt ? new Date(capture.createdAt) : null,
    updatedAt: capture.updatedAt ? new Date(capture.updatedAt) : null,
  };
};

/**
 * Mapper pour les récompenses
 * Maps backend Reward model to frontend format
 * Backend fields: name, description, category, pointsCost, stockQuantity, stockAvailable, stockReserved, imageUrl, isActive, isPopular, partnerId, metadata
 */
export const mapBackendReward = (reward) => {
  if (!reward) return null;
  
  // Map category to French label for display
  const categoryLabels = {
    voucher: 'Bon d\'achat',
    gift_card: 'Carte cadeau',
    physical: 'Produit physique',
    digital: 'Produit numérique',
    experience: 'Expérience'
  };
  
  return {
    // IDs
    id: reward._id || reward.id,
    
    // Core fields
    name: reward.name || '',
    description: reward.description || '',
    category: reward.category || 'voucher',
    categoryLabel: categoryLabels[reward.category] || reward.category,
    
    // Points
    pointsCost: reward.pointsCost || 0,
    pointsRequired: reward.pointsCost || 0, // Alias for frontend compatibility
    
    // Stock management
    stockQuantity: reward.stockQuantity || 0,
    stockAvailable: reward.stockAvailable || 0,
    stockReserved: reward.stockReserved || 0,
    quantity: reward.stockAvailable || reward.stockQuantity || 0, // Frontend alias
    
    // Media
    imageUrl: reward.imageUrl || reward.image || '',
    image: reward.imageUrl || reward.image || '',
    
    // Status
    isActive: reward.isActive !== false,
    isPopular: reward.isPopular === true,
    isAvailable: reward.isActive !== false && (reward.stockAvailable || 0) > 0,
    
    // Partner
    partnerId: reward.partnerId?._id || reward.partnerId || null,
    partner: reward.partnerId && typeof reward.partnerId === 'object' ? mapBackendPartner(reward.partnerId) : null,
    
    // Metadata
    metadata: reward.metadata || {},
    terms: reward.metadata?.terms || reward.terms || '',
    validityPeriod: reward.metadata?.validityPeriod || reward.validityPeriod || 30,
    
    // Timestamps
    createdAt: reward.createdAt ? new Date(reward.createdAt) : null,
    updatedAt: reward.updatedAt ? new Date(reward.updatedAt) : null,
  };
};

/**
 * Mapper pour les rachats
 */
export const mapBackendRedemption = (redemption) => {
  if (!redemption) return null;
  
  return {
    id: redemption._id || redemption.id,
    userId: redemption.userId,
    rewardId: redemption.rewardId,
    reward: redemption.reward ? mapBackendReward(redemption.reward) : null,
    user: redemption.user ? mapBackendUser(redemption.user) : null,
    pointsSpent: redemption.pointsSpent,
    status: redemption.status,
    qrCode: redemption.qrCode,
    qrCodeImage: redemption.qrCodeImage,
    validatedBy: redemption.validatedBy,
    validatedAt: redemption.validatedAt ? new Date(redemption.validatedAt) : null,
    expiresAt: redemption.expiresAt ? new Date(redemption.expiresAt) : null,
    metadata: redemption.metadata || {},
    createdAt: redemption.createdAt ? new Date(redemption.createdAt) : null,
    updatedAt: redemption.updatedAt ? new Date(redemption.updatedAt) : null,
  };
};

/**
 * Mapper pour les partenaires
 */
export const mapBackendPartner = (partner) => {
  if (!partner) return null;
  
  return {
    id: partner._id || partner.id,
    name: partner.name,
    description: partner.description,
    category: partner.category || (Array.isArray(partner.categories) ? partner.categories[0] : undefined),
    categories: partner.categories || (partner.category ? [partner.category] : []),
    logo: partner.logo || partner.logoUrl,
    contactEmail: partner.email || partner.contactEmail || partner.contact?.email,
    contactPhone: partner.phone || partner.contactPhone || partner.contact?.phone,
    website: partner.website || partner.websiteUrl,
    locations: partner.locations || [],
    isActive: partner.isActive !== undefined ? partner.isActive : partner.status === 'active',
    commission: partner.commission,
    contractInfo: partner.contractInfo || {},
    stats: partner.stats || partner.metrics || {},
    createdAt: partner.createdAt ? new Date(partner.createdAt) : null,
    updatedAt: partner.updatedAt ? new Date(partner.updatedAt) : null,
  };
};

/**
 * Mapper pour les achievements
 * Maps backend Achievement model to frontend format
 * Backend fields: name, description, icon, category, trigger, condition, rewards, isActive, isHidden, order
 */
export const mapBackendAchievement = (achievement) => {
  if (!achievement) return null;
  
  // Category labels for display
  const categoryLabels = {
    explorer: 'Explorateur',
    collector: 'Collectionneur',
    social: 'Social',
    master: 'Maître',
    special: 'Spécial'
  };
  
  // Trigger labels for display
  const triggerLabels = {
    PRIZE_CLAIMED: 'Prix capturé',
    LEVEL_UP: 'Niveau atteint',
    REWARD_REDEEMED: 'Récompense échangée',
    FRIEND_ADDED: 'Ami ajouté',
    STREAK_MILESTONE: 'Série atteinte',
    DISTANCE_MILESTONE: 'Distance parcourue',
    MANUAL: 'Manuel'
  };
  
  return {
    id: achievement._id || achievement.id,
    name: achievement.name || '',
    description: achievement.description || '',
    icon: achievement.icon || '🏆',
    
    // Category
    category: achievement.category || 'explorer',
    categoryLabel: categoryLabels[achievement.category] || achievement.category,
    
    // Trigger
    trigger: achievement.trigger || 'PRIZE_CLAIMED',
    triggerLabel: triggerLabels[achievement.trigger] || achievement.trigger,
    
    // Condition
    condition: {
      type: achievement.condition?.type || 'TOTAL_CLAIMS',
      target: achievement.condition?.target || 1,
      category: achievement.condition?.category || null,
      rarity: achievement.condition?.rarity || null
    },
    
    // Rewards
    rewards: Array.isArray(achievement.rewards) ? achievement.rewards.map(r => ({
      type: r.type || 'POINTS',
      value: r.value || 0,
      description: r.description || ''
    })) : [],
    
    // Status
    isActive: achievement.isActive !== false,
    isHidden: achievement.isHidden === true,
    
    // Order
    order: achievement.order || 0,
    
    // Timestamps
    createdAt: achievement.createdAt ? new Date(achievement.createdAt) : null,
    updatedAt: achievement.updatedAt ? new Date(achievement.updatedAt) : null,
  };
};

/**
 * Mapper pour les user achievements (progression)
 */
export const mapBackendUserAchievement = (userAchievement) => {
  if (!userAchievement) return null;
  
  return {
    id: userAchievement._id || userAchievement.id,
    userId: userAchievement.userId,
    achievementId: userAchievement.achievementId,
    achievement: userAchievement.achievement ? mapBackendAchievement(userAchievement.achievement) : null,
    progress: userAchievement.progress || 0,
    unlockedAt: userAchievement.unlockedAt ? new Date(userAchievement.unlockedAt) : null,
    claimedAt: userAchievement.claimedAt ? new Date(userAchievement.claimedAt) : null,
    createdAt: userAchievement.createdAt ? new Date(userAchievement.createdAt) : null,
  };
};

/**
 * Mapper frontend -> backend pour un achievement
 */
export const toBackendAchievement = (achievement) => {
  if (!achievement) return null;
  
  return {
    name: achievement.name,
    description: achievement.description,
    icon: achievement.icon || '🏆',
    category: achievement.category || 'explorer',
    trigger: achievement.trigger || 'PRIZE_CLAIMED',
    condition: {
      type: achievement.condition?.type || 'TOTAL_CLAIMS',
      target: parseInt(achievement.condition?.target) || 1,
      category: achievement.condition?.category || undefined,
      rarity: achievement.condition?.rarity || undefined
    },
    rewards: Array.isArray(achievement.rewards) ? achievement.rewards.map(r => ({
      type: r.type || 'POINTS',
      value: r.value || 0,
      description: r.description || ''
    })) : [],
    isActive: achievement.isActive !== false,
    isHidden: achievement.isHidden === true,
    order: parseInt(achievement.order) || 0
  };
};

/**
 * Mapper pour les notifications
 */
export const mapBackendNotification = (notification) => {
  if (!notification) return null;
  
  return {
    id: notification._id || notification.id,
    userId: notification.userId,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data || notification.metadata || {},
    targetType: notification.targetType || notification.target_type,
    targetValue: notification.targetValue || notification.target_value,
    createdBy: notification.createdBy?._id || notification.createdBy,
    createdByName: notification.createdBy?.displayName || notification.createdBy?.name || notification.createdBy?.email,
    status: notification.status,
    channels: notification.channels || [],
    sentAt: notification.sentAt ? new Date(notification.sentAt) : null,
    scheduledFor: notification.scheduledFor ? new Date(notification.scheduledFor) : null,
    readAt: notification.readAt ? new Date(notification.readAt) : null,
    expiresAt: notification.expiresAt ? new Date(notification.expiresAt) : null,
    createdAt: notification.createdAt ? new Date(notification.createdAt) : null,
    updatedAt: notification.updatedAt ? new Date(notification.updatedAt) : null,
  };
};

/**
 * Mapper pour les logs d'audit
 */
export const mapBackendAuditLog = (log) => {
  if (!log) return null;
  
  return {
    id: log._id || log.id,
    userId: log.userId,
    user: log.user ? mapBackendUser(log.user) : null,
    action: log.action,
    resource: log.resource,
    resourceId: log.resourceId,
    changes: log.changes || {},
    ipAddress: log.ipAddress,
    userAgent: log.userAgent,
    status: log.status,
    metadata: log.metadata || {},
    createdAt: log.createdAt ? new Date(log.createdAt) : null,
  };
};

/**
 * Mapper pour les sessions de jeu
 */
export const mapBackendSession = (session) => {
  if (!session) return null;
  
  return {
    id: session._id || session.id,
    userId: session.userId,
    startTime: session.startTime ? new Date(session.startTime) : null,
    endTime: session.endTime ? new Date(session.endTime) : null,
    duration: session.duration,
    stats: session.stats || {},
    locations: session.locations || [],
    deviceInfo: session.deviceInfo || {},
    createdAt: session.createdAt ? new Date(session.createdAt) : null,
    updatedAt: session.updatedAt ? new Date(session.updatedAt) : null,
  };
};

/**
 * Mapper pour les statistiques du dashboard
 */
export const mapBackendDashboardStats = (stats) => {
  if (!stats) return null;
  
  return {
    users: {
      total: stats.users?.total || 0,
      active: stats.users?.active || 0,
      new: stats.users?.new || 0,
      online: stats.users?.online || 0,
    },
    prizes: {
      total: stats.prizes?.total || 0,
      active: stats.prizes?.active || 0,
      claimed: stats.prizes?.claimed || 0,
    },
    captures: {
      total: stats.captures?.total || stats.claims?.total || 0,
      today: stats.captures?.today || 0,
      validated: stats.captures?.validated || stats.claims?.approved || 0,
      pending: stats.captures?.pending || stats.claims?.pending || 0,
    },
    rewards: {
      total: stats.rewards?.total || 0,
      active: stats.rewards?.active || 0,
    },
    redemptions: {
      total: stats.redemptions?.total || 0,
      core: stats.redemptions?.core || 0,
      marketplace: stats.redemptions?.marketplace || 0,
    },
    purchases: {
      total: stats.purchases?.total || 0,
      unredeemed: stats.purchases?.unredeemed || 0,
      redeemed: stats.purchases?.redeemed || 0,
    },
    revenue: {
      total: stats.revenue?.total || 0,
      today: stats.revenue?.today || 0,
      thisMonth: stats.revenue?.thisMonth || 0,
    },
    dailyActivity: (stats.dailyActivity || []).map(day => ({
      date: day.date || day._id,
      captures: day.captures || day.claims || 0,
      redemptions: day.redemptions || 0,
      points: day.points || 0
    })),
    activity: stats.activity || [],
    recentCaptures: (stats.recentCaptures || []).map(mapBackendCapture),
    recentRedemptions: (stats.recentRedemptions || []).map(mapBackendRedemption),
  };
};

/**
 * Mapper pour convertir les données frontend vers backend (pour les requêtes)
 */
export const toBackendLocation = (location) => {
  if (!location) return null;
  
  if (location.coordinates) {
    // Déjà au format GeoJSON
    return location;
  }
  
  return {
    type: 'Point',
    coordinates: [location.lng, location.lat]
  };
};

/**
 * Mapper pour convertir un utilisateur frontend vers backend
 */
export const toBackendUser = (user) => {
  if (!user) return null;
  
  return {
    email: user.email,
    username: user.username,
    displayName: user.displayName || user.name,
    password: user.password,
    role: user.role,
    status: user.status,
    profile: {
      avatar: user.avatar,
      bio: user.bio,
      location: user.location ? toBackendLocation(user.location) : null,
    },
    permissions: user.permissions,
  };
};

/**
 * Mapper pour convertir un prix frontend vers backend
 */
export const toBackendPrize = (prize) => {
  if (!prize) return null;
  
  return {
    type: prize.type,
    name: prize.name,
    description: prize.description,
    points: prize.points,
    location: prize.location ? toBackendLocation(prize.location) : null,
    radius: prize.radius || 50,
    rarity: prize.rarity,
    content: prize.content,
    expiresAt: prize.expiresAt,
    metadata: prize.metadata,
  };
};

/**
 * Mapper frontend -> backend pour un partenaire
 */
export const mapFrontendPartner = (partner) => {
  if (!partner) return null;

  const rawEmail = partner.contactEmail || partner.contact?.email || partner.contactPerson?.email || '';
  const rawPhone = partner.contactPhone || partner.contact?.phone || partner.contactPerson?.phone || '';
  const contactEmail = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
  const contactPhone = typeof rawPhone === 'string' ? rawPhone.trim() : '';
  // Map frontend shape to backend `createPartner` schema expected by the server
  // Backend expects: name, description, website, logoUrl, contactEmail, contactPhone,
  // commissionRate (0-100), isActive, category, metadata
  const categories = partner.categories && partner.categories.length ? partner.categories : (partner.category ? [partner.category] : ['food']);
  return {
    name: partner.name,
    description: partner.description,
    website: partner.website || partner.websiteUrl || '',
    logoUrl: partner.logo || partner.logoUrl || '',
    contactEmail,
    contactPhone,
    category: categories[0], // backend schema currently expects a single category
    categories,
    features: partner.features || [],
    commissionRate: typeof partner.commission === 'number' ? partner.commission : (partner.commissionRate || 0),
    status: partner.isActive === false ? 'inactive' : 'active',
    isActive: partner.isActive !== false,
    locations: partner.locations || [],
    contactPerson: {
      name: partner.contactPerson?.name || partner.name || partner.contact?.name || 'Point de contact',
      email: contactEmail,
      phone: contactPhone,
      position: partner.contactPerson?.position || 'Manager',
    },
    metadata: {
      ...(partner.metadata || partner.meta || {}),
      features: partner.features || [],
    },
  };
};

/**
 * Mapper pour les PowerUps
 * Backend: PowerUp model with type, rarity, effects, drop configuration
 */
export const mapBackendPowerUp = (powerUp) => {
  if (!powerUp) return null;
  
  const typeLabels = {
    radar_boost: 'Boost Radar',
    double_points: 'Double Points',
    speed_boost: 'Boost Vitesse',
    shield: 'Bouclier',
    time_extension: 'Extension Temps'
  };
  
  const rarityLabels = {
    common: 'Commun',
    rare: 'Rare',
    epic: 'Épique',
    legendary: 'Légendaire'
  };
  
  return {
    id: powerUp._id || powerUp.id,
    name: powerUp.name || '',
    description: powerUp.description || '',
    type: powerUp.type || 'radar_boost',
    typeLabel: typeLabels[powerUp.type] || powerUp.type,
    icon: powerUp.icon || '⚡',
    rarity: powerUp.rarity || 'common',
    rarityLabel: rarityLabels[powerUp.rarity] || powerUp.rarity,
    durationMs: powerUp.durationMs || 0,
    durationSeconds: Math.round((powerUp.durationMs || 0) / 1000),
    
    // Drop configuration
    dropRate: powerUp.dropRate || 0,
    maxPerSession: powerUp.maxPerSession || 3,
    maxInInventory: powerUp.maxInInventory || 10,
    
    // Effect values
    effects: powerUp.effects || {},
    
    // Statistics
    totalCreated: powerUp.totalCreated || 0,
    totalClaimed: powerUp.totalClaimed || 0,
    activeInstances: powerUp.activeInstances || 0,
    usageCount: powerUp.usageCount || 0,
    claimRate: powerUp.claimRate || 0,
    adoptionRate: powerUp.adoptionRate || 0,
    
    // Status
    enabled: powerUp.enabled !== false,
    notes: powerUp.notes || '',
    
    // Metadata
    createdBy: powerUp.createdBy,
    lastModifiedBy: powerUp.lastModifiedBy,
    createdAt: powerUp.createdAt ? new Date(powerUp.createdAt) : null,
    updatedAt: powerUp.updatedAt ? new Date(powerUp.updatedAt) : null,
  };
};

/**
 * Mapper frontend -> backend pour PowerUp
 */
export const toBackendPowerUp = (powerUp) => {
  if (!powerUp) return null;
  
  return {
    name: powerUp.name,
    description: powerUp.description,
    type: powerUp.type,
    icon: powerUp.icon || '⚡',
    rarity: powerUp.rarity || 'common',
    durationMs: parseInt(powerUp.durationMs) || parseInt(powerUp.durationSeconds) * 1000 || 60000,
    dropRate: parseFloat(powerUp.dropRate) || 10,
    maxPerSession: parseInt(powerUp.maxPerSession) || 3,
    maxInInventory: parseInt(powerUp.maxInInventory) || 10,
    effects: powerUp.effects || {},
    enabled: powerUp.enabled !== false,
    notes: powerUp.notes || '',
  };
};

/**
 * Mapper pour les Distributions
 * Backend: Distribution model with targetArea, prizeTemplate, quantity, spacing
 */
export const mapBackendDistribution = (distribution) => {
  if (!distribution) return null;
  
  const statusLabels = {
    draft: 'Brouillon',
    pending: 'En attente',
    in_progress: 'En cours',
    completed: 'Terminée',
    cancelled: 'Annulée',
    failed: 'Échec'
  };
  
  return {
    id: distribution._id || distribution.id,
    name: distribution.name || '',
    description: distribution.description || '',
    
    // Target area
    targetArea: {
      type: distribution.targetArea?.type || 'circle',
      coordinates: distribution.targetArea?.coordinates || [],
      city: distribution.targetArea?.city || null,
      radius: distribution.targetArea?.radius || 0,
    },
    
    // Prize template
    prizeTemplate: distribution.prizeTemplate ? {
      name: distribution.prizeTemplate.name,
      description: distribution.prizeTemplate.description,
      type: distribution.prizeTemplate.type,
      category: distribution.prizeTemplate.category,
      points: distribution.prizeTemplate.points,
      rarity: distribution.prizeTemplate.rarity,
      imageUrl: distribution.prizeTemplate.imageUrl,
    } : null,
    
    // Configuration
    quantity: distribution.quantity || 0,
    spacing: distribution.spacing || 50,
    
    // Status
    status: distribution.status || 'draft',
    statusLabel: statusLabels[distribution.status] || distribution.status,
    
    // Undo
    undoExpiresAt: distribution.undoExpiresAt ? new Date(distribution.undoExpiresAt) : null,
    canUndo: distribution.undoExpiresAt ? new Date(distribution.undoExpiresAt) > new Date() : false,
    
    // Metadata
    metadata: distribution.metadata || {},
    createdBy: distribution.createdBy,
    createdAt: distribution.createdAt ? new Date(distribution.createdAt) : null,
    updatedAt: distribution.updatedAt ? new Date(distribution.updatedAt) : null,
  };
};

/**
 * Mapper pour les A/B Tests
 * Backend: ABTest model with variants, metrics, status
 */
export const mapBackendABTest = (test) => {
  if (!test) return null;
  
  const typeLabels = {
    feature: 'Fonctionnalité',
    ui: 'Interface',
    mechanics: 'Mécaniques',
    rewards: 'Récompenses',
    pricing: 'Tarification'
  };
  
  const statusLabels = {
    draft: 'Brouillon',
    active: 'Actif',
    paused: 'En pause',
    ended: 'Terminé'
  };
  
  return {
    id: test._id || test.id,
    name: test.name || '',
    description: test.description || '',
    type: test.type || 'feature',
    typeLabel: typeLabels[test.type] || test.type,
    status: test.status || 'draft',
    statusLabel: statusLabels[test.status] || test.status,
    
    // Variants
    variants: Array.isArray(test.variants) ? test.variants.map(v => ({
      name: v.name,
      trafficAllocation: v.trafficAllocation || 0,
      config: v.config || {},
      conversions: v.conversions || 0,
      impressions: v.impressions || 0,
      conversionRate: v.impressions > 0 ? ((v.conversions / v.impressions) * 100).toFixed(2) : 0,
    })) : [],
    
    // Metrics
    metrics: Array.isArray(test.metrics) ? test.metrics.map(m => ({
      metricName: m.metricName,
      baseline: m.baseline || 0,
      targetImprovement: m.targetImprovement || 0,
      significance: m.significance || 0,
      winner: m.winner || null,
    })) : [],
    
    // Timeline
    startDate: test.startDate ? new Date(test.startDate) : null,
    endDate: test.endDate ? new Date(test.endDate) : null,
    
    // Results
    winnerVariant: test.winnerVariant || null,
    sampleSize: test.sampleSize || 1000,
    confidenceLevel: test.confidenceLevel || 0.95,
    
    // Metadata
    createdBy: test.createdBy,
    createdAt: test.createdAt ? new Date(test.createdAt) : null,
    updatedAt: test.updatedAt ? new Date(test.updatedAt) : null,
  };
};

/**
 * Mapper frontend -> backend pour A/B Test
 */
export const toBackendABTest = (test) => {
  if (!test) return null;
  
  return {
    name: test.name,
    description: test.description || '',
    type: test.type || 'feature',
    status: test.status || 'draft',
    variants: Array.isArray(test.variants) ? test.variants.map(v => ({
      name: v.name,
      trafficAllocation: parseFloat(v.trafficAllocation) || 0,
      config: v.config || {},
    })) : [],
    metrics: Array.isArray(test.metrics) ? test.metrics.map(m => ({
      metricName: m.metricName,
      baseline: parseFloat(m.baseline) || 0,
      targetImprovement: parseFloat(m.targetImprovement) || 0,
    })) : [],
    startDate: test.startDate,
    endDate: test.endDate || null,
    sampleSize: parseInt(test.sampleSize) || 1000,
    confidenceLevel: parseFloat(test.confidenceLevel) || 0.95,
  };
};

/**
 * Mapper pour les Reports
 * Backend: Report model with type, status, priority, resolution
 */
export const mapBackendReport = (report) => {
  if (!report) return null;
  
  const typeLabels = {
    fraud: 'Fraude',
    bug: 'Bug',
    abuse: 'Abus',
    inappropriate_content: 'Contenu inapproprié',
    spam: 'Spam',
    other: 'Autre'
  };
  
  const statusLabels = {
    pending: 'En attente',
    investigating: 'En cours',
    resolved: 'Résolu',
    rejected: 'Rejeté',
    duplicate: 'Doublon'
  };
  
  const priorityLabels = {
    low: 'Basse',
    medium: 'Moyenne',
    high: 'Haute',
    critical: 'Critique'
  };
  
  return {
    id: report._id || report.id,
    userId: report.userId,
    reporterName: report.reporterName || '',
    reporterEmail: report.reporterEmail || '',
    
    // Targets
    captureId: report.captureId || null,
    prizeId: report.prizeId || null,
    targetUserId: report.targetUserId || null,
    
    // Details
    type: report.type || 'other',
    typeLabel: typeLabels[report.type] || report.type,
    category: report.category || '',
    reason: report.reason || '',
    description: report.description || '',
    evidence: report.evidence || [],
    
    // Location
    location: report.location ? {
      lat: report.location.coordinates?.[1],
      lng: report.location.coordinates?.[0],
    } : null,
    
    // Status
    status: report.status || 'pending',
    statusLabel: statusLabels[report.status] || report.status,
    priority: report.priority || 'medium',
    priorityLabel: priorityLabels[report.priority] || report.priority,
    
    // Resolution
    resolution: report.resolution || '',
    resolvedBy: report.resolvedBy || null,
    resolvedAt: report.resolvedAt ? new Date(report.resolvedAt) : null,
    actionTaken: report.actionTaken || '',
    
    // Device
    deviceInfo: report.deviceInfo || {},
    
    // Timestamps
    createdAt: report.createdAt ? new Date(report.createdAt) : null,
    updatedAt: report.updatedAt ? new Date(report.updatedAt) : null,
  };
};

/**
 * Mapper pour les Codes (promo codes, reward codes)
 * Backend: Code model with code, poolName, rewardId, status
 */
export const mapBackendCode = (code) => {
  if (!code) return null;
  
  const statusLabels = {
    available: 'Disponible',
    reserved: 'Réservé',
    used: 'Utilisé',
    expired: 'Expiré',
    cancelled: 'Annulé'
  };
  
  return {
    id: code._id || code.id,
    code: code.code || '',
    poolName: code.poolName || '',
    rewardId: code.rewardId || null,
    
    // Promo code fields
    pointsValue: code.pointsValue || 0,
    isActive: code.isActive !== false,
    isUsed: code.isUsed === true,
    
    // Status
    status: code.status || 'available',
    statusLabel: statusLabels[code.status] || code.status,
    
    // Reservation
    reservedBy: code.reservedBy || null,
    reservedAt: code.reservedAt ? new Date(code.reservedAt) : null,
    
    // Usage
    usedBy: code.usedBy || null,
    usedAt: code.usedAt ? new Date(code.usedAt) : null,
    
    // Expiration
    expiresAt: code.expiresAt ? new Date(code.expiresAt) : null,
    isExpired: code.expiresAt ? new Date(code.expiresAt) < new Date() : false,
    
    // Metadata
    metadata: code.metadata || {},
    createdAt: code.createdAt ? new Date(code.createdAt) : null,
    updatedAt: code.updatedAt ? new Date(code.updatedAt) : null,
  };
};

/**
 * Mapper pour les AdMob Views
 * Backend: AdMobView model with adType, revenue, completion
 */
export const mapBackendAdMobView = (view) => {
  if (!view) return null;
  
  const adTypeLabels = {
    rewarded: 'Vidéo récompensée',
    interstitial: 'Interstitiel',
    banner: 'Bannière'
  };
  
  const rewardTypeLabels = {
    points: 'Points',
    xp: 'Expérience',
    powerup: 'Power-Up'
  };
  
  return {
    id: view._id || view.id,
    userId: view.userId,
    
    // Ad info
    adType: view.adType || 'rewarded',
    adTypeLabel: adTypeLabels[view.adType] || view.adType,
    adUnitId: view.adUnitId || '',
    
    // Reward
    rewardAmount: view.rewardAmount || 0,
    rewardType: view.rewardType || 'points',
    rewardTypeLabel: rewardTypeLabels[view.rewardType] || view.rewardType,
    completed: view.completed === true,
    
    // Revenue
    revenue: view.revenue || 0,
    ecpm: view.ecpm || 0,
    
    // Device & location
    deviceInfo: view.deviceInfo || {},
    location: view.location || {},
    
    // Timestamps
    viewedAt: view.viewedAt ? new Date(view.viewedAt) : null,
    rewardedAt: view.rewardedAt ? new Date(view.rewardedAt) : null,
    
    // Metadata
    metadata: view.metadata || {},
    createdAt: view.createdAt ? new Date(view.createdAt) : null,
  };
};

/**
 * Mapper pour les AR Sessions
 * Backend: ARSession model with sessionId, status, screenshots
 */
export const mapBackendARSession = (session) => {
  if (!session) return null;
  
  const statusLabels = {
    active: 'Active',
    completed: 'Terminée',
    expired: 'Expirée',
    cancelled: 'Annulée'
  };
  
  return {
    id: session._id || session.id,
    userId: session.userId,
    prizeId: session.prizeId,
    sessionId: session.sessionId || '',
    
    // Status
    status: session.status || 'active',
    statusLabel: statusLabels[session.status] || session.status,
    
    // Timeline
    startedAt: session.startedAt ? new Date(session.startedAt) : null,
    completedAt: session.completedAt ? new Date(session.completedAt) : null,
    duration: session.duration || 0,
    durationFormatted: formatDuration(session.duration || 0),
    
    // Screenshots
    screenshots: Array.isArray(session.screenshots) ? session.screenshots.map(s => ({
      url: s.url,
      timestamp: s.timestamp ? new Date(s.timestamp) : null,
      location: s.location || null,
    })) : [],
    
    // Metadata
    metadata: session.metadata || {},
    createdAt: session.createdAt ? new Date(session.createdAt) : null,
    updatedAt: session.updatedAt ? new Date(session.updatedAt) : null,
  };
};

/**
 * Mapper pour les Friendships
 * Backend: Friendship model with userId, friendId, status
 */
export const mapBackendFriendship = (friendship) => {
  if (!friendship) return null;
  
  const statusLabels = {
    pending: 'En attente',
    accepted: 'Accepté',
    rejected: 'Rejeté',
    blocked: 'Bloqué'
  };
  
  return {
    id: friendship._id || friendship.id,
    
    // Users
    userId: friendship.userId?._id || friendship.userId,
    friendId: friendship.friendId?._id || friendship.friendId,
    user: friendship.userId && typeof friendship.userId === 'object' ? mapBackendUser(friendship.userId) : null,
    friend: friendship.friendId && typeof friendship.friendId === 'object' ? mapBackendUser(friendship.friendId) : null,
    
    // Status
    status: friendship.status || 'pending',
    statusLabel: statusLabels[friendship.status] || friendship.status,
    message: friendship.message || '',
    
    // Dates
    requestedAt: friendship.requestedAt ? new Date(friendship.requestedAt) : null,
    acceptedAt: friendship.acceptedAt ? new Date(friendship.acceptedAt) : null,
    rejectedAt: friendship.rejectedAt ? new Date(friendship.rejectedAt) : null,
    blockedAt: friendship.blockedAt ? new Date(friendship.blockedAt) : null,
    
    // Timestamps
    createdAt: friendship.createdAt ? new Date(friendship.createdAt) : null,
    updatedAt: friendship.updatedAt ? new Date(friendship.updatedAt) : null,
  };
};

/**
 * Helper: Format duration in seconds to human readable
 */
const formatDuration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
};

/**
 * Helper pour mapper des tableaux
 */
export const mapArray = (array, mapper) => {
  if (!Array.isArray(array)) return [];
  return array.map(mapper).filter(Boolean);
};

export default {
  // User & session
  mapBackendUser,
  mapBackendSession,
  mapBackendAuditLog,
  
  // Prizes & claims
  mapBackendPrize,
  mapBackendCapture,
  mapBackendDistribution,
  
  // Rewards & redemptions
  mapBackendReward,
  mapBackendRedemption,
  mapBackendCode,
  
  // Achievements
  mapBackendAchievement,
  mapBackendUserAchievement,
  
  // Partners
  mapBackendPartner,
  
  // Notifications
  mapBackendNotification,
  
  // Game features
  mapBackendPowerUp,
  mapBackendARSession,
  mapBackendAdMobView,
  
  // A/B Testing & Reports
  mapBackendABTest,
  mapBackendReport,
  
  // Social
  mapBackendFriendship,
  
  // Dashboard
  mapBackendDashboardStats,
  
  // Frontend -> Backend converters
  toBackendLocation,
  toBackendUser,
  toBackendPrize,
  toBackendAchievement,
  toBackendPowerUp,
  toBackendABTest,
  mapFrontendPartner,
  
  // Helpers
  mapArray,
};
