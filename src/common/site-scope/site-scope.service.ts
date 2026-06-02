import { ForbiddenException, Injectable } from '@nestjs/common';
import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

import { User } from '../../modules/users/user.entity';
import { SITES_BYPASS_SCOPE } from './site-scope.constants';

export interface SiteScopeApplyOptions {
  /** Query alias that owns the site column (e.g. `vehicle`). */
  alias: string;
  /** Column name on that alias (default `siteId`). */
  column?: string;
  /** When true, rows with NULL siteId are visible to scoped users (e.g. unassigned vehicles). */
  allowNull?: boolean;
}

@Injectable()
export class SiteScopeService {
  hasBypass(user: User): boolean {
    return (user.role?.permissions ?? []).some(
      (p) => p.slug === SITES_BYPASS_SCOPE,
    );
  }

  /**
   * Site IDs the user may access.
   * - `null` = unrestricted (bypass permission).
   * - `[]` = no assignments → callers should return empty lists.
   */
  allowedSiteIds(user: User): string[] | null {
    if (this.hasBypass(user)) return null;
    return (user.sites ?? []).map((s) => s.id);
  }

  /**
   * Intersect `requested` with the user's allowed sites. Throws if any
   * requested id is outside the allowed set. Bypass users get `requested` as-is.
   */
  assertAccess(user: User, requested: string[]): string[] {
    if (requested.length === 0) return [];
    const allowed = this.allowedSiteIds(user);
    if (allowed === null) return requested;
    const allowedSet = new Set(allowed);
    const filtered = requested.filter((id) => allowedSet.has(id));
    if (filtered.length !== requested.length) {
      throw new ForbiddenException(
        'You do not have access to one or more sites.',
      );
    }
    return filtered;
  }

  /**
   * Resolve which site IDs a list query should use.
   * - Bypass + no request → unrestricted (`null` means no filter).
   * - Bypass + request → request as-is.
   * - Scoped + no request → all assigned sites.
   * - Scoped + request → intersection (throws if out of scope).
   */
  resolveFilterSiteIds(
    user: User,
    requested?: string[],
  ): string[] | null {
    const allowed = this.allowedSiteIds(user);
    if (allowed === null) {
      if (!requested || requested.length === 0) return null;
      return requested;
    }
    if (allowed.length === 0) return [];
    if (!requested || requested.length === 0) return allowed;
    return this.assertAccess(user, requested);
  }

  assertCanAccessSite(user: User, siteId: string | null | undefined): void {
    if (!siteId) return;
    this.assertAccess(user, [siteId]);
  }

  applyTo<Entity extends ObjectLiteral>(
    qb: SelectQueryBuilder<Entity>,
    user: User,
    opts: SiteScopeApplyOptions,
  ): SelectQueryBuilder<Entity> {
    const siteIds = this.resolveFilterSiteIds(user);
    if (siteIds === null) return qb;
    const column = opts.column ?? 'siteId';
    const path = `${opts.alias}.${column}`;
    if (siteIds.length === 0) {
      return qb.andWhere('1 = 0');
    }
    if (opts.allowNull) {
      return qb.andWhere(
        new Brackets((sub) => {
          sub.where(`${path} IS NULL`).orWhere(`${path} IN (:...siteIds)`, {
            siteIds,
          });
        }),
      );
    }
    return qb.andWhere(`${path} IN (:...siteIds)`, { siteIds });
  }
}
