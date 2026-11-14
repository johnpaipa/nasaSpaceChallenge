// Motor de reglas: calcula presupuestos de recursos, detecta problemas
// y simula la misión. Es código puro (sin UI) para poder probarlo y
// ejecutarlo tanto en el navegador como en el servidor.
import { index, COMPONENT_KEYS } from './catalog.js';
import { createRng } from './rng.js';
import { t } from './i18n.js';

export const MASS_MARGIN = 0.1; // margen de diseño estándar en ingeniería
export const SOLAR_DEGRADATION = 0.85; // paneles al final de la vida útil
export const BATTERY_DOD = 0.4; // profundidad de descarga usable
export const THERMAL_OVERHEAD = 0.1; // calefactores y pérdidas
export const INTEGRATION_COST = 0.15; // ensamblaje y pruebas (% del hardware)

const sum = (arr, f) => arr.reduce((acc, x) => acc + (f(x) || 0), 0);

export function resolveDesign(design) {
  const parts = Object.fromEntries(COMPONENT_KEYS.map((k) => [k, index.components[k][design[k]]]));
  return {
    ...parts,
    orbit: index.orbits[design.orbit],
    launcher: index.launchers[design.launcher],
    instruments: design.instruments.map((id) => index.instruments[id]).filter(Boolean),
  };
}

function instrumentRelevance(instr, mission) {
  const weights = instr.tags.map((t) => mission.objective_tags[t] || 0);
  return Math.max(0, ...weights) / 3;
}

