import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ProveedorAvisos } from './ui/componentes/Avisos';
import { Cargando } from './ui/componentes/base';
import { Marco } from './ui/componentes/Marco';
import { ProveedorPwa } from './ui/pwa/ContextoPwa';
import { ProveedorRegistro, useRegistro } from './ui/registro/ContextoRegistro';
import { bd, useMetas, usePerfil, solicitarPersistencia } from './ui/servicios/datos';
import { iniciarCatalogo, precargarCatalogoEnSegundoPlano } from './ui/servicios/catalogo';
import { useTema } from './ui/tema';
import { asistenteResuelto } from './ui/primerArranque';

// División de código por ruta: cada pantalla se descarga cuando se visita.
const Dia = lazy(() => import('./ui/pantallas/Dia'));
const Calendario = lazy(() => import('./ui/pantallas/Calendario'));
const Peso = lazy(() => import('./ui/pantallas/Peso'));
const Estadisticas = lazy(() => import('./ui/pantallas/Estadisticas'));
const Mas = lazy(() => import('./ui/pantallas/Mas'));
const Recetas = lazy(() => import('./ui/pantallas/Recetas'));
const EditorReceta = lazy(() => import('./ui/pantallas/EditorReceta'));
const MisAlimentos = lazy(() => import('./ui/pantallas/MisAlimentos'));
const EditorAlimento = lazy(() => import('./ui/pantallas/EditorAlimento'));
const Perfil = lazy(() => import('./ui/pantallas/Perfil'));
const Respaldo = lazy(() => import('./ui/pantallas/Respaldo'));
const Fuentes = lazy(() => import('./ui/pantallas/Fuentes'));
const Acerca = lazy(() => import('./ui/pantallas/Acerca'));
const Asistente = lazy(() => import('./ui/pantallas/Asistente'));

/** Primer arranque: si no hay perfil ni metas y no se omitió, abre el asistente. */
function GuardiaPrimerArranque() {
  const perfil = usePerfil();
  const metas = useMetas();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    if (perfil === undefined || metas === undefined || pathname === '/bienvenida') return;
    const vacio = Object.keys(perfil).length === 0 && metas.length === 0;
    if (vacio && !asistenteResuelto()) navegar('/bienvenida', { replace: true });
  }, [perfil, metas, pathname, navegar]);
  return null;
}

/** Atajos del manifiesto: ./#/?registrar=1 abre el registro. */
function Atajos() {
  const [params, setParams] = useSearchParams();
  const { abrirRegistro } = useRegistro();
  useEffect(() => {
    if (params.get('registrar') === '1') {
      params.delete('registrar');
      setParams(params, { replace: true });
      abrirRegistro();
    }
  }, [params, setParams, abrirRegistro]);
  return null;
}

/**
 * Si IndexedDB no está disponible (modo privado de algunos navegadores, WebView restringida, permiso denegado),
 * la app se quedaba en "Cargando…" para siempre. Ahora lo explica. Auditoría (Agente 4).
 */
function useErrorAlmacenamiento(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    Promise.resolve()
      .then(() => bd().open())
      .catch((e: unknown) => {
        if (vivo) setError(e instanceof Error && e.message ? e.message : String(e));
      });
    return () => { vivo = false; };
  }, []);
  return error;
}

function SinAlmacenamiento({ detalle }: { detalle: string }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">No se pueden guardar datos</h1>
      <p className="mt-3 text-tinta-2">
        Este navegador no permite que CALORÍA use su almacenamiento local (IndexedDB), por eso no puede guardar tus
        comidas ni tu peso. Suele ocurrir en modo privado o con el almacenamiento de sitios bloqueado. Abre CALORÍA en
        una ventana normal o permite el almacenamiento del sitio e inténtalo de nuevo.
      </p>
      <p className="mt-4 text-xs text-tinta-3">Detalle técnico: {detalle}</p>
    </main>
  );
}

function Aplicacion() {
  useTema();
  const errorAlmacenamiento = useErrorAlmacenamiento();
  useEffect(() => {
    void iniciarCatalogo();
    void solicitarPersistencia();
    // Catálogo base completo para uso sin conexión, cuando el navegador esté desocupado.
    const ric = (window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const t = window.setTimeout(() => {
      if (ric) ric(() => void precargarCatalogoEnSegundoPlano(), { timeout: 10000 });
      else void precargarCatalogoEnSegundoPlano();
    }, 4000);
    return () => window.clearTimeout(t);
  }, []);
  if (errorAlmacenamiento) return <SinAlmacenamiento detalle={errorAlmacenamiento} />;
  return (
    <ProveedorRegistro>
      <GuardiaPrimerArranque />
      <Atajos />
      <Routes>
        <Route path="/bienvenida" element={<Suspense fallback={<Cargando />}><Asistente /></Suspense>} />
        <Route path="*" element={
          <Marco>
            <Suspense fallback={<Cargando />}>
              <Routes>
                <Route path="/" element={<Dia />} />
                <Route path="/calendario" element={<Calendario />} />
                <Route path="/peso" element={<Peso />} />
                <Route path="/estadisticas" element={<Estadisticas />} />
                <Route path="/mas" element={<Mas />} />
                <Route path="/mas/recetas" element={<Recetas />} />
                <Route path="/mas/recetas/:id" element={<EditorReceta />} />
                <Route path="/mas/alimentos" element={<MisAlimentos />} />
                <Route path="/mas/alimentos/:id" element={<EditorAlimento />} />
                <Route path="/mas/perfil" element={<Perfil />} />
                <Route path="/mas/respaldo" element={<Respaldo />} />
                <Route path="/mas/fuentes" element={<Fuentes />} />
                <Route path="/mas/acerca" element={<Acerca />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </Marco>
        } />
      </Routes>
    </ProveedorRegistro>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ProveedorPwa>
        <ProveedorAvisos>
          <Aplicacion />
        </ProveedorAvisos>
      </ProveedorPwa>
    </HashRouter>
  );
}
