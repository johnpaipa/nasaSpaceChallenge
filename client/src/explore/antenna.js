// Antena repetidora que el rover planta con su brazo robótico, como hizo el
// módulo InSight al bajar su sismómetro al suelo de Marte (2018).
// Un lugar ALTO y PLANO "ve" más cielo: más alcance y mejor señal.
// Lógica pura (sin gráficos) para poder probarla.
import { t } from '../../../shared/i18n.js';

export const ARM = {
  minReach: 1.6, maxReach: 4.6, maxLateral: 1.8, startHeight: 2.2,
  moveSpeed: 1.2, fineDrop: 0.3, fastDrop: 1.3,
};
// Velocidad máxima de contacto (unidades/s ≈ m/s) y tolerancia al objetivo, por dificultad.
const SAFE_IMPACT = { explorer: 0.7, engineer: 0.55, commander: 0.4 };
const TARGET_RADIUS = { explorer: 0.7, engineer: 0.5, commander: 0.35 };

/** Calidad de un lugar para la antena (0–1) y por qué. */
export function siteQuality(sim, terrain, x, z) {
  const h = terrain.heightAt(x, z);
  const height = (h - terrain.hMin) / (terrain.hMax - terrain.hMin || 1);
  const e = 1.5;
  const g = Math.hypot(terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z), terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
  const slope = (Math.atan(g / (sim.site.vertical_exaggeration ?? 1)) * 180) / Math.PI;
  const reasons = [];
  let q = 0.3 + 0.7 * height;
  reasons.push(t(height > 0.66 ? 'alto: ve mucho cielo' : height > 0.33 ? 'altura media' : 'bajo: el relieve tapa la señal'));
  if (slope > 10) { q *= 0.6; reasons.push(t('inclinado ({deg}°)', { deg: Math.round(slope) })); } else reasons.push(t('plano'));
  if (terrain.inShadow(x, z)) { q *= 0.5; reasons.push(t('en sombra: sin Sol para su panel')); }
  if (terrain.sandAt?.(x, z)) { q *= 0.7; reasons.push(t('arena blanda: se hunde')); }
  q = Math.max(0.1, Math.min(1, q));
  return { q, stars: q > 0.72 ? 3 : q > 0.48 ? 2 : 1, reasons };
}

/** Posición en el mundo de la punta del brazo (u = lateral, + derecha; v = alcance hacia adelante). */
export function armWorld(sim, u, v) {
  const fx = Math.sin(sim.heading), fz = Math.cos(sim.heading);
  // a la derecha del rover (mirando a +z, la derecha es −x)
  return { x: sim.x + fx * v - fz * u, z: sim.z + fz * v + fx * u };
}

export function canDeploy(sim) {
  return sim.started && !sim.ended && !sim.fault && !sim.deploy && !sim.antenna.deployed && !sim.hibernating && !sim.tipped && !sim.analyzing;
}

export function startDeploy(sim) {
  if (!canDeploy(sim)) return false;
  const d = sim.difficulty.id;
  sim.deploy = {
    phase: 'lower', u: 0, v: 2.4, h: ARM.startHeight, dropSpeed: 0, fine: true, mast: 0,
    target: { u: (sim.rng() - 0.5) * 1.8, v: 3 + sim.rng() * 1.2 },
    targetRadius: TARGET_RADIUS[d] ?? 0.5, safeImpact: SAFE_IMPACT[d] ?? 0.55,
    aim: Math.floor(sim.rng() * 360), aimTarget: Math.floor(sim.rng() * 360),
    damaged: false, error: 0, log: [t('> Brazo robótico listo. Antena sujeta a 2,2 m del suelo.')],
  };
  sim.messages.push({ text: t('🦾 Control del brazo: lleva la antena hasta el círculo verde y bájala DESPACIO.'), kind: 'info', t: sim.t });
  return true;
}

export function aimSignal(dep) {
  const diff = (((dep.aim - dep.aimTarget) % 360) + 540) % 360 - 180;
  return Math.round(100 * Math.max(0, Math.cos((diff * Math.PI) / 180)) ** 6);
}

