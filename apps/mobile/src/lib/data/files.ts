import { Directory, File, Paths } from 'expo-file-system';

/**
 * Caché en disco de los ficheros de datos (para arrancar sin conexión y no descargar de nuevo
 * lo que no ha cambiado). Se guarda en el directorio de documentos de la app.
 */
const dir = new Directory(Paths.document, 'dataset');

function file(name: string): File {
  return new File(dir, name);
}

export async function readCached(name: string): Promise<string | null> {
  try {
    const f = file(name);
    return f.exists ? await f.text() : null;
  } catch {
    return null;
  }
}

export async function writeCached(name: string, content: string): Promise<void> {
  try {
    if (!dir.exists) dir.create({ intermediates: true });
    const f = file(name);
    if (!f.exists) f.create();
    await f.write(content);
  } catch {
    // Sin caché la app sigue funcionando (descargará la próxima vez).
  }
}
