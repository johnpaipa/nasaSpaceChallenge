import { useEffect, useState } from 'react';
import { TUTORIAL } from '../guide.js';
import { sfx, speak, stopSpeaking } from '../sound.js';
import { t } from '../../../shared/i18n.js';
import Modal from './Modal.jsx';

/** Tutorial de bienvenida en pocas diapositivas, con lenguaje sencillo. */
export default function Tutorial({ mission, onClose }) {
  const [i, setI] = useState(0);
  const slide = TUTORIAL[i];
  const last = i === TUTORIAL.length - 1;
  const go = (n) => { sfx.click(); setI(n); };
  // Orbi lee cada diapositiva (si la voz está encendida).
  useEffect(() => { speak(`${slide.title}\n${slide.text}`); }, [i]);
  useEffect(() => stopSpeaking, []);
  const onKey = (e) => {
    if (e.key === 'ArrowRight' && !last) go(i + 1);
    else if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
  };

  return (
    <Modal onClose={onClose} onKey={onKey}>
      <div className="modal-icon">{slide.icon}</div>
      <h2>{slide.title}</h2>
      <p>{slide.text}</p>
      {i === 0 && (
        <div className="mission-brief">
          <b>{t('Tu misión')}: {mission.name}</b>
          <span>{mission.description}</span>
          <span className="muted">💡 {t('Pista')}: {mission.hint}</span>
        </div>
      )}
      <div className="dots">{TUTORIAL.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
      <div className="row modal-actions">
        <button className="small" onClick={() => speak(`${slide.title}. ${slide.text}`, true)}>🔊 {t('Escuchar')}</button>
        <span style={{ flex: 1 }} />
        {i > 0 && <button onClick={() => go(i - 1)}>← {t('Atrás')}</button>}
        {last
          ? <button className="primary" onClick={() => { sfx.stepDone(); onClose(); }}>{t('¡A diseñar!')} 🚀</button>
          : <button className="primary" onClick={() => go(i + 1)}>{t('Siguiente')} →</button>}
      </div>
      {!last && <button className="link" onClick={onClose}>{t('Saltar tutorial')}</button>}
    </Modal>
  );
}
