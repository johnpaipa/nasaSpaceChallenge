// Fallas repentinas al caer la noche. Cada una está basada en un caso real y se
// repara desde el tablero de la cabina con una secuencia de pasos. Es lógica
// pura (sin gráficos) para poder probarla.
import { t, translatable } from '../../../shared/i18n.js';

export const FAULTS = translatable({
  power: {
    title: 'Cortocircuito en el bus de energía', icon: '⚡',
    alarm: '¡FALLA ELÉCTRICA! Se disparó el interruptor principal y el rover quedó sin energía en sus sistemas.',
    diag: 'Corriente anormal (12 A) en el circuito INSTRUMENTOS. Probable cortocircuito por el frío de la noche.',
    steps: [
      { id: 'diag', hint: 'Pulsa DIAGNÓSTICO para saber qué falló.', control: 'diag' },
      { id: 'isolate', hint: 'Apaga el circuito que tiene el problema: INSTRUMENTOS.', control: 'circuit-instr' },
      { id: 'reset', hint: 'Ahora reinicia el interruptor principal con el botón RESET.', control: 'breaker' },
    ],
    real: 'Aislar el circuito dañado ANTES de reconectar es la regla de oro de los ingenieros eléctricos: si no, el corto vuelve a disparar el interruptor.',
    fail: { kind: 'battery', text: 'El equipo en la Tierra logró reiniciar el sistema, pero el cortocircuito gastó el 60% de la batería.' },
  },
  computer: {
    title: 'Computadora dañada por radiación', icon: '🖥️',
    alarm: '¡ERROR DE MEMORIA! La computadora A se reinicia una y otra vez.',
    diag: 'Memoria corrupta en la COMPUTADORA A: una partícula de alta energía del espacio cambió sus datos. La computadora B (respaldo) está sana.',
    steps: [
      { id: 'diag', hint: 'Pulsa DIAGNÓSTICO para saber qué falló.', control: 'diag' },
      { id: 'switchB', hint: 'Cambia a la computadora de respaldo: B.', control: 'computer' },
      { id: 'reboot', hint: 'Pulsa REINICIAR para arrancar con la computadora B.', control: 'reboot' },
    ],
    real: 'En 2013 el rover Curiosity tuvo exactamente esta falla y los ingenieros lo salvaron cambiando a su computadora de respaldo (el "lado B").',
    fail: { kind: 'data', text: 'La computadora se recuperó sola, pero se borraron los datos que no habías enviado. Tendrás que volver a analizar esos lugares.' },
  },
  heater: {
    title: 'Falla del calefactor de batería', icon: '🥶',
    alarm: '¡TEMPERATURA DE BATERÍA BAJANDO! El calefactor principal se apagó en plena noche.',
    diag: 'El calefactor principal no recibe corriente. Hay un calefactor de RESPALDO apagado. Para que la energía alcance toda la noche, apaga lo que no sea vital.',
    steps: [
      { id: 'diag', hint: 'Pulsa DIAGNÓSTICO para saber qué falló.', control: 'diag' },
      { id: 'backup', hint: 'Enciende el CALEFACTOR DE RESPALDO.', control: 'heater' },
      { id: 'shed', hint: 'Apaga INSTRUMENTOS y CÁMARAS: de noche no se usan y gastan energía.', control: 'circuit-instr circuit-cameras' },
    ],
    real: 'Las noches en Marte llegan a −90 °C y en la sombra lunar a −230 °C. Sin calefacción las baterías se dañan: por eso los rovers apagan todo lo no vital al anochecer.',
    fail: { kind: 'capacity', text: 'El frío dañó la batería: ahora solo guarda el 70% de la energía que guardaba antes.' },
  },
  antenna: {
    title: 'Antena desalineada', icon: '📡',
    alarm: '¡SIN SEÑAL DE LA TIERRA! Se perdió el enlace de comunicaciones.',
    diag: 'La antena de alta ganancia quedó apuntando al lugar equivocado. Gira la perilla mirando el medidor: cuando la señal pase de 90%, pulsa FIJAR.',
    steps: [
      { id: 'diag', hint: 'Pulsa DIAGNÓSTICO para saber qué falló.', control: 'diag' },
      { id: 'align', hint: 'Gira la perilla de la ANTENA hasta que la señal pase de 90%.', control: 'antenna' },
      { id: 'lock', hint: '¡Bien! Ahora pulsa FIJAR para dejar la antena en esa posición.', control: 'lock' },
    ],
    real: 'En 2023 la sonda Voyager 2 quedó apuntando apenas 2° fuera de la Tierra y la NASA tardó dos semanas en recuperar el contacto.',
    fail: { kind: 'comms', text: 'El equipo en la Tierra realineó la antena, pero estuviste medio sol sin poder enviar datos.' },
  },
  wheel: {
    title: 'Motor de rueda trabado', icon: '⚙️',
    alarm: '¡SOBRECORRIENTE EN LOS MOTORES! Una rueda está trabada.',
    diag: 'Una rueda consume demasiada corriente (mírala en ROJO en el mapa de ruedas). Ponla en modo LIBRE para que ruede sin motor y prueba los motores.',
    steps: [
      { id: 'diag', hint: 'Pulsa DIAGNÓSTICO para saber qué falló.', control: 'diag' },
      { id: 'free', hint: 'Toca la rueda que aparece en ROJO para ponerla en modo LIBRE.', control: 'wheels' },
      { id: 'test', hint: 'Pulsa PROBAR MOTORES.', control: 'test' },
    ],
    real: 'El rover Spirit manejó durante años arrastrando una rueda delantera trabada: ¡los ingenieros le enseñaron a avanzar en reversa!',
    fail: { kind: 'wheels', text: 'El motor trabado dañó la transmisión: las ruedas perdieron 40% de su estado.' },
  },
});

