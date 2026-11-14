// Contenido 3D de la secuencia de lanzamiento (se monta dentro del <Canvas>
// de LaunchSequence.jsx). Puramente reactivo a la prop `phase`: no tiene su
// propio reloj de fases, solo anima lo que corresponde a la fase actual.
//
// El fondo del despegue (LaunchBackdrop), el propulsor que se suelta
// (StageSeparation) y el diagrama de inserción orbital (OrbitTrajectory)
// viven en ./launch/ como módulos independientes: cada uno solo necesita
// las refs/valores que se listan en su propio archivo, así que dos personas
// pueden tocarlos en paralelo sin pisarse (uno el ambiente/despegue, otro la
// mecánica de órbita) y este archivo solo los combina según la fase.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { orbitRadius } from './earthScene.jsx';
import { SpacecraftModel } from './Scene3D.jsx';
import RocketModel from './RocketModel.jsx';
import LaunchBackdrop from './launch/LaunchBackdrop.jsx';
import StageSeparation from './launch/StageSeparation.jsx';
import OrbitTrajectory from './launch/OrbitTrajectory.jsx';

const LIFTOFF_HEIGHT = 7; // unidades que sube el cohete durante "liftoff"
const SKY_PHASES = new Set(['assembly', 'countdown', 'liftoff', 'abort_pad', 'explode']);
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

function dotTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Partículas de un solo uso: sirve tanto para el escape del motor (continuo)
 * como para una explosión/choque (una ráfaga radial). */
function Particles({ active, burst = false, originRef, color = '#ffb74d', count = 90, size = 0.22, spread = 2.2 }) {
  const dot = useMemo(dotTexture, []);
  const state = useMemo(() => ({
    pos: new Float32Array(count * 3), vel: new Float32Array(count * 3), life: new Float32Array(count), next: 0, fired: false,
  }), [count]);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3));
    for (let i = 0; i < count; i++) state.pos[i * 3 + 1] = -9999;
    return g;
  }, [state, count]);
  const origin = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (!originRef.current) return;
    originRef.current.getWorldPosition(origin);
    const { pos, vel, life } = state;
    if (active && !burst) {
      for (let k = 0; k < 4; k++) {
        const i = state.next++ % count;
        pos[i * 3] = origin.x + (Math.random() - 0.5) * 0.15;
        pos[i * 3 + 1] = origin.y;
        pos[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.15;
        vel[i * 3] = (Math.random() - 0.5) * 0.6;
        vel[i * 3 + 1] = -(2 + Math.random() * 1.5);
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
        life[i] = 0.7 + Math.random() * 0.3;
      }
    } else if (active && burst && !state.fired) {
      state.fired = true;
      for (let i = 0; i < count; i++) {
        const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        const speed = spread * (0.4 + Math.random() * 0.9);
        pos[i * 3] = origin.x; pos[i * 3 + 1] = origin.y; pos[i * 3 + 2] = origin.z;
        vel[i * 3] = dir.x * speed; vel[i * 3 + 1] = dir.y * speed + 0.6; vel[i * 3 + 2] = dir.z * speed;
        life[i] = 0.8 + Math.random() * 0.6;
      }
    }
    if (!active && burst) state.fired = false;
    for (let i = 0; i < count; i++) {
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      life[i] -= dt;
      vel[i * 3 + 1] -= (burst ? 2.4 : 0.4) * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points geometry={geom} frustumCulled={false}>
      <pointsMaterial color={color} map={dot} alphaMap={dot} size={size} transparent opacity={0.9} depthWrite={false} />
    </points>
  );
}

/** Luna/Marte simplificado para el descenso a superficie (versión reducida de PlanetView). */
function MiniPlanet({ body }) {
  const mars = body === 'mars';
  return (
    <mesh position={[0, -3.4, 0]}>
      <sphereGeometry args={[3, 48, 48]} />
      <meshStandardMaterial color={mars ? '#b4552d' : '#9e9e9e'} roughness={1} />
    </mesh>
  );
}

