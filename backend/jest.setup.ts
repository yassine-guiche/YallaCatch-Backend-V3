import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// Default env vars for testing if not set
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/yallacatch-test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.JWT_PRIVATE_KEY_BASE64 = process.env.JWT_PRIVATE_KEY_BASE64 || 'c29tZXJhbmRvbWJhc2U2NHN0cmluZ2ZvcnRlc3Rpbmc=';
process.env.JWT_PUBLIC_KEY_BASE64 = process.env.JWT_PUBLIC_KEY_BASE64 || 'c29tZXJhbmRvbWJhc2U2NHN0cmluZ2ZvcnRlc3Rpbmc=';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'supersecretlongstringfortestingpurposesmin32chars';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // 32 chars
