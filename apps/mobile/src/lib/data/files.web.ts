/**
 * En web (solo desarrollo) no se persiste: el navegador ya cachea las descargas por HTTP y
 * localStorage no admite los ~20 MB del fichero de estaciones.
 */
export async function readCached(_name: string): Promise<string | null> {
  return null;
}

export async function writeCached(_name: string, _content: string): Promise<void> {}
