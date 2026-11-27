import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useEffect } from 'react';
import { LayoutDashboard, PenLine, HandCoins, ScanLine, ChartPie, Settings, Menu, Plus, LogOut } from 'lucide-react';
import { useUi } from '../store/ui';
import { useSesion } from '../store/sesion';
import { cerrarSesion } from '../lib/auth';
import { useAjustes } from '../hooks/useAjustes';

export const RUTAS = [
  { to: '/', icono: LayoutDashboard, etiqueta: 'Panel' },
  { to: '/registro', icono: PenLine, etiqueta: 'Registro' },
  { to: '/prestamos', icono: HandCoins, etiqueta: 'Préstamos' },
  { to: '/scan', icono: ScanLine, etiqueta: 'Scan' },
  { to: '/metricas', icono: ChartPie, etiqueta: 'Métricas' },
  { to: '/configuracion', icono: Settings, etiqueta: 'Configuración' },
];

export default function Layout() {
  const { menuAbierto, toggleMenu, cerrarMenu } = useUi();
  const usuario = useSesion((s) => s.usuario);
  useAjustes(); // carga moneda y ajustes del servidor
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => { cerrarMenu(); window.scrollTo(0, 0); }, [loc.pathname, cerrarMenu]);
  const actual = RUTAS.find((r) => (r.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(r.to)));
  const nombre = usuario?.nombre || usuario?.email || '';

  return (
    <div className="app">
      <aside className={`sidebar ${menuAbierto ? 'abierta' : ''}`} aria-label="Navegación">
        <div className="marca"><img src="/favicon.svg" alt="" /><div>Finanzas<small>Personal · Andre</small></div></div>
        <div className="nav-titulo">Menú</div>
        <nav className="nav">
          {RUTAS.map(({ to, icono: Icono, etiqueta }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icono aria-hidden />{etiqueta}
            </NavLink>
          ))}
        </nav>
        <div className="usuario-card">
          <div className="avatar-usuario">{nombre.charAt(0).toUpperCase()}</div>
          <div className="info"><strong>{usuario?.nombre}</strong><span>{usuario?.email}</span></div>
          <button className="btn btn-fantasma btn-icono" onClick={cerrarSesion} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut /></button>
        </div>
      </aside>
      {menuAbierto && <div className="velo" onClick={cerrarMenu} />}
      <div className="principal">
        <header className="topbar">
          <button className="hamburguesa" onClick={toggleMenu} aria-label="Abrir menú" aria-expanded={menuAbierto}><Menu /></button>
          <img src="/favicon.svg" alt="" />
          <span className="titulo">{actual?.etiqueta ?? 'Finanzas'}</span>
        </header>
        <main className="contenido">
          <Suspense fallback={<div className="cargando"><div className="spinner" /></div>}>
            <div className="pagina" key={loc.pathname}><Outlet /></div>
          </Suspense>
        </main>
        {loc.pathname !== '/registro' && loc.pathname !== '/scan' && (
          <button className="fab" aria-label="Nuevo movimiento" onClick={() => nav('/registro?nuevo=1')}><Plus /></button>
        )}
      </div>
    </div>
  );
}
