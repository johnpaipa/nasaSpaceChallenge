// Aplica una lista de reemplazos exactos [archivo, buscar, reemplazar] definida en un módulo.
//   node scripts/apply-edits.mjs ruta/a/edits.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const { default: edits } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const files = new Map();
let failed = 0;
for (const [file, find, replace, all] of edits) {
  const src = files.get(file) ?? readFileSync(file, 'utf8');
  if (!src.includes(find)) { console.error(`✖ ${file}: no se encontró:\n   ${find.slice(0, 120)}`); failed++; files.set(file, src); continue; }
  files.set(file, all ? src.split(find).join(replace) : src.replace(find, () => replace));
}
if (failed) { console.error(`${failed} reemplazo(s) fallaron; no se escribió nada.`); process.exit(1); }
for (const [file, src] of files) writeFileSync(file, src);
console.log(`✔ ${edits.length} reemplazos en ${files.size} archivo(s)`);
