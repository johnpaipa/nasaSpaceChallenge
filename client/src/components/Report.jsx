import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../game.jsx';
import { index } from '../../../shared/catalog.js';
import { simulate } from '../../../shared/engine.js';
import { t, num } from '../../../shared/i18n.js';
import LaunchSequence from './LaunchSequence.jsx';
import Rewards from './Rewards.jsx';
import { flightPlan, starsFor } from '../guide.js';
import { sfx, speak } from '../sound.js';

const OUTCOME = {
  success: { title: '¡Misión cumplida!', cls: 'ok' },
  lost: { title: 'Nave perdida antes de tiempo', cls: 'warn' },
  launch_fail: { title: 'Falla en el lanzamiento', cls: 'bad' },
  orbit_fail: { title: 'No se alcanzó la órbita', cls: 'bad' },
  cancelled: { title: 'Misión cancelada', cls: 'bad' },
  landing_fail: { title: 'Falla en el aterrizaje', cls: 'bad' },
};
const EV_ICON = { ok: '✅', info: 'ℹ️', warn: '⚠️', fail: '💥' };
const HISTORY_KEY = 'smd-history';

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}

/** Un consejo concreto, en lenguaje sencillo, para mejorar en el próximo intento. */
function nextTip(design, r, stars) {
  const pending = flightPlan(design, r.analysis).find((s) => !s.done);
  if (pending) return `${pending.title}. ${pending.text}`;
  if (r.outcome === 'launch_fail') return t('¡Tu diseño estaba bien, fue mala suerte! Los cohetes a veces fallan. Puedes elegir uno más confiable o simplemente intentarlo de nuevo.');
  if (r.outcome === 'lost') return t('Una tormenta solar o una falla dañó tu satélite. Una computadora "endurecida a radiación" (componentes avanzados) lo protege mejor.');
  if (stars < 3) return t('Para ganar más estrellas: ahorra dinero (por ejemplo con un cohete más barato), agrega instrumentos con ★★★ o haz que la misión dure más años.');
  return t('¡Misión perfecta! ¿Te atreves con un escenario más difícil?');
}

