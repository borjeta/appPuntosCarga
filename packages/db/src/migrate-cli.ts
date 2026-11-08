import { createPool, databaseUrl } from './index';
import { runMigrations } from './migrate';

async function main() {
  const pool = createPool();
  try {
    const applied = await runMigrations(pool);
    const where = databaseUrl().replace(/:[^:@/]+@/, ':***@');
    console.log(
      applied.length
        ? `Migraciones aplicadas en ${where}: ${applied.join(', ')}`
        : 'Sin migraciones pendientes.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
