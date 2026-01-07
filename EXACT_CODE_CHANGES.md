# 📝 EXACT CODE CHANGES MADE

**File:** `backend/src/modules/game/index.ts`  
**Date:** December 13, 2025  
**Status:** ✅ Implemented & Verified

---

## CHANGE #1: Added Imports

### Location: Lines 1-13

```typescript
// BEFORE (Lines 1-11)
import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { logger } from '@/lib/logger';
import typedLogger from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
 import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
 import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';

// AFTER (Lines 1-13)
import { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate } from '@/middleware/auth';
import { z } from 'zod';
import { User } from '@/models/User';
import { Prize } from '@/models/Prize';
import { Claim } from '@/models/Claim';
import { Settings } from '@/models/Settings';                               // ← NEW
import { logger } from '@/lib/logger';
import typedLogger from '@/lib/typed-logger';
import { redisClient } from '@/config/redis';
import { CaptureService } from '@/modules/capture/routes';                 // ← NEW
import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';

// CHANGES:
// + Added: import { Settings } from '@/models/Settings';
// + Added: import { CaptureService } from '@/modules/capture/routes';
```

---

## CHANGE #2: Added Capture Schemas

### Location: After existing schemas (Lines ~75-110)

```typescript
// BEFORE: (Existing schemas)
const GameSessionSchema = z.object({ /* ... */ });
const LocationUpdateSchema = z.object({ /* ... */ });
const PowerUpUsageSchema = z.object({
  powerUpId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)})});

export class GameService {

// AFTER: (New schemas added)
const GameSessionSchema = z.object({ /* ... */ });
const LocationUpdateSchema = z.object({ /* ... */ });
const PowerUpUsageSchema = z.object({
  powerUpId: z.string(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)})});

// Capture attempt schema (CRITICAL for prize capture flow)              // ← NEW
const CaptureAttemptSchema = z.object({                                   // ← NEW
  prizeId: z.string(),                                                    // ← NEW
  location: z.object({                                                    // ← NEW
    latitude: z.number().min(-90).max(90),                                // ← NEW
    longitude: z.number().min(-180).max(180),                             // ← NEW
    accuracy: z.number().min(0).max(1000).optional(),                     // ← NEW
    altitude: z.number().optional()                                       // ← NEW
  }),                                                                      // ← NEW
  deviceInfo: z.object({                                                  // ← NEW
    platform: z.enum(['iOS', 'Android']),                                 // ← NEW
    deviceModel: z.string(),                                              // ← NEW
    osVersion: z.string().optional(),                                     // ← NEW
    appVersion: z.string().optional(),                                    // ← NEW
    timestamp: z.string().datetime().optional()                           // ← NEW
  }).optional(),                                                          // ← NEW
  captureMethod: z.enum(['tap', 'gesture', 'voice']).default('tap')       // ← NEW
});                                                                        // ← NEW

// Capture validation schema                                              // ← NEW
const CaptureValidationSchema = z.object({                                // ← NEW
  prizeId: z.string(),                                                    // ← NEW
  location: z.object({                                                    // ← NEW
    latitude: z.number().min(-90).max(90),                                // ← NEW
    longitude: z.number().min(-180).max(180)                              // ← NEW
  })                                                                       // ← NEW
});                                                                        // ← NEW

export class GameService {
```

---

## CHANGE #3: Updated getDailyChallenges() Method

### Location: Lines ~482-502 (static method in GameService)

```typescript
// BEFORE:
static async getDailyChallenges(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const challengeKey = `challenges:${userId}:${today}`;
    
    // Check if challenges already exist for today
    let challenges = await this.redis.get(challengeKey);

    if (!challenges) {
      // Generate new daily challenges
      const newChallenges = this.generateDailyChallenges(userId);  // ← SYNC (no await)
      await this.redis.setex(challengeKey, 86400, JSON.stringify(newChallenges));
      return newChallenges;
    } else {
      return JSON.parse(challenges);
    }
  } catch (error) {
    typedLogger.error('Get daily challenges error', { error: (error as any).message, userId });
    throw error;
  }
}

// AFTER:
static async getDailyChallenges(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const challengeKey = `challenges:${userId}:${today}`;
    
    // Check if challenges already exist for today
    let challenges = await this.redis.get(challengeKey);

    if (!challenges) {
      // Generate new daily challenges (now reads from Settings)
      const newChallenges = await this.generateDailyChallenges(userId);  // ← ASYNC (with await)
      await this.redis.setex(challengeKey, 86400, JSON.stringify(newChallenges));
      return newChallenges;
    } else {
      return JSON.parse(challenges);
    }
  } catch (error) {
    typedLogger.error('Get daily challenges error', { error: (error as any).message, userId });
    throw error;
  }
}

// CHANGES:
// ~ const newChallenges = this.generateDailyChallenges(userId);
// ~ const newChallenges = await this.generateDailyChallenges(userId);
//   (Added 'await' because method is now async)
```

