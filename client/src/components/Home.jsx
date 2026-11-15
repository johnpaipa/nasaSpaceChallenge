// Pantalla de inicio "MISIÓN: BEYOND": barra lateral con la Tierra en video,
// cabecera con el progreso, cuadrícula de capítulos con su detalle, equipo,
// exploración y modo libre. Solo presenta: el progreso y las reglas vienen de
// campaign.js y el arranque de cada modo, de game.jsx.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game.jsx';
import { index } from '../../../shared/catalog.js';
import { ROLES, defaultDesign } from '../../../shared/state.js';
import { t, num } from '../../../shared/i18n.js';
import { CHAPTERS, campaignTitle, BADGES, AVATARS, loadAvatar, saveAvatar, isUnlocked, rankFor, careerScore, missionPoints } from '../campaign.js';
import { REAL, LIFECYCLE, RESOURCES } from '../campaignInfo.js';
import { BadgeGallery } from './Rewards.jsx';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { LangPicker } from '../i18n.jsx';
import { sfx, prefersReducedMotion } from '../sound.js';

// Diseños listos para probar el modo exploración sin pasar por el diseñador.
const DEMOS = {
  mars_life: { orbit: 'mars_surface', launcher: 'atlas_v', solar: 'rtg', battery: 'b2000', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_m', lifetimeYears: 2, instruments: ['drill', 'rock_spectrometer', 'mastcam'] },
  moon_water: { orbit: 'moon_surface', launcher: 'falcon9', solar: 'deploy_s', battery: 'b2000', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_s', lifetimeYears: 1, instruments: ['neutron_spectrometer', 'ground_radar', 'mastcam'] },
};

const NAV = [
  { id: 'campaign', icon: 'layers', label: () => t('Campaña') },
  { id: 'explore', icon: 'planet', label: () => t('Exploración') },
  { id: 'free', icon: 'satellite', label: () => t('Modo libre') },
  { id: 'team', icon: 'users', label: () => t('Equipo') },
];

const SMALL_SCREEN = '(max-width: 900px)';

function useMedia(query) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return match;
}

const Stars = ({ n, max = 3 }) => (
  <span className="star-row" role="img" aria-label={t('{n} de {max} estrellas', { n, max })}>
    {Array.from({ length: max }, (_, i) => <Icon key={i} name="star" size={18} fill={i < n} className={i < n ? 'on' : ''} />)}
  </span>
);

/** Fondo de la barra lateral: la Tierra de noche vista desde la Estación Espacial. */
function EarthBackdrop({ playing, still, onBlocked }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (playing) video.play().catch(onBlocked);
    else video.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, still]);
  // En pantallas pequeñas la barra es un menú: basta la foto, sin descargar el video.
  if (still) return <img className="side-video" src="/home/earth-poster.jpg" alt="" width="480" height="1440" />;
  return (
    <video ref={ref} className="side-video" muted loop playsInline preload={playing ? 'auto' : 'none'}
      poster="/home/earth-poster.jpg" aria-hidden="true" tabIndex={-1} disablePictureInPicture>
      <source src="/home/earth.webm" type="video/webm" />
      <source src="/home/earth.mp4" type="video/mp4" />
    </video>
  );
}

/** Crear una sala o unirse a una: nombre, capítulo y código, con las mismas validaciones de siempre. */
function TeamDialog({ kind, progress, missionId, onClose }) {
  const { createRoom, joinRoom } = useGame();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mission, setMission] = useState(missionId);
  const creating = kind === 'create';
  const valid = name.trim() && (creating || code.length === 4);
  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    if (creating) createRoom(name.trim(), mission); else joinRoom(name.trim(), code);
  };
  return (
    <Modal onClose={onClose}>
      <form className="team-form" onSubmit={submit}>
        <h2>{creating ? t('Crear sala') : t('Unirse a una sala')}</h2>
        <label>
          <span>{t('Tu nombre')}</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={20} />
        </label>
        {creating ? (
          <label>
            <span>{t('Misión')}</span>
            <select value={mission} onChange={(e) => setMission(e.target.value)}>
              {CHAPTERS.filter((c) => isUnlocked(progress, c.mission)).map((c) => (
                <option key={c.mission} value={c.mission}>{CHAPTERS.indexOf(c) + 1}. {c.title}</option>
              ))}
              <option value="sandbox">{t('Modo libre')}</option>
            </select>
          </label>
        ) : (
          <label>
            <span>{t('Código')}</span>
            <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} />
          </label>
        )}
        <div className="row modal-actions">
          <button type="button" onClick={onClose}>{t('Cancelar')}</button>
          <span style={{ flex: 1 }} />
          <button type="submit" className="primary" disabled={!valid}>{creating ? t('Crear sala') : t('Unirse')}</button>
        </div>
      </form>
    </Modal>
  );
}

