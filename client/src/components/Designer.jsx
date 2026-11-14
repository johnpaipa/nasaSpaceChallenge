import { useMemo, useState } from 'react';
import { useGame } from '../game.jsx';
import { catalog, index } from '../../../shared/catalog.js';
import { analyze } from '../../../shared/engine.js';
import { ROLES } from '../../../shared/state.js';
import { t, num } from '../../../shared/i18n.js';
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

function OptionCard({ option, selected, disabled, onClick, extra }) {
  return (
    <button className={`option ${selected ? 'selected' : ''}`} disabled={disabled} onClick={onClick} title={option.help}>
      <span className="option-name">
        {option.name} {option.tier === 'advanced' && <span className="badge adv">{t('avanzado')}</span>}
      </span>
      <span className="chips">{(extra || stats(option)).map((s) => <span key={s} className={`chip ${s.startsWith('⭐') || s.includes('★') ? 'good' : ''}`}>{s}</span>)}</span>
      {selected && option.help && <span className="option-help">{option.help}</span>}
    </button>
  );
}

function Section({ title, help, field, children }) {
  const { canEdit, ownerOf, mode } = useGame();
  const role = Object.entries(ROLES).find(([, r]) => r.fields.includes(field))?.[0];
  const owner = mode === 'multi' && ownerOf(role);
  const locked = !canEdit(field);
  return (
    <div className={`section ${locked ? 'locked' : ''}`}>
      <div className="section-head">
        <h3>{title}</h3>
        {locked && <span className="lock">🔒 {owner?.name} ({ROLES[role].name})</span>}
      </div>
      {help && <p className="help">{help}</p>}
      <div className="options">{children(locked)}</div>
    </div>
  );
}

const TABS = [
  { id: 'planner', icon: '🧭', label: 'Misión' },
  { id: 'spacecraft', icon: '🛰️', label: 'Nave' },
  { id: 'science', icon: '🔬', label: 'Ciencia' },
  { id: 'comms', icon: '📡', label: 'Comunicaciones' },
];