---

## CHANGE #4: Updated generateDailyChallenges() Method

### Location: Lines ~516-544 (private static helper)

```typescript
// BEFORE:
private static generateDailyChallenges(userId: string) {
  const challenges = [
    {
      id: 'daily_claims',
      title: 'Prize Hunter',
      description: 'Claim 5 prizes today',
      type: 'claims',
      target: 5,
      progress: 0,
      reward: 100,
      completed: false},
    {
      id: 'distance_walker',
      title: 'Explorer',
      description: 'Walk 2km while playing',
      type: 'distance',
      target: 2000, // meters
      progress: 0,
      reward: 75,
      completed: false},
    {
      id: 'category_variety',
      title: 'Variety Seeker',
      description: 'Claim prizes from 3 different categories',
      type: 'categories',
      target: 3,
      progress: 0,
      reward: 50,
      completed: false}];

  return challenges;
}

// AFTER:
private static async generateDailyChallenges(userId: string) {
  try {
    // Read from Settings if available, otherwise use defaults
    const settings = await Settings.findOne();
    const challenges = (settings as any)?.custom?.dailyChallenges || [
      {
        id: 'daily_claims',
        title: 'Prize Hunter',
        description: 'Claim 5 prizes today',
        type: 'claims',
        target: 5,
        progress: 0,
        reward: 100,
        completed: false
      },
      {
        id: 'distance_walker',
        title: 'Explorer',
        description: 'Walk 2km while playing',
        type: 'distance',
        target: 2000, // meters
        progress: 0,
        reward: 75,
        completed: false
      },
      {
        id: 'category_variety',
        title: 'Variety Seeker',
        description: 'Claim prizes from 3 different categories',
        type: 'categories',
        target: 3,
        progress: 0,
        reward: 50,
        completed: false
      }
    ];

    return challenges;
  } catch (error) {
    typedLogger.error('Error generating daily challenges', { error: (error as any).message, userId });
    // Return defaults on error
    return [
      {
        id: 'daily_claims',
        title: 'Prize Hunter',
        description: 'Claim 5 prizes today',
        type: 'claims',
        target: 5,
        progress: 0,
        reward: 100,
        completed: false
      },
      {
        id: 'distance_walker',
        title: 'Explorer',
        description: 'Walk 2km while playing',
        type: 'distance',
        target: 2000,
        progress: 0,
        reward: 75,
        completed: false
      },
      {
        id: 'category_variety',
        title: 'Variety Seeker',
        description: 'Claim prizes from 3 different categories',
        type: 'categories',
        target: 3,
        progress: 0,
        reward: 50,
        completed: false
      }
    ];
  }
}

// CHANGES:
// ~ private static generateDailyChallenges(userId: string)
// ~ private static async generateDailyChallenges(userId: string)
//   (Made async to allow Settings database query)
// 
// + Added: const settings = await Settings.findOne();
// + Added: Use settings?.custom?.dailyChallenges if available
// + Added: Try-catch error handling
// + Added: Fallback to hardcoded defaults on error
```

---

## CHANGE #5: Added Capture Endpoints

### Location: End of export default gameRoutes() function (Lines ~795-850)

