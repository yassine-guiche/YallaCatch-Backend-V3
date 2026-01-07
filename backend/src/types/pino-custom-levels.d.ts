import pino from 'pino';

// Extend Pino's Logger interface to include custom log levels
declare module 'pino' {
  interface Logger<CustomLevels extends string = never> {
    audit: LogFn;
    security: LogFn;
    performance: LogFn;
  }
}