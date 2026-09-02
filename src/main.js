import Phaser from 'phaser';
import { BootScene }          from './scenes/BootScene.js';
import { MainMenuScene }      from './scenes/MainMenuScene.js';
import { MatchmakingScene }   from './scenes/MatchmakingScene.js';
import { GameScene }          from './scenes/GameScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1080,
  height: 1920,
  backgroundColor: '#1a1a2e',
  parent: 'game-container',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MainMenuScene, MatchmakingScene, GameScene],
};

const game = new Phaser.Game(config);
window.__game = game;
