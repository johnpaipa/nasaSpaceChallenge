// Modo exploración en tercera persona: maneja el rover que diseñaste por la
// superficie de la Luna o Marte. La cámara sigue al rover desde atrás con
// movimiento suave (sin sacudidas) para que nadie se maree.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { index } from '../../../shared/catalog.js';
import { resolveDesign } from '../../../shared/engine.js';
import { createTerrain, minimapImage } from './terrain.js';
import { createSim, step, startAnalysis, summarize, triggerFaultNow, NEAR_DISTANCE, DIFFICULTIES } from './sim.js';
import Rover, { DustTrail } from './Rover.jsx';
import Cabin from './Cabin.jsx';
import { panelAction } from './faults.js';
import { startDeploy, deployAction, canDeploy, siteQuality } from './antenna.js';
import { ArmPanel, DeployArm, DeployedAntenna } from './ArmControl.jsx';
import { sfx, speak } from '../sound.js';
import { useGame } from '../game.jsx';
import { t, num } from '../../../shared/i18n.js';
import Rewards from '../components/Rewards.jsx';

const POI_COLOR = { pending: '#ffd54f', locked: '#78909c', collected: '#4fc3f7', sent: '#69f0ae' };
const POI_LABEL = { pending: 'por analizar', locked: 'falta instrumento', collected: 'datos por enviar', sent: '¡enviado!' };

