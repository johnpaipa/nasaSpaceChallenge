// Visualización 3D con Three.js (vía react-three-fiber):
//  - Vista "Órbita": la Tierra, la órbita elegida, la nave y los enlaces con estaciones terrenas.
//  - Vista "Nave": la nave armada con los componentes seleccionados.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Line } from '@react-three/drei';
import * as THREE from 'three';
import { index } from '../../../shared/catalog.js';
import { resolveDesign } from '../../../shared/engine.js';
import { t } from '../../../shared/i18n.js';
import { EARTH_SPIN, deg, orbitRadius, Earth, CommLinks } from './earthScene.jsx';

function OrbitView({ orbit, parts }) {
  const earthRef = useRef();
  const satRef = useRef();
  const angle = useRef(0);
  const isL1 = orbit.id === 'l1';
  const r = isL1 ? 4.2 : orbitRadius(orbit.altitude_km);
  // Velocidad angular "tipo Kepler" comprimida: GEO gira igual que la Tierra.
  const speed = EARTH_SPIN * Math.sqrt(1436 / orbit.period_min);
  const ring = useMemo(() => {
    const pts = [];
    const rr = isL1 ? 0.35 : r;
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(isL1 ? [0, Math.sin(a) * rr, Math.cos(a) * rr] : [Math.cos(a) * rr, 0, Math.sin(a) * rr]);
    }
    return pts;
  }, [r, isL1]);

  useFrame((_, dt) => {
    if (earthRef.current) earthRef.current.rotation.y += EARTH_SPIN * dt;
    angle.current += (isL1 ? 0.4 : speed) * dt;
    const s = satRef.current;
    if (!s) return;
    if (isL1) s.position.set(0, Math.sin(angle.current) * 0.35, Math.cos(angle.current) * 0.35);
    else s.position.set(Math.cos(angle.current) * r, 0, -Math.sin(angle.current) * r);
    s.lookAt(isL1 ? new THREE.Vector3(30, 0, 0) : new THREE.Vector3(0, 0, 0));
  });

  return (
    <>
      <Earth earthRef={earthRef} />
      <group rotation={[deg(isL1 ? 0 : orbit.inclination_deg), 0, 0]} position={isL1 ? [r, 0, 0] : [0, 0, 0]}>
        <Line points={ring} color="#80deea" lineWidth={1.2} dashed={isL1} dashSize={0.05} gapSize={0.04} />
        <group ref={satRef}>
          <group scale={isL1 ? 0.12 : 0.06}><SpacecraftModel parts={parts} /></group>
        </group>
      </group>
      {!isL1 && <CommLinks earthRef={earthRef} satRef={satRef} range={orbit.id === 'geo' ? 10 : 1.2} />}
      {isL1 && <Line points={[[1, 0, 0], [r, 0, 0]]} color="#69f0ae" lineWidth={1} transparent opacity={0.5} />}
      <mesh position={[30, 0, 0]}>
        <sphereGeometry args={[1.5, 32, 32]} />
        <meshBasicMaterial color="#fff3b0" />
      </mesh>
    </>
  );
}

/** Destinos de superficie: la Luna o Marte girando, con la nave posada encima. */
function PlanetView({ orbit, parts }) {
  const ref = useRef();
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.15; });
  const mars = orbit.body === 'mars';
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[1.4, 64, 64]} />
        <meshStandardMaterial color={mars ? '#b4552d' : '#9e9e9e'} roughness={1} />
      </mesh>
      {[[0.5, 0.3, 0.2], [-0.3, 0.6, 0.15], [0.2, -0.5, 0.25], [-0.6, -0.2, 0.12]].map(([x, y, r], i) => {
        const n = new THREE.Vector3(x, y, 1).normalize();
        return (
        <mesh key={i} position={n.clone().multiplyScalar(1.401)} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)}>
          <circleGeometry args={[r, 24]} />
          <meshStandardMaterial color={mars ? '#8a3d20' : '#6e6e6e'} side={THREE.DoubleSide} />
        </mesh>
        );
      })}
      <mesh scale={1.47}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color={mars ? '#ff9e6e' : '#ffffff'} transparent opacity={mars ? 0.08 : 0.02} side={THREE.BackSide} />
      </mesh>
      <group position={[0, 1.4, 0]} scale={0.12}><group position={[0, 0.7, 0]} rotation={[-Math.PI / 2, 0, 0]}><SpacecraftModel parts={parts} /></group></group>
    </group>
  );
}

/** Una pieza de la nave: se puede tocar (`onPick`) y da un pequeño salto cuando acaba de cambiar (`flash`). */
function Part({ field, onPick, flash, children }) {
  const ref = useRef();
  const pulse = useRef(1);
  useEffect(() => { if (flash?.field === field) pulse.current = 0; }, [flash, field]);
  useFrame((_, dt) => {
    if (pulse.current >= 1 || !ref.current) return;
    pulse.current = Math.min(1, pulse.current + dt / 0.9);
    ref.current.scale.setScalar(1 + 0.18 * Math.sin(Math.PI * pulse.current));
  });
  const events = onPick ? {
    onClick: (e) => { e.stopPropagation(); onPick(field); },
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { document.body.style.cursor = ''; },
  } : {};
  return <group ref={ref} {...events}>{children}</group>;
}

