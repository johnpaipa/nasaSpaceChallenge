// Carga el modelo 3D real del cohete (Gemini.glb, cortesía de los recursos 3D
// de la NASA) para la secuencia de lanzamiento. Si el modelo o su animación
// de ensamblaje fallan por cualquier razón, el cohete igual se ve (malla
// estática): nunca debe romper la secuencia.
import { useEffect, useMemo, useRef } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import * as THREE from 'three';

const MODEL_URL = '/models/Gemini.glb';
const ASSEMBLY_CLIP = 'gemini_carAction';
const MAX_CLIP_SECONDS = 30;

useGLTF.preload(MODEL_URL);

/** `play`: dispara (una vez) la animación de ensamblaje si existe y parece sana. */
export default function RocketModel({ play = false, ...groupProps }) {
  const { scene, animations } = useGLTF(MODEL_URL);
  // Clona la escena: el mismo GLTF cacheado no puede montarse dos veces a la vez.
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const group = useRef();
  const { actions } = useAnimations(animations, group);
  const played = useRef(false);

  useEffect(() => {
    if (!play || played.current) return;
    played.current = true;
    try {
      const action = actions?.[ASSEMBLY_CLIP];
      const duration = action?.getClip().duration;
      if (action && duration > 0 && duration < MAX_CLIP_SECONDS) {
        action.reset().setLoop(THREE.LoopOnce, 1).play();
        action.clampWhenFinished = true;
      }
    } catch { /* animación no disponible: se queda con la malla estática */ }
  }, [play, actions]);

  return (
    <group ref={group} {...groupProps}>
      <primitive object={clone} />
    </group>
  );
}
