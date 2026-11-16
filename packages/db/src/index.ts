import { Pool, type PoolClient, type PoolConfig } from 'pg';

export type { Pool, PoolClient } from 'pg';

export const DEFAULT_DATABASE_URL = 'postgres://pc:pc_dev_password@localhost:5433/puntos_carga';

export function databaseUrl(): string {
  return process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
}

export function createPool(config: PoolConfig = {}): Pool {
  return new Pool({ connectionString: databaseUrl(), max: 10, ...config });
}

/** Ejecuta `fn` dentro de una transacción; hace ROLLBACK si lanza. */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export { runMigrations } from './migrate';
