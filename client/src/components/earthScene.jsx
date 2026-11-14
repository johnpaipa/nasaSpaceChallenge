// Tierra, estaciones terrenas y anillo orbital: piezas 3D compartidas entre
// el visor del Diseñador (Scene3D) y la secuencia de lanzamiento (LaunchCinematic).
import { Suspense, useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

export const EARTH_SPIN = 0.08; // rad/s visual
export const deg = THREE.MathUtils.degToRad;

// Escala logarítmica para que LEO y GEO quepan en la misma escena.
export const orbitRadius = (altKm) => 1 + Math.log10(1 + altKm / 100) * 0.6;

export const STATIONS = [
  ['Svalbard', 78.2, 15.4], ['Fairbanks', 64.8, -147.7], ['Madrid', 40.4, -4.2],
  ['Goldstone', 35.4, -116.9], ['Santiago', -33.1, -70.7], ['Canberra', -35.4, 148.9],
];
export const latLon = (lat, lon, r = 1) => new THREE.Vector3(
  r * Math.cos(deg(lat)) * Math.cos(deg(lon)), r * Math.sin(deg(lat)), -r * Math.cos(deg(lat)) * Math.sin(deg(lon)),
);

export function EarthSurface() {
  const map = useLoader(THREE.TextureLoader, '/textures/earth.jpg');
  return <meshStandardMaterial map={map} roughness={0.9} />;
}

export function Earth({ earthRef }) {
  return (
    <group ref={earthRef}>
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <Suspense fallback={<meshStandardMaterial color="#1e5fa8" />}><EarthSurface /></Suspense>
      </mesh>
      {STATIONS.map(([name, lat, lon]) => (
        <mesh key={name} position={latLon(lat, lon, 1.01)}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial color="#ffeb3b" />
        </mesh>
      ))}
      <mesh scale={1.04}>
        <sphereGeometry args={[1, 48, 48]} />
        <meshBasicMaterial color="#4fc3f7" transparent opacity={0.08} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/** Dibuja líneas entre la nave y cada estación que la "ve" sobre el horizonte. */
export function CommLinks({ earthRef, satRef, range }) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(STATIONS.length * 6), 3));
    return g;
  }, []);
  const sat = new THREE.Vector3();
  const st = new THREE.Vector3();
  useFrame(() => {
    if (!earthRef.current || !satRef.current) return;
    satRef.current.getWorldPosition(sat);
    const pos = geo.attributes.position;
    let n = 0;
    STATIONS.forEach(([, lat, lon]) => {
      st.copy(latLon(lat, lon, 1.01)).applyMatrix4(earthRef.current.matrixWorld);
      const elevation = sat.clone().sub(st).normalize().dot(st.clone().normalize());
      if (elevation > 0.15 && sat.distanceTo(st) < range) {
        pos.setXYZ(n++, st.x, st.y, st.z);
        pos.setXYZ(n++, sat.x, sat.y, sat.z);
      }
    });
    pos.needsUpdate = true;
    geo.setDrawRange(0, n);
  });
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#69f0ae" transparent opacity={0.85} />
    </lineSegments>
  );
}
