// Junta archivos de traducción { "texto español": [en, de, fr, it] } y genera
// shared/i18n/{en,de,fr,it}.json. Valida que las llaves existan y que cada
// traducción conserve los mismos marcadores {…}.
//   node scripts/i18n-build.mjs carpeta/con/tr-*.json
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'de', 'fr', 'it'];
const dir = process.argv[2];
const keys = new Set(JSON.parse(readFileSync(path.join(ROOT, 'shared/i18n/keys.json'), 'utf8')));
const dicts = Object.fromEntries(LANGS.map((l) => [l, {}]));
const marks = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
let problems = 0;

for (const f of readdirSync(dir).filter((f) => /^tr-.*\.json$/.test(f)).sort()) {
  let data;
  try { data = JSON.parse(readFileSync(path.join(dir, f), 'utf8')); } catch (e) { console.error(`✖ ${f}: JSON inválido — ${e.message}`); problems++; continue; }
  for (const [es, tr] of Object.entries(data)) {
    if (!keys.has(es)) { console.error(`✖ ${f}: llave desconocida: ${es.slice(0, 80)}`); problems++; }
    if (!Array.isArray(tr) || tr.length !== 4) { console.error(`✖ ${f}: se esperaban 4 traducciones: ${es.slice(0, 60)}`); problems++; continue; }
    tr.forEach((text, i) => {
      if (marks(text) !== marks(es)) { console.error(`✖ ${f} [${LANGS[i]}]: marcadores distintos en: ${es.slice(0, 60)}`); problems++; }
      dicts[LANGS[i]][es] = text;
    });
  }
}
const missing = [...keys].filter((k) => !(k in dicts.en));
console.log(`${Object.keys(dicts.en).length}/${keys.size} textos traducidos${missing.length ? ` · faltan ${missing.length}` : ''}${problems ? ` · ${problems} problema(s)` : ''}`);
if (process.argv.includes('--missing')) missing.forEach((k) => console.log('  - ' + k));
if (process.argv.includes('--write')) {
  for (const l of LANGS) writeFileSync(path.join(ROOT, `shared/i18n/${l}.json`), JSON.stringify(dicts[l], null, 1) + '\n');
  console.log('→ shared/i18n/{en,de,fr,it}.json');
}
