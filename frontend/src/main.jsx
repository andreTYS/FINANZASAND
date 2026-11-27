import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { registerSW } from 'virtual:pwa-register';
import { queryClient, opcionesPersistencia } from './lib/queryClient';
import App from './App';
import './styles/global.css';
import './styles/v2.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={opcionesPersistencia}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
);
