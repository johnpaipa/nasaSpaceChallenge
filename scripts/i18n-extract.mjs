// Extrae todos los textos traducibles (en español) del código y de los datos.
//   node scripts/i18n-extract.mjs          → lista de llaves y cuáles faltan por idioma
//   node scripts/i18n-extract.mjs --write  → guarda shared/i18n/keys.json
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { originalData } from '../shared/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keys = new Set();

// 1) Literales dentro de t( … ) (incluye ternarios: t(x ? 'a' : 'b'))
const LIT = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
function firstArg(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"' || c === '`') { const q = c; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) return src.slice(start, i); depth--; }
    else if (c === ',' && depth === 0) return src.slice(start, i);
  }
  return '';
}
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');

// 2) Textos sueltos en módulos con mensajes/objetos traducibles (add, ev, say, L, translatable…)
const LOOSE_FILES = ['shared/engine.js', 'shared/state.js', 'client/src/guide.js', 'client/src/campaign.js', 'client/src/explore/sim.js',
  'client/src/explore/faults.js', 'client/src/explore/antenna.js', 'client/src/explore/Exploration.jsx', 'client/src/components/Report.jsx',
  'client/src/explore/ArmControl.jsx', 'client/src/components/Designer.jsx', 'client/src/components/LaunchSequence.jsx', 'client/src/explore/Cabin.jsx'];
const looksLikeText = (s) => /[A-Za-zÁÉÍÓÚáéíóúñÑ¡¿]/.test(s) && s.length >= 3 && !/^[a-z0-9_\-]+$/.test(s) && !/^[#./@]/.test(s)
  && !/^(use |import|export)/.test(s) && !/^[A-Z_]+$/.test(s) && !/\.(js|jsx|json|png|jpg)$/.test(s) && !/^(rgba?|hsl)\(/.test(s);

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(f) && !/\.test\.js$/.test(f)) out.push(p);
  }
  return out;
}

for (const file of [...walk(path.join(ROOT, 'client/src')), ...walk(path.join(ROOT, 'shared'))]) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const m of src.matchAll(/(?<![\w.])(?:t|L)\(/g)) {
    const arg = firstArg(src, m.index + m[0].length);
    for (const s of arg.matchAll(LIT)) keys.add(unescape(s[1] ?? s[2]));
  }
  if (LOOSE_FILES.includes(rel)) {
    for (const line of src.split('\n')) {
      if (/^\s*(\/\/|\*|import )/.test(line) || /className=|\.test\(|require\(/.test(line)) continue;
      for (const s of line.matchAll(LIT)) {
        const text = unescape(s[1] ?? s[2]);
        if (looksLikeText(text)) keys.add(text);
      }
    }
  }
}

// 3) Datos (misiones, instrumentos, órbitas, sitios, campaña…)
const TEXT_FIELDS = new Set(['name', 'help', 'description', 'hint', 'story', 'title', 'text', 'intro', 'credit', 'coverage', 'label', 'difficulty']);
(function data(o) {
  if (Array.isArray(o)) return o.forEach(data);
  if (!o || typeof o !== 'object') return;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === 'string' && TEXT_FIELDS.has(k)) keys.add(v);
    else if (v && typeof v === 'object') data(v);
  }
})(originalData);

// Nombres propios que no se traducen
for (const k of ['NASA Space Apps Challenge', 'Mission Designer', 'Orbi', 'HiRISE', 'LOLA', 'SpaceX Falcon 9', 'SpaceX Falcon Heavy', 'Atlas V 401', 'Vega-C', 'Rocket Lab Electron', 'T-0']) keys.delete(k);
for (const k of [...keys]) {
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]/.test(k)) keys.delete(k);
  else if (/^[a-z]+[A-Z]\w*$/.test(k) || /^var\(|^M\d|^circuit-|^Hola$/.test(k)) keys.delete(k); // ids, CSS, SVG
}

const list = [...keys].sort((a, b) => a.localeCompare(b, 'es'));
const langs = ['en', 'de', 'fr', 'it'];
console.log(`${list.length} textos traducibles`);
for (const l of langs) {
  const dict = JSON.parse(readFileSync(path.join(ROOT, `shared/i18n/${l}.json`), 'utf8'));
  const missing = list.filter((k) => !dict[k]);
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  console.log(`  ${l}: faltan ${missing.length}${unused.length ? ` · sobran ${unused.length}` : ''}`);
}
if (process.argv.includes('--write')) {
  writeFileSync(path.join(ROOT, 'shared/i18n/keys.json'), JSON.stringify(list, null, 1) + '\n');
  console.log('→ shared/i18n/keys.json');
}
