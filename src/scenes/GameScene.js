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
const CELL_W  = 108;
const CELL_H  = 120;

const NODE_POS = [
  [1, -2], [2, -2], [3, -2],                // 0-2 top ext
  [1.5, -1], [2, -1], [2.5, -1],            // 3-5 top tri
  [0, 0], [1, 0], [2, 0], [3, 0], [4, 0],   // 6-10 row 0
  [0, 1], [1, 1], [2, 1], [3, 1], [4, 1],   // 11-15 row 1
  [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],   // 16-20 row 2
  [0, 3], [1, 3], [2, 3], [3, 3], [4, 3],   // 21-25 row 3
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],   // 26-30 row 4
  [1.5, 5], [2, 5], [2.5, 5],               // 31-33 bot tri
  [1, 6], [2, 6], [3, 6],                   // 34-36 bot ext
];
const N = NODE_POS.length; // 37

// Extra edges di luar grid 5x5 (grid dihitung programmatically)
// EDGES DIHAPUS (sesuai permintaan + simetris H/V):
//   top: (0,3), (2,5), (3,7), (5,9), (4,8)
//   bot: (34,31), (36,33), (31,27), (33,29), (32,28)
const EXTRA_EDGES = [
  // top segitiga internal
  [3, 4], [4, 5],
  // top segitiga → row 0
  [3, 8], [5, 8],
  // top extension internal
  [0, 1], [1, 2],
  // top extension → top segitiga (tambah 0-3, 2-5; hapus 2-4)
  [0, 3], [1, 4], [2, 5],
  // bottom segitiga internal
  [31, 32], [32, 33],
  // bottom segitiga → row 4 (mirror: 31-28, 33-28)
  [31, 28], [33, 28],
  // bottom extension internal
  [34, 35], [35, 36],
  // bottom extension → bottom segitiga (mirror of top: 34-31, 35-32, 36-33)
  [34, 31], [35, 32], [36, 33],
];

