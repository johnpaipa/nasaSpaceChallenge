// Cuenta regresiva y despegue antes de mostrar el resultado de la misión.
import { useEffect, useState } from 'react';
import { sfx } from '../sound.js';
import { t } from '../../../shared/i18n.js';

const STEPS = ['3', '2', '1', '¡Despegue!']; // el último se traduce al mostrarlo

export default function LaunchSequence({ onDone }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step < STEPS.length - 1) {
      sfx.beep(false);
      const timer = setTimeout(() => setStep(step + 1), 800);
      return () => clearTimeout(timer);
    }
    sfx.beep(true);
    sfx.launch();
    const timer = setTimeout(onDone, 2600);
    return () => clearTimeout(timer);
  }, [step]);

  const liftoff = step === STEPS.length - 1;
  return (
    <div className="launch-seq" onClick={onDone} title={t('Clic para saltar')}>
      <div className={`rocket ${liftoff ? 'liftoff' : ''}`}>🚀</div>
      <div key={step} className="countdown">{t(STEPS[step])}</div>
      <p className="muted">{t('Clic para saltar')}</p>
    </div>
  );
}
