import { test } from 'node:test';
import assert from 'node:assert/strict';
import { index } from '../../../shared/catalog.js';
import { resolveDesign } from '../../../shared/engine.js';
import { defaultDesign } from '../../../shared/state.js';
import { createTerrain } from './terrain.js';
import { createSim, step, startAnalysis, summarize } from './sim.js';
import { FAULTS, startFault, panelAction, signalStrength, currentStep } from './faults.js';

/** Repara una falla con la secuencia correcta (como lo haría un buen jugador). */
function solveFault(sim) {
  const f = sim.fault, p = f.panel;
  panelAction(sim, { type: 'diag' });
  if (f.id === 'power') { panelAction(sim, { type: 'circuit', id: 'instr', on: false }); panelAction(sim, { type: 'breaker' }); }
  if (f.id === 'computer') { panelAction(sim, { type: 'computer', side: 'B' }); panelAction(sim, { type: 'reboot' }); }
  if (f.id === 'heater') { panelAction(sim, { type: 'heater', on: true }); panelAction(sim, { type: 'circuit', id: 'instr', on: false }); panelAction(sim, { type: 'circuit', id: 'cameras', on: false }); }
  if (f.id === 'antenna') { panelAction(sim, { type: 'antenna', angle: p.antennaTarget + 3 }); panelAction(sim, { type: 'lock' }); }
  if (f.id === 'wheel') { panelAction(sim, { type: 'wheel', i: p.jammedWheel }); panelAction(sim, { type: 'test' }); }
}

const NO_MOVE = { fwd: 0, turn: 0 };

/**
 * Piloto automático: visita cada lugar analizable, lo analiza y sigue.
 * Con retraso de señal maneja como un operador real: manda un "pulso" de
 * movimiento, espera a ver el resultado y recién entonces manda el siguiente.
 */
