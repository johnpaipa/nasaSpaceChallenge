// Recorre las pantallas en otro idioma y señala textos que quedaron en español.
//   node scripts/browser-i18n.mjs en [carpeta-capturas]
import puppeteer from 'puppeteer-core';
const lang = process.argv[2] || 'en';
const shots = process.argv[3] || '.';
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const click = (text, sel = 'button') => page.evaluate((text, sel) => { const b = [...document.querySelectorAll(sel)].find((x) => x.textContent.includes(text) && !x.disabled); b?.click(); return !!b; }, text, sel);
// Palabras muy típicas del español que no existen en los otros idiomas.
const SPANISH = /\b(misión|órbita|nave|batería|energía|instrumentos?|cohete|presupuesto|pulsa|elige|también|aquí|está|cráter|ruedas?|tierra|luna|sombra|datos|señal|capítulo|medallas?|puntaje|estrellas?|años|equipo|salir|ayuda|listo|simular|enviar|nivel|lugar|antena|falla|cabina|diseño|vida útil)\b/i;
async function audit(name) {
  await page.screenshot({ path: `${shots}/${lang}-${name}.png` });
  const lines = await page.evaluate(() => document.body.innerText.split('\n').map((s) => s.trim()).filter(Boolean));
  const bad = [...new Set(lines.filter((l) => SPANISH.test(l)))];
  console.log(`\n[${name}] ${bad.length ? `${bad.length} posible(s) texto(s) en español:` : 'OK'}`);
  bad.slice(0, 15).forEach((l) => console.log('   · ' + l.slice(0, 140)));
}
await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
await page.evaluate((lang) => { localStorage.clear(); localStorage.setItem('smd-lang', lang); localStorage.setItem('smd-muted', '1'); }, lang);
await page.reload({ waitUntil: 'networkidle0' });
await audit('1-home');
await page.evaluate(() => [...document.querySelectorAll('button.primary.big-start')][0]?.click());
await wait(1500);
await audit('2-tutorial');
await page.evaluate(() => document.querySelector('.modal-backdrop')?.click());
await wait(500);
await page.evaluate(() => document.querySelectorAll('nav.tabs button')[2]?.click());
await wait(400);
await audit('3-designer');
await page.evaluate(() => { [...document.querySelectorAll('button.option')].slice(0, 2).forEach((b) => b.click()); });
await page.evaluate(() => document.querySelector('button.launch')?.click());
await wait(7500);
await audit('4-report');
await page.goto('http://localhost:3001/?debug', { waitUntil: 'networkidle0' });
await page.evaluate(() => document.querySelector('#home-explore button')?.click());
await wait(3000);
await audit('5-difficulty');
await page.evaluate(() => document.querySelector('button.difficulty')?.click());
await wait(2500);
await audit('6-explore');
await page.keyboard.press('f');
await wait(1500);
await audit('7-cabin-fault');
console.log('\nerrores:', errors.length ? errors.join('\n') : 'ninguno');
await browser.close();
