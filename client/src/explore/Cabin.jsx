// Cabina del rover en primera persona: parabrisas + tablero con medidores y
// controles. Al anochecer, si aparece una falla, aquí se diagnostica y repara.
import { useEffect } from 'react';
import { currentStep, signalStrength } from './faults.js';
import { sfx, speak } from '../sound.js';
import { t } from '../../../shared/i18n.js';

function Gauge({ value, max, label, unit, warn = 0.5, bad = 0.25 }) {
  const ratio = Math.max(0, Math.min(1, value / max));
  const angle = -120 + ratio * 240;
  const color = ratio < bad ? 'var(--bad)' : ratio < warn ? 'var(--warn)' : 'var(--ok)';
  const arc = (r, a0, a1) => {
    const p = (a) => [50 + r * Math.cos(((a - 90) * Math.PI) / 180), 55 + r * Math.sin(((a - 90) * Math.PI) / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`;
  };
  return (
    <svg viewBox="0 0 100 80" className="gauge">
      <path d={arc(38, -120, 120)} className="gauge-track" />
      <path d={arc(38, -120, angle)} style={{ stroke: color }} className="gauge-fill" />
      <line x1="50" y1="55" x2={50 + 24 * Math.cos(((angle - 90) * Math.PI) / 180)} y2={55 + 24 * Math.sin(((angle - 90) * Math.PI) / 180)} className="gauge-needle" />
      <text x="50" y="70" className="gauge-value">{Math.round(value)}{unit}</text>
      <text x="50" y="79" className="gauge-label">{label}</text>
    </svg>
  );
}

function Toggle({ label, on, onChange, disabled, control, glow }) {
  return (
    <button className={`switch ${on ? 'on' : 'off'} ${glow ? 'glow' : ''}`} data-control={control} disabled={disabled}
      onClick={() => { sfx.toggle(); onChange(!on); }}>
      <span className="switch-lever" />
      <span>{label}</span>
      <small>{on ? t('ON') : t('OFF')}</small>
    </button>
  );
}

export default function Cabin({ sim, site, parts, terrain, onAction, view }) {
  const fault = sim.fault;
  const active = fault && !fault.solved;
  const p = fault?.panel;
  const stepIdx = fault ? currentStep(fault) : -1;
  const hintStep = active && fault.hints !== 'none' ? fault.steps[stepIdx] : null;
  const glowSet = new Set(fault?.hints === 'full' && hintStep ? hintStep.control.split(' ') : []);
  const glow = (c) => glowSet.has(c);
  const act = (a) => { onAction(a); };
  const signal = p ? signalStrength(p) : 100;

  // Alarma sonora intermitente mientras la falla siga activa (hasta silenciarla).
  useEffect(() => {
    if (!active || p.alarmSilenced) return;
    sfx.alarm();
    const id = setInterval(sfx.alarm, 1300);
    return () => clearInterval(id);
  }, [active, p?.alarmSilenced]);
  useEffect(() => { if (hintStep && fault.hints === 'full') speak(hintStep.hint); }, [fault?.id, stepIdx]);

  const night = !sim.isDay || sim.inShadow;
  const baseTemp = site.body === 'moon' ? (sim.inShadow ? -230 : night ? -170 : -40) : night ? -85 : -20;
  const batteryTemp = active && fault.id === 'heater' ? Math.round(-5 - fault.elapsed * 0.6) : 8;
  const amps = (i) => (p && p.diagDone && fault.id === 'wheel' && i === p.jammedWheel && !p.freeWheels[i] ? 9.8 : p?.freeWheels[i] ? 0 : 1.2);
  const timeLeft = active ? Math.max(0, Math.ceil(fault.limit - fault.elapsed)) : 0;
  const lines = p ? p.log.slice(-6) : [
    t('> Todos los sistemas nominales ✅'),
    t('> Energía: {gen} W generados · {use} W consumidos', { gen: Math.round(sim.generation), use: Math.round(sim.load) }),
    t('> Computadora {pc} · Radio {radio}', { pc: parts.computer.name, radio: parts.comms.name }),
    t(night ? '> Temperatura exterior {temp} °C · calefactores activos' : '> Temperatura exterior {temp} °C', { temp: baseTemp }),
  ];

  return (
    <div className={`cabin ${active ? 'alarm' : ''} ${view === 'cabin' ? '' : 'hidden'}`}>
      <div className="windshield" />
      <div className="pillar left" /><div className="pillar right" />
      {active && !p.alarmSilenced && <div className="alarm-light" />}

      <div className="dashboard">
        {/* Medidores */}
        <section className="dash-col gauges">
          <Gauge value={(sim.battery / sim.cap) * 100} max={100} label={t('BATERÍA')} unit="%" />
          <Gauge value={sim.wheelHealth} max={100} label={t('RUEDAS')} unit="%" warn={0.7} bad={0.4} />
          <div className="readouts">
            <span>⚡ {Math.round(sim.generation)} W / {Math.round(sim.load)} W</span>
            <span>🌡️ {t('Exterior')} {baseTemp} °C</span>
            <span className={batteryTemp < -15 ? 'value bad' : ''}>🔋 {t('Batería')} {batteryTemp} °C</span>
            <span>📐 {t('Pendiente')} {Math.round(sim.slopeDeg)}°</span>
            <span>🧭 {t('Rumbo')} {Math.round((((-sim.heading * 180) / Math.PI) % 360 + 360) % 360)}°</span>
            {terrain.elevationAt && <span>⛰️ {Math.round(terrain.elevationAt(sim.x, sim.z))} m</span>}
          </div>
        </section>

        {/* Consola */}
        <section className="dash-col console">
          <div className={`screen ${active ? 'red' : ''}`}>
            {active && <div className="screen-title">{fault.icon} {fault.title} <span className="timer">⏱ {timeLeft} s</span></div>}
            {active && <div className="bar"><div className={`fill ${timeLeft < 20 ? 'bad' : 'warn'}`} style={{ width: `${(timeLeft / fault.limit) * 100}%` }} /></div>}
            {lines.map((l, i) => <div key={i} className="screen-line">{l}</div>)}
            {fault?.rebooting > 0 && <div className="screen-line blink">▓▓▓ {t('reiniciando…')} ▓▓▓</div>}
          </div>
          {hintStep && <div className="hint">🤖 {t('Paso {n}/{total}', { n: stepIdx + 1, total: fault.steps.length })}: {hintStep.hint}</div>}
          {active && fault.hints === 'none' && <div className="hint muted">🧑‍🚀 {t('Modo Comandante: sin pistas. ¡Lee el diagnóstico!')}</div>}
          <div className="row">
            <button className={`dash-btn diag ${glow('diag') ? 'glow' : ''}`} disabled={!active} onClick={() => { sfx.click(); act({ type: 'diag' }); }}>🔍 {t('DIAGNÓSTICO')}</button>
            <button className="dash-btn master" disabled={!active || p.alarmSilenced} onClick={() => act({ type: 'silence' })}>🔕 {t('MASTER ALARM')}</button>
          </div>
        </section>

        {/* Controles */}
        <section className="dash-col controls">
          <div className="ctl-group">
            <h4>{t('Circuitos')}</h4>
            <div className="switches">
              {[['instr', 'Instrumentos'], ['cameras', 'Cámaras'], ['radio', 'Radio'], ['motors', 'Motores']].map(([id, label]) => (
                <Toggle key={id} label={t(label)} on={p ? p.circuits[id] : true} disabled={!active} control={`circuit-${id}`} glow={glow(`circuit-${id}`)}
                  onChange={(on) => act({ type: 'circuit', id, on })} />
              ))}
            </div>
          </div>
          <div className="ctl-group">
            <h4>{t('Interruptor principal')}</h4>
            <div className="row">
              <span className={`led ${p?.breakerTripped ? 'red' : 'green'}`} />
              <button className={`dash-btn ${glow('breaker') ? 'glow' : ''}`} disabled={!active} onClick={() => { sfx.clunk(); act({ type: 'breaker' }); }}>{t('RESET')}</button>
            </div>
            <h4>{t('Calefactor de respaldo')}</h4>
            <Toggle label={t('Respaldo')} on={p ? p.heaterBackup : false} disabled={!active} control="heater" glow={glow('heater')}
              onChange={(on) => act({ type: 'heater', on })} />
          </div>
          <div className="ctl-group">
            <h4>{t('Computadora')}</h4>
            <div className={`row seg ${glow('computer') ? 'glow' : ''}`}>
              {['A', 'B'].map((side) => (
                <button key={side} className={`dash-btn ${(p?.computer ?? 'A') === side ? 'selected' : ''}`} disabled={!active}
                  onClick={() => { sfx.toggle(); act({ type: 'computer', side }); }}>{side}</button>
              ))}
              <button className={`dash-btn ${glow('reboot') ? 'glow' : ''}`} disabled={!active || fault.rebooting > 0} onClick={() => { sfx.click(); act({ type: 'reboot' }); }}>⟳ {t('REINICIAR')}</button>
            </div>
            <h4>{t('Antena · señal {pct}%', { pct: signal })}</h4>
            <div className={`antenna ${glow('antenna') ? 'glow' : ''}`}>
              <input type="range" min="0" max="359" value={p ? Math.round(p.antennaAngle) : 0} disabled={!active}
                onChange={(e) => act({ type: 'antenna', angle: Number(e.target.value) })} />
              <div className="bar"><div className={`fill ${signal >= 90 ? 'ok' : signal > 40 ? 'warn' : 'bad'}`} style={{ width: `${signal}%` }} /></div>
              <button className={`dash-btn ${glow('lock') ? 'glow' : ''}`} disabled={!active} onClick={() => { sfx.click(); act({ type: 'lock' }); }}>📌 {t('FIJAR')}</button>
            </div>
          </div>
          <div className="ctl-group">
            <h4>{t('Ruedas (vista de arriba)')}</h4>
            <div className={`wheel-map ${glow('wheels') ? 'glow' : ''}`}>
              {[0, 3, 1, 4, 2, 5].map((i) => (
                <button key={i} disabled={!active}
                  className={`wheel-btn ${amps(i) > 5 ? 'hot' : ''} ${p?.freeWheels[i] ? 'free' : ''}`}
                  onClick={() => { sfx.toggle(); act({ type: 'wheel', i }); }}>
                  {i + 1}<small>{p?.freeWheels[i] ? t('LIBRE') : p?.diagDone ? `${amps(i)} A` : ''}</small>
                </button>
              ))}
            </div>
            <button className={`dash-btn ${glow('test') ? 'glow' : ''}`} disabled={!active} onClick={() => { sfx.click(); act({ type: 'test' }); }}>▶ {t('PROBAR MOTORES')}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
