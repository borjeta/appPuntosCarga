import { join, resolve } from 'node:path';
import { createPool, runMigrations } from '@pc/db';
import { ingestSites, ingestStatuses } from './pipeline/ingest';
import { esNapDgt } from './sources/es-nap-dgt';
import { deBnetza } from './sources/de-bnetza';
import { frIrve } from './sources/fr-irve';
import { ptMobie } from './sources/pt-mobie';
import type { SourceAdapter } from './sources/types';
import { ingestVehicles } from './vehicles/open-ev-data';
import { exportAll, exportStatusOnly } from './export/export';

try {
  process.loadEnvFile(join(__dirname, '..', '..', '..', '.env'));
} catch {
  /* .env opcional */
}

export const SOURCES: Record<string, SourceAdapter> = {
  [esNapDgt.meta.id]: esNapDgt,
  [ptMobie.meta.id]: ptMobie,
  [frIrve.meta.id]: frIrve,
  [deBnetza.meta.id]: deBnetza,
};

const USAGE = `Uso:
  npm run ingest -- sites <fuente|all> [--file ruta.xml] [--force]
  npm run ingest -- status <fuente> [--file ruta.xml] [--force]
  npm run ingest -- watch-status <fuente> [--interval segundos]
  npm run ingest -- vehicles [--file ev-data.json] [--force]
  npm run ingest -- export [--out data/public]          (BD → ficheros estáticos para la app)
  npm run ingest -- export-status [--out data/public]   (solo estado en tiempo real, sin BD)

Fuentes: ${Object.keys(SOURCES).join(', ')}`;

function arg(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);

async function main() {
  const argv = process.argv.slice(2);
  const outDir = resolve(arg(argv, '--out') ?? join(__dirname, '..', '..', '..', 'data', 'public'));
  if (argv[0] === 'export-status') {
    const entry = await exportStatusOnly(Object.values(SOURCES), outDir);
    log(`✔ status.json: ${entry.count} puntos, ${(entry.bytes / 1024).toFixed(0)} KB → ${outDir}`);
    return;
  }
  if (argv[0] === 'export') {
    const pool = createPool();
    try {
      await runMigrations(pool);
      const m = await exportAll(pool, Object.values(SOURCES), outDir, {
        force: argv.includes('--force'),
      });
      for (const c of m.countries) {
        log(
          `✔ ${c.cc}: ${c.count} estaciones · índice ${(c.index.bytes / 1048576).toFixed(1)} MB · ${c.tiles.length} teselas`,
        );
      }
      for (const [name, f] of Object.entries(m.files)) {
        log(`✔ ${name}: ${f.count} registros, ${(f.bytes / 1048576).toFixed(1)} MB`);
      }
      log(`Ficheros en ${outDir}`);
    } finally {
      await pool.end();
    }
    return;
  }
  if (argv[0] === 'vehicles') {
    const pool = createPool();
    try {
      await runMigrations(pool);
      const stats = await ingestVehicles(pool, {
        file: arg(argv, '--file'),
        force: argv.includes('--force'),
      });
      log(`✔ open-ev-data: ${JSON.stringify(stats)}`);
    } finally {
      await pool.end();
    }
    return;
  }
  const [command, target, ...rest] = argv;
  if (!command || !target) {
    console.log(USAGE);
    process.exit(1);
  }
  const file = arg(rest, '--file');
  const force = rest.includes('--force');
  const adapters = target === 'all' ? Object.values(SOURCES) : [SOURCES[target]];
  if (adapters.some((a) => !a)) throw new Error(`Fuente desconocida: ${target}\n\n${USAGE}`);

  const pool = createPool();
  try {
    await runMigrations(pool);
    if (command === 'sites') {
      for (const adapter of adapters as SourceAdapter[]) {
        log(`Ingesta de estaciones: ${adapter.meta.name}`);
        const stats = await ingestSites(pool, adapter, { file, force, log });
        log(`✔ ${adapter.meta.id}: ${JSON.stringify(stats)}`);
        if (adapter.statuses && !file) {
          log(`Estados en tiempo real: ${adapter.meta.id}`);
          log(`✔ ${JSON.stringify(await ingestStatuses(pool, adapter, { force }))}`);
        }
      }
    } else if (command === 'status') {
      for (const adapter of adapters as SourceAdapter[]) {
        if (!adapter.statuses) continue;
        log(
          `✔ ${adapter.meta.id}: ${JSON.stringify(await ingestStatuses(pool, adapter, { file, force }))}`,
        );
      }
    } else if (command === 'watch-status') {
      const interval = Math.max(60, Number(arg(rest, '--interval') ?? 120)) * 1000;
      log(`Actualizando estados cada ${interval / 1000}s (Ctrl+C para parar)`);
      for (;;) {
        for (const adapter of adapters as SourceAdapter[]) {
          if (!adapter.statuses) continue;
          try {
            log(
              `✔ ${adapter.meta.id}: ${JSON.stringify(await ingestStatuses(pool, adapter, { force: true }))}`,
            );
          } catch (err) {
            log(`✖ ${adapter.meta.id}: ${(err as Error).message}`);
          }
        }
        await new Promise((r) => setTimeout(r, interval));
      }
    } else {
      console.log(USAGE);
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
