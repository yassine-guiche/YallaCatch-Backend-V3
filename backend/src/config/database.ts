import mongoose from 'mongoose';
import { config, isProduction, isTest } from './index';
import { typedLogger } from '@/lib/typed-logger';

// MongoDB connection options
const mongoOptions: mongoose.ConnectOptions = {
  maxPoolSize: isProduction ? 50 : 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  family: 4, // Use IPv4, skip trying IPv6
  bufferCommands: false,
  retryWrites: true,
  retryReads: true,
  readPreference: 'primary',
  writeConcern: {
    w: 'majority',
    j: true,
    wtimeout: 5000,
  },
};

// Connection state management
let isConnected = false;
let connectionPromise: Promise<typeof mongoose> | null = null;

/**
 * Connect to MongoDB with retry logic
 */
export const connectDB = async (): Promise<typeof mongoose> => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = isTest && config.MONGODB_TEST_URI ? config.MONGODB_TEST_URI : config.MONGODB_URI;

  connectionPromise = mongoose.connect(uri, mongoOptions);

  try {
    const connection = await connectionPromise;
    isConnected = true;
    
    typedLogger.info('MongoDB connected successfully', {
      host: connection.connection.host,
      port: connection.connection.port,
      database: connection.connection.name,
      readyState: connection.connection.readyState,
    });

    // Set up connection event listeners
    setupConnectionListeners();

    return connection;
  } catch (error) {
    isConnected = false;
    connectionPromise = null;
    typedLogger.error('MongoDB connection failed', { error: (error as any).message });
    throw error;
  }
};

/**
 * Disconnect from MongoDB
 */
export const disconnectDB = async (): Promise<void> => {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    connectionPromise = null;
    typedLogger.info('MongoDB disconnected successfully');
  } catch (error) {
    typedLogger.error('Error disconnecting from MongoDB', { error: (error as any).message });
    throw error;
  }
};

/**
 * Setup MongoDB connection event listeners
 */
const setupConnectionListeners = (): void => {
  const connection = mongoose.connection;

  connection.on('connected', () => {
    typedLogger.info('MongoDB connection established');
  });

  connection.on('error', (error) => {
    typedLogger.error('MongoDB connection error', { error: (error as any).message });
    isConnected = false;
  });

  connection.on('disconnected', () => {
    typedLogger.warn('MongoDB disconnected');
    isConnected = false;
  });

  connection.on('reconnected', () => {
    typedLogger.info('MongoDB reconnected');
    isConnected = true;
  });

  connection.on('close', () => {
    typedLogger.info('MongoDB connection closed');
    isConnected = false;
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    try {
      await disconnectDB();
      process.exit(0);
    } catch (error) {
      typedLogger.error('Error during graceful shutdown', { error: (error as any).message });
      process.exit(1);
    }
  });
};

/**
 * Create database indexes for optimal performance
 */
export const createIndexes = async (): Promise<void> => {
  try {
    const db = mongoose.connection.db;
    
    // User indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true, sparse: true });
    await db.collection('users').createIndex({ 'devices.deviceId': 1 });
    await db.collection('users').createIndex({ lastActive: -1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    await db.collection('users').createIndex({ 'location.city': 1 });
    await db.collection('users').createIndex({ level: 1 });
    await db.collection('users').createIndex({ 'points.total': -1 });

    // Prize indexes
    await db.collection('prizes').createIndex({ 'location.coordinates': '2dsphere' });
    await db.collection('prizes').createIndex({ status: 1, 'visibility.startAt': 1, 'visibility.endAt': 1 });
    await db.collection('prizes').createIndex({ 'location.city': 1, status: 1 });
    await db.collection('prizes').createIndex({ createdAt: -1 });
    await db.collection('prizes').createIndex({ rarity: 1 });
    await db.collection('prizes').createIndex({ category: 1 });
    await db.collection('prizes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Claim indexes
    await db.collection('claims').createIndex({ userId: 1, claimedAt: -1 });
    await db.collection('claims').createIndex({ prizeId: 1 });
    await db.collection('claims').createIndex({ claimedAt: -1 });
    await db.collection('claims').createIndex({ idempotencyKey: 1 }, { unique: true, expireAfterSeconds: 600 });

    // Reward indexes
    await db.collection('rewards').createIndex({ category: 1, isActive: 1 });
    await db.collection('rewards').createIndex({ pointsCost: 1 });
    await db.collection('rewards').createIndex({ isPopular: 1, isActive: 1 });
    await db.collection('rewards').createIndex({ createdAt: -1 });

    // Redemption indexes
    await db.collection('redemptions').createIndex({ userId: 1, redeemedAt: -1 });
    await db.collection('redemptions').createIndex({ rewardId: 1 });
    await db.collection('redemptions').createIndex({ status: 1 });
    await db.collection('redemptions').createIndex({ redeemedAt: -1 });
    await db.collection('redemptions').createIndex({ idempotencyKey: 1 }, { unique: true, expireAfterSeconds: 600 });

    // Notification indexes
    await db.collection('notifications').createIndex({ targetType: 1, targetValue: 1 });
    await db.collection('notifications').createIndex({ status: 1, scheduledFor: 1 });
    await db.collection('notifications').createIndex({ createdAt: -1 });

    // Analytics indexes
    await db.collection('analytics').createIndex({ date: -1 });
    await db.collection('analytics').createIndex({ generatedAt: -1 });

    // Distribution indexes
    await db.collection('distributions').createIndex({ status: 1 });
    await db.collection('distributions').createIndex({ createdBy: 1, createdAt: -1 });
    await db.collection('distributions').createIndex({ undoExpiresAt: 1 }, { expireAfterSeconds: 0 });

    // Code indexes
    await db.collection('codes').createIndex({ poolName: 1, status: 1 });
    await db.collection('codes').createIndex({ code: 1 }, { unique: true });
    await db.collection('codes').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Session indexes
    await db.collection('sessions').createIndex({ userId: 1 });
    await db.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

    // Audit log indexes
    await db.collection('auditlogs').createIndex({ userId: 1, timestamp: -1 });
    await db.collection('auditlogs').createIndex({ action: 1, timestamp: -1 });
    await db.collection('auditlogs').createIndex({ timestamp: -1 });

    typedLogger.info('Database indexes created successfully');
  } catch (error) {
    typedLogger.error('Error creating database indexes', { error: (error as any).message });
    throw error;
  }
};

/**
 * Get database connection status
 */
export const getConnectionStatus = () => {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    host: (mongoose.connection as any).host,
    port: (mongoose.connection as any).port,
    name: (mongoose.connection as any).name,
  };
};

/**
 * Health check for database
 */
export const healthCheck = async (): Promise<boolean> => {
  try {
    if (!isConnected || mongoose.connection.readyState !== 1) {
      return false;
    }

    // Ping the database
    await mongoose.connection.db.admin().ping();
    return true;
  } catch (error) {
    typedLogger.error('Database health check failed', { error: (error as any).message });
    return false;
  }
};
