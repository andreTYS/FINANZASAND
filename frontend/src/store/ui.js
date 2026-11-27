import { create } from 'zustand';

const leer = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };

export const useUi = create((set, get) => ({
  menuAbierto: false,
  toggleMenu: () => set({ menuAbierto: !get().menuAbierto }),
  cerrarMenu: () => set({ menuAbierto: false }),
  moneda: leer('moneda', 'PEN'),
  setMoneda: (moneda) => { try { localStorage.setItem('moneda', moneda); } catch { /* sin storage */ } set({ moneda }); },
  toasts: [],
  toast: (texto, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { id, texto, tipo }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3500);
  },
}));
