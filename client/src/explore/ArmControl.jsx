// Antena repetidora en 3D + brazo robótico + panel de control del brazo.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ARM, armWorld, aimSignal } from './antenna.js';
import { sfx } from '../sound.js';
import { t } from '../../../shared/i18n.js';

/** Antena en trípode con mástil telescópico, plato y luz que parpadea. */
export function AntennaModel({ mast = 1, active = false, damaged = false }) {
  const led = useRef();
  useFrame(({ clock }) => { if (led.current) led.current.emissiveIntensity = active ? (Math.sin(clock.elapsedTime * 5) > 0 ? 2 : 0.2) : 0; });
  const h = 0.5 + 1.6 * mast;
  return (
    <group rotation={[damaged ? 0.18 : 0, 0, damaged ? 0.12 : 0]}>
      {[0, 1, 2].map((i) => {
        const a = (i / 3) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.35, 0.28, Math.sin(a) * 0.35]} rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
            <meshStandardMaterial color="#b8bec4" metalness={0.8} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.55 + h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.04, 0.06, h, 8]} />
        <meshStandardMaterial color="#ecebe6" metalness={0.4} />
      </mesh>
      <group position={[0, 0.6 + h, 0]} rotation={[-0.7 * mast, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.45 * mast + 0.05, 0.05, 0.12, 20, 1, true]} />
          <meshStandardMaterial color="#e8e6df" side={THREE.DoubleSide} metalness={0.3} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.12, 0]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial ref={led} color="#69f0ae" emissive="#69f0ae" emissiveIntensity={0} />
        </mesh>
      </group>
    </group>
  );
}

/** Brazo de dos segmentos desde el frente del rover hasta la antena. */
export function DeployArm({ simRef, roverRef, terrain }) {
  const upper = useRef(), lower = useRef(), held = useRef(), ring = useRef();
  const v = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) }), []);
  const place = (mesh, from, to) => {
    const dir = v.c.copy(to).sub(from);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.scale.set(1, dir.length(), 1);
    mesh.quaternion.setFromUnitVectors(v.up, dir.normalize());
  };
  useFrame(() => {
    const sim = simRef.current, dep = sim.deploy, show = !!dep;
    [upper, lower, held, ring].forEach((r) => r.current && (r.current.visible = show));
    if (!dep || !roverRef.current) return;
    const r = roverRef.current.position;
    const fx = Math.sin(sim.heading), fz = Math.cos(sim.heading);
    const tip = armWorld(sim, dep.u, dep.v);
    const ground = terrain.heightAt(tip.x, tip.z);
    v.a.set(r.x + fx * 1.0, r.y + 1.0, r.z + fz * 1.0); // hombro
    v.b.set(tip.x, ground + dep.h + 1.4, tip.z); // muñeca (sobre la antena)
    const elbow = new THREE.Vector3().addVectors(v.a, v.b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.9, 0));
    place(upper.current, v.a, elbow);
    place(lower.current, elbow, v.b);
    held.current.position.set(tip.x, ground + dep.h, tip.z);
    held.current.rotation.y = sim.heading;
    const tgt = armWorld(sim, dep.target.u, dep.target.v);
    ring.current.position.set(tgt.x, terrain.heightAt(tgt.x, tgt.z) + 0.05, tgt.z);
    ring.current.scale.setScalar(dep.targetRadius);
  });
  return (
    <>
      <mesh ref={upper}><cylinderGeometry args={[0.06, 0.06, 1, 8]} /><meshStandardMaterial color="#ecebe6" metalness={0.5} /></mesh>
      <mesh ref={lower}><cylinderGeometry args={[0.05, 0.05, 1, 8]} /><meshStandardMaterial color="#ecebe6" metalness={0.5} /></mesh>
      <group ref={held}><HeldAntenna simRef={simRef} /></group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 40]} />
        <meshBasicMaterial color="#69f0ae" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function HeldAntenna({ simRef }) {
  const dep = simRef.current.deploy;
  return <AntennaModel mast={dep?.mast ?? 0} damaged={dep?.damaged} />;
}

