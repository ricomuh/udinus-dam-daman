import Phaser from 'phaser';

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenuScene'); }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    this.add.image(W/2, H/2, 'bg_main').setDisplaySize(W, H);

    // Title
    this.add.text(W/2, H * 0.22, 'DAM-DAMAN', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '96px',
      color: '#ffffff',
      stroke: '#1a1a2e',
      strokeThickness: 12,
    }).setOrigin(0.5);

    this.add.text(W/2, H * 0.31, 'UDINUS', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '52px',
      color: '#f9ca24',
      stroke: '#1a1a2e',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // Buttons
    this._makeBtn(W/2, H * 0.55, '▶  MAIN', 0xe74c3c, () => {
      this.scene.start('GameScene', { mode: 'offline' });
    });

    // Version
    this.add.text(W - 20, H - 20, 'v1.0.0', {
      fontSize: '28px', color: '#aaaaaa'
    }).setOrigin(1, 1);
  }

  _makeBtn(x, y, label, color, cb) {
    const btn = this.add.rectangle(x, y, 540, 110, color, 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', cb)
      .on('pointerover',  () => btn.setAlpha(0.8))
      .on('pointerout',   () => btn.setAlpha(1));

    this.add.text(x, y, label, {
      fontFamily: 'Arial Black, Arial',
      fontSize: '52px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1);

    return btn;
  }
}
