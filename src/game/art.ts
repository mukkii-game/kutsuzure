// 絵の置き場。AI 生成の絵(public/art/*.png)があればそれを、無ければコードで描いた仮の絵を使う。
// ファイル名は docs/asset-requests.md の番号と同じ。
import Phaser from 'phaser';
import type { Tod } from './story';

export const ART_FILES: Record<string, string> = {
  bg_genkan: 'bg01_genkan.png',
  bg_street_m: 'bg02_street_morning.png',
  bg_shotengai: 'bg03_shotengai.png',
  bg_crosswalk: 'bg04_crosswalk.png',
  bg_cafe: 'bg05_cafe_table.png',
  bg_street_e: 'bg06_street_evening.png',
  bg_street_e2: 'bg06_street_evening.png',
  bg_stairs: 'bg07_riverbank_stairs.png',
  bg_grass: 'bg08_riverbank_grass.png',
  bg_sky: 'bg09_sky.png',
  bg_genkan_n: 'bg10_genkan_night.png',
  sp_shoe_me: 'sp_shoe_mustard.png',
  sp_leg_me: 'sp_leg_me.png',
  sp_shoe_friend: 'sp_shoe_white.png',
  sp_leg_friend: 'sp_leg_friend.png',
  sp_bare_me: 'sp_barefoot.png',
  sp_bare_friend: 'sp_barefoot_friend.png',
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
