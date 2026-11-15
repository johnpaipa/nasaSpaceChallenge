// HUD del modo exploración: estado del rover, minimapa, mensajes de Orbi y
// controles táctiles. Solo dibuja lo que recibe; la lógica vive en Exploration.jsx.
import { useState } from 'react';
import { siteQuality } from './antenna.js';
import { t, num } from '../../../shared/i18n.js';

export const POI_COLOR = { pending: '#ffd54f', locked: '#78909c', collected: '#4fc3f7', sent: '#69f0ae' };

function Minimap({ sim, site, image, terrain }) {
  const s = 130 / site.size;
  const toMap = (x, z) => [65 - x * s, 65 - z * s]; // vista desde arriba con el norte (+z) hacia arriba
  const [rx, rz] = toMap(sim.x, sim.z);
  return (
    <svg className="minimap" viewBox="0 0 130 130" aria-label={t('Minimapa')}>
      <rect width="130" height="130" rx="8" />
      {image && <image href={image} x="0" y="0" width="130" height="130" preserveAspectRatio="none" opacity="0.9" />}
      {sim.difficulty.sand && terrain.sand.map((p, i) => {
        const [cx, cz] = toMap(p.x, p.z);
        return <circle key={i} cx={cx} cy={cz} r={p.r * s} className="sand" />;
      })}
      {site.pois.map((p) => {
        const [px, pz] = toMap(p.x, p.z);
        return <circle key={p.id} cx={px} cy={pz} r="4" fill={POI_COLOR[sim.pois[p.id]]} />;
      })}
      <g transform={`translate(${rx} ${rz}) rotate(${(-sim.heading * 180) / Math.PI})`}>
        <path d="M0,-6 L4,5 L0,3 L-4,5 Z" fill="#fff" />
      </g>
    </svg>
  );
}

/** Botón táctil que se mantiene presionado (para tablets). */
function HoldButton({ label, onChange }) {
  return (
    <button className="pad" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)}>{label}</button>
  );
}

const cmdArrow = (i) => (i.fwd > 0 ? '▲' : i.fwd < 0 ? '▼' : '') + (i.turn > 0 ? '◀' : i.turn < 0 ? '▶' : '') || '■';

