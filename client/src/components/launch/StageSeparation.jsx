// Etapa/propulsor gastado que se suelta y cae girando durante la fase
// "stage". Es una malla genérica (no el GLB real) a propósito: solo necesita
// leerse como "algo pesado se desprende", no ser precisa. Módulo
// independiente del resto de la cinemática: solo necesita `active`/`progressRef`.
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/** `progressRef.current`: 0..1 dentro de la fase "stage", actualizado cada
 * cuadro por quien monta este componente. */
export default function StageSeparation({ active, progressRef }) {
  const group = useRef();
  const spin = useRef(Math.random() * Math.PI * 2);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;
    const t = progressRef.current ?? 0;
    g.position.set(1.1 * t, -4.2 * t * t, 0.5 * t);
    g.rotation.set(spin.current + t * 6, t * 3, t * 4);
    const opacity = Math.max(0, 1 - t * 1.1);
    g.traverse((o) => { if (o.material) o.material.opacity = opacity; });
  });

  return (
    <group ref={group} visible={false}>
      <mesh>
        <cylinderGeometry args={[0.32, 0.32, 1.6, 16]} />
        <meshStandardMaterial color="#c7ccd1" metalness={0.6} roughness={0.4} transparent />
      </mesh>
      <mesh position={[0, -0.95, 0]}>
        <coneGeometry args={[0.32, 0.4, 16]} />
        <meshStandardMaterial color="#2a2e36" metalness={0.5} roughness={0.6} transparent />
      </mesh>
    </group>
  );
}
