import Phaser from 'phaser';
import { initScale } from '../utils/ScaleHelper.js';
import { AudioManager } from '../objects/AudioManager.js';
import { attachHoverScale } from '../utils/UIHelpers.js';

const FONT_TITLE = '"Lilita One", "LilitaOne", "Arial Rounded MT Bold", sans-serif';
const FONT_BODY  = '"Fredoka", "Arial Rounded MT Bold", sans-serif';

const ADJ   = ['Cepat','Pintar','Berani','Hebat','Gesit','Keren','Sigap','Jago','Andal','Tajam'];
const NOUNS = ['Macan','Elang','Naga','Kuda','Rajawali','Singa','Harimau','Rubah','Panda','Buaya'];

export class MainMenuScene extends Phaser.Scene {
  constructor() { super('MainMenuScene'); }

  init() {
    this.musicOn = this.registry.get('musicOn') ?? true;
    this.audio = new AudioManager(this);
    this.audio.setMuted(!this.musicOn);
  }

  _getUsername() {
    let name = null;
    try { name = localStorage.getItem('udinus_dd_username'); } catch (_) {}
    if (!name) {
      const adj  = ADJ[Math.floor(Math.random() * ADJ.length)];
      const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
      const num  = Math.floor(Math.random() * 900 + 100);
      name = adj + noun + num;
      try { localStorage.setItem('udinus_dd_username', name); } catch (_) {}
    }
    return name;
  }

  _editUsername() {
    const current = this.usernameText ? this.usernameText.text : this._getUsername();
    const newName = window.prompt('Edit nama kamu:', current);
    if (newName && newName.trim() && newName.trim().length <= 20) {
      const clean = newName.trim();
      try { localStorage.setItem('udinus_dd_username', clean); } catch (_) {}
      this.registry.set('playerName', clean);
      if (this.usernameText) this.usernameText.setText(clean);
    }
  }

  create() {
    initScale(this);
    const { width, height } = this.scale;
    const cx = width / 2;

    this.audio.unlock();
    if (this.musicOn) this.audio.startBGM();

    const username = this._getUsername();
    this.registry.set('playerName', username);

    // Background portrait dam-daman
    const bg = this.add.image(cx, height / 2, 'bg_menu_dd');
    bg.setScale(Math.max(width / bg.width, height / bg.height));

    // Screen glow overlay
    if (this.textures.exists('screen_glow')) {
      this.add.image(cx, height / 2, 'screen_glow')
        .setDisplaySize(width, height).setAlpha(0.35);
    }

    this._drawHeader(username);
    this._drawLogoHUD();
    this._drawHeroPapan(cx, width, height);
    this._drawModeCards(cx, width, height);
    this.createMuteButton(width - 60, 60);
  }

