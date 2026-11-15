import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../game.jsx';
import { catalog, index } from '../../../shared/catalog.js';
import { analyze } from '../../../shared/engine.js';
import { ROLES } from '../../../shared/state.js';
import { t, num } from '../../../shared/i18n.js';
import Icon from './Icon.jsx';
import Dashboard from './Dashboard.jsx';
import Scene3D from './Scene3D.jsx';
import TeamPanel from './TeamPanel.jsx';
import Copilot from './Copilot.jsx';
import FlightPlan from './FlightPlan.jsx';
import Tutorial from './Tutorial.jsx';
import { flightPlan } from '../guide.js';
import { sfx, isMuted, setMuted } from '../sound.js';
import { isUnlocked } from '../campaign.js';
import { LangPicker } from '../i18n.jsx';

// Datos clave que se muestran en cada tarjeta de opción.
function stats(o) {
  const s = [];
  if (o.mass_kg) s.push(`${num(o.mass_kg, 1)} kg`);
  if (o.power_w) s.push(`${num(o.power_w)} W`);
  if (o.generation_w) s.push(`+${num(o.generation_w)} W`);
  if (o.capacity_wh) s.push(`${num(o.capacity_wh)} Wh`);
  if (o.capacity_kg && o.max_instruments) s.push(t('carga {kg} kg · {n} instr.', { kg: o.capacity_kg, n: o.max_instruments }));
  if (o.data_rate_mbps) s.push(`${o.data_rate_mbps} Mbps`);
  if (o.storage_gb) s.push(t('{gb} GB · {pct}% conf.', { gb: o.storage_gb, pct: (o.reliability * 100).toFixed(0) }));
  if (o.pointing_deg) s.push(`±${o.pointing_deg}°`);
  if (o.lifetime_extension_years) s.push(t('+{n} años', { n: o.lifetime_extension_years }));
  if (o.cost_musd) s.push(`${num(o.cost_musd, 1)} M$`);
  return s;
}

/** `onPreview(true|false)`: avisa cuando el cursor (o el foco) entra o sale, para mostrar qué cambiaría. */
function OptionCard({ option, selected, disabled, onClick, extra, onPreview }) {
  const hover = onPreview && !disabled ? {
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') onPreview(true); },
    onPointerLeave: () => onPreview(false),
    onFocus: () => onPreview(true),
    onBlur: () => onPreview(false),
  } : {};
  return (
    <button className={`option ${selected ? 'selected' : ''}`} disabled={disabled} onClick={onClick} {...hover}>
      <span className="option-name">
        {option.name} {option.tier === 'advanced' && <span className="badge adv">{t('avanzado')}</span>}
      </span>
      <span className="chips">{(extra || stats(option)).map((s) => <span key={s} className={`chip ${s.startsWith('⭐') || s.includes('★') ? 'good' : ''}`}>{s}</span>)}</span>
      {selected && option.help && <span className="option-help">{option.help}</span>}
    </button>
  );
}

function Section({ title, help, field, flash, children }) {
  const { canEdit, ownerOf, mode } = useGame();
  const role = Object.entries(ROLES).find(([, r]) => r.fields.includes(field))?.[0];
  const owner = mode === 'multi' && ownerOf(role);
  const locked = !canEdit(field);
  return (
    <div id={`sec-${field}`} className={`section ${locked ? 'locked' : ''} ${flash === field ? 'glow' : ''}`}>
      <div className="section-head">
        <h3>{title}</h3>
        {locked && <span className="lock">🔒 {owner?.name} ({ROLES[role].name})</span>}
      </div>
      {help && <p className="help">{help}</p>}
      <div className="options">{children(locked)}</div>
    </div>
  );
}

// En equipo: una pestaña por rol (cada quien trabaja en la suya).
const TABS = [
  { id: 'planner', icon: '🧭', label: 'Misión', sections: ['missionId', 'orbit', 'launcher', 'lifetimeYears'] },
  { id: 'spacecraft', icon: '🛰️', label: 'Nave', sections: ['structure', 'mobility', 'solar', 'battery', 'adcs', 'propulsion'] },
  { id: 'science', icon: '🔬', label: 'Ciencia', sections: ['instruments'] },
  { id: 'comms', icon: '📡', label: 'Comunicaciones', sections: ['comms', 'computer'] },
];

