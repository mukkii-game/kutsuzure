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
  morning: { sky: [0xbfe0f2, 0xf6efe0], wall: 0xd9d2c3, wall2: 0xc6bba5, ground: 0x9ea3a6, line: 0x2f3a56, light: 0xfff6dc, paper: 0xf4ecdc },
  noon: { sky: [0xcfe6f0, 0xf8f3e6], wall: 0xe3d9c4, wall2: 0xb9ad96, ground: 0xb0aea8, line: 0x2f3a56, light: 0xffffff, paper: 0xf6f0e2 },
  cafe: { sky: [0xe8d2b0, 0xf2e2c4], wall: 0x8a6a4c, wall2: 0x6e5038, ground: 0xb08458, line: 0x3a2a1e, light: 0xffe2a8, paper: 0xf1e3c8 },
  evening: { sky: [0xf2b27a, 0xf7dcb4], wall: 0xc9a68a, wall2: 0xa98670, ground: 0x8f8584, line: 0x3b2c3e, light: 0xffc98a, paper: 0xf3e0c6 },
  dusk: { sky: [0x7d8fc4, 0xf4b68c], wall: 0x8c8aa6, wall2: 0x6e7094, ground: 0x7c8a6a, line: 0x2a2840, light: 0xffd0a0, paper: 0xe9dccb },
  night: { sky: [0x1d2440, 0x3a3f66], wall: 0x3a3e5c, wall2: 0x2c2f48, ground: 0x4a4a5a, line: 0x0f1224, light: 0xffd79a, paper: 0x2a2a3a },
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
