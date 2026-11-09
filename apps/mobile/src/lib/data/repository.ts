import {
  DATASET_VERSION,
  StationIndex,
  type CountryEntry,
  type CountryIndexFile,
  type Manifest,
  type StatusFile,
  type TileFile,
  type VehiclesFile,
} from '@pc/dataset';
import type { VehicleSpec } from '@pc/shared';
import { DATA_URL } from '../config';
import { DEFAULT_COUNTRIES, useAppStore } from '../store';
import { readCached, writeCached } from './files';

/** Cada cuánto se consulta si hay estado en tiempo real nuevo (el fichero pesa ~80 KB). */
export const STATUS_REFRESH_MS = 5 * 60_000;
/** Cada cuánto se comprueba si hay una publicación nueva (solo el manifiesto). */
const MANIFEST_REFRESH_MS = 60 * 60_000;

export class DataError extends Error {}

async function fetchText(path: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${DATA_URL}/${path}`, {
      signal: controller.signal,
      cache: 'no-cache',
    });
    if (!res.ok) throw new DataError(`HTTP ${res.status} al descargar ${path}`);
    return await res.text();
  } catch (err) {
    if (err instanceof DataError) throw err;
    throw new DataError(`No se pudo descargar ${path}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Espera a que el estado guardado (países elegidos) se haya leído del dispositivo. */
function hydrated(): Promise<void> {
  if (useAppStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useAppStore.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/**
 * Datos en el dispositivo (formato v2): índice compacto de cada país elegido, teselas de detalle
 * bajo demanda, vehículos y estado en tiempo real. Arranca desde la caché local si existe
 * (funciona sin conexión) y se actualiza en segundo plano comparando el manifiesto publicado.
 */
class Repository {
  index: StationIndex | null = null;
  vehicles: VehicleSpec[] = [];
  manifest: Manifest | null = null;
  private indexes = new Map<string, CountryIndexFile>();
  private tiles = new Map<string, TileFile>();
  private countries: string[] = [...DEFAULT_COUNTRIES];
  private loading: Promise<void> | null = null;
  private manifestCheckedAt = 0;
  private statusFetchedAt = 0;
  private statusGeneratedAt: string | null = null;
  private lastStatus: StatusFile | null = null;

  async ready(): Promise<this> {
    if (this.index) return this;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    await this.loading;
    return this;
  }

  /** Países publicados (para la pantalla de Ajustes). */
  availableCountries(): CountryEntry[] {
    return this.manifest?.countries ?? [];
  }

  /** Cambia los países descargados y reconstruye el índice. */
  async setCountries(countries: string[]): Promise<void> {
    this.countries = countries.length ? countries : [...DEFAULT_COUNTRIES];
    if (!this.manifest) return;
    await this.ensureIndexes();
    this.rebuild();
  }

  private async load(): Promise<void> {
    await hydrated();
    this.countries = useAppStore.getState().countries;
    const cached = await readCached('manifest.json');
    if (cached) {
      try {
        const m = JSON.parse(cached) as Manifest;
        if (m.version === DATASET_VERSION) {
          this.manifest = m;
          const veh = await readCached('vehicles.json');
          if (veh) this.vehicles = (JSON.parse(veh) as VehiclesFile).vehicles;
          await this.ensureIndexes(true);
          const st = await readCached('status.json');
          if (st) this.lastStatus = JSON.parse(st) as StatusFile;
          this.rebuild();
          void this.refresh().catch(() => undefined); // novedades en segundo plano
          return;
        }
      } catch {
        // Caché corrupta o de otra versión: se descarga de nuevo.
      }
    }
    await this.refresh(true);
  }

  private entry(cc: string): CountryEntry | undefined {
    return this.manifest?.countries.find((c) => c.cc === cc);
  }

  /** Carga (de caché o red) el índice de cada país elegido que falte o haya cambiado. */
  private async ensureIndexes(cacheOnly = false): Promise<void> {
    for (const cc of this.countries) {
      const entry = this.entry(cc);
      if (!entry) continue;
      const have = this.indexes.get(cc);
      if (have && have.generatedAt === entry.generatedAt) continue;
      const name = `index-${cc.toLowerCase()}.json`;
      const cached = await readCached(name);
      const parsed = cached ? (JSON.parse(cached) as CountryIndexFile) : null;
      if (parsed && parsed.generatedAt === entry.generatedAt) {
        this.indexes.set(cc, parsed);
        continue;
      }
      if (cacheOnly && parsed) {
        this.indexes.set(cc, parsed); // datos algo antiguos mejor que nada; refresh los pondrá al día
        continue;
      }
      if (cacheOnly) continue;
      const text = await fetchText(entry.index.path);
      this.indexes.set(cc, JSON.parse(text) as CountryIndexFile);
      await writeCached(name, text);
    }
  }

  private rebuild(): void {
    const sources = (this.manifest?.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      attribution: s.attribution,
      licenseName: s.licenseName,
      licenseUrl: s.licenseUrl,
      lastSyncAt: s.lastSyncAt,
    }));
    const selected = this.countries
      .map((cc) => this.indexes.get(cc))
      .filter((x): x is CountryIndexFile => !!x);
    this.index = new StationIndex(selected, sources);
    if (this.lastStatus) this.index.applyStatus(this.lastStatus);
  }

  /** Tesela con las fichas completas (memoria → disco → red). */
  async tile(cc: string, key: string): Promise<TileFile | null> {
    const entry = this.entry(cc);
    if (!entry || !entry.tiles.includes(key)) return null;
    const id = `${cc}/${key}`;
    const mem = this.tiles.get(id);
    if (mem && mem.generatedAt === entry.generatedAt) return mem;
    const name = `tile-${cc.toLowerCase()}-${key}.json`;
    const cached = await readCached(name);
    if (cached) {
      const t = JSON.parse(cached) as TileFile;
      if (t.generatedAt === entry.generatedAt) {
        this.tiles.set(id, t);
        return t;
      }
    }
    try {
      const text = await fetchText(`${entry.tilesPath}/${key}.json`);
      const t = JSON.parse(text) as TileFile;
      this.tiles.set(id, t);
      await writeCached(name, text);
      return t;
    } catch (err) {
      // Sin conexión: una tesela antigua sigue siendo útil.
      if (cached) return JSON.parse(cached) as TileFile;
      throw err;
    }
  }

  /** Descarga lo que haya cambiado. Devuelve true si cambió algo visible. */
  async refresh(force = false): Promise<boolean> {
    let changed = false;
    if (force || !this.manifest || Date.now() - this.manifestCheckedAt > MANIFEST_REFRESH_MS) {
      const text = await fetchText('manifest.json');
      const manifest = JSON.parse(text) as Manifest;
      if (manifest.version !== DATASET_VERSION) {
        throw new DataError('Los datos publicados son de otra versión. Actualiza la app.');
      }
      const vehiclesChanged =
        this.manifest?.files.vehicles.generatedAt !== manifest.files.vehicles.generatedAt;
      const before = this.countries.map((cc) => this.entry(cc)?.generatedAt).join();
      this.manifest = manifest;
      this.manifestCheckedAt = Date.now();
      await writeCached('manifest.json', text);
      if (force || vehiclesChanged || !this.vehicles.length) {
        const vText = await fetchText(manifest.files.vehicles.path);
        this.vehicles = (JSON.parse(vText) as VehiclesFile).vehicles;
        await writeCached('vehicles.json', vText);
      }
      await this.ensureIndexes();
      const after = this.countries.map((cc) => this.entry(cc)?.generatedAt).join();
      if (force || before !== after || !this.index) {
        this.tiles.clear();
        this.rebuild();
        this.statusFetchedAt = 0;
        changed = true;
      }
    }
    if (await this.refreshStatus()) changed = true;
    return changed;
  }

  async refreshStatus(force = false): Promise<boolean> {
    if (!this.index || (!force && Date.now() - this.statusFetchedAt < STATUS_REFRESH_MS))
      return false;
    try {
      const text = await fetchText(this.manifest?.files.status.path ?? 'status.json');
      const status = JSON.parse(text) as StatusFile;
      this.statusFetchedAt = Date.now();
      if (status.generatedAt === this.statusGeneratedAt) return false;
      this.statusGeneratedAt = status.generatedAt;
      this.lastStatus = status;
      this.index.applyStatus(status);
      await writeCached('status.json', text);
      return true;
    } catch {
      return false; // sin conexión: se conserva el último estado (caduca solo a los 30 min)
    }
  }
}

export const repository = new Repository();
