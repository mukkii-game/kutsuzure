// 一日の台本。歩数で進む。絵(bg)・時間帯(tod)・痛みの強さ(blister: 場面の始め→終わり)・友だちの状態。
export type SegKind = 'walk' | 'cafe' | 'cutscene' | 'barefoot' | 'end';
export type Tod = 'morning' | 'noon' | 'cafe' | 'evening' | 'dusk' | 'night';

export interface Segment {
  id: string;
  kind: SegKind;
  verse: 1 | 2 | 3;
  bg: string;
  tod: Tod;
  steps?: number;
  ms?: number;
  blister: [number, number];
  friend: 'none' | 'lead' | 'sync' | 'sit' | 'keep';
  friendStart?: number;
  waitSync?: boolean;
  amb?: string;
}

export const STORY: Segment[] = [
  { id: 'genkan', kind: 'walk', verse: 1, bg: 'genkan', tod: 'morning', steps: 6, blister: [0, 0], friend: 'none', amb: 'birds' },
  { id: 'street', kind: 'walk', verse: 1, bg: 'street_m', tod: 'morning', steps: 32, blister: [0, 0.35], friend: 'lead', friendStart: 4, amb: 'birds' },
  { id: 'shotengai', kind: 'walk', verse: 1, bg: 'shotengai', tod: 'noon', steps: 28, blister: [0.35, 0.75], friend: 'keep', amb: 'town' },
  { id: 'crosswalk', kind: 'walk', verse: 1, bg: 'crosswalk', tod: 'noon', steps: 16, blister: [0.75, 0.9], friend: 'keep', amb: 'town' },
  { id: 'cafe', kind: 'cafe', verse: 1, bg: 'cafe', tod: 'cafe', ms: 14000, blister: [0.9, 0.9], friend: 'sit', amb: 'cafe' },
  { id: 'evening', kind: 'walk', verse: 2, bg: 'street_e', tod: 'evening', steps: 30, blister: [1, 1], friend: 'lead', friendStart: 2, waitSync: true, amb: 'evening' },
  { id: 'together', kind: 'walk', verse: 2, bg: 'street_e2', tod: 'evening', steps: 22, blister: [1, 1], friend: 'sync', amb: 'evening' },
  { id: 'stairs', kind: 'cutscene', verse: 3, bg: 'stairs', tod: 'dusk', ms: 9000, blister: [0, 0], friend: 'sit', amb: 'river' },
  { id: 'barefoot', kind: 'barefoot', verse: 3, bg: 'grass', tod: 'dusk', steps: 34, blister: [0, 0], friend: 'sync', amb: 'river' },
  { id: 'home', kind: 'end', verse: 3, bg: 'genkan_n', tod: 'night', ms: 9000, blister: [0, 0], friend: 'none' },
];
