import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Loading bar
    const bar = this.add.graphics();
    const bg  = this.add.graphics();
    bg.fillStyle(0x333333).fillRect(W/2 - 300, H/2 - 20, 600, 40);
    this.load.on('progress', v => {
      bar.clear().fillStyle(0xe74c3c).fillRect(W/2 - 300, H/2 - 20, 600 * v, 40);
    });

    // Background — path relatif, nama sesuai file di server
    this.load.image('bg_main',    'assets/images/bg/BG_main.png');
    this.load.image('background', 'assets/images/bg/BACKGROUND.png');

    // Board
    this.load.image('papan', 'assets/images/board/papan.png');
    this.load.image('guide', 'assets/images/board/Guide_1.png');

    // Pieces — merah
    this.load.image('batu_merah_1', 'assets/images/pieces/batu_merah_1.png');
    this.load.image('batu_merah_2', 'assets/images/pieces/batu_merah_2.png');
    this.load.image('batu_merah_3', 'assets/images/pieces/batu_merah_3.png');

    // Pieces — biru
    this.load.image('batu_biru_1', 'assets/images/pieces/batu_biru_1.png');
    this.load.image('batu_biru_2', 'assets/images/pieces/batu_biru_2.png');
    this.load.image('batu_biru_3', 'assets/images/pieces/batu_biru_3.png');

    // Icons / UI
    this.load.image('icon1_ellipse',   'assets/images/icons/Icon1_ellipse.png');
    this.load.image('icon2_ellipse',   'assets/images/icons/Icon2_ellipse.png');
    this.load.image('icon1_rectangle', 'assets/images/icons/Icon1_rectangle.png');
    this.load.image('icon2_rectangle', 'assets/images/icons/Icon2_rectangle.png');
  }

  create() {
    this.scene.start('MainMenuScene');
  }
}
