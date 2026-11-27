import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Solo extrae datos para precargar el formulario; NO guarda nada. */
export const useScanTicket = () => useMutation({
  mutationFn: (imagen) => { const f = new FormData(); f.append('imagen', imagen); return api('/ocr/scan', { method: 'POST', body: f }); },
});
