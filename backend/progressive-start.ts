console.log('=== PROGRESSIVE START ===');
console.log('Step 1: Starting...');

async function progressiveStart() {
  try {
    console.log('Step 2: Importing config...');
    const { config } = await import('./src/config/index.js');
    console.log('✅ Config imported');
    
    console.log('Step 3: Importing logger...');
    const { logger } = await import('./src/lib/logger.js');
    console.log('✅ Logger imported');
    
    console.log('Step 4: Importing database...');
    const { connectDB, createIndexes } = await import('./src/config/database.js');
    console.log('✅ Database module imported');
    
    console.log('Step 5: Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');
    
    console.log('Step 6: Creating indexes...');
    await createIndexes();
    console.log('✅ Indexes created');
    
    console.log('Step 7: Importing Redis...');
    const { connectRedis, initializeRedisUtilities } = await import('./src/config/redis.js');
    console.log('✅ Redis module imported');
    
    console.log('Step 8: Connecting to Redis...');
    const redisClient = await connectRedis();
    console.log('✅ Redis connected');
    
    console.log('Step 9: Initializing Redis utilities...');
    initializeRedisUtilities(redisClient);
    console.log('✅ Redis utilities initialized');
    
    console.log('Step 10: Importing Fastify...');
    const Fastify = (await import('fastify')).default;
    console.log('✅ Fastify imported');
    
    console.log('Step 11: Creating Fastify server...');
    const server = Fastify({
      logger: logger,
      trustProxy: config.NODE_ENV === 'production',
      bodyLimit: 10 * 1024 * 1024,
      keepAliveTimeout: 30000,
    });
    console.log('✅ Fastify server created');
    
    console.log('Step 12: Adding health endpoint...');
    server.get('/health', async (request, reply) => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });
    console.log('✅ Health endpoint added');
    
    console.log('Step 13: Starting server...');
    await server.listen({ port: config.PORT, host: config.HOST });
    console.log(`✅ Server listening on http://${config.HOST}:${config.PORT}`);
    
    console.log('\n🎉 ALL STEPS PASSED!\n');
    
  } catch (error) {
    console.error('❌ ERROR:', error);
    process.exit(1);
  }
}

progressiveStart();

