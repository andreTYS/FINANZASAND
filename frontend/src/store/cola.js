import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Cola local de altas hechas sin conexión (persistida en localStorage).
 * Cada operación lleva un id generado en el cliente → el backend la trata de forma idempotente,
 * así que reintentar nunca duplica.
 *  op: { id, clase: 'movimiento'|'prestamo'|'abono', ruta, body, creado, intentos, error }
 */
export const useCola = create(persist((set, get) => ({
  ops: [],
  sincronizando: false,
  encolar: (op) => set({ ops: [...get().ops, { ...op, creado: new Date().toISOString(), intentos: 0, error: null }] }),
  quitar: (id) => set({ ops: get().ops.filter((o) => o.id !== id) }),
  marcarError: (id, error) => set({ ops: get().ops.map((o) => (o.id === id ? { ...o, error, intentos: o.intentos + 1 } : o)) }),
  setSincronizando: (v) => set({ sincronizando: v }),
  vaciar: () => set({ ops: [] }),
}), {
  name: 'cola-offline',
  storage: createJSONStorage(() => localStorage),
  partialize: (s) => ({ ops: s.ops }),
}));
