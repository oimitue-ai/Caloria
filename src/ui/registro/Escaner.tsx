import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ScanBarcode } from 'lucide-react';
import { Boton, Campo, Nota } from '../componentes/base';

interface DetectorCodigos {
  detect(fuente: CanvasImageSource): Promise<{ rawValue: string; format: string }[]>;
}
type ConstructorDetector = new (opciones?: { formats?: string[] }) => DetectorCodigos;

const FORMATOS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

function constructorDetector(): ConstructorDetector | null {
  const C = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
  return typeof C === 'function' ? C : null;
}

/** Entrada de código de barras: manual siempre; cámara si el navegador soporta BarcodeDetector. */
export function Escaner({ onCodigo, buscando }: { onCodigo: (codigo: string) => void; buscando: boolean }) {
  const [codigo, setCodigo] = useState('');
  const [camara, setCamara] = useState<'apagada' | 'iniciando' | 'activa' | 'error'>('apagada');
  const [errorCamara, setErrorCamara] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const flujo = useRef<MediaStream | null>(null);
  const Detector = constructorDetector();
  const soportaCamara = !!Detector && !!navigator.mediaDevices?.getUserMedia;

  const detener = () => {
    flujo.current?.getTracks().forEach((t) => t.stop());
    flujo.current = null;
  };

  useEffect(() => () => detener(), []);

  useEffect(() => {
    if (camara !== 'activa' || !Detector) return;
    let vivo = true;
    let detector: DetectorCodigos;
    try { detector = new Detector({ formats: FORMATOS }); } catch { detector = new Detector(); }
    const ciclo = async () => {
      if (!vivo || !video.current) return;
      try {
        if (video.current.readyState >= 2) {
          const r = await detector.detect(video.current);
          const valido = r.find((x) => /^\d{8,14}$/.test(x.rawValue));
          if (valido && vivo) {
            vivo = false;
            try { navigator.vibrate?.(40); } catch { /* sin soporte */ }
            detener();
            setCamara('apagada');
            setCodigo(valido.rawValue);
            onCodigo(valido.rawValue);
            return;
          }
        }
      } catch { /* cuadro sin lectura */ }
      if (vivo) window.setTimeout(ciclo, 220);
    };
    ciclo();
    return () => { vivo = false; };
  }, [camara, Detector, onCodigo]);

  const encender = async () => {
    setCamara('iniciando');
    setErrorCamara('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      flujo.current = s;
      setCamara('activa');
      window.setTimeout(() => {
        if (video.current) { video.current.srcObject = s; video.current.play().catch(() => undefined); }
      }, 0);
    } catch (e) {
      setCamara('error');
      setErrorCamara(e instanceof DOMException && e.name === 'NotAllowedError'
        ? 'No diste permiso para usar la cámara. Escribe el código o activa el permiso en la configuración del navegador.'
        : 'No se pudo abrir la cámara. Escribe el código manualmente.');
    }
  };

  const valido = /^\d{8,14}$/.test(codigo.trim());

  return (
    <div className="space-y-4 px-4 pb-6">
      {camara === 'activa' || camara === 'iniciando' ? (
        <div className="relative overflow-hidden rounded-tarjeta bg-black">
          <video ref={video} className="aspect-[4/3] w-full object-cover" playsInline muted aria-label="Vista de la cámara" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/85" aria-hidden />
          <p className="absolute inset-x-0 bottom-0 bg-black/55 px-3 py-2 text-center text-sm text-white">Apunta al código de barras</p>
          <Boton variante="secundario" chico icono={CameraOff} className="absolute right-2 top-2" onClick={() => { detener(); setCamara('apagada'); }}>
            Apagar
          </Boton>
        </div>
      ) : soportaCamara ? (
        <Boton variante="secundario" ancho icono={Camera} onClick={encender}>Escanear con la cámara</Boton>
      ) : (
        <Nota icono={ScanBarcode}>Este navegador no puede leer códigos con la cámara. Escribe los números que aparecen debajo de las barras.</Nota>
      )}
      {errorCamara && <p role="alert" className="text-sm text-exceso">{errorCamara}</p>}
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valido) onCodigo(codigo.trim()); }}>
        <Campo
          className="flex-1"
          etiqueta="Código de barras"
          inputMode="numeric"
          autoComplete="off"
          placeholder="7501234567890"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
          maxLength={14}
        />
        <Boton type="submit" disabled={!valido || buscando}>{buscando ? 'Buscando…' : 'Buscar'}</Boton>
      </form>
    </div>
  );
}