```typescript
// BEFORE: (Last endpoint was getInventory)
  // Get inventory
  fastify.get('/inventory', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await GameService.getInventory(request.user.sub);
      reply.send(result);
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });
}

// AFTER: (Added two new endpoints before closing brace)
  // Get inventory
  fastify.get('/inventory', {
    preHandler: [authenticate]}, async (request, reply) => {
    try {
      const result = await GameService.getInventory(request.user.sub);
      reply.send(result);
    } catch (error) {
      reply.code(500).send({ success: false, error: (error as any).message });
    }
  });

  // Capture prize attempt - CRITICAL ENDPOINT FOR GAME FLOW           // ← NEW
  fastify.post<{ Body: z.infer<typeof CaptureAttemptSchema> }>(        // ← NEW
    '/capture/attempt',                                                 // ← NEW
    {                                                                   // ← NEW
      preHandler: [authenticate],                                      // ← NEW
      schema: { body: CaptureAttemptSchema }                            // ← NEW
    },                                                                  // ← NEW
    async (request, reply) => {                                         // ← NEW
      try {                                                             // ← NEW
        const result = await CaptureService.attemptCapture(             // ← NEW
          request.user.sub,                                             // ← NEW
          request.body                                                  // ← NEW
        );                                                              // ← NEW
        reply.send({ success: true, data: result });                    // ← NEW
      } catch (error) {                                                 // ← NEW
        reply.code(400).send({                                          // ← NEW
          success: false,                                               // ← NEW
          error: (error as any).message                                 // ← NEW
        });                                                             // ← NEW
      }                                                                 // ← NEW
    }                                                                   // ← NEW
  );                                                                    // ← NEW

  // Validate capture location - for pre-validation checks             // ← NEW
  fastify.post<{ Body: z.infer<typeof CaptureValidationSchema> }>(     // ← NEW
    '/capture/validate',                                                // ← NEW
    {                                                                   // ← NEW
      preHandler: [authenticate],                                      // ← NEW
      schema: { body: CaptureValidationSchema }                         // ← NEW
    },                                                                  // ← NEW
    async (request, reply) => {                                         // ← NEW
      try {                                                             // ← NEW
        const result = await CaptureService.preValidateCapture(         // ← NEW
          request.user.sub,                                             // ← NEW
          request.body                                                  // ← NEW
        );                                                              // ← NEW
        reply.send({ success: true, data: result });                    // ← NEW
      } catch (error) {                                                 // ← NEW
        reply.code(400).send({                                          // ← NEW
          success: false,                                               // ← NEW
          error: (error as any).message                                 // ← NEW
        });                                                             // ← NEW
      }                                                                 // ← NEW
    }                                                                   // ← NEW
  );                                                                    // ← NEW
}                                                                       // ← EXISTING

// CHANGES:
// + Added two new endpoints
// + POST /capture/attempt - Calls CaptureService.attemptCapture()
// + POST /capture/validate - Calls CaptureService.preValidateCapture()
// + Both use authentication middleware
// + Both validate input with Zod schemas
// + Both handle errors gracefully
```

---

## SUMMARY OF CHANGES

### Total Lines Modified: ~120 lines

| Type | Count | Status |
|------|-------|--------|
| Imports Added | 2 | ✅ |
| Schemas Added | 2 | ✅ |
| Methods Updated | 2 | ✅ |
| Endpoints Added | 2 | ✅ |
| Lines Added | ~120 | ✅ |
| Breaking Changes | 0 | ✅ |

### Files Modified: 1

- `backend/src/modules/game/index.ts`

### No Changes Required To:
- `backend/src/modules/admin/routes/*.ts` (Already fixed)
- `backend/src/modules/capture/routes.ts` (Already exists)
- `backend/src/models/Settings.ts` (Already exists)

### Verification
- ✅ TypeScript compilation: 0 errors
- ✅ Build successful
- ✅ Code follows existing patterns
- ✅ Proper error handling
- ✅ Type safety maintained
- ✅ Backward compatible

---

## BEFORE & AFTER STRUCTURE

### BEFORE
```
gameRoutes(fastify)
├── POST /session/start
├── POST /session/end
├── POST /location/update
├── GET /leaderboard
├── GET /map/data
├── POST /power-ups/use
├── GET /challenges/daily
├── POST /challenges/complete
├── GET /inventory
└── ❌ /capture/attempt (MISSING)
```

### AFTER
```
gameRoutes(fastify)
├── POST /session/start
├── POST /session/end
├── POST /location/update
├── GET /leaderboard
├── GET /map/data
├── POST /power-ups/use
├── GET /challenges/daily
├── POST /challenges/complete
├── GET /inventory
├── ✅ POST /capture/attempt (NEW)
└── ✅ POST /capture/validate (NEW)
```

---

## DIFF SUMMARY

