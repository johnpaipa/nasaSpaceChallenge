import { useEffect } from 'react';
import { useGame } from '../game.jsx';
import { BADGES, CHAPTERS, rankFor, careerScore } from '../campaign.js';
import { sfx } from '../sound.js';
import { t, num } from '../../../shared/i18n.js';

/** Recompensas obtenidas: puntos, medallas nuevas, capítulo desbloqueado y ascenso de rango. */
export default function Rewards({ out, compact = false }) {
  const { startSolo, progress, mode, leave } = useGame();
  useEffect(() => {
    if (!out || out.repeated) return;
    if (out.newBadges.length || out.unlocked || out.rankUp) setTimeout(sfx.win, 900);
  }, [out]);
  if (!out) return null;
  const rank = rankFor(progress);
  const chapterNum = out.unlocked ? CHAPTERS.findIndex((c) => c.mission === out.unlocked.mission) + 1 : 0;

  return (
    <div className={`rewards ${compact ? 'compact' : ''}`}>
      <div className="reward-points">
        <span className="big-points">{out.gained > 0 ? `+${out.gained}` : '+0'}</span>
        <span>
          {t('puntos de carrera')}
          {out.gained === 0 && <small className="muted"> · {t('supera tu mejor marca para sumar más')}</small>}
        </span>
        <span className="career">🏆 {num(careerScore(progress))} · {rank.icon} {rank.name}</span>
      </div>
      {out.rankUp && (
        <div className="reward-item rank-up">
          <span className="reward-icon">{out.rankUp.icon}</span>
          <div><b>{t('¡Ascenso! Ahora eres {rank}', { rank: out.rankUp.name })}</b><small>{t('Ganaste estrellas suficientes para subir de rango.')}</small></div>
        </div>
      )}
      {out.newBadges.map((b, i) => (
        <div key={b.id} className="reward-item badge-new" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
          <span className="reward-icon">{b.icon}</span>
          <div><b>{t('¡Nueva medalla: {name}!', { name: b.name })}</b><small>{b.desc} · {t('+100 puntos')}</small></div>
        </div>
      ))}
      {out.unlocked && (
        <div className="reward-item unlock">
          <span className="reward-icon">{out.unlocked.icon}</span>
          <div>
            <b>{t('¡Capítulo {n} desbloqueado: {title}!', { n: chapterNum, title: out.unlocked.title })}</b>
            <small>{out.unlocked.story}</small>
          </div>
          {!compact && mode !== 'multi' && <button className="primary" onClick={() => { sfx.stepDone(); startSolo(out.unlocked.mission); }}>▶ {t('Jugar')}</button>}
        </div>
      )}
    </div>
  );
}

/** Galería de medallas (ganadas en color, pendientes en gris). */
export function BadgeGallery({ onClose }) {
  const { progress } = useGame();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>🏅 {t('Medallas')} · {Object.keys(progress.badges).length}/{BADGES.length}</h2>
        <div className="badge-grid">
          {BADGES.map((b) => {
            const got = progress.badges[b.id];
            return (
              <div key={b.id} className={`badge-card ${got ? 'got' : ''}`}>
                <span className="reward-icon">{got ? b.icon : '🔒'}</span>
                <b>{b.name}</b>
                <small>{b.desc}</small>
              </div>
            );
          })}
        </div>
        <button className="primary" onClick={onClose}>{t('Cerrar')}</button>
      </div>
    </div>
  );
}