function ControlsDialog({ onClose }) {
  return <Modal onClose={onClose}><h2>Controles del rover</h2><p><b>W / ↑</b> avanzar · <b>S / ↓</b> retroceder · <b>A / ←</b> girar a la izquierda · <b>D / →</b> girar a la derecha.</p><p><b>E / Espacio</b> analizar un sitio · <b>C</b> cambiar cámara · <b>G</b> desplegar antena. En móvil aparecen controles táctiles.</p><p>Acércate a un marcador para analizarlo. Las muestras y la antena dependen de los instrumentos de tu nave.</p><button className="primary" onClick={onClose}>Entendido</button></Modal>;
}

/** Lo real detrás del capítulo: la foto, la misión en la que se inspira y cómo diseña la NASA. */
function RealInfo({ real, onClose }) {
  return (
    <Modal onClose={onClose} wide>
      <div className="real-info">
        <figure>
          <img src={real.image} alt={real.caption()} width="960" height="720" />
          <figcaption>{real.caption()} <span className="faint">{t('Foto')}: {real.credit}</span></figcaption>
        </figure>
        <div>
          <h2>{t('La misión real')}: {real.real}</h2>
          <p>{real.realText()}</p>
          <h3>{t('¿Sabías que…?')}</h3>
          <p>{real.fact()}</p>
        </div>
      </div>
      <div className="lifecycle">
        <h3>{t('Así se diseña una misión de verdad')}</h3>
        <p className="muted">{t('Son los pasos que sigue la NASA, y los que vas a seguir en cada capítulo.')}</p>
        <ol>
          {LIFECYCLE.map((s, i) => <li key={i}><b>{i + 1}. {s.title()}</b><small>{s.text()}</small></li>)}
        </ol>
      </div>
      <button className="primary" onClick={onClose}>{t('Cerrar')}</button>
    </Modal>
  );
}

