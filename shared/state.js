// Estado de la partida y reducer compartido. En modo un jugador corre en el
// navegador; en modo equipo corre en el servidor (autoritativo) y el
// resultado se transmite a todos los jugadores de la sala.
import { simulate } from './engine.js';
import { index } from './catalog.js';
import { translatable } from './i18n.js';

export const ROLES = translatable({
  planner: {
    name: 'Dirección de Misión',
    icon: '🧭',
    fields: ['missionId', 'orbit', 'launcher', 'lifetimeYears'],
    desc: 'Elige el objetivo, la órbita, el cohete y la vida útil. Cuida el presupuesto global.',
  },
  spacecraft: {
    name: 'Ingeniería de la Nave',
    icon: '🛰️',
    fields: ['structure', 'solar', 'battery', 'adcs', 'propulsion', 'mobility'],
    desc: 'Diseña la plataforma: estructura, energía, orientación y propulsión.',
  },
  science: {
    name: 'Ciencia',
    icon: '🔬',
    fields: ['instruments'],
    desc: 'Selecciona los instrumentos que cumplen el objetivo científico.',
  },
  comms: {
    name: 'Comunicaciones y Datos',
    icon: '📡',
    fields: ['comms', 'computer'],
    desc: 'Asegura que los datos lleguen a Tierra: radio y almacenamiento a bordo.',
  },
});

export const fieldRole = Object.fromEntries(
  Object.entries(ROLES).flatMap(([role, r]) => r.fields.map((f) => [f, role])),
);

export function defaultDesign() {
  return {
    orbit: 'sso_700',
    launcher: 'rideshare',
    lifetimeYears: 3,
    structure: 'small',
    solar: 'deploy_s',
    battery: 'b500',
    comms: 's_band',
    computer: 'industrial',
    adcs: 'wheels',
    propulsion: 'none',
    mobility: 'none',
    instruments: [],
  };
}

/** Diseño inicial: en misiones a la superficie arranca ya con el destino correcto. */
export function designFor(missionId) {
  const design = defaultDesign();
  const mission = index.missions[missionId];
  if (mission?.surface) design.orbit = mission.preferred_orbits[0];
  return design;
}

export function createState(missionId = 'wildfire') {
  return { missionId, design: designFor(missionId), phase: 'design', result: null, ready: {}, log: [], attempt: 0 };
}

/** Copia de un diseño guardado, conservando solo valores que existen en el catálogo actual. */
export function sanitizeDesign(saved, fallback = defaultDesign()) {
  const design = { ...fallback };
  if (!saved || typeof saved !== 'object') return design;
  for (const key of Object.keys(design)) {
    const v = saved[key];
    if (key === 'instruments') { if (Array.isArray(v)) design.instruments = v.filter((id) => index.instruments[id]); }
    else if (key === 'lifetimeYears') { if (Number.isFinite(v)) design.lifetimeYears = Math.min(15, Math.max(1, Math.round(v))); }
    else if ((key === 'orbit' ? index.orbits : key === 'launcher' ? index.launchers : index.components[key])?.[v]) design[key] = v;
  }
  return design;
}

/**
 * Un jugador puede editar un campo si tiene el rol dueño de ese campo,
 * si juega solo (rol 'all') o si nadie en la sala tomó ese rol.
 */
export function canEdit(myRoles, field, claimedRoles = []) {
  if (myRoles.includes('all')) return true;
  const owner = fieldRole[field];
  return myRoles.includes(owner) || !claimedRoles.includes(owner);
}

export function reducer(state, action, ctx = { roles: ['all'], claimed: [], player: 'Tú' }) {
  const log = (text, params) => [...state.log.slice(-49), { t: Date.now(), who: ctx.player, text, params }];

  switch (action.type) {
    case 'set': {
      if (state.phase !== 'design' || !canEdit(ctx.roles, action.field, ctx.claimed)) return state;
      if (action.field === 'missionId')
      {
        const mission = index.missions[action.value];
        const orbitOk = !mission?.surface || mission.preferred_orbits.includes(state.design.orbit);
        const design = orbitOk ? state.design : { ...state.design, orbit: mission.preferred_orbits[0] };
        return { ...state, missionId: action.value, design, ready: {}, log: log('cambió el objetivo de la misión') };
      }
      return {
        ...state,
        design: { ...state.design, [action.field]: action.value },
        ready: {},
        log: log('cambió {field} → {value}', { field: action.field, value: action.value }),
      };
    }
    case 'toggleInstrument': {
      if (state.phase !== 'design' || !canEdit(ctx.roles, 'instruments', ctx.claimed)) return state;
      const has = state.design.instruments.includes(action.id);
      const instruments = has
        ? state.design.instruments.filter((i) => i !== action.id)
        : [...state.design.instruments, action.id];
      return { ...state, design: { ...state.design, instruments }, ready: {}, log: log(has ? 'quitó instrumento {id}' : 'agregó instrumento {id}', { id: action.id }) };
    }
    case 'ready':
      return { ...state, ready: { ...state.ready, [action.playerId]: action.value } };
    case 'simulate': {
      if (state.phase !== 'design') return state;
      const result = simulate(state.design, state.missionId, action.seed);
      return { ...state, phase: 'report', result, ready: {}, attempt: state.attempt + 1, log: log('lanzó la simulación (puntaje {score})', { score: result.score.total }) };
    }
    case 'redesign':
      return { ...state, phase: 'design', result: null, ready: {} };
    case 'loadDesign':
      // Restaura un intento anterior del historial (solo en un jugador).
      if (!ctx.roles.includes('all')) return state;
      return { ...state, phase: 'design', result: null, ready: {}, design: sanitizeDesign(action.design, state.design), log: log('restauró un diseño anterior') };
    case 'chat':
      return { ...state, log: [...state.log.slice(-49), { t: Date.now(), who: ctx.player, text: String(action.text).slice(0, 300), chat: true }] };
    default:
      return state;
  }
}