/** Calcula todos los presupuestos de la nave y la lista de problemas. */
export function analyze(design, missionId) {
  const mission = index.missions[missionId];
  const d = resolveDesign(design);
  const bus = COMPONENT_KEYS.map((k) => d[k]);
  const issues = [];
  const add = (severity, area, message, why) => issues.push({ severity, area: t(area), message, why: t(why) });

  // --- Masa ---
  const payloadMass = sum(d.instruments, (i) => i.mass_kg);
  const internalMass = sum(bus.filter((c) => c !== d.structure), (c) => c.mass_kg) + payloadMass;
  const dryMass = d.structure.mass_kg + internalMass;
  // Para aterrizar hay que sumar escudo térmico, paracaídas y combustible de frenado.
  const landingFactor = d.orbit.landing_mass_factor || 1;
  const totalMass = dryMass * (1 + MASS_MARGIN) * landingFactor;
  const launchCapacity = d.launcher.capacity_kg[d.orbit.launch_class] || 0;

  if (internalMass > d.structure.capacity_kg)
    add('error', 'Masa', t('La estructura soporta {cap} kg de equipos y llevas {mass} kg.', { cap: d.structure.capacity_kg, mass: internalMass.toFixed(0) }),
      'Cada estructura está diseñada para una carga máxima. Usa un bus más grande o quita equipos pesados.');
  if (d.instruments.length > d.structure.max_instruments)
    add('error', 'Masa', t('Solo caben {n} instrumentos en esta estructura.', { n: d.structure.max_instruments }),
      'El espacio físico y los puntos de montaje son limitados.');
  if (launchCapacity === 0)
    add('error', 'Lanzamiento', t('{launcher} no puede llegar a la órbita {orbit}.', { launcher: d.launcher.name, orbit: d.orbit.name }),
      'Llegar más lejos requiere más energía: los cohetes pequeños no alcanzan órbitas altas o de escape.');
  else if (totalMass > launchCapacity)
    add('error', 'Lanzamiento', t(landingFactor > 1 ? 'La nave pesa {mass} kg (con 10% de margen y sistema de aterrizaje) y el cohete solo lleva {cap} kg a ese destino.' : 'La nave pesa {mass} kg (con 10% de margen) y el cohete solo lleva {cap} kg a ese destino.', { mass: totalMass.toFixed(0), cap: launchCapacity }),
      'La capacidad de un cohete baja mucho mientras más alta es la órbita destino.');
  if (d.orbit.surface && d.mobility.id === 'none')
    add('warning', 'Movilidad', t('Sin rover tu aterrizador solo puede estudiar el lugar donde cae (y no podrás explorar).'),
      'Los lugares más interesantes casi nunca están justo donde es seguro aterrizar. Un rover puede viajar hasta ellos.');
  if (!d.orbit.surface && d.mobility.id !== 'none')
    add('error', 'Movilidad', t('Un rover solo sirve si la misión aterriza en la Luna o en Marte.'),
      'En órbita no hay suelo por donde rodar: ese rover sería masa y dinero desperdiciados.');
  if (d.instruments.length === 0)
    add('error', 'Ciencia', t('La misión no lleva instrumentos científicos.'), 'Sin instrumentos no hay ciencia que reportar.');

  // --- Potencia ---
  const commsDuty = Math.min(1, (d.orbit.contacts_per_day * d.orbit.contact_minutes) / 1440);
  const instrPower = sum(d.instruments, (i) => i.power_w * i.duty_cycle);
  const busPower = d.computer.power_w + d.adcs.power_w + d.comms.power_w * commsDuty
    + d.propulsion.power_w * (d.propulsion.id === 'ion' ? 0.3 : 1);
  const powerConsumption = (instrPower + busPower) * (1 + THERMAL_OVERHEAD);
  // Un RTG genera lo mismo de día y de noche; los paneles dependen de la luz disponible.
  const powerGeneration = d.solar.constant
    ? d.solar.generation_w * SOLAR_DEGRADATION
    : d.solar.generation_w * (1 - d.orbit.eclipse_fraction) * SOLAR_DEGRADATION * (d.orbit.solar_factor ?? 1);
  const peakInstrument = Math.max(0, ...d.instruments.map((i) => i.power_w));

  if (powerGeneration < powerConsumption)
    add('error', 'Energía', t('Consumo promedio {use} W > generación {gen} W.', { use: powerConsumption.toFixed(0), gen: powerGeneration.toFixed(0) }),
      'Si se gasta más energía de la que producen los paneles, la batería se agota y la nave entra en modo seguro.');
  else if (powerGeneration < powerConsumption * 1.2)
    add('warning', 'Energía', t('Margen de energía menor al 20%.'), 'Los ingenieros dejan margen porque los paneles se degradan y los equipos envejecen.');
  if (peakInstrument > d.solar.generation_w * SOLAR_DEGRADATION + d.battery.capacity_wh * BATTERY_DOD)
    add('warning', 'Energía', t('Un instrumento consume más potencia pico de la que el sistema puede entregar.'),
      'Aunque el promedio alcance, al encender un instrumento potente se necesita una gran reserva instantánea.');

  // --- Batería (eclipses) ---
  // En superficie los instrumentos se apagan de noche, pero hay que calentar la nave.
  const nightLoad = d.orbit.surface ? busPower * (1 + THERMAL_OVERHEAD * 3) : powerConsumption;
  const eclipseEnergy = Math.max(0, nightLoad - (d.solar.constant ? powerGeneration : 0)) * (d.orbit.eclipse_minutes_max / 60);
  const batteryUsable = d.battery.capacity_wh * BATTERY_DOD;
  if (eclipseEnergy > batteryUsable)
    add('error', 'Energía', t('Durante el eclipse necesitas {need} Wh y la batería entrega {have} Wh usables.', { need: eclipseEnergy.toFixed(0), have: batteryUsable.toFixed(0) }),
      'En la sombra de la Tierra los paneles no producen nada: toda la nave vive de la batería.');

  // --- Datos y comunicaciones ---
  const dataGeneratedGB = sum(d.instruments, (i) => i.data_rate_mbps * i.duty_cycle) * 86400 / 8 / 1000;
  const downlinkGB = (d.comms.data_rate_mbps * d.orbit.link_factor * d.orbit.contacts_per_day * d.orbit.contact_minutes * 60) / 8 / 1000;
  const dataDelivered = dataGeneratedGB > 0 ? Math.min(1, downlinkGB / dataGeneratedGB) : 1;
  const storageNeeded = Math.max(0, dataGeneratedGB - downlinkGB) + dataGeneratedGB / Math.max(1, d.orbit.contacts_per_day);

  if (dataDelivered < 0.5)
    add('error', 'Datos', t('Solo puedes bajar el {pct}% de los datos generados ({gen} GB/día vs {down} GB/día).', { pct: (dataDelivered * 100).toFixed(0), gen: dataGeneratedGB.toFixed(1), down: downlinkGB.toFixed(1) }),
      'Los datos que no llegan a Tierra no sirven. Usa una radio más rápida o instrumentos que generen menos datos.');
  else if (dataDelivered < 1)
    add('warning', 'Datos', t('Se pierde el {pct}% de los datos por falta de enlace.', { pct: ((1 - dataDelivered) * 100).toFixed(0) }),
      'La capacidad de bajada depende de la radio, la distancia y cuántas veces al día pasas sobre una estación.');
  if (storageNeeded > d.computer.storage_gb)
    add('warning', 'Datos', t('La memoria ({gb} GB) se llena entre contactos.', { gb: d.computer.storage_gb }),
      'Entre pasadas por estaciones terrestres los datos se guardan a bordo.');

  // --- Apuntado ---
  for (const i of d.instruments) {
    if (i.pointing_deg < d.adcs.pointing_deg)
      add('warning', 'Orientación', t('{name} necesita apuntar con ±{need}° y el ADCS solo logra ±{have}°.', { name: i.name, need: i.pointing_deg, have: d.adcs.pointing_deg }),
        'Si la nave no apunta con precisión, las imágenes salen movidas o apuntan al lugar equivocado.');
  }

  // --- Órbita, propulsión y vida útil ---
  if (d.propulsion.level < d.orbit.requires_propulsion_level)
    add('error', 'Órbita', t('{orbit} requiere propulsión química o eléctrica.', { orbit: d.orbit.name }),
      'El cohete deja la nave en una órbita de transferencia; la nave debe hacer el último empujón por sí misma.');
  const maxLifetime = d.orbit.decay_years == null ? 30 : d.orbit.decay_years + d.propulsion.lifetime_extension_years;
  const lifetime = Math.min(design.lifetimeYears, maxLifetime);
  if (design.lifetimeYears > maxLifetime)
    add('warning', 'Tiempo', t('La órbita decae en ~{n} años: la vida útil queda limitada.', { n: maxLifetime }),
      'En órbitas bajas el roce con la atmósfera frena la nave. La propulsión permite compensarlo.');
  if (lifetime < mission.min_lifetime_years)
    add('error', 'Tiempo', t('La misión exige al menos {n} años de operación.', { n: mission.min_lifetime_years }),
      'Algunos objetivos científicos solo se logran con observaciones largas.');

  // --- Ciencia ---
  const pointingFactor = (i) => (i.pointing_deg < d.adcs.pointing_deg ? 0.4 : 1);
  const orbitFit = mission.preferred_orbits.includes(d.orbit.id) ? 1 : 0.5;
  const instrumentsScience = d.instruments.map((i) => {
    const relevance = instrumentRelevance(i, mission);
    if (relevance === 0)
      add('info', 'Ciencia', t('{name} no aporta al objetivo de esta misión.', { name: i.name }), 'Cada instrumento suma masa, energía y costo: llévalo solo si ayuda al objetivo.');
    return { id: i.id, relevance, perYear: i.science_value * relevance * pointingFactor(i) * 4 };
  });
  if (orbitFit < 1)
    add('warning', 'Órbita', t('Esta órbita no es ideal para el objetivo de la misión.'), mission.hint);
  const powerFactor = powerGeneration >= powerConsumption ? 1 : Math.max(0.1, powerGeneration / powerConsumption);
  const sciencePerYear = sum(instrumentsScience, (s) => s.perYear) * dataDelivered * orbitFit * powerFactor;

  // --- Costo ---
  const hardwareCost = sum(bus, (c) => c.cost_musd) + sum(d.instruments, (i) => i.cost_musd);
  const integrationCost = hardwareCost * INTEGRATION_COST;
  const launchCost = d.launcher.cost_musd + (d.launcher.cost_per_kg_musd || 0) * totalMass;
  const opsCost = d.orbit.ops_cost_musd_per_year * lifetime;
  const totalCost = hardwareCost + integrationCost + launchCost + opsCost;
  if (totalCost > mission.budget_musd)
    add(totalCost > mission.budget_musd * 1.1 ? 'error' : 'warning', 'Presupuesto',
      t('Costo total {cost} M$ supera el presupuesto de {budget} M$.', { cost: totalCost.toFixed(1), budget: mission.budget_musd }),
      'Las agencias cancelan misiones que se pasan mucho del presupuesto. Hasta 10% de sobrecosto se tolera con penalización.');

  // --- Tiempo de desarrollo ---
  // Los subsistemas se construyen en paralelo: manda el más lento, y cada
  // instrumento extra suma un mes de integración y pruebas.
  const devMonths = d.structure.dev_months
    + Math.max(0, ...bus.filter((c) => c !== d.structure).map((c) => c.dev_months || 0))
    + Math.max(0, ...d.instruments.map((i) => i.dev_months)) * 0.5
    + Math.max(0, d.instruments.length - 1);
  if (devMonths > mission.deadline_months)
    add('warning', 'Tiempo', t('El desarrollo tomaría {n} meses (plazo: {deadline}).', { n: devMonths.toFixed(0), deadline: mission.deadline_months }),
      'Los instrumentos y componentes avanzados tardan más en construirse y probarse.');

  return {
    mission,
    parts: d,
    mass: { payload: payloadMass, internal: internalMass, dry: dryMass, total: totalMass, structureCapacity: d.structure.capacity_kg, launchCapacity },
    power: { consumption: powerConsumption, generation: powerGeneration, eclipseEnergy, batteryUsable },
    data: { generatedGB: dataGeneratedGB, downlinkGB, delivered: dataDelivered, storageNeeded, storage: d.computer.storage_gb },
    cost: { hardware: hardwareCost, integration: integrationCost, launch: launchCost, ops: opsCost, total: totalCost, budget: mission.budget_musd },
    time: { devMonths, deadline: mission.deadline_months, lifetime, maxLifetime, minLifetime: mission.min_lifetime_years },
    science: { perYear: sciencePerYear, instruments: instrumentsScience, orbitFit, potential: sciencePerYear * lifetime, target: mission.target_science },
    issues,
    errors: issues.filter((i) => i.severity === 'error').length,
  };
}

