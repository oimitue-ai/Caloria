/** Catálogo base: carga los índices, construye el motor en memoria y sirve detalles. Corre en Worker o en hilo principal. */
import type { Alimento, ResultadoBusqueda } from '../tipos.ts';
import { MotorBase, type FilaBase } from './motor.ts';
import type { Cargador } from './red.ts';

export interface InfoBase {
  indices: string[];
  detalles: string[];
}

export class NucleoBase {
  motor: MotorBase | null = null;
  private listo: Promise<void> | null = null;
  private cargar: Cargador;
  private info: InfoBase;
  constructor(cargar: Cargador, info: InfoBase) {
    this.cargar = cargar;
    this.info = info;
  }

  iniciar(): Promise<void> {
    this.listo ??= (async () => {
      const partes = (await Promise.all(this.info.indices.map((f) => this.cargar(`base/${f}`)))) as { filas: FilaBase[] }[];
      this.motor = new MotorBase(partes.flatMap((p) => p?.filas ?? []));
    })();
    this.listo.catch(() => (this.listo = null));
    return this.listo;
  }

  async buscar(texto: string, limite: number, pagina: number): Promise<{ resultados: ResultadoBusqueda[]; total: number }> {
    await this.iniciar();
    return this.motor!.buscar(texto, limite, pagina);
  }

  async obtener(id: string): Promise<Alimento | null> {
    await this.iniciar();
    const d = this.motor!.fragmentoDetalle(id);
    if (d === undefined) return null;
    const frag = (await this.cargar(`base/${this.info.detalles[d]}`)) as Record<string, Omit<Alimento, 'id'>> | null;
    const a = frag?.[id];
    return a ? ({ id, ...a } as Alimento) : null;
  }

  /** Descarga todos los detalles (para usar el catálogo base sin conexión). */
  async precargar(): Promise<void> {
    await this.iniciar();
    await Promise.all(this.info.detalles.map((f) => this.cargar(`base/${f}`)));
  }
}