/** Nave construida a partir de los componentes elegidos. La cara +Z apunta a la Tierra (nadir).
 * `onPick(campo)` se llama al tocar una pieza; `flash` = { field } resalta la pieza recién cambiada. */
export function SpacecraftModel({ parts, spin = false, onPick, flash }) {
  const part = { onPick, flash };
  const ref = useRef();
  useFrame((_, dt) => { if (spin && ref.current) ref.current.rotation.y += dt * 0.3; });
  const size = { micro: 0.5, small: 0.8, medium: 1.2 }[parts.structure.id] ?? 0.8;
  const wing = { body: 0, deploy_s: 1.2, deploy_l: 2.2, triple_j: 3 }[parts.solar.id] ?? 1;
  const dish = { uhf: 0, s_band: 0, x_band: 0.25, ka_band: 0.4 }[parts.comms.id] ?? 0;
  const instr = parts.instruments;
  const cols = Math.ceil(Math.sqrt(instr.length || 1));

  return (
    <group ref={ref}>
      {/* Cuerpo con aislamiento térmico dorado */}
      <Part field="structure" {...part}>
        <mesh>
          <boxGeometry args={[size, size, size * 1.1]} />
          <meshStandardMaterial color="#d4a72c" metalness={0.8} roughness={0.35} />
        </mesh>
      </Part>
      {/* Paneles solares */}
      <Part field="solar" {...part}>
      {wing === 0 ? (
        [1, -1].map((s) => (
          <mesh key={s} position={[s * (size / 2 + 0.005), 0, 0]}>
            <boxGeometry args={[0.01, size * 0.9, size]} />
            <meshStandardMaterial color="#1a237e" metalness={0.6} roughness={0.3} />
          </mesh>
        ))
      ) : (
        [1, -1].map((s) => (
          <group key={s} position={[s * (size / 2 + wing / 2 + 0.08), 0, 0]}>
            <mesh><boxGeometry args={[wing, 0.02, size * 0.9]} /><meshStandardMaterial color="#1a3a8f" metalness={0.7} roughness={0.25} /></mesh>
            <mesh position={[-s * (wing / 2 + 0.04), 0, 0]}><boxGeometry args={[0.08, 0.03, 0.03]} /><meshStandardMaterial color="#999" /></mesh>
          </group>
        ))
      )}
      </Part>
      {/* Antena */}
      <Part field="comms" {...part}>
      {dish > 0 ? (
        <group position={[0, size / 2 + 0.15, 0]} rotation={[deg(-60), 0, 0]}>
          <mesh rotation={[Math.PI, 0, 0]}>
            <sphereGeometry args={[dish, 24, 8, 0, Math.PI * 2, 0, Math.PI / 4]} />
            <meshStandardMaterial color="#eeeeee" side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, -0.08, 0]}><cylinderGeometry args={[0.015, 0.015, 0.2]} /><meshStandardMaterial color="#bbb" /></mesh>
        </group>
      ) : (
        [[1, 1], [1, -1], [-1, 1], [-1, -1]].slice(0, parts.comms.id === 'uhf' ? 4 : 1).map(([x, z]) => (
          <mesh key={`${x}${z}`} position={[x * size * 0.4, size / 2 + 0.2, z * size * 0.4]}>
            <cylinderGeometry args={[0.008, 0.008, 0.4]} /><meshStandardMaterial color="#ccc" />
          </mesh>
        ))
      )}
      </Part>
      {/* Instrumentos en la cara que mira a la Tierra (+Z) */}
      <Part field="instruments" {...part}>
      {instr.map((i, k) => {
        const x = ((k % cols) - (cols - 1) / 2) * (size / cols);
        const y = (Math.floor(k / cols) - (Math.ceil(instr.length / cols) - 1) / 2) * (size / cols);
        if (i.id === 'sar') return (
          <mesh key={i.id} position={[0, -size / 2 - 0.05, size * 0.2]}>
            <boxGeometry args={[size * 2.5, 0.04, size * 0.6]} /><meshStandardMaterial color={i.color} metalness={0.4} />
          </mesh>
        );
        const rad = Math.min(size / cols / 2.6, 0.05 + i.mass_kg / 900);
        return (
          <mesh key={i.id} position={[x, y, size * 0.55 + 0.08]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[rad, rad * 1.2, 0.18, 20]} /><meshStandardMaterial color={i.color} metalness={0.3} roughness={0.4} />
          </mesh>
        );
      })}
      </Part>
      {/* Propulsión: tobera en la cara opuesta */}
      <Part field="propulsion" {...part}>
      {parts.propulsion.level > 0 && (
        <mesh position={[0, 0, -size * 0.55 - 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[size * (parts.propulsion.level === 2 ? 0.22 : 0.1), 0.25, 20, 1, true]} />
          <meshStandardMaterial color={parts.propulsion.id === 'ion' ? '#7c4dff' : '#555'} metalness={0.9} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
      </Part>
      {/* Ruedas de rover */}
      <Part field="mobility" {...part}>
      {parts.mobility && parts.mobility.id !== 'none' && [-1, 1].flatMap((sx) => [-1, 0, 1].map((sz) => (
        <mesh key={`${sx}${sz}`} position={[sx * size * 0.6, sz * size * 0.4, -size * 0.55 - 0.12]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[size * 0.16, size * 0.16, size * 0.12, 16]} /><meshStandardMaterial color="#333" />
        </mesh>
      )))}
      </Part>
      {/* Rastreador estelar */}
      <Part field="adcs" {...part}>
      {parts.adcs.id === 'star_tracker' && (
        <mesh position={[size * 0.35, size / 2 + 0.05, -size * 0.35]}><boxGeometry args={[0.1, 0.1, 0.14]} /><meshStandardMaterial color="#222" /></mesh>
      )}
      </Part>
    </group>
  );
}

/** Lleva la cámara a su sitio al cambiar de vista, sin recrear la escena; después manda el jugador. */
function CameraRig({ position }) {
  const { camera } = useThree();
  const goal = useRef(null);
  const [x, y, z] = position;
  useEffect(() => { goal.current = new THREE.Vector3(x, y, z); }, [x, y, z]);
  useFrame((_, dt) => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 1 - Math.exp(-6 * dt));
    if (camera.position.distanceTo(goal.current) < 0.03) goal.current = null;
  });
  return null;
}