function autopilot(missionId, overrides, difficulty = 'explorer', { repair = true } = {}) {
  const parts = resolveDesign({ ...defaultDesign(), ...overrides });
  const site = index.sites[index.missions[missionId].site];
  const terrain = createTerrain(site);
  const sim = createSim(site, parts, difficulty);
  let stuck = 0;
  let pulse = { input: NO_MOVE, until: 0, waitUntil: 0 };
  while (!sim.ended) {
    if (sim.fault && !sim.fault.solved && !sim.fault.rebooting && repair) solveFault(sim);
    let input = { fwd: 0, turn: 0 };
    const target = site.pois
      .filter((p) => sim.pois[p.id] === 'pending')
      .sort((a, b) => Math.hypot(a.x - sim.x, a.z - sim.z) - Math.hypot(b.x - sim.x, b.z - sim.z))[0];
    if (target && !sim.analyzing && !sim.hibernating) {
      const diff = ((Math.atan2(target.x - sim.x, target.z - sim.z) - sim.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (sim.signalDelay === 0) {
        if (sim.near === target.id) startAnalysis(sim);
        else input = stuck > 40 ? { fwd: 1, turn: 1 } : { fwd: Math.abs(diff) < 0.5 ? 1 : 0, turn: Math.sign(diff) };
      } else if (sim.t < pulse.until) input = pulse.input;
      else if (sim.t >= pulse.waitUntil) {
        const dist = Math.hypot(target.x - sim.x, target.z - sim.z);
        let dur;
        if (sim.near === target.id && dist < 6) { startAnalysis(sim); dur = 0; }
        else if (Math.abs(diff) > 0.25) { pulse.input = { fwd: 0, turn: Math.sign(diff) }; dur = Math.min(0.6, Math.abs(diff) / 1.6); }
        else { pulse.input = stuck > 2 ? { fwd: 1, turn: 1 } : { fwd: 1, turn: 0 }; dur = Math.min(1.5, Math.max(0.2, (dist - 3) / sim.speed)); }
        pulse = { input: pulse.input, until: sim.t + dur, waitUntil: sim.t + dur + sim.signalDelay + 0.2 };
        if (dur) input = pulse.input;
      }
    }
    const [px, pz] = [sim.x, sim.z];
    step(sim, input, 0.05, terrain);
    // atascado = el rover recibió orden de avanzar pero no se movió (pendiente)
    if (sim.applied.fwd) stuck = sim.x === px && sim.z === pz ? stuck + 1 : 0;
    if (stuck > 80) stuck = 0;
    sim.messages.length = 0;
  }
  return { sim, summary: summarize(sim) };
}

const mars = { orbit: 'mars_surface', battery: 'b2000', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_m', solar: 'rtg' };

test('un buen rover en Marte envía la mayoría de la ciencia', () => {
  const { sim, summary } = autopilot('mars_life', { ...mars, instruments: ['drill', 'rock_spectrometer', 'mastcam', 'ground_radar'] });
  assert.equal(sim.hibernations, 0);
  assert.equal(summary.stars, 3, `ciencia ${sim.science}/${sim.maxScience}`);
});

test('sin el instrumento adecuado un lugar queda bloqueado', () => {
  const { sim } = autopilot('mars_life', { ...mars, instruments: ['mastcam'] });
  assert.equal(sim.pois.channel, 'locked');
  assert.equal(sim.pois.butte, 'sent');
});

test('batería chica con paneles pequeños hace hibernar al rover', () => {
  const { sim, summary } = autopilot('mars_life', { ...mars, solar: 'deploy_s', battery: 'b500', instruments: ['mastcam', 'rock_spectrometer'] });
  assert.ok(sim.hibernations > 0);
  assert.ok(summary.lessons.some((l) => l.includes('batería')));
});

test('una radio lenta deja datos sin enviar', () => {
  const { summary } = autopilot('mars_life', { ...mars, comms: 'uhf', instruments: ['mastcam', 'rock_spectrometer'] });
  assert.ok(summary.pendingMb > 0);
});

test('los sitios usan elevaciones reales de NASA', () => {
  const jezero = createTerrain(index.sites.mars_jezero);
  const moon = createTerrain(index.sites.moon_south_pole);
  // Jezero: fondo del cráter ~ −2 590 m y cima del delta ~ −2 470 m (HiRISE)
  assert.ok(jezero.dem && jezero.dem.min < -2580 && jezero.dem.max > -2480);
  // Polo sur: el hielo está en el fondo de un cráter en sombra permanente (LOLA)
  const ice = index.sites.moon_south_pole.pois.find((p) => p.id === 'ice');
  assert.ok(moon.inShadow(ice.x, ice.z));
  assert.ok(moon.elevationAt(ice.x, ice.z) < -1150);
  const s = index.sites.moon_south_pole.start;
  assert.ok(!moon.inShadow(s.x, s.z), 'el rover debe partir al sol');
});

test('en la Luna una batería chica deja al rover atrapado en la sombra eterna', () => {
  const moon = { orbit: 'moon_surface', solar: 'deploy_s', comms: 'x_band', propulsion: 'hydrazine', mobility: 'rover_s', instruments: ['neutron_spectrometer', 'ground_radar', 'mastcam'] };
  const big = autopilot('moon_water', { ...moon, battery: 'b2000' });
  const small = autopilot('moon_water', { ...moon, battery: 'b500' });
  assert.equal(big.summary.stars, 3);
  assert.ok(small.sim.trappedInShadow);
  assert.ok(small.summary.stars < big.summary.stars);
});

test('en nivel Ingeniero las rocas dañan las ruedas y la arena frena', () => {
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const parts = resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] });
  // sobre una roca grande
  const rock = terrain.rocks.find((r) => r.s > 1);
  const a = createSim(site, parts, 'engineer');
  Object.assign(a, { x: rock.x, z: rock.z });
  for (let i = 0; i < 10; i++) { step(a, { fwd: 0.01, turn: 0 }, 0.05, terrain); a.x = rock.x; a.z = rock.z; }
  assert.ok(a.wheelHealth < 100);
  // en arena avanza menos que en suelo firme
  assert.ok(terrain.sand.length > 0);
  const p = terrain.sand[0];
  const go = (x, z, diff) => { const s2 = createSim(site, parts, diff); Object.assign(s2, { x, z }); step(s2, { fwd: 1, turn: 0 }, 0.1, terrain); return s2.distance; };
  assert.ok(go(p.x, p.z, 'engineer') < go(p.x, p.z, 'explorer') * 0.5);
});

