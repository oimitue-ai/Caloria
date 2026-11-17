const CLAVE = 'caloria.asistente';

/** true si el asistente de bienvenida ya se completó u omitió en este dispositivo. */
export function asistenteResuelto(): boolean {
  try { return localStorage.getItem(CLAVE) !== null; } catch { return true; }
}

export function marcarAsistente(estado: 'hecho' | 'omitido'): void {
  try { localStorage.setItem(CLAVE, estado); } catch { /* modo privado */ }
}
