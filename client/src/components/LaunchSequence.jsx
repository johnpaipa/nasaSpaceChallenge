// Secuencia de lanzamiento: orquesta la línea de tiempo de fases según el
// resultado de simulate() y monta la escena 3D (LaunchCinematic) con un
// overlay HTML (cuenta regresiva, subtítulos, clic-para-saltar). Si el
// sistema pide "menos movimiento", no se monta el Canvas: se muestra un
// resumen estático y se continúa.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { index } from '../../../shared/catalog.js';
import { resolveDesign } from '../../../shared/engine.js';
import { t } from '../../../shared/i18n.js';
import { sfx, prefersReducedMotion } from '../sound.js';
import LaunchCinematic from './LaunchCinematic.jsx';
import HangarLaunch from './HangarLaunch.jsx';

// El módulo del hangar (ensamblaje caminable + control de misión en vivo) ya
// sabe dramatizar cancelled/launch_fail/orbit_fail (trunca su propio control
// de misión en el punto correcto, según el outcome real de simulate()).
// landing_fail se queda en LaunchCinematic: tocaría la física de aterrizaje
// del Hangar (landStep), que no está pensada para fallar.
const HANGAR_OUTCOMES = new Set(['success', 'lost', 'cancelled', 'launch_fail', 'orbit_fail']);

const OLD_STEPS = ['3', '2', '1', '¡Despegue!'];

/** Cuenta regresiva en pantalla (idéntica a la original), independiente del
 * reloj de fases: solo dura lo mismo que la fase "countdown" de la línea de tiempo. */
function Countdown() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    sfx.beep(step === OLD_STEPS.length - 1);
    if (step >= OLD_STEPS.length - 1) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 800);
    return () => clearTimeout(timer);
  }, [step]);
  return <div key={step} className="countdown">{t(OLD_STEPS[step])}</div>;
}

function buildTimeline(outcome, surface) {
  const base = [{ name: 'assembly', ms: 1600 }, { name: 'countdown', ms: 3200 }];
  if (outcome === 'cancelled') return [...base, { name: 'abort_pad', ms: 1900 }, { name: 'recap', ms: 700 }];
  if (outcome === 'launch_fail') return [...base, { name: 'liftoff', ms: 1300 }, { name: 'explode', ms: 1500 }, { name: 'recap', ms: 700 }];

  const toOrbit = [...base, { name: 'liftoff', ms: 2200 }, { name: 'stage', ms: 1300 }];
  if (outcome === 'orbit_fail') return [...toOrbit, { name: 'insertion', ms: 900 }, { name: 'drift', ms: 1900 }, { name: 'recap', ms: 700 }];
  if (surface) {
    const tail = outcome === 'landing_fail' ? { name: 'crash', ms: 1500 } : { name: 'touchdown', ms: 1500 };
    return [...toOrbit, { name: 'insertion', ms: 1200 }, { name: 'descent', ms: 2000 }, tail, { name: 'recap', ms: 700 }];
  }
  // success orbital, o 'lost' (la nave sí llegó a su órbita; se pierde meses
  // después, algo que ya narra la bitácora de Report, no esta cinemática).
  return [...toOrbit, { name: 'insertion', ms: 1800 }, { name: 'recap', ms: 700 }];
}

function captionFor(phase, outcome, events) {
  switch (phase) {
    case 'assembly': return t('Ensamblaje final');
    case 'liftoff': return t('Despegue');
    case 'abort_pad': return events[0]?.text || t('Misión cancelada en revisión');
    case 'explode': return events[0]?.text || t('Anomalía del lanzador');
    case 'stage': return t('Separación de la cofia');
    case 'insertion': return outcome === 'orbit_fail' ? t('Intentando la inserción orbital…') : t('Inserción orbital');
    case 'drift': return events[1]?.text || t('No se alcanza la órbita final');
    case 'descent': return t('Entrando a la atmósfera…');
    case 'touchdown': return events[1]?.text || t('Aterrizaje exitoso');
    case 'crash': return events[1]?.text || t('Falla en el aterrizaje');
    default: return '';
  }
}

const RED_FLASH_PHASES = new Set(['abort_pad', 'explode', 'crash']);
const CUT_PHASES = new Set(['insertion', 'descent']);

export default function LaunchSequence({ design, missionId, outcome, events = [], onDone }) {
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const parts = useMemo(() => resolveDesign(design), [design]);
  const orbit = index.orbits[design.orbit];
  const timeline = useMemo(() => buildTimeline(outcome, orbit.surface), [outcome, orbit.surface]);
  const [i, setI] = useState(0);
  const done = useRef(false);
  const phase = timeline[i]?.name;
  // El módulo del hangar lleva su propio reloj (el jugador decide cuánto
  // dura ensamblar y responder el control de misión): el temporizador de
  // fases de abajo es solo para la cinemática Canvas y debe quedar inerte.
  const isHangar = HANGAR_OUTCOMES.has(outcome);

  const finish = () => { if (!done.current) { done.current = true; onDone(); } };

  useEffect(() => {
    if (reducedMotion) { const timer = setTimeout(finish, 1200); return () => clearTimeout(timer); }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  useEffect(() => {
    if (reducedMotion || isHangar || !timeline[i]) return undefined;
    if (phase === 'liftoff') sfx.launch();
    else if (phase === 'stage') sfx.clunk();
    else if (phase === 'explode' || phase === 'crash') { sfx.explosion(); sfx.alarm(); }
    else if (phase === 'abort_pad') sfx.alarm();
    const timer = setTimeout(() => {
      if (i + 1 < timeline.length) setI(i + 1); else finish();
    }, timeline[i].ms);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, reducedMotion]);

  if (reducedMotion) {
    const icon = outcome === 'success' || outcome === 'lost' ? '🛰️' : '💥';
    return (
      <div className="launch-seq" onClick={finish} title={t('Clic para continuar')}>
        <div className="rocket">{icon}</div>
        <div className="countdown">{events[0]?.title || t('Resultado de la misión')}</div>
      </div>
    );
  }

  if (isHangar) {
    return <HangarLaunch design={design} orbit={orbit} outcome={outcome} onDone={finish} />;
  }

  return (
    <div className="launch-seq cinematic" onClick={finish} title={t('Clic para saltar')}>
      <Canvas camera={{ position: [5.5, 2.5, 5.5], fov: 50 }}>
        <LaunchCinematic phase={phase} outcome={outcome} surface={orbit.surface} body={orbit.body} parts={parts} />
      </Canvas>
      {CUT_PHASES.has(phase) && <div key={`cut-${phase}`} className="scene-cut" />}
      {RED_FLASH_PHASES.has(phase) && <div className="alarm-light" />}
      <div className="cinematic-overlay">
        {phase === 'countdown' ? <Countdown /> : <p className="cinematic-caption">{captionFor(phase, outcome, events)}</p>}
        <p className="muted">{t('Clic para saltar')}</p>
      </div>
    </div>
  );
}
