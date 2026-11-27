import { create } from 'zustand';

// El access token vive solo en memoria; el refresh token va en cookie httpOnly.
export const useSesion = create((set) => ({
  accessToken: null,
  usuario: null,
  estado: 'verificando', // verificando | autenticado | anonimo
  iniciar: ({ accessToken, usuario }) => set({ accessToken, usuario, estado: 'autenticado' }),
  setToken: (accessToken) => set({ accessToken }),
  cerrar: () => set({ accessToken: null, usuario: null, estado: 'anonimo' }),
}));