```diff
--- backend/src/modules/game/index.ts (before)
+++ backend/src/modules/game/index.ts (after)

@@ -6,11 +6,13 @@
 import { User } from '@/models/User';
 import { Prize } from '@/models/Prize';
 import { Claim } from '@/models/Claim';
+import { Settings } from '@/models/Settings';
 import { logger } from '@/lib/logger';
 import typedLogger from '@/lib/typed-logger';
 import { redisClient } from '@/config/redis';
+import { CaptureService } from '@/modules/capture/routes';
 import { calculateGeodesicDistance as calculateDistance } from '@/utils/geo';
 import { validateAntiCheat as detectCheating } from '@/utils/anti-cheat';

 // Define interfaces to replace 'any' types
 // ... (existing interfaces)

 // ... (existing schemas)

+// Capture attempt schema (CRITICAL for prize capture flow)
+const CaptureAttemptSchema = z.object({
+  prizeId: z.string(),
+  location: z.object({
+    latitude: z.number().min(-90).max(90),
+    longitude: z.number().min(-180).max(180),
+    accuracy: z.number().min(0).max(1000).optional(),
+    altitude: z.number().optional()
+  }),
+  deviceInfo: z.object({
+    platform: z.enum(['iOS', 'Android']),
+    deviceModel: z.string(),
+    osVersion: z.string().optional(),
+    appVersion: z.string().optional(),
+    timestamp: z.string().datetime().optional()
+  }).optional(),
+  captureMethod: z.enum(['tap', 'gesture', 'voice']).default('tap')
+});
+
+// Capture validation schema
+const CaptureValidationSchema = z.object({
+  prizeId: z.string(),
+  location: z.object({
+    latitude: z.number().min(-90).max(90),
+    longitude: z.number().min(-180).max(180)
+  })
+});

 export class GameService {
   private static redis = redisClient;

   // ... (existing methods)

   static async getDailyChallenges(userId: string) {
     try {
       const today = new Date().toISOString().split('T')[0];
       const challengeKey = `challenges:${userId}:${today}`;
       let challenges = await this.redis.get(challengeKey);

       if (!challenges) {
-        const newChallenges = this.generateDailyChallenges(userId);
+        const newChallenges = await this.generateDailyChallenges(userId);
         await this.redis.setex(challengeKey, 86400, JSON.stringify(newChallenges));
         return newChallenges;
       } else {
         return JSON.parse(challenges);
       }
     } catch (error) {
       typedLogger.error('Get daily challenges error', { ... });
       throw error;
     }
   }

-  private static generateDailyChallenges(userId: string) {
-    const challenges = [
-      {
-        id: 'daily_claims',
-        // ... hardcoded challenges
-      }
-    ];
-    return challenges;
-  }
+  private static async generateDailyChallenges(userId: string) {
+    try {
+      const settings = await Settings.findOne();
+      const challenges = (settings as any)?.custom?.dailyChallenges || [
+        {
+          id: 'daily_claims',
+          // ... default challenges
+        }
+      ];
+      return challenges;
+    } catch (error) {
+      typedLogger.error('Error generating daily challenges', { ... });
+      return [
+        // ... default challenges fallback
+      ];
+    }
+  }

   // ... (existing methods)
 }

 export default async function gameRoutes(fastify: FastifyInstance) {
   // ... (existing endpoints)

   fastify.get('/inventory', { ... });
+
+  // Capture prize attempt - CRITICAL ENDPOINT FOR GAME FLOW
+  fastify.post<{ Body: z.infer<typeof CaptureAttemptSchema> }>(
+    '/capture/attempt',
+    {
+      preHandler: [authenticate],
+      schema: { body: CaptureAttemptSchema }
+    },
+    async (request, reply) => {
+      try {
+        const result = await CaptureService.attemptCapture(
+          request.user.sub,
+          request.body
+        );
+        reply.send({ success: true, data: result });
+      } catch (error) {
+        reply.code(400).send({
+          success: false,
+          error: (error as any).message
+        });
+      }
+    }
+  );
+
+  // Validate capture location - for pre-validation checks
+  fastify.post<{ Body: z.infer<typeof CaptureValidationSchema> }>(
+    '/capture/validate',
+    {
+      preHandler: [authenticate],
+      schema: { body: CaptureValidationSchema }
+    },
+    async (request, reply) => {
+      try {
+        const result = await CaptureService.preValidateCapture(
+          request.user.sub,
+          request.body
+        );
+        reply.send({ success: true, data: result });
+      } catch (error) {
+        reply.code(400).send({
+          success: false,
+          error: (error as any).message
+        });
+      }
+    }
+  );
 }
```

---

**Implementation Complete**  
**Status:** ✅ All changes made successfully  
**Build:** ✅ Compiles with 0 errors  
**Ready for:** Testing & Verification