function Poi({ poi, state, y, near }) {
  const ref = useRef();
  useFrame(({ clock }) => { if (ref.current) ref.current.position.y = y + 6 + Math.sin(clock.elapsedTime * 2) * 0.4; });
  const color = POI_COLOR[state];
  return (
    <group position={[poi.x, 0, poi.z]}>
      <mesh position={[0, y + 3, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 6, 12, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, y + 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[NEAR_DISTANCE - 0.6, NEAR_DISTANCE, 48]} />
        <meshBasicMaterial color={color} transparent opacity={near ? 0.8 : 0.3} side={THREE.DoubleSide} />
      </mesh>
      <group ref={ref}>
        <Html center distanceFactor={60} zIndexRange={[10, 0]}>
          <div className={`poi-label ${state}`}>
            <span className="poi-icon">{state === 'sent' ? '✅' : state === 'locked' ? '🔒' : poi.icon}</span>
            <span>{poi.name}</span>
            <small>{t(POI_LABEL[state])}</small>
          </div>
        </Html>
      </group>
    </group>
  );
}

function World({ site, terrain, parts, simRef, inputRef, onTick, viewRef }) {
  const roverRef = useRef();
  const sunRef = useRef();
  const { camera, scene } = useThree();
  const [, force] = useState(0);
  const dayColor = useMemo(() => new THREE.Color(site.sky.day), [site]);
  const nightColor = useMemo(() => new THREE.Color(site.sky.night), [site]);
  const stormColor = useMemo(() => new THREE.Color('#8a5a3a'), []);
  const sky = useMemo(() => new THREE.Color(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const poiStates = useRef('');

  useEffect(() => {
    scene.background = sky;
    if (site.sky.fog) scene.fog = new THREE.Fog(sky, ...site.sky.fog);
    const s = simRef.current;
    camera.position.set(s.x - Math.sin(s.heading) * 11, terrain.heightAt(s.x, s.z) + 8, s.z - Math.cos(s.heading) * 11);
    // El Sol proyecta sombras solo alrededor del rover (más nítidas y baratas).
    const sun = sunRef.current;
    sun.target = roverRef.current;
    Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 300 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0008;
    return () => { scene.fog = null; };
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const sim = simRef.current;
    if (sim.started) step(sim, inputRef.current, dt, terrain);

    // Rover: posición sobre el terreno e inclinación según la pendiente.
    const r = roverRef.current;
    const { x, z, heading } = sim;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const pitch = -Math.atan2(terrain.heightAt(x + fx, z + fz) - terrain.heightAt(x - fx, z - fz), 2);
    const roll = Math.atan2(terrain.heightAt(x + fz, z - fx) - terrain.heightAt(x - fz, z + fx), 2);
    r.position.set(x, terrain.heightAt(x, z), z);
    // Si volcó, queda de costado.
    r.rotation.set(pitch, heading, sim.tipped ? THREE.MathUtils.lerp(r.rotation.z, 1.9, 0.08) : roll, 'YXZ');

    const cabin = viewRef.current === 'cabin';
    r.visible = !cabin;
    if (viewRef.current === 'arm') {
      // Vista del brazo: desde atrás y arriba, mirando el suelo frente al rover.
      camPos.set(x - fx * 4, r.position.y + 7, z - fz * 4);
      camera.position.lerp(camPos, 1 - Math.exp(-4 * dt));
      camTarget.set(x + fx * 3.2, r.position.y, z + fz * 3.2);
    } else if (cabin) {
      // Primera persona: a la altura del mástil, mirando hacia adelante.
      const eye = 2.4 * ({ rover_s: 0.7, rover_m: 1, rover_l: 1.35 }[parts.mobility.id] ?? 1);
      camPos.set(x + fx * 0.8, r.position.y + eye, z + fz * 0.8);
      camera.position.lerp(camPos, 1 - Math.exp(-10 * dt));
      // mirar un poco hacia el suelo para ver el camino
      camTarget.set(x + fx * 20, (terrain.heightAt(x + fx * 20, z + fz * 20) + r.position.y) / 2 + eye * 0.15, z + fz * 20);
    } else {
      // Tercera persona: detrás del rover con suavizado (sin bamboleo).
      camPos.set(x - fx * 11, r.position.y + 5.5, z - fz * 11);
      camPos.y = Math.max(camPos.y, terrain.heightAt(camPos.x, camPos.z) + 2);
      camera.position.lerp(camPos, 1 - Math.exp(-3 * dt));
      camTarget.set(x + fx * 4, r.position.y + 1.5, z + fz * 4);
    }
    camera.lookAt(camTarget);

    // Cielo y Sol.
    const daylight = THREE.MathUtils.clamp(sim.sunEl * 4 + 0.4, 0, 1) * (0.4 + 0.6 * sim.dust);
    sky.copy(nightColor).lerp(dayColor, daylight);
    if (site.body === 'mars' && sim.dust < 1) sky.lerp(stormColor, 0.5);
    if (scene.fog) scene.fog.color.copy(sky);
    const az = Math.PI * (sim.phase / site.day_fraction);
    const sun = sunRef.current;
    sun.position.set(x + Math.cos(az) * 100, r.position.y + Math.max(sim.sunEl, -0.2) * 100 + 5, z + Math.sin(az) * 60);
    sun.intensity = sim.isDay && !sim.inShadow ? 2.6 * (0.3 + 0.7 * sim.dust) : 0.05;

    const states = JSON.stringify(sim.pois) + sim.near + !!sim.antenna.deployed + (sim.deploy ? sim.deploy.phase + Math.round(sim.deploy.mast * 10) + sim.deploy.damaged : '');
    if (states !== poiStates.current) { poiStates.current = states; force((n) => n + 1); }
    onTick();
  });

  const sim = simRef.current;
  return (
    <>
      <ambientLight intensity={site.body === 'moon' ? 0.08 : 0.35} />
      <hemisphereLight args={['#ffffff', site.colors.low, site.body === 'moon' ? 0.1 : 0.3]} />
      <directionalLight ref={sunRef} intensity={2.4} castShadow />
      {site.body === 'moon' && (
        <>
          <Stars radius={300} depth={50} count={4000} factor={6} fade />
          <mesh position={[-180, 70, 260]}>
            <sphereGeometry args={[14, 32, 32]} />
            <meshStandardMaterial color="#3b7dd8" emissive="#1a3a6b" emissiveIntensity={0.6} />
          </mesh>
        </>
      )}
      <mesh geometry={terrain.geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} />
      </mesh>
      <Rocks terrain={terrain} color={site.colors.low} />
      {site.pois.map((p) => (
        <Poi key={p.id} poi={p} state={sim.pois[p.id]} y={terrain.heightAt(p.x, p.z)} near={sim.near === p.id} />
      ))}
      <Rover parts={parts} roverRef={roverRef} simRef={simRef} terrain={terrain} />
      <DeployArm simRef={simRef} roverRef={roverRef} terrain={terrain} />
      <DeployedAntenna simRef={simRef} roverRef={roverRef} terrain={terrain} />
      <DustTrail simRef={simRef} roverRef={roverRef} body={site.body} color={site.colors.sand ?? site.colors.high} />
    </>
  );
}

function Rocks({ terrain, color }) {
  const ref = useRef();
  useEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    terrain.rocks.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(r.r, r.r * 2, 0));
      s.setScalar(r.s);
      p.set(r.x, r.y + r.s * 0.3, r.z);
      ref.current.setMatrixAt(i, m.compose(p, q, s));
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [terrain]);
  return (
    <instancedMesh ref={ref} args={[null, null, terrain.rocks.length]} castShadow receiveShadow>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} roughness={1} flatShading />
    </instancedMesh>
  );
}

