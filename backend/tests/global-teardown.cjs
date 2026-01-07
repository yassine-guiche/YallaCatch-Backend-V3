"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = globalTeardown;
async function globalTeardown() {
    console.log('Cleaning up test environment...');
    // Stop MongoDB Memory Server
    const mongoServer = global.__MONGO_SERVER__;
    if (mongoServer) {
        await mongoServer.stop();
    }
    // Stop Redis Memory Server
    const redisServer = global.__REDIS_SERVER__;
    if (redisServer) {
        await redisServer.stop();
    }
    console.log('Test environment cleanup complete');
}
//# sourceMappingURL=global-teardown.js.map