export default function Home() {
  const { startSolo, error, startExplore, progress, resetCampaign, createRoom, joinRoom, room } = useGame();
  // Por defecto: el primer capítulo desbloqueado que aún no tiene estrellas.
  const firstPending = CHAPTERS.find((c) => isUnlocked(progress, c.mission) && !(progress.missions[c.mission]?.stars > 0));
  const [missionId, setMissionId] = useState(firstPending?.mission ?? CHAPTERS[CHAPTERS.length - 1].mission);
  const [dialog, setDialog] = useState(null); // 'badges' | 'avatar' | 'reset' | 'create' | 'join' | 'real'
  const [avatar, setAvatar] = useState(loadAvatar);
  const [section, setSection] = useState('campaign');
  const [drawer, setDrawer] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [preset, setPreset] = useState('sso_700');
  const [teamName, setTeamName] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const small = useMedia(SMALL_SCREEN);
  const [playing] = useState(() => !prefersReducedMotion());
  const main = useRef(null);

  const close = () => setDialog(null);
  const chooseAvatar = (a) => { sfx.select(); saveAvatar(a); setAvatar(a); close(); };
  const goTo = (id) => {
    setSection(id);
    setDrawer(false);
    requestAnimationFrame(() => document.getElementById(`home-${id}`)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }));
  };

  // La navegación marca la sección que se está viendo al desplazarse.
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.find((e) => e.isIntersecting);
      if (seen) setSection(seen.target.id.replace('home-', ''));
    }, { root: main.current, rootMargin: '-30% 0px -60% 0px' });
    NAV.forEach((n) => { const el = document.getElementById(`home-${n.id}`); if (el) observer.observe(el); });
    return () => observer.disconnect();
  }, []);

  const isNew = Object.keys(progress.missions).length === 0 && Object.keys(progress.badges).length === 0;
  const rank = rankFor(progress);
  const chapter = CHAPTERS.find((c) => c.mission === missionId);
  const chapterNum = CHAPTERS.indexOf(chapter) + 1;
  const mission = index.missions[missionId];
  const best = progress.missions[missionId];
  const real = REAL[missionId];
  const badgeCount = Object.keys(progress.badges).length;
  const nextRank = rank.next
    ? t('{n} ⭐ más para {rank}', { n: rank.next.stars - rank.stars, rank: rank.next.name })
    : t('¡Rango máximo!');
  const freeDesigns = {
    sso_700: { orbit:'sso_700', launcher:'rideshare', instruments:['thermal_camera'], lifetimeYears:3 },
    moon_surface: { orbit:'moon_surface', launcher:'falcon9', solar:'deploy_s', battery:'b2000', comms:'x_band', propulsion:'hydrazine', mobility:'rover_s', instruments:['neutron_spectrometer','mastcam'], lifetimeYears:1 },
    mars_surface: { ...DEMOS.mars_life },
  };
  const freeScenarios = [
    { id:'sso_700', title:'Órbita terrestre', text:'Observa la Tierra desde una órbita heliosíncrona.', image:'/home/earth-poster.jpg', icon:'globe' },
    { id:'moon_surface', title:'Destino lunar', text:'Prepara un rover para explorar el polo sur lunar.', image:'/home/mars.jpg', icon:'moon' },
    { id:'mars_surface', title:'Rumbo a Marte', text:'Diseña una nave para estudiar el antiguo delta de Jezero.', image:'/campaign/mars_life.jpg', icon:'rover' },
  ];

  return (
    <div className="home-shell">
      <aside className={`side ${drawer ? 'open' : ''}`} aria-label={t('Menú principal')}>
        <EarthBackdrop playing={playing} still={small} onBlocked={() => { /* el poster sigue visible si el navegador bloquea autoplay */ }} />
        <div className="side-shade" />
        <div className="side-inner">
          <button className="icon-btn side-close" onClick={() => setDrawer(false)} aria-label={t('Cerrar el menú')}><Icon name="close" size={18} /></button>
          <div className="brand">
            <b>MISIÓN:<br />BEYOND</b>
            <span>{t('DISEÑA, DECIDE, DESPEGA')}</span>
          </div>
          <nav className="side-nav">
            {NAV.map((n) => (
              <button key={n.id} className={section === n.id ? 'active' : ''} aria-current={section === n.id ? 'true' : undefined} onClick={() => goTo(n.id)}>
                <Icon name={n.icon} size={24} /> {n.label()}
              </button>
            ))}
          </nav>
          <div className="side-profile">
            <div className="side-rank">
              <button className="avatar" onClick={() => setDialog('avatar')} aria-label={t('Cambiar avatar')} title={t('Cambiar avatar')}>{avatar}</button>
              <div>
                <b>{rank.name}</b>
                <small>{t('Rango actual')}</small>
              </div>
            </div>
            <div className="rank-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100}
              aria-valuenow={Math.round(rank.next ? (rank.stars / rank.next.stars) * 100 : 100)} aria-label={nextRank} title={nextRank}>
              <div style={{ width: `${rank.next ? (rank.stars / rank.next.stars) * 100 : 100}%` }} />
            </div>
          </div>
        </div>
      </aside>
      {drawer && <div className="side-scrim" onClick={() => setDrawer(false)} />}

      <main className="home-main" ref={main}>
        <div className="mobile-bar">
          <button className="icon-btn" onClick={() => setDrawer(true)} aria-label={t('Abrir el menú')} aria-expanded={drawer}><Icon name="menu" /></button>
          <b className="brand-inline">MISIÓN: BEYOND</b>
        </div>

        <header className="home-head" hidden={section !== 'campaign'}>
          <div className="home-hello">
            <p className="kicker"><span aria-hidden="true">//</span> MISSION CONTROL</p>
            <h1>{t('¡Hola, {rank}!', { rank: rank.name })}</h1>
            <p className="lead">
              {t('Diseña misiones espaciales completas: elige el objetivo, arma la nave, selecciona instrumentos, cohete y órbita… y descubre si sobrevive al espacio. Cada decisión tiene consecuencias.')}
            </p>
          </div>
          <label className="lang-wrap"><Icon name="globe" size={18} /><LangPicker plain /></label>
          <div className="stats">
            <div className="stat"><Icon name="trophy" size={34} /><span><b>{num(careerScore(progress))}</b><small>{t('puntos')}</small></span></div>
            <div className="stat"><Icon name="star" size={34} fill /><span><b>{rank.stars}</b><small>{t('estrellas')}</small></span></div>
            <button className="stat" onClick={() => setDialog('badges')} title={t('Ver las medallas')}>
              <Icon name="medal" size={34} /><span><b>{badgeCount}/{BADGES.length}</b><small>{t('medallas')}</small></span>
            </button>
          </div>
        </header>

        {section === 'campaign' && <section id="home-campaign" className="campaign">
          <div className="section-title">
            <Icon name="layers" size={26} />
            <h2>{t('Campaña')}: {campaignTitle()}</h2>
            <p>{t('Completa los {n} capítulos y domina el diseño de misiones.', { n: CHAPTERS.length })}</p>
          </div>

          <div className="campaign-cols">
            <div className="chapter-grid">
              {CHAPTERS.map((c, i) => {
                const m = progress.missions[c.mission];
                const open = isUnlocked(progress, c.mission);
                return (
                  <button key={c.mission} disabled={!open} aria-pressed={missionId === c.mission}
                    className={`chapter-card ${open ? '' : 'locked'} ${missionId === c.mission ? 'selected' : ''}`}
                    onClick={() => { sfx.click(); setMissionId(c.mission); }}>
                    <img src={REAL[c.mission]?.image} alt="" width="960" height="720" loading="lazy" />
                    <span className="chapter-num">{t('Cap. {n}', { n: i + 1 })}</span>
                    {!open && <span className="chapter-lock"><Icon name="lock" size={26} /></span>}
                    <span className="chapter-text">
                      <b>{c.title}</b>
                      <small>{index.missions[c.mission].name}</small>
                      {open
                        ? <Stars n={m?.stars ?? 0} />
                        : <small className="faint">{t('Gana ⭐ en el capítulo {n}', { n: i })}</small>}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="campaign-side">
              <article className="detail" key={missionId} aria-live="polite">
                {real && <img className="detail-photo" src={real.image} alt="" width="960" height="720" />}
                <div className="detail-body">
                  <p className="kicker">{t('Capítulo {n}', { n: chapterNum })} · {mission.difficulty}</p>
                  <h2>{chapter.title}</h2>
                  <p>{chapter.story}</p>
                  <p className="detail-meta">
                    {mission.name} · {mission.budget_musd >= 10000 ? '∞' : `${mission.budget_musd} M$`} · {t('{n}+ años', { n: mission.min_lifetime_years })}
                    {best?.bestScore ? <> · {t('Mejor: {score} ({grade}) · {pts} pts', { score: best.bestScore, grade: best.bestGrade, pts: missionPoints(best) })}</> : null}
                  </p>
                  {real && (
                    <ul className="tags">
                      {real.tags.map(([icon, label]) => <li key={icon}><Icon name={icon} /> {label()}</li>)}
                    </ul>
                  )}
                  <div className="detail-actions">
                    <button className="primary start" onClick={() => { sfx.stepDone(); startSolo(missionId); }}>
                      <Icon name="play" size={20} /> {t('Comenzar capítulo')}
                    </button>
                    {real && <button className="outline" onClick={() => setDialog('real')}><Icon name="info" size={20} /> {t('La misión real')}</button>}
                  </div>
                </div>
              </article>

            </div>
          </div>
        </section>}

        {section === 'explore' && <div className="destination-page" id="home-explore">
          <section className="mode-hero explore-hero" style={{ backgroundImage: "linear-gradient(90deg,#080808ed 0%,#08080899 54%,#08080822),url('/home/mars.jpg')" }}>
            <span className="gold-tag">DEMO · SIN PUNTOS DE CAMPAÑA</span><h1>Explora nuevos mundos</h1><p>Conduce un rover y descubre la Luna y Marte.</p>
            <div className="hero-actions-inline"><button className="primary" onClick={() => startExplore({ ...defaultDesign(), ...DEMOS.mars_life },'mars_life',false)}><Icon name="rover"/> Explorar Marte</button><button className="outline" onClick={() => setTutorial(true)}>Ver controles</button></div>
          </section>
          <h2>Elige tu destino</h2><div className="destination-grid">
            {[{id:'mars_life',title:'Marte',image:'/home/mars.jpg',text:'Recorre el terreno y analiza muestras del antiguo delta.',tags:['Rover','Exploración libre']},{id:'moon_water',title:'Luna',image:'/campaign/moon_water.jpg',text:'Explora cráteres y busca indicios de hielo de agua.',tags:['Rover','Exploración libre']}].map(d=><article className="destination-card" key={d.id}><img src={d.image} alt=""/><div><h3>{d.title}</h3><p>{d.text}</p><div className="tag-list">{d.tags.map(x=><span key={x}>{x}</span>)}</div><button className="primary" onClick={()=>startExplore({...defaultDesign(),...DEMOS[d.id]},d.id,false)}>{d.id==='mars_life'?'Iniciar exploración':'Explorar la Luna'} →</button></div></article>)}
          </div>
          <div className="support-grid"><article className="panel-card"><h3>¿Qué puedes hacer?</h3><div className="activity-list"><p><Icon name="rover"/> Conducir el rover por terreno realista.</p><p><Icon name="thermo"/> Analizar sitios con los instrumentos instalados.</p><p><Icon name="antenna"/> Desplegar una antena y enviar hallazgos.</p></div><small>La fotografía de hallazgos aún no está implementada.</small></article><article className="panel-card"><h3>Antes de partir</h3><p>WASD o flechas para conducir · E / Espacio analizar · C cambiar cámara · G desplegar antena.</p><button className="outline" onClick={()=>setTutorial(true)}>Abrir tutorial</button></article></div>
        </div>}

        {section === 'free' && <div className="destination-page" id="home-free">
          <section className="mode-hero free-hero" style={{backgroundImage:"linear-gradient(90deg,#080808ed 0%,#08080899 54%,#08080822),url('/home/antenna.jpg')"}}><span className="gold-tag">SIN PUNTOS DE CAMPAÑA</span><h1>Tu misión, tus reglas</h1><p>Diseña y experimenta sin presupuesto ni límite de tiempo.</p><button className="primary" onClick={()=>startSolo('sandbox',freeDesigns[preset])}>Crear una misión →</button></section>
          <h2>Elige cómo empezar</h2><div className="scenario-grid">{freeScenarios.map(x=><button className={'scenario-card '+(preset===x.id?'selected':'')} key={x.id} aria-pressed={preset===x.id} onClick={()=>setPreset(x.id)}><img src={x.image} alt=""/><span><Icon name={x.icon}/><b>{x.title}</b><small>{x.text}</small><em>{preset===x.id?'Seleccionado':'Usar escenario'}</em></span></button>)}</div>
          <div className="support-grid"><article className="panel-card"><h3>Configura tu experimento</h3><label>Destino<select value={preset} onChange={e=>setPreset(e.target.value)}><option value="sso_700">Tierra</option><option value="moon_surface">Luna</option><option value="mars_surface">Marte</option></select></label><p className="muted">Las fases iniciales configurables, el combustible ilimitado y las ayudas de navegación aún no están disponibles.</p><button className="primary" onClick={()=>startSolo('sandbox',freeDesigns[preset])}>Abrir simulador</button></article><article className="panel-card wireframe-card"><Icon name="satellite" size={48}/><h3>Empieza desde cero</h3><p>Combina piezas y prueba tus propias ideas.</p><button className="outline" onClick={()=>startSolo('sandbox')}>Diseñar nave</button></article></div>
          <section className="learn-strip"><h3>Aprende experimentando</h3><div><span>Masa y empuje</span><span>Energía</span><span>Trayectorias</span></div><p>Consulta las métricas de ingeniería durante el diseño para ver el efecto de cada decisión.</p></section>
        </div>}

        {section === 'team' && <div className="destination-page" id="home-team">
          <section className="mode-hero team-hero" style={{backgroundImage:"linear-gradient(90deg,#080808ed 0%,#08080899 54%,#08080822),url('/home/earth-poster.jpg')"}}><span className="gold-tag">HASTA 4 JUGADORES</span><h1>Una misión. Cuatro especialistas</h1><p>Coordina decisiones y completa la misión en equipo.</p><div className="hero-actions-inline"><button className="primary" onClick={()=>document.getElementById('team-create')?.scrollIntoView({behavior:'smooth'})}>Crear sala</button><button className="outline" onClick={()=>document.getElementById('team-join-code')?.focus()}>Unirse con código</button></div></section>
          <h2>Cada rol cuenta</h2><div className="role-grid">{Object.entries(ROLES).map(([id,r])=><article className="panel-card" key={id}><span className="role-symbol">{r.icon}</span><h3>{r.name}</h3><p>{r.desc}</p></article>)}</div>
          <div className="support-grid"><form id="team-create" className="panel-card team-panel" onSubmit={e=>{e.preventDefault();if(teamName.trim())createRoom(teamName.trim(),missionId)}}><h3>Prepara tu partida</h3><label>Capítulo<select value={missionId} onChange={e=>setMissionId(e.target.value)}>{CHAPTERS.filter(c=>isUnlocked(progress,c.mission)).map(c=><option key={c.mission} value={c.mission}>{c.title}</option>)}</select></label><label>Nombre de sala<input value={teamName} maxLength={20} required onChange={e=>setTeamName(e.target.value)} placeholder="Tu nombre"/></label><button className="primary" disabled={!teamName.trim()}>Crear sala</button></form>
          <form className="panel-card team-panel" onSubmit={e=>{e.preventDefault();if(teamName.trim()&&teamCode.trim())joinRoom(teamName.trim(),teamCode.trim().toUpperCase())}}><h3>¿Ya tienes una invitación?</h3><p>Introduce el código que compartió tu equipo.</p><label>Tu nombre<input value={teamName} maxLength={20} required onChange={e=>setTeamName(e.target.value)} placeholder="Tu nombre"/></label><label>Código de sala<input id="team-join-code" className="code-input" value={teamCode} maxLength={4} required onChange={e=>setTeamCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="ABCD"/></label><button className="primary" disabled={!teamName.trim()||teamCode.length!==4}>Unirse a la misión</button></form></div>
          {error&&<p className="error-text" role="alert">{t(error)}</p>}{room&&<p className="room-code">Sala {room.code} · {room.players.length}/4 participantes</p>}
          <section className="learn-strip"><p>1. Crea o únete → 2. Elijan sus roles → 3. Confirmen que están listos</p><small>La misión inicia cuando todos los participantes marcan “Listo”.</small></section>
        </div>}

        <footer className="home-footer" hidden={section !== 'campaign'}>
          <span>{t('Aprende más con la NASA')}:</span>
          {RESOURCES.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer">{r.label()}</a>)}
          <span style={{ flex: 1 }} />
          <span className="faint">{t('Fotos y video: NASA')}</span>
          {!isNew && <button className="link" onClick={() => setDialog('reset')}>{t('Reiniciar campaña')}</button>}
        </footer>
      </main>

      {tutorial && <Modal onClose={()=>setTutorial(false)}><h2>Controles del rover</h2><p>W / ↑ avanzar · S / ↓ retroceder · A / ← izquierda · D / → derecha.</p><p>E o Espacio analiza un sitio cercano. C cambia la cámara. G inicia el despliegue de la antena.</p><button className="primary" onClick={()=>setTutorial(false)}>Entendido</button></Modal>}
      {dialog === 'badges' && <BadgeGallery onClose={close} />}
      {dialog === 'real' && real && <RealInfo real={real} onClose={close} />}
      {(dialog === 'create' || dialog === 'join') && <TeamDialog kind={dialog} progress={progress} missionId={missionId} onClose={close} />}
      {dialog === 'avatar' && (
        <Modal onClose={close}>
          <h2>{t('Elige tu avatar')}</h2>
          <div className="avatar-grid">
            {AVATARS.map((a) => (
              <button key={a} className={`avatar-option ${a === avatar ? 'selected' : ''}`} onClick={() => chooseAvatar(a)} aria-pressed={a === avatar}>{a}</button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === 'reset' && (
        <Modal onClose={close}>
          <h2>{t('¿Borrar todo el progreso de la campaña?')}</h2>
          <p className="muted">{t('Tu progreso se guarda en este navegador. Puedes empezar la campaña desde cero (por ejemplo, para otro jugador).')}</p>
          <div className="row modal-actions">
            <button onClick={close}>{t('Cancelar')}</button>
            <span style={{ flex: 1 }} />
            <button className="danger" onClick={() => { resetCampaign(); close(); }}>{t('Reiniciar campaña')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
