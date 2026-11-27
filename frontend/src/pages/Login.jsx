import { useState } from 'react';
import { login } from '../lib/auth';
import { Campo, ErrorMsg } from '../components/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try { await login(email, password); } catch (err) { setError(err); } finally { setCargando(false); }
  }

  return (
    <div className="login">
      <form className="card pagina" onSubmit={enviar}>
        <img className="logo" src="/favicon.svg" alt="" />
        <h1>Hola, Andre 👋</h1>
        <p className="suave" style={{ margin: '6px 0 24px' }}>Ingresa para ver tus finanzas.</p>
        <div style={{ display: 'grid', gap: 16 }}>
          <Campo label="Correo">
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Campo>
          <Campo label="Contraseña">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Campo>
          <ErrorMsg error={error} />
          <button className="btn btn-primario btn-bloque" disabled={cargando}>{cargando ? 'Ingresando…' : 'Ingresar'}</button>
        </div>
      </form>
    </div>
  );
}
