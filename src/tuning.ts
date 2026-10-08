// 調整つまみの一覧(唯一の置き場)。数値をコードに直書きせず、ここに名前・単位・狙いを付けて置く。
// ゲーム中に F2(スマホは画面左上を 3 回タップ)で調整パネルが開き、スライダー・数値・選択肢で直せる。
// パネルの「コピー」で今の値が JSON で取れる。AI に貼れば value を書き換えて既定値にできる。
// 読み方: import { tune } from './core/tuning'; tune('pain.threshold')
export type Knob =
  | { key: string; label: string; value: number; min: number; max: number; step: number; unit?: string; aim?: string }
  | { key: string; label: string; value: string; options: string[]; aim?: string }
  | { key: string; label: string; value: boolean; aim?: string };

export const KNOBS: Knob[] = [
  // ── 難しさ(痛み) ──
  { key: 'pain.threshold', label: '右に乗っていて痛くない時間', value: 260, min: 120, max: 600, step: 10, unit: 'ms', aim: '右を踏んだらすぐ左、で痛まない。ふつうに歩くと少しずつ痛む' },
  { key: 'pain.rate', label: '擦れの溜まる速さ', value: 1.3, min: 0.2, max: 5, step: 0.1, unit: '/秒', aim: 'ふつうに歩くと 4〜6 歩でズキッ' },
  { key: 'pain.after', label: 'ズキッの後に残る擦れ', value: 0.35, min: 0, max: 0.9, step: 0.05, aim: '続けて痛い感じ' },
  { key: 'pain.holdMax', label: '右で立ち止まって擦れる上限', value: 1200, min: 300, max: 3000, step: 100, unit: 'ms', aim: 'これより長く止まると体重を戻して擦れない' },
  // ── 手触り(リズム) ──
  { key: 'shuffle.on', label: 'シャッフルに入る長短比', value: 1.4, min: 1.1, max: 2.5, step: 0.05, aim: 'かばい歩きで伴奏が跳ね出す' },
  { key: 'shuffle.off', label: 'シャッフルが抜ける長短比', value: 1.2, min: 1.0, max: 2, step: 0.05 },
  { key: 'shuffle.need', label: 'シャッフルに入る連続回数', value: 2, min: 1, max: 6, step: 1, unit: '組' },
  { key: 'align.window', label: '友だちと揃った判定の幅', value: 110, min: 40, max: 250, step: 5, unit: 'ms', aim: '揃えると 3 度上のハモり' },
  { key: 'friend.pace', label: '友だちの歩く間隔', value: 520, min: 300, max: 900, step: 10, unit: 'ms' },
  { key: 'friend.follow', label: '友だちがこちらに寄る強さ', value: 0.12, min: 0, max: 0.6, step: 0.01, aim: '1番は置いていかない' },
  { key: 'friend.lock', label: '1番: 友だちが足並みを寄せる強さ', value: 0.35, min: 0, max: 1, step: 0.05, aim: '一定に歩けば揃える。揃えると痛い' },
  { key: 'friend.pace2', label: '2番: 友だちの歩く間隔(少し早足)', value: 430, min: 250, max: 800, step: 10, unit: 'ms', aim: 'かばうと少しずつ遅れる' },
  { key: 'limp.stride', label: 'かばった一歩の幅', value: 0.5, min: 0.2, max: 1, step: 0.05, unit: '歩', aim: 'かばうと痛くないが遅れる' },
  { key: 'pain.relief', label: 'かばった一歩で引く擦れ', value: 0.12, min: 0, max: 0.5, step: 0.01 },
  { key: 'v2.limpSteps', label: '2番: かばい続けると戻ってくる歩数', value: 10, min: 2, max: 20, step: 1, unit: '歩' },
  { key: 'v2.idleMs', label: '2番: 立ち止まると戻ってくる時間', value: 1200, min: 600, max: 6000, step: 100, unit: 'ms' },
  { key: 'look.idleMs', label: '止まると空を見上げるまで', value: 2000, min: 800, max: 5000, step: 100, unit: 'ms' },
  // ── 手応え(音と見た目) ──
  { key: 'feel.mode', label: '手触りの版', value: 'blend', options: ['blend', 'marimba', 'felt', 'minimal'], aim: 'blend=既定 / marimba=明るい / felt=しんみり / minimal=1番は足音だけ' },
  { key: 'snd.melody', label: '旋律の音量', value: 0.7, min: 0, max: 1.5, step: 0.05 },
  { key: 'snd.steps', label: '足音の音量', value: 0.6, min: 0, max: 1.5, step: 0.05 },
  { key: 'snd.amb', label: '環境音の音量', value: 0.35, min: 0, max: 1, step: 0.05 },
  { key: 'juice.zukiShake', label: 'ズキッの揺れ', value: 0.006, min: 0, max: 0.03, step: 0.001 },
  { key: 'walk.stride', label: '一歩の幅', value: 100, min: 20, max: 180, step: 1, unit: 'px' },
  { key: 'story.speed', label: '物語の長さ倍率', value: 1, min: 0.3, max: 2, step: 0.1, aim: '各場面の歩数にかける。確認用に短くできる' },
];
