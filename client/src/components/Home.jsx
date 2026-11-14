import { useState } from 'react';
import { useGame } from '../game.jsx';
import { index } from '../../../shared/catalog.js';
import { ROLES, defaultDesign } from '../../../shared/state.js';
import { t, num } from '../../../shared/i18n.js';
import { CHAPTERS, campaignTitle, BADGES, isUnlocked, rankFor, careerScore, missionPoints } from '../campaign.js';
import { BadgeGallery } from './Rewards.jsx';
import { LangPicker } from '../i18n.jsx';
import { sfx } from '../sound.js';

// Diseños listos para probar el modo exploración sin pasar por el diseñador.
const DEMOS = {
  mars_life: { orbit: 'mars_surface', launcher: 'atlas_v', solar: 'rtg', battery: 'b2000', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_m', lifetimeYears: 2, instruments: ['drill', 'rock_spectrometer', 'mastcam'] },
  moon_water: { orbit: 'moon_surface', launcher: 'falcon9', solar: 'deploy_s', battery: 'b2000', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_s', lifetimeYears: 1, instruments: ['neutron_spectrometer', 'ground_radar', 'mastcam'] },
};

const Stars = ({ n, max = 3 }) => (
  <span className="stars-inline">{Array.from({ length: max }, (_, i) => <span key={i} className={i < n ? 'on' : ''}>★</span>)}</span>
);

export default function Home() {
  const { startSolo, createRoom, joinRoom, error, startExplore, progress, resetCampaign } = useGame();
  // Por defecto: el primer capítulo desbloqueado que aún no tiene estrellas.
  const firstPending = CHAPTERS.find((c) => isUnlocked(progress, c.mission) && !(progress.missions[c.mission]?.stars > 0));
  const [missionId, setMissionId] = useState(firstPending?.mission ?? CHAPTERS[CHAPTERS.length - 1].mission);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [showBadges, setShowBadges] = useState(false);
  const rank = rankFor(progress);
  const chapter = CHAPTERS.find((c) => c.mission === missionId);
  const mission = index.missions[missionId];
  const badgeCount = Object.keys(progress.badges).length;

  return (
    <div className="home">
      <header className="home-hero">
        <div className="hero-top">
          <p className="eyebrow">NASA Space Apps Challenge</p>
          <LangPicker />
        </div>
        <h1>Mission Designer</h1>
        <p className="lead">
          {t('Diseña misiones espaciales completas: elige el objetivo, arma la nave, selecciona instrumentos, cohete y órbita… y descubre si sobrevive al espacio. Cada decisión tiene consecuencias.')}
        </p>
      </header>

      {/* Tarjeta de carrera */}
      <section className="career-card">
        <div className="career-rank">
          <span className="rank-icon">{rank.icon}</span>
          <div>
            <small className="muted">{t('Tu rango')}</small>
            <b>{rank.name}</b>
            {rank.next
              ? <small className="muted">{t('{n} ⭐ más para {rank}', { n: rank.next.stars - rank.stars, rank: `${rank.next.icon} ${rank.next.name}` })}</small>
              : <small className="muted">{t('¡Rango máximo!')}</small>}
            <div className="bar"><div className="fill ok" style={{ width: `${rank.next ? (rank.stars / rank.next.stars) * 100 : 100}%` }} /></div>
          </div>
        </div>
        <div className="career-stat"><b>🏆 {num(careerScore(progress))}</b><small>{t('puntos de carrera')}</small></div>
        <div className="career-stat"><b>⭐ {rank.stars}</b><small>{t('estrellas')}</small></div>
        <button className="career-stat link-like" onClick={() => setShowBadges(true)}><b>🏅 {badgeCount}/{BADGES.length}</b><small>{t('medallas · ver')}</small></button>
      </section>

      {/* Mapa de la campaña */}
      <section>
        <h2>🗺️ {t('Campaña')}: {campaignTitle()}</h2>
        <div className="campaign-path">
          {CHAPTERS.map((c, i) => {
            const m = progress.missions[c.mission];
            const open = isUnlocked(progress, c.mission);
            const surface = index.missions[c.mission].surface;
            return (
              <button key={c.mission} disabled={!open}
                className={`chapter ${open ? '' : 'locked'} ${missionId === c.mission ? 'selected' : ''} ${m?.stars ? 'done' : ''}`}
                onClick={() => { sfx.click(); setMissionId(c.mission); }}>
                <span className="chapter-num">{t('Cap. {n}', { n: i + 1 })}</span>
                <span className="chapter-icon">{open ? c.icon : '🔒'}</span>
                <b>{c.title}</b>
                <small className="muted">{index.missions[c.mission].name}</small>
                {open ? (
                  <span className="chapter-stars">
                    <Stars n={m?.stars ?? 0} />
                    {surface && <span title={t('Estrellas de exploración')}> 🕹️<Stars n={m?.exploreStars ?? 0} /></span>}
                  </span>
                ) : <small className="muted">{t('Gana ⭐ en el capítulo {n}', { n: i })}</small>}
                {m?.bestScore ? <small className="chapter-score">{t('Mejor: {score} ({grade}) · {pts} pts', { score: m.bestScore, grade: m.bestGrade, pts: missionPoints(m) })}</small> : null}
              </button>
            );
          })}
          <button className={`chapter sandbox ${missionId === 'sandbox' ? 'selected' : ''}`} onClick={() => setMissionId('sandbox')}>
            <span className="chapter-num">{t('Libre')}</span>
            <span className="chapter-icon">🧪</span>
            <b>{t('Modo libre')}</b>
            <small className="muted">{t('Sin límites, no suma puntos')}</small>
          </button>
        </div>

        <div className="chapter-brief">
          <div>
            <p className="eyebrow">{chapter ? t('Capítulo {n}', { n: CHAPTERS.indexOf(chapter) + 1 }) : t('Modo libre')} · {mission.difficulty}</p>
            <h3>{chapter ? `${chapter.icon} ${chapter.title}` : `🧪 ${t('Modo libre')}`}</h3>
            <p>{chapter ? chapter.story : mission.description}</p>
            <span className="mission-meta">🎯 {mission.name} · 💰 {mission.budget_musd >= 10000 ? '∞' : `${mission.budget_musd} M$`} · ⏳ {t('{n}+ años', { n: mission.min_lifetime_years })}</span>
          </div>
          <button className="primary big-start" onClick={() => { sfx.stepDone(); startSolo(missionId); }}>🚀 {chapter ? t('Comenzar capítulo') : t('Entrar al modo libre')}</button>
        </div>
      </section>

      <section className="how-to">
        <h2>{t('¿Cómo se juega?')}</h2>
        <ol>
          <li><span>🎯</span><b>{t('Elige un capítulo')}</b> — {t('cada uno es una misión real con su historia.')}</li>
          <li><span>🛠️</span><b>{t('Arma tu nave')}</b> — {t('cámaras, paneles, radio, cohete… Orbi 🤖 te guía paso a paso.')}</li>
          <li><span>🚦</span><b>{t('Deja todo en verde')}</b> — {t('sin pasarte de dinero, peso ni energía.')}</li>
          <li><span>🚀</span><b>{t('¡Lanza y gana estrellas!')}</b> — {t('desbloquea capítulos, sube de rango y colecciona medallas.')}</li>
        </ol>
      </section>

      <section className="demo-explore">
        <div>
          <h2>🕹️ {t('Modo exploración')}</h2>
          <p className="muted">{t('En los capítulos de la Luna y Marte, después de aterrizar manejas tu rover. ¿Quieres probarlo ya con un rover de ejemplo? (La demo no suma a la campaña.)')}</p>
        </div>
        <div className="row">
          <button onClick={() => startExplore({ ...defaultDesign(), ...DEMOS.mars_life }, 'mars_life', false)}>🔴 {t('Probar en Marte')}</button>
          <button onClick={() => startExplore({ ...defaultDesign(), ...DEMOS.moon_water }, 'moon_water', false)}>🌕 {t('Probar en la Luna')}</button>
        </div>
      </section>

      <section className="modes">
        <div className="mode-card">
          <h2>👥 {t('Jugar en equipo (hasta 4)')}</h2>
          <p className="muted">
            {t('Juega el capítulo elegido con tu equipo. Cada integrante toma un rol: {roles}. La simulación arranca cuando todos están listos.', { roles: Object.values(ROLES).map((r) => `${r.icon} ${r.name}`).join(' · ') })}
          </p>
          <input placeholder={t('Tu nombre')} value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
          <div className="row">
            <button className="primary" disabled={!name} onClick={() => createRoom(name, missionId)}>{t('Crear sala')}</button>
            <input placeholder={t('Código')} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} className="code-input" />
            <button disabled={!name || code.length !== 4} onClick={() => joinRoom(name, code)}>{t('Unirse')}</button>
          </div>
          {error && <p className="error-text">{t(error)}</p>}
        </div>
        <div className="mode-card">
          <h2>⚙️ {t('Progreso')}</h2>
          <p className="muted">{t('Tu progreso se guarda en este navegador. Puedes empezar la campaña desde cero (por ejemplo, para otro jugador).')}</p>
          <button onClick={() => { if (window.confirm(t('¿Borrar todo el progreso de la campaña?'))) resetCampaign(); }}>🗑️ {t('Reiniciar campaña')}</button>
        </div>
      </section>

      {showBadges && <BadgeGallery onClose={() => setShowBadges(false)} />}
    </div>
  );
}
