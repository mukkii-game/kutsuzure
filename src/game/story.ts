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
  /** 場面の何歩目で何が起きるか(hold は足踏みで待つ ms) */
  beats?: { at: number; id: string; hold?: number }[];
}

export const STORY: Segment[] = [
  { id: 'genkan', kind: 'walk', verse: 1, bg: 'genkan', tod: 'morning', steps: 6, blister: [0, 0], friend: 'none', amb: 'morning_birds', beats: [{ at: 0, id: 'door' }] },
  { id: 'street', kind: 'walk', verse: 1, bg: 'street_m', tod: 'morning', steps: 26, blister: [0.4, 0.6], friend: 'lead', friendStart: 4, amb: 'morning_birds', beats: [{ at: 10, id: 'puddle' }, { at: 20, id: 'bike' }] },
  { id: 'shotengai', kind: 'walk', verse: 1, bg: 'shotengai', tod: 'noon', steps: 30, blister: [0.5, 0.8], friend: 'keep', amb: 'city_traffic', beats: [{ at: 2, id: 'shutter' }, { at: 18, id: 'bell' }] },
  { id: 'crosswalk', kind: 'walk', verse: 1, bg: 'crosswalk', tod: 'noon', steps: 22, blister: [0.8, 0.9], friend: 'keep', amb: 'city_traffic', beats: [{ at: 6, id: 'signal', hold: 5200 }] },
  { id: 'cafe', kind: 'cafe', verse: 1, bg: 'cafe', tod: 'cafe', ms: 14000, blister: [0.9, 0.9], friend: 'sit', amb: 'birds_light' },
  { id: 'evening', kind: 'walk', verse: 2, bg: 'street_e', tod: 'evening', steps: 40, blister: [1, 1], friend: 'lead', friendStart: 2, waitSync: true, amb: 'evening_outdoor', beats: [{ at: 4, id: 'crows' }] },
  { id: 'together', kind: 'walk', verse: 2, bg: 'street_e2', tod: 'evening', steps: 32, blister: [0.5, 0.25], friend: 'sync', amb: 'evening_outdoor', beats: [{ at: 12, id: 'photo' }] },
  { id: 'stairs', kind: 'cutscene', verse: 3, bg: 'stairs', tod: 'dusk', ms: 30000, blister: [0, 0], friend: 'sit', amb: 'river' },
  { id: 'barefoot', kind: 'barefoot', verse: 3, bg: 'grass', tod: 'dusk', steps: 44, blister: [0, 0], friend: 'sync', amb: 'river', beats: [{ at: 30, id: 'lookup' }] },
  { id: 'home', kind: 'end', verse: 3, bg: 'genkan_n', tod: 'night', ms: 600000, blister: [0, 0], friend: 'none', amb: 'night_crickets' },
];
