// Secuencia de lanzamiento: después de simular, el jugador entra al hangar
// (ensambla el cohete y responde el control de misión). Si el sistema pide
// "menos movimiento" no se monta el hangar: se muestra un resumen estático.
import { useEffect, useMemo, useRef } from 'react';
import { index } from '../../../shared/catalog.js';
import { t } from '../../../shared/i18n.js';
import { prefersReducedMotion } from '../sound.js';
import HangarLaunch from './HangarLaunch.jsx';

export default function LaunchSequence({ design, outcome, events = [], onDone }) {
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const orbit = index.orbits[design.orbit];
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    if (!reducedMotion) return undefined;
    const timer = setTimeout(finish, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  if (reducedMotion) {
    const icon = outcome === 'success' || outcome === 'lost' ? '🛰️' : '💥';
    return (
      <div className="launch-seq" onClick={finish} title={t('Clic para continuar')}>
        <div className="rocket">{icon}</div>
        <div className="countdown">{events[0]?.title || t('Resultado de la misión')}</div>
      </div>
    );
  }

  return <HangarLaunch design={design} orbit={orbit} outcome={outcome} onDone={finish} />;
}