/** Avanza el despliegue (la misión queda en pausa). input: fwd = alcance, turn = lateral, y = subir/bajar. */
export function deployTick(sim, input, dt) {
  const dep = sim.deploy;
  if (dep.phase === 'lower') {
    if (dep.h > 0) {
      dep.v = Math.min(ARM.maxReach, Math.max(ARM.minReach, dep.v + (input.fwd || 0) * ARM.moveSpeed * dt));
      dep.u = Math.min(ARM.maxLateral, Math.max(-ARM.maxLateral, dep.u - (input.turn || 0) * ARM.moveSpeed * dt));
      const drop = input.y < 0 ? (dep.fine ? ARM.fineDrop : ARM.fastDrop) : input.y > 0 ? -ARM.fineDrop : 0;
      dep.dropSpeed = Math.max(0, drop);
      dep.h = Math.min(ARM.startHeight, dep.h - drop * dt);
      if (dep.h <= 0) touchDown(sim, drop);
    }
  } else if (dep.phase === 'mast') {
    dep.mast = Math.min(1, dep.mast + dt / 2);
    if (dep.mast >= 1) { dep.phase = 'aim'; dep.log.push(t('> Mástil desplegado. Gira la antena hacia la Tierra.')); }
  }
}

function touchDown(sim, speed) {
  const dep = sim.deploy;
  dep.h = 0;
  dep.error = Math.hypot(dep.u - dep.target.u, dep.v - dep.target.v);
  dep.damaged = speed > dep.safeImpact;
  dep.phase = 'anchor';
  dep.log.push(dep.damaged
    ? t('> ⚠️ ¡GOLPE! La antena tocó el suelo a {v} cm/s y se dañó un poco.', { v: Math.round(speed * 100) })
    : t('> Contacto suave ({v} cm/s). ✔', { v: Math.round(speed * 100) }));
  dep.log.push(dep.error <= dep.targetRadius
    ? t('> Posición dentro del objetivo. ✔')
    : t('> Quedó a {cm} cm del objetivo: quedará algo inclinada.', { cm: Math.round(dep.error * 100) }));
  if (dep.damaged) sim.messages.push({ text: t('💥 ¡La antena golpeó el suelo! InSight bajó su sismómetro a solo unos centímetros por segundo para no dañarlo.'), kind: 'warn', t: sim.t, fact: true });
}

export function deployAction(sim, action) {
  const dep = sim.deploy;
  if (!dep) return;
  switch (action.type) {
    case 'fine': dep.fine = !dep.fine; break;
    case 'cancel':
      if (dep.phase === 'lower') { sim.deploy = null; sim.messages.push({ text: t('Despliegue cancelado: la antena volvió a su soporte.'), kind: 'info', t: sim.t }); }
      break;
    case 'anchor':
      if (dep.phase === 'anchor') { dep.phase = 'mast'; dep.log.push(t('> Patas ancladas al suelo. Desplegando mástil…')); }
      break;
    case 'aim': if (dep.phase === 'aim') dep.aim = ((action.angle % 360) + 360) % 360; break;
    case 'activate': {
      if (dep.phase !== 'aim') break;
      const s = aimSignal(dep);
      if (s < 85) { dep.log.push(t('> Señal muy débil ({s}%). Sigue girando hasta pasar de 85%.', { s })); break; }
      finish(sim);
      break;
    }
  }
}

function finish(sim, terrain = sim.terrainRef) {
  const dep = sim.deploy;
  const pos = armWorld(sim, dep.u, dep.v);
  const base = terrain ? siteQuality(sim, terrain, pos.x, pos.z) : { q: 0.6, reasons: [] };
  const placement = dep.error <= dep.targetRadius ? 1 : Math.max(0.5, 1 - (dep.error - dep.targetRadius) / 1.5);
  const q = Math.max(0.1, base.q * placement * (dep.damaged ? 0.6 : 1));
  sim.antenna.deployed = { ...pos, q, range: 30 + 70 * q, reasons: base.reasons, damaged: dep.damaged };
  sim.deploy = null;
  const stars = q > 0.72 ? '★★★' : q > 0.48 ? '★★☆' : '★☆☆';
  sim.messages.push({
    text: t('📡 ¡Antena repetidora activa! Calidad {stars}, alcance {m} m. Cerca de ella puedes enviar datos en cualquier momento. Los astronautas del Apolo 15, 16 y 17 apuntaban a mano a la Tierra la antena de su rover lunar para transmitir TV en vivo.', { stars, m: Math.round(sim.antenna.deployed.range * (terrain?.metersPerUnit ?? 10)) }),
    kind: 'win', t: sim.t, fact: true,
  });
}
