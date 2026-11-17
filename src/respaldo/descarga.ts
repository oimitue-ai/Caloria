/** Descarga un Blob en el navegador (crea un enlace temporal). */
export function descargar(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Comparte el archivo con la hoja de compartir del sistema si se puede; si no, lo descarga. */
export async function compartirODescargar(blob: Blob, nombreArchivo: string): Promise<'compartido' | 'descargado'> {
  const archivo = new File([blob], nombreArchivo, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [archivo] })) {
    try {
      await nav.share({ files: [archivo], title: nombreArchivo });
      return 'compartido';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'compartido';
    }
  }
  descargar(blob, nombreArchivo);
  return 'descargado';
}
