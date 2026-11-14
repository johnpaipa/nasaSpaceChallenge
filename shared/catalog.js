// Catálogo de datos del juego. Cuando lleguen los datasets oficiales del reto,
// basta con reemplazar los JSON de /data respetando los mismos campos
// (o adaptar aquí la conversión si el formato oficial es distinto).
import orbits from '../data/orbits.json' with { type: 'json' };
import launchers from '../data/launchers.json' with { type: 'json' };
import components from '../data/components.json' with { type: 'json' };
import instruments from '../data/instruments.json' with { type: 'json' };
import missions from '../data/missions.json' with { type: 'json' };
import sites from '../data/sites.json' with { type: 'json' };
import campaign from '../data/campaign.json' with { type: 'json' };
import { t, onLangChange, getLang } from './i18n.js';

const byId = (list) => Object.fromEntries(list.map((o) => [o.id, o]));

export const catalog = {
  orbits: orbits.options,
  launchers: launchers.options,
  categories: components.categories,
  instruments: instruments.options,
  missions: missions.options,
  sites: sites.sites,
};

export const index = {
  orbits: byId(orbits.options),
  launchers: byId(launchers.options),
  instruments: byId(instruments.options),
  missions: byId(missions.options),
  sites: byId(sites.sites),
  components: Object.fromEntries(
    Object.entries(components.categories).map(([key, cat]) => [key, byId(cat.options)]),
  ),
};

export const COMPONENT_KEYS = Object.keys(components.categories);
export const campaignData = campaign;

// --- Traducción de los datos ---
// Los textos de los JSON están en español. Al cambiar de idioma se reemplazan
// en los mismos objetos, así todo el código que lee index.missions[id].name
// ve el idioma activo. Se guarda una copia del original para poder volver.
const TEXT_FIELDS = new Set(['name', 'help', 'description', 'hint', 'story', 'title', 'text', 'intro', 'credit', 'coverage', 'label', 'difficulty']);
const roots = [orbits, launchers, components, instruments, missions, sites, campaign];
const originals = structuredClone(roots);

function localize(live, orig) {
  if (Array.isArray(orig)) { orig.forEach((o, i) => localize(live[i], o)); return; }
  if (!orig || typeof orig !== 'object') return;
  for (const [k, v] of Object.entries(orig)) {
    if (typeof v === 'string' && TEXT_FIELDS.has(k)) live[k] = t(v);
    else if (v && typeof v === 'object') localize(live[k], v);
  }
}

/** Textos originales (en español) de los datos, para extraer las llaves de traducción. */
export const originalData = originals;

onLangChange(() => roots.forEach((r, i) => localize(r, originals[i])));
if (getLang() !== 'es') roots.forEach((r, i) => localize(r, originals[i]));
