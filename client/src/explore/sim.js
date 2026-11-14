// Simulación del modo exploración (sin gráficos). El rover usa EXACTAMENTE
// las piezas que el jugador eligió: batería, paneles/RTG, radio,
// instrumentos y tipo de rover. Así cada decisión de diseño se siente al jugar.
// Los niveles de dificultad agregan problemas que enfrentaron rovers reales.
import { index } from '../../../shared/catalog.js';
import { createRng } from '../../../shared/rng.js';
import { t, translatable } from '../../../shared/i18n.js';
import { chooseFault, startFault, faultTick, FAULT_COUNT } from './faults.js';
import { deployTick } from './antenna.js';

export const ANALYSIS_SECONDS = 4;
export const NEAR_DISTANCE = 7;
const SOLAR_DEGRADATION = 0.85;
const NO_INPUT = { fwd: 0, turn: 0 };
const ROVER_RADIUS = { rover_s: 0.8, rover_m: 1.1, rover_l: 1.5 };

export const DIFFICULTIES = translatable({
  explorer: {
    id: 'explorer', name: 'Explorador', icon: '🧒',
    desc: 'Para aprender jugando. Sin daños, sin retrasos: solo energía, instrumentos y comunicaciones.',
    delay: false, wheelDamage: 0, sand: false, dust: 0, warnTipDeg: null, tipDeg: null, startBattery: 0.8, solsDelta: 0, speedFactor: 1,
  },
  engineer: {
    id: 'engineer', name: 'Ingeniero', icon: '👩‍🔧',
    desc: 'Las rocas filosas dañan las ruedas, hay arena blanda donde el rover patina y el polvo va cubriendo los paneles.',
    delay: false, wheelDamage: 1, sand: true, dust: 1, warnTipDeg: 25, tipDeg: null, startBattery: 0.6, solsDelta: 0, speedFactor: 1,
  },
  commander: {
    id: 'commander', name: 'Comandante', icon: '🧑‍🚀',
    desc: 'Como en el control de misión real: tus órdenes tardan en llegar al rover (retraso de señal) y puede volcarse en pendientes fuertes. ¡Planea antes de mover!',
    delay: true, wheelDamage: 1.5, sand: true, dust: 1.5, warnTipDeg: 20, tipDeg: 28, startBattery: 0.5, solsDelta: -1,
    speedFactor: 0.6, // con retraso de señal, los rovers reales avanzan despacio y con cuidado
  },
});

export function createSim(site, parts, difficultyId = 'explorer') {
  const difficulty = DIFFICULTIES[difficultyId] ?? DIFFICULTIES.explorer;
  const have = new Set(parts.instruments.map((i) => i.id));
  const pois = Object.fromEntries(site.pois.map((p) => [p.id, p.needs.some((n) => have.has(n)) ? 'pending' : 'locked']));
  const cap = parts.battery.capacity_wh;
  const sols = Math.max(1, site.sols + difficulty.solsDelta);
  return {
    site, parts, have, difficulty,
    t: 0, x: site.start?.x ?? 0, z: site.start?.z ?? 0, heading: site.start?.heading ?? 0,
    battery: cap * difficulty.startBattery, cap, flow: 0,
    pois, queue: [], analyzing: null, near: null,
    hibernating: false, hibernations: 0, lowWarned: false,
    science: 0, maxScience: site.pois.reduce((s, p) => s + p.science, 0),
    sentMb: 0, distance: 0, moving: false, speedNow: 0,
    isDay: true, sunEl: 0.5, phase: 0, sol: 1, dust: 1, inShadow: false,
    relayActive: false, transmitting: false, relayIn: 0,
    // dificultad
    signalDelay: difficulty.delay ? site.signal_delay_s ?? 0 : 0,
    inputLog: [{ t: -1, input: NO_INPUT }], commands: [], applied: NO_INPUT,
    wheelHealth: 100, panelDust: 0, inSand: false, slopeDeg: 0, tipped: false, sandTime: 0,
    rng: createRng(site.seed ?? 1),
    // fallas nocturnas y choques
    fault: null, faultLog: [], faultsLeft: FAULT_COUNT[difficulty.id] ?? 1, wasDay: true, commsDownUntil: -1,
    bumps: 0, roverRadius: ROVER_RADIUS[parts.mobility.id] ?? 1.1,
    // antena repetidora plantada con el brazo robótico
    antenna: { deployed: null }, deploy: null, antennaLink: false,
    messages: [], cooldowns: {}, ended: false,
    hoursPerSec: site.hours_per_sol / site.sol_seconds,
    speed: (parts.mobility.speed || 0) * 5 * difficulty.speedFactor,
    totalTime: sols * site.sol_seconds, sols,
  };
}

