import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { GameProvider } from './game.jsx';
import { LangProvider } from './i18n.jsx';
import App from './App.jsx';
import './styles.css';

// Al cambiar de idioma se vuelve a dibujar la interfaz (key={lang}); el estado
// de la partida vive en GameProvider, así que no se pierde.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GameProvider>
      <LangProvider>{(lang) => <App key={lang} />}</LangProvider>
    </GameProvider>
  </StrictMode>,
);
