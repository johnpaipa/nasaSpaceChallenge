import { sfx } from '../sound.js';
import { t } from '../../../shared/i18n.js';

/** Lista de pasos para ganar: cada uno se marca solo cuando se cumple. */
export default function FlightPlan({ plan, onGo }) {
  const done = plan.filter((s) => s.done).length;
  const next = plan.find((s) => !s.done);
  return (
    <div className="flight-plan">
      <h3>🗺️ {t('Plan de vuelo')} · {done}/{plan.length}</h3>
      <div className="bar big"><div className={`fill ${done === plan.length ? 'ok' : 'warn'}`} style={{ width: `${(done / plan.length) * 100}%` }} /></div>
      <ol>
        {plan.map((s) => (
          <li key={s.id} className={`${s.done ? 'done' : ''} ${s === next ? 'current' : ''}`}>
            <button onClick={() => { sfx.click(); onGo(s); }} title={s.text}>
              <span>{s.done ? '✅' : s === next ? '👉' : '⬜'}</span> {s.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