// Mensajes con datos curiosos de misiones reales: son los únicos (junto con
// alarmas y problemas graves) que Orbi lee en voz alta.
const FACT_KEYS = new Set(['sand', 'rock', 'devil', 'tipped', 'hib', 'storm', 'antenna-done', 'antenna-broke']);

function say(sim, key, text, kind = 'info', cooldown = 6) {
  if (sim.cooldowns[key] > sim.t) return;
  sim.cooldowns[key] = sim.t + cooldown;
  sim.messages.push({ text: t(text), kind, t: sim.t, fact: FACT_KEYS.has(key) });
}

const instrumentNames = (ids) => ids.map((id) => index.instruments[id]?.name ?? id).join(t(' o '));

/** Dispara una falla al instante (para practicar o para mostrar el juego en una demo). */
export function triggerFaultNow(sim) {
  if (sim.ended || sim.fault || !sim.started) return;
  startFault(sim, chooseFault(sim));
  sim.analyzing = null;
  sim.messages.push({ text: t('🚨 {alarm} ¡Ve a la cabina y repáralo desde el tablero!', { alarm: sim.fault.alarm }), kind: 'alarm', t: sim.t });
}

/** Pide analizar el lugar cercano (con retraso de señal en modo Comandante). */
export function startAnalysis(sim) {
  if (sim.ended) return;
  if (sim.signalDelay > 0) {
    if (sim.commands.some((c) => c.cmd === 'analyze')) return;
    sim.commands.push({ t: sim.t + sim.signalDelay, cmd: 'analyze' });
    return say(sim, 'cmd-sent', t('📡 Orden enviada. Llegará al rover en {s} s…', { s: sim.signalDelay.toFixed(1) }), 'info', 1);
  }
  doAnalysis(sim);
}

function doAnalysis(sim) {
  if (sim.ended || sim.analyzing || sim.hibernating) return;
  if (!sim.near) return say(sim, 'nothing', 'No hay ningún lugar interesante cerca. ¡Acércate a un marcador!', 'info', 3);
  const poi = sim.site.pois.find((p) => p.id === sim.near);
  const state = sim.pois[poi.id];
  if (state === 'locked')
    return say(sim, `lock-${poi.id}`, t('No tienes el instrumento para estudiar "{place}". Necesitas: {needs}. ¡Agrégalo en tu próximo diseño!', { place: poi.name, needs: instrumentNames(poi.needs) }), 'warn', 3);
  if (state !== 'pending') return say(sim, `done-${poi.id}`, 'Ya analizaste este lugar. ¡Busca otro!', 'info', 3);
  const used = poi.needs.filter((n) => sim.have.has(n));
  const power = used.reduce((s, id) => s + index.instruments[id].power_w, 0);
  sim.analyzing = { id: poi.id, progress: 0, power };
  say(sim, `an-${poi.id}`, t('Analizando "{place}" con {instr}… {text}', { place: poi.name, instr: instrumentNames(used), text: poi.text }), 'info', 1);
}