const CIRCUIT_NAMES = { instr: 'Instrumentos', cameras: 'Cámaras', radio: 'Radio', motors: 'Motores' };

export const FAULT_TIME = { explorer: 150, engineer: 90, commander: 60 };
export const FAULT_COUNT = { explorer: 1, engineer: 1, commander: 2 };
export const HINTS = { explorer: 'full', engineer: 'text', commander: 'none' };

/** Elige una falla: algunas son más probables según las piezas del diseño. */
export function chooseFault(sim) {
  const p = sim.parts;
  const weights = {
    power: 2,
    computer: p.computer.id === 'radhard' ? 0.5 : 3, // sin endurecer contra radiación, más riesgo
    heater: p.solar.constant ? 0.5 : 2.5, // el RTG da calor de sobra
    antenna: 1.5,
    wheel: 1.5 + (100 - sim.wheelHealth) / 30,
  };
  for (const f of sim.faultLog) delete weights[f.id]; // no repetir la misma falla
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = sim.rng() * total;
  for (const [id, w] of Object.entries(weights)) if ((r -= w) <= 0) return id;
  return Object.keys(weights)[0];
}

export function signalStrength(panel) {
  const d = (((panel.antennaAngle - panel.antennaTarget) % 360) + 540) % 360 - 180;
  return Math.round(100 * Math.max(0, Math.cos((d * Math.PI) / 180)) ** 6);
}

export function startFault(sim, id) {
  const target = 40 + Math.floor(sim.rng() * 280);
  sim.fault = {
    id, ...FAULTS[id], elapsed: 0, limit: FAULT_TIME[sim.difficulty.id] ?? 90,
    hints: HINTS[sim.difficulty.id] ?? 'text', solved: false, rebooting: 0,
    panel: {
      diagDone: false, log: [`*** ${FAULTS[id].alarm}`],
      circuits: { instr: true, cameras: true, radio: true, motors: true },
      breakerTripped: id === 'power', computer: 'A', heaterBackup: false,
      antennaAngle: (target + 140) % 360, antennaTarget: target,
      jammedWheel: Math.floor(sim.rng() * 6), freeWheels: [false, false, false, false, false, false],
      motorsTested: false, alarmSilenced: false,
    },
  };
}

/** Índice del paso actual (para las pistas y para resaltar controles). */
export function currentStep(fault) {
  const p = fault.panel;
  const done = {
    diag: p.diagDone,
    isolate: !p.circuits.instr,
    reset: fault.solved,
    switchB: p.computer === 'B',
    reboot: fault.solved,
    backup: p.heaterBackup,
    shed: !p.circuits.instr && !p.circuits.cameras,
    align: signalStrength(p) >= 90,
    lock: fault.solved,
    free: p.freeWheels[p.jammedWheel],
    test: fault.solved,
  };
  const i = fault.steps.findIndex((s) => !done[s.id]);
  return i === -1 ? fault.steps.length : i;
}

