// ゲームの中身(描画なし)。入力は step(foot) と update(dt) だけ。時刻はこのクラスが持つ論理時刻(ms)。
// 描画と音は events を読んで鳴らす/描く。bot は同じクラスを描画なしで回せる。
import { tune } from '../core/tuning';
import { STORY, Segment } from './story';

export type Foot = 'L' | 'R';

export type GameEvent =
  | { type: 'step'; foot: Foot; t: number; idx: number; aligned: boolean; synced: boolean; interval: number; heelRed: number }
  | { type: 'stumble'; foot: Foot }
  | { type: 'rub'; amount: number }
  | { type: 'zuki' }
  | { type: 'shuffle'; on: boolean }
  | { type: 'friendStep'; foot: Foot; t: number }
  | { type: 'friendGlance' }
  | { type: 'friendReturn' }
  | { type: 'friendSync' }
  | { type: 'segment'; seg: Segment; index: number }
  | { type: 'heelOut' }
  | { type: 'look'; up: boolean }
  | { type: 'end' };

export type FriendMode = 'none' | 'lead' | 'wait' | 'return' | 'sync' | 'sit';

export class Walk {
  t = 0;
  events: GameEvent[] = [];

  // 自分
  steps = 0; // 総歩数(旋律の位置)
  segSteps = 0; // 今の場面での歩数
  x = 0; // 進んだ距離(歩幅単位)
  lastFoot: Foot = 'R'; // 次は L から
  lastStepT = -1e9;
  lastRLandT = -1e9;
  lastLLandT = -1e9;
  rub = 0; // 0..1 擦れ
  pain = 0; // 0..1 見た目用(ズキッで 1、減衰)
  heelRed = 0; // 0..1 かかとの赤(累積)
  heelOut = false;
  shuffle = false;
  private shufCount = 0;
  private lr = 0; // L 着地 → R 着地
  private rl = 0; // R 着地 → L 着地
  limpRun = 0; // シャッフル中の連続歩数
  lookingUp = false;

  // 友だち
  friend = { mode: 'none' as FriendMode, x: 3, foot: 'R' as Foot, nextT: 0, interval: 520, facing: 1, glanceUntil: 0, lastT: -1e9 };
  synced = false;
  private returnT = 0;

  // 物語
  segIndex = 0;
  segT = 0; // 場面に入ってからの時間
  ended = false;

  constructor() { this.enter(0); }

  get seg(): Segment { return STORY[this.segIndex]; }
  get blister(): number {
    const s = this.seg;
    const k = Math.min(1, this.segSteps / Math.max(1, this.segLen()));
    return s.blister[0] + (s.blister[1] - s.blister[0]) * k;
  }
  get ratio(): number { return this.rl > 0 ? this.lr / this.rl : 1; }

  segLen() { return Math.round((this.seg.steps ?? 0) * tune('story.speed')); }

  private enter(i: number) {
    this.segIndex = i; this.segSteps = 0; this.segT = 0;
    const s = this.seg;
    if (s.friend === 'lead' && this.friend.mode !== 'lead') {
      if (this.friend.mode === 'none' || this.friend.mode === 'sit') this.friend.x = this.x + (s.friendStart ?? 3);
      this.friend.mode = 'lead';
      this.friend.facing = 1;
      this.friend.interval = tune('friend.pace');
      this.friend.nextT = this.t + 400;
      this.synced = false;
    } else if (s.friend === 'sync') {
      if (this.friend.mode !== 'sync') { this.friend.mode = 'sync'; this.synced = true; }
    } else if (s.friend === 'none') {
      this.friend.mode = 'none';
    } else if (s.friend === 'sit') {
      this.friend.mode = 'sit';
    }
    if (s.kind === 'barefoot') { this.rub = 0; this.pain = 0; }
    this.events.push({ type: 'segment', seg: s, index: i });
  }

  private next() {
    if (this.segIndex + 1 >= STORY.length) { if (!this.ended) { this.ended = true; this.events.push({ type: 'end' }); } return; }
    this.enter(this.segIndex + 1);
  }

