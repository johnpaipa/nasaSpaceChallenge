// Orbi, el copiloto: dice el siguiente paso, celebra los avances y
// avisa de problemas nuevos. Puede leer sus mensajes en voz alta.
import { useEffect, useRef, useState } from 'react';
import { sfx, speak, voiceOn, setVoice, stopSpeaking } from '../sound.js';
import { t } from '../../../shared/i18n.js';

export default function Copilot({ plan, errors, onGo }) {
  const next = plan.find((s) => !s.done);
  const doneCount = plan.filter((s) => s.done).length;
  const [celebrate, setCelebrate] = useState(null);
  const [voice, setVoiceState] = useState(voiceOn());
  const [minimized, setMinimized] = useState(false);
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
      : errors > 0
        ? t('Casi listo. Todavía hay algo en rojo en la Revisión de ingeniería (a la derecha). Ábrelo para ver qué pasa.')
        : t('¡Tu nave está lista! 🎉 Pulsa "🚀 Simular misión" arriba a la derecha para lanzarla al espacio.'));

  useEffect(() => { if (voice) speak(message); }, [message, voice]);
  useEffect(() => stopSpeaking, []);

  if (minimized)
    return <button className="copilot-mini" onClick={() => setMinimized(false)} title={t('Mostrar a Orbi')}>🤖 {doneCount}/{plan.length}</button>;

  return (
    <div className={`copilot ${celebrate ? 'celebrate' : ''}`}>
      <div className="copilot-avatar" aria-hidden>🤖</div>
      <div className="copilot-bubble">
        <div className="copilot-head">
          <b>Orbi · {t('tu copiloto')}</b>
          <span className="muted">{next && !celebrate ? t('Paso {n} de {total}', { n: plan.indexOf(next) + 1, total: plan.length }) : ''}</span>
          <button className="icon" onClick={() => setMinimized(true)} title={t('Minimizar')}>–</button>
        </div>
        {next && !celebrate && <p className="copilot-title">{next.title}</p>}
        <p>{message}</p>
        <div className="row copilot-actions">
          {next && !celebrate && <button className="primary small" onClick={() => { sfx.click(); onGo(next.tab); }}>👉 {t('Llévame ahí')}</button>}
          <button className="small" onClick={() => speak(message, true)} title={t('Leer en voz alta')}>🔊 {t('Escuchar')}</button>
          <label className="toggle">
            <input type="checkbox" checked={voice} onChange={(e) => { setVoice(e.target.checked); setVoiceState(e.target.checked); }} /> {t('Leer siempre')}
          </label>
        </div>
      </div>
    </div>
  );
}
