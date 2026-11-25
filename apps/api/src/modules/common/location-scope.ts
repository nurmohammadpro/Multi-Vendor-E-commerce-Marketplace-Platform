import { ForbiddenException } from '@nestjs/common';
import type { Pool } from 'pg';

// Guards every write path that accepts a client-supplied locationId: without
// this check a crafted cross-store UUID passes the FK and writes sales,
// ledger entries and stock movements into another tenant's outlet.
export async function assertLocationInStore(pool: Pool, locationId: string, storeId: string) {
  const result = await pool.query(
    'select id from inventory.locations where id = $1 and store_id = $2 limit 1',
    [locationId, storeId],
  );
  if (!result.rows[0]) {
    throw new ForbiddenException('Location does not belong to this store');
  }
}