test('en nivel Comandante las órdenes llegan con retraso', () => {
  const site = index.sites.moon_south_pole, terrain = createTerrain(site);
  const parts = resolveDesign({ ...defaultDesign(), orbit: 'moon_surface', mobility: 'rover_s', instruments: ['mastcam'], battery: 'b2000' });
  const sim = createSim(site, parts, 'commander');
  assert.equal(sim.signalDelay, 1.3);
  const x0 = sim.x, z0 = sim.z;
  for (let t = 0; t < 1.0; t += 0.05) step(sim, { fwd: 1, turn: 0 }, 0.05, terrain);
  assert.equal(Math.hypot(sim.x - x0, sim.z - z0), 0, 'todavía no llegó la orden');
  for (let t = 0; t < 1.0; t += 0.05) step(sim, { fwd: 1, turn: 0 }, 0.05, terrain);
  assert.ok(Math.hypot(sim.x - x0, sim.z - z0) > 0, 'la orden ya llegó');
});

test('el nivel Comandante es más difícil que Explorador', () => {
  const design = { ...mars, instruments: ['drill', 'rock_spectrometer', 'mastcam', 'ground_radar'] };
  const easy = autopilot('mars_life', design, 'explorer');
  const hard = autopilot('mars_life', design, 'commander');
  assert.ok(hard.sim.science <= easy.sim.science);
  assert.ok(hard.sim.science > 0, 'Comandante debe ser difícil pero posible');
});

test('al caer la noche aparece una falla y la misión se pausa', () => {
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'engineer');
  while (!sim.fault && sim.t < site.sol_seconds) step(sim, NO_MOVE, 0.05, terrain);
  assert.ok(sim.fault, 'debe aparecer una falla');
  assert.ok(sim.t >= site.sol_seconds * site.day_fraction - 0.1, 'aparece al anochecer');
  const t = sim.t;
  for (let i = 0; i < 20; i++) step(sim, { fwd: 1, turn: 0 }, 0.05, terrain);
  assert.equal(sim.t, t, 'el tiempo de la misión no avanza durante la falla');
});

for (const id of Object.keys(FAULTS)) {
  test(`la falla "${id}" se repara con los pasos correctos`, () => {
    const site = index.sites.mars_jezero, terrain = createTerrain(site);
    const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'engineer');
    startFault(sim, id);
    assert.equal(currentStep(sim.fault), 0);
    solveFault(sim);
    for (let i = 0; i < 200 && sim.fault; i++) step(sim, NO_MOVE, 0.05, terrain); // reinicio y cierre
    assert.equal(sim.fault, null, 'la falla se cierra');
    assert.ok(sim.faultLog[0].solved);
  });
}

test('las acciones equivocadas no reparan la falla', () => {
  const site = index.sites.mars_jezero;
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'engineer');
  startFault(sim, 'power');
  panelAction(sim, { type: 'breaker' }); // reiniciar sin aislar el corto
  assert.ok(!sim.fault.solved);
  startFault(sim, 'computer');
  panelAction(sim, { type: 'reboot' }); // reiniciar la computadora dañada
  assert.equal(sim.fault.rebooting, 0);
  startFault(sim, 'antenna');
  panelAction(sim, { type: 'lock' }); // fijar sin alinear
  assert.ok(!sim.fault.solved && signalStrength(sim.fault.panel) < 90);
  startFault(sim, 'wheel');
  sim.fault.panel.freeWheels = [true, true, true, true, true, true];
  panelAction(sim, { type: 'test' }); // liberar todas las ruedas
  assert.ok(!sim.fault.solved);
});

test('si se acaba el tiempo hay una consecuencia', () => {
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'commander');
  const cap = sim.cap;
  startFault(sim, 'heater');
  for (let i = 0; i < 2000 && sim.fault; i++) step(sim, NO_MOVE, 0.05, terrain);
  assert.ok(sim.cap < cap, 'el frío reduce la capacidad de la batería');
  assert.equal(sim.faultLog[0].solved, false);
});

