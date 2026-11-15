// Orbi, el copiloto: dice el siguiente paso, celebra los avances y
// avisa de problemas nuevos. Puede leer sus mensajes en voz alta.
// Vive en una línea compacta sobre la vista 3D; la burbuja completa se
// abre al tocarla o al celebrar un paso (y de entrada para quien juega
// por primera vez).
import { useEffect, useRef, useState } from 'react';
import { sfx, speak, voiceOn, setVoice, stopSpeaking } from '../sound.js';
import { t } from '../../../shared/i18n.js';

const OPEN_KEY = 'smd-orbi-open';
function savedOpen() { try { return localStorage.getItem(OPEN_KEY); } catch { return null; } }

/** `guide` (ruta guiada): { label, count, title, step, text, action } describe el paso actual;
 * sin `guide`, Orbi sigue el primer pendiente del plan de vuelo. */
export default function Copilot({ plan, errors, onGo, guide, newPlayer = false, quiet = false }) {
  const next = guide ? guide.step : plan.find((s) => !s.done);
  const doneCount = plan.filter((s) => s.done).length;
  const [celebrate, setCelebrate] = useState(null);
  const [voice, setVoiceState] = useState(voiceOn());
  const [open, setOpenState] = useState(() => { const saved = savedOpen(); return saved ? saved === '1' : newPlayer; });
  const setOpen = (v) => { setOpenState(v); try { localStorage.setItem(OPEN_KEY, v ? '1' : '0'); } catch { /* sin almacenamiento */ } };
  const prev = useRef({ doneIds: null, errors });

  // Detecta pasos recién completados o problemas nuevos.
  useEffect(() => {
    const doneIds = plan.filter((s) => s.done).map((s) => s.id);
    const before = prev.current.doneIds;
    if (before) {
      const fresh = plan.find((s) => s.done && !before.includes(s.id));
      if (fresh) {
        sfx.stepDone();
        setCelebrate(t('¡Bien hecho! ✅ {title}.', { title: fresh.title }));
        const timer = setTimeout(() => setCelebrate(null), 2800);
        prev.current = { doneIds, errors };
        return () => clearTimeout(timer);
      }
      if (errors > prev.current.errors) sfx.error();
    }
    prev.current = { doneIds, errors };
  }, [plan, errors]);

  const message = celebrate
    || (next
      ? next.text
      : guide?.text ? guide.text
      : errors > 0
        ? t('Casi listo. Todavía hay algo en rojo en la Revisión de ingeniería. Ábrelo para ver qué pasa.')
        : t('¡Tu nave está lista! 🎉 Pulsa "🚀 Simular misión" arriba a la derecha para lanzarla al espacio.'));

  // `quiet`: hay otra voz en curso (el tutorial); Orbi espera a que termine.
  useEffect(() => { if (voice && !quiet) speak(message); }, [message, voice, quiet]);
  const toggleVoice = (on) => { setVoice(on); setVoiceState(on); if (!on) stopSpeaking(); };
  useEffect(() => stopSpeaking, []);

  const go = next
    ? <button className="primary small" onClick={() => { sfx.click(); onGo(next); }}>👉 {t('Llévame ahí')}</button>
    : guide?.action && <button className="primary small" onClick={guide.action.run}>{guide.action.label}</button>;
  const title = next ? next.title : guide?.title;

  if (!open && !celebrate) {
    return (
      <div className="copilot-mini">
        <button className="copilot-mini-text" onClick={() => setOpen(true)} title={t('Mostrar a Orbi')} aria-expanded="false">
          <span aria-hidden>🤖</span> <b>{guide ? guide.count : `${doneCount}/${plan.length}`}</b> {title ?? message}
        </button>
        
        <button className="icon" onClick={() => toggleVoice(!voice)} title={voice ? t('Callar a Orbi') : t('Que Orbi lea en voz alta')} aria-pressed={voice}>{voice ? '🔊' : '🔇'}</button>
      </div>
    );
  }

  return (
    <div className={`copilot ${celebrate ? 'celebrate' : ''}`}>
      <div className="copilot-avatar" aria-hidden>🤖</div>
      <div className="copilot-bubble">
        <div className="copilot-head">
          <b>Orbi · {t('tu copiloto')}</b>
          <span className="muted">{celebrate ? '' : guide ? guide.label : next ? t('Paso {n} de {total}', { n: plan.indexOf(next) + 1, total: plan.length }) : ''}</span>
          <button className="icon" onClick={() => setOpen(false)} title={t('Minimizar')}>–</button>
        </div>
        {title && !celebrate && <p className="copilot-title">{title}</p>}
        <p>{message}</p>
        <div className="row copilot-actions">
          
          <button className="small" onClick={() => speak(message, true)} title={t('Leer en voz alta')}>🔊 {t('Escuchar')}</button>
          <label className="toggle">
            <input type="checkbox" checked={voice} onChange={(e) => toggleVoice(e.target.checked)} /> {t('Leer siempre')}
          </label>
        </div>
      </div>
    </div>
  );
}
