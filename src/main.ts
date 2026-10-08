import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { WalkScene } from './scenes/WalkScene';
import { installTuning } from './core/tuning';
import { addStrings } from './core/i18n';
import { META } from './core/meta';
import { watchVersion } from './core/version';
import { mountUi } from './ui/corner';

// 横長。足首の高さから見た横向きの道。
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

addStrings({
  title: { ja: 'くつずれ', en: 'Kutsuzure' },
  credit: { ja: 'つくった人 MUKKII ほか(CREDITS)', en: 'made by MUKKII and friends (see CREDITS)' },
  again: { ja: 'もういちど歩く', en: 'walk again' },
});

(window as any).__BUILD_ID__ = META.version;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#f4ecdc',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 4 },
  scene: [Boot, WalkScene],
};

new Phaser.Game(config);
installTuning();
mountUi();
watchVersion();
