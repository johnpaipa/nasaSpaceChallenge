// Cielo de la plataforma de lanzamiento: domo con degradado azul→espacio y
// nubes bajas que se funden a negro conforme sube `altitudeRef` (0 = en
// tierra, 1 = fuera de la atmósfera). Módulo independiente: quien lo edite
// no toca la mecánica de vuelo ni la órbita (ver OrbitTrajectory.jsx).
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function skyGradientTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#07101f');
  grad.addColorStop(0.55, '#2f6fb0');
  grad.addColorStop(0.82, '#bfe0f5');
  grad.addColorStop(1, '#fef6e4');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  return new THREE.CanvasTexture(c);
}

function cloudTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const CLOUD_PUFFS = [
  [-2.6, -0.3, 1.2, 2.2], [2.2, -0.5, -1.4, 1.8], [0.4, -0.7, 2.6, 2.6],
  [-1.2, -0.6, -2.2, 2.0], [3.1, -0.2, 1.6, 1.6], [-3.2, -0.4, -0.6, 2.4],
];

/** `altitudeRef.current`: 0..1, actualizado cada cuadro por quien monta este
 * componente (LaunchCinematic). Nunca se lee como prop reactivo a propósito:
 * así se evita re-renderizar React 60 veces por segundo. */
export default function LaunchBackdrop({ altitudeRef }) {
  const sky = useMemo(skyGradientTexture, []);
  const cloud = useMemo(cloudTexture, []);
  const skyMat = useRef();
  const cloudRefs = useRef([]);

  useFrame(() => {
    const altitude01 = altitudeRef.current ?? 0;
    const fade = Math.max(0, 1 - altitude01 * 1.6);
    if (skyMat.current) skyMat.current.opacity = fade;
    cloudRefs.current.forEach((sprite, i) => {
      if (!sprite) return;
      sprite.material.opacity = fade * 0.8;
      sprite.position.y = CLOUD_PUFFS[i][1] - altitude01 * 1.5;
    });
  });

  return (
    <>
      <mesh scale={60} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial ref={skyMat} map={sky} side={THREE.BackSide} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {CLOUD_PUFFS.map(([x, y, z, s], i) => (
        <sprite key={i} ref={(el) => { cloudRefs.current[i] = el; }} position={[x, y, z]} scale={[s * 2.2, s, 1]}>
          <spriteMaterial map={cloud} transparent opacity={0.8} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}
