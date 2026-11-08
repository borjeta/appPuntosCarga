import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from 'pg';

export const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * Aplica en orden los ficheros `NNN_nombre.sql` pendientes, cada uno en su transacción.
 * Devuelve los nombres aplicados.
 */
export async function runMigrations(pool: Pool, dir = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const files = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));

  const done: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      done.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Fallo en la migración ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return done;
}