function Minimap({ sim, site, image, terrain }) {
  const s = 130 / site.size;
  const toMap = (x, z) => [65 - x * s, 65 - z * s]; // vista desde arriba con el norte (+z) hacia arriba
  const [rx, rz] = toMap(sim.x, sim.z);
  return (
    <svg className="minimap" viewBox="0 0 130 130" aria-label="Minimapa">
      <rect width="130" height="130" rx="8" />
      {image && <image href={image} x="0" y="0" width="130" height="130" preserveAspectRatio="none" opacity="0.9" />}
      {sim.difficulty.sand && terrain.sand.map((p, i) => {
        const [cx, cz] = toMap(p.x, p.z);
        return <circle key={i} cx={cx} cy={cz} r={p.r * s} className="sand" />;
      })}
      {site.pois.map((p) => {
        const [px, pz] = toMap(p.x, p.z);
        return <circle key={p.id} cx={px} cy={pz} r="4" fill={POI_COLOR[sim.pois[p.id]]} />;
      })}
      <g transform={`translate(${rx} ${rz}) rotate(${(-sim.heading * 180) / Math.PI})`}>
        <path d="M0,-6 L4,5 L0,3 L-4,5 Z" fill="#fff" />
      </g>
    </svg>
  );
}

function useKeyboard(inputRef, onAnalyze, onToggleView, onFault, onDeploy) {
  useEffect(() => {
    const keys = new Set();
    const update = () => {
      const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const turn = (keys.has('a') || keys.has('arrowleft') ? 1 : 0) - (keys.has('d') || keys.has('arrowright') ? 1 : 0);
      const y = (keys.has('x') ? 1 : 0) - (keys.has('z') ? 1 : 0);
      inputRef.current = { ...inputRef.current, fwd, turn, y };
    };
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'e' || k === ' ') { e.preventDefault(); onAnalyze(); return; }
      if (k === 'c') { onToggleView(); return; }
      if (k === 'f') { onFault(); return; }
      if (k === 'g') { onDeploy(); return; }
      if (k.startsWith('arrow')) e.preventDefault();
      keys.add(k); update();
    };
    const up = (e) => { keys.delete(e.key.toLowerCase()); update(); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);
}

/** Botón táctil que se mantiene presionado (para tablets). */
function HoldButton({ label, onChange }) {
  return (
    <button className="pad" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)}>{label}</button>
  );
}

/** Selección de dificultad antes de empezar. */
function DifficultyPicker({ site, onPick, onExit }) {
  const extra = {
    explorer: [],
    engineer: [t('🪨 Rocas que dañan ruedas'), t('🏖️ Arena blanda'), t('🟫 Polvo en paneles'), t('🔋 Batería al 60%')],
    commander: [t('📡 Retraso de señal {s} s', { s: site.signal_delay_s ?? 0 }), t('💥 Puede volcar sobre 28°'), t('⏳ Un sol menos'), t('🔋 Batería al 50%')],
  };
  return (
    <div className="modal-backdrop">
      <div className="modal wide">
        <div className="modal-icon">{site.body === 'mars' ? '🔴' : '🌕'}</div>
        <h2>{site.name}</h2>
        <p>{site.intro}</p>
        <h3>{t('Elige la dificultad')}</h3>
        <div className="difficulty-grid">
          {Object.values(DIFFICULTIES).map((d) => (
            <button key={d.id} className={`difficulty ${d.id}`} onClick={() => { sfx.stepDone(); onPick(d.id); }}>
              <span className="difficulty-icon">{d.icon}</span>
              <b>{d.name}</b>
              <span className="muted">{d.desc}</span>
              {extra[d.id].length > 0 && <span className="chips">{extra[d.id].map((c) => <span key={c} className="chip">{c}</span>)}</span>}
            </button>
          ))}
        </div>
        <button className="link" onClick={onExit}>← {t('Volver')}</button>
      </div>
    </div>
  );
}

