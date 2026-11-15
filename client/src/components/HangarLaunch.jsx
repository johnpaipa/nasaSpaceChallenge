// Módulo de "Hangar NASA: ensamblaje y lanzamiento": una experiencia aparte
// en Three.js vanilla (caminas por el hangar, ensamblas el cohete pieza por
// pieza y respondes el control de misión durante el despegue), servida como
// archivo estático en /hangar/index.html y montada aquí en un <iframe>.
// Se comunica con React solo por postMessage (ver el bloque agregado al
// final de ese archivo): "hangar:ready" cuando puede recibir la misión,
// "hangar:done" cuando el jugador termina. El resultado (outcome) ya lo
// decidió shared/engine.js a partir de las decisiones reales del jugador en
// el Diseñador; este módulo solo lo dramatiza (trunca el control de misión
// en el punto correcto y muestra una anomalía) en vez de inventar un sistema
// de errores propio que podría divergir del resultado real.
import { useEffect, useRef, useState } from 'react';
import { index } from '../../../shared/catalog.js';
import { t } from '../../../shared/i18n.js';
import { useLang } from '../i18n.jsx';

const MISSION_INDEX = { moon: 1, mars: 2 };
const ORBIT_KIND = { leo_400: 'leo', sso_700: 'sso', geo: 'geo', l1: 'l1' };

export default function HangarLaunch({ design, orbit, outcome, onDone }) {
  const { lang } = useLang();
  const frameRef = useRef(null);
  const started = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function onMessage(ev) {
      if (ev.source !== frameRef.current?.contentWindow || !ev.data) return;
      if (ev.data.type === 'hangar:ready') setReady(true);
      else if (ev.data.type === 'hangar:done') onDone();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    const missionIndex = MISSION_INDEX[orbit.body] ?? 0;
    // Órbitas altas/lejanas (GEO, L1) exigen un segundo encendido para
    // circularizar (mismo umbral que usa el motor de simulación real para
    // decidir orbit_fail); Luna/Marte ya tienen su propia maniobra (deep).
    const needsBurn = missionIndex === 0 && orbit.requires_propulsion_level >= 2;
    const names = design.instruments.map((id) => index.instruments[id]?.name).filter(Boolean);
    const payloadDesc = names.length
      ? `es la carga que llevamos a ${orbit.name}: ${names.join(', ')}`
      : undefined;
    frameRef.current?.contentWindow?.postMessage({
      type: 'hangar:start',
      missionIndex,
      orbitName: orbit.name,
      orbitKind: ORBIT_KIND[orbit.id],
      payloadDesc,
      needsBurn,
      outcome,
      lang,
    }, '*');
    frameRef.current?.contentWindow?.focus();
  }, [ready, orbit, design, outcome]);

  return (
    <div className="launch-seq hangar">
      <iframe ref={frameRef} src="/hangar/index.html" title={t('Ensamblaje y lanzamiento')} allow="autoplay" />
      <button className="ghost hangar-skip" onClick={onDone}>{t('Saltar')}</button>
    </div>
  );
}
