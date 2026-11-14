// Idiomas del juego. El texto en español del código es la "llave": t('Hola')
// busca su traducción en el diccionario del idioma activo y, si no existe,
// muestra el español. Los textos con datos usan marcadores: t('{n} años', { n: 3 }).
import en from './i18n/en.json' with { type: 'json' };
import de from './i18n/de.json' with { type: 'json' };
import fr from './i18n/fr.json' with { type: 'json' };
import it from './i18n/it.json' with { type: 'json' };

export const LANGS = {
  es: { name: 'Español', flag: '🇪🇸', locale: 'es-ES' },
  en: { name: 'English', flag: '🇬🇧', locale: 'en-US' },
  de: { name: 'Deutsch', flag: '🇩🇪', locale: 'de-DE' },
  fr: { name: 'Français', flag: '🇫🇷', locale: 'fr-FR' },
  it: { name: 'Italiano', flag: '🇮🇹', locale: 'it-IT' },
};
const DICTS = { es: {}, en, de, fr, it };

let current = 'es';
const listeners = new Set();

export const getLang = () => current;
export const locale = () => LANGS[current].locale;

export function setLang(lang) {
  if (!LANGS[lang] || lang === current) return;
  current = lang;
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Traduce un texto en español al idioma activo, reemplazando {marcadores}. */
export function t(text, params) {
  let out = (current !== 'es' && DICTS[current][text]) || text;
  if (params) out = out.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return out;
}

/**
 * Hace traducible un objeto de textos definido en el código (fallas, medallas,
 * roles…): guarda sus textos originales y los reemplaza al cambiar de idioma.
 * No toca ids, iconos ni funciones.
 */
const SKIP = new Set(['id', 'control', 'kind', 'icon', 'mission', 'flag', 'locale']);
export function translatable(obj) {
  const slots = [];
  const walk = (o) => {
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && !SKIP.has(k)) slots.push([o, k, v]);
      else if (v && typeof v === 'object') walk(v);
    }
  };
  walk(obj);
  const apply = () => { for (const [o, k, v] of slots) o[k] = t(v); };
  onLangChange(apply);
  if (current !== 'es') apply();
  return obj;
}

/** Formatea números según el idioma (1.234,5 / 1,234.5). */
export const num = (n, digits = 0) => Number(n).toLocaleString(locale(), { maximumFractionDigits: digits });
