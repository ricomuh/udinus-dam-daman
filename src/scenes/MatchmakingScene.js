import Phaser from 'phaser';
import { initScale } from '../utils/ScaleHelper.js';
import { AudioManager } from '../objects/AudioManager.js';
import { PhotonManager } from '../objects/PhotonManager.js';
import { attachHoverScale } from '../utils/UIHelpers.js';

const FONT_BODY  = '"Fredoka", "Arial Rounded MT Bold", sans-serif';
const FONT_TITLE = '"Lilita One", "LilitaOne", "Arial Rounded MT Bold", sans-serif';

/**
 * MatchmakingScene — cari lawan online 1v1 via Photon.
 * Flow: connect → JoinedLobby → joinRoom → 2 actors → GAME_START → GameScene
 */
export class MatchmakingScene extends Phaser.Scene {
  constructor() { super('MatchmakingScene'); }

  init() {
    this.audio      = new AudioManager(this);
    this.musicOn    = this.registry.get('musicOn') ?? true;
    this.audio.setMuted(!this.musicOn);
    this.photon     = null;
    this.statusText = null;
    this._cancelled = false;
  }

  create() {
    initScale(this);
    const { width, height } = this.scale;
    const cx = width / 2;

    this.audio.unlock();
    if (this.musicOn) this.audio.startBGM?.();

    // Background
    const g = this.add.graphics();
    g.fillStyle(0x0A1628, 1);
    g.fillRect(0, 0, width, height);
    // Subtle gradient overlay
    const grad = this.add.graphics();
    grad.fillGradientStyle(0x1a3a5c, 0x1a3a5c, 0x0a1628, 0x0a1628, 0.6);
    grad.fillRect(0, 0, width, height);

    // Title
    this.add.text(cx, 180, 'ONLINE 1v1', {
      fontFamily: FONT_TITLE, fontSize: '80px', fontStyle: 'bold',
      color: '#FFD93D', stroke: '#7a3c00', strokeThickness: 5,
    }).setOrigin(0.5);

    this.add.text(cx, 290, 'Mencari lawan…', {
      fontFamily: FONT_BODY, fontSize: '44px',
      color: '#aaccff',
    }).setOrigin(0.5);

    // Spinner
    this._spinner = this.add.graphics();
    this._drawSpinner(cx, 480);
    this._spinnerAngle = 0;
    this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        this._spinnerAngle += 4;
        this._drawSpinner(cx, 480);
      },
    });

    // Status text
    this.statusText = this.add.text(cx, 640, 'Menghubungkan ke server…', {
      fontFamily: FONT_BODY, fontSize: '40px', fontStyle: 'bold',
      color: '#FFFFFF', align: 'center',
      wordWrap: { width: width - 160 },
    }).setOrigin(0.5);

    // Player info
    const username = this.registry.get('playerName') || 'Player';
    this.add.text(cx, 780, `👤 ${username}`, {
      fontFamily: FONT_BODY, fontSize: '44px',
      color: '#e74c3c', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);

    // Cancel button
    const cancelBtn = this.add.nineslice(cx, height - 260, 'btn_red', null,
      500, 120, 20, 20, 14, 38,
    ).setInteractive({ useHandCursor: true });
    const cancelText = this.add.text(cx, height - 276, 'Batal', {
      fontFamily: FONT_BODY, fontSize: '44px', fontStyle: 'bold',
      color: '#ffffff', stroke: '#8a0e0e', strokeThickness: 2,
    }).setOrigin(0.5);
    cancelBtn.on('pointerup', () => {
      this.audio.click?.();
      this._cancel();
    });
    attachHoverScale(this, cancelBtn, [cancelBtn, cancelText]);

    // Expose for E2E
    window.__matchmakingScene = this;

    this._startMatchmaking();
  }

  _drawSpinner(x, y) {
    this._spinner.clear();
    this._spinner.lineStyle(10, 0xFFD93D, 1);
    this._spinner.beginPath();
    const start = Phaser.Math.DegToRad(this._spinnerAngle);
    const end   = start + Math.PI * 1.4;
    this._spinner.arc(x, y, 55, start, end);
    this._spinner.strokePath();
  }

  _startMatchmaking() {
    const username = this.registry.get('playerName') || 'Player';
    const photon   = new PhotonManager();
    this.photon    = photon;

    photon.onStateChange = (state) => {
      if (this._cancelled) return;
      if (state === 'JoinedLobby' || state === 'ConnectedToMaster') {
        this.statusText?.setText('Mencari lawan…');
      } else if (state === 'Joined') {
        this.statusText?.setText('Masuk ke ruang… menunggu lawan');
      } else if (state === 'Disconnected') {
        if (!this._cancelled) this._showError('Terputus dari server.');
      }
    };

    photon.onPlayerJoined = (actorNr, uname) => {
      if (this._cancelled) return;
      if (photon.myRoomActorCount >= 2) {
        this.statusText?.setText(`Lawan ditemukan: ${uname || 'Pemain'}! Memulai…`);
      }
    };

    photon.onGameStart = (payload) => {
      if (this._cancelled) return;
      const myIdx = photon.myPlayerIdx();
      console.log('[Matchmaking] game start, myIdx:', myIdx);
      this.scene.start('GameScene', {
        mode: 'online',
        myPlayerIdx: myIdx,
        photon: photon,
      });
    };

    photon.onMatchmakingFail = (msg) => {
      if (this._cancelled) return;
      this._showError(msg);
    };

    photon.onPlayerLeft = () => {
      if (this._cancelled) return;
      this._showError('Lawan keluar sebelum game mulai.');
    };

    photon.connect(username);
  }

  _showError(msg) {
    if (this._cancelled) return;
    this.statusText?.setText(msg || 'Gagal terhubung.');
    this.statusText?.setColor('#ff8080');
  }

  _cancel() {
    this._cancelled = true;
    if (this.photon) this.photon.disconnect();
    this.scene.start('MainMenuScene');
  }

  shutdown() {
    if (this.photon && !this._cancelled) this.photon.disconnect();
    window.__matchmakingScene = null;
  }
}
