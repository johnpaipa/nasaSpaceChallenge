// Idioma en React: guarda la preferencia y redibuja la interfaz al cambiarlo.
import { createContext, useContext, useEffect, useState } from 'react';
import { LANGS, getLang, setLang } from '../../shared/i18n.js';

const KEY = 'smd-lang';
const LangContext = createContext({ lang: 'es', change: () => {} });

function initialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS[saved]) return saved;
  } catch { /* sin almacenamiento */ }
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'es').slice(0, 2);
  return LANGS[nav] ? nav : 'es';
}

export function LangProvider({ children }) {
  const [lang, setState] = useState(() => { const l = initialLang(); setLang(l); return l; });
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const change = (l) => {
    setLang(l);
    try { localStorage.setItem(KEY, l); } catch { /* sin almacenamiento */ }
    setState(l);
  };
  return <LangContext.Provider value={{ lang, change }}>{children(lang)}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);

/** Selector de idioma. `plain` omite el emoji (el inicio dibuja su propio icono). */
export function LangPicker({ compact = false, plain = false }) {
  const { lang, change } = useLang();
  return (
    <select className={`lang-picker ${compact ? 'compact' : ''}`} value={lang} onChange={(e) => change(e.target.value)} aria-label="Idioma / Language">
      {Object.entries(LANGS).map(([id, l]) => (
        <option key={id} value={id}>{plain ? l.name : compact ? `🌐 ${id.toUpperCase()}` : `🌐 ${l.name}`}</option>
      ))}
    </select>
  );
}

export { getLang };