/**
 * Simula la misión mes a mes con eventos aleatorios (reproducibles con `seed`).
 * Devuelve la línea de tiempo, el puntaje y las lecciones aprendidas.
 */
export function simulate(design, missionId, seed = 1) {
  const a = analyze(design, missionId);
  const rng = createRng(seed);
  const d = a.parts;
  const events = [];
  const ev = (month, type, title, text) => events.push({ month, type, title: t(title), text: t(text) });
  let outcome = 'success';
  let science = 0;
  let monthsOperated = 0;
  let penalties = 0;

  // 1. Revisión de costos
  const overrun = a.cost.total / a.cost.budget;
  if (overrun > 1.1) {
    outcome = 'cancelled';
    ev(0, 'fail', 'Misión cancelada en revisión', t('El costo ({cost} M$) supera el presupuesto en más de 10%. El comité no aprueba la misión.', { cost: a.cost.total.toFixed(0) }));
  } else if (overrun > 1) {
    penalties += 80;
    ev(0, 'warn', 'Sobrecosto aprobado con condiciones', 'El comité acepta el sobrecosto, pero la reputación del equipo se resiente.');
  }

  // 2. Desarrollo
  if (outcome === 'success' && a.time.devMonths > a.time.deadline) {
    penalties += 60;
    ev(0, 'warn', 'Retraso en el desarrollo', t('La nave estuvo lista {n} meses tarde. Se perdió la ventana planeada.', { n: (a.time.devMonths - a.time.deadline).toFixed(0) }));
  }

  // 3. Lanzamiento
  if (outcome === 'success') {
    if (a.mass.launchCapacity === 0 || a.mass.total > a.mass.launchCapacity) {
      outcome = 'launch_fail';
      ev(0, 'fail', 'El cohete no alcanza la órbita', 'La nave es demasiado pesada para el lanzador elegido (o el lanzador no llega a esa órbita).');
    } else if (a.mass.internal > a.mass.structureCapacity || d.instruments.length > d.structure.max_instruments) {
      outcome = 'launch_fail';
      ev(0, 'fail', 'Falla estructural en el lanzamiento', 'Las vibraciones del despegue dañaron una estructura sobrecargada.');
    } else if (rng() > d.launcher.reliability) {
      outcome = 'launch_fail';
      ev(0, 'fail', 'Anomalía del lanzador', t('El {launcher} sufrió una falla (confiabilidad {pct}%). A veces pasa: por eso se valoran los cohetes confiables.', { launcher: d.launcher.name, pct: (d.launcher.reliability * 100).toFixed(1) }));
    } else {
      ev(0, 'ok', 'Lanzamiento exitoso', t('{launcher} coloca la nave rumbo a {orbit}.', { launcher: d.launcher.name, orbit: d.orbit.name }));
    }
  }

  // 4. Llegada a órbita
  if (outcome === 'success' && d.propulsion.level < d.orbit.requires_propulsion_level) {
    outcome = 'orbit_fail';
    ev(1, 'fail', 'No se alcanza la órbita final', 'Sin propulsión propia la nave queda atrapada en la órbita de transferencia.');
  }

  // 4b. Aterrizaje: los famosos "siete minutos de terror"
  if (outcome === 'success' && d.orbit.surface) {
    if (rng() < (d.orbit.body === 'mars' ? 0.06 : 0.04)) {
      outcome = 'landing_fail';
      ev(1, 'fail', 'Falla en el aterrizaje', 'Algo salió mal en el descenso y la nave se estrelló. Aterrizar es una de las fases más riesgosas: incluso la NASA ha perdido sondas así.');
    } else {
      ev(1, 'ok', 'Aterrizaje exitoso', d.orbit.body === 'mars'
        ? 'Escudo térmico, paracaídas y retrocohetes funcionaron: ¡estás en Marte!'
        : 'Los motores frenaron el descenso a tiempo: ¡estás en la Luna!');
    }
  }

  // 5. Operaciones mes a mes
  if (outcome === 'success') {
    const months = Math.round(a.time.lifetime * 12);
    const powerOk = a.power.generation >= a.power.consumption;
    const batteryOk = a.power.batteryUsable >= a.power.eclipseEnergy;
    let health = 1;
    const failRate = (1 - d.computer.reliability) * (1 + d.orbit.radiation) / 12;

    if (!powerOk) ev(1, 'warn', 'Déficit de energía', 'La nave entra en modo seguro periódicamente: los instrumentos solo operan parte del tiempo.');
    if (!batteryOk) ev(1, 'warn', 'Batería insuficiente en eclipses', 'En cada eclipse se apagan los instrumentos para sobrevivir. La batería envejece rápido.');
    if (a.data.delivered < 1) ev(2, 'warn', 'Cuello de botella de datos', t('Solo llega a Tierra el {pct}% de los datos.', { pct: (a.data.delivered * 100).toFixed(0) }));

    for (let m = 1; m <= months; m++) {
      let factor = health * (batteryOk ? 1 : 0.6);
      const r = rng();
      if (d.orbit.body === 'mars' && !d.solar.constant && r < 0.015) {
        factor *= 0.3;
        ev(m, 'warn', 'Tormenta de polvo global', 'El polvo tapó el Sol durante semanas y los paneles casi no generaron energía. Un RTG no habría tenido este problema.');
      } else if (r < 0.025 + d.orbit.radiation * 0.02) {
        if (rng() > d.computer.reliability) {
          health *= 0.7;
          ev(m, 'warn', 'Tormenta solar daña la electrónica', 'Partículas energéticas dañan la computadora. La nave opera con capacidad reducida.');
        } else {
          factor *= 0.5;
          ev(m, 'info', 'Tormenta solar', 'La computadora reinició, pero se recuperó. Se perdieron algunos días de datos.');
        }
      } else if (r < 0.05 + d.orbit.radiation * 0.02) {
        factor *= 0.5;
        ev(m, 'info', 'Falla en estación terrena', 'Una estación de Tierra estuvo fuera de servicio por mantenimiento.');
      } else if (rng() < failRate) {
        outcome = 'lost';
        ev(m, 'fail', 'Pérdida de la nave', 'Una falla crítica de electrónica terminó la misión antes de tiempo.');
        break;
      }
      if (!batteryOk && rng() < 0.01) {
        outcome = 'lost';
        ev(m, 'fail', 'Batería agotada', 'Tras muchos ciclos profundos la batería dejó de cargar. La nave se apagó.');
        break;
      }
      science += (a.science.perYear / 12) * factor;
      monthsOperated = m;
    }
    if (outcome === 'success') ev(months, 'ok', 'Fin de misión nominal', t('La nave completó {n} años de operación.', { n: a.time.lifetime }));
    if (outcome === 'success' && d.orbit.decay_years != null && d.propulsion.level === 0)
      ev(months, 'info', 'Reentrada controlada por la atmósfera', 'Sin propulsión la nave reentra y se desintegra: no deja basura espacial.');
  }

  // 6. Puntaje (0-1000)
  const reached = a.science.target ? science / a.science.target : 0;
  const scienceScore = Math.round(Math.min(1.25, reached) * 400);
  const objectives = [
    { label: t('Instrumentos relevantes para el objetivo'), ok: a.science.instruments.some((s) => s.relevance >= 0.66) },
    { label: t('Vida útil ≥ {n} años', { n: a.time.minLifetime }), ok: monthsOperated / 12 >= a.time.minLifetime },
    { label: t('Órbita adecuada al objetivo'), ok: a.science.orbitFit === 1 },
    { label: t('Dentro del presupuesto'), ok: a.cost.total <= a.cost.budget },
    { label: t('Todos los datos llegan a Tierra'), ok: a.data.delivered >= 0.99 },
  ];
  const objectivesScore = objectives.filter((o) => o.ok).length * 50;
  const budgetLeft = Math.max(0, 1 - a.cost.total / a.cost.budget);
  const efficiencyScore = outcome === 'cancelled' ? 0 : Math.round(budgetLeft * 150
    + (a.power.generation >= a.power.consumption * 1.2 ? 25 : 0)
    + (a.mass.total <= a.mass.launchCapacity * 0.9 ? 25 : 0));
  const total = Math.max(0, scienceScore + objectivesScore + efficiencyScore - penalties);
  const grade = total >= 850 ? 'S' : total >= 700 ? 'A' : total >= 550 ? 'B' : total >= 400 ? 'C' : 'F';

  return {
    seed,
    outcome,
    events,
    science,
    monthsOperated,
    score: { total, science: scienceScore, objectives: objectivesScore, efficiency: efficiencyScore, penalties, grade },
    objectives,
    lessons: a.issues.filter((i) => i.severity !== 'info').map((i) => ({ area: i.area, text: i.why })),
    analysis: a,
  };
}