/** Antena ya plantada + círculo de alcance + línea de enlace con el rover. */
export function DeployedAntenna({ simRef, roverRef, terrain }) {
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);
  const line = useRef();
  const a = simRef.current.antenna.deployed;
  useFrame(() => {
    const sim = simRef.current, ant = sim.antenna.deployed;
    if (!ant || !line.current || !roverRef.current) return;
    line.current.visible = sim.antennaLink;
    const y0 = terrain.heightAt(ant.x, ant.z) + 2.4, r = roverRef.current.position;
    lineGeo.attributes.position.array.set([ant.x, y0, ant.z, r.x, r.y + 2, r.z]);
    lineGeo.attributes.position.needsUpdate = true;
  });
  if (!a) return null;
  const y = terrain.heightAt(a.x, a.z);
  return (
    <>
      <group position={[a.x, y, a.z]}><AntennaModel mast={1} active damaged={a.damaged} /></group>
      <mesh position={[a.x, y + 0.3, a.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[a.range - 0.5, a.range, 96]} />
        <meshBasicMaterial color="#69f0ae" transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <lineSegments ref={line} geometry={lineGeo}>
        <lineBasicMaterial color="#69f0ae" transparent opacity={0.8} />
      </lineSegments>
    </>
  );
}

function Hold({ label, onChange, glow }) {
  return (
    <button className={`dash-btn hold ${glow ? 'glow' : ''}`}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onChange(true); }}
      onPointerUp={() => onChange(false)} onPointerCancel={() => onChange(false)}>{label}</button>
  );
}

const PHASE_HINT = {
  lower: 'Mueve el brazo hasta que el punto amarillo quede DENTRO del círculo verde. Luego mantén BAJAR (o la tecla Z) con precisión FINA.',
  anchor: 'La antena tocó el suelo. Pulsa ANCLAR para clavar sus patas.',
  mast: 'Desplegando el mástil telescópico…',
  aim: 'Gira la perilla hasta que la señal pase de 85% y pulsa ACTIVAR.',
};

