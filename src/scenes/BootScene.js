import Phaser from 'phaser';
import { initScale } from '../utils/ScaleHelper.js';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  preload() {
    initScale(this);
    const { width, height } = this.scale;

    // Loading screen
    const bgGfx = this.add.graphics();
    bgGfx.fillStyle(0x1a1a2e, 1);
    bgGfx.fillRect(0, 0, width, height);

    const title = this.add.text(width / 2, height * 0.35, 'Udinus Dam-Daman', {
      fontFamily: 'Lilita One, Arial, sans-serif',
      fontSize: '72px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    const statusText = this.add.text(width / 2, height * 0.45, 'Memuat...', {
      fontFamily: 'Fredoka, Arial, sans-serif',
      fontSize: '42px', color: '#aaaaaa',
    }).setOrigin(0.5);

    const barWidth = 700, barHeight = 50;
    const barX = (width - barWidth) / 2, barY = height * 0.5;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x333355, 1);
    barBg.fillRoundedRect(barX, barY, barWidth, barHeight, 14);

    const barFill = this.add.graphics();

    const percentText = this.add.text(width / 2, barY + barHeight / 2, '0%', {
      fontFamily: 'Fredoka, Arial, sans-serif',
      fontSize: '36px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5);

    this.load.on('progress', (value) => {
      barFill.clear();
      barFill.fillStyle(0x4ade80, 1);
      barFill.fillRoundedRect(barX + 3, barY + 3, (barWidth - 6) * value, barHeight - 6, 11);
      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.once('complete', () => {
      [bgGfx, title, statusText, barBg, barFill, percentText].forEach(o => o.destroy());
    });

    // ── Font ──
    this.load.css('font_lilita', 'https://fonts.googleapis.com/css2?family=Lilita+One&family=Fredoka:wght@400;600&display=swap');

    // ── Backgrounds ──
    this.load.image('bg_menu_dd',      'assets/images/bg/main_menu_bg_portrait.png');
    this.load.image('bg_gameplay',     'assets/images/bg/ingame_bg_portrait.png');
    this.load.image('papan_main_menu', 'assets/images/bg/papan_main_menu.png');
    this.load.image('screen_glow',     'assets/images/bg/screen_glow.png');

    // ── Board ──
    this.load.image('papan', 'assets/images/board/papan.png');
    this.load.image('guide', 'assets/images/board/Guide_1.png');

    // ── Pieces ──
    this.load.image('batu_merah_1', 'assets/images/pieces/batu_merah_1.png');
    this.load.image('batu_merah_2', 'assets/images/pieces/batu_merah_2.png');
    this.load.image('batu_merah_3', 'assets/images/pieces/batu_merah_3.png');
    this.load.image('batu_biru_1',  'assets/images/pieces/batu_biru_1.png');
    this.load.image('batu_biru_2',  'assets/images/pieces/batu_biru_2.png');
    this.load.image('batu_biru_3',  'assets/images/pieces/batu_biru_3.png');

    // ── UI ──
    this.load.image('btn_blue',          'assets/images/buttons/btn_blue.png');
    this.load.image('btn_circle',        'assets/images/buttons/btn_circle.png');
    this.load.image('label_left02',      'assets/images/labels/label_left02.png');
    this.load.image('logo_udinus',       'assets/images/logo/logo_udinus.png');
    this.load.image('logo_diktisaintek', 'assets/images/logo/logo_diktisaintek.png');
    this.load.image('icon_account',      'assets/images/ui/icon_account.png');
    this.load.image('icon_edit',         'assets/images/ui/icon_edit.png');
    this.load.image('icon_battle',       'assets/images/ui/icon_battle.png');
    this.load.image('icon_damage',       'assets/images/ui/icon_damage.png');
    this.load.image('icon_friends',      'assets/images/ui/icon_friends.png');
    this.load.image('music_on',          'assets/images/ui/music_on.png');
    this.load.image('music_off',         'assets/images/ui/music_off.png');
    this.load.image('btn_circle2',       'assets/images/ui/btn_circle2.png');
    this.load.image('btn_green',         'assets/images/ui/btn_green.png');
    this.load.image('btn_red',           'assets/images/ui/btn_red.png');
    this.load.image('popup_navy',        'assets/images/ui/popup_navy.png');
    this.load.image('popup_purple',      'assets/images/ui/popup_purple.png');
    this.load.image('popup_glow',        'assets/images/ui/popup_glow.png');
    this.load.image('icon_pause',        'assets/images/ui/icon_pause.png');
    this.load.image('icon_home',         'assets/images/ui/icon_home.png');
    this.load.image('icon_play',         'assets/images/ui/icon_play.png');
    this.load.image('icon_trophy',       'assets/images/ui/icon_trophy.png');
    this.load.image('icon_resume',       'assets/images/ui/icon_resume.png');

    // ── Audio ──
    this.load.audio('bgm_menu',  'assets/audio/bgm/menu.ogg');
    this.load.audio('sfx_click', 'assets/audio/sfx/click.ogg');
  }

  create() {
    // Inject font
    const style = document.createElement('style');
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Lilita+One&family=Fredoka:wght@400;600&display=swap');
      @font-face {
        font-family: 'LilitaOne';
        src: url('assets/fonts/LilitaOne-Regular.ttf') format('truetype');
      }
    `;
    document.head.appendChild(style);

    document.fonts.load('40px LilitaOne').then(() => {
      this.scene.start('MainMenuScene');
    }).catch(() => {
      this.scene.start('MainMenuScene');
    });
  }
}
