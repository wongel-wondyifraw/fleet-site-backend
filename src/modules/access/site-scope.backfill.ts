import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('SiteScopeBackfill');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Pre-sync migration: add `siteId` FK columns on vehicles/drivers/notifications
 * and backfill from legacy `assignedSite` / `homeSite` varchar fields.
 * Drops legacy columns once backfill completes.
 */
export async function runSiteScopeBackfill(ds: DataSource): Promise<void> {
  const runner = ds.createQueryRunner();
  try {
    await runner.connect();

    await backfillVehicles(runner);
    await backfillDrivers(runner);
    await backfillNotifications(runner);
  } finally {
    await runner.release();
  }
}

async function backfillVehicles(runner: {
  hasTable: (t: string) => Promise<boolean>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  if (!(await runner.hasTable('vehicles'))) return;

  const hasSiteId = await columnExists(runner, 'vehicles', 'siteId');
  const hasLegacy = await columnExists(runner, 'vehicles', 'assignedSite');

  if (!hasSiteId) {
    await runner.query(`ALTER TABLE vehicles ADD COLUMN "siteId" UUID`);
    logger.log('Added vehicles.siteId');
  }

  if (hasLegacy) {
    await runner.query(`
      UPDATE vehicles v
      SET "siteId" = v."assignedSite"::uuid
      WHERE v."siteId" IS NULL
        AND v."assignedSite" IS NOT NULL
        AND v."assignedSite" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    `);
    await runner.query(`
      UPDATE vehicles v
      SET "siteId" = s.id
      FROM sites s
      WHERE v."siteId" IS NULL
        AND v."assignedSite" IS NOT NULL
        AND LOWER(TRIM(s.name)) = LOWER(TRIM(v."assignedSite"))
    `);
    await runner.query(`ALTER TABLE vehicles DROP COLUMN IF EXISTS "assignedSite"`);
    logger.log('Migrated vehicles.assignedSite → vehicles.siteId');
  }
}

async function backfillDrivers(runner: {
  hasTable: (t: string) => Promise<boolean>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  if (!(await runner.hasTable('drivers'))) return;

  const hasSiteId = await columnExists(runner, 'drivers', 'siteId');
  const hasLegacy = await columnExists(runner, 'drivers', 'homeSite');

  if (!hasSiteId) {
    await runner.query(`ALTER TABLE drivers ADD COLUMN "siteId" UUID`);
    logger.log('Added drivers.siteId');
  }

  if (hasLegacy) {
    await runner.query(`
      UPDATE drivers d
      SET "siteId" = d."homeSite"::uuid
      WHERE d."siteId" IS NULL
        AND d."homeSite" IS NOT NULL
        AND d."homeSite" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    `);
    await runner.query(`
      UPDATE drivers d
      SET "siteId" = s.id
      FROM sites s
      WHERE d."siteId" IS NULL
        AND d."homeSite" IS NOT NULL
        AND LOWER(TRIM(s.name)) = LOWER(TRIM(d."homeSite"))
    `);
    await runner.query(`ALTER TABLE drivers DROP COLUMN IF EXISTS "homeSite"`);
    logger.log('Migrated drivers.homeSite → drivers.siteId');
  }
}

async function backfillNotifications(runner: {
  hasTable: (t: string) => Promise<boolean>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}): Promise<void> {
  if (!(await runner.hasTable('notifications'))) return;

  const hasSiteId = await columnExists(runner, 'notifications', 'siteId');
  if (!hasSiteId) {
    await runner.query(`ALTER TABLE notifications ADD COLUMN "siteId" UUID`);
    logger.log('Added notifications.siteId');
  }
}

async function columnExists(
  runner: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  table: string,
  column: string,
): Promise<boolean> {
  const rows = (await runner.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  )) as Array<{ exists: boolean }>;
  return rows[0]?.exists === true;
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
