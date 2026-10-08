import Phaser from 'phaser';
import { expose } from '../core/demo';
import { META } from '../core/meta';
import { preloadArt, trimParts } from '../game/art';
import { installHub } from '../game/input-hub';

export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    preloadArt(this);
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 4, 2, 0x2f3a56);
    this.load.on('progress', (p: number) => { bar.width = 4 + p * 200; });
  }
  create() {
    expose('version', META.version);
    expose('scene', 'Boot');
    trimParts(this);
    installHub(this.game.canvas);
    // 手書き風の文字が読み込まれてから始める(遅い回線でも 1.5 秒で見切る)
    const go = () => this.scene.start('Walk');
    const fonts = (document as any).fonts;
    if (fonts?.load) Promise.race([fonts.load('600 56px "Klee One"'), new Promise((r) => setTimeout(r, 1500))]).finally(go);
    else go();
  }
}