export default function LaunchCinematic({ phase, outcome, surface, body, parts }) {
  const { camera } = useThree();
  const padGroup = useRef();
  const rocketScaleRef = useRef();
  const craftScaleRef = useRef();
  const craftGroup = useRef();
  const exhaustOrigin = useRef();
  const earthGroup = useRef();
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const camTarget = useMemo(() => new THREE.Vector3(), []);
  const shakeSeed = useRef(0);
  const altitudeRef = useRef(0);
  const stageProgressRef = useRef(0);
  const orbitTRef = useRef(0);

  const elapsed = useRef(0);
  const prevPhase = useRef(null);
  useEffect(() => { prevPhase.current = null; }, [phase]);

  const orbitLocked = outcome !== 'orbit_fail';

  useFrame((state, dt) => {
    if (prevPhase.current !== phase) { prevPhase.current = phase; elapsed.current = 0; }
    elapsed.current += dt;
    const te = elapsed.current;

    const rocketScale = rocketScaleRef.current;
    const craftScale = craftScaleRef.current;
    const pad = padGroup.current;
    const craft = craftGroup.current;

    // El grupo del cohete (76 mallas) solo se dibuja mientras hace falta.
    if (pad) {
      if (phase === 'explode') pad.visible = te <= 0.15;
      else pad.visible = ['assembly', 'countdown', 'liftoff', 'abort_pad', 'stage'].includes(phase);
    }

    switch (phase) {
      case 'assembly':
      case 'countdown': {
        if (pad) pad.position.y = 0;
        altitudeRef.current = 0;
        camPos.set(5.5, 2.5, 5.5);
        camTarget.set(0, 1.5, 0);
        break;
      }
      case 'liftoff': {
        const height = easeIn(Math.min(te / 2.2, 1)) * LIFTOFF_HEIGHT;
        if (pad) pad.position.y = height;
        altitudeRef.current = height / LIFTOFF_HEIGHT;
        camPos.set(5 + height * 0.15, 2.5 + height * 0.6, 7 + height * 0.1);
        camTarget.set(0, height + 1, 0);
        break;
      }
      case 'abort_pad': {
        altitudeRef.current = 0;
        shakeSeed.current += dt * 18;
        camPos.set(5.5 + Math.sin(shakeSeed.current) * 0.08, 2.5, 5.5 + Math.cos(shakeSeed.current * 1.3) * 0.08);
        camTarget.set(0, 1.5, 0);
        break;
      }
      case 'explode': {
        altitudeRef.current = 0;
        shakeSeed.current += dt * 22;
        if (pad && te > 0.15) pad.visible = false;
        camPos.set(5 + Math.sin(shakeSeed.current) * 0.3, 4.5 + Math.cos(shakeSeed.current * 1.7) * 0.2, 8);
        camTarget.set(0, 4, 0);
        break;
      }
      case 'stage': {
        const t = Math.min(te / 1.3, 1);
        stageProgressRef.current = t;
        if (rocketScale) rocketScale.scale.setScalar(Math.max(0.0001, 1 - easeOut(t)));
        if (craftScale) craftScale.scale.setScalar(easeOut(t));
        if (pad) pad.position.y = LIFTOFF_HEIGHT + t * 2;
        if (craft) craft.position.y = LIFTOFF_HEIGHT + t * 2;
        camPos.set(4, LIFTOFF_HEIGHT + 3, 6);
        camTarget.set(0, LIFTOFF_HEIGHT + 1, 0);
        break;
      }
      case 'insertion':
      case 'drift': {
        if (pad) pad.visible = false;
        orbitTRef.current = Math.min(te / 2, 1);
        camPos.set(3, 9, 15);
        camTarget.set(0, 0, 0);
        break;
      }
      case 'descent': {
        const t = Math.min(te / 2, 1);
        if (craft) craft.position.set(0, THREE.MathUtils.lerp(6, -1.2, easeIn(t)), 0);
        camPos.set(4, 1, 5);
        camTarget.set(0, -1, 0);
        break;
      }
      case 'touchdown': {
        if (craft) craft.position.y = -1.4;
        camPos.set(3.5, 0.8, 4.5);
        camTarget.set(0, -1.4, 0);
        break;
      }
      case 'crash': {
        shakeSeed.current += dt * 20;
        if (craft) craft.visible = false;
        camPos.set(3 + Math.sin(shakeSeed.current) * 0.2, 0.6, 4);
        camTarget.set(0, -1.4, 0);
        break;
      }
      default: {
        camPos.set(4, 2, 6);
        camTarget.set(0, 1, 0);
      }
    }

    camera.position.lerp(camPos, 1 - Math.exp(-3 * dt));
    camera.lookAt(camTarget);
  });

  const skyPhase = SKY_PHASES.has(phase);
  const showPad = !['insertion', 'drift', 'descent', 'touchdown', 'crash'].includes(phase);
  const showCraftOnPad = phase === 'stage';
  const showOrbitScene = phase === 'insertion' || phase === 'drift';
  const showPlanetScene = surface && ['descent', 'touchdown', 'crash'].includes(phase);
  const exhaustActive = phase === 'liftoff';
  const burstActive = phase === 'explode' || phase === 'crash';

  return (
    <>
      <color attach="background" args={['#05070f']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[20, 14, 10]} intensity={2.2} />
      <pointLight position={[0, 3, 4]} intensity={showPad ? 1.2 : 0} color="#ffcf8a" />
      {skyPhase ? <LaunchBackdrop altitudeRef={altitudeRef} /> : <Stars radius={80} depth={40} count={2200} factor={3} fade />}

      {showPad && (
        <mesh position={[0, -0.55, 0]}>
          <cylinderGeometry args={[1.5, 1.8, 1.1, 24]} />
          <meshStandardMaterial color="#2a2e36" metalness={0.5} roughness={0.6} />
        </mesh>
      )}

      <group ref={padGroup}>
        <group ref={rocketScaleRef} position={[0, 0, 0]}>
          <RocketModel play={phase === 'assembly'} scale={0.16} />
        </group>
        <object3D ref={exhaustOrigin} position={[0, -0.3, 0]} />
        <Particles active={exhaustActive} originRef={exhaustOrigin} color="#ffb74d" count={70} size={0.28} />
        <Particles active={phase === 'explode'} burst originRef={exhaustOrigin} color="#ff5722" count={120} size={0.3} />
        <StageSeparation active={phase === 'stage'} progressRef={stageProgressRef} />
      </group>

      {showCraftOnPad && (
        <group ref={craftGroup}>
          <group ref={craftScaleRef} scale={0.0001}>
            <SpacecraftModel parts={parts} spin={false} />
          </group>
        </group>
      )}

      {showOrbitScene && (
        <>
          <OrbitTrajectory earthRef={earthGroup} craftRef={craftGroup} phase={phase} tRef={orbitTRef} finalRadius={orbitRadius(600) * 3.4} locked={orbitLocked} />
          <group ref={craftGroup} scale={0.1}>
            <SpacecraftModel parts={parts} spin={false} />
          </group>
        </>
      )}

      {showPlanetScene && (
        <>
          <MiniPlanet body={body} />
          <group ref={craftGroup} scale={0.14}>
            <SpacecraftModel parts={parts} spin={false} />
          </group>
          <Particles active={burstActive && phase === 'crash'} burst originRef={craftGroup} color="#ff7043" count={110} size={0.28} />
        </>
      )}
    </>
  );
}