export default function Exploration({ design, missionId, onExit, counts = true }) {
  const { record } = useGame();
  const [reward, setReward] = useState(null);
  const mission = index.missions[missionId];
  const parts = useMemo(() => resolveDesign(design), [design]);
  const site = index.sites[mission.site] ?? Object.values(index.sites).find((s) => s.body === parts.orbit.body);
  const terrain = useMemo(() => createTerrain(site), [site]);
  const mapImage = useMemo(() => minimapImage(site, terrain), [terrain]);
  const [run, setRun] = useState(0);
  const [difficulty, setDifficulty] = useState(null);
  const simRef = useRef(null);
  if (!simRef.current) simRef.current = createSim(site, parts);
  const inputRef = useRef({ fwd: 0, turn: 0 });
  const [hud, setHud] = useState(null);
  const [message, setMessage] = useState({ text: site.intro, kind: 'info' });
  const lastTick = useRef(0);
  const [view, setView] = useState('third');
  const viewRef = useRef('third');
  const viewBeforeFault = useRef(null);
  const changeView = (v) => { viewRef.current = v; setView(v); };
  const toggleView = () => { if (!simRef.current.fault) changeView(viewRef.current === 'cabin' ? 'third' : 'cabin'); };

  const analyze = () => { sfx.click(); startAnalysis(simRef.current); };
  const fireFault = () => triggerFaultNow(simRef.current);
  const deploy = () => { if (startDeploy(simRef.current)) { sfx.select(); setHud(snapshot(simRef.current)); } };
  useKeyboard(inputRef, analyze, toggleView, fireFault, deploy);

  const begin = (id) => {
    const sim = createSim(site, parts, id);
    sim.started = true;
    simRef.current = sim;
    setDifficulty(id);
    const intro = id === 'commander'
      ? t('Modo Comandante: cada orden tarda {s} s en llegar al rover, como en el control de misión real. ¡Suelta las teclas antes de llegar!', { s: sim.signalDelay })
      : site.intro;
    setMessage({ text: intro, kind: 'info' });
    speak(intro);
  };

  // El HUD se refresca ~10 veces por segundo (no en cada cuadro).
  const onTick = () => {
    const sim = simRef.current;
    while (sim.messages.length) {
      const m = sim.messages.shift();
      setMessage(m);
      // En voz alta solo lo importante: alarmas, problemas graves y datos de misiones reales.
      if (m.fact || m.kind === 'alarm' || m.kind === 'bad') speak(m.text);
      if (m.kind === 'win') sfx.stepDone();
      else if (m.kind === 'bump') sfx.clunk();
      else if (m.kind === 'alarm') sfx.alarm();
      else if (m.kind === 'bad' || m.kind === 'warn') sfx.error();
      else if (m.kind === 'ok') sfx.select();
    }
    const now = performance.now();
    if (now - lastTick.current < 100 && !sim.ended) return;
    lastTick.current = now;
    setHud(snapshot(sim));
  };

  const snapshot = (sim) => ({
    ...sim, pois: { ...sim.pois }, analyzing: sim.analyzing && { ...sim.analyzing }, applied: { ...sim.applied },
    deploy: sim.deploy && { ...sim.deploy, target: { ...sim.deploy.target }, log: [...sim.deploy.log] },
    antenna: { deployed: sim.antenna.deployed && { ...sim.antenna.deployed } },
    fault: sim.fault && { ...sim.fault, panel: { ...sim.fault.panel, circuits: { ...sim.fault.panel.circuits }, freeWheels: [...sim.fault.panel.freeWheels], log: [...sim.fault.panel.log] } },
  });
  const onPanel = (action) => { panelAction(simRef.current, action); setHud(snapshot(simRef.current)); };
  const onArm = (action) => { deployAction(simRef.current, action); setHud(snapshot(simRef.current)); };
  const setArmInput = (key, value) => { inputRef.current = { ...inputRef.current, [key]: value }; };

  const restart = () => {
    simRef.current = createSim(site, parts);
    setDifficulty(null);
    setMessage({ text: site.intro, kind: 'info' });
    setHud(null);
    setRun((n) => n + 1);
  };

  const sim = hud;
  const ended = sim?.ended;
  const summary = ended ? summarize(simRef.current) : null;
  useEffect(() => {
    if (!ended) return;
    (summary.stars > 0 ? sfx.win : sfx.lose)();
    // Recompensas de la campaña (las demos de la pantalla de inicio no cuentan).
    if (counts) {
      const s = simRef.current;
      setReward(record({
        kind: 'explore', missionId, stars: summary.stars, science: s.science, difficulty: s.difficulty.id,
        sent: Object.entries(s.pois).filter(([, st]) => st === 'sent').map(([id]) => id),
        faults: s.faultLog, antennaQ: s.antenna.deployed?.q ?? 0, key: `explore-${missionId}-${run}-${Date.now()}`,
      }));
    }
  }, [ended]);

  const faultOn = !!sim?.fault;
  useEffect(() => {
    if (faultOn) { viewBeforeFault.current = viewRef.current; changeView('cabin'); }
    else if (viewBeforeFault.current) { changeView(viewBeforeFault.current); viewBeforeFault.current = null; }
  }, [faultOn]);

  const deployOn = !!sim?.deploy;
  const viewBeforeArm = useRef(null);
  useEffect(() => {
    if (deployOn) { viewBeforeArm.current = viewRef.current; changeView('arm'); }
    else if (viewBeforeArm.current) { changeView(viewBeforeArm.current); viewBeforeArm.current = null; }
  }, [deployOn]);
  const spot = sim && !sim.antenna.deployed ? siteQuality(sim, terrain, sim.x, sim.z) : null;

  const nearPoi = sim?.near && site.pois.find((p) => p.id === sim.near);
  const setInput = (key, value) => { inputRef.current = { ...inputRef.current, [key]: value }; };
  const hours = sim ? Math.floor(sim.phase * site.hours_per_sol) : 0;
  const meters = (units) => num(Math.round(units * terrain.metersPerUnit));
  const cmdArrow = (i) => (i.fwd > 0 ? '▲' : i.fwd < 0 ? '▼' : '') + (i.turn > 0 ? '◀' : i.turn < 0 ? '▶' : '') || '■';

  return (
    <div className="explore">
      <Canvas key={run} shadows camera={{ fov: 60, near: 0.1, far: 1200 }}>
        <World site={site} terrain={terrain} parts={parts} simRef={simRef} inputRef={inputRef} onTick={onTick} viewRef={viewRef} />
      </Canvas>

      {!difficulty && <DifficultyPicker site={site} onPick={begin} onExit={onExit} />}

      {sim && difficulty && <Cabin sim={sim} site={site} parts={parts} terrain={terrain} onAction={onPanel} view={view} />}
      {sim && difficulty && deployOn && <ArmPanel sim={sim} onAction={onArm} setArmInput={setArmInput} metersPerUnit={terrain.metersPerUnit} />}

      {sim && difficulty && (
        <div className={`hud ${view === 'cabin' || view === 'arm' ? 'cabin-mode' : ''} ${faultOn || deployOn ? 'fault-mode' : ''}`}>
          <div className="hud-top">
            <div className="hud-card">
              <b>{site.name} <span className={`badge diff-${difficulty}`}>{sim.difficulty.icon} {sim.difficulty.name}</span></b>
              <span>{sim.isDay ? (sim.dust < 1 ? '🌪️' : '☀️') : '🌙'} {t('Sol')} {Math.min(sim.sol, sim.sols)}/{sim.sols} · {String(hours).padStart(2, '0')}:00 h</span>
              <div className="bar"><div className="fill ok" style={{ width: `${(sim.t / sim.totalTime) * 100}%` }} /></div>
              {sim.isDay && sim.faultsLeft > 0 && <small className="value warn">{t('🌙 Anochece en {s} s · ¡ojo con las fallas!', { s: Math.ceil(sim.nightIn ?? 0) })}</small>}
            </div>
            <div className="hud-card">
              <span>🔋 {t('Batería')} {Math.round(sim.battery)} / {sim.cap} Wh</span>
              <div className="bar big"><div className={`fill ${sim.battery / sim.cap < 0.25 ? 'bad' : sim.battery / sim.cap < 0.5 ? 'warn' : 'ok'}`} style={{ width: `${(sim.battery / sim.cap) * 100}%` }} /></div>
              <small className={sim.flow >= 0 ? 'value ok' : 'value bad'}>
                {sim.flow >= 0 ? `▲ ${t('cargando')}` : `▼ ${t('gastando')}`} {Math.abs(Math.round(sim.flow))} W
                {sim.hibernating && ` · 😴 ${t('hibernando')}`}{sim.inShadow && ` · 🌑 ${t('sombra')}`}
              </small>
            </div>
            <div className="hud-card">
              <span>📦 {t('Por enviar')}: {Math.round(sim.queue.reduce((s, q) => s + q.remaining, 0))} MB</span>
              <span>{sim.transmitting ? (sim.relayActive ? t('📡 ¡Enviando a la Tierra!') : t('📡 Enviando por tu antena repetidora')) : sim.relayActive ? t('🛰️ {relay} disponible', { relay: site.relay.name }) : t('🛰️ Próximo contacto en {s} s', { s: Math.ceil(sim.relayIn) })}</span>
              {sim.antenna.deployed && <span className={sim.antennaLink ? 'value ok' : 'muted'}>📡 {t('Antena')}: {sim.antennaLink ? t('en alcance') : t('fuera de alcance')}</span>}
              {spot && <span>📍 {t('Lugar para antena')}: <b className="stars-inline">{[1, 2, 3].map((n) => <span key={n} className={n <= spot.stars ? 'on' : ''}>★</span>)}</b> <small className="muted">{spot.reasons[0]}</small></span>}
              <span>🔬 {t('Ciencia en la Tierra')}: <b>{sim.science}</b> / {sim.maxScience}</span>
            </div>
            {difficulty !== 'explorer' && (
              <div className="hud-card">
                <span>⚙️ {t('Ruedas')} {Math.round(sim.wheelHealth)}%</span>
                <div className="bar"><div className={`fill ${sim.wheelHealth < 40 ? 'bad' : sim.wheelHealth < 70 ? 'warn' : 'ok'}`} style={{ width: `${sim.wheelHealth}%` }} /></div>
                {!parts.solar.constant && <span>🟫 {t('Polvo en paneles')} {Math.round(sim.panelDust * 100)}%</span>}
                <span className={sim.slopeDeg > (sim.difficulty.warnTipDeg ?? 99) ? 'value bad' : ''}>📐 {t('Pendiente')} {Math.round(sim.slopeDeg)}°{sim.inSand && ` · 🏖️ ${t('arena')}`}</span>
              </div>
            )}
            {sim.signalDelay > 0 && (
              <div className="hud-card signal">
                <span>📡 {t('Retraso de señal')}: <b>{sim.signalDelay} s</b></span>
                <span>{t('Tú envías')}: <b>{cmdArrow(inputRef.current)}</b> · {t('El rover hace')}: <b>{cmdArrow(sim.applied)}</b></span>
              </div>
            )}
            {terrain.elevationAt && (
              <div className="hud-card">
                <span>⛰️ {t('Altitud real')}: <b>{num(Math.round(terrain.elevationAt(sim.x, sim.z)))} m</b></span>
                <small className="muted">{t('dato')} {site.body === 'mars' ? 'HiRISE' : 'LOLA'} · NASA · {t('recorrido')} {meters(sim.distance)} m</small>
              </div>
            )}
            <span style={{ flex: 1 }} />
            <button className="small" disabled={!canDeploy(simRef.current)} onClick={deploy} title={t('Plantar la antena repetidora con el brazo robótico (tecla G)')}>📡 {t('Plantar antena')} (G)</button>
            <button className="small" disabled={faultOn || deployOn} onClick={fireFault} title={t('Dispara una falla ahora (tecla F)')}>🚨 {t('Probar falla')} (F)</button>
            <button className="small" disabled={faultOn} onClick={toggleView}>{view === 'cabin' ? `🎥 ${t('Vista exterior')} (C)` : `🎥 ${t('Cabina')} (C)`}</button>
            <button className="small" onClick={() => { simRef.current.ended = true; }}>🏁 {t('Terminar')}</button>
            <button className="small" onClick={onExit}>✕ {t('Salir')}</button>
          </div>

          <div className="hud-side">
            <Minimap sim={sim} site={site} image={mapImage} terrain={terrain} />
            <ul className="poi-list">
              {site.pois.map((p) => (
                <li key={p.id} style={{ color: POI_COLOR[sim.pois[p.id]] }}>
                  {sim.pois[p.id] === 'sent' ? '✅' : sim.pois[p.id] === 'locked' ? '🔒' : p.icon} {p.name}
                </li>
              ))}
            </ul>
          </div>

          <div className="hud-bottom">
            <div className={`copilot-bubble explore-msg ${message.kind}`}>
              <span className="copilot-avatar small">🤖</span>
              <p>{message.text}</p>
            </div>
            {nearPoi && !sim.analyzing && !faultOn && (
              <button className="primary analyze" onClick={analyze}>🔬 {t('ANALIZAR')} "{nearPoi.name}" (E)</button>
            )}
            {sim.analyzing && (
              <div className="analyzing">{t('Analizando…')} <div className="bar big"><div className="fill ok" style={{ width: `${sim.analyzing.progress * 100}%` }} /></div></div>
            )}
          </div>

          <div className="pads">
            <div />
            <HoldButton label="▲" onChange={(v) => setInput('fwd', v ? 1 : 0)} />
            <div />
            <HoldButton label="◀" onChange={(v) => setInput('turn', v ? 1 : 0)} />
            <HoldButton label="▼" onChange={(v) => setInput('fwd', v ? -1 : 0)} />
            <HoldButton label="▶" onChange={(v) => setInput('turn', v ? -1 : 0)} />
          </div>
          <div className="keys-help">{t('Mover: W A S D o flechas · Analizar: E · Cabina: C · Antena: G · Falla: F')}</div>
          {site.credit && <div className="dem-credit">{site.credit}</div>}
        </div>
      )}

      {ended && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-icon">{summary.stars > 0 ? '🏆' : '🛰️'}</div>
            <h2>{t('¡Exploración terminada!')}</h2>
            <p className="muted">{t('Nivel')} {sim.difficulty.icon} {sim.difficulty.name}</p>
            <div className="stars center">
              {[1, 2, 3].map((n) => <span key={n} className={n <= summary.stars ? 'on' : ''} style={{ animationDelay: `${n * 0.25}s` }}>★</span>)}
            </div>
            <p>{t('Ciencia recibida en la Tierra')}: <b>{sim.science} / {sim.maxScience}</b> · {t('Recorrido')}: {meters(sim.distance)} m</p>
            {counts ? <Rewards out={reward} compact /> : <p className="muted">{t('Modo demo: juega el capítulo desde la campaña para ganar puntos y medallas.')}</p>}
            <ul className="lessons left">{summary.lessons.map((l, i) => <li key={i}>{l}</li>)}</ul>
            <div className="row modal-actions">
              <button onClick={() => { setReward(null); restart(); }}>🔄 {t('Jugar otra vez')}</button>
              <span style={{ flex: 1 }} />
              <button className="primary" onClick={onExit}>{t('Volver al diseño')} 🔧</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