/** Acción desde el tablero. Devuelve un texto de respuesta para la consola. */
export function panelAction(sim, action) {
  const f = sim.fault;
  if (!f || f.solved) return null;
  const p = f.panel;
  const log = (text, params) => { const s = t(text, params); p.log.push(s); return s; };
  switch (action.type) {
    case 'diag':
      p.diagDone = true;
      return log('> DIAGNÓSTICO: {diag}', { diag: f.diag });
    case 'silence':
      p.alarmSilenced = true;
      return log('> Alarma silenciada. La falla sigue activa.');
    case 'circuit':
      p.circuits[action.id] = action.on;
      log(action.on ? '> Circuito {name} ENCENDIDO' : '> Circuito {name} APAGADO', { name: t(CIRCUIT_NAMES[action.id] ?? action.id).toUpperCase() });
      break;
    case 'breaker':
      if (!p.breakerTripped) return log('> El interruptor principal está bien.');
      if (p.circuits.instr) return log('> ¡El interruptor se volvió a disparar! El cortocircuito sigue conectado: aísla primero el circuito con problemas.');
      p.breakerTripped = false;
      return solve(sim, t('Interruptor reiniciado con el circuito dañado aislado. Energía restablecida. (El corto fue por el frío: los instrumentos volverán a funcionar al amanecer).'));
    case 'computer':
      p.computer = action.side;
      return log('> Computadora activa: {side}', { side: action.side });
    case 'reboot':
      if (f.id !== 'computer') return log('> Reinicio completo. La falla sigue ahí: no era la computadora.');
      if (p.computer !== 'B') return log('> La computadora A arrancó… y volvió a fallar. Su memoria está dañada: usa la de respaldo.');
      f.rebooting = 2.5;
      return log('> Arrancando computadora B… cargando software de vuelo…');
    case 'heater':
      p.heaterBackup = action.on;
      log(action.on ? '> Calefactor de respaldo ENCENDIDO' : '> Calefactor de respaldo APAGADO');
      break;
    case 'antenna':
      p.antennaAngle = ((action.angle % 360) + 360) % 360;
      return null;
    case 'lock': {
      const s = signalStrength(p);
      if (f.id !== 'antenna') return log('> Antena fijada. La falla sigue ahí: no era la antena.');
      if (s < 90) return log('> Señal muy débil ({s}%). Sigue girando la perilla hasta pasar de 90%.', { s });
      return solve(sim, t('Antena fijada con {s}% de señal. ¡Contacto con la Tierra recuperado!', { s }));
    }
    case 'wheel':
      p.freeWheels[action.i] = !p.freeWheels[action.i];
      return log(p.freeWheels[action.i] ? '> Rueda {n}: modo LIBRE' : '> Rueda {n}: con motor', { n: action.i + 1 });
    case 'test': {
      if (f.id !== 'wheel') return log('> Motores OK. La falla está en otro sistema.');
      const freed = p.freeWheels.filter(Boolean).length;
      if (!p.freeWheels[p.jammedWheel]) return log('> ¡Sobrecorriente otra vez! La rueda trabada sigue con motor.');
      if (freed > 1) return log('> Liberaste ruedas sanas: el rover perdería tracción. Deja libre SOLO la rueda trabada.');
      return solve(sim, t('Rueda {n} en modo libre. Los otros 5 motores funcionan bien: ¡el rover puede seguir!', { n: p.jammedWheel + 1 }));
    }
    default:
      return null;
  }
  // Acciones que pueden completar la reparación del calefactor.
  if (f.id === 'heater' && p.heaterBackup && !p.circuits.instr && !p.circuits.cameras)
    return solve(sim, t('Calefactor de respaldo encendido y cargas no vitales apagadas: la batería se mantiene tibia toda la noche.'));
  return p.log[p.log.length - 1];
}

function solve(sim, text) {
  const f = sim.fault;
  f.solved = true;
  f.panel.log.push(`> ✅ ${text}`);
  sim.faultLog.push({ id: f.id, title: f.title, solved: true, time: Math.round(f.elapsed), real: f.real });
  sim.messages.push({ text: t('🛠️ ¡Reparado en {s} s! {real}', { s: Math.round(f.elapsed), real: f.real }), kind: 'win', t: sim.t, fact: true });
  f.closeIn = 3; // unos segundos para leer el resultado antes de volver a manejar
  return text;
}

function applyFailure(sim) {
  const f = sim.fault;
  switch (f.fail.kind) {
    case 'battery': sim.battery *= 0.4; break;
    case 'data':
      for (const q of sim.queue) sim.pois[q.id] = 'pending';
      sim.queue = [];
      break;
    case 'capacity': sim.cap = Math.round(sim.cap * 0.7); sim.battery = Math.min(sim.battery, sim.cap); break;
    case 'comms': sim.commsDownUntil = sim.t + sim.site.sol_seconds * 0.5; break;
    case 'wheels': sim.wheelHealth = Math.max(0, sim.wheelHealth - 40); break;
  }
  f.solved = true;
  f.timedOut = true;
  f.panel.log.push(t('> ⏰ Se acabó el tiempo. {what}', { what: f.fail.text }));
  sim.faultLog.push({ id: f.id, title: f.title, solved: false, real: f.real, consequence: f.fail.text });
  sim.messages.push({ text: t('⏰ ¡Se acabó el tiempo! {what}', { what: f.fail.text }), kind: 'bad', t: sim.t });
  f.closeIn = 4;
}

/** Avanza el reloj de la falla (la misión queda en pausa mientras tanto). */
export function faultTick(sim, dt) {
  const f = sim.fault;
  if (f.closeIn != null) {
    f.closeIn -= dt;
    if (f.closeIn <= 0) sim.fault = null;
    return;
  }
  if (f.rebooting > 0) {
    f.rebooting -= dt;
    if (f.rebooting <= 0) solve(sim, t('Computadora B en línea. Todos los sistemas responden. ¡Rover a salvo!'));
    return;
  }
  f.elapsed += dt;
  if (f.elapsed >= f.limit) applyFailure(sim);
}
