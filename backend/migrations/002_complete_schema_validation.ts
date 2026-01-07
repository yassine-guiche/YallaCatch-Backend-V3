import { MongoClient, Db } from 'mongodb';
import { logger } from '../src/lib/logger';

export async function up(db: Db): Promise<void> {
  logger.info('Running migration: 002_complete_schema_validation');

  try {
    // Update existing collections with comprehensive validation schemas
    
    // Claims collection validation
    await db.command({
      collMod: 'claims',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'prizeId', 'status', 'claimedAt', 'location'],
          properties: {
            userId: { bsonType: 'objectId' },
            prizeId: { bsonType: 'objectId' },
            status: { enum: ['pending', 'verified', 'rejected', 'expired'] },
            claimedAt: { bsonType: 'date' },
            verifiedAt: { bsonType: 'date' },
            location: {
              bsonType: 'object',
              required: ['type', 'coordinates'],
              properties: {
                type: { enum: ['Point'] },
                coordinates: {
                  bsonType: 'array',
                  items: { bsonType: 'number' },
                  minItems: 2,
                  maxItems: 2
                },
                accuracy: { bsonType: 'number', minimum: 0 },
                city: { bsonType: 'string' }
              }
            },
            pointsAwarded: { bsonType: 'number', minimum: 0 },
            deviceSignals: {
              bsonType: 'object',
              properties: {
                deviceId: { bsonType: 'string' },
                platform: { enum: ['iOS', 'Android', 'Web'] },
                appVersion: { bsonType: 'string' },
                osVersion: { bsonType: 'string' },
                batteryLevel: { bsonType: 'number', minimum: 0, maximum: 100 },
                isCharging: { bsonType: 'bool' },
                networkType: { enum: ['wifi', 'cellular', 'unknown'] },
                timestamp: { bsonType: 'date' }
              }
            },
            antiCheatFlags: {
              bsonType: 'array',
              items: { 
                enum: ['speed_violation', 'location_spoof', 'time_manipulation', 'device_integrity'] 
              }
            },
            idempotencyKey: { bsonType: 'string', minLength: 1, maxLength: 100 }
          }
        }
      }
    });

    // Rewards collection validation
    await db.command({
      collMod: 'rewards',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['name', 'category', 'pointsCost', 'isActive'],
          properties: {
            name: { bsonType: 'string', minLength: 1, maxLength: 200 },
            description: { bsonType: 'string', maxLength: 1000 },
            category: { 
              enum: ['food', 'shopping', 'entertainment', 'transport', 'health', 'education', 'services', 'digital', 'other'] 
            },
            pointsCost: { bsonType: 'number', minimum: 1 },
            isActive: { bsonType: 'bool' },
            stockTotal: { bsonType: 'number', minimum: 0 },
            stockAvailable: { bsonType: 'number', minimum: 0 },
            stockReserved: { bsonType: 'number', minimum: 0 },
            partnerId: { bsonType: 'objectId' },
            partnerName: { bsonType: 'string' },
            imageUrl: { bsonType: 'string' },
            termsAndConditions: { bsonType: 'string' },
            expiryDays: { bsonType: 'number', minimum: 1 },
            requiresApproval: { bsonType: 'bool' },
            maxRedemptionsPerUser: { bsonType: 'number', minimum: 1 },
            validFrom: { bsonType: 'date' },
            validUntil: { bsonType: 'date' },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
            createdBy: { bsonType: 'objectId' }
          }
        }
      }
    });

    // Redemptions collection validation
    await db.command({
      collMod: 'redemptions',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'rewardId', 'status', 'pointsDeducted', 'redeemedAt'],
          properties: {
            userId: { bsonType: 'objectId' },
            rewardId: { bsonType: 'objectId' },
            status: { enum: ['pending', 'approved', 'fulfilled', 'rejected', 'expired', 'cancelled'] },
            pointsDeducted: { bsonType: 'number', minimum: 1 },
            redeemedAt: { bsonType: 'date' },
            approvedAt: { bsonType: 'date' },
            fulfilledAt: { bsonType: 'date' },
            rejectedAt: { bsonType: 'date' },
            expiresAt: { bsonType: 'date' },
            approvedBy: { bsonType: 'objectId' },
            rejectionReason: { bsonType: 'string', maxLength: 500 },
            fulfillmentDetails: {
              bsonType: 'object',
              properties: {
                method: { enum: ['code', 'email', 'sms', 'physical', 'digital'] },
                code: { bsonType: 'string' },
                instructions: { bsonType: 'string' },
                trackingNumber: { bsonType: 'string' },
                deliveryAddress: { bsonType: 'string' }
              }
            },
            idempotencyKey: { bsonType: 'string', minLength: 1, maxLength: 100 }
          }
        }
      }
    });

    // Codes collection validation
    await db.command({
      collMod: 'codes',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['code', 'rewardId', 'status'],
          properties: {
            code: { bsonType: 'string', minLength: 4, maxLength: 50 },
            rewardId: { bsonType: 'objectId' },
            status: { enum: ['available', 'reserved', 'used', 'expired'] },
            reservedAt: { bsonType: 'date' },
            reservedBy: { bsonType: 'objectId' },
            usedAt: { bsonType: 'date' },
            usedBy: { bsonType: 'objectId' },
            redemptionId: { bsonType: 'objectId' },
            expiresAt: { bsonType: 'date' },
            batchId: { bsonType: 'string' },
            createdAt: { bsonType: 'date' },
            metadata: {
              bsonType: 'object',
              properties: {
                partnerReference: { bsonType: 'string' },
                value: { bsonType: 'number' },
                currency: { bsonType: 'string' },
                validFrom: { bsonType: 'date' },
                validUntil: { bsonType: 'date' }
              }
            }
          }
        }
      }
    });

    // Notifications collection validation
    await db.command({
      collMod: 'notifications',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['type', 'targetType', 'targetValue', 'title', 'message', 'status'],
          properties: {
            type: { enum: ['push', 'email', 'sms', 'in_app'] },
            targetType: { enum: ['user', 'role', 'city', 'all'] },
            targetValue: { bsonType: 'string' },
            title: { bsonType: 'string', minLength: 1, maxLength: 100 },
            message: { bsonType: 'string', minLength: 1, maxLength: 1000 },
            status: { enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'] },
            scheduledFor: { bsonType: 'date' },
            sentAt: { bsonType: 'date' },
            createdAt: { bsonType: 'date' },
            createdBy: { bsonType: 'objectId' },
            metadata: {
              bsonType: 'object',
              properties: {
                imageUrl: { bsonType: 'string' },
                actionUrl: { bsonType: 'string' },
                actionText: { bsonType: 'string' },
                priority: { enum: ['low', 'normal', 'high'] },
                category: { bsonType: 'string' },
                tags: {
                  bsonType: 'array',
                  items: { bsonType: 'string' }
                }
              }
            },
            deliveryStats: {
              bsonType: 'object',
              properties: {
                totalTargets: { bsonType: 'number', minimum: 0 },
                delivered: { bsonType: 'number', minimum: 0 },
                failed: { bsonType: 'number', minimum: 0 },
                opened: { bsonType: 'number', minimum: 0 },
                clicked: { bsonType: 'number', minimum: 0 }
              }
            }
          }
        }
      }
    });

    // Analytics collection validation
    await db.command({
      collMod: 'analytics',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['type', 'date', 'data'],
          properties: {
            type: { 
              enum: ['daily_summary', 'user_activity', 'prize_performance', 'reward_analytics', 'revenue', 'engagement'] 
            },
            date: { bsonType: 'date' },
            period: { enum: ['hourly', 'daily', 'weekly', 'monthly'] },
            data: {
              bsonType: 'object',
              properties: {
                metrics: { bsonType: 'object' },
                dimensions: { bsonType: 'object' },
                trends: { bsonType: 'object' }
              }
            },
            generatedAt: { bsonType: 'date' },
            version: { bsonType: 'string' },
            metadata: {
              bsonType: 'object',
              properties: {
                source: { bsonType: 'string' },
                processingTime: { bsonType: 'number' },
                dataQuality: { bsonType: 'number', minimum: 0, maximum: 1 }
              }
            }
          }
        }
      }
    });

    // Audit logs collection validation
    await db.command({
      collMod: 'auditlogs',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'action', 'resource', 'timestamp'],
          properties: {
            userId: { bsonType: 'objectId' },
            action: { 
              enum: ['create', 'read', 'update', 'delete', 'login', 'logout', 'claim', 'redeem', 'distribute', 'ban', 'unban'] 
            },
            resource: { 
              enum: ['user', 'prize', 'claim', 'reward', 'redemption', 'notification', 'distribution', 'partner', 'settings'] 
            },
            resourceId: { bsonType: 'objectId' },
            timestamp: { bsonType: 'date' },
            ipAddress: { bsonType: 'string' },
            userAgent: { bsonType: 'string' },
            details: {
              bsonType: 'object',
              properties: {
                oldValues: { bsonType: 'object' },
                newValues: { bsonType: 'object' },
                reason: { bsonType: 'string' },
                metadata: { bsonType: 'object' }
              }
            },
            severity: { enum: ['low', 'medium', 'high', 'critical'] },
            category: { enum: ['security', 'data', 'system', 'user', 'admin'] }
          }
        }
      }
    });

    // Sessions collection validation
    await db.command({
      collMod: 'sessions',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['userId', 'sessionId', 'deviceId', 'platform', 'createdAt', 'expiresAt'],
          properties: {
            userId: { bsonType: 'objectId' },
            sessionId: { bsonType: 'string', minLength: 10, maxLength: 100 },
            deviceId: { bsonType: 'string', minLength: 1, maxLength: 100 },
            platform: { enum: ['iOS', 'Android', 'Web'] },
            refreshToken: { bsonType: 'string' },
            fcmToken: { bsonType: 'string' },
            createdAt: { bsonType: 'date' },
            lastUsed: { bsonType: 'date' },
            expiresAt: { bsonType: 'date' },
            isActive: { bsonType: 'bool' },
            ipAddress: { bsonType: 'string' },
            userAgent: { bsonType: 'string' },
            location: {
              bsonType: 'object',
              properties: {
                country: { bsonType: 'string' },
                city: { bsonType: 'string' },
                timezone: { bsonType: 'string' }
              }
            },
            deviceInfo: {
              bsonType: 'object',
              properties: {
                model: { bsonType: 'string' },
                osVersion: { bsonType: 'string' },
                appVersion: { bsonType: 'string' },
                screenResolution: { bsonType: 'string' }
              }
            }
          }
        }
      }
    });

    // Distributions collection validation
    await db.command({
      collMod: 'distributions',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['batchId', 'type', 'status', 'createdBy', 'createdAt'],
          properties: {
            batchId: { bsonType: 'string', minLength: 1, maxLength: 100 },
            type: { enum: ['manual', 'scheduled', 'event_triggered', 'api'] },
            status: { enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'rolled_back'] },
            createdBy: { bsonType: 'objectId' },
            createdAt: { bsonType: 'date' },
            startedAt: { bsonType: 'date' },
            completedAt: { bsonType: 'date' },
            undoExpiresAt: { bsonType: 'date' },
            parameters: {
              bsonType: 'object',
              required: ['prizeTemplate', 'targetArea'],
              properties: {
                prizeTemplate: {
                  bsonType: 'object',
                  required: ['name', 'category', 'points'],
                  properties: {
                    name: { bsonType: 'string', minLength: 1 },
                    category: { bsonType: 'string' },
                    points: { bsonType: 'number', minimum: 1 },
                    imageUrl: { bsonType: 'string' },
                    description: { bsonType: 'string' }
                  }
                },
                targetArea: {
                  bsonType: 'object',
                  required: ['type'],
                  properties: {
                    type: { enum: ['circle', 'polygon', 'city', 'country'] },
                    center: {
                      bsonType: 'object',
                      properties: {
                        lat: { bsonType: 'number', minimum: -90, maximum: 90 },
                        lng: { bsonType: 'number', minimum: -180, maximum: 180 }
                      }
                    },
                    radius: { bsonType: 'number', minimum: 1 },
                    polygon: {
                      bsonType: 'array',
                      items: {
                        bsonType: 'array',
                        items: { bsonType: 'number' },
                        minItems: 2,
                        maxItems: 2
                      }
                    },
                    city: { bsonType: 'string' },
                    country: { bsonType: 'string' }
                  }
                },
                quantity: { bsonType: 'number', minimum: 1 },
                minDistance: { bsonType: 'number', minimum: 1 },
                maxDistance: { bsonType: 'number', minimum: 1 },
                algorithm: { enum: ['random', 'grid', 'weighted'] }
              }
            },
            results: {
              bsonType: 'object',
              properties: {
                prizesCreated: { bsonType: 'number', minimum: 0 },
                prizesSuccessful: { bsonType: 'number', minimum: 0 },
                prizesFailed: { bsonType: 'number', minimum: 0 },
                errors: {
                  bsonType: 'array',
                  items: { bsonType: 'string' }
                },
                prizeIds: {
                  bsonType: 'array',
                  items: { bsonType: 'objectId' }
                }
              }
            }
          }
        }
      }
    });

    // Partners collection validation
    await db.command({
      collMod: 'partners',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['name', 'type', 'isActive', 'contactEmail'],
          properties: {
            name: { bsonType: 'string', minLength: 1, maxLength: 200 },
            type: { enum: ['retail', 'restaurant', 'service', 'entertainment', 'transport', 'digital', 'other'] },
            isActive: { bsonType: 'bool' },
            contactEmail: { bsonType: 'string' },
            contactPhone: { bsonType: 'string' },
            website: { bsonType: 'string' },
            logoUrl: { bsonType: 'string' },
            description: { bsonType: 'string', maxLength: 1000 },
            address: {
              bsonType: 'object',
              properties: {
                street: { bsonType: 'string' },
                city: { bsonType: 'string' },
                postalCode: { bsonType: 'string' },
                country: { bsonType: 'string' },
                location: {
                  bsonType: 'object',
                  properties: {
                    type: { enum: ['Point'] },
                    coordinates: {
                      bsonType: 'array',
                      items: { bsonType: 'number' },
                      minItems: 2,
                      maxItems: 2
                    }
                  }
                }
              }
            },
            businessInfo: {
              bsonType: 'object',
              properties: {
                registrationNumber: { bsonType: 'string' },
                taxId: { bsonType: 'string' },
                category: { bsonType: 'string' },
                establishedYear: { bsonType: 'number' },
                employeeCount: { bsonType: 'number' }
              }
            },
            contractDetails: {
              bsonType: 'object',
              properties: {
                startDate: { bsonType: 'date' },
                endDate: { bsonType: 'date' },
                commissionRate: { bsonType: 'number', minimum: 0, maximum: 1 },
                paymentTerms: { bsonType: 'string' },
                contractUrl: { bsonType: 'string' }
              }
            },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
            createdBy: { bsonType: 'objectId' }
          }
        }
      }
    });

    logger.info('Migration 002_complete_schema_validation completed successfully');
  } catch (error) {
    logger.error('Migration 002_complete_schema_validation failed', { error: error.message });
    throw error;
  }
}

export async function down(db: Db): Promise<void> {
  logger.info('Rolling back migration: 002_complete_schema_validation');

  try {
    // Remove validation from all collections
    const collections = [
      'claims', 'rewards', 'redemptions', 'codes', 'notifications',
      'analytics', 'auditlogs', 'sessions', 'distributions', 'partners'
    ];

    for (const collection of collections) {
      try {
        await db.command({
          collMod: collection,
          validator: {}
        });
      } catch (error) {
        // Collection might not exist or validation might not be set
        logger.warn(`Failed to remove validation from ${collection}`, { error: error.message });
      }
    }

    logger.info('Migration 002_complete_schema_validation rolled back successfully');
  } catch (error) {
    logger.error('Migration 002_complete_schema_validation rollback failed', { error: error.message });
    throw error;
  }
}