  /** 踏む。歩けない場面では意味のある別の動作になる(喫茶店でかかとを抜く等) */
  step(foot: Foot) {
    if (this.ended) return;
    const s = this.seg;
    if (this.lookingUp) { this.lookingUp = false; this.events.push({ type: 'look', up: false }); }
    if (s.kind === 'cafe') {
      if (foot === 'R' && !this.heelOut && this.segT > 1200) { this.heelOut = true; this.rub = 0; this.pain = 0; this.events.push({ type: 'heelOut' }); }
      return;
    }
    if (s.kind === 'cutscene' || s.kind === 'end') return;
    if (foot === this.lastFoot) {
      // 同じ足を 2 回: 小さくよろけるだけ。罰はない
      this.events.push({ type: 'stumble', foot });
      return;
    }
    const t = this.t;
    const interval = t - this.lastStepT;
    if (foot === 'L') {
      this.rl = t - this.lastRLandT;
      this.lastLLandT = t;
      this.measureShuffle();
    } else {
      this.lr = t - this.lastLLandT;
      this.lastRLandT = t;
    }
    this.lastFoot = foot; this.lastStepT = t;
    this.steps++; this.segSteps++;
    this.x += 1;
    this.heelOut = false;

    // 友だちと揃ったか(1番)/合わせてくれているか(2番)
    let aligned = false;
    if (this.friend.mode === 'lead') {
      const d = Math.min(Math.abs(t - this.friend.lastT), Math.abs(this.friend.nextT - t));
      aligned = d < tune('align.window');
      if (s.verse === 1 && interval < 1200) {
        // 1番: 友だちの足は、こちらが一定に歩けば揃いにくる(位相を少し寄せる)
        const want = t + interval;
        const diff = want - this.friend.nextT;
        if (Math.abs(diff) < 260) this.friend.nextT += diff * tune('friend.lock');
      }
    }
    if (this.friend.mode === 'sync') {
      // 友だちはこちらと同じ瞬間に同じ足を出す
      this.friend.foot = foot; this.friend.x = Math.max(this.friend.x + 1, this.x + 0.9); this.friend.lastT = t;
      this.events.push({ type: 'friendStep', foot, t });
    }
    this.limpRun = this.shuffle ? this.limpRun + 1 : 0;
    this.events.push({ type: 'step', foot, t, idx: this.steps, aligned, synced: this.friend.mode === 'sync', interval, heelRed: this.heelRed });

    if (s.kind === 'walk' || s.kind === 'barefoot') {
      if (this.segSteps >= this.segLen() && this.canLeave()) this.next();
    }
  }

  private canLeave(): boolean {
    // 2番の帰り道は、友だちが戻ってくるまで終わらない(歩数が 1.6 倍を超えたら強制で戻ってくる)
    if (this.seg.waitSync && this.friend.mode !== 'sync') {
      if (this.segSteps > this.segLen() * 1.6) this.triggerReturn();
      return false;
    }
    return true;
  }

  private measureShuffle() {
    const r = this.ratio;
    const was = this.shuffle;
    if (!this.shuffle) {
      this.shufCount = r > tune('shuffle.on') ? this.shufCount + 1 : 0;
      if (this.shufCount >= tune('shuffle.need')) this.shuffle = true;
    } else {
      this.shufCount = r < tune('shuffle.off') ? this.shufCount + 1 : 0;
      if (this.shufCount >= 2) { this.shuffle = false; this.shufCount = 0; }
    }
    if (this.shuffle !== was) {
      this.shufCount = 0;
      this.events.push({ type: 'shuffle', on: this.shuffle });
      if (this.shuffle && this.friend.mode === 'lead' && this.seg.verse === 1) this.glance();
    }
  }

  private glance() {
    if (this.t < this.friend.glanceUntil + 1500) return;
    this.friend.glanceUntil = this.t + 700;
    this.events.push({ type: 'friendGlance' });
  }

  private triggerReturn() {
    if (this.friend.mode === 'return' || this.friend.mode === 'sync') return;
    this.friend.mode = 'return'; this.friend.facing = -1; this.returnT = this.t;
    this.events.push({ type: 'friendReturn' });
  }

