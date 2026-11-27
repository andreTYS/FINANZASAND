import { lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSesion } from './store/sesion';
import { refrescarSesion } from './lib/api';
import Layout from './components/Layout';
import { Cargando, Toasts } from './components/ui';
import Login from './pages/Login';

// Carga diferida por pantalla (recharts solo se descarga donde se usa)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Registro = lazy(() => import('./pages/Registro'));
const Prestamos = lazy(() => import('./pages/Prestamos'));
const Scan = lazy(() => import('./pages/Scan'));
const Metricas = lazy(() => import('./pages/Metricas'));
const Configuracion = lazy(() => import('./pages/Configuracion'));

export default function App() {
  const estado = useSesion((s) => s.estado);

  // Restaurar sesión desde la cookie de refresh al abrir la app
  useEffect(() => {
    refrescarSesion().catch(() => useSesion.getState().cerrar());
  }, []);

  if (estado === 'verificando') return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Cargando /></div>;

  return (
    <BrowserRouter>
      {estado !== 'autenticado' ? (
        <Routes><Route path="*" element={<Login />} /></Routes>
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="registro" element={<Registro />} />
            <Route path="prestamos" element={<Prestamos />} />
            <Route path="scan" element={<Scan />} />
            <Route path="metricas" element={<Metricas />} />
            <Route path="configuracion" element={<Configuracion />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
      <Toasts />
    </BrowserRouter>
  );
}