function buildAdjacency() {
  const adj = Array.from({ length: N }, () => []);
  const addEdge = (a, b) => { adj[a].push(b); adj[b].push(a); };

  // Grid 5x5: nodes 6..30 (col = (id-6)%5, row = floor((id-6)/5))
  for (let id = 6; id <= 30; id++) {
    const c = (id - 6) % 5;
    const r = Math.floor((id - 6) / 5);
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dc, dr] of dirs) {
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
    this.currentTurn   = 0;
    this.selected      = null;
    this.validMoves    = [];
    this.mustCapture   = false;
    this.multiKillPiece = null;
    this.pieces        = [];
    this.busy          = false;
    this.gameOver      = false;
    this._pieceId      = 0;
  }

  create() {
    const W = this.scale.width;
    const H = this.scale.height;

    // Background
    if (this.textures.exists('bg_main')) {
      this.add.image(W/2, H/2, 'bg_main').setDisplaySize(W, H).setDepth(0);
    } else {
      this.add.rectangle(W/2, H/2, W, H, 0x1a1a2e).setDepth(0);
    }

    // Board backdrop
    if (this.textures.exists('papan')) {
// board drawn in _drawBoard()
    }

    this._drawBoard();
    this._initPieces();
    this._labelNodes();
    this._createHUD();

    this.input.on('pointerdown', this._onPointerDown, this);
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

  _labelNodes() {
    // Label node di atas pieces (depth 100)
    for (let i = 0; i < N; i++) {
      const { x, y } = this._nodeXY(i);
      this.add.text(x, y, String(i), {
        fontSize: '22px',
        color: '#ffff00',
        fontFamily: 'Arial Black',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(100);
    }
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

    this.turnBg = this.add.rectangle(W/2, 120, 700, 100, COLOR_P1, 1).setDepth(50);
    this.turnText = this.add.text(W/2, 120, 'Giliran: MERAH (Kamu)', {
      fontFamily: 'Arial Black, Arial', fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(51);

    this.p1CountText = this.add.text(60, 220, '🔴 ×16', {
      fontSize: '42px', color: '#e74c3c', fontFamily: 'Arial Black',
    }).setDepth(50);
    this.p2CountText = this.add.text(W - 60, 220, '16× 🔵', {
      fontSize: '42px', color: '#3498db', fontFamily: 'Arial Black',
    }).setOrigin(1, 0).setDepth(50);

    this.msgBg = this.add.rectangle(W/2, 1780, 900, 90, 0x000000, 0.6).setDepth(50);
    this.msgText = this.add.text(W/2, 1780, 'Pilih unit untuk digerakkan', {
      fontFamily: 'Arial, sans-serif', fontSize: '36px', color: '#ffffff',
      wordWrap: { width: 860 },
    }).setOrigin(0.5).setDepth(51);

    this.add.text(80, 60, '← Menu', {
      fontSize: '38px', color: '#ffffff', fontFamily: 'Arial',
    }).setDepth(51).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('MainMenuScene'));

    this._updateHUD();
  }

  _updateHUD() {
    const p1 = this.pieces.filter(p => p.alive && p.player === 0).length;
    const p2 = this.pieces.filter(p => p.alive && p.player === 1).length;
    this.p1CountText.setText(`🔴 ×${p1}`);
    this.p2CountText.setText(`${p2}× 🔵`);

    const names = ['MERAH (Kamu)', 'BIRU (Lawan)'];
    const colors = [COLOR_P1, COLOR_P2];
    this.turnText.setText(`Giliran: ${names[this.currentTurn]}`);
    this.turnBg.setFillStyle(colors[this.currentTurn]);
  }

  _showMsg(msg) { this.msgText?.setText(msg); }

  // ── Input ─────────────────────────────────────────────────────
  _onPointerDown(pointer) {
    if (this.busy || this.gameOver) return;
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
        return;
      }
      this.validMoves = captureMoves;
    } else {
      this.validMoves = moves;
    }

    if (this.validMoves.length === 0) {
      this._showMsg('Unit ini tidak bisa bergerak!');
      return;
    }

    this.selected = piece;
    this._highlightNode(piece.node, COLOR_SELECT);
    this.validMoves.forEach(m => {
      this._highlightNode(m.to, m.isCapture ? COLOR_CAPTURE : COLOR_MOVE);
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
    const ring = this.add.circle(x, y, 42, color, 0.35).setDepth(15);
    ring.setStrokeStyle(4, color, 1);
    this._highlights ??= [];
    this._highlights.push(ring);
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
  async _executeMove(piece, move) {
    this.busy = true;
    this._clearSelection();

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

    piece.node = move.to;

    if (move.isCapture && move.captured) {
      this._capturePiece(move.captured);
      this._showMsg('💥 Unit lawan dimakan!');
      await this._wait(300);

      const furtherCaptures = this._getValidMoves(piece).filter(m => m.isCapture);
      if (furtherCaptures.length > 0) {
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

    this._endTurn();
    this.busy = false;
  }

  _capturePiece(piece) {
    piece.alive = false;
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
    const W = this.scale.width, H = this.scale.height;
    const names = ['MERAH', 'BIRU'];
    const colors = [COLOR_P1, COLOR_P2];

    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.7).setDepth(200);
    this.add.rectangle(W/2, H/2, 800, 500, colors[player], 1).setDepth(201);
    this.add.text(W/2, H/2 - 80, '🏆 MENANG!', {
      fontFamily: 'Arial Black', fontSize: '90px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(202);
    this.add.text(W/2, H/2 + 30, `Pemain ${names[player]}`, {
      fontFamily: 'Arial Black', fontSize: '56px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(202);

    this.add.rectangle(W/2, H/2 + 170, 500, 100, 0x27ae60, 1)
      .setDepth(202).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());
    this.add.text(W/2, H/2 + 170, 'Main Lagi', {
      fontFamily: 'Arial Black', fontSize: '48px', color: '#fff',
    }).setOrigin(0.5).setDepth(203);
  }

  _wait(ms) { return new Promise(r => this.time.delayedCall(ms, r)); }
}
