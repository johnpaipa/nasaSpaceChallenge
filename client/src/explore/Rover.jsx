// Rover inspirado en Perseverance/Curiosity, armado con las piezas del diseño:
// suspensión rocker-bogie con 6 ruedas que siguen el terreno, mástil con
// cámaras, antena de alta ganancia, RTG con aletas o paneles solares, y brazo
// robótico que se despliega al analizar. Adelante = +Z.
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

const WHITE = '#ecebe6', GREY = '#9aa0a6', DARK = '#2a2d31', GOLD = '#c9a227', ALU = '#b8bec4';

/** Barra entre dos puntos (para brazos de suspensión y del brazo robótico). */
function Strut({ a, b, r = 0.04, color = GREY }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    return {
      pos: va.clone().add(vb).multiplyScalar(0.5),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize()),
      len: dir.length(),
    };
  }, [a, b]);
  return (
    <mesh position={pos} quaternion={quat} castShadow>
      <cylinderGeometry args={[r, r, len, 8]} />
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.4} />
    </mesh>
  );
}

function Wheel({ radius, width, wheelRef }) {
  const cleats = useMemo(() => Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2), []);
  return (
    <group ref={wheelRef}>
      <group rotation={[0, 0, Math.PI / 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[radius, radius, width, 24]} />
          <meshStandardMaterial color={ALU} metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[radius * 0.45, radius * 0.45, width * 1.04, 6]} />
          <meshStandardMaterial color={DARK} metalness={0.5} />
        </mesh>
        {/* tacos de tracción en zigzag, como las ruedas de Perseverance */}
        {cleats.map((a, i) => (
          <mesh key={i} position={[Math.cos(a) * radius, 0, Math.sin(a) * radius]} rotation={[0, -a, 0.25 * (i % 2 ? 1 : -1)]}>
            <boxGeometry args={[0.03, width * 0.95, 0.03]} />
            <meshStandardMaterial color={GREY} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * `simRef` y `terrain` permiten animar ruedas, suspensión y brazo cada cuadro.
 */
export default function Rover({ parts, roverRef, simRef, terrain }) {
  const size = { rover_s: 0.7, rover_m: 1, rover_l: 1.35 }[parts.mobility.id] ?? 1;
  const has = (id) => parts.instruments.some((i) => i.id === id);
  const wheelRefs = useRef([]);
  const armRef = useRef();
  const lightRef = useRef();
  const dishRef = useRef();
  const targetRef = useRef();
  useEffect(() => { if (lightRef.current && targetRef.current) lightRef.current.target = targetRef.current; }, []);
  const spin = useRef(0);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  // Geometría base (escala 1; el grupo exterior aplica el tamaño del rover).
  const R = 0.3, W = 0.26, track = 0.82, bodyY = 1.0;
  const wheels = [[track, 0.85], [track, -0.05], [track, -0.85], [-track, 0.85], [-track, -0.05], [-track, -0.85]];
  const solarBig = !parts.solar.constant && parts.solar.generation_w > 600;

  useFrame((_, dt) => {
    const sim = simRef.current;
    if (!sim || !roverRef.current) return;
    // Giro de ruedas según la velocidad real del rover.
    spin.current += (sim.speedNow / (R * size)) * dt;
    // Suspensión: cada rueda sube o baja para tocar el suelo (rocker-bogie simplificado).
    const root = roverRef.current;
    const baseY = root.position.y;
    wheelRefs.current.forEach((w, i) => {
      if (!w) return;
      const [wx, wz] = wheels[i];
      tmp.set(wx * size, 0, wz * size).applyAxisAngle(new THREE.Vector3(0, 1, 0), sim.heading);
      const ground = terrain.heightAt(root.position.x + tmp.x, root.position.z + tmp.z);
      const offset = THREE.MathUtils.clamp((ground - baseY) / size, -0.22, 0.22);
      w.position.y = THREE.MathUtils.lerp(w.position.y, R + offset, 0.3);
      w.rotation.x = spin.current;
    });
    // Brazo robótico: se despliega hacia el suelo al analizar.
    if (armRef.current) {
      const target = sim.analyzing ? -0.9 : 0.35;
      armRef.current.rotation.x = THREE.MathUtils.lerp(armRef.current.rotation.x, target, 1 - Math.exp(-4 * dt));
    }
    // Antena apuntando "hacia la Tierra" mientras transmite.
    if (dishRef.current) dishRef.current.rotation.y += (sim.transmitting ? 1.5 : 0.1) * dt;
    // Luces de navegación de noche o en sombra.
    if (lightRef.current) lightRef.current.intensity = !sim.isDay || sim.inShadow ? 60 : 0;
  });

  return (
    <group ref={roverRef}>
      <group scale={size}>
        {/* Chasis blanco con base dorada (aislamiento térmico) */}
        <RoundedBox args={[1.3, 0.42, 1.9]} radius={0.07} smoothness={3} position={[0, bodyY, 0]} castShadow>
          <meshStandardMaterial color={WHITE} metalness={0.25} roughness={0.55} />
        </RoundedBox>
        <mesh position={[0, bodyY - 0.24, 0]} castShadow>
          <boxGeometry args={[1.2, 0.07, 1.8]} />
          <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.3} />
        </mesh>
        {/* Cajas de instrumentos sobre la cubierta */}
        {parts.instruments.slice(0, 4).map((ins, i) => (
          <mesh key={ins.id} position={[-0.38 + (i % 2) * 0.32, bodyY + 0.29, 0.35 - Math.floor(i / 2) * 0.38]} castShadow>
            <boxGeometry args={[0.24, 0.16, 0.28]} />
            <meshStandardMaterial color={ins.color} metalness={0.3} roughness={0.5} />
          </mesh>
        ))}

        {/* Suspensión rocker-bogie */}
        {[1, -1].map((s) => (
          <group key={s}>
            <Strut a={[s * 0.68, bodyY - 0.05, 0.1]} b={[s * track, R + 0.05, 0.85]} />
            <Strut a={[s * 0.68, bodyY - 0.05, 0.1]} b={[s * track, 0.62, -0.45]} />
            <Strut a={[s * track, 0.62, -0.45]} b={[s * track, R + 0.05, -0.05]} />
            <Strut a={[s * track, 0.62, -0.45]} b={[s * track, R + 0.05, -0.85]} />
            <mesh position={[s * 0.68, bodyY - 0.05, 0.1]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.08, 0.08, 0.1, 12]} />
              <meshStandardMaterial color={DARK} />
            </mesh>
          </group>
        ))}
        {wheels.map(([x, z], i) => (
          <group key={i} position={[x, 0, z]}>
            <Wheel radius={R} width={W} wheelRef={(el) => (wheelRefs.current[i] = el)} />
          </group>
        ))}

        {/* Mástil con cámaras (Mastcam + SuperCam) */}
        <Strut a={[0.42, bodyY + 0.2, 0.72]} b={[0.42, bodyY + 1.35, 0.72]} r={0.05} color={WHITE} />
        <group position={[0.42, bodyY + 1.45, 0.75]}>
          <RoundedBox args={[0.5, 0.22, 0.26]} radius={0.04} castShadow>
            <meshStandardMaterial color={WHITE} metalness={0.3} roughness={0.5} />
          </RoundedBox>
          {[-0.14, 0.14].map((x) => (
            <mesh key={x} position={[x, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.04, 16]} />
              <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
            </mesh>
          ))}
          <mesh position={[0, 0.02, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.07, 0.07, 0.05, 20]} />
            <meshStandardMaterial color={has('mastcam') || has('rock_spectrometer') ? '#3fa9f5' : '#333'} emissive="#0a3a66" emissiveIntensity={0.4} metalness={0.9} roughness={0.1} />
          </mesh>
        </group>

        {/* Antena de alta ganancia (paleta hexagonal) y antena UHF */}
        <group position={[-0.42, bodyY + 0.3, -0.45]}>
          <Strut a={[0, 0, 0]} b={[0, 0.3, 0]} r={0.03} />
          <group ref={dishRef} position={[0, 0.32, 0]}>
            <mesh rotation={[-1.0, 0, 0]} castShadow>
              <cylinderGeometry args={[parts.comms.data_rate_mbps >= 100 ? 0.3 : 0.18, parts.comms.data_rate_mbps >= 100 ? 0.3 : 0.18, 0.04, 6]} />
              <meshStandardMaterial color="#d8d6cf" metalness={0.4} roughness={0.4} />
            </mesh>
          </group>
        </group>
        <Strut a={[0.15, bodyY + 0.2, -0.7]} b={[0.15, bodyY + 0.65, -0.7]} r={0.025} color={WHITE} />

        {/* Energía: RTG con aletas atrás, o cubierta de paneles solares */}
        {parts.solar.constant ? (
          <group position={[0, bodyY + 0.15, -1.15]} rotation={[-0.55, 0, 0]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.13, 0.13, 0.7, 16]} />
              <meshStandardMaterial color="#7d838c" metalness={0.8} roughness={0.3} />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => (
              <mesh key={i} rotation={[0, (i / 8) * Math.PI * 2, 0]} position={[0, 0, 0]}>
                <boxGeometry args={[0.34, 0.6, 0.02]} />
                <meshStandardMaterial color="#6b727c" metalness={0.7} roughness={0.35} />
              </mesh>
            ))}
          </group>
        ) : (
          <group position={[0, bodyY + 0.24, -0.05]}>
            <mesh castShadow>
              <boxGeometry args={[solarBig ? 2.6 : 1.7, 0.035, 2.0]} />
              <meshStandardMaterial color="#1b2f7a" metalness={0.8} roughness={0.2} />
            </mesh>
            {Array.from({ length: solarBig ? 8 : 5 }, (_, i) => (
              <mesh key={i} position={[(i - ((solarBig ? 8 : 5) - 1) / 2) * 0.32, 0.02, 0]}>
                <boxGeometry args={[0.012, 0.01, 1.98]} />
                <meshStandardMaterial color="#8fa6d8" />
              </mesh>
            ))}
          </group>
        )}

        {/* Brazo robótico con torreta (taladro si lo lleva) */}
        <group ref={armRef} position={[0, bodyY - 0.05, 0.98]} rotation={[0.35, 0, 0]}>
          <Strut a={[0, 0, 0]} b={[0, -0.05, 0.55]} r={0.045} color={WHITE} />
          <Strut a={[0, -0.05, 0.55]} b={[0, -0.45, 0.75]} r={0.04} color={WHITE} />
          <mesh position={[0, -0.55, 0.78]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.14, 12]} />
            <meshStandardMaterial color={GREY} metalness={0.7} />
          </mesh>
          {has('drill') && (
            <mesh position={[0, -0.72, 0.78]}>
              <coneGeometry args={[0.04, 0.22, 10]} />
              <meshStandardMaterial color="#ffb74d" metalness={0.8} />
            </mesh>
          )}
        </group>

        {/* Luces de navegación (se encienden de noche) */}
        <spotLight ref={lightRef} position={[0, bodyY + 0.2, 1.0]} angle={0.6} penumbra={0.6} distance={30} decay={1} intensity={0} color="#fff6e0" />
        <object3D ref={targetRef} position={[0, -1, 8]} />
        {[-0.4, 0.4].map((x) => (
          <mesh key={x} position={[x, bodyY + 0.05, 0.96]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color="#fff" emissive="#fff3c4" emissiveIntensity={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Polvo que levantan las ruedas. En Marte (con atmósfera) flota y se queda en
 * el aire; en la Luna (sin aire) sale en arcos y cae rápido.
 */
/** Textura circular difusa para que las partículas no se vean cuadradas. */
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

export function DustTrail({ simRef, roverRef, body, color }) {
  const COUNT = 140;
  const ref = useRef();
  const dot = useMemo(dotTexture, []);
  const state = useMemo(() => ({
    pos: new Float32Array(COUNT * 3), vel: new Float32Array(COUNT * 3), life: new Float32Array(COUNT), next: 0,
  }), []);
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(state.pos, 3));
    return g;
  }, [state]);
  const airless = body === 'moon';

  useFrame((_, dt) => {
    const sim = simRef.current, rover = roverRef.current;
    if (!sim || !rover) return;
    const { pos, vel, life } = state;
    if (sim.moving) {
      for (let k = 0; k < 3; k++) {
        const i = state.next++ % COUNT;
        const back = -0.9 - Math.random() * 0.3, side = (Math.random() < 0.5 ? -1 : 1) * 0.8;
        const sx = Math.sin(sim.heading), cz = Math.cos(sim.heading);
        pos[i * 3] = rover.position.x + sx * back + cz * side;
        pos[i * 3 + 1] = rover.position.y + 0.15;
        pos[i * 3 + 2] = rover.position.z + cz * back - sx * side;
        vel[i * 3] = (Math.random() - 0.5) * 0.8 - sx * 0.6;
        vel[i * 3 + 1] = airless ? 1.5 + Math.random() * 1.5 : 0.3 + Math.random() * 0.4;
        vel[i * 3 + 2] = (Math.random() - 0.5) * 0.8 - cz * 0.6;
        life[i] = airless ? 1.2 : 3;
      }
    }
    for (let i = 0; i < COUNT; i++) {
      if (life[i] <= 0) { pos[i * 3 + 1] = -9999; continue; }
      life[i] -= dt;
      if (airless) vel[i * 3 + 1] -= 3.2 * dt; // gravedad lunar, sin aire que lo frene
      else { vel[i * 3] *= 0.98; vel[i * 3 + 2] *= 0.98; vel[i * 3 + 1] *= 0.97; } // el aire marciano lo frena
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    }
    geom.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} geometry={geom} frustumCulled={false}>
      <pointsMaterial color={color} map={dot} alphaMap={dot} size={airless ? 0.25 : 0.7} transparent opacity={airless ? 0.85 : 0.4} depthWrite={false} />
    </points>
  );
}