/** Panel del brazo robótico (reemplaza al tablero mientras se planta la antena). */
export function ArmPanel({ sim, onAction, setArmInput, metersPerUnit }) {
  const dep = sim.deploy;
  if (!dep) return null;
  const S = 34; // px por unidad en el esquema
  const toX = (u) => 110 + u * S, toY = (v) => 172 - v * S;
  const err = Math.hypot(dep.u - dep.target.u, dep.v - dep.target.v);
  const inside = err <= dep.targetRadius;
  const signal = aimSignal(dep);
  const hints = sim.difficulty.id !== 'commander';
  return (
    <div className="cabin arm-mode">
      <div className="dashboard">
        <section className="dash-col">
          <h4 className="dash-title">🦾 {t('Vista superior del brazo')}</h4>
          <svg viewBox="0 0 220 200" className="arm-map">
            <rect x={toX(-0.8)} y={toY(0.6)} width={1.6 * S} height={0.75 * S} rx="6" className="arm-rover" />
            <text x={toX(0)} y={toY(0.05)} className="arm-label">{t('ROVER')}</text>
            <path d={`M${toX(-ARM.maxLateral)},${toY(ARM.minReach)} L${toX(ARM.maxLateral)},${toY(ARM.minReach)} L${toX(ARM.maxLateral)},${toY(ARM.maxReach)} L${toX(-ARM.maxLateral)},${toY(ARM.maxReach)} Z`} className="arm-reach" />
            <circle cx={toX(dep.target.u)} cy={toY(dep.target.v)} r={dep.targetRadius * S} className={`arm-target ${inside ? 'ok' : ''}`} />
            <line x1={toX(0)} y1={toY(1)} x2={toX(dep.u)} y2={toY(dep.v)} className="arm-line" />
            <circle cx={toX(dep.u)} cy={toY(dep.v)} r="7" className="arm-tip" />
          </svg>
          <small className={inside ? 'value ok' : 'value warn'}>{inside ? `✔ ${t('Sobre el objetivo')}` : t('A {cm} cm del objetivo', { cm: Math.round(err * 100) })}</small>
        </section>

        <section className="dash-col console">
          <div className="screen">
            {dep.log.slice(-5).map((l, i) => <div key={i} className="screen-line">{l}</div>)}
          </div>
          {hints && <div className="hint">🤖 {t(PHASE_HINT[dep.phase])}</div>}
          <div className="height-row">
            <span>{t('Altura')} {Math.round(dep.h * 100)} cm</span>
            <div className="bar big"><div className="fill ok" style={{ width: `${(dep.h / ARM.startHeight) * 100}%` }} /></div>
            <span className={dep.dropSpeed > dep.safeImpact ? 'value bad' : 'value ok'}>
              {t('Bajando a {v} cm/s', { v: Math.round(dep.dropSpeed * 100) })} {dep.dropSpeed > dep.safeImpact ? `⚠️ ${t('¡muy rápido!')}` : ''}
            </span>
          </div>
        </section>

        <section className="dash-col controls arm-controls">
          {dep.phase === 'lower' && (
            <>
              <div className="ctl-group">
                <h4>{t('Mover brazo (W A S D)')}</h4>
                <div className="arm-pad">
                  <span /><Hold label={`▲ ${t('lejos')}`} onChange={(on) => setArmInput('fwd', on ? 1 : 0)} /><span />
                  <Hold label="◀" onChange={(on) => setArmInput('turn', on ? 1 : 0)} />
                  <Hold label={`▼ ${t('cerca')}`} onChange={(on) => setArmInput('fwd', on ? -1 : 0)} />
                  <Hold label="▶" onChange={(on) => setArmInput('turn', on ? -1 : 0)} />
                </div>
              </div>
              <div className="ctl-group">
                <h4>{t('Altura (Z bajar · X subir)')}</h4>
                <Hold label={`⤓ ${t('BAJAR')}`} glow={hints && inside} onChange={(on) => setArmInput('y', on ? -1 : 0)} />
                <Hold label={`⤒ ${t('SUBIR')}`} onChange={(on) => setArmInput('y', on ? 1 : 0)} />
                <button className={`dash-btn ${dep.fine ? 'selected' : ''}`} onClick={() => { sfx.toggle(); onAction({ type: 'fine' }); }}>
                  {t('Precisión')}: {dep.fine ? `${t('FINA')} 🐢` : `${t('RÁPIDA')} 🐇`}
                </button>
                <button className="dash-btn" onClick={() => onAction({ type: 'cancel' })}>✕ {t('Cancelar')}</button>
              </div>
            </>
          )}
          {dep.phase === 'anchor' && (
            <button className={`dash-btn big-btn ${hints ? 'glow' : ''}`} onClick={() => { sfx.clunk(); onAction({ type: 'anchor' }); }}>⚓ {t('ANCLAR')}</button>
          )}
          {dep.phase === 'mast' && <div className="screen-line blink">▲ {t('Mástil subiendo…')} {Math.round(dep.mast * 100)}%</div>}
          {dep.phase === 'aim' && (
            <div className="ctl-group">
              <h4>{t('Apuntar a la Tierra · señal {pct}%', { pct: signal })}</h4>
              <div className={`antenna ${hints ? 'glow' : ''}`}>
                <input type="range" min="0" max="359" value={dep.aim} onChange={(e) => onAction({ type: 'aim', angle: Number(e.target.value) })} />
                <div className="bar"><div className={`fill ${signal >= 85 ? 'ok' : signal > 40 ? 'warn' : 'bad'}`} style={{ width: `${signal}%` }} /></div>
              </div>
              <button className={`dash-btn big-btn ${hints && signal >= 85 ? 'glow' : ''}`} onClick={() => { sfx.click(); onAction({ type: 'activate' }); }}>✅ {t('ACTIVAR')}</button>
            </div>
          )}
          <small className="muted arm-fact">{t('Dato real: en 2018 el módulo InSight usó su brazo robótico para dejar su sismómetro en el suelo de Marte. Los ingenieros practicaron cada movimiento con una copia en la Tierra.')}</small>
        </section>
      </div>
    </div>
  );
}