export default function Designer() {
  const { game, dispatch, mode, leave, me, room, progress } = useGame();
  const [tab, setTab] = useState(me?.roles.find((r) => ROLES[r]) || 'planner');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tutorial, setTutorial] = useState(() => { try { return !localStorage.getItem('smd-tutorial-seen'); } catch { return true; } });
  const [muted, setMutedState] = useState(isMuted());
  const { design, missionId } = game;
  const analysis = useMemo(() => analyze(design, missionId), [design, missionId]);
  const mission = index.missions[missionId];
  const plan = useMemo(() => flightPlan(design, analysis), [analysis]);
  const pendingTabs = new Set(plan.filter((s) => !s.done).map((s) => s.tab));
  const goTab = (id) => setTab(id);
  const closeTutorial = () => { setTutorial(false); try { localStorage.setItem('smd-tutorial-seen', '1'); } catch { /* sin almacenamiento */ } };
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted); };
  const set = (field) => (value) => dispatch({ type: 'set', field, value });
  // Instrumentos de superficie si la nave aterriza o si la misión es en la superficie.
  const onSurface = !!index.orbits[design.orbit].surface || !!mission.surface;
  const visible = (o, current) => showAdvanced || o.tier !== 'advanced' || o.id === current || (Array.isArray(current) && current.includes(o.id));

  const component = (key) => {
    const cat = catalog.categories[key];
    return (
      <Section key={key} title={cat.label} help={cat.help} field={key}>
        {(locked) => cat.options.filter((o) => visible(o, design[key]) || (o.id === 'rtg' && onSurface)).map((o) => (
          <OptionCard key={o.id} option={o} selected={design[key] === o.id} disabled={locked} onClick={() => set(key)(o.id)} />
        ))}
      </Section>
    );
  };

  const readyCount = room ? room.players.filter((p) => game.ready[p.id]).length : 0;
  const iAmReady = !!(me && game.ready[me.id]);
  const total = room?.players.length;

  return (
    <div className="designer">
      <header className="topbar">
        <button className="ghost" onClick={leave}>← {t('Salir')}</button>
        <div className="topbar-title">
          <strong>{mission.name}</strong>
          <span className="muted">{mission.description}</span>
        </div>
        <LangPicker compact />
        <button className="ghost" onClick={() => setTutorial(true)} title={t('Ver tutorial')}>❓ {t('Ayuda')}</button>
        <button className="ghost" onClick={toggleMute} title={muted ? t('Activar sonido') : t('Silenciar')}>{muted ? '🔇' : '🔊'}</button>
        <label className="toggle">
          <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} /> {t('Componentes avanzados')}
        </label>
        {mode === 'multi' && <span className="room-code">{t('Sala')} <b>{room.code}</b></span>}
        <button className={`primary launch ${iAmReady ? 'is-ready' : ''}`} onClick={() => dispatch({ type: 'ready', value: !iAmReady })}>
          {mode === 'multi'
            ? (iAmReady ? `✓ ${t('Listo')} (${readyCount}/${total})` : `🚀 ${t('Estoy listo')} (${readyCount}/${total})`)
            : `🚀 ${t('Simular misión')}`}
        </button>
      </header>

      <main className="layout">
        <aside className="panel config">
          <nav className="tabs">
            {TABS.map((tb) => (
              <button key={tb.id} className={tab === tb.id ? 'active' : ''} onClick={() => { sfx.click(); setTab(tb.id); }}>
                {tb.icon} {t(tb.label)}{pendingTabs.has(tb.id) && <span className="dot" title={t('Hay pasos pendientes aquí')} />}
              </button>
            ))}
          </nav>
          <div className="tab-body">
            {tab === 'planner' && (
              <>
                <Section title={t('Objetivo de la misión')} field="missionId" help={`💡 ${mission.hint}`}>
                  {(locked) => catalog.missions.map((m) => (
                    <OptionCard key={m.id} option={m} selected={missionId === m.id} disabled={locked || !isUnlocked(progress, m.id)} onClick={() => set('missionId')(m.id)}
                      extra={[isUnlocked(progress, m.id) ? m.difficulty : `🔒 ${t('bloqueada en la campaña')}`, m.budget_musd >= 10000 ? t('sin límite') : `${m.budget_musd} M$`, t('≥ {n} años', { n: m.min_lifetime_years })]} />
                  ))}
                </Section>
                <Section title={t('Órbita')} field="orbit" help={t('La órbita define qué ves, cuánto tiempo hablas con Tierra, cuánta energía tienes y cuánto vive la nave.')}>
                  {(locked) => catalog.orbits.map((o) => (
                    <OptionCard key={o.id} option={o} selected={design.orbit === o.id} disabled={locked} onClick={() => set('orbit')(o.id)}
                      extra={[...(mission.preferred_orbits.includes(o.id) && missionId !== 'sandbox' ? [`⭐ ${t('recomendada')}`] : []), `${num(o.altitude_km)} km`, o.coverage, t('eclipse {pct}%', { pct: (o.eclipse_fraction * 100).toFixed(0) })]} />
                  ))}
                </Section>
                <Section title={t('Vehículo de lanzamiento')} field="launcher" help={t('Mientras más alta la órbita, menos masa puede llevar un cohete.')}>
                  {(locked) => catalog.launchers.filter((o) => visible(o, design.launcher)).map((o) => {
                    const cap = o.capacity_kg[index.orbits[design.orbit].launch_class];
                    return (
                      <OptionCard key={o.id} option={o} selected={design.launcher === o.id} disabled={locked} onClick={() => set('launcher')(o.id)}
                        extra={[cap ? t('{kg} kg a esta órbita', { kg: num(cap) }) : `✗ ${t('no llega a esta órbita')}`,
                          o.cost_per_kg_musd ? `${num(o.cost_per_kg_musd * 1e6)} $/kg` : `${o.cost_musd} M$`,
                          t('{pct}% éxito', { pct: (o.reliability * 100).toFixed(1) })]} />
                    );
                  })}
                </Section>
                <Section title={t('Vida útil planificada: {n} años', { n: design.lifetimeYears })} field="lifetimeYears"
                  help={t('Más años = más ciencia, pero más costo de operación y más tiempo expuesto a fallas y radiación.')}>
                  {(locked) => (
                    <input type="range" min="1" max="15" value={design.lifetimeYears} disabled={locked}
                      onChange={(e) => set('lifetimeYears')(Number(e.target.value))} className="slider" />
                  )}
                </Section>
              </>
            )}
            {tab === 'spacecraft' && ['structure', ...(onSurface || design.mobility !== 'none' ? ['mobility'] : []), 'solar', 'battery', 'adcs', 'propulsion'].map(component)}
            {tab === 'science' && (
              <Section title={t('Instrumentos científicos')} field="instruments"
                help={t('Cada instrumento suma ciencia, pero también masa, energía, datos y costo. Máximo {n} en esta estructura.', { n: index.components.structure[design.structure].max_instruments })}>
                {(locked) => catalog.instruments.filter((o) => visible(o, design.instruments) && (!!o.surface === onSurface || design.instruments.includes(o.id))).map((o) => {
                  const rel = Math.max(0, ...o.tags.map((tag) => mission.objective_tags[tag] || 0));
                  return (
                    <OptionCard key={o.id} option={o} selected={design.instruments.includes(o.id)} disabled={locked}
                      onClick={() => dispatch({ type: 'toggleInstrument', id: o.id })}
                      extra={[...stats(o), t('{gb} GB/día', { gb: num(o.data_rate_mbps * o.duty_cycle * 10.8, 1) }), rel ? `${'★'.repeat(rel)} ${t('objetivo')}` : `☆ ${t('no aporta')}`]} />
                  );
                })}
              </Section>
            )}
            {tab === 'comms' && ['comms', 'computer'].map(component)}
          </div>
        </aside>

        <section className="panel viewport">
          <Scene3D design={design} />
          <Copilot plan={plan} errors={analysis.errors} onGo={goTab} />
        </section>

        <aside className="panel side">
          <FlightPlan plan={plan} onGo={goTab} />
          <Dashboard analysis={analysis} />
          {mode === 'multi' && <TeamPanel />}
        </aside>
      </main>
      {tutorial && <Tutorial mission={mission} onClose={closeTutorial} />}
    </div>
  );
}
