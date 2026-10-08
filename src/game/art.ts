// 絵の置き場。AI 生成の絵(public/art/*.png)があればそれを、無ければコードで描いた仮の絵を使う。
// ファイル名は docs/asset-requests.md の番号と同じ。
import Phaser from 'phaser';
import type { Tod } from './story';

export const ART_FILES: Record<string, string> = {
  bg_genkan: 'bg02_street_morning.png', // 家の門の前から出発(玄関の絵が届くまで)
  bg_street_m: 'bg02_street_morning.png',
  bg_shotengai: 'bg02_street_morning.png', // 専用の絵が届くまで朝の道を使い回す
  bg_crosswalk: 'bg02_street_morning.png',
  bg_cafe: 'bg05_cafe_table.png',
  bg_street_e: 'bg06_street_evening.png',
  bg_street_e2: 'bg06_street_evening.png',
  bg_stairs: 'bg07_riverbank_stairs.png',
  bg_grass: 'bg07_riverbank_stairs.png',
  bg_sky: 'bg09_sky.png',
  me_leg: 'me_leg.png', me_leg_bare: 'me_leg_bare.png', fr_leg: 'fr_leg.png', fr_leg_bare: 'fr_leg_bare.png',
  me_thigh: 'me_thigh.png', me_shin: 'me_shin.png', me_shoe: 'me_shoe.png', me_shoe_worn: 'me_shoe_worn.png', me_shin_bare: 'me_shin_bare.png', me_foot_bare: 'me_foot_bare.png',
  fr_thigh: 'fr_thigh.png', fr_shin: 'fr_shin.png', fr_shoe: 'fr_shoe.png', fr_shoe_worn: 'fr_shoe_worn.png', fr_shin_bare: 'fr_shin_bare.png', fr_foot_bare: 'fr_foot_bare.png',
};

// src/assets/art/ に置いた絵だけが束ねられる(無い絵を読みに行って 404 を出さない)
const FOUND = import.meta.glob('../assets/art/*.{png,jpg,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export function preloadArt(scene: Phaser.Scene) {
  const byName = new Map(Object.entries(FOUND).map(([p, url]) => [p.split('/').pop()!.replace(/\.(jpg|webp)$/, '.png'), url]));
  for (const [key, file] of Object.entries(ART_FILES)) {
    const url = byName.get(file);
    if (url) scene.load.image(key, url);
  }
}

export const PAL: Record<Tod, { sky: [number, number]; wall: number; wall2: number; ground: number; line: number; light: number; paper: number }> = {
  morning: { sky: [0xd6ecf7, 0xf7f3e8], wall: 0xece6da, wall2: 0xe2dccd, ground: 0xdcdad4, line: 0x2a2522, light: 0xfff6dc, paper: 0xfaf6ec },
  noon: { sky: [0xdff0f7, 0xfbf8ef], wall: 0xf0e9dc, wall2: 0xe6dfcf, ground: 0xe2dfd8, line: 0x2a2522, light: 0xffffff, paper: 0xfbf8ef },
  cafe: { sky: [0xf3e6cf, 0xf7eedc], wall: 0xe8d6b8, wall2: 0xdcc8a6, ground: 0xe6cfa6, line: 0x2a2522, light: 0xffe9b8, paper: 0xf7eedc },
  evening: { sky: [0xf6c99a, 0xf9e6cc], wall: 0xf0dcc6, wall2: 0xe6cdb4, ground: 0xd9cbc0, line: 0x2a2522, light: 0xffd9a8, paper: 0xf8ead6 },
  dusk: { sky: [0xb6c0e2, 0xf6cfae], wall: 0xd8d4e4, wall2: 0xccc8dc, ground: 0xb8d0a0, line: 0x2a2522, light: 0xffdcb8, paper: 0xf2e8dc },
  night: { sky: [0x3a4170, 0x59609a], wall: 0x50567e, wall2: 0x464c72, ground: 0x5a5a6e, line: 0x111111, light: 0xffe0a8, paper: 0x3a3a4a },
};

/** 紙のざらつき(全画面に薄く重ねる) */
export function makePaperTexture(scene: Phaser.Scene, key = 'paper') {
  if (scene.textures.exists(key)) return;
  const w = 512, h = 512;
  const c = scene.textures.createCanvas(key, w, h)!;
  const ctx = c.getContext();
  const img = ctx.createImageData(w, h);
  let s = 12345;
  for (let i = 0; i < w * h; i++) {
    s = (s * 16807) % 2147483647;
    const v = 200 + ((s / 2147483647) * 55) | 0;
    img.data[i * 4] = v; img.data[i * 4 + 1] = v - 6; img.data[i * 4 + 2] = v - 16; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 繊維の筋
  ctx.globalAlpha = 0.06; ctx.strokeStyle = '#6b5a40';
  for (let i = 0; i < 260; i++) {
    s = (s * 16807) % 2147483647; const x = (s / 2147483647) * w;
    s = (s * 16807) % 2147483647; const y = (s / 2147483647) * h;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + (i % 9), y + (i % 3) - 1); ctx.stroke();
  }
  c.refresh();
}

