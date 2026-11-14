import { lazy, Suspense } from 'react';
import { useGame } from './game.jsx';
import { t } from '../../shared/i18n.js';
import Home from './components/Home.jsx';
import Designer from './components/Designer.jsx';
import Report from './components/Report.jsx';

// El modo exploración (y sus modelos de elevación) se descarga solo cuando se usa.
const Exploration = lazy(() => import('./explore/Exploration.jsx'));

export default function App() {
  const { mode, game, explore, endExplore } = useGame();
  if (explore) return (
    <Suspense fallback={<div className="center-screen">🛰️ {t('Cargando el relieve real desde los datos de NASA…')}</div>}>
      <Exploration design={explore.design} missionId={explore.missionId} counts={explore.counts} onExit={endExplore} />
    </Suspense>
  );
  if (!mode) return <Home />;
  if (!game) return <div className="center-screen">{t('Conectando con el control de misión…')}</div>;
  return game.phase === 'report' ? <Report /> : <Designer />;
}
