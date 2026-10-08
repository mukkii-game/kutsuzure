// 本編。足首の高さのカメラで、一日を歩く。中身は game/walk.ts、ここは描画と音だけ。
import Phaser from 'phaser';
import { Walk, Foot, GameEvent } from '../game/walk';
import { STORY, Segment } from '../game/story';
import { noteAt, diatonicUp } from '../game/score';
import * as snd from '../game/sound';
import { PAL, makePaperTexture, makeBlotTexture, hasTex } from '../game/art';
import { tune } from '../core/tuning';
import { expose, DemoDriver } from '../core/demo';
import { describe, action, clearActions } from '../core/probe';
import { Recorder, Player, replayFromUrl } from '../core/replay';
import { query } from '../core/meta';
import { setFootHandler, debugCounts } from '../game/input-hub';
import { t, lang } from '../core/i18n';

const W = 960, H = 540, GY = 452; // 地面の高さ
const TICK = 1000 / 60;

interface FootAnim { from: number; to: number; t0: number; lift: number }
interface Rig { L: FootAnim; R: FootAnim; facing: number; kind: 'me' | 'friend' }

export class WalkScene extends Phaser.Scene {
  private w!: Walk;
  private acc = 0;
  private frame = 0;
  private queue: Foot[] = [];
  private rec!: Recorder;
  private player: Player | null = null;
  private now = 0; // 描画用の時刻(ms)

  private me!: Rig; private fr!: Rig;
  private gBg!: Phaser.GameObjects.Graphics;
  private gGround!: Phaser.GameObjects.Graphics;
  private gLegs!: Phaser.GameObjects.Graphics;
  private gSky!: Phaser.GameObjects.Graphics;
  private gOver!: Phaser.GameObjects.Graphics;
  private bgImg?: Phaser.GameObjects.Image;
  private bgImgOld?: Phaser.GameObjects.Image;
  private skyImg?: Phaser.GameObjects.Image;
  private stains!: Phaser.GameObjects.Container;
  private paper!: Phaser.GameObjects.TileSprite;
  private dbg?: Phaser.GameObjects.Text;
  private titleText?: Phaser.GameObjects.Text;
  private hintL?: Phaser.GameObjects.Text; private hintR?: Phaser.GameObjects.Text;
  private camX = 0; private lookY = 0; private lookTarget = 0;
  private segStartX = 0;
  private lastVoice: snd.Voice | null = null;
  private shuffleGlow = 0; private harmonyGlow = 0;
  private flash = 0;
  private cafeHeel = 0;
  private endPhase = 0;
  private demo!: DemoDriver;
  private glanceUntil = 0;
  private propsSeed = 1;
  private photos: string[] = [];
  private lookStart = 0; private lookShot = false;
  private bike = -1; private holdOn = false; private signalTimer?: Phaser.Time.TimerEvent;
  private bigPuddleX = -9999;
  private cleanFrames = 0;
  private zukiPhotoSeg = new Set<number>();
  private legSprites = new Map<string, { thigh: Phaser.GameObjects.Image; shin: Phaser.GameObjects.Image; shoe: Phaser.GameObjects.Image }>();
  private gFx!: Phaser.GameObjects.Graphics;
  private stumbleAt = -1e9;
  private morningAt = 1e9;
  private lastStepAt = -1e9; private lastStepFoot: Foot = 'R';
  private hintSteps = 0; // ズキッの後、何歩のあいだ「すぐ左」を光らせるか

  constructor() { super('Walk'); }

  create() {
    expose('scene', 'Walk');
    this.w = new Walk();
    const jump = Number(query.get('seg'));
    if (jump > 0) this.w.jumpTo(jump);
    this.acc = 0; this.frame = 0; this.queue = []; this.now = 0;
    this.rec = new Recorder(1);
    const r = replayFromUrl(); this.player = r ? new Player(r) : null;
    const mk = (kind: 'me' | 'friend', x: number): Rig => ({ L: { from: x - 23, to: x - 23, t0: -1e9, lift: 14 }, R: { from: x + 23, to: x + 23, t0: -1e9, lift: 14 }, facing: 1, kind });
    this.me = mk('me', 0); this.fr = mk('friend', -9999);
    this.camX = 0; this.lookY = 0; this.lookTarget = 0; this.endPhase = 0; this.cafeHeel = 0;
    this.photos = []; this.morningAt = 1e9; this.zukiPhotoSeg = new Set(); this.cameras.main.setZoom(1); this.bike = -1; this.holdOn = false; this.bigPuddleX = -9999;

    makePaperTexture(this);
    makeBlotTexture(this, 'blotRed', 'rgba(196,48,52,1)', 40);
    makeBlotTexture(this, 'blotLight', 'rgba(255,240,200,1)', 64);

    this.gSky = this.add.graphics().setScrollFactor(0).setDepth(-20);
    this.gBg = this.add.graphics().setScrollFactor(0);
    this.gGround = this.add.graphics().setScrollFactor(0);
    this.stains = this.add.container(0, 0);
    this.gLegs = this.add.graphics().setScrollFactor(0);
    this.gOver = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.gFx = this.add.graphics().setScrollFactor(0).setDepth(20);
    this.legSprites = new Map();
    this.paper = this.add.tileSprite(W / 2, H / 2, W, H, 'paper').setScrollFactor(0).setDepth(60).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0.3);

