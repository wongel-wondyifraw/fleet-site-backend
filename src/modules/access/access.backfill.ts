import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

const logger = new Logger('AccessBackfill');

/**
 * Pre-sync migration: when an existing database still has the legacy
 * `users.role` enum column and no `roleId` FK, create the minimum
 * `roles` row set and rewire each user to point at the matching role.
 *
 * Safe to run on:
 *   - Fresh databases (no `users` table) → no-op.
 *   - New installs where the model already matches → no-op.
 *   - Legacy databases with `users.role` populated → migrates in place.
 *
 * Must run BEFORE TypeORM `synchronize`, otherwise sync tries to add a
 * NOT NULL `roleId` column to a populated table and fails.
 */
export async function runAccessBackfill(ds: DataSource): Promise<void> {
  const runner = ds.createQueryRunner();
  try {
    await runner.connect();

    const usersExists = await runner.hasTable('users');
    if (!usersExists) return;

    const hasOldRoleCol = await columnExists(ds, 'users', 'role');
    const hasNewRoleIdCol = await columnExists(ds, 'users', 'roleId');

    if (!hasOldRoleCol || hasNewRoleIdCol) return;

    logger.warn(
      'Legacy users.role column detected; running one-time RBAC backfill',
    );

    await runner.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key VARCHAR(64) NOT NULL,
        name VARCHAR(128) NOT NULL,
        description VARCHAR(512),
        "isSystem" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await runner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_key_unique ON roles(key)`,
    );

    await runner.query(`
      INSERT INTO roles (key, name, "isSystem") VALUES
        ('ADMIN', 'Administrator', true),
        ('SITE_MANAGER', 'Site Manager', true),
        ('TIME_KEEPER', 'Time Keeper', true)
      ON CONFLICT (key) DO NOTHING
    `);

    await runner.query(`ALTER TABLE users ADD COLUMN "roleId" UUID`);

    await runner.query(`
      UPDATE users u
      SET "roleId" = r.id
      FROM roles r
      WHERE r.key = u.role
    `);

    const orphans: Array<{ count: string }> = await runner.query(
      `SELECT COUNT(*)::text AS count FROM users WHERE "roleId" IS NULL`,
    );
    const orphanCount = Number(orphans[0]?.count ?? '0');
    if (orphanCount > 0) {
      logger.warn(
        `${orphanCount} user(s) had an unrecognized role string; defaulting to ADMIN`,
      );
      await runner.query(`
        UPDATE users
        SET "roleId" = (SELECT id FROM roles WHERE key = 'ADMIN')
        WHERE "roleId" IS NULL
      `);
    }

    await runner.query(`ALTER TABLE users ALTER COLUMN "roleId" SET NOT NULL`);
    await runner.query(`ALTER TABLE users DROP COLUMN role`);

    logger.log('RBAC backfill complete: users.role → users.roleId');
  } finally {
    await runner.release();
  }
}

async function columnExists(
  ds: DataSource,
  table: string,
  column: string,
): Promise<boolean> {
  const rows: Array<{ exists: boolean }> = await ds.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = $1 AND column_name = $2
     ) AS exists`,
    [table, column],
  );
  return rows[0]?.exists === true;
}
