// 場面ごとのスクショ(?seg=N&auto=1)。tools/out/seg-N.png。node tools/shots.mjs [待ち秒]
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  try { const b = await readFile(join('dist', p)); res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
}).listen(0);
await mkdir('tools/out', { recursive: true });
const FALLBACK = '/opt/pw-browsers/chromium';
const browser = await chromium.launch({ executablePath: existsSync(FALLBACK) ? FALLBACK : undefined });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const wait = Number(process.argv[2] ?? 6) * 1000;
const segs = (process.env.SEGS ?? '0,1,2,3,4,5,6,7,8,9').split(',');
for (const n of segs) {
  await page.goto(`http://127.0.0.1:${server.address().port}/?seg=${n}&auto=1${process.env.Q ?? ''}`);
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `tools/out/seg-${n}.png` });
}
await browser.close(); server.close();
console.log(JSON.stringify({ errors }));
