import {
  DATASET_VERSION,
  StationIndex,
  type Manifest,
  type StationsFile,
  type StatusFile,
  type VehiclesFile,
} from '@pc/dataset';
import type { VehicleSpec } from '@pc/shared';
import { DATA_URL } from '../config';
import { readCached, writeCached } from './files';

/** Cada cuánto se consulta si hay estado en tiempo real nuevo (el fichero pesa ~80 KB). */
export const STATUS_REFRESH_MS = 5 * 60_000;
/** Cada cuánto se comprueba si hay una publicación nueva de estaciones (solo el manifiesto). */
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

/**
 * Repositorio de datos en el dispositivo. Arranca desde la caché local si existe (funciona sin
 * conexión) y se actualiza en segundo plano comparando el manifiesto publicado.
 */
class Repository {
  index: StationIndex | null = null;
  vehicles: VehicleSpec[] = [];
  manifest: Manifest | null = null;
  private loading: Promise<void> | null = null;
  private manifestCheckedAt = 0;
  private statusFetchedAt = 0;
  private statusGeneratedAt: string | null = null;

  /** Garantiza que hay datos cargados (de caché o descargados). */
  async ready(): Promise<this> {
    if (this.index) return this;
    this.loading ??= this.load().finally(() => {
      this.loading = null;
    });
    await this.loading;
    return this;
  }

  private async load(): Promise<void> {
    const [m, s, v] = await Promise.all([
      readCached('manifest.json'),
      readCached('stations.json'),
      readCached('vehicles.json'),
    ]);
    if (m && s && v) {
      try {
        this.install(
          JSON.parse(m) as Manifest,
          JSON.parse(s) as StationsFile,
          JSON.parse(v) as VehiclesFile,
        );
        const st = await readCached('status.json');
        if (st) this.index?.applyStatus(JSON.parse(st) as StatusFile);
        // Datos en pantalla al instante; la comprobación de novedades va en segundo plano.
        void this.refresh().catch(() => undefined);
        return;
      } catch {
        // Caché corrupta: se descarga de nuevo.
      }
    }
    await this.refresh(true);
  }

  private install(manifest: Manifest, stations: StationsFile, vehicles: VehiclesFile): void {
    if (stations.version !== DATASET_VERSION) {
      throw new DataError(
        'La versión de los datos no es compatible con esta versión de la app. Actualiza la app.',
      );
    }
    this.manifest = manifest;
    this.index = new StationIndex(
      stations,
      manifest.sources.map((s) => ({
        id: s.id,
        name: s.name,
        attribution: s.attribution,
        licenseName: s.licenseName,
        licenseUrl: s.licenseUrl,
        lastSyncAt: s.lastSyncAt,
      })),
    );
    this.vehicles = vehicles.vehicles;
  }

  /**
   * Descarga lo que haya cambiado. Devuelve true si cambió algo visible (para refrescar pantallas).
   */
  async refresh(force = false): Promise<boolean> {
    let changed = false;
    if (force || !this.manifest || Date.now() - this.manifestCheckedAt > MANIFEST_REFRESH_MS) {
      const manifestText = await fetchText('manifest.json');
      const manifest = JSON.parse(manifestText) as Manifest;
      this.manifestCheckedAt = Date.now();
      const stationsChanged =
        !this.manifest ||
        manifest.files.stations.generatedAt !== this.manifest.files.stations.generatedAt;
      if (force || stationsChanged || !this.index) {
        const [stationsText, vehiclesText] = await Promise.all([
          fetchText(manifest.files.stations.path),
          fetchText(manifest.files.vehicles.path),
        ]);
        this.install(
          manifest,
          JSON.parse(stationsText) as StationsFile,
          JSON.parse(vehiclesText) as VehiclesFile,
        );
        await Promise.all([
          writeCached('stations.json', stationsText),
          writeCached('vehicles.json', vehiclesText),
          writeCached('manifest.json', manifestText),
        ]);
        this.statusFetchedAt = 0;
        changed = true;
      } else {
        this.manifest = manifest;
        await writeCached('manifest.json', manifestText);
      }
    }
    if (await this.refreshStatus()) changed = true;
    return changed;
  }

  /** Descarga el estado en tiempo real si ha pasado el intervalo. */
  async refreshStatus(force = false): Promise<boolean> {
    if (!this.index || (!force && Date.now() - this.statusFetchedAt < STATUS_REFRESH_MS))
      return false;
    try {
      const path = this.manifest?.files.status.path ?? 'status.json';
      const text = await fetchText(path);
      const status = JSON.parse(text) as StatusFile;
      this.statusFetchedAt = Date.now();
      if (status.generatedAt === this.statusGeneratedAt) return false;
      this.statusGeneratedAt = status.generatedAt;
      this.index.applyStatus(status);
      await writeCached('status.json', text);
      return true;
    } catch {
      return false; // Sin conexión: se conserva el último estado (caducará solo a los 30 min).
    }
  }
}

export const repository = new Repository();
