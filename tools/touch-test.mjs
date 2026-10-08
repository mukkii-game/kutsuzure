// スマホ(タッチ)で左右をタップして歩けるか。node tools/touch-test.mjs
import { chromium, devices } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
const browser = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
const ctx = await browser.newContext({ ...devices['iPhone 13 landscape'], defaultBrowserType: undefined });
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/?debug=1`);
await page.waitForTimeout(2500);
const vw = page.viewportSize();
for (let i = 0; i < 12; i++) {
  await page.touchscreen.tap(i % 2 === 0 ? vw.width * 0.2 : vw.width * 0.8, vw.height * 0.6);
  await page.waitForTimeout(i % 2 === 0 ? 450 : 180);
}
const st = JSON.parse(await page.evaluate(() => window.__game.state()));
await page.screenshot({ path: 'tools/out/touch.png' });
// 縦持ち: 横にしてね の案内が出て、タップで消えるか
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
const hint = await page.evaluate(() => [...document.querySelectorAll('[data-ui]')].some((e) => e.style.display === 'flex'));
await browser.close(); server.close();
console.log(JSON.stringify({ ok: st.steps >= 10 && errors.length === 0, steps: st.steps, seg: st.seg, portraitHint: hint, errors }));