export default function Hud({ sim, site, parts, terrain, difficulty, view, mapImage, message, input, canDeploy, debug,
  setInput, onDeploy, onFault, onToggleView, onAnalyze, onEnd, onExit }) {
  const [menu, setMenu] = useState(false);
  const faultOn = !!sim.fault;
  const deployOn = !!sim.deploy;
  const spot = !sim.antenna.deployed ? siteQuality(sim, terrain, sim.x, sim.z) : null;
  const nearPoi = sim.near && site.pois.find((p) => p.id === sim.near);
  const hours = Math.floor(sim.phase * site.hours_per_sol);
  const meters = (units) => num(Math.round(units * terrain.metersPerUnit));
  const steep = sim.slopeDeg > (sim.difficulty.warnTipDeg ?? 99);
  // Ruedas, polvo y pendiente solo aparecen cuando hay algo que atender.
  const wearAlert = difficulty !== 'explorer' && (sim.wheelHealth < 70 || sim.panelDust > 0.3 || steep || sim.inSand);

  return (
    <div className={`hud ${view === 'cabin' || view === 'arm' ? 'cabin-mode' : ''} ${faultOn || deployOn ? 'fault-mode' : ''}`}>
      <div className="hud-top">
        <div className="hud-card">
          <b>{site.name} <span className={`badge diff-${difficulty}`}>{sim.difficulty.icon} {sim.difficulty.name}</span></b>
          <span>{sim.isDay ? (sim.dust < 1 ? '🌪️' : '☀️') : '🌙'} {t('Sol')} {Math.min(sim.sol, sim.sols)}/{sim.sols} · {String(hours).padStart(2, '0')}:00 h</span>
          <div className="bar"><div className="fill ok" style={{ width: `${(sim.t / sim.totalTime) * 100}%` }} /></div>
          {sim.isDay && sim.faultsLeft > 0 && <small className="value warn">{t('🌙 Anochece en {s} s · ¡ojo con las fallas!', { s: Math.ceil(sim.nightIn ?? 0) })}</small>}
          {terrain.elevationAt && (
            <small className="muted">⛰️ {t('Altitud real')}: {num(Math.round(terrain.elevationAt(sim.x, sim.z)))} m · {t('recorrido')} {meters(sim.distance)} m</small>
          )}
        </div>
        <div className="hud-card">
          <span>🔋 {t('Batería')} {Math.round(sim.battery)} / {sim.cap} Wh</span>
          <div className="bar big"><div className={`fill ${sim.battery / sim.cap < 0.25 ? 'bad' : sim.battery / sim.cap < 0.5 ? 'warn' : 'ok'}`} style={{ width: `${(sim.battery / sim.cap) * 100}%` }} /></div>
          <small className={sim.flow >= 0 ? 'value ok' : 'value bad'}>
            {sim.flow >= 0 ? `▲ ${t('cargando')}` : `▼ ${t('gastando')}`} {Math.abs(Math.round(sim.flow))} W
            {sim.hibernating && ` · 😴 ${t('hibernando')}`}{sim.inShadow && ` · 🌑 ${t('sombra')}`}
          </small>
        </div>
        <div className="hud-card">
          <span>🔬 {t('Ciencia en la Tierra')}: <b>{sim.science}</b> / {sim.maxScience} · 📦 {Math.round(sim.queue.reduce((s, q) => s + q.remaining, 0))} MB</span>
          <span>{sim.transmitting ? (sim.relayActive ? t('📡 ¡Enviando a la Tierra!') : t('📡 Enviando por tu antena repetidora')) : sim.relayActive ? t('🛰️ {relay} disponible', { relay: site.relay.name }) : t('🛰️ Próximo contacto en {s} s', { s: Math.ceil(sim.relayIn) })}</span>
          {sim.antenna.deployed && <span className={sim.antennaLink ? 'value ok' : 'muted'}>📡 {t('Antena')}: {sim.antennaLink ? t('en alcance') : t('fuera de alcance')}</span>}
          {spot && <span>📍 {t('Lugar para antena')}: <b className="stars-inline">{[1, 2, 3].map((n) => <span key={n} className={n <= spot.stars ? 'on' : ''}>★</span>)}</b> <small className="muted">{spot.reasons[0]}</small></span>}
        </div>
        {wearAlert && (
          <div className="hud-card">
            <span>⚙️ {t('Ruedas')} {Math.round(sim.wheelHealth)}%</span>
            <div className="bar"><div className={`fill ${sim.wheelHealth < 40 ? 'bad' : sim.wheelHealth < 70 ? 'warn' : 'ok'}`} style={{ width: `${sim.wheelHealth}%` }} /></div>
            {!parts.solar.constant && <span>🟫 {t('Polvo en paneles')} {Math.round(sim.panelDust * 100)}%</span>}
            <span className={steep ? 'value bad' : ''}>📐 {t('Pendiente')} {Math.round(sim.slopeDeg)}°{sim.inSand && ` · 🏖️ ${t('arena')}`}</span>
          </div>
        )}
        {sim.signalDelay > 0 && (
          <div className="hud-card signal">
            <span>📡 {t('Retraso de señal')}: <b>{sim.signalDelay} s</b></span>
            <span>{t('Tú envías')}: <b>{cmdArrow(input)}</b> · {t('El rover hace')}: <b>{cmdArrow(sim.applied)}</b></span>
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button className="small" disabled={!canDeploy} onClick={onDeploy} title={t('Plantar la antena repetidora con el brazo robótico (tecla G)')}>📡 {t('Plantar antena')} (G)</button>
        <button className="small" disabled={faultOn} onClick={onToggleView}>{view === 'cabin' ? `🎥 ${t('Vista exterior')} (C)` : `🎥 ${t('Cabina')} (C)`}</button>
        <div className="menu">
          <button className="small" onClick={() => setMenu(!menu)} aria-expanded={menu} title={t('Opciones')}>☰</button>
          {menu && (
            <div className="menu-list">
              {debug && <button className="small" disabled={faultOn || deployOn} onClick={onFault} title={t('Dispara una falla ahora (tecla F)')}>🚨 {t('Probar falla')} (F)</button>}
              <button className="small" onClick={() => { setMenu(false); onEnd(); }}>🏁 {t('Terminar')}</button>
              <button className="small" onClick={onExit}>✕ {t('Salir')}</button>
            </div>
          )}
        </div>
      </div>

      <div className="hud-side">
        <Minimap sim={sim} site={site} image={mapImage} terrain={terrain} />
        <ul className="poi-list">
          {site.pois.map((p) => (
            <li key={p.id} style={{ color: POI_COLOR[sim.pois[p.id]] }}>
              {sim.pois[p.id] === 'sent' ? '✅' : sim.pois[p.id] === 'locked' ? '🔒' : p.icon} {p.name}
            </li>
          ))}
        </ul>
      </div>

      <div className="hud-bottom">
        <div className={`copilot-bubble explore-msg ${message.kind}`}>
          <span className="copilot-avatar small">🤖</span>
          <p>{message.text}</p>
        </div>
        {nearPoi && !sim.analyzing && !faultOn && (
          <button className="primary analyze" onClick={onAnalyze}>🔬 {t('ANALIZAR')} "{nearPoi.name}" (E)</button>
        )}
        {sim.analyzing && (
          <div className="analyzing">{t('Analizando…')} <div className="bar big"><div className="fill ok" style={{ width: `${sim.analyzing.progress * 100}%` }} /></div></div>
        )}
      </div>

      <div className="pads">
        <div />
        <HoldButton label="▲" onChange={(v) => setInput('fwd', v ? 1 : 0)} />
        <div />
        <HoldButton label="◀" onChange={(v) => setInput('turn', v ? 1 : 0)} />
        <HoldButton label="▼" onChange={(v) => setInput('fwd', v ? -1 : 0)} />
        <HoldButton label="▶" onChange={(v) => setInput('turn', v ? -1 : 0)} />
      </div>
      <div className="keys-help">{debug ? t('Mover: W A S D o flechas · Analizar: E · Cabina: C · Antena: G · Falla: F') : t('Mover: W A S D o flechas · Analizar: E · Cabina: C · Antena: G')}</div>
      {site.credit && <div className="dem-credit">{site.credit}</div>}
    </div>
  );
}
