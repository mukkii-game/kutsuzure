// ゲームの中身だけを描画なしで回す bot。歩き方ごとに、ズキッの回数・シャッフル・友だちとの合流を数える。
// node tools/bot.mjs
import { build } from 'vite';
import fs from 'node:fs';
const entry = 'tools/.bot-entry.ts';
fs.writeFileSync(entry, `
(globalThis as any).localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
import { Walk } from '../src/game/walk';
type Style = { name: string; rl: number; lr: number; idleAt?: number };
const styles: Style[] = [
  { name: 'even 500ms (ふつうに歩く)', rl: 500, lr: 500 },
  { name: 'even 350ms (速く歩く)', rl: 350, lr: 350 },
  { name: 'limp R170 L520 (かばう)', rl: 170, lr: 520 },
  { name: 'limp R250 L450 (少しかばう)', rl: 250, lr: 450 },
  { name: 'even 500 + stop in v2', rl: 500, lr: 500, idleAt: 1 },
];
const out: any[] = [];
for (const s of styles) {
  const w = new Walk();
  let t = 0, next = 300, foot: 'L' | 'R' = 'L', zuki = 0, shufOn = 0, aligned = 0, steps = 0, syncAt = -1, segZuki: Record<string, number> = {};
  let stopped = false;
  while (!w.ended && t < 600000) {
    if (w.seg.kind === 'cafe' || w.seg.kind === 'cutscene' || w.seg.kind === 'end') { if (t >= next) { w.step('R'); next = t + 1500; } }
    else if (t >= next) {
      if (s.idleAt && w.seg.verse === 2 && w.segSteps === 8 && !stopped) { stopped = true; next = t + 2600; }
      else { w.step(foot); next = t + (foot === 'R' ? s.rl : s.lr); foot = foot === 'L' ? 'R' : 'L'; }
    }
    w.update(1000 / 60); t += 1000 / 60;
    for (const e of w.drain()) {
      if (e.type === 'zuki') { zuki++; segZuki[w.seg.id] = (segZuki[w.seg.id] ?? 0) + 1; }
      if (e.type === 'shuffle' && e.on) shufOn++;
      if (e.type === 'step') { steps++; if (e.aligned) aligned++; }
      if (e.type === 'friendSync' && syncAt < 0) syncAt = w.segSteps;
    }
  }
  out.push({ seg: w.seg.id, d: w.describe(), style: s.name, minutes: +(t / 60000).toFixed(1), steps, zuki, segZuki, shuffleOn: shufOn, alignedPct: Math.round(aligned / steps * 100), syncAtStepInV2: syncAt, ended: w.ended });
}
console.log(JSON.stringify(out, null, 1));
`);
try {
  const out = await build({ logLevel: 'silent', configFile: false,
    define: { __BUILD_TIME__: '""', __GIT_SHA__: '""' },
    build: { write: false, lib: { entry, formats: ['es'], fileName: 't' }, rollupOptions: { output: { inlineDynamicImports: true } } } });
  globalThis.location = { search: '' };
  await import('data:text/javascript,' + encodeURIComponent(out[0].output[0].code));
} finally { fs.rmSync(entry, { force: true }); }
