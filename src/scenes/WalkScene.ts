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
  private morningAt = 1e9;

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
    this.photos = []; this.morningAt = 1e9; this.bike = -1; this.holdOn = false; this.bigPuddleX = -9999;

    makePaperTexture(this);
    makeBlotTexture(this, 'blotRed', 'rgba(196,48,52,1)', 40);
    makeBlotTexture(this, 'blotLight', 'rgba(255,240,200,1)', 64);

    this.gSky = this.add.graphics().setScrollFactor(0);
    this.gBg = this.add.graphics().setScrollFactor(0);
    this.gGround = this.add.graphics().setScrollFactor(0);
    this.stains = this.add.container(0, 0);
    this.gLegs = this.add.graphics().setScrollFactor(0);
    this.gOver = this.add.graphics().setScrollFactor(0).setDepth(50);
    this.paper = this.add.tileSprite(W / 2, H / 2, W, H, 'paper').setScrollFactor(0).setDepth(60).setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0.55);

    // タイトル(玄関で最初の一歩まで)
    this.titleText = this.add.text(W * 0.5, H * 0.3, t('title'), { fontFamily: '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif', fontSize: '56px', color: '#2f3a56' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(70).setAlpha(0);
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
      if (seg.kind === 'cafe') { this.queue.push('R'); nextAt = tt + 2000; return; }
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
          snd.note('pizz', n.chord.root + (seg.verse === 3 ? 12 : 12), minimal ? 0.25 : 0.45, { dur: 0.5, wet: 0.4 });
          if (mode !== 'felt') snd.play('brush', 0.18 * tune('snd.steps'));
        }
        if (this.w.shuffle && !minimal) {
          snd.play('shaker', 0.22) || snd.note('perc', 90, 0.15, { dur: 0.08 });
          if (e.foot === 'R') snd.note('pizz', n.chord.tones[2], 0.35, { dur: 0.3 });
        }
        if (e.aligned || e.synced) {
          snd.note('glock', diatonicUp(n.melody, 2) + (e.synced ? 0 : 12), e.synced ? 0.4 : 0.28, { dur: 0.9 });
          this.harmonyGlow = 1;
        }
        if (e.synced && e.foot === 'L' && n.beatInBar === 0) snd.note('glock', n.chord.tones[1] + 12, 0.3, { dur: 1.2 });
        if (e.foot === 'R' && seg.kind === 'walk' && this.w.blister > 0.15) snd.squeak(this.w.blister);
        if (seg.verse === 3) this.harmonyGlow = 1;
        break;
      }
      case 'stumble':
        this.cameras.main.shake(80, 0.002);
        snd.footstep('concrete', e.foot, 0.4);
        break;
      case 'zuki': {
        snd.zuki();
        this.cameras.main.shake(160, tune<number>('juice.zukiShake'));
        this.flash = 1;
        if (navigator.vibrate) try { navigator.vibrate(14); } catch { /* */ }
        const heel = this.me.R.to - 22 + this.camOffset();
        const b = this.add.image(heel - this.camOffset() + (Math.sin(this.now) * 6), GY - 6, 'blotRed').setScale(0.25).setAlpha(0.55);
        this.stains.add(b);
        this.tweens.add({ targets: b, scale: 0.5 + this.w.heelRed * 0.4, alpha: 0.25, duration: 900, ease: 'Sine.Out' });
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
    }
  }

  private camOffset() { return this.camX; }

  private onBeat(id: string) {
    const stride = tune('walk.stride');
    switch (id) {
      case 'door': this.time.delayedCall(400, () => snd.play('door_open', 0.5)); break;
      case 'puddle': this.bigPuddleX = (this.w.x + 3) * stride; break;
      case 'bike': this.bike = this.now; this.time.delayedCall(300, () => snd.play('bell_ding', 0.35, 1, 0.4)); break;
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
      const img = this.add.image(W / 2, H / 2, key).setScrollFactor(0).setDepth(-10).setAlpha(0);
      const s = Math.max(W / img.width, H / img.height) * 1.08; img.setScale(s);
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
    if (this.bgImg) { this.bgImg.y = H / 2 + lift; this.bgImg.x = W / 2 - ((this.camX - this.segStartX) * 0.08) % 40; }

    const g = this.gLegs; g.clear();
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
        if (this.w.friend.mode === 'return') {
          const fx = this.w.friend.x * stride; this.fr.L.to = this.fr.L.from = fx - 20; this.fr.R.to = this.fr.R.from = fx + 20;
        }
        this.drawRig(g, this.fr, off, lift, facing, bare, pal);
      }
      // ふたりで揺れる(シャッフル中は弾む)
      this.drawRig(g, this.me, off, lift, 1, bare, pal);
    }

    // 痛み・ハモりの光
    const o = this.gOver; o.clear();
    this.flash *= 0.9; this.harmonyGlow *= 0.93; this.shuffleGlow *= 0.97;
    if (this.flash > 0.02) { o.fillStyle(0xffffff, this.flash * 0.35); o.fillRect(0, 0, W, H); }
    const pain = this.w.pain;
    if (pain > 0.02 || this.w.rub > 0.4) {
      const a = Math.max(pain * 0.35, (this.w.rub - 0.4) * 0.25);
      o.fillStyle(0x7a1c22, a * 0.5); o.fillRect(0, 0, W, 18); o.fillRect(0, H - 18, W, 18);
    }
    if (this.harmonyGlow > 0.02 && !fixed) {
      const fx = (this.w.friend.x * stride + meX) / 2 - this.camX;
      o.fillStyle(pal.light, this.harmonyGlow * 0.18); o.fillCircle(fx, GY - 40 + lift, 70 + 30 * this.harmonyGlow);
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
      // 遠景: 塀・建物の下端(パララックス 0.5)
      const par = 0.5, unit = 180;
      const start = Math.floor((cx * par) / unit) - 1;
      for (let i = start; i < start + W / unit + 3; i++) {
        const x = i * unit - cx * par;
        const h = 150 + ((i * 7919 + this.propsSeed) % 5) * 22;
        const col = (i + this.propsSeed) % 2 ? pal.wall : pal.wall2;
        g.fillStyle(col, 1); g.fillRect(x, GY - h + lift, unit + 1, h);
        g.lineStyle(2, pal.line, 0.25); g.strokeRect(x + 3, GY - h + 3 + lift, unit - 6, h);
        // ブロック塀の目地
        g.lineStyle(1, pal.line, 0.12);
        for (let yy = GY - h + 26; yy < GY; yy += 26) g.lineBetween(x, yy + lift, x + unit, yy + lift);
        // 物: 電柱 / 植木鉢 / シャッター / 椅子の脚
        const kind = (i * 31 + this.propsSeed) % 6;
        if (seg.bg.startsWith('street') && kind === 0) { g.fillStyle(0x6c6a66, 1); g.fillRect(x + 60, GY - 420 + lift, 26, 420); }
        if (seg.bg.startsWith('street') && kind === 2) { g.fillStyle(0xa85c3c, 1); g.fillRect(x + 100, GY - 36 + lift, 36, 34); g.fillStyle(0x5f8a52, 1); g.fillCircle(x + 118, GY - 48 + lift, 22); }
        if (seg.bg === 'shotengai') { g.fillStyle(0x8a8e94, 1); g.fillRect(x + 10, GY - h + 20 + lift, unit - 20, h * 0.55); g.lineStyle(1, pal.line, 0.2); for (let yy = 0; yy < h * 0.55; yy += 8) g.lineBetween(x + 10, GY - h + 20 + yy + lift, x + unit - 10, GY - h + 20 + yy + lift); }
        if (seg.bg === 'grass') { g.fillStyle(0x6f8f5a, 1); g.fillRect(x, GY - 40 + lift, unit + 1, 40); }
      }
      if (seg.bg === 'crosswalk' || seg.bg === 'stairs' || seg.bg === 'grass') {
        g.fillStyle(pal.sky[1], 1); g.fillRect(0, GY - 60 + lift, W, 60);
      }
    }
    // 地面(手前、等速)
    if (indoor) return;
    const groundCol = seg.kind === 'barefoot' ? 0x7c9a5e : pal.ground;
    gr.fillStyle(groundCol, hasImg ? 0.0 : 1); gr.fillRect(0, GY + lift, W, H - GY + 400);
    gr.lineStyle(3, pal.line, 0.55); gr.lineBetween(0, GY + lift + 1, W, GY + lift + 1);
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
      this.drawLeg(g, x, y - hy, hipX + (far ? -8 : 8), -160 + lift, facing, isMe, far, bare, f === 'R' ? (isMe ? this.w.heelRed : hint ? 0.5 : 0.15) : 0, pal);
    }
  }

  private drawLeg(g: Phaser.GameObjects.Graphics, x: number, y: number, hipX: number, hipY: number, facing: number, isMe: boolean, far: boolean, bare: boolean, red: number, pal: (typeof PAL)['morning']) {
    const shade = (c: number) => far ? Phaser.Display.Color.IntegerToColor(c).darken(14).color : c;
    const ankleX = x - facing * 4, ankleY = y - 24;
    // すね(ズボン)
    const pants = shade(isMe ? 0x2c3a5e : 0xd8c8a8);
    const sock = shade(bare ? 0xe8b896 : isMe ? 0xf2f0ea : 0xe9e2d2);
    const hemY = ankleY - (bare ? 70 : 46);
    const tx = (yy: number) => ankleX + (hipX - ankleX) * ((ankleY - yy) / (ankleY - hipY));
    g.fillStyle(sock, 1);
    g.fillPoints(<any>[{ x: tx(hemY) - 11, y: hemY }, { x: tx(hemY) + 11, y: hemY }, { x: ankleX + 10, y: ankleY + 4 }, { x: ankleX - 10, y: ankleY + 4 }], true);
    g.fillStyle(pants, 1);
    g.fillPoints(<any>[{ x: tx(hipY) - 24, y: hipY }, { x: tx(hipY) + 24, y: hipY }, { x: tx(hemY) + 17, y: hemY }, { x: tx(hemY) - 17, y: hemY }], true);
    g.lineStyle(2, pal.line, 0.7);
    g.lineBetween(tx(hipY) - 24, hipY, tx(hemY) - 17, hemY); g.lineBetween(tx(hipY) + 24, hipY, tx(hemY) + 17, hemY);
    g.lineBetween(tx(hemY) - 17, hemY, tx(hemY) + 17, hemY);
    // 靴(または素足)
    const L = 64, Hh = bare ? 16 : 26;
    const heel = x - facing * L * 0.42, toe = x + facing * L * 0.58;
    if (bare) {
      g.fillStyle(shade(0xe8b896), 1);
      g.fillEllipse((heel + toe) / 2, y - 7, L * 0.95, Hh);
      g.lineStyle(2, pal.line, 0.6); g.strokeEllipse((heel + toe) / 2, y - 7, L * 0.95, Hh);
      if (isMe && !far) { g.fillStyle(0xffffff, 0.95); g.fillRect(heel - 2, y - 16, 12, 9); }
      if (!isMe && !far) { g.fillStyle(0xd0484c, 0.5); g.fillCircle(heel + 4, y - 9, 6); }
      return;
    }
    const body = shade(isMe ? 0xd6a43a : 0xf7f6f0);
    g.fillStyle(body, 1);
    g.fillPoints(<any>[
      { x: heel, y: y - 2 }, { x: heel, y: y - Hh + 2 }, { x: heel + facing * 18, y: y - Hh - 2 },
      { x: x + facing * 6, y: y - Hh + 4 }, { x: toe - facing * 6, y: y - 12 }, { x: toe, y: y - 4 }, { x: toe - facing * 2, y: y },
    ], true);
    g.fillStyle(shade(isMe ? 0x6b4a22 : 0xc9c4b8), 1); g.fillRect(Math.min(heel, toe), y - 3, L, 4);
    g.lineStyle(2, pal.line, 0.75);
    g.strokePoints(<any>[
      { x: heel, y: y - 2 }, { x: heel, y: y - Hh + 2 }, { x: heel + facing * 18, y: y - Hh - 2 },
      { x: x + facing * 6, y: y - Hh + 4 }, { x: toe - facing * 6, y: y - 12 }, { x: toe, y: y - 4 }, { x: toe - facing * 2, y: y },
    ], true);
    if (red > 0.02) { g.fillStyle(0xc43034, Math.min(0.85, red)); g.fillCircle(heel + facing * 4, y - Hh + 4, 4 + red * 5); }
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
    this.drawLeg(g, frRig.L.from, GY + lift, frX + 40, -160, -1, false, true, false, 0, pal);
    this.drawLeg(g, frRig.R.from, GY + lift - frHeel, frX + 50, -160, -1, false, false, false, 0.3, pal);
    this.drawLeg(g, meRig.L.from, GY + lift, myX - 40, -160, 1, true, true, false, 0, pal);
    // 右: かかとを抜くと、靴が少し後ろに残り、靴下の赤が見える
    const h = this.cafeHeel;
    this.drawLeg(g, meRig.R.from + h * 10, GY + lift - h * 10, myX - 30, -160, 1, true, false, false, this.w.heelRed, pal);
    if (h > 0.05) {
      g.fillStyle(0xd6a43a, 1); g.fillRect(meRig.R.from - 34, GY - 20, 22, 18);
      g.fillStyle(0xc43034, 0.6 * h); g.fillCircle(meRig.R.from - 16 + h * 10, GY - 18 - h * 10, 7);
    } else if (tt > 1500) {
      // 右の靴が、触ってほしそうにかすかに光る
      const p = (Math.sin(tt / 300) + 1) / 2;
      g.lineStyle(3, pal.light, 0.25 + p * 0.35); g.strokeCircle(meRig.R.from - 10, GY - 14, 28);
    }
  }

  private stairsT0 = 0;
  private stairsSequence() { this.stairsT0 = this.now; }

  private drawStairs(g: Phaser.GameObjects.Graphics, pal: (typeof PAL)['morning'], lift: number) {
    const tt = this.now - this.stairsT0;
    if (!this.bgImg) {
      // 階段
      g.fillStyle(0xbfb6a6, 1); for (let i = 0; i < 4; i++) g.fillRect(0, GY - 60 * i, W, 60);
      g.lineStyle(2, pal.line, 0.4); for (let i = 0; i < 4; i++) g.lineBetween(0, GY - 60 * i, W, GY - 60 * i);
      g.fillStyle(0x6f8f5a, 1); g.fillRect(0, GY, W, H);
    }
    const stepY = GY - 60; // ひとつ上の段に座る
    const shake = tt > 5200 && tt < 7600 ? Math.sin(tt / 55) * 2 : 0; // 笑って膝が揺れる
    const frOff = tt > 2600; // 友だちが靴を脱ぐ
    const meOff = tt > 6600;
    const frX = 600, myX = 380;
    // 脱いだ靴
    if (frOff) { g.fillStyle(0xf7f6f0, 1); g.fillRect(frX + 90, stepY - 18, 50, 16); g.fillRect(frX + 140, stepY - 16, 50, 14); }
    if (meOff) { g.fillStyle(0xd6a43a, 1); g.fillRect(myX - 150, stepY - 18, 50, 16); g.fillRect(myX - 100, stepY - 16, 50, 14); }
    this.drawLeg(g, frX - 26, stepY + shake, frX - 70, 60, 1, false, true, frOff, 0, pal);
    this.drawLeg(g, frX + 26, stepY - shake, frX - 60, 60, 1, false, false, frOff, frOff ? 0.6 : 0, pal);
    this.drawLeg(g, myX - 26, stepY - shake, myX - 70, 60, 1, true, true, meOff, 0, pal);
    this.drawLeg(g, myX + 26, stepY + shake, myX - 60, 60, 1, true, false, meOff, this.w.heelRed, pal);
    if (frOff && tt < 5200) { const p = Math.min(1, (tt - 2600) / 800); g.fillStyle(0xc43034, 0.5 * p); g.fillCircle(frX + 26 - 22, stepY - 12, 10 * p); }
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
