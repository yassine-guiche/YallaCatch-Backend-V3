#!/usr/bin/env node

import { MongoClient, Db } from 'mongodb';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { config } from '../src/config';
import { logger } from '../src/lib/logger';

interface Migration {
  version: number;
  name: string;
  up: (db: Db) => Promise<void>;
  down: (db: Db) => Promise<void>;
}

class MigrationRunner {
  private client: MongoClient;
  private db: Db;

  constructor(mongoUri: string) {
    this.client = new MongoClient(mongoUri);
  }

  async connect(): Promise<void> {
    await this.client.connect();
    this.db = this.client.db();
    
    // Ensure migrations collection exists
    await this.db.createCollection('migrations').catch(() => {
      // Collection might already exist
    });
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async loadMigrations(): Promise<Migration[]> {
    const migrationsDir = __dirname;
    const files = await readdir(migrationsDir);
    
    const migrationFiles = files
      .filter(file => file.match(/^\d{3}_.*\.ts$/) && file !== 'migrate.ts')
      .sort();

    const migrations: Migration[] = [];

    for (const file of migrationFiles) {
      const version = parseInt(file.substring(0, 3));
      const name = file.substring(4, file.length - 3);
      
      try {
        const migrationModule = await import(join(migrationsDir, file));
        migrations.push({
          version,
          name,
          up: migrationModule.up,
          down: migrationModule.down,
        });
      } catch (error) {
        logger.error(`Failed to load migration ${file}`, { error: error.message });
        throw error;
      }
    }

    return migrations;
  }

  async getAppliedMigrations(): Promise<number[]> {
    const migrations = await this.db
      .collection('migrations')
      .find({}, { projection: { version: 1 } })
      .sort({ version: 1 })
      .toArray();

    return migrations.map(m => m.version);
  }

  async markMigrationAsApplied(version: number, name: string): Promise<void> {
    await this.db.collection('migrations').insertOne({
      version,
      name,
      appliedAt: new Date(),
    });
  }

  async markMigrationAsReverted(version: number): Promise<void> {
    await this.db.collection('migrations').deleteOne({ version });
  }

  async up(targetVersion?: number): Promise<void> {
    const migrations = await this.loadMigrations();
    const appliedMigrations = await this.getAppliedMigrations();

    const pendingMigrations = migrations.filter(m => {
      const isApplied = appliedMigrations.includes(m.version);
      const withinTarget = targetVersion ? m.version <= targetVersion : true;
      return !isApplied && withinTarget;
    });

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to apply');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} migrations`);

    for (const migration of pendingMigrations) {
      logger.info(`Applying migration ${migration.version}: ${migration.name}`);
      
      try {
        await migration.up(this.db);
        await this.markMigrationAsApplied(migration.version, migration.name);
        logger.info(`Migration ${migration.version} applied successfully`);
      } catch (error) {
        logger.error(`Migration ${migration.version} failed`, { error: error.message });
        throw error;
      }
    }

    logger.info('All migrations applied successfully');
  }

  async down(targetVersion?: number): Promise<void> {
    const migrations = await this.loadMigrations();
    const appliedMigrations = await this.getAppliedMigrations();

    const migrationsToRevert = migrations
      .filter(m => {
        const isApplied = appliedMigrations.includes(m.version);
        const aboveTarget = targetVersion ? m.version > targetVersion : false;
        return isApplied && (aboveTarget || targetVersion === undefined);
      })
      .sort((a, b) => b.version - a.version); // Reverse order for rollback

    if (migrationsToRevert.length === 0) {
      logger.info('No migrations to revert');
      return;
    }

    logger.info(`Reverting ${migrationsToRevert.length} migrations`);

    for (const migration of migrationsToRevert) {
      logger.info(`Reverting migration ${migration.version}: ${migration.name}`);
      
      try {
        await migration.down(this.db);
        await this.markMigrationAsReverted(migration.version);
        logger.info(`Migration ${migration.version} reverted successfully`);
      } catch (error) {
        logger.error(`Migration ${migration.version} rollback failed`, { error: error.message });
        throw error;
      }
    }

    logger.info('All migrations reverted successfully');
  }

  async status(): Promise<void> {
    const migrations = await this.loadMigrations();
    const appliedMigrations = await this.getAppliedMigrations();

    logger.info('Migration status:');
    
    for (const migration of migrations) {
      const status = appliedMigrations.includes(migration.version) ? 'APPLIED' : 'PENDING';
      logger.info(`  ${migration.version}: ${migration.name} [${status}]`);
    }
  }
}

async function main() {
  const command = process.argv[2];
  const targetVersion = process.argv[3] ? parseInt(process.argv[3]) : undefined;

  if (!command || !['up', 'down', 'status'].includes(command)) {
    console.log('Usage: npm run migrate <up|down|status> [target_version]');
    process.exit(1);
  }

  const runner = new MigrationRunner(config.MONGODB_URI);

  try {
    await runner.connect();
    
    switch (command) {
      case 'up':
        await runner.up(targetVersion);
        break;
      case 'down':
        await runner.down(targetVersion);
        break;
      case 'status':
        await runner.status();
        break;
    }
  } catch (error) {
    logger.error('Migration failed', { error: error.message });
    process.exit(1);
  } finally {
    await runner.disconnect();
  }
}

if (require.main === module) {
  main();
}

export { MigrationRunner };
