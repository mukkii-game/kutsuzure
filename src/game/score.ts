// 一歩一音の旋律(自作。原曲は使わない)。ハ長調のペンタトニック中心、4 歩で 1 和音。
// 1番は C–Am–F–G、2番は同じ旋律を Am–F–C–G の上で鳴らす(同じ形が少しずれて意味が変わる)。
const A1 = [64, 67, 69, 67, 64, 60, 62, 64, 69, 72, 69, 67, 64, 62, 64, 62];
const A2 = [67, 69, 72, 74, 76, 74, 72, 69, 72, 69, 67, 64, 62, 64, 62, 60];
export const MELODY = [...A1, ...A2];

// 和音の根音(MIDI)と構成音
const C = { root: 48, tones: [60, 64, 67] };
const Am = { root: 45, tones: [57, 60, 64] };
const F = { root: 41, tones: [57, 60, 65] };
const G = { root: 43, tones: [59, 62, 67] };
export const CHORDS_V1 = [C, Am, F, G];
export const CHORDS_V2 = [Am, F, C, G];

const SCALE = [0, 2, 4, 5, 7, 9, 11];
/** ハ長調の中で n 度上(n=2 で 3 度上) */
export function diatonicUp(midi: number, n: number): number {
  const oct = Math.floor(midi / 12), pc = midi % 12;
  let i = SCALE.indexOf(pc);
  if (i < 0) { i = SCALE.findIndex((s) => s > pc); if (i < 0) i = 0; }
  const j = i + n;
  return (oct + Math.floor(j / 7)) * 12 + SCALE[((j % 7) + 7) % 7];
}

export function noteAt(idx: number, verse: 1 | 2 | 3) {
  const i = (idx - 1) % MELODY.length;
  const chords = verse === 2 ? CHORDS_V2 : CHORDS_V1;
  const chord = chords[Math.floor(i / 4) % 4];
  const melody = MELODY[i] + (verse === 3 ? 12 : 0);
  return { melody, chord, beatInBar: i % 4 };
}
