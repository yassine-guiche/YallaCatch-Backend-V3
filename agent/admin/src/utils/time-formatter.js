/**
 * Time Formatting Utilities
 * Convert milliseconds to human-readable formats
 */

/**
 * Format milliseconds to human-readable duration
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "30 seconds", "5 minutes")
 */
export const formatDuration = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '0s';

  const seconds = Math.round(ms / 1000);
  const minutes = Math.round(ms / 60000);
  const hours = Math.round(ms / 3600000);

  if (seconds < 60) {
    return `${seconds} second${seconds !== 1 ? 's' : ''}`;
  }
  if (minutes < 60) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  const days = Math.round(ms / 86400000);
  return `${days} day${days !== 1 ? 's' : ''}`;
};

/**
 * Format milliseconds to short format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Short format (e.g., "30s", "5m", "2h")
 */
export const formatDurationShort = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '0s';

  const seconds = Math.round(ms / 1000);
  const minutes = Math.round(ms / 60000);
  const hours = Math.round(ms / 3600000);

  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.round(ms / 86400000);
  return `${days}d`;
};

/**
 * Parse duration string back to milliseconds
 * @param {string} str - Duration string (e.g., "30 seconds", "5m", "2h30m")
 * @returns {number} Duration in milliseconds
 */
export const parseDurationToMs = (str) => {
  if (!str || typeof str !== 'string') return 0;

  let totalMs = 0;
  const parts = str.toLowerCase().match(/(\d+)\s*([a-z]+)/g);

  if (!parts) return 0;

  parts.forEach((part) => {
    const match = part.match(/(\d+)\s*([a-z]+)/);
    if (!match) return;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (unit.startsWith('s')) totalMs += value * 1000; // seconds
    else if (unit.startsWith('m')) totalMs += value * 60000; // minutes
    else if (unit.startsWith('h')) totalMs += value * 3600000; // hours
    else if (unit.startsWith('d')) totalMs += value * 86400000; // days
  });

  return totalMs;
};

/**
 * Format milliseconds as time input value (for HTML inputs)
 * @param {number} ms - Duration in milliseconds
 * @returns {object} Object with value and unit for dual inputs
 */
export const formatDurationForInput = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) {
    return { value: 0, unit: 'seconds' };
  }

  const seconds = Math.round(ms / 1000);
  const minutes = Math.round(ms / 60000);
  const hours = Math.round(ms / 3600000);
  const days = Math.round(ms / 86400000);

  if (seconds < 60) {
    return { value: seconds, unit: 'seconds' };
  }
  if (minutes < 60) {
    return { value: minutes, unit: 'minutes' };
  }
  if (hours < 24) {
    return { value: hours, unit: 'hours' };
  }

  return { value: days, unit: 'days' };
};

/**
 * Convert duration input to milliseconds
 * @param {number} value - Numeric value
 * @param {string} unit - Time unit (seconds, minutes, hours, days)
 * @returns {number} Duration in milliseconds
 */
export const durationToMs = (value, unit) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;

  const unitMap = {
    seconds: 1000,
    minutes: 60000,
    hours: 3600000,
    days: 86400000,
  };

  return num * (unitMap[unit] || unitMap.seconds);
};

export default {
  formatDuration,
  formatDurationShort,
  parseDurationToMs,
  formatDurationForInput,
  durationToMs,
};