  update(dt: number) {
    if (this.ended) return;
    this.t += dt; this.segT += dt;
    const s = this.seg;
    const t = this.t;

    // 痛み: 右に体重が乗っている時間で擦れが溜まる
    const walking = s.kind === 'walk';
    if (walking && this.lastFoot === 'R' && !this.heelOut) {
      const d = t - this.lastRLandT;
      const thr = tune('pain.threshold');
      if (d > thr && d < thr + tune('pain.holdMax')) {
        const add = (dt / 1000) * tune('pain.rate') * this.blister;
        if (add > 0) {
          this.rub += add;
          this.heelRed = Math.min(1, this.heelRed + add * 0.08);
          this.events.push({ type: 'rub', amount: this.rub });
        }
        if (this.rub >= 1) {
          this.rub = tune('pain.after'); this.pain = 1;
          this.events.push({ type: 'zuki' });
          if (this.friend.mode === 'lead' && s.verse === 1) this.glance();
        }
      }
    }
    this.pain = Math.max(0, this.pain - dt / 900);

    // 立ち止まると見上げる
    if ((walking || s.kind === 'barefoot') && !this.lookingUp && t - this.lastStepT > tune('look.idleMs') && this.segT > 1500) {
      this.lookingUp = true; this.events.push({ type: 'look', up: true });
    }

    // 友だち
    const f = this.friend;
    if (f.mode === 'lead') {
      if (s.verse === 1) {
        // 1番: こちらの速さにゆるく寄り、離れすぎない
        const myInt = Math.max(250, Math.min(1200, t - this.lastStepT < 1500 ? (this.lr + this.rl) / 2 || f.interval : f.interval));
        f.interval += (myInt - f.interval) * tune('friend.follow') * (dt / 500);
        const dist = f.x - this.x;
        if (dist > 5) f.nextT = Math.max(f.nextT, t + 30); // 待つ
        else if (t >= f.nextT) this.friendStep(dist < 2 ? f.interval * 0.9 : dist > 3.5 ? f.interval * 1.25 : f.interval);
      } else {
        // 2番: 一定の歩調。離れても上限で待つ。かばい続けるか止まると戻ってくる
        const dist = f.x - this.x;
        if (dist > 6) { f.nextT = Math.max(f.nextT, t + 30); f.facing = -1; } else f.facing = 1;
        if (dist <= 6 && t >= f.nextT) this.friendStep(tune('friend.pace'));
        if (this.segSteps > 6 && (this.limpRun >= tune('v2.limpSteps') || t - this.lastStepT > tune('v2.idleMs'))) this.triggerReturn();
      }
    } else if (f.mode === 'return') {
      const target = this.x + 1.0;
      f.x += (target - f.x) * Math.min(1, dt / 350);
      if (t >= f.nextT) { f.foot = f.foot === 'L' ? 'R' : 'L'; f.nextT = t + 260; this.events.push({ type: 'friendStep', foot: f.foot, t }); }
      if (Math.abs(f.x - target) < 0.6 || this.t - this.returnT > 1800) { f.mode = 'sync'; f.facing = 1; this.synced = true; this.events.push({ type: 'friendSync' }); }
    }

    // 歩かない場面
    if (s.kind === 'cafe') {
      if ((this.heelOut && this.segT > 4500) || this.segT > (s.ms ?? 12000)) this.next();
    } else if (s.kind === 'cutscene' || s.kind === 'end') {
      if (this.segT > (s.ms ?? 5000)) this.next();
    }
  }

  private friendStep(nextInterval: number) {
    const f = this.friend;
    f.foot = f.foot === 'L' ? 'R' : 'L';
    f.x += 1; f.lastT = this.t; f.nextT = this.t + nextInterval;
    this.events.push({ type: 'friendStep', foot: f.foot, t: this.t });
  }

  drain(): GameEvent[] { const e = this.events; this.events = []; return e; }

  /** AI・bot 向けの状態(短く) */
  describe() {
    return {
      seg: this.seg.id, segSteps: this.segSteps, segLen: this.segLen(), steps: this.steps,
      next: this.lastFoot === 'L' ? 'R' : 'L', rub: +this.rub.toFixed(2), blister: +this.blister.toFixed(2),
      shuffle: this.shuffle, ratio: +this.ratio.toFixed(2), friend: this.friend.mode, friendDist: +(this.friend.x - this.x).toFixed(1),
      lookingUp: this.lookingUp, ended: this.ended,
    };
  }
}
