const validateUser = (userData) => {
  const errors = [];

  // Validate required fields
  if (!userData.name || typeof userData.name !== 'string' || userData.name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  if (!userData.email || typeof userData.email !== 'string' || !isValidEmail(userData.email)) {
    errors.push('Valid email is required');
  }

  // Validate optional fields with constraints
  if (userData.phone && (typeof userData.phone !== 'string' || !/^\+?[\d\s\-()]{10,}$/.test(userData.phone))) {
    errors.push('Phone number must be a valid format');
  }

  if (userData.city && typeof userData.city !== 'string') {
    errors.push('City must be a string');
  }

  if (userData.level && !['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'].includes(userData.level)) {
    errors.push('Level must be one of: Bronze, Silver, Gold, Platinum, Diamond');
  }

  if (userData.status && !['active', 'inactive', 'banned'].includes(userData.status)) {
    errors.push('Status must be one of: active, inactive, banned');
  }

  if (userData.totalPoints !== undefined && (typeof userData.totalPoints !== 'number' || userData.totalPoints < 0)) {
    errors.push('Total points must be a non-negative number');
  }

  if (userData.availablePoints !== undefined && (typeof userData.availablePoints !== 'number' || userData.availablePoints < 0)) {
    errors.push('Available points must be a non-negative number');
  }

  if (userData.prizesClaimed !== undefined && (typeof userData.prizesClaimed !== 'number' || userData.prizesClaimed < 0)) {
    errors.push('Prizes claimed must be a non-negative number');
  }

  if (userData.lastActive && !isValidDate(userData.lastActive)) {
    errors.push('Last active must be a valid date');
  }

  if (userData.joinedAt && !isValidDate(userData.joinedAt)) {
    errors.push('Joined at must be a valid date');
  }

  if (userData.isActive !== undefined && typeof userData.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  if (userData.isBanned !== undefined && typeof userData.isBanned !== 'boolean') {
    errors.push('isBanned must be a boolean');
  }

  if (userData.totalPointsEarned !== undefined && (typeof userData.totalPointsEarned !== 'number' || userData.totalPointsEarned < 0)) {
    errors.push('Total points earned must be a non-negative number');
  }

  if (userData.totalPointsSpent !== undefined && (typeof userData.totalPointsSpent !== 'number' || userData.totalPointsSpent < 0)) {
    errors.push('Total points spent must be a non-negative number');
  }

  if (userData.prizesCaptured !== undefined && (typeof userData.prizesCaptured !== 'number' || userData.prizesCaptured < 0)) {
    errors.push('Prizes captured must be a non-negative number');
  }

  if (userData.rewardsRedeemed !== undefined && (typeof userData.rewardsRedeemed !== 'number' || userData.rewardsRedeemed < 0)) {
    errors.push('Rewards redeemed must be a non-negative number');
  }

  if (userData.displayName && typeof userData.displayName !== 'string') {
    errors.push('Display name must be a string');
  }

  if (userData.referralCode && typeof userData.referralCode !== 'string') {
    errors.push('Referral code must be a string');
  }

  if (userData.createdAt && !isValidDate(userData.createdAt)) {
    errors.push('Created at must be a valid date');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validatePrize = (prizeData) => {
  const errors = [];

  // Validate required fields
  if (!prizeData.name || typeof prizeData.name !== 'string' || prizeData.name.trim().length === 0) {
    errors.push('Prize name is required and must be a non-empty string');
  }

  if (!prizeData.description || typeof prizeData.description !== 'string') {
    errors.push('Prize description is required and must be a string');
  }

  if (prizeData.pointsReward === undefined && prizeData.pointsRequired === undefined) {
    errors.push('Either pointsReward or pointsRequired must be provided');
  }

  if (prizeData.pointsReward !== undefined && (typeof prizeData.pointsReward !== 'number' || prizeData.pointsReward < 0)) {
    errors.push('Points reward must be a non-negative number');
  }

  if (prizeData.pointsRequired !== undefined && (typeof prizeData.pointsRequired !== 'number' || prizeData.pointsRequired < 0)) {
    errors.push('Points required must be a non-negative number');
  }

  if (prizeData.quantity === undefined || typeof prizeData.quantity !== 'number' || prizeData.quantity <= 0) {
    errors.push('Quantity must be a positive number');
  }

  // Validate optional fields
  if (prizeData.type && !['physical', 'digital', 'voucher', 'mystery'].includes(prizeData.type)) {
    errors.push('Type must be one of: physical, digital, voucher, mystery');
  }

  if (prizeData.category && typeof prizeData.category !== 'string') {
    errors.push('Category must be a string');
  }

  if (prizeData.imageUrl && typeof prizeData.imageUrl !== 'string') {
    errors.push('Image URL must be a string');
  }

  if (prizeData.value !== undefined && (typeof prizeData.value !== 'number' || prizeData.value < 0)) {
    errors.push('Value must be a non-negative number');
  }

  if (prizeData.available !== undefined && typeof prizeData.available !== 'number') {
    errors.push('Available must be a number');
  }

  if (prizeData.isActive !== undefined && typeof prizeData.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  if (prizeData.isFeatured !== undefined && typeof prizeData.isFeatured !== 'boolean') {
    errors.push('isFeatured must be a boolean');
  }

  if (prizeData.capturedCount !== undefined && typeof prizeData.capturedCount !== 'number') {
    errors.push('capturedCount must be a number');
  }

  if (prizeData.viewCount !== undefined && typeof prizeData.viewCount !== 'number') {
    errors.push('viewCount must be a number');
  }

  if (prizeData.zone && typeof prizeData.zone === 'object') {
    if (prizeData.zone.value && typeof prizeData.zone.value !== 'string') {
      errors.push('Zone value must be a string');
    }
    if (prizeData.zone.coordinates) {
      if (typeof prizeData.zone.coordinates !== 'object' ||
        typeof prizeData.zone.coordinates.lat !== 'number' ||
        typeof prizeData.zone.coordinates.lng !== 'number') {
        errors.push('Zone coordinates must have numeric lat and lng properties');
      }
    }
  }

  if (prizeData.tags !== undefined && !Array.isArray(prizeData.tags)) {
    errors.push('Tags must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateReward = (rewardData) => {
  const errors = [];

  // Validate required fields
  if (!rewardData.name || typeof rewardData.name !== 'string' || rewardData.name.trim().length === 0) {
    errors.push('Reward name is required and must be a non-empty string');
  }

  if (!rewardData.description || typeof rewardData.description !== 'string') {
    errors.push('Reward description is required and must be a string');
  }

  if (rewardData.pointsRequired === undefined || typeof rewardData.pointsRequired !== 'number' || rewardData.pointsRequired < 0) {
    errors.push('Points required must be a non-negative number');
  }

  if (rewardData.quantity === undefined || typeof rewardData.quantity !== 'number' || rewardData.quantity < 0) {
    errors.push('Quantity must be a non-negative number');
  }

  // Validate optional fields
  if (rewardData.type && !['voucher', 'physical', 'digital'].includes(rewardData.type)) {
    errors.push('Type must be one of: voucher, physical, digital');
  }

  if (rewardData.category && typeof rewardData.category !== 'string') {
    errors.push('Category must be a string');
  }

  if (rewardData.imageUrl && typeof rewardData.imageUrl !== 'string') {
    errors.push('Image URL must be a string');
  }

  if (rewardData.value !== undefined && (typeof rewardData.value !== 'number' || rewardData.value < 0)) {
    errors.push('Value must be a non-negative number');
  }

  if (rewardData.provider && typeof rewardData.provider !== 'string') {
    errors.push('Provider must be a string');
  }

  if (rewardData.validityPeriod !== undefined && (typeof rewardData.validityPeriod !== 'number' || rewardData.validityPeriod < 0)) {
    errors.push('Validity period must be a non-negative number');
  }

  if (rewardData.isActive !== undefined && typeof rewardData.isActive !== 'boolean') {
    errors.push('isActive must be a boolean');
  }

  if (rewardData.available !== undefined && typeof rewardData.available !== 'number') {
    errors.push('Available must be a number');
  }

  if (rewardData.redeemedCount !== undefined && typeof rewardData.redeemedCount !== 'number') {
    errors.push('Redeemed count must be a number');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateCapture = (captureData) => {
  const errors = [];

  // Validate required fields
  if (!captureData.userId || typeof captureData.userId !== 'string' || captureData.userId.trim().length === 0) {
    errors.push('User ID is required and must be a non-empty string');
  }

  if (!captureData.prizeId || typeof captureData.prizeId !== 'string' || captureData.prizeId.trim().length === 0) {
    errors.push('Prize ID is required and must be a non-empty string');
  }

  if (!captureData.captureTime || !isValidDate(captureData.captureTime)) {
    errors.push('Capture time is required and must be a valid date');
  }

  // Validate optional fields
  if (captureData.location && typeof captureData.location !== 'string') {
    errors.push('Location must be a string');
  }

  if (captureData.pointsEarned !== undefined && (typeof captureData.pointsEarned !== 'number' || captureData.pointsEarned < 0)) {
    errors.push('Points earned must be a non-negative number');
  }

  if (captureData.prizeValue !== undefined && (typeof captureData.prizeValue !== 'number' || captureData.prizeValue < 0)) {
    errors.push('Prize value must be a non-negative number');
  }

  if (captureData.isRedeemed !== undefined && typeof captureData.isRedeemed !== 'boolean') {
    errors.push('isRedeemed must be a boolean');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateRedemption = (redemptionData) => {
  const errors = [];

  // Validate required fields
  if (!redemptionData.userId || typeof redemptionData.userId !== 'string' || redemptionData.userId.trim().length === 0) {
    errors.push('User ID is required and must be a non-empty string');
  }

  if (!redemptionData.rewardId || typeof redemptionData.rewardId !== 'string' || redemptionData.rewardId.trim().length === 0) {
    errors.push('Reward ID is required and must be a non-empty string');
  }

  if (!redemptionData.redemptionTime || !isValidDate(redemptionData.redemptionTime)) {
    errors.push('Redemption time is required and must be a valid date');
  }

  if (!redemptionData.status || !['pending', 'completed', 'cancelled'].includes(redemptionData.status)) {
    errors.push('Status must be one of: pending, completed, cancelled');
  }

  // Validate optional fields
  if (redemptionData.pointsUsed !== undefined && (typeof redemptionData.pointsUsed !== 'number' || redemptionData.pointsUsed < 0)) {
    errors.push('Points used must be a non-negative number');
  }

  if (redemptionData.value !== undefined && (typeof redemptionData.value !== 'number' || redemptionData.value < 0)) {
    errors.push('Value must be a non-negative number');
  }

  if (redemptionData.redeemedByAdmin !== undefined && typeof redemptionData.redeemedByAdmin !== 'boolean') {
    errors.push('redeemedByAdmin must be a boolean');
  }

  if (redemptionData.trackingNumber && typeof redemptionData.trackingNumber !== 'string') {
    errors.push('Tracking number must be a string');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// Helper functions
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidDate = (dateString) => {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
};

// Export validation functions
export {
  validateUser,
  validatePrize,
  validateReward,
  validateCapture,
  validateRedemption
};