test('las rocas grandes bloquean al rover', () => {
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'explorer');
  const rock = terrain.rocks.find((r) => r.s > 1);
  // ubicar el rover justo frente a la roca, mirando hacia ella
  Object.assign(sim, { x: rock.x, z: rock.z - (rock.s + sim.roverRadius + 1.5), heading: 0 });
  for (let i = 0; i < 40; i++) step(sim, { fwd: 1, turn: 0 }, 0.05, terrain);
  assert.ok(Math.hypot(rock.x - sim.x, rock.z - sim.z) >= rock.s * 0.85 + sim.roverRadius - 0.3, 'no atraviesa la roca');
  assert.ok(sim.bumps > 0);
});

test('la falla se puede disparar al instante (botón Probar falla)', async () => {
  const { triggerFaultNow } = await import('./sim.js');
  const site = index.sites.moon_south_pole, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), orbit: 'moon_surface', mobility: 'rover_s', instruments: ['mastcam'] }), 'explorer');
  sim.started = true;
  step(sim, NO_MOVE, 0.05, terrain);
  assert.ok(sim.nightIn > 90, 'el contador de anochecer funciona');
  triggerFaultNow(sim);
  assert.ok(sim.fault);
});

test('la antena funciona mejor en un lugar alto y plano', async () => {
  const { siteQuality } = await import('./antenna.js');
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'explorer');
  const top = site.pois.find((p) => p.id === 'clay');      // cima del delta
  const low = site.pois.find((p) => p.id === 'channel');   // fondo del cráter
  assert.ok(siteQuality(sim, terrain, top.x, top.z).q > siteQuality(sim, terrain, low.x, low.z).q);
});

/** Planta la antena: llevar al objetivo, bajar, anclar, apuntar y activar. */
async function plantAntenna(sim, terrain, { fast = false } = {}) {
  const { startDeploy, deployAction } = await import('./antenna.js');
  sim.started = true;
  assert.ok(startDeploy(sim));
  const d = sim.deploy;
  Object.assign(d, { u: d.target.u, v: d.target.v, fine: !fast });
  for (let i = 0; i < 400 && d.phase === 'lower'; i++) step(sim, { fwd: 0, turn: 0, y: -1 }, 0.05, terrain);
  deployAction(sim, { type: 'anchor' });
  for (let i = 0; i < 60 && d.phase === 'mast'; i++) step(sim, NO_MOVE, 0.05, terrain);
  deployAction(sim, { type: 'aim', angle: d.aimTarget });
  deployAction(sim, { type: 'activate' });
  return d;
}

test('plantar la antena despacio la deja activa; bajarla rápido la daña', async () => {
  const site = index.sites.moon_south_pole, terrain = createTerrain(site);
  const parts = resolveDesign({ ...defaultDesign(), orbit: 'moon_surface', mobility: 'rover_s', instruments: ['mastcam'] });
  const slow = createSim(site, parts, 'engineer');
  const d1 = await plantAntenna(slow, terrain);
  assert.ok(slow.antenna.deployed && !d1.damaged, 'bajada suave');
  const fast = createSim(site, parts, 'engineer');
  const d2 = await plantAntenna(fast, terrain, { fast: true });
  assert.ok(d2.damaged, 'bajada rápida = golpe');
  assert.ok(fast.antenna.deployed.q < slow.antenna.deployed.q);
});

test('cerca de la antena se envían datos aunque no pase el orbitador', async () => {
  const site = index.sites.mars_jezero, terrain = createTerrain(site);
  const sim = createSim(site, resolveDesign({ ...defaultDesign(), ...mars, instruments: ['mastcam'] }), 'explorer');
  await plantAntenna(sim, terrain);
  sim.queue.push({ id: 'landing', remaining: 50 });
  sim.pois.landing = 'collected';
  // avanzar hasta un momento sin orbitador
  for (let i = 0; i < 2000 && (sim.relayActive || sim.t < 1); i++) step(sim, NO_MOVE, 0.05, terrain);
  assert.ok(!sim.relayActive && sim.antennaLink);
  const before = sim.queue[0]?.remaining ?? 0;
  step(sim, NO_MOVE, 0.05, terrain);
  assert.ok((sim.queue[0]?.remaining ?? 0) < before || sim.pois.landing === 'sent');
});
