import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { useUi } from '../store/ui';
import { useSesion } from '../store/sesion';
import { cerrarSesion } from '../lib/auth';
import { useAjustes } from '../hooks/useAjustes';

export const RUTAS = [
  { to: '/', icono: '📊', etiqueta: 'Panel' },
  { to: '/registro', icono: '✍️', etiqueta: 'Registro' },
  { to: '/prestamos', icono: '🤝', etiqueta: 'Préstamos' },
  { to: '/scan', icono: '📷', etiqueta: 'Scan' },
  { to: '/metricas', icono: '📈', etiqueta: 'Métricas' },
  { to: '/configuracion', icono: '⚙️', etiqueta: 'Configuración' },
];

export default function Layout() {
  const { menuAbierto, toggleMenu, cerrarMenu } = useUi();
  const usuario = useSesion((s) => s.usuario);
  useAjustes(); // carga moneda y ajustes del servidor
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { cerrarMenu(); window.scrollTo(0, 0); }, [loc.pathname, cerrarMenu]);
  const actual = RUTAS.find((r) => (r.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(r.to)));

  return (
    <div className="app">
      <aside className={`sidebar ${menuAbierto ? 'abierta' : ''}`} aria-label="Navegación">
        <div className="marca"><img src="/favicon.svg" alt="" />Finanzas</div>
        <nav className="nav">
          {RUTAS.map((r) => (
            <NavLink key={r.to} to={r.to} end={r.to === '/'}>
              <span className="icono" aria-hidden>{r.icono}</span>{r.etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="pie">
          <div className="suave">Sesión: <strong>{usuario?.nombre || usuario?.email}</strong></div>
          <button className="btn btn-fantasma btn-sm" style={{ marginTop: 8, paddingLeft: 0 }} onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </aside>
      {menuAbierto && <div className="velo" onClick={cerrarMenu} />}
      <div className="principal">
        <header className="topbar">
          <button className="hamburguesa" onClick={toggleMenu} aria-label="Abrir menú" aria-expanded={menuAbierto}>☰</button>
          <span className="titulo">{actual?.etiqueta ?? 'Finanzas'}</span>
        </header>
        <main className="contenido">
          <Suspense fallback={<div className="cargando"><div className="spinner" /></div>}>
            <div className="pagina" key={loc.pathname}><Outlet /></div>
          </Suspense>
        </main>
        {loc.pathname !== '/registro' && loc.pathname !== '/scan' && (
          <button className="fab" aria-label="Nuevo movimiento" onClick={() => nav('/registro?nuevo=1')}>＋</button>
        )}
      </div>
    </div>
  );
}
