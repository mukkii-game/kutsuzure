// 自動プレイを ?seg=N から走らせ、一定間隔でスクショ。node tools/run-shots.mjs 起点 間隔秒 枚数
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
await mkdir('tools/out', { recursive: true });
const [seg = '0', every = '8', count = '10'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); }); page.on('response', (r) => { if (r.status() >= 400) errors.push(r.url()); });
await page.goto(`http://127.0.0.1:${server.address().port}/?seg=${seg}&auto=1`);
const states = [];
for (let i = 0; i < Number(count); i++) {
  await page.waitForTimeout(Number(every) * 1000);
  await page.screenshot({ path: `tools/out/run-${i}.png` });
  states.push(await page.evaluate(() => window.__game?.state?.()));
}
await browser.close(); server.close();
console.log(JSON.stringify({ errors, states }, null, 0));