/** `focusView`: vista que conviene al paso actual del Diseñador ('orbit' | 'craft'); el jugador puede cambiarla. */
export default function Scene3D({ design, onPick, focusView }) {
  const controls = useRef();
  const [view, setView] = useState(focusView ?? 'orbit');
  useEffect(() => { if (focusView) setView(focusView); }, [focusView]);
  const parts = useMemo(() => resolveDesign(design), [design]);
  const orbit = index.orbits[design.orbit];
  const camera = view === 'orbit' ? [0, 2.2, orbit.id === 'l1' ? 7.5 : 4.2] : [2.6, 1.6, 3.2];

  // La pieza que acaba de cambiar se resalta un instante.
  const [flash, setFlash] = useState(null);
  const before = useRef(design);
  useEffect(() => {
    const field = Object.keys(design).find((k) => design[k] !== before.current[k]);
    before.current = design;
    if (!field) return undefined;
    setFlash({ field });
    const timer = setTimeout(() => setFlash(null), 1000);
    return () => clearTimeout(timer);
  }, [design]);
  // Opciones iniciales fijas: si cambiaran, la cámara se recrearía en vez de moverse.
  const initialCamera = useRef({ position: camera, fov: 50 }).current;

  return (
    <div className="scene">
      <div className="scene-toolbar">
        <button className={view === 'orbit' ? 'active' : ''} onClick={() => setView('orbit')}>{orbit.surface ? `${orbit.body === 'mars' ? '🔴' : '🌕'} ${t('Destino')}` : `🌍 ${t('Órbita')}`}</button>
        <button className={view === 'craft' ? 'active' : ''} onClick={() => setView('craft')}>🛰️ {t('Nave')}</button>
      </div>
      <div className="camera-tools">
        <button aria-label={t('Acercar')} onClick={() => { controls.current?.dollyIn(1.25); controls.current?.update(); }}>+</button>
        <button aria-label={t('Alejar')} onClick={() => { controls.current?.dollyOut(1.25); controls.current?.update(); }}>−</button>
      </div>
      <button className="camera-reset" onClick={() => { const c = controls.current; if (c) { c.object.position.set(...camera); c.target.set(0,0,0); c.update(); } }}>{t('Restablecer vista')}</button>
      <Canvas camera={initialCamera}>
        <CameraRig position={camera} />
        <color attach="background" args={['#050505']} />
        <ambientLight intensity={view === 'orbit' ? 0.25 : 0.6} />
        <directionalLight position={[30, 4, 6]} intensity={2.4} />
        <Stars radius={60} depth={30} count={3000} factor={3} fade />
        {view === 'orbit'
          ? (orbit.surface ? <PlanetView orbit={orbit} parts={parts} /> : <OrbitView orbit={orbit} parts={parts} />)
          : <SpacecraftModel parts={parts} spin onPick={onPick} flash={flash} />}
        <OrbitControls ref={controls} enablePan={false} minDistance={1.5} maxDistance={20} />
      </Canvas>
      <div className="scene-caption">
        {view === 'orbit'
          ? <><b>{orbit.name}</b> · {orbit.coverage}<br /><span className="muted">{orbit.help}</span></>
          : <><b>{parts.structure.name}</b> · {t('{n} instrumento(s)', { n: parts.instruments.length })} · {parts.solar.name} · {parts.comms.name}</>}
      </div>
    </div>
  );
}
