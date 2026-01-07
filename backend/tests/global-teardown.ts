export default async function globalTeardown() {
  console.log('Cleaning up test environment...');

  // Stop MongoDB Memory Server
  const mongoServer = (global as any).__MONGO_SERVER__;
  if (mongoServer) {
    await mongoServer.stop();
  }

  // Stop Redis Memory Server
  const redisServer = (global as any).__REDIS_SERVER__;
  if (redisServer) {
    await redisServer.stop();
  }

  console.log('Test environment cleanup complete');
}