// Un jugador: ruta guiada, un paso a la vez y en el orden en que se diseña una misión real.
// `view` es la vista 3D que acompaña al paso; `intro` dice qué hay que hacer en él.
const STAGES = [
  { id: 'mission', icon: '🎯', label: 'Tu misión', view: 'orbit', sections: ['missionId'],
    intro: 'Este es tu encargo. Léelo con calma: todo lo que elijas después debe servir para cumplirlo sin pasarte del presupuesto.' },
  { id: 'orbit', icon: '🌍', label: 'Órbita', view: 'orbit', sections: ['orbit', 'lifetimeYears'],
    intro: 'Primero decide por dónde volará tu nave y cuántos años debe durar.' },
  { id: 'science', icon: '🔬', label: 'Instrumentos', view: 'craft', sections: ['instruments'],
    intro: 'Ahora elige los instrumentos: son los que hacen el trabajo de la misión. Busca los que tienen ★★★.' },
  { id: 'spacecraft', icon: '🛰️', label: 'Nave', view: 'craft', sections: ['structure', 'mobility', 'solar', 'battery', 'adcs', 'propulsion'],
    intro: 'Arma la nave que lleva esos instrumentos: que quepan, que tengan energía y batería para la noche.' },
  { id: 'comms', icon: '📡', label: 'Comunicaciones', view: 'craft', sections: ['comms', 'computer'],
    intro: 'Elige la radio y la computadora para que los datos lleguen a la Tierra.' },
  { id: 'launch', icon: '🚀', label: 'Lanzamiento', view: 'orbit', sections: ['launcher'],
    intro: 'Último paso: elige el cohete, revisa que todo esté en ✅ y lanza.' },
];