  // ── Profile header pojok KIRI atas ──────────────────────────────
  _drawHeader(username) {
    const avatarX = 60;
    const avatarY = 60;

    this.add.image(avatarX, avatarY, 'icon_account').setDisplaySize(52, 74);

    this.usernameText = this.add.text(avatarX + 48, avatarY, username, {
      fontFamily: FONT_BODY, fontSize: '36px', fontStyle: 'bold',
      color: '#FFFFFF', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0.5);

    const editIcon = this.add.image(
      avatarX + 48 + this.usernameText.width + 20, avatarY, 'icon_edit'
    ).setDisplaySize(28, 28).setAlpha(0.7).setInteractive({ useHandCursor: true });

    editIcon.on('pointerover', () => editIcon.setAlpha(1));
    editIcon.on('pointerout',  () => editIcon.setAlpha(0.7));
    editIcon.on('pointerup', () => {
      this.audio.click?.();
      this._editUsername();
      editIcon.setX(avatarX + 48 + this.usernameText.width + 20);
    });
  }

  // ── Logo HUD UDINUS + DIKTI — 9slice label_left02 ───────────────
  // label_left02 (74×86): 9-slice left=20 right=40 top=6 bottom=19
  _drawLogoHUD() {
    const hudW   = Math.round(384 * 0.75); // 288
    const hudH   = 112;
    const hudY   = 97 + hudH / 2 + 20;    // ≈173
    const offsetX = 30;
    const hudX   = offsetX + hudW / 2;

    this.add.nineslice(
      hudX, hudY, 'label_left02', null,
      hudW, hudH,
      20, 40, 6, 19
    ).setDepth(10);

    const contentY  = hudY - 7;
    const logoSize  = 88;
    const logoStartX = offsetX + 52;

    this.add.image(logoStartX, contentY, 'logo_udinus')
      .setDisplaySize(logoSize, logoSize).setDepth(11);

    this.add.image(logoStartX + logoSize + 10, contentY, 'logo_diktisaintek')
      .setDisplaySize(logoSize, logoSize).setDepth(11);
  }

  // ── Hero: papan_main_menu float + title ─────────────────────────
  _drawHeroPapan(cx, width, height) {
    // Title box
    const LIFT = Math.round(height * 0.15);        // geser semua konten naik seragam (spacing tetap)
    const titleY = Math.round(height * 0.36) - LIFT;
    const boxH   = 210;
    const boxW   = 740;

    const titleBg = this.add.graphics();
    titleBg.fillStyle(0xE84A0B, 0.92);
    titleBg.fillRoundedRect(cx - boxW / 2, titleY - boxH / 2, boxW, boxH, 32);
    titleBg.lineStyle(6, 0x7a2800, 1);
    titleBg.strokeRoundedRect(cx - boxW / 2, titleY - boxH / 2, boxW, boxH, 32);

    const fonikText = this.add.text(cx, titleY - 45, 'DAM-DAMAN', {
      fontFamily: FONT_TITLE, fontSize: '80px', fontStyle: 'bold',
      color: '#FFFFFF', stroke: '#7a2800', strokeThickness: 8,
    }).setOrigin(0.5, 0.5);

    const subText = this.add.text(cx, titleY + 48, 'UDINUS', {
      fontFamily: FONT_TITLE, fontSize: '46px', fontStyle: 'bold',
      color: '#FFD700', stroke: '#7a2800', strokeThickness: 6,
    }).setOrigin(0.5, 0.5);

    // Hero papan
    const papanW = Math.round(width * 0.82);
    const papanH = Math.round(643 * papanW / 871);
    const papanY = Math.round(height * 0.58) - LIFT;

    const papan = this.add.image(cx, papanY, 'papan_main_menu')
      .setDisplaySize(papanW, papanH).setAlpha(0);

    // Fade in
    [titleBg, fonikText, subText, papan].forEach(o => o.setAlpha(0));
    this.tweens.add({ targets: [titleBg, fonikText, subText, papan], alpha: 1, duration: 600, delay: 100 });

    // Float
    this.tweens.add({
      targets: papan,
      y: { from: papanY - 20, to: papanY + 20 },
      duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 400,
    });
  }

  // ── Mode cards — 9slice btn_blue (20,20,14,38) ─────────────────
  _drawModeCards(cx, width, height) {
    const CARD_W = Math.round(900 * 0.7); // 630
    const CARD_H = 140;
    const GAP    = 165;
    const LIFT   = Math.round(height * 0.15);
    const startY = Math.round(height * 0.78) - LIFT;

    const TARGET_H = 100;
    const modes = [
      {
        key: 'local', label: 'PVP Lokal', sub: '2 pemain, 1 perangkat',
        icon: 'icon_battle',
        iconW: Math.round(146 / 135 * TARGET_H), iconH: TARGET_H,
        action: () => { this.scene.start('GameScene', { mode: 'local' }); },
      },
      {
        key: 'bot', label: 'Vs Bot (AI)', sub: 'Kamu vs komputer',
        icon: 'icon_damage',
        iconW: Math.round(68 / 72 * TARGET_H), iconH: TARGET_H,
        action: () => { this.scene.start('GameScene', { mode: 'vsbot' }); },
      },
      {
        key: 'online', label: 'Online 1v1', sub: 'Matchmaking otomatis',
        icon: 'icon_friends',
        iconW: Math.round(114 / 99 * TARGET_H), iconH: TARGET_H,
        action: () => { this.scene.start('MatchmakingScene'); },
      },
    ];

    modes.forEach((m, idx) => {
      const cardY = startY + idx * GAP;

      const btn = this.add.nineslice(
        cx, cardY, 'btn_blue', null,
        CARD_W, CARD_H,
        20, 20, 14, 38
      ).setInteractive({ useHandCursor: true });

      const iconX = cx - CARD_W / 2 + 10;
      const icon  = this.add.image(iconX, cardY, m.icon)
        .setDisplaySize(m.iconW, m.iconH);

      const label = this.add.text(cx, cardY - 22, m.label, {
        fontFamily: FONT_BODY, fontSize: '44px', fontStyle: 'bold',
        color: '#FFFFFF',
      }).setOrigin(0.5, 0.5);

      const subLabel = this.add.text(cx, cardY + 32, m.sub, {
        fontFamily: FONT_BODY, fontSize: '30px',
        color: '#AACCFF',
      }).setOrigin(0.5, 0.5);

      attachHoverScale(this, btn, [btn, icon]);
      btn.on('pointerup', () => {
        this.audio.click?.();
        this.tweens.add({
          targets: [btn, icon, label, subLabel],
          scaleX: 1.04, scaleY: 1.04,
          duration: 80, yoyo: true, ease: 'Sine.easeOut',
          onComplete: () => { if (m.action) m.action(); },
        });
      });

      [btn, icon, label, subLabel].forEach(o => o.setAlpha(0));
      this.tweens.add({
        targets: [btn, icon, label, subLabel],
        alpha: 1, duration: 350, delay: 200 + idx * 80, ease: 'Sine.easeOut',
        onComplete: () => { subLabel.setAlpha(0.75); },
      });
    });
  }

  // ── Mute button ─────────────────────────────────────────────────
  createMuteButton(x, y) {
    const btnBg = this.add.image(x, y, 'btn_circle')
      .setDisplaySize(80, 80).setInteractive({ useHandCursor: true });
    const iconKey   = this.musicOn ? 'music_on' : 'music_off';
    const musicIcon = this.add.image(x, y - 2, iconKey).setDisplaySize(40, 40);
    attachHoverScale(this, btnBg, [btnBg, musicIcon]);
    btnBg.on('pointerup', () => {
      this.audio.click?.();
      this.musicOn = !this.musicOn;
      this.registry.set('musicOn', this.musicOn);
      musicIcon.setTexture(this.musicOn ? 'music_on' : 'music_off').setDisplaySize(40, 40);
      this.audio.setMuted(!this.musicOn);
      this.audio.setBGMMuted?.(!this.musicOn);
      if (this.musicOn) this.audio.startBGM(); else this.audio.stopBGM?.();
    });
  }

  shutdown() {
    try { this.children.removeAll(true); } catch (_) {}
    try { this.tweens.killAll(); } catch (_) {}
    try { this.time.removeAllEvents(); } catch (_) {}
    this.audio?.stopBGM?.();
  }
}
