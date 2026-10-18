import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TrayMenu } from './TrayMenu';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TrayMenu />
  </StrictMode>,
);
