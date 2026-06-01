import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const PAGINATION_DEFAULT_LIMIT = 25;
export const PAGINATION_MAX_LIMIT = 100;

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGINATION_MAX_LIMIT)
  limit?: number = PAGINATION_DEFAULT_LIMIT;

  /** Opaque cursor from a previous `nextCursor` (`createdAt|id`). */
  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface PageResponse<T, M = undefined> {
  data: T[];
  nextCursor: string | null;
  total?: number;
  meta?: M;
}

export function resolveLimit(limit?: number): number {
  if (limit === undefined || limit === null) return PAGINATION_DEFAULT_LIMIT;
  return Math.min(Math.max(1, limit), PAGINATION_MAX_LIMIT);
}

export interface ParsedCursor {
  createdAt: Date;
  id: string;
}

export function parseCursor(cursor?: string): ParsedCursor | null {
  if (!cursor) return null;
  const sep = cursor.indexOf('|');
  if (sep <= 0) return null;
  const createdAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

export function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

export function buildNextCursor<T extends { createdAt: Date; id: string }>(
  rows: T[],
  limit: number,
): string | null {
  if (rows.length <= limit) return null;
  const last = rows[limit - 1];
  return encodeCursor(last.createdAt, last.id);
}
