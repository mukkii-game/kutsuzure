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
    this.scene.start('Walk');
  }
}
