// Abre el juego en un navegador real (Chrome local, sin ventana), entra al modo
// exploración y reporta errores de la consola. Uso: node scripts/browser-check.mjs moon|mars
import puppeteer from 'puppeteer-core';
const which = process.argv[2] || 'moon';
const shots = process.argv[3] || '.';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1400,850'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 850 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.setItem('smd-lang', 'es'));
await page.reload({ waitUntil: 'networkidle0' });
const label = which === 'moon' ? 'Probar en la Luna' : 'Probar en Marte';
const clicked = await page.evaluate((label) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(label)); b?.click(); return !!b; }, label);
console.log('botón encontrado:', clicked);
await new Promise((r) => setTimeout(r, 4000));
await page.screenshot({ path: `${shots}/${which}-1-picker.png` });
const picked = await page.evaluate(() => { const b = [...document.querySelectorAll('button.difficulty')].find((x) => x.textContent.includes('Explorador')); b?.click(); return !!b; });
console.log('selector de dificultad:', picked);
await new Promise((r) => setTimeout(r, 3000));
await page.keyboard.down('w'); await new Promise((r) => setTimeout(r, 2500)); await page.keyboard.up('w');
await page.screenshot({ path: `${shots}/${which}-2-drive.png` });
await page.keyboard.press('c'); await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${shots}/${which}-3-cabin.png` });
await page.keyboard.press('c'); await page.keyboard.press('f'); await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${shots}/${which}-4-fault.png` });
const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
console.log('texto en pantalla:', text.replace(/\n+/g, ' | '));
console.log('errores:', errors.length ? '\n' + errors.slice(0, 15).join('\n') : 'ninguno');
await browser.close();
