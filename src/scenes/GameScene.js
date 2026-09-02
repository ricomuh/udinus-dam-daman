import Phaser from 'phaser';

/**
 * Dam-Daman (tradisional) — Rules dari GDD:
 * - Board: 5x5 kotak + segitiga atas (3+3) + segitiga bawah (3+3) = 37 node
 * - Tiap pemain 16 unit. P1 (merah) bawah, P2 (biru) atas
 * - Gerak: 1 langkah ke node tetangga (via garis)
 * - Makan: lompati lawan ke node kosong di belakang (garis lurus)
 * - Multi-kill: setelah makan, kalau masih bisa makan → wajib lanjut
 * - Pelanggaran: bisa makan tapi tidak makan → lawan teriak "Dam!"
 * - Menang: lawan kehabisan unit
 */

// ── Board geometry ──────────────────────────────────────────────
const BOARD_X = 540;
const BOARD_Y = 960;
const _CELL_W0  = 108;
const _CELL_H0  = 120;
const _S = 1.15;
const CELL_W  = _CELL_W0 * _S;
const CELL_H  = _CELL_H0 * _S;

const NODE_POS = [
  [0, -2], [2, -2], [4, -2],                // 0-2 top ext
  [1, -1], [2, -1], [3, -1],                // 3-5 top tri
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],   // 6-10 row 0
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],   // 11-15 row 1
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],   // 16-20 row 2
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],   // 21-25 row 3
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],   // 26-30 row 4
  [1, 5], [2, 5], [3, 5],               // 31-33 bot tri
  [0, 6], [2, 6], [4, 6],                   // 34-36 bot ext
];
const N = NODE_POS.length; // 37

// Extra edges di luar grid 5x5 (grid dihitung programmatically)
// EDGES DIHAPUS (sesuai permintaan + simetris H/V):
//   top: (0,3), (2,5), (3,7), (5,9), (4,8)
//   bot: (34,31), (36,33), (31,27), (33,29), (32,28)
const EXTRA_EDGES = [
  // top segitiga internal
  [3, 4], [4, 5],
  // top segitiga → row 0 (3→8, 4→8, 5→8)
  [3, 8], [4, 8], [5, 8],
  // top extension internal
  [0, 1], [1, 2],
  // top extension → top segitiga
  [0, 3], [1, 4], [2, 5],
  // bottom segitiga internal
  [31, 32], [32, 33],
  // bottom segitiga → row 4 (31→28, 32→27/28/29, 33→28)
  [31, 28], [32, 28], [33, 28],
  // bottom extension internal
  [34, 35], [35, 36],
  // bottom extension → bottom segitiga
  [34, 31], [35, 32], [36, 33],
];

function buildAdjacency() {
  const adj = Array.from({ length: N }, () => []);
  const addEdge = (a, b) => { adj[a].push(b); adj[b].push(a); };

  // Grid 5x5: nodes 6..30 (col = (id-6)%5, row = floor((id-6)/5))
  // Horizontal + vertical edges
  for (let id = 6; id <= 30; id++) {
    const c = (id - 6) % 5;
    const r = Math.floor((id - 6) / 5);
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc >= 0 && nc <= 4 && nr >= 0 && nr <= 4) {
        addEdge(id, 6 + nr * 5 + nc);
      }
    }
  }

  // Diagonal edges: explicit paths (user confirmed)
  // Node yang boleh diagonal: 12, 14, 18, 22, 24
  // 12(col1,row1): NW→SE ke 6,18 | NE→SW ke 8,16
  // 14(col3,row1): NW→SE ke 8,20 | NE→SW ke 10,18  -- wait, recalc below
  // Build dari adjacency node diagonal ke segiempat
  const DIAG_NODES = new Set([12, 14, 18, 22, 24]);
  for (const id of DIAG_NODES) {
    const c = (id - 6) % 5;
    const r = Math.floor((id - 6) / 5);
    for (const [dc, dr] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nc > 4 || nr < 0 || nr > 4) continue;
      addEdge(id, 6 + nr * 5 + nc);
    }
  }

  for (const [a, b] of EXTRA_EDGES) addEdge(a, b);
  return adj;
}

const ADJ = buildAdjacency();

// Cek collinear dalam board units (untuk lompatan)
function isCollinear(a, b, c) {
  const [ax, ay] = NODE_POS[a];
  const [bx, by] = NODE_POS[b];
  const [cx, cy] = NODE_POS[c];
  return Math.abs((bx - ax) * (cy - by) - (by - ay) * (cx - bx)) < 0.001;
}

// ── Layout constants ────────────────────────────────────────────

