import { logger } from './logger';

/**
 * Typed logger wrapper that handles Pino's strict typing
 * This wrapper allows passing objects without type errors
 */

export const typedLogger = {
  info: (message: string, data?: Record<string, any>) => {
    if (data) {
      logger.info(data as any, message);
    } else {
      logger.info(message);
    }
  },

  error: (message: string, data?: Record<string, any>) => {
    if (data) {
      logger.error(data as any, message);
    } else {
      logger.error(message);
    }
  },

  warn: (message: string, data?: Record<string, any>) => {
    if (data) {
      logger.warn(data as any, message);
    } else {
      logger.warn(message);
    }
  },

  debug: (message: string, data?: Record<string, any>) => {
    if (data) {
      logger.debug(data as any, message);
    } else {
      logger.debug(message);
    }
  },

  // Custom levels
  audit: (message: string, data?: Record<string, any>) => {
    if (data) {
      (logger as any).audit(data, message);
    } else {
      (logger as any).audit(message);
    }
  },

  security: (message: string, data?: Record<string, any>) => {
    if (data) {
      (logger as any).security(data, message);
    } else {
      (logger as any).security(message);
    }
  },

  performance: (message: string, data?: Record<string, any>) => {
    if (data) {
      (logger as any).performance(data, message);
    } else {
      (logger as any).performance(message);
    }
  },
};

export default typedLogger;

