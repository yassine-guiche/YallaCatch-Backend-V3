import { MongoMemoryServer } from 'mongodb-memory-server';

export default async function globalSetup() {
  console.log('Setting up test environment...');

  // Start MongoDB Memory Server
  const mongoServer = await MongoMemoryServer.create({
    binary: {
      version: '6.0.0',
    },
    instance: {
      dbName: 'yallacatch_test_global',
    },
  });

  const mongoUri = mongoServer.getUri();
  
  // Use mock Redis for tests
  const redisHost = 'localhost';
  const redisPort = 6379;

  // Store server instances and connection info globally
  (global as any).__MONGO_SERVER__ = mongoServer;
  (global as any).__MONGO_URI__ = mongoUri;
  (global as any).__REDIS_HOST__ = redisHost;
  (global as any).__REDIS_PORT__ = redisPort;

  // Set environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongoUri;
  process.env.REDIS_URL = `redis://${redisHost}:${redisPort}`;
  
  // Set test JWT keys
  process.env.JWT_PRIVATE_KEY_BASE64 = Buffer.from(TEST_PRIVATE_KEY).toString('base64');
  process.env.JWT_PUBLIC_KEY_BASE64 = Buffer.from(TEST_PUBLIC_KEY).toString('base64');
  
  // Disable external services in test
  process.env.DISABLE_FIREBASE = 'true';
  process.env.DISABLE_AWS = 'true';
  process.env.DISABLE_TWILIO = 'true';
  process.env.DISABLE_SMTP = 'true';
  
  console.log('Test environment setup complete');
}

// Test RSA key pair
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7VJTUt9Us8cKB
UOoZjd2MCEfQxWCWYfh+WieMg3a3Jm4OuSXo+A2GjzAO73fcBE6f5JJjBdqE1jK
7+geqkmjIXiJz5r4+kXGSS2ZDpNt+puadKNcpd1N6hzuoaKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK
KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKwIDAQAB
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1L7VLPHCgVDqGY3d
jAhH0MVglmH4flYnjIN2tyZuDrkl6PgNho8wDu933AROl+SSYwXahNYyu/oHqpJo
yF4ic+a+PpFxkktmQ6TbfqbmnSjXKXdTeoc7qGiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii
QIDAQAB
-----END PUBLIC KEY-----`;
