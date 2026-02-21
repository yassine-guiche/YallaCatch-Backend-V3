/**
 * Marketplace Form Validation Schema
 * Ensures consistency between admin forms and backend validation
 * Pure JavaScript implementation (no external dependencies)
 */

const VALID_CATEGORIES = ['voucher', 'gift_card', 'physical', 'digital', 'experience'];

/**
 * Validate marketplace item data
 * @param {object} data - Form data to validate
 * @returns {object} {isValid: boolean, errors: object}
 */
export const validateMarketplaceItem = (data) => {
  const errors = {};

  // Name validation
  if (!data.name || typeof data.name !== 'string') {
    errors.name = 'Item name is required';
  } else {
    const trimmed = data.name.trim();
    if (trimmed.length === 0) {
      errors.name = 'Item name is required';
    } else if (trimmed.length > 100) {
      errors.name = 'Item name cannot exceed 100 characters';
    }
  }

  // Description validation
  if (!data.description || typeof data.description !== 'string') {
    errors.description = 'Description is required';
  } else {
    const trimmed = data.description.trim();
    if (trimmed.length === 0) {
      errors.description = 'Description is required';
    } else if (trimmed.length > 500) {
      errors.description = 'Description cannot exceed 500 characters';
    }
  }

  // Category validation
  if (!data.category) {
    errors.category = 'Category is required';
  } else if (!VALID_CATEGORIES.includes(data.category)) {
    errors.category = 'Valid category is required';
  }

  // Points cost validation
  if (data.pointsCost === undefined || data.pointsCost === null) {
    errors.pointsCost = 'Points cost is required';
  } else {
    const cost = Number(data.pointsCost);
    if (!Number.isFinite(cost)) {
      errors.pointsCost = 'Points cost must be a number';
    } else if (!Number.isInteger(cost)) {
      errors.pointsCost = 'Points cost must be a whole number';
    } else if (cost < 1) {
      errors.pointsCost = 'Points cost must be at least 1';
    } else if (cost > 999999) {
      errors.pointsCost = 'Points cost cannot exceed 999,999';
    }
  }

  // Stock quantity validation
  if (data.stockQuantity === undefined || data.stockQuantity === null) {
    errors.stockQuantity = 'Stock quantity is required';
  } else {
    const qty = Number(data.stockQuantity);
    if (!Number.isFinite(qty)) {
      errors.stockQuantity = 'Stock quantity must be a number';
    } else if (!Number.isInteger(qty)) {
      errors.stockQuantity = 'Stock quantity must be a whole number';
    } else if (qty < 0) {
      errors.stockQuantity = 'Stock quantity cannot be negative';
    } else if (qty > 999999) {
      errors.stockQuantity = 'Stock quantity cannot exceed 999,999';
    }
  }

  // Stock available validation
  if (data.stockAvailable === undefined || data.stockAvailable === null) {
    errors.stockAvailable = 'Available stock is required';
  } else {
    const avail = Number(data.stockAvailable);
    if (!Number.isFinite(avail)) {
      errors.stockAvailable = 'Available stock must be a number';
    } else if (!Number.isInteger(avail)) {
      errors.stockAvailable = 'Available stock must be a whole number';
    } else if (avail < 0) {
      errors.stockAvailable = 'Available stock cannot be negative';
    } else if (avail > 999999) {
      errors.stockAvailable = 'Available stock cannot exceed 999,999';
    } else if (avail > Number(data.stockQuantity || 0)) {
      errors.stockAvailable = 'Available stock cannot exceed total quantity';
    }
  }

  // Image URL validation
  if (data.imageUrl && typeof data.imageUrl === 'string' && data.imageUrl.trim()) {
    if (!isValidUrl(data.imageUrl)) {
      errors.imageUrl = 'Image URL must be valid';
    }
  }

  // Sponsored data validation
  if (data.isSponsored) {
    if (!data.partnerId || typeof data.partnerId !== 'string') {
      errors.partnerId = 'Partner is required when item is sponsored';
    }
    if (!data.sponsorName || typeof data.sponsorName !== 'string') {
      errors.sponsorName = 'Sponsor name is required when item is sponsored';
    }
    if (data.sponsorLogo && typeof data.sponsorLogo === 'string' && data.sponsorLogo.trim()) {
      if (!isValidUrl(data.sponsorLogo)) {
        errors.sponsorLogo = 'Sponsor logo must be a valid URL';
      }
    }
    if (data.sponsorNotes && typeof data.sponsorNotes === 'string' && data.sponsorNotes.length > 500) {
      errors.sponsorNotes = 'Sponsor notes cannot exceed 500 characters';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    data: Object.keys(errors).length === 0 ? data : null,
    errors,
  };
};

/**
 * Helper: Check if string is valid URL or relative path
 * @param {string} str - URL or path to validate
 * @returns {boolean}
 */
function isValidUrl(str) {
  if (!str || typeof str !== 'string') return false;

  // Allow relative paths starting with /
  if (str.startsWith('/')) return true;

  // Allow common image file extensions if they look like paths
  if (/\.(jpg|jpeg|png|gif|webp|svg)/i.test(str) && !str.includes(' ')) return true;

  try {
    new URL(str);
    return true;
  } catch {
    // Check if it's a data URL
    if (str.startsWith('data:image/')) return true;
    return false;
  }
}
/**
 * Get field-specific error messages
 * @param {string} fieldName - Name of the field
 * @param {object} errors - Validation errors object
 * @returns {string|null} Error message or null
 */
export const getFieldError = (fieldName, errors) => {
  return errors[fieldName] || null;
};

/**
 * Check if stock is valid
 * @param {number} available - Available stock
 * @param {number} quantity - Total quantity
 * @returns {boolean} True if valid
 */
export const isStockValid = (available, quantity) => {
  return (
    Number.isFinite(available) &&
    Number.isFinite(quantity) &&
    available >= 0 &&
    quantity >= 0 &&
    available <= quantity
  );
};

/**
 * Check if sponsored data is complete
 * @param {object} data - Form data
 * @returns {boolean} True if valid
 */
export const isSponsoredDataValid = (data) => {
  if (!data.isSponsored) return true;
  return !!(data.partnerId && data.sponsorName);
};

export default {
  validateMarketplaceItem,
  getFieldError,
  isStockValid,
  isSponsoredDataValid,
};
