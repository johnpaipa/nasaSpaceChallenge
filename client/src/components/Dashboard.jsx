import { useState } from 'react';
import { t, num } from '../../../shared/i18n.js';

// Cada barra lee [usado, disponible] del análisis; así la misma definición
// sirve para el diseño actual y para la vista previa de una opción.
const ROWS = [
  { id: 'budget', group: 'money', label: () => `💰 ${t('Presupuesto')}`, unit: () => 'M$', digits: 1, get: (a) => [a.cost.total, a.cost.budget],
    help: (a) => t('Hardware {hw} + integración {int} + lanzamiento {launch} + operaciones {ops} M$', { hw: num(a.cost.hardware, 1), int: num(a.cost.integration, 1), launch: num(a.cost.launch, 1), ops: num(a.cost.ops, 1) }) },
  { id: 'dev', group: 'money', label: () => `🛠️ ${t('Desarrollo')}`, unit: () => t('meses'), get: (a) => [a.time.devMonths, a.time.deadline],
    help: () => t('Tiempo para construir y probar la nave frente al plazo de la misión.') },
  { id: 'life', group: 'money', label: () => `⏳ ${t('Vida útil')}`, unit: () => t('años (mín.)'), digits: 1, goodWhenFull: true, get: (a) => [a.time.lifetime, a.time.minLifetime],
    help: (a) => t('Vida máxima posible en esta órbita: {n} años.', { n: num(a.time.maxLifetime) }) },
  { id: 'launch', group: 'ship', label: () => `🚀 ${t('Masa vs. cohete')}`, unit: () => 'kg', get: (a) => [a.mass.total, a.mass.launchCapacity],
    help: () => t('Masa total con 10% de margen de diseño frente a lo que el cohete puede llevar a la órbita elegida.') },
  { id: 'structure', group: 'ship', label: () => `🧱 ${t('Carga en estructura')}`, unit: () => 'kg', get: (a) => [a.mass.internal, a.mass.structureCapacity],
    help: () => t('Masa de equipos e instrumentos frente a lo que soporta la estructura.') },
  { id: 'power', group: 'ship', label: () => `⚡ ${t('Energía (promedio)')}`, unit: () => 'W', get: (a) => [a.power.consumption, a.power.generation],
    help: () => t('Consumo promedio de la nave frente a lo que generan los paneles (descontando eclipses y degradación).') },
  { id: 'battery', group: 'ship', label: () => `🔋 ${t('Batería en eclipse')}`, unit: () => 'Wh', get: (a) => [a.power.eclipseEnergy, a.power.batteryUsable],
    help: () => t('Energía necesaria durante el eclipse más largo frente a la energía usable de la batería.') },
  { id: 'data', group: 'science', label: () => `📡 ${t('Datos por día')}`, unit: () => 'GB', digits: 1, get: (a) => [a.data.generatedGB, a.data.downlinkGB],
    help: () => t('Datos generados por los instrumentos frente a lo que la radio puede bajar a Tierra cada día.') },
  { id: 'science', group: 'science', label: () => `🔬 ${t('Ciencia esperada')}`, unit: () => 'pts', goodWhenFull: true, get: (a) => [a.science.potential, a.science.target],
    help: () => t('Ciencia que se espera obtener (antes de eventos aleatorios) frente a la meta de la misión.') },
];

// Los avisos de la revisión de ingeniería se muestran junto a las barras de su grupo.
const GROUPS = [
  { id: 'money', title: () => t('Dinero y tiempo'), areas: () => [t('Tiempo')] },
  { id: 'ship', title: () => t('Nave'), areas: () => [t('Masa'), t('Lanzamiento'), t('Energía'), t('Movilidad'), t('Orientación'), t('Órbita')] },
  { id: 'science', title: () => t('Ciencia y datos'), areas: () => [t('Ciencia'), t('Datos')] },
];

const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' };
const ratioOf = ([used, available]) => (available > 0 ? used / available : used > 0 ? Infinity : 0);
/** Verde < 85%, ámbar < 100%, rojo si se excede (al revés en las metas que hay que alcanzar). */
const statusOf = (ratio, goodWhenFull) => (goodWhenFull
  ? (ratio >= 1 ? 'ok' : ratio >= 0.6 ? 'warn' : 'bad')
  : (ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'ok'));
const width = (ratio) => `${Math.min(100, ratio * 100)}%`;

function Resource({ row, a, preview, open, onToggle }) {
  const { digits = 0, goodWhenFull = false } = row;
  const now = row.get(a);
  const ratio = ratioOf(now);
  const status = statusOf(ratio, goodWhenFull);
  const fmt = ([used, available]) => `${num(used, digits)} / ${available > 0 ? num(available, digits) : '—'}`;
  // Vista previa: cómo quedaría esta barra con la opción bajo el cursor.
  const next = preview && row.get(preview);
  const changed = next && fmt(next) !== fmt(now);
  const nextRatio = changed ? ratioOf(next) : ratio;
  const better = goodWhenFull ? nextRatio > ratio : nextRatio < ratio;

  return (
    <div className="resource">
      <button className="resource-head" onClick={onToggle} aria-expanded={open}>
        <span>{row.label()}</span>
        <span className={`value ${status}`}>{fmt(now)} {row.unit()}</span>
      </button>
      <div className="bar">
        <div className={`fill ${status}`} style={{ width: width(ratio) }} />
        {changed && <div className={`bar-mark ${better ? 'ok' : 'bad'}`} style={{ left: width(nextRatio) }} />}
      </div>
      {changed && <div className={`preview-value value ${better ? 'ok' : 'bad'}`}>{nextRatio > ratio ? '▲' : '▼'} {fmt(next)} {row.unit()}</div>}
      {open && <p className="help">{row.help(a)}</p>}
    </div>
  );
}

function Issues({ issues }) {
  return (
    <ul className="issues">
      {issues.map((i, k) => (
        <li key={k} className={`issue ${i.severity}`}>
          <details>
            <summary>{ICON[i.severity]} <b>{i.area}:</b> {i.message}</summary>
            <p>{i.why}</p>
          </details>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard({ analysis: a, preview, onGo }) {
  const [open, setOpen] = useState(null);
  const grouped = GROUPS.map((g) => ({ ...g, issues: a.issues.filter((i) => g.areas().includes(i.area)) }));
  const others = a.issues.filter((i) => !grouped.some((g) => g.issues.includes(i)));

  return (
    <div className="dashboard">
      <h3>{t('Ingeniería de la misión')} {a.errors > 0 ? `· ${t('{n} crítico(s)', { n: a.errors })}` : `· ✓ ${t('sin errores críticos')}`}</h3>
      {grouped.map((g) => (
        <section key={g.id} className="resource-group">
          <h4>{g.title()}</h4>
          {ROWS.filter((r) => r.group === g.id).map((r) => (
            <Resource key={r.id} row={r} a={a} preview={preview} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} />
          ))}
          <Issues issues={g.issues} />
          {g.issues.length > 0 && <button onClick={() => onGo?.(g.id === 'science' ? 'instruments' : g.id === 'money' ? 'lifetimeYears' : 'structure')}>{t('Revisar')} →</button>}
        </section>
      ))}
      {others.length > 0 && <Issues issues={others} />}
      {a.issues.length === 0 && <p className="issue ok">{t('Diseño equilibrado. ¡Listo para simular!')}</p>}
    </div>
  );
}
