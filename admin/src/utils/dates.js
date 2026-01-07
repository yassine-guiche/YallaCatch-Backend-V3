/**
 * YallaCatch! Date Utilities
 * Utilitaires pour formater et manipuler les dates
 */

/**
 * Formater une date au format français
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  const defaultOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return new Intl.DateTimeFormat('fr-FR', defaultOptions).format(d);
};

/**
 * Formater une date courte (sans heure)
 */
export const formatDateShort = (date) => {
  return formatDate(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Formater une heure
 */
export const formatTime = (date) => {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
};

/**
 * Formater une date relative (il y a X minutes/heures/jours)
 */
export const formatRelativeDate = (date) => {
  if (!date) return '-';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '-';
  
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);
  
  if (diffSec < 60) {
    return 'À l\'instant';
  } else if (diffMin < 60) {
    return `Il y a ${diffMin} minute${diffMin > 1 ? 's' : ''}`;
  } else if (diffHour < 24) {
    return `Il y a ${diffHour} heure${diffHour > 1 ? 's' : ''}`;
  } else if (diffDay < 7) {
    return `Il y a ${diffDay} jour${diffDay > 1 ? 's' : ''}`;
  } else if (diffWeek < 4) {
    return `Il y a ${diffWeek} semaine${diffWeek > 1 ? 's' : ''}`;
  } else if (diffMonth < 12) {
    return `Il y a ${diffMonth} mois`;
  } else {
    return `Il y a ${diffYear} an${diffYear > 1 ? 's' : ''}`;
  }
};

/**
 * Formater une durée en secondes
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '0s';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
};

/**
 * Vérifier si une date est aujourd'hui
 */
export const isToday = (date) => {
  if (!date) return false;
  
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

/**
 * Vérifier si une date est dans le passé
 */
export const isPast = (date) => {
  if (!date) return false;
  
  const d = typeof date === 'string' ? new Date(date) : date;
  return d < new Date();
};

/**
 * Vérifier si une date est dans le futur
 */
export const isFuture = (date) => {
  if (!date) return false;
  
  const d = typeof date === 'string' ? new Date(date) : date;
  return d > new Date();
};

/**
 * Obtenir le début de la journée
 */
export const startOfDay = (date = new Date()) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Obtenir la fin de la journée
 */
export const endOfDay = (date = new Date()) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Ajouter des jours à une date
 */
export const addDays = (date, days) => {
  const d = typeof date === 'string' ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Soustraire des jours à une date
 */
export const subtractDays = (date, days) => {
  return addDays(date, -days);
};

/**
 * Obtenir une plage de dates (7 derniers jours, 30 derniers jours, etc.)
 */
export const getDateRange = (period) => {
  const end = new Date();
  let start;
  
  switch (period) {
    case '24h':
    case 'day':
      start = subtractDays(end, 1);
      break;
    case '7d':
    case 'week':
      start = subtractDays(end, 7);
      break;
    case '30d':
    case 'month':
      start = subtractDays(end, 30);
      break;
    case '90d':
    case 'quarter':
      start = subtractDays(end, 90);
      break;
    case '365d':
    case 'year':
      start = subtractDays(end, 365);
      break;
    default:
      start = subtractDays(end, 7);
  }
  
  return { start, end };
};

/**
 * Formater une date pour un input datetime-local
 */
export const toDateTimeLocal = (date) => {
  if (!date) return '';
  
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

/**
 * Parser une date depuis un input datetime-local
 */
export const fromDateTimeLocal = (value) => {
  if (!value) return null;
  return new Date(value);
};

export default {
  formatDate,
  formatDateShort,
  formatTime,
  formatRelativeDate,
  formatDuration,
  isToday,
  isPast,
  isFuture,
  startOfDay,
  endOfDay,
  addDays,
  subtractDays,
  getDateRange,
  toDateTimeLocal,
  fromDateTimeLocal,
};