const COLOR_P1      = 0xe74c3c; // merah
const COLOR_P2      = 0x3498db; // biru
const COLOR_LINE    = 0xcccccc;
const COLOR_NODE    = 0x2c3e50;
const COLOR_SELECT  = 0xf9ca24;
const COLOR_MOVE    = 0x2ecc71;
const COLOR_CAPTURE = 0xe67e22;

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.gameMode      = data?.mode ?? 'offline';
    this.myPlayerIdx   = data?.myPlayerIdx ?? 0;  // 0=merah, 1=biru (online)
    this.photon        = data?.photon ?? null;     // PhotonManager (online)
    this.currentTurn   = 0;
    this.selected      = null;
    this.validMoves    = [];
    this.mustCapture   = false;
    this.multiKillPiece = null;
    this.pieces        = [];
    this.busy          = false;
    this.gameOver      = false;
    this.paused        = false;
    this.pauseOverlay  = null;
    this._pieceId      = 0;
    this._turnLights   = [];
    this._turnBanner   = null;
    this._turnBannerBg = null;
    this._onlineStarted = false;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background gameplay (BACKGROUND.png rotated portrait)
    if (this.textures.exists('bg_gameplay')) {
      const bgImg = this.add.image(W/2, H/2, 'bg_gameplay');
      bgImg.setScale(Math.max(W / bgImg.width, H / bgImg.height)).setDepth(0);
    } else {
      this.add.rectangle(W/2, H/2, W, H, 0x1a1a2e).setDepth(0);
    }

    this._drawBoard();
    this._initPieces();
    this._createHUD();

    if (this.gameMode === 'online' && this.photon) {
      this._setupOnlineCallbacks();
    }

    this.input.on('pointerdown', this._onPointerDown, this);
    window.__gameScene = this; // E2E test access
  }

  // ── Online callbacks ──────────────────────────────────────────
  _setupOnlineCallbacks() {
    if (!this.photon) return;
    this.photon.onMoveReceived = (data) => {
      if (this.busy || this.gameOver) return;
      const piece = this.pieces.find(p => p.id === data.pieceId);
      if (!piece) return;
      const captured = data.capturedId ? this.pieces.find(p => p.id === data.capturedId) : null;
      const move = { to: data.to, isCapture: !!captured, captured };
      // fromRemote=true — jangan echo balik (anti ping-pong)
      this._executeMove(piece, move, { fromRemote: true });
    };
    this.photon.onPlayerLeft = () => {
      if (this.gameOver) return;
      this._showOpponentLeft();
    };
    this.photon.onGameOver = (data) => {
      if (this.gameOver) return;
      this._showWinner(data.winner);
    };
  }

  _showOpponentLeft() {
    this.gameOver = true;
    const W = this.scale.width, H = this.scale.height;
    const overlay = this.add.container(0, 0).setDepth(9999).setScrollFactor(0);
    const bg = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85).setScrollFactor(0);
    overlay.add(bg);
    const txt = this.add.text(W / 2, H / 2 - 100, 'Lawan keluar\ndari permainan', {
      fontFamily: 'Fredoka', fontSize: '56px', fontStyle: 'bold',
      color: '#ff6b6b', stroke: '#ffffff', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5).setScrollFactor(0);
    overlay.add(txt);
    const btnHome = this.add.nineslice(W / 2, H / 2 + 120, 'btn_blue', null, W - 160, 120, 20, 20, 14, 38)
      .setInteractive({ useHandCursor: true }).setScrollFactor(0);
    const btnText = this.add.text(W / 2, H / 2 + 120, 'Kembali ke Menu', {
      fontFamily: 'Fredoka', fontSize: '44px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setScrollFactor(0);
    btnHome.on('pointerup', () => {
      if (this.photon) this.photon.disconnect();
      this.scene.start('MainMenuScene');
    });
    overlay.add(btnHome);
    overlay.add(btnText);
  }

  // ── Board drawing ─────────────────────────────────────────────
  _nodeXY(id) {
    const [nx, ny] = NODE_POS[id];
    return {
      x: BOARD_X + (nx - 2) * CELL_W,
      y: BOARD_Y + (ny - 2) * CELL_H,
    };
  }

  _drawBoard() {
    // Guide_1 dan papan: landscape 1401x701, rotate 90 CW → portrait 701x1401
    // Node grid height (top ext ny=-2 ke bot ext ny=6) = 8 * CELL_H = 8*120 = 960px
    // Board image di-scale SEPADAN node grid (bukan distretch), dan TIDAK boleh
    // lebih besar dari screen. Fit height = node grid height, caps di 90% screen.
    const gridH      = 8 * CELL_H * 1.2;                  // 960 * 1.2 = 1152
    const boardPH    = 1401;                              // tinggi portrait setelah rotate
    const maxScale   = (this.scale.height * 0.9) / boardPH;
    const scale      = Math.min(gridH / boardPH, maxScale);
    const cx = BOARD_X;
    const cy = BOARD_Y;
    const scaleGrid = 0.98; // lihat catatan: board ~ node grid

    if (this.textures.exists('papan')) {
      this.add.image(cx, cy, 'papan')
        .setAngle(90)
        .setScale(scale)
        .setDepth(1);
    }

    if (this.textures.exists('guide')) {
      this.add.image(cx, cy, 'guide')
        .setAngle(90)
        .setScale(scale)
        .setDepth(2)
        .setAlpha(0.95);
    }
  }

  _wait(ms) { return new Promise(r => this.time.delayedCall(ms, r)); }

  // ── Bot AI ────────────────────────────────────────────────────
  _scheduleBot() {
    if (this.gameMode !== 'vsbot' || this.currentTurn !== 1 || this.gameOver) return;
    this.busy = true;
    this.time.delayedCall(650, () => this._runBot());
  }

  _runBot() {
    if (this.gameOver) { this.busy = false; return; }

    const botPieces = this.pieces.filter(p => p.alive && p.player === 1);
    const allMoves = [];
    for (const piece of botPieces) {
      const moves = this._getValidMoves(piece);
      const filtered = this.mustCapture ? moves.filter(m => m.isCapture) : moves;
      for (const move of filtered) allMoves.push({ piece, move });
    }

    if (allMoves.length === 0) { this._endTurn(); this.busy = false; return; }

    const best = this._chooseBotMove(allMoves);
    if (!best) { this._endTurn(); this.busy = false; return; }

    this.busy = false;
    this._executeMove(best.piece, best.move);
  }

  _chooseBotMove(candidates) {
    // Prioritas 1: capture dengan chain terbanyak
    const captures = candidates.filter(c => c.move.isCapture);
    if (captures.length > 0) {
      const scored = captures.map(c => ({
        ...c,
        score: this._simulateCaptureChain(c.piece, c.move),
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0];
    }

    // Prioritas 2: maju ke bawah (P1 biru dari atas → y besar = maju)
    const scored = candidates.map(c => {
      const { y } = this._nodeXY(c.move.to);
      return { ...c, score: y + Math.random() * 10 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
  }

  _simulateCaptureChain(piece, firstMove) {
    // Snapshot board
    const board = this.pieces.map(p => ({ id: p.id, node: p.node, player: p.player, alive: p.alive }));
    const mover = board.find(p => p.id === piece.id);
    if (!mover) return 0;

    let kills = 0;
    const doCapture = (move) => {
      kills++;
      if (move.captured) {
        const v = board.find(p => p.id === move.captured.id);
        if (v) v.alive = false;
      }
      mover.node = move.to;
      const further = this._getValidMovesOnBoard(mover, board).filter(m => m.isCapture);
      for (const fm of further) doCapture(fm);
    };
    doCapture(firstMove);
    return kills;
  }

  _getValidMovesOnBoard(piece, board) {
    const pieceAt = (node) => board.find(p => p.alive && p.node === node) ?? null;
    const moves = [];
    const from = piece.node;
    const player = piece.player;
    for (const nb of ADJ[from]) {
      if (!pieceAt(nb)) moves.push({ to: nb, isCapture: false, captured: null });
    }
    for (const nb of ADJ[from]) {
      const enemy = pieceAt(nb);
      if (!enemy || enemy.player === player) continue;
      for (const beyond of ADJ[nb]) {
        if (beyond === from) continue;
        if (pieceAt(beyond)) continue;
        if (isCollinear(from, nb, beyond)) {
          moves.push({ to: beyond, isCapture: true, captured: enemy });
        }
      }
    }
    return moves;
  }

  // ── Pieces ────────────────────────────────────────────────────
  _initPieces() {
    // P2 (biru, atas): top ext (0-2) + tri (3-5) + row0 (6-10) + row1 (11-15) = 16
    // P1 (merah, bawah): row3 (21-25) + row4 (26-30) + tri (31-33) + ext (34-36) = 16
    const p2Start = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
    const p1Start = [21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36];

    p2Start.forEach(n => this._spawnPiece(n, 1));
    p1Start.forEach(n => this._spawnPiece(n, 0));
  }

  _spawnPiece(node, player) {
    const { x, y } = this._nodeXY(node);
    const id = this._pieceId++;
    const color = player === 0 ? 'merah' : 'biru';
    const variant = (id % 3) + 1;
    const texKey = `batu_${color}_${variant}`;
    let sprite;

    if (this.textures.exists(texKey)) {
      sprite = this.add.image(x, y, texKey).setDisplaySize(95, 95).setDepth(10);
    } else {
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(player === 0 ? COLOR_P1 : COLOR_P2, 1);
      g.fillCircle(0, 0, 40);
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeCircle(0, 0, 40);
      sprite = this.add.container(x, y, [g]).setDepth(10);
    }

    sprite.setInteractive(new Phaser.Geom.Circle(0, 0, 45), Phaser.Geom.Circle.Contains);

    const piece = { id, node, player, sprite, alive: true };
    this.pieces.push(piece);
    return piece;
  }

  _pieceAt(node) {
    return this.pieces.find(p => p.alive && p.node === node) ?? null;
  }

  // ── HUD ───────────────────────────────────────────────────────
  _createHUD() {
    const W = this.scale.width;
    const H = this.scale.height;
    const PIECE_SIZE = 52; // ukuran kecil untuk dead piece display

    // ── Pause button (top-right) ──────────────────────────────────
    const pauseX = W - 60;
    const pauseY = 60;
    const pauseBtn = this.add.image(pauseX, pauseY, 'btn_circle2')
      .setDisplaySize(90, 90).setDepth(100).setInteractive({ useHandCursor: true });
    const pauseIcon = this.add.image(pauseX, pauseY, 'icon_pause')
      .setDisplaySize(44, 44).setDepth(101);
    this._attachHoverScale(pauseBtn, [pauseBtn, pauseIcon], { hoverMul: 1.08 });
    pauseBtn.on('pointerup', () => this.openPauseMenu());

    // ── Top HUD: musuh (P2 biru) ──────────────────────────────
    // pojok kiri atas: icon batu biru + count
    const p2PieceIcon = this.textures.exists('batu_biru_1')
      ? this.add.image(60, 60, 'batu_biru_1').setDisplaySize(90, 90).setDepth(50)
      : this.add.circle(60, 60, 35, COLOR_P2).setDepth(50);
    this.p2CountText = this.add.text(105, 38, '×16', {
      fontFamily: 'LilitaOne', fontSize: '44px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setDepth(51);

    // pojok kanan atas: username + icon user (right aligned)
    if (this.textures.exists('icon_account')) {
      this.add.image(W - 55, 55, 'icon_account').setDisplaySize(72, 72).setDepth(50);
    }
    // Online: tampil username lawan (dari photon actors)
    let p2Name = 'Lawan';
    if (this.gameMode === 'online' && this.photon && this.photon.client) {
      try {
        const room = this.photon.client.myRoom();
        const actors = room ? Object.values(room.actors || {}) : [];
        const opponent = actors.find(a => a.actorNr !== this.photon.client.myActor().actorNr);
        if (opponent && opponent.name) p2Name = opponent.name;
      } catch (_) {}
    } else if (this.gameMode === 'vsbot') {
      p2Name = 'Bot';
    }
    this.p2NameText = this.add.text(W - 95, 38, p2Name, {
      fontFamily: 'LilitaOne', fontSize: '40px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(51);

    // ── Bottom HUD: kita (P1 merah) ───────────────────────────
    // pojok kiri bawah: username
    if (this.textures.exists('icon_account')) {
      this.add.image(55, H - 55, 'icon_account').setDisplaySize(72, 72).setDepth(50);
    }
    const p1Name = this.registry.get('playerName') || 'Kamu';
    this.p1NameText = this.add.text(95, H - 78, p1Name, {
      fontFamily: 'LilitaOne', fontSize: '40px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setDepth(51);

    // pojok kanan bawah: icon batu merah + count
    this.p1CountText = this.add.text(W - 105, H - 78, '×16', {
      fontFamily: 'LilitaOne', fontSize: '44px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(1, 0).setDepth(51);
    const p1PieceIcon = this.textures.exists('batu_merah_1')
      ? this.add.image(W - 60, H - 60, 'batu_merah_1').setDisplaySize(90, 90).setDepth(50)
      : this.add.circle(W - 60, H - 60, 35, COLOR_P1).setDepth(50);

    // ── Dead piece rows ────────────────────────────────────────
    // Di atas board: batu P1 merah yang mati berjejer (center)
    // Di bawah board: batu P2 biru yang mati berjejer (center)
    const topNodeY  = this._nodeXY(0).y;
    const botNodeY  = this._nodeXY(34).y;
    const deadGap   = 220;  // 2x jauhan dari board

    // Center dead row — mulai dari tengah layar - (maxPieces/2 * spacing)
    const deadSpacing = 54;
    const maxDead = 16;
    const deadStartX = W/2 - (maxDead / 2) * deadSpacing + deadSpacing / 2;

    this._deadRowP1 = { y: topNodeY - deadGap, sprites: [], startX: deadStartX };
    this._deadRowP2 = { y: botNodeY + deadGap, sprites: [], startX: deadStartX };

    // Turn banner — centered top (GILIRAN MERAH/BIRU)
    const bw = 420, bh = 64, bx = W / 2, by = 132;
    this._turnBannerBg = this.add.graphics().setDepth(55);
    this._turnBannerBg.fillStyle(0x000000, 0.52);
    this._turnBannerBg.fillRoundedRect(bx - bw/2, by - bh/2, bw, bh, 18);
    this._turnBannerBg.lineStyle(3, 0xffffff, 0.92);
    this._turnBannerBg.strokeRoundedRect(bx - bw/2, by - bh/2, bw, bh, 18);
    this._turnBanner = this.add.text(bx, by, '', {
      fontFamily: 'LilitaOne', fontSize: '34px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(56);

    this._updateHUD();
    this._showTurnLights();
  }

  _updateHUD() {
    const p1 = this.pieces.filter(p => p.alive && p.player === 0).length;
    const p2 = this.pieces.filter(p => p.alive && p.player === 1).length;
    
    // Update turn banner
    const names = ['MERAH', 'BIRU'];
    const colors = [COLOR_P1, COLOR_P2];
    if (this._turnBanner) {
      this._turnBanner.setText(`GILIRAN ${names[this.currentTurn]}`);
      this._turnBanner.setColor(Phaser.Display.Color.IntegerToColor(colors[this.currentTurn]).rgba);
    }
    this.p1CountText?.setText(`×${p1}`);
    this.p2CountText?.setText(`×${p2}`);
  }

  // Tambahkan dead piece icon ke baris mati — centered per jumlah
  _addDeadPiece(player) {
    const row = player === 0 ? this._deadRowP1 : this._deadRowP2;
    if (!row) return;
    // Recenter seluruh row setiap kali ada tambahan
    const W = this.scale.width;
    const spacing = 54;
    const newCount = row.sprites.length + 1;
    const totalW = newCount * spacing;
    const startX = W / 2 - totalW / 2 + spacing / 2;

    // Reposition sprite yang sudah ada
    row.sprites.forEach((sp, i) => { sp.x = startX + i * spacing; });

    const x = startX + row.sprites.length * spacing;
    const color = player === 0 ? 'merah' : 'biru';
    const variant = (row.sprites.length % 3) + 1;
    const key = `batu_${color}_${variant}`;
    let sp;
    if (this.textures.exists(key)) {
      sp = this.add.image(x, row.y, key).setDisplaySize(95, 95).setDepth(52).setAlpha(0.85);
    } else {
      sp = this.add.circle(x, row.y, 44, player === 0 ? COLOR_P1 : COLOR_P2).setDepth(52).setAlpha(0.85);
    }
    row.sprites.push(sp);
  }

  _showMsg(_msg) { /* text status dihapus per brief */ }

  // ── Banner helper (mirip ular-tangga) ─────────────────────────
  _makeBanner(cx, cy, w, h, text, opts = {}) {
    const {
      fill       = 0xFFD93D,
      stroke     = 0xC67F00,
      strokeW    = 3,
      radius     = Math.min(h / 2, 36),
      fontSize   = '32px',
      textColor  = '#7a3c00',
      textStroke = '#ffffff',
      textStrokeW = 2,
      depth      = 0,
    } = opts;

    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 3, w, h, radius);
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.lineStyle(strokeW, stroke, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
    g.fillStyle(0xffffff, 0.22);
    g.fillEllipse(0, -h / 2 + 4, w * 0.55, 5);

    const txt = this.add.text(0, 0, text, {
      fontFamily: 'Fredoka, Arial, sans-serif',
      fontSize, fontStyle: 'bold',
      color: textColor, stroke: textStroke, strokeThickness: textStrokeW,
      align: 'center',
    }).setOrigin(0.5);

    const container = this.add.container(cx, cy, [g, txt]);
    container.setScrollFactor(0).setDepth(depth);
    container.bannerText = txt;
    return container;
  }

  // ── Hover scale helper ─────────────────────────────────────────
  _attachHoverScale(btn, targets, opts = {}) {
    const { hoverMul = 1.07 } = opts;
    const baseScales = targets.map(t => ({ x: t.scaleX, y: t.scaleY }));
    btn.on('pointerover', () => {
      targets.forEach((t, i) => {
        t.setScale(baseScales[i].x * hoverMul, baseScales[i].y * hoverMul);
      });
    });
    btn.on('pointerout', () => {
      targets.forEach((t, i) => {
        t.setScale(baseScales[i].x, baseScales[i].y);
      });
    });
  }

  // ── Input ─────────────────────────────────────────────────────
  _onPointerDown(pointer) {
    if (this.busy || this.gameOver) return;
    // Online: block input kalau bukan giliran kita
    if (this.gameMode === 'online' && this.currentTurn !== this.myPlayerIdx) return;
    const node = this._findNearestNode(pointer.x, pointer.y, 60);
    if (node === null) return;
    this._handleNodeClick(node);
  }

  _findNearestNode(px, py, threshold) {
    let best = null, bestDist = threshold;
    for (let i = 0; i < N; i++) {
      const { x, y } = this._nodeXY(i);
      const d = Phaser.Math.Distance.Between(px, py, x, y);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  _handleNodeClick(node) {
    const clickedPiece = this._pieceAt(node);

    // Multi-kill: hanya bisa lanjut serang
    if (this.multiKillPiece) {
      const move = this.validMoves.find(m => m.to === node);
      if (move) this._executeMove(this.multiKillPiece, move);
      return;
    }

    // Pilih piece sendiri
    if (clickedPiece && clickedPiece.player === this.currentTurn) {
      this._selectPiece(clickedPiece);
      return;
    }

    // Eksekusi move
    if (this.selected) {
      const move = this.validMoves.find(m => m.to === node);
      if (move) {
        this._executeMove(this.selected, move);
      } else {
        this._clearSelection();
        this._showMsg('Pilih unit untuk digerakkan');
      }
    }
  }

  // ── Selection ─────────────────────────────────────────────────
  _selectPiece(piece) {
    this._clearSelection();

    const moves = this._getValidMoves(piece);
    const captureMoves = moves.filter(m => m.isCapture);

    if (this.mustCapture) {
      if (captureMoves.length === 0) {
        this._showMsg('Unit ini tidak bisa menyerang. Pilih unit lain!');
        const ox = piece.sprite.x;
        this.tweens.add({
          targets: piece.sprite,
          x: { from: ox - 12, to: ox + 12 },
          duration: 60, yoyo: true, repeat: 3,
          ease: 'Sine.easeInOut',
          onComplete: () => { piece.sprite.x = ox; },
        });
        return;
      }
      this.validMoves = captureMoves;
    } else {
      this.validMoves = moves;
    }

    if (this.validMoves.length === 0) {
      // Shake kanan-kiri kalau gabisa gerak
      const ox = piece.sprite.x;
      this.tweens.add({
        targets: piece.sprite,
        x: { from: ox - 12, to: ox + 12 },
        duration: 60,
        yoyo: true,
        repeat: 3,
        ease: 'Sine.easeInOut',
        onComplete: () => { piece.sprite.x = ox; },
      });
      return;
    }

    this.selected = piece;
    this._highlightNode(piece.node, COLOR_SELECT);
    this.validMoves.forEach(m => {
      this._highlightNode(m.to, m.isCapture ? COLOR_CAPTURE : COLOR_MOVE);
      // X merah di atas batu musuh yang akan dimakan
      if (m.isCapture && m.captured) this._markCaptureTarget(m.captured);
    });

    this._showMsg(this.mustCapture
      ? 'Pilih target serangan!'
      : 'Pilih tujuan gerakan');
  }

  _clearSelection() {
    this.selected = null;
    this.validMoves = [];
    this._highlights?.forEach(h => h.destroy());
    this._highlights = [];
  }

  _highlightNode(node, color) {
    const { x, y } = this._nodeXY(node);
    this._highlights ??= [];

    if (color === COLOR_SELECT) {
      // Glow pada piece yang dipilih — depth 8 biar di bawah piece (depth 10)
      const glow = this.add.graphics().setDepth(8);
      glow.fillStyle(0xffff00, 0.25);
      glow.fillCircle(x, y, 54);
      glow.lineStyle(6, 0xffff00, 0.9);
      glow.strokeCircle(x, y, 54);
      this._highlights.push(glow);

    } else if (color === COLOR_CAPTURE) {
      // Dashed circle putih muter di posisi tujuan capture
      const container = this.add.container(x, y).setDepth(8);
      const g = this.add.graphics();
      g.lineStyle(5, 0xffffff, 0.85);
      const segs = 12, r = 36;
      for (let i = 0; i < segs; i++) {
        if (i % 2 === 0) {
          const a1 = (i / segs) * Math.PI * 2;
          const a2 = ((i + 0.7) / segs) * Math.PI * 2;
          g.beginPath();
          g.arc(0, 0, r, a1, a2, false);
          g.strokePath();
        }
      }
      container.add(g);
      this.tweens.add({ targets: container, angle: 360, duration: 1200, repeat: -1, ease: 'Linear' });
      this._highlights.push(container);

    } else {
      // Dashed circle hijau muter untuk posisi gerak kosong
      const container = this.add.container(x, y).setDepth(14);
      const g = this.add.graphics();
      g.lineStyle(5, 0x2ecc71, 0.9);
      const segs = 12, r = 36;
      for (let i = 0; i < segs; i++) {
        if (i % 2 === 0) {
          const a1 = (i / segs) * Math.PI * 2;
          const a2 = ((i + 0.7) / segs) * Math.PI * 2;
          g.beginPath();
          g.arc(0, 0, r, a1, a2, false);
          g.strokePath();
        }
      }
      container.add(g);
      this.tweens.add({ targets: container, angle: 360, duration: 1500, repeat: -1, ease: 'Linear' });
      this._highlights.push(container);
    }
  }

  // X merah di atas batu musuh yang akan dimakan
  _markCaptureTarget(piece) {
    this._highlights ??= [];
    const { x, y } = this._nodeXY(piece.node);
    const g = this.add.graphics().setDepth(21);
    g.lineStyle(8, 0xff2222, 1);
    const r = 28;
    g.beginPath(); g.moveTo(x - r, y - r); g.lineTo(x + r, y + r); g.strokePath();
    g.beginPath(); g.moveTo(x + r, y - r); g.lineTo(x - r, y + r); g.strokePath();
    this._highlights.push(g);
  }

  // ── Move calculation ──────────────────────────────────────────
  _getValidMoves(piece) {
    const moves = [];
    const from = piece.node;
    const player = piece.player;

    // Gerak biasa: node tetangga kosong
    for (const nb of ADJ[from]) {
      if (!this._pieceAt(nb)) {
        moves.push({ to: nb, isCapture: false, captured: null });
      }
    }

    // Makan: lompati lawan ke node kosong di belakang (garis lurus)
    for (const nb of ADJ[from]) {
      const enemy = this._pieceAt(nb);
      if (!enemy || enemy.player === player) continue;
      for (const beyond of ADJ[nb]) {
        if (beyond === from) continue;
        if (this._pieceAt(beyond)) continue;
        if (isCollinear(from, nb, beyond)) {
          moves.push({ to: beyond, isCapture: true, captured: enemy });
        }
      }
    }

    return moves;
  }

  // ── Move execution ────────────────────────────────────────────
  async _executeMove(piece, move, opts = {}) {
    const fromRemote = opts.fromRemote === true;
    this.busy = true;
    this._clearSelection();
    this._clearTurnLights();

    const { x, y } = this._nodeXY(move.to);

    await new Promise(resolve => {
      this.tweens.add({
        targets: piece.sprite,
        x, y,
        duration: 180,
        ease: 'Power2',
        onComplete: resolve,
      });
    });

    const fromNode = piece.node; // save BEFORE update (for sendMove)
    piece.node = move.to;

    if (move.isCapture && move.captured) {
      this._capturePiece(move.captured);
      this._showMsg('💥 Unit lawan dimakan!');
      await this._wait(300);

      const furtherCaptures = this._getValidMoves(piece).filter(m => m.isCapture);
      if (furtherCaptures.length > 0) {
        // Bot: auto-continue multi-kill tanpa nunggu input
        if (this.gameMode === 'vsbot' && piece.player === 1) {
          await this._wait(400);
          const nextMove = this._chooseBotMove(furtherCaptures.map(m => ({ piece, move: m })));
          if (nextMove) {
            this._executeMove(nextMove.piece, nextMove.move);
            return;
          }
        }
        this.multiKillPiece = piece;
        this.validMoves = furtherCaptures;
        furtherCaptures.forEach(m => this._highlightNode(m.to, COLOR_CAPTURE));
        this._highlightNode(piece.node, COLOR_SELECT);
        this._showMsg('🔥 Multi-Kill! Lanjutkan serangan!');
        this.busy = false;
        return;
      }
    }

    this.multiKillPiece = null;

    if (this._checkWin()) { this.busy = false; return; }

    // Online: kirim move ke lawan (jangan echo kalau diterima dari lawan)
    if (this.gameMode === 'online' && this.photon && !fromRemote) {
      const capturedId = move.captured ? move.captured.id : null;
      this.photon.sendMove(piece.id, fromNode, move.to, capturedId);
    }

    this._endTurn();
    this.busy = false;
  }

  _capturePiece(piece) {
    piece.alive = false;
    this._addDeadPiece(piece.player);
    this.tweens.add({
      targets: piece.sprite,
      alpha: 0, scaleX: 0, scaleY: 0,
      duration: 250,
      onComplete: () => piece.sprite.destroy(),
    });
    this._updateHUD();
  }

  _endTurn() {
    this.currentTurn = 1 - this.currentTurn;
    this._clearTurnLights();
    this._updateHUD();

    const playerPieces = this.pieces.filter(p => p.alive && p.player === this.currentTurn);
    const allCaptures = playerPieces.flatMap(p => this._getValidMoves(p).filter(m => m.isCapture));

    if (allCaptures.length > 0) {
      this.mustCapture = true;
      this._showMsg('⚠️ Kamu WAJIB menyerang! Pilih unit yang bisa menyerang.');
    } else {
      this.mustCapture = false;
      this._showMsg('Pilih unit untuk digerakkan');
    }

    this._showTurnLights();
    this._scheduleBot(); // trigger bot kalau vsbot + giliran P1
  }

  _checkWin() {
    const p1 = this.pieces.filter(p => p.alive && p.player === 0).length;
    const p2 = this.pieces.filter(p => p.alive && p.player === 1).length;
    if (p1 === 0) { this._showWinner(1); return true; }
    if (p2 === 0) { this._showWinner(0); return true; }
    return false;
  }

  _showWinner(player) {
    this.gameOver = true;

    // Online: kirim GAME_OVER ke lawan (hanya kalau kita yang men-trigger)
    if (this.gameMode === 'online' && this.photon && !this._gameOverSent) {
      this._gameOverSent = true;
      this.photon.sendGameOver(player);
      // Disconnect setelah delay kecil (beri waktu event terkirim)
      this.time.delayedCall(1500, () => this.photon?.disconnect());
    }

    const W = this.scale.width, H = this.scale.height;

    // Nama pemain
    let playerName;
    if (player === 0) {
      playerName = this.registry.get('playerName') ?? 'MERAH';
    } else if (this.gameMode === 'vsbot') {
      playerName = 'Bot';
    } else if (this.gameMode === 'online') {
      // Online: P0=kita(myPlayerIdx=0)/lawan tergantung myPlayerIdx
      playerName = player === this.myPlayerIdx
        ? (this.registry.get('playerName') ?? 'MERAH')
        : (this.p2NameText?.text ?? 'Lawan');
    } else {
      playerName = 'BIRU';
    }

    const overlay = this.add.container(0, 0).setDepth(2000).setScrollFactor(0);

    // Dim
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
      .setInteractive().setScrollFactor(0);
    overlay.add(dim);

    // Glow (jika tersedia)
    if (this.textures.exists('popup_glow')) {
      const glow = this.add.image(W / 2, H / 2, 'popup_glow')
        .setAlpha(0.85).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0);
      glow.setDisplaySize(W + 160, 640);
      overlay.add(glow);
    }

    // Popup 9slice
    const popupY = H / 2;
    const popup = this.add.nineslice(W / 2, popupY, 'popup_purple', null,
      W - 80, 1000,
      16, 16, 22, 22
    ).setScrollFactor(0);
    overlay.add(popup);

    // Celebrate teks
    const celebrate = this.add.text(W / 2, popupY - 380, '🎉🎊🎉', { fontSize: '80px' })
      .setOrigin(0.5).setScrollFactor(0);
    overlay.add(celebrate);

    // Trophy icon
    if (this.textures.exists('icon_trophy')) {
      const trophy = this.add.image(W / 2, popupY - 240, 'icon_trophy')
        .setDisplaySize(192, 160).setScrollFactor(0);
      overlay.add(trophy);
    }

    // Teks pemenang
    const colorHex = player === 0 ? '#e74c3c' : '#3498db';
    const txt = this.add.text(W / 2, popupY - 60,
      `Selamat\n${playerName}!`, {
        fontFamily: 'Fredoka, Arial, sans-serif', fontSize: '64px', fontStyle: 'bold',
        color: colorHex, stroke: '#ffffff', strokeThickness: 4,
        align: 'center',
      }).setOrigin(0.5).setScrollFactor(0);
    overlay.add(txt);

    // ── Button helper ──
    const btnW = W - 160;
    const btnH = 120;
    const makeBtn = (y, bgKey, iconKey, label, textColor, strokeColor, onClick) => {
      const btn = this.add.nineslice(W / 2, y, bgKey, null,
        btnW, btnH,
        20, 20, 14, 38
      ).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const icon = this.add.image(W / 2 - btnW / 2 + 64, y - 14, iconKey)
        .setDisplaySize(52, 52).setScrollFactor(0);
      const lbl = this.add.text(W / 2 + 24, y - 14, label, {
        fontFamily: 'Fredoka, Arial, sans-serif', fontSize: '48px', fontStyle: 'bold',
        color: textColor, stroke: strokeColor, strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0);
      btn.on('pointerup', onClick);
      this._attachHoverScale(btn, [btn, icon, lbl]);
      overlay.add([btn, icon, lbl]);
    };

    // Main Lagi
    makeBtn(popupY + 200, 'btn_green', 'icon_play', 'Main Lagi',
      '#ffffff', '#1a4a1a',
      () => this.scene.restart());

    // Menu Utama
    makeBtn(popupY + 360, 'btn_red', 'icon_home', 'Menu Utama',
      '#ffffff', '#4a0a0a',
      () => this.scene.start('MainMenuScene'));
  }

  // ========== PAUSE MENU ==========
  openPauseMenu() {
    if (this.pauseOverlay) return;
    this.paused = true;
    this.busy   = true;
    const W = this.scale.width, H = this.scale.height;
    const overlay = this.add.container(0, 0).setDepth(1500).setScrollFactor(0);
    this.pauseOverlay = overlay;

    // Dim
    const dim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
      .setInteractive().setScrollFactor(0);
    dim.on('pointerup', () => this.closePauseMenu());
    overlay.add(dim);

    // Popup 9slice navy
    const popupY = H / 2;
    const popupW = W - 160;
    const popupH = 680;
    const popup = this.add.nineslice(W / 2, popupY, 'popup_navy', null,
      popupW, popupH,
      18, 18, 24, 24
    ).setScrollFactor(0);
    overlay.add(popup);

    // Title banner JEDA
    const titleBanner = this._makeBanner(W / 2, popupY - popupH / 2 + 12,
      popupW - 120, 80, 'JEDA', { fontSize: '44px', radius: 32 });
    overlay.add(titleBanner);

    // ── Row buttons ──
    const rowBtnW = popupW - 160;
    const rowBtnH = 110;
    const makeRow = (y, bgKey, iconKey, label, textColor, strokeColor, onClick) => {
      const btn = this.add.nineslice(W / 2, y, bgKey, null,
        rowBtnW, rowBtnH,
        18, 18, 12, 28
      ).setInteractive({ useHandCursor: true }).setScrollFactor(0);
      const icon = this.add.image(W / 2 - rowBtnW / 2 + 56, y - 12, iconKey)
        .setDisplaySize(52, 52).setScrollFactor(0);
      const lbl = this.add.text(W / 2 + 24, y - 12, label, {
        fontFamily: 'Fredoka, Arial, sans-serif', fontSize: '44px', fontStyle: 'bold',
        color: textColor, stroke: strokeColor, strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0);
      btn.on('pointerup', () => onClick());
      this._attachHoverScale(btn, [btn, icon, lbl]);
      overlay.add([btn, icon, lbl]);
      return { btn, icon, lbl };
    };

    // Lanjutkan
    makeRow(popupY - 120, 'btn_green', 'icon_resume', 'Lanjutkan',
      '#ffffff', '#1a4a1a',
      () => this.closePauseMenu());

    // Musik toggle
    const musicOn = this.registry.get('musicOn') ?? true;
    const { lbl: musicLbl, btn: musicBtn, icon: musicIcon } = makeRow(
      popupY + 10,
      'btn_blue',
      musicOn ? 'music_on' : 'music_off',
      musicOn ? 'Musik: ON' : 'Musik: OFF',
      '#ffffff', '#0a2a5a',
      () => {
        const nowOn = !(this.registry.get('musicOn') ?? true);
        this.registry.set('musicOn', nowOn);
        musicLbl.setText(nowOn ? 'Musik: ON' : 'Musik: OFF');
        musicIcon.setTexture(nowOn ? 'music_on' : 'music_off');
      });

    // Menu Utama
    makeRow(popupY + 140, 'btn_red', 'icon_home', 'Menu Utama',
      '#ffffff', '#4a0a0a',
      () => this.scene.start('MainMenuScene'));
  }

  closePauseMenu() {
    if (!this.pauseOverlay) return;
    this.pauseOverlay.destroy();
    this.pauseOverlay = null;
    this.paused = false;
    this.busy   = false;
  }

  _showTurnLights() {
    const playerPieces = this.pieces.filter(p => p.alive && p.player === this.currentTurn);
    const movable = this.mustCapture
      ? playerPieces.filter(p => this._getValidMoves(p).some(m => m.isCapture))
      : playerPieces.filter(p => this._getValidMoves(p).length > 0);

    movable.forEach(piece => {
      const { x, y } = this._nodeXY(piece.node);
      const color = piece.player === 0 ? COLOR_P1 : COLOR_P2;

      const ring = this.add.circle(x, y, 36, color, 0.5)
        .setDepth(9)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: ring,
        alpha: { from: 0.5, to: 0.05 },
        scale: { from: 1, to: 1.4 },
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this._turnLights.push(ring);
    });
  }

  _clearTurnLights() {
    this._turnLights.forEach(obj => obj.destroy());
    this._turnLights = [];
  }

  _wait(ms) { return new Promise(r => this.time.delayedCall(ms, r)); }

  // ── E2E helper: instant move (bypass tween animasi, tetap kirim Photon real) ──
  // Headless RAF lambat → tween 180ms resolve >3s. Ini mirror ular-tangga force_roll.
  async __forceMove(piece, move) {
    this.busy = true;
    this._clearSelection();
    this._clearTurnLights();
    const { x, y } = this._nodeXY(move.to);
    piece.sprite.setPosition(x, y); // instant, skip tween
    const fromNode = piece.node;
    piece.node = move.to;

    if (move.isCapture && move.captured) {
      this._capturePiece(move.captured);
      const furtherCaptures = this._getValidMoves(piece).filter(m => m.isCapture);
      if (furtherCaptures.length > 0 && this.gameMode === 'vsbot' && piece.player === 1) {
        const nextMove = this._chooseBotMove(furtherCaptures.map(m => ({ piece, move: m })));
        this.__forceMove(nextMove.piece, nextMove.move);
        return;
      }
      if (furtherCaptures.length > 0 && this.gameMode !== 'online') {
        this.multiKillPiece = piece;
        this.validMoves = furtherCaptures;
        this.busy = false;
        return;
      }
    }

    this.multiKillPiece = null;
    if (this._checkWin()) { this.busy = false; return; }

    if (this.gameMode === 'online' && this.photon) {
      const capturedId = move.captured ? move.captured.id : null;
      this.photon.sendMove(piece.id, fromNode, move.to, capturedId);
    }
    this._endTurn();
    this.busy = false;
  }
}