export default function Report() {
  const { game, dispatch, mode, startExplore, record, setJump } = useGame();
  // Dónde se arregla cada lección: al tocarla se vuelve al diseño con esa sección abierta.
  const fixField = {
    [t('Masa')]: 'structure', [t('Lanzamiento')]: 'launcher', [t('Movilidad')]: 'mobility', [t('Ciencia')]: 'instruments', [t('Energía')]: 'solar',
    [t('Datos')]: 'comms', [t('Orientación')]: 'adcs', [t('Órbita')]: 'orbit', [t('Tiempo')]: 'lifetimeYears',
  };
  const fix = (field) => { sfx.click(); setJump(field); dispatch({ type: 'redesign' }); };
  const signed = (n, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${num(Math.abs(n), digits)}`;
  // Mismo resultado (misma semilla), pero con los textos en el idioma de este jugador.
  const r = useMemo(() => simulate(game.design, game.missionId, game.result.seed), [game.result]);
  const surface = r.analysis.parts.orbit.surface;
  const canExplore = surface && r.analysis.parts.mobility.id !== 'none' && (r.outcome === 'success' || r.outcome === 'lost');
  const o = { ...OUTCOME[r.outcome], title: t(OUTCOME[r.outcome].title) };
  const [history, setHistory] = useState(loadHistory);
  const [launching, setLaunching] = useState(true);
  const stars = starsFor(r.score.grade, r.outcome);
  const tip = nextTip(game.design, r, stars);

  // Recompensas de la campaña (una sola vez por resultado).
  const [reward, setReward] = useState(null);
  const recorded = useRef(false);

  // Al terminar la cuenta regresiva: sonido de victoria o derrota.
  useEffect(() => {
    if (launching) return;
    if (!recorded.current && game.missionId !== 'sandbox') {
      recorded.current = true;
      setReward(record({ kind: 'design', missionId: game.missionId, result: r, stars, key: `design-${game.missionId}-${r.seed}-${game.attempt}` }));
    }
    if (stars > 0) sfx.win(); else sfx.lose();
    speak(`${o.title}. ${stars > 0 ? t(stars === 1 ? 'Ganaste {n} estrella' : 'Ganaste {n} estrellas', { n: stars }) : t('Esta vez no hubo estrellas')}. ${tip}`);
  }, [launching]);

  // Guarda cada intento para comparar diseños entre simulaciones.
  useEffect(() => {
    const entry = { key: `${r.seed}-${game.attempt}`, mission: game.missionId, score: r.score.total, grade: r.score.grade, outcome: r.outcome, cost: r.analysis.cost.total, design: game.design, at: Date.now() };
    setHistory((h) => {
      if (h.some((x) => x.key === entry.key)) return h;
      const next = [entry, ...h].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ }
      return next;
    });
  }, [r.seed, game.attempt]);

  if (launching) {
    return (
      <LaunchSequence
        design={game.design}
        outcome={r.outcome}
        events={r.events}
        onDone={() => setLaunching(false)}
      />
    );
  }

  return (
    <div className="report">
      <header className={`report-hero ${o.cls}`}>
        <div className="grade">{r.score.grade}</div>
        <div>
          <p className="eyebrow">{index.missions[game.missionId].name} · {t('intento #{n}', { n: game.attempt })}</p>
          <h1>{o.title}</h1>
          <div className="stars" aria-label={t('{n} de 3 estrellas', { n: stars })}>
            {[1, 2, 3].map((n) => <span key={n} className={n <= stars ? 'on' : ''} style={{ animationDelay: `${n * 0.25}s` }}>★</span>)}
          </div>
          <p className="lead">{t('Puntaje')}: <b>{r.score.total}</b> / 1000 · {t('{n} años en operación', { n: num(r.monthsOperated / 12, 1) })} · {t('ciencia')} {r.science.toFixed(0)} / {r.analysis.science.target} pts</p>
        </div>
        <div className="hero-actions">
          {canExplore && (
            <button className="primary explore-btn" onClick={() => { sfx.stepDone(); startExplore(game.design, game.missionId); }}>
              🕹️ {t('¡Manejar el rover!')}
            </button>
          )}
          <button className={canExplore ? '' : 'primary'} onClick={() => { sfx.click(); dispatch({ type: 'redesign' }); }}>
            🔧 {t('Rediseñar')} {mode === 'multi' && `(${t('cualquiera del equipo')})`}
          </button>
        </div>
      </header>
      {surface && !canExplore && (
        <p className="muted explore-note">
          {r.analysis.parts.mobility.id === 'none'
            ? t('🕹️ Para manejar un rover por la superficie, agrega uno en 🛰️ Nave → Movilidad.')
            : t('🕹️ La nave no llegó a la superficie: arregla el diseño para poder manejar el rover.')}
        </p>
      )}

      <Rewards out={reward} />

      <div className="copilot inline">
        <div className="copilot-avatar" aria-hidden>🤖</div>
        <div className="copilot-bubble">
          <div className="copilot-head"><b>Orbi · {t('consejo para tu próximo intento')}</b></div>
          <p>{tip}</p>
          <div className="row copilot-actions">
            <button className="small" onClick={() => speak(tip, true)}>🔊 {t('Escuchar')}</button>
          </div>
        </div>
      </div>

      <div className="report-grid">
        <section className="panel">
          <h3>{t('Desglose del puntaje')}</h3>
          {[
            [t('Ciencia obtenida'), r.score.science, 500],
            [t('Objetivos cumplidos'), r.score.objectives, 250],
            [t('Eficiencia de recursos'), r.score.efficiency, 200],
          ].map(([label, v, max]) => (
            <div key={label} className="resource">
              <div className="resource-head"><span>{label}</span><span className="value">{v} / {max}</span></div>
              <div className="bar"><div className="fill ok" style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
          {r.score.penalties > 0 && <p className="error-text">{t('Penalizaciones')}: −{r.score.penalties}</p>}
          <h3>{t('Objetivos')}</h3>
          <ul className="checklist">
            {r.objectives.map((ob) => <li key={ob.label}>{ob.ok ? '✅' : '❌'} {ob.label}</li>)}
          </ul>
        </section>

        <section className="panel">
          <h3>{t('Bitácora de la misión')}</h3>
          <ol className="timeline">
            {r.events.map((e, i) => (
              <li key={i} className={`ev ${e.type}`}>
                <span className="month">{e.month === 0 ? 'T-0' : t('Mes {n}', { n: e.month })}</span>
                <div><b>{EV_ICON[e.type]} {e.title}</b><p>{e.text}</p></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel">
          <h3>{t('¿Qué aprendimos?')}</h3>
          {r.lessons.length === 0
            ? <p>{t('El diseño estaba equilibrado: todos los subsistemas tenían margen. Prueba un escenario más difícil o reduce costos para mejorar la eficiencia.')}</p>
            : (
              <ul className="lessons">
                {r.lessons.map((l, i) => (
                  <li key={i}>
                    <b>{l.area}:</b> {l.text}
                    {fixField[l.area] && <> <button className="link" onClick={() => fix(fixField[l.area])}>🔧 {t('Arreglar esto')}</button></>}
                  </li>
                ))}
              </ul>
            )}
          <h3>{t('Intentos anteriores')}</h3>
          <table className="history">
            <thead><tr><th>{t('Nota')}</th><th>{t('Puntaje')}</th><th>{t('Costo')}</th><th /></tr></thead>
            <tbody>
              {history.filter((h) => h.mission === game.missionId).slice(0, 8).map((h) => {
                const current = h.key === `${r.seed}-${game.attempt}`;
                return (
                  <tr key={h.key} className={current ? 'current' : ''}>
                    <td>{h.grade}</td>
                    {/* Diferencia de cada intento anterior frente al de ahora */}
                    <td>{h.score}{!current && <small className="muted"> ({signed(h.score - r.score.total)})</small>}</td>
                    <td>{h.cost.toFixed(0)} M${!current && <small className="muted"> ({signed(h.cost - r.analysis.cost.total)})</small>}</td>
                    <td>
                      {current ? <small className="muted">{t('este intento')}</small>
                        : mode !== 'multi' && h.design && <button className="link" onClick={() => { sfx.click(); dispatch({ type: 'loadDesign', design: h.design }); }}>↩ {t('Restaurar')}</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
