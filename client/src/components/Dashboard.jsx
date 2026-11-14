import { t, num } from '../../../shared/i18n.js';

/** Barra de uso de un recurso: verde < 85%, ámbar < 100%, rojo si se excede. */
function Resource({ label, used, available, unit, help, digits = 0, goodWhenFull = false }) {
  const ratio = available > 0 ? used / available : used > 0 ? Infinity : 0;
  const status = goodWhenFull
    ? (ratio >= 1 ? 'ok' : ratio >= 0.6 ? 'warn' : 'bad')
    : (ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'ok');
  return (
    <div className="resource" title={help}>
      <div className="resource-head">
        <span>{label}</span>
        <span className={`value ${status}`}>
          {num(used, digits)} / {available > 0 ? num(available, digits) : '—'} {unit}
        </span>
      </div>
      <div className="bar"><div className={`fill ${status}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
    </div>
  );
}

const ICON = { error: '⛔', warning: '⚠️', info: 'ℹ️' };

export default function Dashboard({ analysis: a }) {
  return (
    <div className="dashboard">
      <h3>{t('Presupuestos de la misión')}</h3>
      <Resource label={`💰 ${t('Presupuesto')}`} used={a.cost.total} available={a.cost.budget} unit="M$" digits={1}
        help={t('Hardware {hw} + integración {int} + lanzamiento {launch} + operaciones {ops} M$', { hw: num(a.cost.hardware, 1), int: num(a.cost.integration, 1), launch: num(a.cost.launch, 1), ops: num(a.cost.ops, 1) })} />
      <Resource label={`🚀 ${t('Masa vs. cohete')}`} used={a.mass.total} available={a.mass.launchCapacity} unit="kg"
        help={t('Masa total con 10% de margen de diseño frente a lo que el cohete puede llevar a la órbita elegida.')} />
      <Resource label={`🧱 ${t('Carga en estructura')}`} used={a.mass.internal} available={a.mass.structureCapacity} unit="kg"
        help={t('Masa de equipos e instrumentos frente a lo que soporta la estructura.')} />
      <Resource label={`⚡ ${t('Energía (promedio)')}`} used={a.power.consumption} available={a.power.generation} unit="W"
        help={t('Consumo promedio de la nave frente a lo que generan los paneles (descontando eclipses y degradación).')} />
      <Resource label={`🔋 ${t('Batería en eclipse')}`} used={a.power.eclipseEnergy} available={a.power.batteryUsable} unit="Wh"
        help={t('Energía necesaria durante el eclipse más largo frente a la energía usable de la batería.')} />
      <Resource label={`📡 ${t('Datos por día')}`} used={a.data.generatedGB} available={a.data.downlinkGB} unit="GB" digits={1}
        help={t('Datos generados por los instrumentos frente a lo que la radio puede bajar a Tierra cada día.')} />
      <Resource label={`🛠️ ${t('Desarrollo')}`} used={a.time.devMonths} available={a.time.deadline} unit={t('meses')}
        help={t('Tiempo para construir y probar la nave frente al plazo de la misión.')} />
      <Resource label={`⏳ ${t('Vida útil')}`} used={a.time.lifetime} available={a.time.minLifetime} unit={t('años (mín.)')} goodWhenFull digits={1}
        help={t('Vida máxima posible en esta órbita: {n} años.', { n: num(a.time.maxLifetime) })} />
      <Resource label={`🔬 ${t('Ciencia esperada')}`} used={a.science.potential} available={a.science.target} unit="pts" goodWhenFull
        help={t('Ciencia que se espera obtener (antes de eventos aleatorios) frente a la meta de la misión.')} />

      <h3>{t('Revisión de ingeniería')} {a.errors > 0 ? `· ${t('{n} crítico(s)', { n: a.errors })}` : `· ✓ ${t('sin errores críticos')}`}</h3>
      <ul className="issues">
        {a.issues.length === 0 && <li className="issue ok">{t('Diseño equilibrado. ¡Listo para simular!')}</li>}
        {a.issues.map((i, k) => (
          <li key={k} className={`issue ${i.severity}`}>
            <details>
              <summary>{ICON[i.severity]} <b>{i.area}:</b> {i.message}</summary>
              <p>{i.why}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