/** Pendiente real (sin la exageración vertical del dibujo) bajo el rover, en grados. */
function realSlope(sim, terrain) {
  const e = 1.5, { x, z } = sim;
  const g = Math.hypot(terrain.heightAt(x + e, z) - terrain.heightAt(x - e, z), terrain.heightAt(x, z + e) - terrain.heightAt(x, z - e)) / (2 * e);
  return (Math.atan(g / (sim.site.vertical_exaggeration ?? 1)) * 180) / Math.PI;
}

export function step(sim, rawInput, dt, terrain) {
  if (sim.ended) return;
  // Durante una falla la misión queda en pausa: solo corre el reloj de la reparación.
  if (sim.fault) { faultTick(sim, dt); return; }
  sim.terrainRef = terrain;
  // Mientras se planta la antena con el brazo, el rover está quieto y la misión en pausa.
  if (sim.deploy) { deployTick(sim, rawInput, dt); return; }
  const { site, parts, difficulty } = sim;
  sim.t += dt;

  // --- Retraso de señal: el rover ejecuta las órdenes enviadas hace `signalDelay` segundos ---
  let input = rawInput;
  if (sim.signalDelay > 0) {
    const last = sim.inputLog[sim.inputLog.length - 1].input;
    if (rawInput.fwd !== last.fwd || rawInput.turn !== last.turn) sim.inputLog.push({ t: sim.t, input: { ...rawInput } });
    while (sim.inputLog.length > 1 && sim.inputLog[1].t <= sim.t - sim.signalDelay) sim.inputLog.shift();
    input = sim.inputLog[0].input;
    while (sim.commands.length && sim.commands[0].t <= sim.t) { sim.commands.shift(); doAnalysis(sim); }
  }
  sim.applied = input;

  // --- Día y noche ---
  sim.phase = (sim.t % site.sol_seconds) / site.sol_seconds;
  sim.sol = Math.floor(sim.t / site.sol_seconds) + 1;
  sim.isDay = sim.phase < site.day_fraction;
  sim.sunEl = sim.isDay ? Math.sin(Math.PI * (sim.phase / site.day_fraction)) * site.sun_max_elevation : -0.3;
  if (sim.isDay && sim.phase > site.day_fraction - 0.07)
    say(sim, `dusk-${sim.sol}`, '🌙 Se acerca la noche: los paneles dejarán de cargar y hace mucho frío. ¿Tienes batería suficiente?', 'warn', 999);
  if (!sim.isDay && sim.phase > 0.97) say(sim, `dawn-${sim.sol}`, '🌅 ¡Amanece! Los paneles vuelven a cargar la batería.', 'ok', 999);

  // --- Falla repentina al caer la noche ---
  if (sim.wasDay && !sim.isDay && sim.faultsLeft > 0) {
    sim.faultsLeft--;
    sim.wasDay = false;
    startFault(sim, chooseFault(sim));
    sim.analyzing = null;
    sim.messages.push({ text: t('🚨 {alarm} ¡Ve a la cabina y repáralo desde el tablero!', { alarm: sim.fault.alarm }), kind: 'alarm', t: sim.t });
    return;
  }
  sim.wasDay = sim.isDay;
  sim.nightIn = sim.isDay ? (site.day_fraction - sim.phase) * site.sol_seconds : 0;

  // --- Tormenta de polvo (Marte) ---
  const storm = site.dust_storm;
  const inStorm = storm && sim.t >= storm.start && sim.t < storm.start + storm.duration;
  sim.dust = inStorm ? storm.factor : 1;
  if (inStorm) say(sim, 'storm', parts.solar.constant
    ? '🌪️ ¡Tormenta de polvo! Por suerte tu RTG no necesita luz solar.'
    : '🌪️ ¡Tormenta de polvo! El cielo se oscurece y los paneles casi no cargan. Ahorra energía.', 'warn', 999);

  // --- Polvo acumulado en los paneles y remolinos que los limpian (Spirit y Opportunity) ---
  if (difficulty.dust && !parts.solar.constant) {
    sim.panelDust = Math.min(0.7, sim.panelDust + (site.panel_dust_rate ?? 0) * difficulty.dust * dt * (inStorm ? 4 : 1));
    if (sim.panelDust > 0.25) say(sim, 'dusty', t('🟫 Los paneles tienen {pct}% de polvo y generan menos energía.', { pct: Math.round(sim.panelDust * 100) }), 'warn', 60);
    if (site.dust_devils && sim.isDay && sim.panelDust > 0.15 && sim.rng() < dt * 0.012) {
      sim.panelDust *= 0.25;
      say(sim, 'devil', '🌀 ¡Un remolino de polvo limpió tus paneles! A los rovers Spirit y Opportunity les pasó de verdad y les alargó la vida.', 'win', 5);
    }
  }

  // --- Movimiento ---
  sim.inShadow = terrain.inShadow(sim.x, sim.z);
  sim.inSand = difficulty.sand && !!terrain.sandAt?.(sim.x, sim.z);
  let drivePower = 0;
  sim.moving = false;
  sim.speedNow = 0;
  const canAct = !sim.hibernating && !sim.analyzing && !sim.tipped;
  if (canAct && (input.fwd || input.turn)) {
    drivePower = parts.mobility.power_w * (input.fwd ? 1 : 0.4) * (sim.inSand ? 1.8 : 1);
    sim.heading += input.turn * 1.6 * dt;
    if (input.fwd) {
      const wheelFactor = 0.35 + 0.65 * (sim.wheelHealth / 100);
      const speed = sim.speed * wheelFactor * (sim.inSand ? 0.35 : 1);
      const d = input.fwd * speed * dt;
      const nx = sim.x + Math.sin(sim.heading) * d;
      const nz = sim.z + Math.cos(sim.heading) * d;
      const climb = (terrain.heightAt(nx, nz) - terrain.heightAt(sim.x, sim.z)) / Math.abs(d);
      // Choque: las rocas grandes bloquean el paso si el rover se acerca a ellas.
      const hit = terrain.rocks.find((r) => r.s > 0.55
        && Math.hypot(r.x - nx, r.z - nz) < r.s * 0.85 + sim.roverRadius
        && Math.hypot(r.x - nx, r.z - nz) < Math.hypot(r.x - sim.x, r.z - sim.z));
      if (hit) {
        if (!sim.cooldowns.bump || sim.cooldowns.bump <= sim.t) {
          sim.bumps++;
          if (difficulty.wheelDamage) sim.wheelHealth = Math.max(0, sim.wheelHealth - 3 * difficulty.wheelDamage);
        }
        say(sim, 'bump', difficulty.wheelDamage
          ? '💥 ¡Choque contra una roca! Las ruedas se dañan. Retrocede (S) o gira para esquivarla.'
          : '💥 ¡Choque contra una roca! Retrocede (S) o gira para esquivarla.', 'bump', 1.5);
      } else if (climb > 0.9) say(sim, 'steep', '⛰️ ¡Demasiado empinado! Busca otro camino.', 'warn', 4);
      else if (Math.abs(nx) < terrain.half - 4 && Math.abs(nz) < terrain.half - 4) {
        sim.x = nx; sim.z = nz; sim.distance += Math.abs(d);
        sim.moving = true; sim.speedNow = speed * input.fwd;
      } else say(sim, 'edge', 'Este es el límite de la zona de exploración.', 'info', 5);
    }
  }

  // --- Peligros del terreno ---
  sim.slopeDeg = realSlope(sim, terrain);
  if (sim.moving) {
    if (sim.inSand) {
      sim.sandTime += dt;
      say(sim, 'sand', '🏖️ ¡Arena blanda! El rover patina, avanza lento y gasta casi el doble de energía. En 2009 el rover Spirit quedó atrapado así para siempre.', 'warn', 12);
    }
    if (difficulty.wheelDamage) {
      const onRock = terrain.rocks.some((r) => r.s > 0.7 && Math.hypot(r.x - sim.x, r.z - sim.z) < r.s * 0.9);
      const before = sim.wheelHealth;
      if (onRock) sim.wheelHealth -= dt * 9 * difficulty.wheelDamage;
      if (sim.slopeDeg > 18) sim.wheelHealth -= dt * 1.2 * difficulty.wheelDamage;
      sim.wheelHealth = Math.max(0, sim.wheelHealth);
      if (onRock) say(sim, 'rock', '🪨 ¡Ay! Rocas filosas: las ruedas se dañan y el rover irá más lento. Curiosity tiene agujeros en sus ruedas por esto. ¡Esquívalas!', 'warn', 8);
      if (before > 50 && sim.wheelHealth <= 50) say(sim, 'wheels50', '⚙️ Las ruedas están al 50%: el rover ya va bastante más lento.', 'bad', 30);
    }
  }
  if (difficulty.warnTipDeg && sim.slopeDeg > difficulty.warnTipDeg && !sim.tipped)
    say(sim, 'tipwarn', difficulty.tipDeg ? t('⚠️ ¡Pendiente peligrosa de {deg}°! Sobre {tip}° el rover puede volcar.', { deg: Math.round(sim.slopeDeg), tip: difficulty.tipDeg }) : t('⚠️ ¡Pendiente peligrosa de {deg}°! Ve con cuidado.', { deg: Math.round(sim.slopeDeg) }), 'warn', 6);
  if (difficulty.tipDeg && sim.slopeDeg > difficulty.tipDeg && sim.moving) {
    sim.tipped = true;
    say(sim, 'tipped', t('💥 ¡El rover volcó en una pendiente de {deg}°! Los ingenieros reales planean cada ruta para evitar esto.', { deg: Math.round(sim.slopeDeg) }), 'bad', 999);
  }

  // --- Lugar cercano ---
  let near = null, best = NEAR_DISTANCE;
  for (const p of site.pois) {
    const dist = Math.hypot(p.x - sim.x, p.z - sim.z);
    if (dist < best) { best = dist; near = p.id; }
  }
  if (near && near !== sim.near && sim.pois[near] === 'pending')
    say(sim, `near-${near}`, t('📍 Llegaste a "{place}". Pulsa ANALIZAR (tecla E).', { place: site.pois.find((p) => p.id === near).name }), 'ok', 20);
  sim.near = near;

  // --- Análisis ---
  let analysisPower = 0;
  if (sim.analyzing) {
    analysisPower = sim.analyzing.power;
    sim.analyzing.progress += dt / ANALYSIS_SECONDS;
    if (sim.analyzing.progress >= 1) {
      const poi = site.pois.find((p) => p.id === sim.analyzing.id);
      sim.pois[poi.id] = 'collected';
      sim.queue.push({ id: poi.id, remaining: poi.data_mb });
      sim.analyzing = null;
      say(sim, `col-${poi.id}`, t('✅ ¡Análisis completo! {mb} MB de datos guardados. Ahora hay que enviarlos a la Tierra cuando pase el {relay}.', { mb: poi.data_mb, relay: t(site.relay.name) }), 'ok', 1);
    }
  }

  // --- Comunicaciones ---
  const { period, duration } = site.relay;
  const cycle = (sim.t + period * 0.5) % period;
  const wasActive = sim.relayActive;
  sim.relayActive = cycle < duration;
  sim.relayIn = sim.relayActive ? 0 : period - cycle;
  sim.commsDown = sim.t < sim.commsDownUntil;
  const ant = sim.antenna.deployed;
  sim.antennaLink = !!ant && Math.hypot(ant.x - sim.x, ant.z - sim.z) < ant.range;
  sim.transmitting = (sim.relayActive || sim.antennaLink) && sim.queue.length > 0 && !sim.hibernating && !sim.commsDown;
  if (sim.relayActive && !wasActive && sim.queue.length)
    say(sim, 'relay', t('🛰️ ¡El {relay} está disponible! Enviando datos…', { relay: t(site.relay.name) }), 'info', 5);
  if (sim.transmitting) {
    // Por la antena repetidora (sin orbitador) la tasa depende de la calidad del lugar.
    const viaAntenna = !sim.relayActive && sim.antennaLink ? 0.4 + 0.6 * ant.q : 1;
    const rateMbPerSec = (parts.comms.data_rate_mbps * site.link_factor * sim.hoursPerSec * 3600 * viaAntenna) / 8;
    let budget = rateMbPerSec * dt;
    while (budget > 0 && sim.queue.length) {
      const item = sim.queue[0];
      const sent = Math.min(budget, item.remaining);
      item.remaining -= sent; budget -= sent; sim.sentMb += sent;
      if (item.remaining <= 0.001) {
        sim.queue.shift();
        const poi = site.pois.find((p) => p.id === item.id);
        sim.pois[poi.id] = 'sent';
        sim.science += poi.science;
        say(sim, `sent-${poi.id}`, t('🌍 ¡La Tierra recibió los datos de "{place}"! +{pts} puntos de ciencia.', { place: poi.name, pts: poi.science }), 'win', 1);
      }
    }
  }

  // --- Energía ---
  const light = !sim.isDay || sim.inShadow ? 0 : (site.low_sun ? 1 : Math.max(0, Math.sin(sim.sunEl))) * sim.dust;
  const generation = parts.solar.constant
    ? parts.solar.generation_w * SOLAR_DEGRADATION
    : parts.solar.generation_w * SOLAR_DEGRADATION * site.solar_factor * light * (1 - sim.panelDust);
  const heater = !sim.isDay || sim.inShadow ? site.night_heater_w : 0;
  const base = parts.computer.power_w + parts.comms.power_w * (sim.transmitting ? 1 : 0.1) + parts.adcs.power_w * 0.2;
  const load = base + heater + drivePower + analysisPower;
  sim.flow = generation - load;
  sim.generation = generation;
  sim.load = load;
  sim.battery = Math.min(sim.cap, Math.max(0, sim.battery + sim.flow * sim.hoursPerSec * dt));
  if (sim.inShadow && !sim.hibernating) say(sim, 'shadow', '🌑 Entraste a la sombra eterna: aquí no llega el Sol y hace un frío extremo. ¡Analiza rápido y sal!', 'warn', 15);

  if (sim.battery <= 0 && !sim.hibernating) {
    sim.hibernating = true; sim.hibernations++; sim.analyzing = null;
    if (sim.inShadow && !parts.solar.constant) {
      sim.trappedInShadow = true;
      say(sim, 'hib', '🥶 ¡El rover se quedó sin energía dentro de la sombra eterna! Aquí nunca llega el Sol, así que no podrá recargarse. Así se perdieron algunas misiones reales.', 'bad', 3);
    } else say(sim, 'hib', parts.solar.constant
      ? '😴 Batería agotada: el rover hiberna mientras el RTG la recarga.'
      : '😴 ¡Batería agotada! El rover hiberna hasta que el Sol recargue sus paneles.', 'bad', 3);
  }
  if (sim.hibernating && sim.battery >= sim.cap * 0.2) {
    sim.hibernating = false;
    say(sim, 'wake', '⚡ Batería recargada al 20%: ¡el rover despierta!', 'ok', 3);
  }
  if (sim.battery < sim.cap * 0.25 && !sim.lowWarned && !sim.hibernating) {
    sim.lowWarned = true;
    say(sim, 'low', '🔋 ¡Batería baja! Quédate quieto al sol para recargar.', 'warn', 10);
  }
  if (sim.battery > sim.cap * 0.4) sim.lowWarned = false;

  // Un rover volcado ya no se mueve, pero los datos guardados aún pueden enviarse.
  if (sim.t >= sim.totalTime || (sim.tipped && sim.queue.length === 0)) sim.ended = true;
}