export default function Designer() {
  const { game, dispatch, mode, leave, me, room, progress, jump, setJump } = useGame();
  // Un jugador sigue la ruta guiada (STAGES); en equipo cada rol tiene su pestaña (TABS).
  const guided = mode !== 'multi';
  const groups = guided ? STAGES : TABS;
  // Al volver de un reporte se entra directo a la revisión final.
  const [tab, setTabState] = useState(guided ? (game.attempt > 0 ? 'launch' : 'mission') : me?.roles.find((r) => ROLES[r]) || 'planner');
  const [visited, setVisited] = useState(() => new Set(guided && game.attempt > 0 ? STAGES.map((g) => g.id) : [tab]));
  const setTab = (id) => { setTabState(id); setVisited((v) => (v.has(id) ? v : new Set(v).add(id))); };
  const groupOf = (field) => groups.find((g) => g.sections.includes(field))?.id ?? groups[0].id;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem('smd-tutorial-seen'); } catch { return true; } });
  const [muted, setMutedState] = useState(isMuted());
  const { design, missionId } = game;
  const analysis = useMemo(() => analyze(design, missionId), [design, missionId]);
  const mission = index.missions[missionId];
  const plan = useMemo(() => flightPlan(design, analysis), [analysis]);
  const pending = plan.filter((s) => !s.done);
  const pendingIn = (id) => pending.filter((s) => groupOf(s.field) === id);
  const stageIndex = groups.findIndex((g) => g.id === tab);
  const stage = groups[stageIndex];
  const nextStage = groups[stageIndex + 1];
  // Vista previa de la opción bajo el cursor: { field, value } o { instrument }.
  const [preview, setPreview] = useState(null);
  const previewAnalysis = useMemo(() => {
    if (!preview) return null;
    const next = preview.instrument
      ? { ...design, instruments: design.instruments.includes(preview.instrument) ? design.instruments.filter((i) => i !== preview.instrument) : [...design.instruments, preview.instrument] }
      : { ...design, [preview.field]: preview.value };
    return analyze(next, missionId);
  }, [preview, design, missionId]);
  const previewOf = (field, value) => (on) => setPreview(on && design[field] !== value ? { field, value } : null);

  // "Llévame ahí": abre el paso (o la pestaña), baja hasta la sección y la resalta un momento.
  const [flash, setFlash] = useState(null);
  const goTo = (field) => { setTab(groupOf(field)); setFlash({ field }); };
  useEffect(() => {
    if (!flash) return undefined;
    document.getElementById(`sec-${flash.field}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    const timer = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(timer);
  }, [flash]);
  const goStep = (step) => goTo(step.field);
  const goStage = (id) => { sfx.click(); setTab(id); document.querySelector('.tab-body')?.scrollTo(0, 0); };
  // Al volver del reporte con "arreglar esto": abre directamente la sección indicada.
  useEffect(() => { if (jump) { goTo(jump); setJump(null); } }, [jump]);

  const [menu, setMenu] = useState(false);
  // Teclado: los números cambian de paso (o de pestaña), Esc cierra el menú.
  useEffect(() => {
    const down = (e) => {
      if (e.key === 'Escape') setMenu(false);
      if (tutorial || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      const g = groups[Number(e.key) - 1];
      if (g) setTab(g.id);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [tutorial]);
  const closeTutorial = () => { setTutorial(false); try { localStorage.setItem('smd-tutorial-seen', '1'); } catch { /* sin almacenamiento */ } };
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted); };
  const set = (field) => (value) => { setPreview(null); dispatch({ type: 'set', field, value }); };
  // Instrumentos de superficie si la nave aterriza o si la misión es en la superficie.
  const onSurface = !!index.orbits[design.orbit].surface || !!mission.surface;
  const visible = (o, current) => showAdvanced || o.tier !== 'advanced' || o.id === current || (Array.isArray(current) && current.includes(o.id));

  const component = (key) => {
    const cat = catalog.categories[key];
    return (
      <Section key={key} title={cat.label} help={cat.help} field={key} flash={flash?.field}>
        {(locked) => cat.options.filter((o) => visible(o, design[key]) || (o.id === 'rtg' && onSurface)).map((o) => (
          <OptionCard key={o.id} option={o} selected={design[key] === o.id} disabled={locked} onClick={() => set(key)(o.id)} onPreview={previewOf(key, o.id)} />
        ))}
      </Section>
    );
  };

  // Secciones que no salen directo del catálogo de componentes.
  const special = {
    // El capítulo se elige en el inicio; aquí solo se puede cambiar de objetivo en el modo libre.
    missionId: () => (missionId === 'sandbox' ? (
      <Section key="missionId" title={t('Objetivo de la misión')} field="missionId" help={`💡 ${mission.hint}`}>
        {(locked) => catalog.missions.map((m) => (
          <OptionCard key={m.id} option={m} selected={missionId === m.id} disabled={locked || !isUnlocked(progress, m.id)} onClick={() => set('missionId')(m.id)}
            extra={[isUnlocked(progress, m.id) ? m.difficulty : `🔒 ${t('bloqueada en la campaña')}`, m.budget_musd >= 10000 ? t('sin límite') : `${m.budget_musd} M$`, t('≥ {n} años', { n: m.min_lifetime_years })]} />
        ))}
      </Section>
    ) : (
      <div key="missionId" className="mission-brief">
        
        <span className="muted">💡 {mission.hint}</span>
        <span className="chips">
          <span className="chip">{mission.difficulty}</span>
          <span className="chip">💰 {mission.budget_musd} M$</span>
          <span className="chip">⏳ {t('≥ {n} años', { n: mission.min_lifetime_years })}</span>
        </span>
      </div>
    )),
    orbit: () => (
      <Section key="orbit" title={t('Órbita')} field="orbit" flash={flash?.field} help={t('La órbita define qué ves, cuánto tiempo hablas con Tierra, cuánta energía tienes y cuánto vive la nave.')}>
        {(locked) => catalog.orbits.map((o) => (
          <OptionCard key={o.id} option={o} selected={design.orbit === o.id} disabled={locked} onClick={() => set('orbit')(o.id)} onPreview={previewOf('orbit', o.id)}
            extra={[...(mission.preferred_orbits.includes(o.id) && missionId !== 'sandbox' ? [`⭐ ${t('recomendada')}`] : []), `${num(o.altitude_km)} km`, o.coverage, t('eclipse {pct}%', { pct: (o.eclipse_fraction * 100).toFixed(0) })]} />
        ))}
      </Section>
    ),
    launcher: () => (
      <Section key="launcher" title={t('Vehículo de lanzamiento')} field="launcher" flash={flash?.field} help={t('Mientras más alta la órbita, menos masa puede llevar un cohete.')}>
        {(locked) => catalog.launchers.filter((o) => visible(o, design.launcher)).map((o) => {
          const cap = o.capacity_kg[index.orbits[design.orbit].launch_class];
          return (
            <OptionCard key={o.id} option={o} selected={design.launcher === o.id} disabled={locked} onClick={() => set('launcher')(o.id)} onPreview={previewOf('launcher', o.id)}
              extra={[cap ? t('{kg} kg a esta órbita', { kg: num(cap) }) : `✗ ${t('no llega a esta órbita')}`,
                o.cost_per_kg_musd ? `${num(o.cost_per_kg_musd * 1e6)} $/kg` : `${o.cost_musd} M$`,
                t('{pct}% éxito', { pct: (o.reliability * 100).toFixed(1) })]} />
          );
        })}
      </Section>
    ),
    lifetimeYears: () => (
      <Section key="lifetimeYears" title={t('Vida útil planificada: {n} años', { n: design.lifetimeYears })} field="lifetimeYears" flash={flash?.field}
        help={t('Más años = más ciencia, pero más costo de operación y más tiempo expuesto a fallas y radiación.')}>
        {(locked) => (
          <input type="range" min="1" max="15" value={design.lifetimeYears} disabled={locked}
            onChange={(e) => set('lifetimeYears')(Number(e.target.value))} className="slider" />
        )}
      </Section>
    ),
    instruments: () => (
      <Section key="instruments" title={t('Instrumentos científicos')} field="instruments" flash={flash?.field}
        help={t('Cada instrumento suma ciencia, pero también masa, energía, datos y costo. Máximo {n} en esta estructura.', { n: index.components.structure[design.structure].max_instruments })}>
        {(locked) => catalog.instruments.filter((o) => visible(o, design.instruments) && (!!o.surface === onSurface || design.instruments.includes(o.id))).map((o) => {
          const rel = Math.max(0, ...o.tags.map((tag) => mission.objective_tags[tag] || 0));
          return (
            <OptionCard key={o.id} option={o} selected={design.instruments.includes(o.id)} disabled={locked}
              onClick={() => { setPreview(null); dispatch({ type: 'toggleInstrument', id: o.id }); }}
              onPreview={(on) => setPreview(on ? { instrument: o.id } : null)}
              extra={[...stats(o), t('{gb} GB/día', { gb: num(o.data_rate_mbps * o.duty_cycle * 10.8, 1) }), rel ? `${'★'.repeat(rel)} ${t('objetivo')}` : `☆ ${t('no aporta')}`]} />
          );
        })}
      </Section>
    ),
    // La movilidad solo aplica si la nave aterriza.
    mobility: () => (onSurface || design.mobility !== 'none' ? component('mobility') : null),
  };
  const section = (field) => (special[field] ? special[field]() : component(field));

  const readyCount = room ? room.players.filter((p) => game.ready[p.id]).length : 0;
  const iAmReady = !!(me && game.ready[me.id]);
  const total = room?.players.length;
  const launch = () => dispatch({ type: 'ready', value: !iAmReady });
  const stageTodo = guided ? pendingIn(tab) : [];
  // Orbi habla del paso en el que está el jugador, no de toda la lista.
  const guide = guided ? {
    label: t('Paso {n} de {total}', { n: stageIndex + 1, total: groups.length }),
    count: `${stageIndex + 1}/${groups.length}`,
    title: `${stage.icon} ${t(stage.label)}`,
    step: stageTodo[0] ?? (nextStage ? null : pending[0]) ?? null,
    text: tab === 'mission' ? t(stage.intro) : nextStage ? t('¡Este paso está listo! ✅ Pulsa "Siguiente" para continuar.') : null,
    action: false && nextStage && { label: `${t('Siguiente')} →`, run: () => goStage(nextStage.id) },
  } : null;

  return (
    <div className="designer">
      <header className="topbar">
        <div className="studio-brand"><Icon name="planet" /> MISIÓN: <b>BEYOND</b></div>
        <div className="topbar-title">
          <strong>{t('Estudio de diseño de misiones')}</strong>
          <span className="muted">{t('Configura tu misión paso a paso, valida su viabilidad y simula su operación en el espacio.')}</span>
        </div>
        {mode === 'multi' && <span className="room-code">{t('Sala')} <b>{room.code}</b></span>}
        <button className="ghost" onClick={leave}>{t('Salir')}</button>
        <div className="menu">
          <button className="ghost" onClick={() => setMenu(!menu)} aria-expanded={menu} title={t('Opciones')}>{t('Configuración')}</button>
          {menu && (
            <>
              <div className="menu-catcher" onClick={() => setMenu(false)} />
              <div className="menu-list">
                <LangPicker />
                <button className="ghost" onClick={() => { setMenu(false); setTutorial(true); }}>❓ {t('Ver tutorial')}</button>
                <button className="ghost" onClick={toggleMute}>{muted ? `🔇 ${t('Activar sonido')}` : `🔊 ${t('Silenciar')}`}</button>
                <label className="toggle">
                  <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} /> {t('Componentes avanzados')}
                </label>
              </div>
            </>
          )}
        </div>
        {/* En la ruta guiada el botón de lanzar se destaca al llegar al último paso. */}
        <button className={`${guided && nextStage && pending.length > 0 ? '' : 'primary'} launch ${iAmReady ? 'is-ready' : ''}`} onClick={launch}>
          {mode === 'multi'
            ? (iAmReady ? `✓ ${t('Listo')} (${readyCount}/${total})` : `🚀 ${t('Estoy listo')} (${readyCount}/${total})`)
            : `🚀 ${t('Simular misión')}`}
        </button>
      </header>

      <main className="layout">
        <div className="studio-navigation">
          {guided ? (
            <nav className="stepper" aria-label={t('Ruta de la misión')}>
              {STAGES.map((g, i) => {
                const todo = pendingIn(g.id).length > 0;
                const state = g.id === tab ? 'current' : !visited.has(g.id) ? '' : todo ? 'todo' : 'done';
                return (
                  <button key={g.id} className={`step ${state}`} onClick={() => goStage(g.id)} title={t(g.label)} aria-current={g.id === tab ? 'step' : undefined}>
                    <span className="step-dot">{state === 'done' ? '✓' : i + 1}</span>
                    <Icon name={{mission: "radar", orbit: "planet", science: "science", spacecraft: "satellite", comms: "antenna", launch: "rocket"}[g.id]} /><span>{t(g.label)}</span>
                  </button>
                );
              })}
            </nav>
          ) : (
            <nav className="tabs">
              {TABS.map((tb) => (
                <button key={tb.id} className={tab === tb.id ? 'active' : ''} onClick={() => { sfx.click(); setTab(tb.id); }}>
                  {tb.icon} {t(tb.label)}{pendingIn(tb.id).length > 0 && <span className="dot" title={t('Hay pasos pendientes aquí')} />}
                </button>
              ))}
            </nav>
          )}
          </div>
        <aside className="panel config"><div className="tab-body">
            {guided && (
              <header className="stage-head">
                <p className="eyebrow">{guide.label}</p>
                <h2>{tab === 'mission' ? mission.name : t(stage.label)}</h2>
                <p>{tab === 'mission' ? mission.description : t(stage.intro)}</p>
                {stageTodo.length > 0 && (
                  <ul className="stage-todo">
                    {stageTodo.map((s) => <li key={s.id}><button onClick={() => { sfx.click(); goStep(s); }}>👉 <b>{s.title}</b></button></li>)}
                  </ul>
                )}
              </header>
            )}
            {stage.sections.map(section)}
            {guided && !nextStage && <FlightPlan plan={plan} onGo={goStep} />}
            {guided && (
              <footer className="stage-nav">
                {stageIndex > 0 && <button onClick={() => goStage(groups[stageIndex - 1].id)}>← {t('Atrás')}</button>}
                <span style={{ flex: 1 }} />
                {nextStage
                  ? <button className="primary" onClick={() => goStage(nextStage.id)}>{t('Siguiente')}: {nextStage.icon} {t(nextStage.label)} →</button>
                  : <button className="primary big-start" onClick={launch}>🚀 {t('Simular misión')}</button>}
              </footer>
            )}
            <Copilot plan={plan} errors={analysis.errors} onGo={goStep} guide={guide} quiet={tutorial} newPlayer={Object.keys(progress.missions).length === 0} />
          </div>
        </aside>

        <section className="panel viewport">
          <Scene3D design={design} onPick={goTo} focusView={stage.view} />
          
        </section>

        <aside className="panel side">
          {!guided && <FlightPlan plan={plan} onGo={goStep} />}
          <Dashboard analysis={analysis} preview={previewAnalysis} onGo={goTo} />
          {mode === 'multi' && <TeamPanel />}
        </aside>
      </main>
      {tutorial && <Tutorial mission={mission} onClose={closeTutorial} />}
    </div>
  );
}
