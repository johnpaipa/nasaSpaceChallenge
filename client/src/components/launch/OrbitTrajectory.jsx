// Diagrama de inserción orbital: una elipse de transferencia punteada (como
// un plano real de diseño de misión) por la que viaja la nave hasta cerrar
// en la órbita final sólida, o quedarse a la deriva si `locked` es false.
// Módulo independiente: solo toca la Tierra/elipses/posición de la nave, no
// la plataforma ni el fondo del despegue (ver LaunchBackdrop.jsx).
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Earth } from '../earthScene.jsx';

const START_ANGLE = -2.5;
const END_ANGLE = -0.25;
const smoothstep = (x) => { const s = THREE.MathUtils.clamp(x, 0, 1); return s * s * (3 - 2 * s); };

function ellipsePoint(rx, rz, tilt, angle, out) {
  return out.set(Math.cos(angle) * rx, Math.sin(angle) * rx * tilt, Math.sin(angle) * rz);
}

function buildEllipseGeometry(rx, rz, tilt) {
  const pts = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= 160; i++) pts.push(ellipsePoint(rx, rz, tilt, (i / 160) * Math.PI * 2, p).clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** `tRef.current`: progreso 0..1 de la fase actual ("insertion" o "drift"),
 * actualizado cada cuadro por quien monta este componente. */
export default function OrbitTrajectory({ earthRef, craftRef, phase, tRef, finalRadius, locked }) {
  const transfer = useMemo(() => ({ rx: finalRadius * 1.6, rz: finalRadius * 0.95, tilt: 0.18 }), [finalRadius]);
  const transferGeom = useMemo(() => buildEllipseGeometry(transfer.rx, transfer.rz, transfer.tilt), [transfer]);
  const finalGeom = useMemo(() => buildEllipseGeometry(finalRadius, finalRadius, 0.05), [finalRadius]);
  const transferLine = useRef();
  const finalLine = useRef();
  const point = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    if (earthRef.current) earthRef.current.rotation.y += 0.05 * dt;
    const t = tRef.current ?? 0;
    const angle = THREE.MathUtils.lerp(START_ANGLE, END_ANGLE, Math.min(t, 1));

    if (craftRef.current) {
      if (phase === 'insertion') {
        ellipsePoint(transfer.rx, transfer.rz, transfer.tilt, angle, point);
        if (locked) {
          ellipsePoint(finalRadius, finalRadius, 0.05, angle, target);
          point.lerp(target, smoothstep((t - 0.7) / 0.3));
        }
        craftRef.current.rotation.y += dt * 0.5;
      } else {
        const wobble = Math.sin(t * 3) * 0.12;
        ellipsePoint(transfer.rx * (1 - Math.min(t, 1) * 0.1), transfer.rz * (1 + wobble), transfer.tilt + wobble * 0.25, angle + t * 1.6, point);
        craftRef.current.rotation.z += dt * 1.6;
        craftRef.current.rotation.x += dt * 0.9;
      }
      craftRef.current.position.copy(point);
    }

    const closing = smoothstep((t - 0.7) / 0.3);
    if (transferLine.current) transferLine.current.material.opacity = phase === 'drift' ? 0.65 : Math.max(0.12, 1 - closing);
    if (finalLine.current) finalLine.current.material.opacity = phase === 'insertion' && locked ? closing : 0;
  });

  return (
    <>
      <group ref={earthRef}><Earth earthRef={earthRef} /></group>
      <line ref={(l) => { transferLine.current = l; if (l) l.computeLineDistances(); }} geometry={transferGeom}>
        <lineDashedMaterial color={phase === 'drift' ? '#ff6e6e' : '#4fd3ff'} dashSize={0.22} gapSize={0.14} transparent opacity={0.5} depthWrite={false} />
      </line>
      <line ref={(l) => { finalLine.current = l; }} geometry={finalGeom}>
        <lineBasicMaterial color="#69f0ae" transparent opacity={0} depthWrite={false} />
      </line>
    </>
  );
}