/** にじんだ丸(水彩のしみ) */
export function makeBlotTexture(scene: Phaser.Scene, key: string, color: string, r = 64) {
  if (scene.textures.exists(key)) return;
  const c = scene.textures.createCanvas(key, r * 2, r * 2)!;
  const ctx = c.getContext();
  const g = ctx.createRadialGradient(r, r, r * 0.1, r, r, r);
  g.addColorStop(0, color); g.addColorStop(0.55, color.replace(/[\d.]+\)$/, '0.55)')); g.addColorStop(0.8, color.replace(/[\d.]+\)$/, '0.25)')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  c.refresh();
}

export const hasTex = (scene: Phaser.Scene, key: string) => scene.textures.exists(key) && scene.textures.get(key).key !== '__MISSING';

/** 透明な余白を切り落とした版を `${key}#t` として作る(AI の絵は余白がまちまちなので) */
export function trimParts(scene: Phaser.Scene) {
  for (const key of Object.keys(ART_FILES)) {
    if (!/^(me|fr)_/.test(key) || !scene.textures.exists(key)) continue;
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement;
    const w = src.width, h = src.height;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d')!; cx.drawImage(src, 0, 0);
    const img = cx.getImageData(0, 0, w, h);
    const d = img.data;
    // 背景が白いまま届いた絵(Gemini 等)は、外側から白をたどって透明にする(線の内側の白い靴下は残る)
    if (d[3] > 200 && d[(w * h - 1) * 4 + 3] > 200) {
      const white = (i: number) => d[i] > 225 && d[i + 1] > 225 && d[i + 2] > 225;
      const seen = new Uint8Array(w * h);
      const stack: number[] = [];
      for (let x = 0; x < w; x++) { stack.push(x, (h - 1) * w + x); }
      for (let y = 0; y < h; y++) { stack.push(y * w, y * w + w - 1); }
      while (stack.length) {
        const p = stack.pop()!;
        if (seen[p]) continue; seen[p] = 1;
        if (!white(p * 4)) continue;
        d[p * 4 + 3] = 0;
        const x = p % w, y = (p / w) | 0;
        if (x > 0) stack.push(p - 1); if (x < w - 1) stack.push(p + 1);
        if (y > 0) stack.push(p - w); if (y < h - 1) stack.push(p + w);
      }
      cx.putImageData(img, 0, 0);
    }
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      if (d[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 <= x0 || y1 <= y0) continue;
    const out = document.createElement('canvas'); out.width = x1 - x0 + 2; out.height = y1 - y0 + 2;
    out.getContext('2d')!.drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    // 関節の切り口をぼかす(すねの上下・ももの下)。曲げた時に四角い角が見えないように
    const fade = (top: number, bottom: number) => {
      const oc = out.getContext('2d')!;
      oc.globalCompositeOperation = 'destination-out';
      if (top > 0) { const g = oc.createLinearGradient(0, 0, 0, out.height * top); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); oc.fillStyle = g; oc.fillRect(0, 0, out.width, out.height * top); }
      if (bottom > 0) { const y0 = out.height * (1 - bottom); const g = oc.createLinearGradient(0, y0, 0, out.height); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); oc.fillStyle = g; oc.fillRect(0, y0, out.width, out.height - y0); }
      oc.globalCompositeOperation = 'source-over';
    };
    if (/_leg_bare/.test(key)) fade(0, 0.05);
    if (/_foot_bare/.test(key)) fade(0.12, 0);
    scene.textures.addCanvas(`${key}#t`, out);
    // 関節の位置: 上端と下端の数行で、脚(不透明な部分)の左右の中心を測る
    const od = out.getContext('2d')!.getImageData(0, 0, out.width, out.height).data;
    const cxAt = (y0: number, y1: number) => {
      let sx = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < out.width; x++) if (od[(y * out.width + x) * 4 + 3] > 100) { sx += x; n++; }
      return n ? sx / n / out.width : 0.5;
    };
    const hgt = out.height, band = Math.max(2, Math.round(hgt * 0.05));
    ANCHORS[key] = { top: cxAt(1, band), bottom: cxAt(hgt - band - 1, hgt - 1) };
  }
}

/** 部品ごとの、上端・下端での脚の中心(0..1) */
export const ANCHORS: Record<string, { top: number; bottom: number }> = {};