    // タイトル(玄関で最初の一歩まで)
    this.titleText = this.add.text(W * 0.74, H * 0.22, t('title'), { fontFamily: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif', fontSize: '56px', color: '#2a2522' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0).setAngle(-3);
    if (this.w.segIndex === 0) this.tweens.add({ targets: this.titleText, alpha: 0.85, duration: 1800, delay: 300 });
    const keyHint = !this.sys.game.device.input.touch;
    this.hintL = this.add.text(W * 0.25, H * 0.62, keyHint ? 'F / ←' : '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#2f3a56' }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
    this.hintR = this.add.text(W * 0.75, H * 0.62, keyHint ? 'J / →' : '', { fontFamily: 'sans-serif', fontSize: '16px', color: '#2f3a56' }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
    if (this.w.segIndex === 0) this.tweens.add({ targets: [this.hintL, this.hintR], alpha: 0.5, duration: 1200, delay: 2500 });

    if (query.has('debug')) this.dbg = this.add.text(8, 8, '', { fontFamily: 'monospace', fontSize: '12px', color: '#000', backgroundColor: '#ffffffaa' }).setScrollFactor(0).setDepth(99);
    this.add.text(W - 6, H - 4, `build ${expose.length ? '' : ''}${(window as any).__BUILD_ID__ ?? ''}`, { fontFamily: 'monospace', fontSize: '9px', color: '#00000044' }).setOrigin(1, 1).setScrollFactor(0).setDepth(99);

    setFootHandler((f) => this.queue.push(f));

    // 自動プレイ: かばい歩き(右の後すぐ左)を基本に、2番では崩したまま歩く
    let nextAt = 600; let foot: Foot = 'L';
    this.demo = new DemoDriver((tt) => {
      if (tt < nextAt) return;
      const seg = this.w.seg;
      if (seg.kind === 'cafe' || seg.kind === 'cutscene') { this.queue.push('R'); nextAt = tt + 2000; return; }
      this.queue.push(foot);
      const limp = this.w.blister > 0.2;
      nextAt = tt + (foot === 'R' ? (limp ? 170 : 300) : (limp ? 520 : 300));
      foot = foot === 'L' ? 'R' : 'L';
    });

    clearActions();
    describe(() => this.w.describe());
    action('step', (f: string) => { if (f !== 'L' && f !== 'R') return 'step(foot): foot は "L" か "R"'; this.queue.push(f); });
    action('wait', () => { /* 何もしない(止まる) */ });
    this.events.once('shutdown', clearActions);

    this.enterSegment(this.w.seg);
    this.layoutGround();
  }

  // ───────── 進行 ─────────
  update(_time: number, deltaMs: number) {
    const dt = Math.min(100, deltaMs);
    this.now += dt;
    this.demo.update(dt);
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK; this.frame++;
      let inputs: Foot[] = [];
      if (this.player) inputs = this.player.input(this.frame).split('').filter((c) => c === 'L' || c === 'R') as Foot[];
      else { inputs = this.queue; this.queue = []; }
      for (const f of inputs) { this.rec.push(this.frame, f); this.w.step(f); }
      this.w.update(TICK);
      for (const e of this.w.drain()) this.onEvent(e);
    }
    expose('score', this.w.steps + (this.w.ended ? 1000 : 0));
    expose('recording', this.rec.toString());
    this.render();
  }

  private onEvent(e: GameEvent) {
    const seg = this.w.seg;
    const mode = tune<string>('feel.mode');
    switch (e.type) {
      case 'step': {
        this.animFoot(this.me, e.foot, this.w.x * tune('walk.stride'));
        this.lastStepAt = this.now; this.lastStepFoot = e.foot;
        if (this.hintSteps > 0) this.hintSteps--;
        this.fadeTitle();
        const surface = seg.kind === 'barefoot' ? 'soft' : seg.bg === 'genkan' ? 'wood' : seg.bg === 'shotengai' ? 'subway' : 'boot';
        snd.footstep(surface, e.foot, seg.kind === 'barefoot' ? 0.8 : 1);
        const n = noteAt(e.idx, seg.verse);
        const minimal = mode === 'minimal' && seg.verse === 1;
        const famR = mode === 'marimba' ? 'marimba' : 'piano';
        const famL = mode === 'felt' ? 'piano' : 'marimba';
        const fam = e.foot === 'R' ? famR : famL;
        const cents = e.foot === 'R' && seg.kind === 'walk' ? -30 * this.w.blister : 0;
        this.lastVoice?.release();
        if (!minimal) this.lastVoice = snd.note(fam, n.melody, e.foot === 'R' ? 0.55 : 0.5, { cents });
        if (e.foot === 'L') {
          snd.note('pizz', n.chord.root + 12, minimal ? 0.25 : 0.45, { dur: 0.5, wet: 0.4 });
          if (mode !== 'felt') snd.play('brush', 0.18 * tune('snd.steps'));
        }
        if (this.w.shuffle && !minimal) {
          snd.play('shaker', 0.22) || snd.note('perc', 90, 0.15, { dur: 0.08 });
          if (e.foot === 'R') snd.note('pizz', n.chord.tones[2], 0.35, { dur: 0.3 });
        }
        if (e.aligned || e.synced) {
          snd.note('glock', diatonicUp(n.melody, 2) + (e.synced ? 0 : 12), e.synced ? 0.4 : 0.45, { dur: 0.9 });
          this.harmonyGlow = 1;
        }
        if (e.synced && e.foot === 'L' && n.beatInBar === 0) snd.note('glock', n.chord.tones[1] + 12, 0.3, { dur: 1.2 });
        if (e.foot === 'R' && seg.kind === 'walk' && this.w.blister > 0.15) snd.squeak(this.w.blister);
        if (seg.verse === 3) this.harmonyGlow = 1;
        if ((this.w.shuffle || e.synced || seg.verse === 3) && !minimal) this.doodle(e.foot, e.synced || seg.verse === 3 ? '♫' : '♪');
        break;
      }
      case 'stumble':
        this.stumbleAt = this.now;
        this.cameras.main.shake(80, 0.002);
        snd.footstep('concrete', e.foot, 0.4);
        break;
      case 'zuki': {
        snd.zuki();
        if (seg.verse === 1) this.hintSteps = 8;
        this.cameras.main.shake(160, tune<number>('juice.zukiShake'));
        this.flash = 1;
        if (navigator.vibrate) try { navigator.vibrate(14); } catch { /* */ }
        const heel = this.me.R.to - 22 + this.camOffset();
        const b = this.add.image(heel - this.camOffset() + (Math.sin(this.now) * 6), GY - 6, 'blotRed').setScale(0.25).setAlpha(0.55);
        this.stains.add(b);
        this.tweens.add({ targets: b, scale: 0.5 + this.w.heelRed * 0.4, alpha: 0, duration: 2600, ease: 'Sine.Out', onComplete: () => b.destroy() });
        if (!this.zukiPhotoSeg.has(this.w.segIndex)) { this.zukiPhotoSeg.add(this.w.segIndex); this.time.delayedCall(450, () => this.takePhoto(false)); }
        break;
      }
      case 'shuffle':
        if (e.on) this.shuffleGlow = 1;
        break;
      case 'friendStep': {
        const fx = this.w.friend.x * tune('walk.stride');
        this.animFoot(this.fr, e.foot, fx);
        if (this.w.friend.mode !== 'sync') snd.footstep(seg.kind === 'barefoot' ? 'soft' : 'concrete', e.foot, 0.35);
        else snd.footstep(seg.kind === 'barefoot' ? 'grass' : 'concrete', e.foot, 0.25);
        break;
      }
      case 'friendGlance': this.glanceUntil = this.now + 700; break;
      case 'friendReturn': break;
      case 'friendSync':
        this.time.delayedCall(1600, () => this.takePhoto(false));
        snd.note('glock', 79, 0.4, { dur: 1.5 }); snd.note('glock', 84, 0.3, { dur: 1.5, when: (snd.ac()?.currentTime ?? 0) + 0.18 });
        break;
      case 'segment': this.enterSegment(e.seg); break;
      case 'heelOut':
        this.tweens.add({ targets: this, cafeHeel: 1, duration: 500, ease: 'Sine.Out' });
        snd.footstep('wood', 'R', 0.3);
        snd.note('piano', 72, 0.35, { dur: 1.5 }); snd.note('piano', 76, 0.3, { dur: 1.5, when: (snd.ac()?.currentTime ?? 0) + 0.25 });
        break;
      case 'look':
        this.lookTarget = e.up ? 1 : 0;
        this.lookStart = this.now; this.lookShot = false;
        snd.muffle(e.up && seg.verse !== 3);
        break;
      case 'beat': this.onBeat(e.id); break;
      case 'hold':
        this.holdOn = e.on;
        if (e.on) {
          let k = 0;
          this.signalTimer = this.time.addEvent({ delay: 330, repeat: 14, callback: () => { snd.note('glock', k++ % 2 ? 84 : 88, 0.16, { dur: 0.2, wet: 0.2 }); } });
        } else this.signalTimer?.remove();
        break;
      case 'end': break;
      case 'shoesOff': this.onShoesOff(); break;
      case 'relief': snd.breath(); break;
    }
  }

  private camOffset() { return this.camX; }

  /** 足もとから、手描きの音符がぽんと出る */
  private doodle(foot: Foot, ch: string) {
    const fx = this.footPos(this.me[foot]) - this.camX;
    const t = this.add.text(fx + (foot === 'R' ? 14 : -10), GY - 70, ch, { fontFamily: 'serif', fontSize: foot === 'R' ? '26px' : '20px', color: '#2a2522' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(40).setAngle(foot === 'R' ? 12 : -10).setAlpha(0.9);
    this.tweens.add({ targets: t, y: t.y - 60, x: t.x + (foot === 'R' ? 18 : -12), alpha: 0, angle: t.angle * 2, duration: 1100, ease: 'Sine.Out', onComplete: () => t.destroy() });
  }

  private onBeat(id: string) {
    const stride = tune('walk.stride');
    switch (id) {
      case 'door': this.time.delayedCall(400, () => snd.play('door_open', 0.5)); break;
      case 'puddle': this.bigPuddleX = (this.w.x + 3) * stride; this.time.delayedCall(1800, () => this.takePhoto(false)); break;
      case 'bike': this.bike = this.now; this.time.delayedCall(300, () => snd.play('bell_ding', 0.35, 1, 0.4)); this.time.delayedCall(700, () => this.takePhoto(false)); break;
      case 'shutter': snd.play('door_creak', 0.25); break;
      case 'bell': snd.play('bell_ding', 0.3, 1.1, -0.3); break;
      case 'photo': this.takePhoto(true); break;
      case 'lookup': this.lookTarget = 1; this.lookStart = this.now; this.lookShot = false; this.time.delayedCall(5200, () => { if (this.w.seg.kind === 'barefoot') this.lookTarget = 0; }); break;
    }
  }

  /** 今の画面を 1 枚の写真として残す(最後に並べる) */
  private takePhoto(flash = true) {
    if (this.photos.length >= 8) return;
    if (flash) { snd.play('camera_shutter', 0.45); this.time.delayedCall(60, () => { this.flash = 0.8; }); }
    this.cleanFrames = 2;
    this.game.renderer.snapshot((img) => {
      if (!(img instanceof HTMLImageElement)) return;
      const key = `photo${this.photos.length}_${Math.floor(this.now)}`;
      const add = () => { if (!this.textures.exists(key)) { this.textures.addImage(key, img); this.photos.push(key); } };
      if (img.complete) add(); else img.onload = add;
    });
  }

  private fadeTitle() {
    if (this.titleText && this.titleText.alpha > 0 && this.w.steps >= 1) {
      this.tweens.add({ targets: [this.titleText, this.hintL, this.hintR], alpha: 0, duration: 1600 });
    }
  }

  private animFoot(rig: Rig, foot: Foot, bodyX: number) {
    const a = rig[foot];
    const cur = this.footPos(a);
    a.from = cur; a.to = bodyX + tune('walk.stride') * 0.5; a.t0 = this.now;
    const other = rig[foot === 'L' ? 'R' : 'L'];
    if (Math.abs(this.footPos(other) - bodyX) > tune('walk.stride') * 3) { other.from = other.to = bodyX - tune('walk.stride') * 0.5; }
  }

  private footPos(a: FootAnim) {
    const k = Phaser.Math.Clamp((this.now - a.t0) / 120, 0, 1);
    return a.from + (a.to - a.from) * Phaser.Math.Easing.Sine.InOut(k);
  }
  private footLift(a: FootAnim) {
    const k = Phaser.Math.Clamp((this.now - a.t0) / 120, 0, 1);
    return Math.sin(Math.PI * k) * a.lift;
  }

  private enterSegment(seg: Segment) {
    snd.ambience(seg.amb);
    this.segStartX = this.w.x * tune('walk.stride');
    // 背景の絵(あれば)をクロスフェード
    const key = `bg_${seg.bg}`;
    if (this.bgImg) { this.bgImgOld?.destroy(); this.bgImgOld = this.bgImg; this.tweens.add({ targets: this.bgImgOld, alpha: 0, duration: 1500 }); this.bgImg = undefined; }
    if (hasTex(this, key)) {
      const img = this.add.image(0, H, key).setOrigin(0, 1).setScrollFactor(0).setDepth(-10).setAlpha(0);
      const moving = seg.kind === 'walk' || seg.kind === 'barefoot';
      const s = Math.max((W * (moving ? 1.35 : 1.02)) / img.width, H / img.height); img.setScale(s);
      this.tweens.add({ targets: img, alpha: 1, duration: 1500 });
      this.bgImg = img;
    }
    if (seg.kind === 'barefoot') snd.music('m1_barefoot.mp3', 0.45);
    if (seg.kind === 'end') snd.music(null);
    if (seg.kind === 'cafe' || seg.kind === 'cutscene' || seg.kind === 'end') this.lookTarget = 0;
    if (seg.kind === 'cafe') {
      this.time.delayedCall(2600, () => { snd.play('cup_on_table', 0.4); });
      this.time.delayedCall(5200, () => { snd.play('fork_on_dish', 0.35); this.takePhoto(); });
      this.time.delayedCall(8200, () => snd.play('glass_clink', 0.25));
    }
    this.propsSeed = STORY.indexOf(seg) * 97 + 13;
    if (seg.kind === 'end') this.time.delayedCall(10, () => this.endSequence());
    if (seg.kind === 'cutscene') this.stairsSequence();
    if (seg.kind === 'barefoot') { this.stains.removeAll(true); }
  }

  private layoutGround() { /* 地面は render で毎フレーム描く */ }

  // ───────── 描画 ─────────
  private render() {
    const seg = this.w.seg;
    const stride = tune('walk.stride');
    const meX = this.w.x * stride;
    const fixed = seg.kind === 'cafe' || seg.kind === 'cutscene' || seg.kind === 'end';
    if (!fixed) this.camX += (meX - W * 0.38 - this.camX) * 0.08;
    this.lookY += (this.lookTarget - this.lookY) * 0.04;
    if (this.lookTarget === 1 && !this.lookShot && this.now - this.lookStart > 1500 && this.lookY > 0.9) { this.lookShot = true; this.takePhoto(); }
    const pal = PAL[seg.tod];
    const lift = this.lookY * 380; // 見上げると世界が下へ

    this.drawSky(pal, lift, seg);
    this.drawBackground(pal, lift, seg);
    this.stains.x = -this.camX; this.stains.y = lift;
    if (this.bgImg) {
      // 場面の進み具合に合わせて、遠景がゆっくり流れる
      const k = Phaser.Math.Clamp(this.w.segSteps / Math.max(1, this.w.segLen()), 0, 1);
      const span = Math.max(0, this.bgImg.displayWidth - W);
      const tx = -span * k;
      this.bgImg.x += (tx - this.bgImg.x) * 0.05;
      this.bgImg.y = H + lift;
    }

    const g = this.gLegs; g.clear(); this.gFx.clear();
    for (const sp of this.legSprites.values()) { sp.thigh.setVisible(false); sp.shin.setVisible(false); sp.shoe.setVisible(false); }
    const off = -this.camX;
    this.gGround && this.drawExtras(this.gGround, pal, lift);
    if (seg.kind === 'cafe') this.drawCafe(g, pal, lift);
    else if (seg.kind === 'cutscene') this.drawStairs(g, pal, lift);
    else if (seg.kind === 'end') this.drawEnd(g, pal, lift);
    else {
      const bare = seg.kind === 'barefoot';
      if (this.w.friend.mode !== 'none') {
        let facing = this.w.friend.facing;
        if (this.now < this.glanceUntil) facing = -1;
        this.drawRig(g, this.fr, off, lift, facing, bare, pal);
      }
      // ふたりで揺れる(シャッフル中は弾む)
      this.drawRig(g, this.me, off, lift, 1, bare, pal);
      this.drawToeHints(g, off, lift, pal);
    }

    // 痛み・ハモりの光
    const o = this.gOver; o.clear();
    this.flash *= 0.9; this.harmonyGlow *= 0.93; this.shuffleGlow *= 0.97;
    if (this.flash > 0.02) { o.fillStyle(0xffffff, this.flash * 0.35); o.fillRect(0, 0, W, H); }
    const pain = this.w.pain;
    if ((pain > 0.02 || this.w.rub > 0.4) && this.cleanFrames <= 0) {
      const a = Math.max(pain * 0.35, (this.w.rub - 0.4) * 0.25);
      o.fillStyle(0x7a1c22, a * 0.5); o.fillRect(0, 0, W, 18); o.fillRect(0, H - 18, W, 18);
    }
    if (this.harmonyGlow > 0.02 && !fixed) {
      const fx = (this.w.friend.x * stride + meX) / 2 - this.camX;
      o.fillStyle(pal.light, this.harmonyGlow * 0.07); o.fillCircle(fx, GY - 40 + lift, 60 + 40 * this.harmonyGlow); o.fillStyle(pal.light, this.harmonyGlow * 0.07); o.fillCircle(fx, GY - 40 + lift, 30 + 20 * this.harmonyGlow);
    }
    // 見上げた時: まぶたと、にじみ
    if (this.lookY > 0.05 && this.cleanFrames <= 0) this.drawLookOverlay(o, seg);
    if (this.cleanFrames > 0) this.cleanFrames--;
    this.paper.tilePositionX = this.camX * 0.3;

    if (this.dbg) {
      const d = this.w.describe();
      this.dbg.setText(`ptr ${debugCounts.pointer} touch ${debugCounts.touch} key ${debugCounts.key} used ${debugCounts.used}\n${JSON.stringify(d)}\naudio ${snd.isLoaded() ? snd.families().join(',') : 'synth'} ctx ${snd.ac()?.state ?? '-'}`);
    }
  }

  private drawSky(pal: (typeof PAL)['morning'], lift: number, seg: Segment) {
    const g = this.gSky; g.clear();
    // 空は地面の上に広がる(見上げると見える)
    const top = -420 + lift, bottom = GY - 120 + lift;
    g.fillGradientStyle(pal.sky[0], pal.sky[0], pal.sky[1], pal.sky[1], 1);
    g.fillRect(0, Math.min(0, top), W, bottom - Math.min(0, top) + 10);
    if (this.lookY > 0.02) {
      // 雲(にじんだ楕円)
      for (let i = 0; i < 6; i++) {
        const cx = ((i * 211 + 80) % (W + 200)) - 100 - (this.camX * 0.02 % 200);
        const cy = top + 120 + (i % 3) * 70;
        g.fillStyle(0xffffff, 0.55); g.fillEllipse(cx, cy, 220, 60); g.fillEllipse(cx + 60, cy - 18, 150, 50);
      }
      if (seg.verse === 3) {
        // 端に、本当に降っている雨雲が一つだけ
        g.fillStyle(0x6d7488, 0.7); g.fillEllipse(W - 120, top + 110, 170, 54);
        g.lineStyle(1, 0x6d7488, 0.5);
        for (let i = 0; i < 9; i++) { const x = W - 180 + i * 13; g.lineBetween(x, top + 130, x - 6, top + 230); }
      }
    }
    if (this.skyImg) this.skyImg.y = top + 200;
  }

  private drawBackground(pal: (typeof PAL)['morning'], lift: number, seg: Segment) {
    const g = this.gBg; g.clear();
    const gr = this.gGround; gr.clear();
    const hasImg = !!this.bgImg;
    const cx = this.camX;
    const indoor = seg.kind === 'cafe' || seg.kind === 'cutscene' || seg.kind === 'end';
    if (!hasImg && !indoor) {
      // 遠景: 線数本で場所が分かる程度(パララックス 0.5)
      const INK = 0x2a2522;
      const par = 0.5, unit = 200;
      const start = Math.floor((cx * par) / unit) - 1;
      for (let i = start; i < start + W / unit + 3; i++) {
        const x = i * unit - cx * par;
        const r = ((i * 7919 + this.propsSeed) >>> 0) % 97;
        const kind = r % 6;
        const by = GY + lift;
        if (seg.bg === 'genkan') {
          // 玄関: 上がりかまち、引き戸、たたみかけの傘
          if (i === start) {
            g.fillStyle(0xefe6d4, 1); g.fillRect(0, 0, W, by);
            g.fillStyle(0xd9c6a2, 1); g.fillRect(0, by - 70, W * 0.3, 70);
            g.lineStyle(3, INK, 1); g.strokeRect(-4, by - 70, W * 0.3, 70);
            g.fillStyle(0xfdf8ea, 1); g.fillRect(W * 0.55, 40 + lift, 260, by - 40 - lift);
            g.lineStyle(3, INK, 1); g.strokeRect(W * 0.55, 40 + lift, 260, by - 40 - lift);
            g.lineStyle(2, INK, 0.7); for (let k = 1; k < 4; k++) g.lineBetween(W * 0.55 + k * 65, 40 + lift, W * 0.55 + k * 65, by);
            g.fillStyle(0xfff6c8, 0.7); g.fillPoints(<any>[{ x: W * 0.55 + 140, y: by }, { x: W * 0.55 + 260, y: by }, { x: W * 0.55 + 330, y: H }, { x: W * 0.55 + 160, y: H }], true);
            g.fillStyle(0x7fb0d8, 1); g.fillRect(W * 0.48, by - 150, 10, 150); g.lineStyle(2.5, INK, 1); g.strokeRect(W * 0.48, by - 150, 10, 150);
          }
        } else if (seg.bg.startsWith('street')) {
          // ブロック塀(低い)と、ときどき電柱・植木鉢・木
          const h = 120 + (r % 3) * 10;
          g.fillStyle(pal.wall, 1); g.fillRect(x, by - h, unit + 1, h);
          g.lineStyle(3, INK, 1); g.strokePoints(<any>this.wob([{ x, y: by - h }, { x: x + unit, y: by - h + 2 }], i * 7, 1.2), false);
          g.lineStyle(1.5, INK, 0.5);
          for (let yy = by - h + 30; yy < by; yy += 30) g.lineBetween(x, yy, x + unit, yy);
          let row = 0;
          for (let yy = by - h; yy < by - 4; yy += 30, row++) for (let k = 0; k < 4; k++) { const xx = x + k * 50 + (row % 2) * 25; g.lineBetween(xx, yy, xx, Math.min(by, yy + 30)); }
          if (kind === 0) { g.fillStyle(0xd8d2c8, 1); g.fillRect(x + 90, by - 470, 22, 470); g.lineStyle(3, INK, 1); g.strokeRect(x + 90, by - 470, 22, 470); }
          if (kind === 2) { g.fillStyle(0xd88a5a, 1); g.fillRect(x + 120, by - 34, 34, 32); g.lineStyle(2.5, INK, 1); g.strokeRect(x + 120, by - 34, 34, 32); g.fillStyle(0x8cc070, 1); g.fillCircle(x + 137, by - 48, 18); g.strokeCircle(x + 137, by - 48, 18); }
          if (kind === 4) { g.fillStyle(0x8cc070, 1); g.fillCircle(x + 60, by - h - 70, 60); g.lineStyle(3, INK, 1); g.strokeCircle(x + 60, by - h - 70, 60); g.fillStyle(0xb08860, 1); g.fillRect(x + 54, by - h - 20, 12, 20); }
        } else if (seg.bg === 'shotengai') {
          const h = 300;
          g.fillStyle(pal.wall, 1); g.fillRect(x, by - h, unit - 6, h);
          g.lineStyle(3, INK, 1); g.strokeRect(x, by - h, unit - 6, h);
          g.fillStyle(0xcfd3d8, 1); g.fillRect(x + 12, by - h + 40, unit - 30, h * 0.45);
          g.lineStyle(1.5, INK, 0.6); for (let yy = 0; yy < h * 0.45; yy += 10) g.lineBetween(x + 12, by - h + 40 + yy, x + unit - 18, by - h + 40 + yy);
          g.fillStyle([0xe86a5a, 0x5ab0d8, 0xf0c040][r % 3], 1); g.fillPoints(<any>[{ x: x - 4, y: by - h + 20 }, { x: x + unit - 2, y: by - h + 20 }, { x: x + unit - 14, y: by - h + 44 }, { x: x + 8, y: by - h + 44 }], true);
          g.lineStyle(2.5, INK, 1); g.strokePoints(<any>[{ x: x - 4, y: by - h + 20 }, { x: x + unit - 2, y: by - h + 20 }, { x: x + unit - 14, y: by - h + 44 }, { x: x + 8, y: by - h + 44 }], true);
        } else if (seg.bg === 'grass') {
          g.lineStyle(2, INK, 0.8);
          for (let k = 0; k < 6; k++) { const gx = x + k * 33 + (r % 11); g.lineBetween(gx, by, gx - 4, by - 14); g.lineBetween(gx + 3, by, gx + 6, by - 12); }
        }
      }
      if (seg.bg === 'crosswalk' || seg.bg === 'grass') {
        // 遠くの地平線と、ガードレール
        g.lineStyle(2.5, 0x2a2522, 0.9); g.lineBetween(0, GY - 70 + lift, W, GY - 72 + lift);
        if (seg.bg === 'crosswalk') { g.lineStyle(3, 0x2a2522, 1); g.lineBetween(0, GY - 120 + lift, W, GY - 120 + lift); for (let k = 0; k < 8; k++) { const px = ((k * 160 - cx * 0.5) % (W + 160) + W + 160) % (W + 160) - 80; g.lineBetween(px, GY - 120 + lift, px, GY - 70 + lift); } }
      }
    }
    // 地面(手前、等速)
    if (indoor) return;
    const groundCol = seg.kind === 'barefoot' ? 0x7c9a5e : pal.ground;
    gr.fillStyle(groundCol, hasImg ? 0.0 : 1); gr.fillRect(0, GY + lift, W, H - GY + 400);
    gr.lineStyle(3, 0x2a2522, hasImg ? 0 : 1); gr.strokePoints(<any>this.wob([{ x: -10, y: GY + lift + 1 }, { x: W / 2, y: GY + lift }, { x: W + 10, y: GY + lift + 2 }], 900, 1.2), false);
    // 地面の模様: 割れ目・白線・落ち葉・水たまり
    const unit = 120, start = Math.floor(cx / unit) - 1;
    for (let i = start; i < start + W / unit + 3; i++) {
      const x = i * unit - cx;
      const k = (i * 2654435761 + this.propsSeed) >>> 0;
      if (seg.bg === 'crosswalk' && i % 2 === 0) { gr.fillStyle(0xf4f1ea, 0.9); gr.fillRect(x, GY + 6 + lift, unit * 0.6, 40); }
      if (k % 7 === 0 && seg.kind !== 'barefoot') {
        // 水たまり(空が映る)
        gr.fillStyle(pal.sky[0], 0.9); gr.fillEllipse(x + 40, GY + 26 + lift, 110, 16);
        gr.fillStyle(0xffffff, 0.5); gr.fillEllipse(x + 30, GY + 24 + lift, 30, 5);
      } else if (k % 5 === 1) {
        gr.lineStyle(1, pal.line, 0.25); gr.lineBetween(x, GY + 20 + lift, x + 30, GY + 30 + lift); gr.lineBetween(x + 30, GY + 30 + lift, x + 44, GY + 26 + lift);
      } else if (k % 5 === 2 && seg.kind === 'barefoot') {
        gr.lineStyle(2, 0x4f6e3c, 0.6); for (let j = 0; j < 5; j++) gr.lineBetween(x + j * 6, GY + lift, x + j * 6 + 3, GY - 12 + lift);
      } else if (k % 9 === 3) {
        gr.fillStyle(0xc77b3a, 0.7); gr.fillEllipse(x + 50, GY + 34 + lift, 16, 7);
      }
    }
  }

  private drawExtras(g: Phaser.GameObjects.Graphics, pal: (typeof PAL)['morning'], lift: number) {
    if (this.bigPuddleX > -9000) {
      const x = this.bigPuddleX - this.camX;
      if (x > -300 && x < W + 300) {
        g.fillStyle(pal.sky[0], 1); g.fillEllipse(x, GY + 30 + lift, 260, 30);
        g.fillStyle(0xffffff, 0.7); g.fillEllipse(x - 40, GY + 27 + lift, 70, 8); g.fillEllipse(x + 30, GY + 33 + lift, 40, 5);
        g.lineStyle(2, pal.line, 0.25); g.strokeEllipse(x, GY + 30 + lift, 260, 30);
      }
    }
    if (this.bike >= 0) {
      const k = (this.now - this.bike) / 1600;
      if (k > 1) this.bike = -1;
      else {
        const x = W + 120 - k * (W + 400), y = GY - 46 + lift - 10;
        for (const dx of [0, 150]) {
          g.lineStyle(4, 0x2b2b2b, 0.85); g.strokeCircle(x + dx, y, 46);
          g.lineStyle(1, 0x2b2b2b, 0.5);
          for (let a = 0; a < 8; a++) { const r = a * Math.PI / 4 + k * 30; g.lineBetween(x + dx, y, x + dx + Math.cos(r) * 44, y + Math.sin(r) * 44); }
        }
        g.lineStyle(5, 0x6c8fb0, 1); g.lineBetween(x, y, x + 75, y - 70); g.lineBetween(x + 75, y - 70, x + 150, y);
      }
    }
  }

  /** 片足ずつ。heelX は地面上のかかとの位置(画面座標) */
  private drawRig(g: Phaser.GameObjects.Graphics, rig: Rig, off: number, lift: number, facing: number, bare: boolean, pal: (typeof PAL)['morning']) {
    const isMe = rig.kind === 'me';
    const shuffleBob = isMe && this.w.shuffle ? Math.abs(Math.sin(this.now / 90)) * 2 : 0;
    const order: Foot[] = ['L', 'R']; // 奥が L、手前が R
    const pos = order.map((f) => this.footPos(rig[f]));
    const hipX = (pos[0] + pos[1]) / 2 + off;
    for (let i = 0; i < 2; i++) {
      const f = order[i]; const a = rig[f];
      const depth = isMe ? 0 : -14;
      const x = pos[i] + off; const y = GY + depth - this.footLift(a) + lift - shuffleBob;
      const far = f === 'L';
      const hint = !isMe && this.holdOn && f === 'R';
      const hy = hint ? Math.max(0, Math.sin(this.now / 380)) * 7 : 0;
      this.drawLeg(g, x, y - hy, hipX + (far ? -9 : 9), 120 + lift, facing, isMe, far, bare, f === 'R' ? (isMe ? this.w.heelRed : hint ? 0.5 : 0.15) : 0, pal, this.footLift(a) / 14);
    }
  }

  /** 言葉の代わりの案内: 次の足のつま先が光る / ズキッの後は右の直後に左が光る */
  private drawToeHints(g: Phaser.GameObjects.Graphics, off: number, lift: number, pal: (typeof PAL)['morning']) {
    const next: Foot = this.lastStepFoot === 'L' ? 'R' : 'L';
    const idle = this.now - this.lastStepAt;
    const toe = (f: Foot) => this.footPos(this.me[f]) + off + tune('walk.stride') * 0.32;
    if ((this.w.segIndex <= 1 && this.w.steps < 10 && idle > 700) || this.now - this.stumbleAt < 900 || (this.lastStepFoot === 'R' && this.w.rub > 0.3 && idle > tune('pain.threshold') && this.w.seg.verse === 1)) {
      const p = (Math.sin(this.now / 260) + 1) / 2;
      g.lineStyle(3, pal.light, 0.35 + p * 0.45); g.strokeCircle(toe(next), GY - 10 + lift, 20 + p * 6);
      g.fillStyle(pal.light, 0.15 + p * 0.2); g.fillCircle(toe(next), GY - 10 + lift, 18);
    }
    if (this.hintSteps > 0 && this.lastStepFoot === 'R' && idle < 380) {
      const k = 1 - idle / 380;
      g.lineStyle(3, 0xfff1c0, 0.8 * k); g.strokeCircle(toe('L'), GY - 10 + lift, 16 + (1 - k) * 18);
    }
  }

  /** AI の絵の部品で描く足(もも・すね・靴を関節で回す) */
  private spriteLeg(who: string, far: boolean, bare: boolean, x: number, y: number, facing: number, hemX: number, hemY: number, kneeX: number, kneeY: number, ankleX: number, ankleY: number) {
    const id = `${who}-${far ? 'f' : 'n'}`;
    let sp = this.legSprites.get(id);
    const tex = (k: string) => (this.textures.exists(`${who}_${k}#t`) ? `${who}_${k}#t` : `${who}_${k.replace('_bare', '')}#t`);
    if (!sp) {
      const base = (who === 'me' ? 30 : 24) + (far ? 0 : 3);
      sp = {
        thigh: this.add.image(0, 0, tex('thigh')).setScrollFactor(0).setOrigin(0.5, 0.04).setDepth(base),
        shin: this.add.image(0, 0, tex('shin')).setScrollFactor(0).setOrigin(0.5, 0.03).setDepth(base + 1),
        shoe: this.add.image(0, 0, tex('shoe')).setScrollFactor(0).setOrigin(0.5, 1).setDepth(base + 2),
      };
      this.legSprites.set(id, sp);
    }
    const tint = far ? 0xd8d8d8 : 0xffffff;
    const seg = (img: Phaser.GameObjects.Image, ax: number, ay: number, bx: number, by: number, overlap: number) => {
      const len = Math.hypot(bx - ax, by - ay) * overlap;
      const sc = len / img.frame.realHeight;
      img.setPosition(ax, ay).setScale(sc).setRotation(Math.atan2(bx - ax, -(by - ay)) * -1 + 0).setVisible(true).setTint(tint);
      img.setRotation(-Math.atan2(bx - ax, by - ay));
      img.setFlipX(facing < 0);
    };
    if (this.textures.exists(tex('thigh'))) { sp.thigh.setTexture(tex('thigh')); seg(sp.thigh, hemX, hemY - 26, kneeX, kneeY, 1.12); }
    sp.shin.setTexture(tex(bare ? 'shin_bare' : 'shin')); seg(sp.shin, kneeX, kneeY - 8, ankleX, ankleY, 1.08);
    const footKey = bare ? tex('foot_bare') : tex('shoe');
    if (this.textures.exists(footKey)) {
      sp.shoe.setTexture(footKey);
      const wTarget = bare ? 58 : 74;
      sp.shoe.setScale(wTarget / sp.shoe.frame.realWidth).setPosition(x, y + 2).setRotation(0).setFlipX(facing < 0).setVisible(true).setTint(tint);
    }
  }

  /** 8fps で揺れるインクの線(ボイリング) */
  private jit(i: number, amp = 1.2) {
    const f = Math.floor(this.now / 125);
    const h = Math.sin(i * 12.9898 + f * 78.233) * 43758.5453;
    return (h - Math.floor(h) - 0.5) * 2 * amp;
  }
  private wob(pts: { x: number; y: number }[], seed: number, amp = 1.1) {
    return pts.map((p, i) => ({ x: p.x + this.jit(seed + i * 2, amp), y: p.y + this.jit(seed + i * 2 + 1, amp) }));
  }

  private drawLeg(g: Phaser.GameObjects.Graphics, x: number, y: number, hipX: number, hipY: number, facing: number, isMe: boolean, far: boolean, bare: boolean, red: number, pal: (typeof PAL)['morning'], bend = 0, pose?: { knee: { x: number; y: number }; hem: { x: number; y: number } }) {
    // 小学生の足。太めの手描きの黒い線、平塗り(新聞の4コマ漫画のような素朴さ)
    const INK = 0x2a2522;
    const shade = (c: number) => far ? Phaser.Display.Color.IntegerToColor(c).darken(10).color : c;
    const seed = (isMe ? 100 : 300) + (far ? 50 : 0);
    const lw = 3;
    const ankleX = x - facing * 10, ankleY = y - (bare ? 12 : 24);
    let hemY = ankleY - 196; // 半ズボン / キュロットのすそ
    let kneeY = ankleY - 104;
    let kneeX = ankleX + (hipX - ankleX) * 0.42 + facing * (6 + bend * 22);
    let hemX = ankleX + (hipX - ankleX) * 0.82 + facing * bend * 8;
    if (pose) { kneeX = pose.knee.x; kneeY = pose.knee.y; hemX = pose.hem.x; hemY = pose.hem.y; }
    const skin = shade(0xf7d6b6);
    const who = isMe ? 'me' : 'fr';
    if (this.textures.exists(`${who}_shin#t`)) {
      this.spriteLeg(who, far, bare, x, y, facing, hemX, hemY, kneeX, kneeY, ankleX, ankleY);
      if (red > 0.02 && !bare) { const heelX = x - facing * 26; this.gFx.fillStyle(0xd8403a, Math.min(0.9, red)); this.gFx.fillCircle(heelX + facing * 6, y - 22, 3 + red * 4); }
      return;
    }
    // 脚(もも〜すね)
    const nrm = (ax: number, ay: number, bx: number, by: number, w: number) => { const l = Math.hypot(bx - ax, by - ay) || 1; return { x: -(by - ay) / l * w, y: (bx - ax) / l * w }; };
    const n1 = nrm(hemX, hemY, kneeX, kneeY, 18), n2 = nrm(kneeX, kneeY, ankleX, ankleY, 13);
    const Lg = this.wob([
      { x: hemX - n1.x, y: hemY - n1.y }, { x: kneeX - n1.x * 0.9, y: kneeY - n1.y * 0.9 }, { x: ankleX - n2.x * 0.75, y: ankleY - n2.y * 0.75 },
      { x: ankleX + n2.x * 0.75, y: ankleY + n2.y * 0.75 }, { x: kneeX + n2.x * 1.2, y: kneeY + n2.y * 1.2 }, { x: kneeX + n1.x * 0.9, y: kneeY + n1.y * 0.9 }, { x: hemX + n1.x, y: hemY + n1.y },
    ], seed, 1.0);
    g.fillStyle(skin, 1); g.fillPoints(<any>Lg, true);
    g.lineStyle(lw, INK, 1); g.strokePoints(<any>Lg, true);
    // ひざこぞう
    g.lineStyle(2, INK, 0.7); g.beginPath(); g.arc(kneeX + facing * 4, kneeY + 2, 6, facing > 0 ? -1.2 : 1.9, facing > 0 ? 1.2 : 4.3); g.strokePath();
    // 靴下
    if (!bare) {
      const sockTop = ankleY - 34;
      const along = (yy: number) => kneeX + (ankleX - kneeX) * ((yy - kneeY) / (ankleY - kneeY));
      const Sk = this.wob([{ x: along(sockTop) - 9, y: sockTop }, { x: along(sockTop) + 9, y: sockTop }, { x: ankleX + 9, y: ankleY + 6 }, { x: ankleX - 9, y: ankleY + 6 }], seed + 10, 0.8);
      g.fillStyle(0xffffff, 1); g.fillPoints(<any>Sk, true);
      g.lineStyle(2.5, INK, 1); g.strokePoints(<any>Sk, true);
      g.lineStyle(3, isMe ? 0x5b8fd0 : 0xe06a5a, 1); g.lineBetween(along(sockTop + 7) - 8, sockTop + 7, along(sockTop + 7) + 8, sockTop + 7);
    }
    // 半ズボン(自分=紺)/ キュロット(友だち=赤)。すそだけ見える
    const cloth = shade(isMe ? 0x34508c : 0xd8493e);
    const hw = 27 + (isMe ? 0 : 7);
    const n3 = nrm(hipX, hipY, hemX, hemY, 1);
    const Sh = pose
      ? this.wob([{ x: hipX - n3.x * 30, y: hipY - n3.y * 30 }, { x: hipX + n3.x * 30, y: hipY + n3.y * 30 }, { x: hemX + n3.x * hw, y: hemY + n3.y * hw }, { x: hemX - n3.x * hw, y: hemY - n3.y * hw }], seed + 20, 1.2)
      : this.wob([{ x: hipX - 32, y: hipY - 160 }, { x: hipX + 32, y: hipY - 160 }, { x: hemX + hw, y: hemY + 4 }, { x: hemX - hw, y: hemY + 4 }], seed + 20, 1.2);
    g.fillStyle(cloth, 1); g.fillPoints(<any>Sh, true);
    g.lineStyle(lw, INK, 1); g.strokePoints(<any>Sh, true);
    // 靴(または素足)
    if (bare) {
      const L = 50, heel = x - facing * L * 0.4, toe = x + facing * L * 0.6;
      const F = this.wob([
        { x: heel, y: y - 1 }, { x: heel - facing * 3, y: y - 8 }, { x: heel + facing * 5, y: y - 15 }, { x: ankleX + facing * 10, y: y - 17 },
        { x: toe - facing * 14, y: y - 9 }, { x: toe - facing * 1, y: y - 8 }, { x: toe + facing * 1, y: y - 2 }, { x: toe - facing * 4, y: y },
      ], seed + 40);
      g.fillStyle(skin, 1); g.fillPoints(<any>F, true);
      g.lineStyle(2.5, INK, 1); g.strokePoints(<any>F, true);
      g.lineStyle(1.5, INK, 0.7); for (let k = 0; k < 3; k++) g.lineBetween(toe - facing * (3 + k * 5), y - 8, toe - facing * (3 + k * 5), y - 5);
      if (isMe && !far) { g.fillStyle(0xffffff, 1); g.fillRect(heel - 5, y - 14, 11, 9); g.lineStyle(1.5, INK, 0.8); g.strokeRect(heel - 5, y - 14, 11, 9); }
      if (!isMe && !far) { g.fillStyle(0xe0605a, 0.6); g.fillCircle(heel + facing * 3, y - 7, 5); }
      return;
    }
    // 子どもの運動靴: ころんと丸く、白い厚底、マジックテープ
    const L = 66, Hh = 28;
    const heel = x - facing * L * 0.42, toe = x + facing * L * 0.58;
    const upper = shade(isMe ? 0xf5c63c : 0xfafafa);
    const U = this.wob([
      { x: heel + facing * 1, y: y - 8 }, { x: heel - facing * 2, y: y - Hh * 0.6 }, { x: heel + facing * 6, y: y - Hh },
      { x: heel + facing * 22, y: y - Hh - 1 }, { x: x + facing * 6, y: y - Hh + 5 }, { x: toe - facing * 14, y: y - 19 },
      { x: toe - facing * 2, y: y - 15 }, { x: toe + facing * 3, y: y - 8 },
    ], seed + 60);
    g.fillStyle(upper, 1); g.fillPoints(<any>U, true);
    g.lineStyle(lw, INK, 1); g.strokePoints(<any>U, true);
    // 底(白・厚め)
    const So = this.wob([{ x: heel - facing * 3, y: y - 9 }, { x: toe + facing * 4, y: y - 9 }, { x: toe + facing * 1, y: y }, { x: heel, y: y }], seed + 70, 0.8);
    g.fillStyle(0xffffff, 1); g.fillPoints(<any>So, true);
    g.lineStyle(2.5, INK, 1); g.strokePoints(<any>So, true);
    // マジックテープ / 友だちは青い線
    g.lineStyle(2.5, INK, 1);
    if (isMe) { const bx = x - facing * 2; g.strokeRect(Math.min(bx, bx + facing * 16), y - Hh + 3, 16, 9); g.fillStyle(0xffffff, 1); g.fillRect(Math.min(bx, bx + facing * 16) + 1, y - Hh + 4, 14, 7); }
    else { g.lineStyle(3, 0x4a78c8, 1); g.lineBetween(heel + facing * 10, y - 13, x + facing * 14, y - 22); }
    if (red > 0.02) { g.fillStyle(0xd8403a, Math.min(0.9, red)); g.fillCircle(heel + facing * 6, y - Hh + 6, 3 + red * 4); }
  }

  private drawCafe(g: Phaser.GameObjects.Graphics, pal: (typeof PAL)['morning'], lift: number) {
    const tt = this.w.segT;
    // テーブルと椅子の脚
    if (!this.bgImg) {
      g.fillStyle(0x5a3e2a, 1); g.fillRect(W * 0.5 - 10, 0, 20, GY); g.fillRect(W * 0.5 - 70, GY - 6, 140, 8);
      g.fillStyle(0x6e5038, 1); g.fillRect(110, 220, 14, GY - 220); g.fillRect(W - 124, 220, 14, GY - 220);
      g.fillStyle(0x000000, 0.08); g.fillRect(0, 0, W, 110);
      // 窓からの光
      g.fillStyle(pal.light, 0.25); g.fillPoints(<any>[{ x: 560, y: GY }, { x: 760, y: GY }, { x: 820, y: H }, { x: 600, y: H }], true);
    }
    // パンくず(ときどき落ちてくる)
    for (let i = 0; i < 5; i++) {
      const ph = ((tt / 1000 + i * 1.7) % 4.5) / 4.5;
      const cx = W * 0.5 + (i - 2) * 38;
      const cy = ph < 0.3 ? 90 + (ph / 0.3) * (GY - 92) : GY - 2;
      g.fillStyle(0xd9a85a, 1); g.fillEllipse(cx, cy, 6, 4);
    }
    // 湯気の影
    g.fillStyle(0x000000, 0.06); for (let i = 0; i < 3; i++) g.fillEllipse(W * 0.5 + Math.sin(tt / 700 + i) * 30, 140 + i * 30, 60, 20);
    // ふたり分の足(向かい合う)
    const myX = 300, frX = W - 300;
    const meRig: Rig = { L: { from: myX - 30, to: myX - 30, t0: -1e9, lift: 0 }, R: { from: myX + 26, to: myX + 26, t0: -1e9, lift: 0 }, facing: 1, kind: 'me' };
    const frRig: Rig = { L: { from: frX + 30, to: frX + 30, t0: -1e9, lift: 0 }, R: { from: frX - 26, to: frX - 26, t0: -1e9, lift: 0 }, facing: -1, kind: 'friend' };
    // 友だちのかかとも、ときどき浮く
    const frHeel = Math.max(0, Math.sin(tt / 900)) * 8;
    this.drawLeg(g, frRig.L.from, GY + lift, frX + 40, 130, -1, false, true, false, 0, pal);
    this.drawLeg(g, frRig.R.from, GY + lift - frHeel, frX + 50, 130, -1, false, false, false, 0.3, pal);
    this.drawLeg(g, meRig.L.from, GY + lift, myX - 40, 130, 1, true, true, false, 0, pal);
    // 右: かかとを抜くと、靴が少し後ろに残り、靴下の赤が見える
    const h = this.cafeHeel;
    this.drawLeg(g, meRig.R.from + h * 10, GY + lift - h * 10, myX - 30, 130, 1, true, false, false, this.w.heelRed, pal);
    if (h > 0.05) {
      g.fillStyle(0xd6a43a, 1); g.fillRect(meRig.R.from - 34, GY - 20, 22, 18);
      g.fillStyle(0xc43034, 0.6 * h); g.fillCircle(meRig.R.from - 16 + h * 10, GY - 18 - h * 10, 7);
    } else if (tt > 1500) {
      // 右の靴が、触ってほしそうにかすかに光る
      const p = (Math.sin(tt / 300) + 1) / 2;
      g.lineStyle(3, pal.light, 0.25 + p * 0.35); g.strokeCircle(meRig.R.from - 10, GY - 14, 28);
    }
  }

  private stairsT0 = 0; private shoesOffAt = 1e12; private stairsZoomed = 0;
  private stairsSequence() {
    this.stairsT0 = this.now; this.shoesOffAt = 1e12; this.stairsZoomed = 0;
    const cam = this.cameras.main;
    // 友だちが靴を脱ぐ → 音が引いて、かかとに寄る
    this.time.delayedCall(2600, () => { snd.play('cloth', 0.5); snd.duck(true); });
    this.time.delayedCall(2900, () => { cam.zoomTo(2.1, 1100, 'Sine.easeInOut'); this.takePhoto(false); });
    this.time.delayedCall(5900, () => { cam.zoomTo(1, 1000, 'Sine.easeInOut'); });
    this.time.delayedCall(6600, () => { snd.duck(false); });
  }
  private onShoesOff() {
    this.shoesOffAt = this.now;
    snd.play('cloth', 0.5, 1.15);
    // 笑って膝が揺れる(声は出さない)
    const notes = [76, 79, 81, 84, 81, 79, 76, 72];
    notes.forEach((n, i) => this.time.delayedCall(700 + i * 160, () => snd.note('glock', n, 0.22, { dur: 0.6, wet: 0.6 })));
  }

  private drawStairs(g: Phaser.GameObjects.Graphics, pal: (typeof PAL)['morning'], lift: number) {
    const tt = this.now - this.stairsT0;
    const INK = 0x2a2522;
    if (!this.bgImg) {
      // 土手のコンクリートの階段と草
      g.fillStyle(0xe6e1d6, 1); for (let i = 0; i < 4; i++) g.fillRect(0, GY - 60 * i, W, 60);
      g.lineStyle(3, INK, 1); for (let i = 0; i < 4; i++) g.strokePoints(<any>this.wob([{ x: 0, y: GY - 60 * i }, { x: W, y: GY - 60 * i + 1 }], 800 + i, 1), false);
      g.fillStyle(0xa8cc8c, 1); g.fillRect(0, GY, W, H);
      g.lineStyle(2, INK, 0.8); for (let k = 0; k < 30; k++) { const gx = k * 33 + 5; g.lineBetween(gx, GY + 30, gx - 4, GY + 16); g.lineBetween(gx + 3, GY + 30, gx + 6, GY + 18); }
    }
    const stepY = GY - 60; // ひとつ上の段に座る
    const since = this.now - this.shoesOffAt;
    const shake = since > 700 && since < 3200 ? Math.sin(since / 55) * 2.5 : 0; // 笑って膝が揺れる
    const frOff = tt > 2600; // 友だちが靴を脱ぐ
    const meOff = since >= 0;
    const frX = 470, myX = 250;
    // 脱いだ靴
    const shoe = (x: number, c: number) => { g.fillStyle(c, 1); g.fillRoundedRect(x, stepY - 20, 52, 20, 9); g.lineStyle(2.5, INK, 1); g.strokeRoundedRect(x, stepY - 20, 52, 20, 9); g.lineStyle(2, INK, 1); g.lineBetween(x, stepY - 5, x + 52, stepY - 5); };
    if (frOff) { shoe(frX + 90, 0xfafafa); shoe(frX + 148, 0xfafafa); }
    if (meOff) { shoe(myX + 80, 0xf5c63c); shoe(myX + 138, 0xf5c63c); }
    // 座る: 足は一段下、ひざが上がり、ももは後ろ(一段上の段)へ
    const sit = (fx: number, fy: number, sh: number, dz: number) => ({ knee: { x: fx - 6 + dz, y: fy - 120 + sh }, hem: { x: fx - 120 + dz, y: fy - 104 } });
    const footY = GY;
    this.drawLeg(g, frX - 22, footY + shake, frX - 190, footY - 100, 1, false, true, frOff, 0, pal, 0, sit(frX - 22, footY, shake, -8));
    this.drawLeg(g, frX + 22, footY - shake, frX - 180, footY - 100, 1, false, false, frOff, frOff ? 0.6 : 0, pal, 0, sit(frX + 22, footY, -shake, 0));
    this.drawLeg(g, myX - 22, footY - shake, myX - 190, footY - 100, 1, true, true, meOff, 0, pal, 0, sit(myX - 22, footY, -shake, -8));
    this.drawLeg(g, myX + 22, footY + shake, myX - 180, footY - 100, 1, true, false, meOff, this.w.heelRed, pal, 0, sit(myX + 22, footY, shake, 0));
    if (frOff) {
      // 友だちのかかとも赤い
      const p = Math.min(1, (tt - 2600) / 900);
      this.gFx.fillStyle(0xd8403a, 0.8 * p); this.gFx.fillCircle(frX + 22 - 20, GY - 8, 9 * p); this.gFx.fillCircle(frX - 22 - 20, GY - 8, 6 * p);
    }
    if (!meOff && tt > 6600) {
      // 自分の右の靴が、脱いでほしそうに光る
      const p = (Math.sin(this.now / 300) + 1) / 2;
      this.gFx.lineStyle(4, 0xffd27a, 0.4 + p * 0.5); this.gFx.strokeCircle(myX + 22, GY - 14, 32 + p * 5);
    }
    void lift;
  }

  private drawEnd(g: Phaser.GameObjects.Graphics, pal: (typeof PAL)['morning'], lift: number) {
    const tt = this.w.segT;
    if (!this.bgImg) {
      g.fillStyle(0x3a3226, 1); g.fillRect(0, GY - 70, W, 70);
      g.fillStyle(pal.light, 0.15); g.fillRect(W * 0.62, 0, W * 0.38, GY - 70);
    }
    // 一足で脱がれた靴。かかとに折りじわと絆創膏の白
    const x = 420;
    g.fillStyle(0xd6a43a, 1); g.fillRoundedRect(x, GY - 22, 70, 22, 8); g.fillRoundedRect(x + 50, GY - 18, 66, 18, 8);
    g.lineStyle(2, pal.line, 0.8); g.strokeRoundedRect(x, GY - 22, 70, 22, 8);
    g.lineStyle(1, 0x6b4a22, 0.9); g.lineBetween(x + 4, GY - 16, x + 12, GY - 12);
    g.fillStyle(0xffffff, 0.9); g.fillRect(x + 140, GY - 6, 14, 6);
    if (tt > this.morningAt) {
      // 翌朝、光が差して、また靴に足が入る
      const p = Math.min(1, (tt - this.morningAt) / 1500);
      g.fillStyle(0xfff6dc, 0.5 * p); g.fillRect(0, 0, W, H);
    }
    void lift;
  }

  private endSequence() {
    const by = this.add.text(W / 2, H * 0.36, t('title'), { fontFamily: '"Zen Maru Gothic", sans-serif', fontSize: '44px', color: '#f3e7cf' }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
    const sub = this.add.text(W / 2, H * 0.36 + 52, t('credit'), { fontFamily: 'sans-serif', fontSize: '13px', color: '#f3e7cf', align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
    this.tweens.add({ targets: [by, sub], alpha: 0.9, duration: 2000, delay: 800, hold: 1800, yoyo: true });
    // 一日の写真を見返す(思ったより晴れている)
    const n = this.photos.length;
    const tones = [72, 76, 79, 84, 81, 79, 76, 74];
    this.photos.forEach((key, i) => {
      this.time.delayedCall(5200 + i * 650, () => {
        const cols = Math.min(4, Math.max(1, n));
        const row = Math.floor(i / cols), col = i % cols;
        const cw = 210, ch = 130;
        const x0 = W / 2 - ((Math.min(n, cols) - 1) * (cw + 16)) / 2;
        const x = x0 + col * (cw + 16), y = H * 0.32 + row * (ch + 24);
        const frame = this.add.rectangle(x, y, cw + 12, ch + 26, 0xfbf8f1).setScrollFactor(0).setDepth(71).setAngle((i % 3 - 1) * 3).setAlpha(0);
        const im = this.add.image(x, y - 6, key).setScrollFactor(0).setDepth(72).setDisplaySize(cw, ch).setAngle(frame.angle).setAlpha(0);
        this.tweens.add({ targets: [frame, im], alpha: 1, y: '-=8', duration: 700 });
        snd.note('piano', tones[i % tones.length], 0.3, { dur: 2 });
        this.time.delayedCall(4200 + (n - i) * 300, () => this.tweens.add({ targets: [frame, im], alpha: 0, duration: 900 }));
      });
    });
    const tMorning = 5200 + n * 650 + 4600;
    this.time.delayedCall(tMorning, () => { snd.footstep('wood', 'L', 0.8); snd.note('piano', 72, 0.4, { dur: 2 }); });
    this.time.delayedCall(tMorning + 700, () => { snd.footstep('wood', 'R', 0.8); snd.squeak(0.25); snd.note('piano', 79, 0.35, { dur: 2.5 }); });
    this.morningAt = tMorning;
    this.time.delayedCall(tMorning + 2200, () => {
      const again = this.add.text(W / 2, H * 0.6, t('again'), { fontFamily: 'sans-serif', fontSize: '18px', color: '#2f3a56' }).setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
      this.tweens.add({ targets: again, alpha: 0.8, duration: 1500 });
      setFootHandler(() => { setFootHandler(() => {}); this.scene.restart(); });
      if (DemoDriver.enabled) this.time.delayedCall(2500, () => this.scene.restart());
    });
    expose('ended', true);
    void lang;
  }

  private drawLookOverlay(o: Phaser.GameObjects.Graphics, seg: Segment) {
    if (seg.verse === 3) return; // 裸足の空はにじまない
    const k = this.lookY;
    // にじみ
    o.fillStyle(0xffffff, 0.18 * k); o.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) { o.fillStyle(0xdfe8f4, 0.12 * k); o.fillCircle(150 + i * 170, 120 + (i % 2) * 60, 90 + Math.sin(this.now / 400 + i) * 10); }
    // まばたき(目ショボ)
    const blink = Math.max(0, Math.sin(this.now / 260)) ** 8;
    const lid = (0.08 + blink * 0.4) * H * k;
    o.fillStyle(0x1a1410, 0.85); o.fillRect(0, 0, W, lid); o.fillRect(0, H - lid, W, lid);
  }
}
