import { create } from 'zustand';

// El access token vive solo en memoria; el refresh token va en cookie httpOnly.
export const useSesion = create((set) => ({
  accessToken: null,
  usuario: null,
  estado: 'verificando', // verificando | autenticado | anonimo
  iniciar: ({ accessToken, usuario }) => set({ accessToken, usuario, estado: 'autenticado' }),
  // Sin red al abrir la app: se entra con el usuario guardado y los datos en caché
  iniciarOffline: (usuario) => set({ accessToken: null, usuario, estado: 'autenticado' }),
  setToken: (accessToken) => set({ accessToken }),
  cerrar: () => set({ accessToken: null, usuario: null, estado: 'anonimo' }),
}));