const pendingData = (sim) => sim.queue.reduce((s, q) => s + q.remaining, 0);

/** Resumen final con estrellas y lecciones en lenguaje sencillo. */
export function summarize(sim) {
  const ratio = sim.maxScience ? sim.science / sim.maxScience : 0;
  const stars = ratio >= 0.85 ? 3 : ratio >= 0.5 ? 2 : ratio > 0 ? 1 : 0;
  const lessons = [];
  const L = (s, p) => lessons.push(t(s, p));
  const locked = sim.site.pois.filter((p) => sim.pois[p.id] === 'locked');
  if (locked.length)
    L('No pudiste estudiar {n} lugar(es) porque te faltaban instrumentos: {list}.', { n: locked.length, list: [...new Set(locked.flatMap((p) => p.needs))].map((id) => index.instruments[id]?.name).join(', ') });
  for (const f of sim.faultLog)
    f.solved
      ? L('🛠️ Reparaste la falla "{title}" en {s} s. {real}', { title: t(f.title), s: f.time, real: t(f.real) })
      : L('⏰ No alcanzaste a reparar "{title}": {what}', { title: t(f.title), what: t(f.consequence) });
  if (sim.antenna.deployed) {
    const a = sim.antenna.deployed;
    L(a.damaged ? '📡 Plantaste una antena repetidora de calidad {stars} ({why}) — se dañó al bajarla rápido. Los lugares altos y planos dan más alcance.' : '📡 Plantaste una antena repetidora de calidad {stars} ({why}). Los lugares altos y planos dan más alcance.', { stars: a.q > 0.72 ? '★★★' : a.q > 0.48 ? '★★☆' : '★☆☆', why: a.reasons.map((r) => t(r)).join(', ') });
  } else if (pendingData(sim) > 1) L('Te quedaron datos sin enviar: plantar una antena repetidora en un lugar alto (tecla G) te deja transmitir sin esperar al orbitador.');
  if (sim.bumps > 3) L('Chocaste {n} veces contra rocas. Los rovers reales usan cámaras de navegación para planear rutas sin obstáculos.', { n: sim.bumps });
  if (sim.tipped)
    L('El rover volcó. Los equipos de la NASA revisan los mapas de pendientes antes de cada movimiento: mira el aviso de pendiente y rodea las laderas.');
  if (sim.trappedInShadow)
    L('Tu rover quedó atrapado en la sombra eterna. Para entrar a esos cráteres necesitas una batería grande (o un RTG) y salir rápido.');
  else if (sim.hibernations)
    L(sim.parts.solar.constant
      ? 'Tu batería se agotó {n} vez/veces. Una batería más grande te daría más autonomía.'
      : 'Tu batería se agotó {n} vez/veces. Prueba una batería más grande, paneles más grandes o un RTG nuclear que funciona de noche.', { n: sim.hibernations });
  if (sim.wheelHealth < 60)
    L('Las ruedas terminaron al {pct}%. Esquivar las rocas grandes te habría hecho más rápido.', { pct: Math.round(sim.wheelHealth) });
  if (sim.sandTime > 6)
    L('Pasaste mucho tiempo en arena blanda (las manchas claras del suelo). Rodearla ahorra energía y tiempo.');
  if (sim.panelDust > 0.3)
    L('Tus paneles terminaron con {pct}% de polvo. En Marte un RTG no tiene este problema.', { pct: Math.round(sim.panelDust * 100) });
  const pending = sim.queue.reduce((s, q) => s + q.remaining, 0);
  if (pending > 1)
    L('Quedaron {mb} MB sin enviar a la Tierra. Con una radio más rápida (Banda X o Ka) cada paso del orbitador alcanza para más datos.', { mb: Math.round(pending) });
  if (sim.parts.mobility.speed < 1.5 && ratio < 0.85)
    L('Tu rover es lento. Un rover más grande avanza más rápido, aunque pesa y cuesta más.');
  if (!lessons.some((l) => !l.startsWith('🛠️'))) L('¡Exploración impecable en nivel {level}! Tu diseño tenía energía, instrumentos y comunicaciones bien equilibrados.', { level: sim.difficulty.name });
  return { ratio, stars, lessons, pendingMb: pending };
}
