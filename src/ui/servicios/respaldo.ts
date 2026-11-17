/** Adaptador fino hacia respaldos y exportación (Agente 2, `src/respaldo`). Se carga solo en su pantalla. */
export {
  exportarRespaldoJSON, leerRespaldo, importarRespaldo, exportarComidasCSV, exportarPesoCSV, exportarExcel,
  compartirODescargar, descargar,
} from '../../respaldo';
export type { ModoImportacion, Respaldo, ResultadoImportacion } from '../../respaldo';
