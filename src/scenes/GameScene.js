import Phaser from 'phaser';

/**
 * Dam-Daman Game Rules (dari GDD):
 * - Board: 7 kolom x 6 baris, tiap pemain 16 unit
 * - P1 (merah) di bawah, P2 (biru) di atas
 * - Gerak: pindah 1 node ke node tetangga via garis
 * - Makan: lompat melewati lawan ke node kosong di belakangnya
 * - Multi-kill: jika setelah makan bisa makan lagi → wajib lanjut
 * - Pelanggaran: bisa makan tapi tidak makan → lawan teriak "Dam!" → ambil 2 unit acak
 * - Menang: lawan kehabisan unit
 */

// Board layout: 7x6 grid, node positions dan adjacency
// Dam-daman pakai grid hexagonal-ish dengan koneksi diagonal dan lurus
// Setiap node punya koordinat (col, row) 0-indexed

const COLS = 7;
const ROWS = 6;

// Board center dan ukuran
const BOARD_X = 540;   // center X (dari 1080)
const BOARD_Y = 860;   // center Y board area
const CELL_W  = 130;   // jarak antar node horizontal
const CELL_H  = 170;   // jarak antar node vertikal

// Warna
const COLOR_P1      = 0xe74c3c;  // merah
const COLOR_P2      = 0x3498db;  // biru
const COLOR_BOARD   = 0x2c3e50;
const COLOR_LINE    = 0x7f8c8d;
const COLOR_SELECT  = 0xf9ca24;
const COLOR_MOVE    = 0x2ecc71;
const COLOR_CAPTURE = 0xe67e22;

export class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.gameMode    = data?.mode ?? 'offline';
    this.currentTurn = 0;          // 0=P1(merah), 1=P2(biru)
    this.selected    = null;       // node yang dipilih {col, row}
    this.validMoves  = [];         // [{col, row, isCapture, captured}]
    this.mustCapture = false;      // multi-kill: harus capture
    this.multiKillPiece = null;    // piece yang sedang multi-kill
    this.pieces      = [];         // [{col, row, player, sprite, id}]
    this.nodeSprites  = {};        // key="col,row" → sprite node highlight
    this.busy        = false;
    this.gameOver    = false;
    this._pieceId    = 0;
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

    // Board background
    if (this.textures.exists('papan')) {
      this.boardImg = this.add.image(W/2, BOARD_Y, 'papan')
        .setDisplaySize(CELL_W * COLS + 80, CELL_H * (ROWS-1) + 120)
        .setDepth(1);
    }

    // Draw board lines + nodes
    this._drawBoard();

    // Place pieces
    this._initPieces();

    // HUD
    this._createHUD();

    // Input
    this.input.on('pointerdown', this._onPointerDown, this);
  }

  // ─── Board Drawing ────────────────────────────────────────────────────────

  _nodeXY(col, row) {
    const x = BOARD_X + (col - (COLS-1)/2) * CELL_W;
    const y = BOARD_Y + (row - (ROWS-1)/2) * CELL_H;
    return { x, y };
  }

  _drawBoard() {
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(4, COLOR_LINE, 0.8);

    // Draw lines between adjacent nodes
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const from = this._nodeXY(c, r);
        // Horizontal
        if (c < COLS-1) {
          const to = this._nodeXY(c+1, r);
          g.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y));
        }
        // Vertical
        if (r < ROWS-1) {
          const to = this._nodeXY(c, r+1);
          g.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y));
        }
        // Diagonal (bergantian per node — pattern dam-daman)
        if (r < ROWS-1 && c < COLS-1) {
          // Diagonal kanan-bawah hanya di node tertentu (checkerboard pattern)
          if ((c + r) % 2 === 0) {
            const to = this._nodeXY(c+1, r+1);
            g.strokeLineShape(new Phaser.Geom.Line(from.x, from.y, to.x, to.y));
          } else {
            // Diagonal kiri-bawah
            const to = this._nodeXY(c, r+1);
            const from2 = this._nodeXY(c+1, r);
            g.strokeLineShape(new Phaser.Geom.Line(from2.x, from2.y, to.x, to.y));
          }
        }
      }
    }

    // Draw node circles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = this._nodeXY(c, r);
        g.fillStyle(0x34495e, 1);
        g.fillCircle(x, y, 14);
        g.lineStyle(2, COLOR_LINE, 1);
        g.strokeCircle(x, y, 14);
      }
    }

    // Node hit areas (invisible, for click detection)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = this._nodeXY(c, r);
        const key = `${c},${r}`;
        const zone = this.add.circle(x, y, 40, 0xffffff, 0)
          .setInteractive()
          .setDepth(20)
          .setData('col', c)
          .setData('row', r);
        this.nodeSprites[key] = { zone, highlight: null };
      }
    }
  }

  // ─── Piece Initialization ─────────────────────────────────────────────────

  _initPieces() {
    // P1 (merah) di 2.5 baris bawah = row 3,4,5 → 7*3 = 21, tapi 16 piece saja
    // P2 (biru) di 2.5 baris atas  = row 0,1,2 → 16 piece
    // Layout: row 3-5 untuk P1 (skip beberapa), row 0-2 untuk P2

    const p1Positions = this._getStartPositions(1); // bawah
    const p2Positions = this._getStartPositions(0); // atas

    p1Positions.forEach(({col, row}) => this._spawnPiece(col, row, 0));
    p2Positions.forEach(({col, row}) => this._spawnPiece(col, row, 1));
  }

  _getStartPositions(player) {
    // player 0 = P2 di atas (row 0-2), player 1 = P1 di bawah (row 3-5)
    const positions = [];
    const startRow  = player === 0 ? 0 : 3;

    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = 0; c < COLS; c++) {
        if (positions.length < 16) {
          positions.push({ col: c, row: r });
        }
      }
    }
    // hanya 16 dari 21 slot → skip 5 di tengah row ke-3
    return positions.slice(0, 16);
  }

  _spawnPiece(col, row, player) {
    const { x, y } = this._nodeXY(col, row);
    const id        = this._pieceId++;

    // Pilih texture berdasarkan player
    const texKey = player === 0 ? 'batu_merah_1' : 'batu_biru_1';
    let sprite;

    if (this.textures.exists(texKey)) {
      sprite = this.add.image(x, y, texKey).setDisplaySize(70, 70).setDepth(10);
    } else {
      // Fallback: circle
      const g = this.add.graphics().setDepth(10);
      g.fillStyle(player === 0 ? COLOR_P1 : COLOR_P2, 1);
      g.fillCircle(0, 0, 30);
      g.lineStyle(3, 0xffffff, 0.8);
      g.strokeCircle(0, 0, 30);
      sprite = this.add.container(x, y, [g]).setDepth(10);
    }

    sprite.setInteractive(new Phaser.Geom.Circle(0, 0, 35), Phaser.Geom.Circle.Contains);

    const piece = { col, row, player, sprite, id, alive: true };
    this.pieces.push(piece);
    return piece;
  }

  // ─── HUD ──────────────────────────────────────────────────────────────────

  _createHUD() {
    const W = this.scale.width;

    // Turn indicator
    this.turnBg = this.add.rectangle(W/2, 120, 700, 100, COLOR_P1, 1).setDepth(50);
    this.turnText = this.add.text(W/2, 120, 'Giliran: MERAH (Kamu)', {
      fontFamily: 'Arial Black, Arial',
      fontSize: '40px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(51);

    // Piece count
    this.p1CountText = this.add.text(60, 220, '🔴 ×16', {
      fontSize: '42px', color: '#e74c3c', fontFamily: 'Arial Black',
    }).setDepth(50);
    this.p2CountText = this.add.text(W - 60, 220, '16× 🔵', {
      fontSize: '42px', color: '#3498db', fontFamily: 'Arial Black',
    }).setOrigin(1, 0).setDepth(50);

    // Message box
    this.msgBg = this.add.rectangle(W/2, 1780, 900, 90, 0x000000, 0.6).setDepth(50);
    this.msgText = this.add.text(W/2, 1780, 'Pilih unit untuk digerakkan', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '36px',
      color: '#ffffff',
      wordWrap: { width: 860 },
    }).setOrigin(0.5).setDepth(51);

    // Back button
    this.add.text(80, 60, '← Menu', {
      fontSize: '38px', color: '#ffffff', fontFamily: 'Arial',
    }).setDepth(51).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.start('MainMenuScene'));
  }

  _updateHUD() {
    const p1Count = this.pieces.filter(p => p.player === 0 && p.alive).length;
    const p2Count = this.pieces.filter(p => p.player === 1 && p.alive).length;
    this.p1CountText.setText(`🔴 ×${p1Count}`);
    this.p2CountText.setText(`${p2Count}× 🔵`);

    const names   = ['MERAH (Kamu)', 'BIRU (Lawan)'];
    const colors  = [COLOR_P1, COLOR_P2];
    this.turnText.setText(`Giliran: ${names[this.currentTurn]}`);
    this.turnBg.setFillStyle(colors[this.currentTurn]);
  }

  _showMsg(msg) {
    this.msgText?.setText(msg);
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  _onPointerDown(pointer) {
    if (this.busy || this.gameOver) return;

    // Cari node terdekat dari pointer
    const node = this._findNearestNode(pointer.x, pointer.y, 55);
    if (!node) return;

    this._handleNodeClick(node.col, node.row);
  }

  _findNearestNode(px, py, threshold) {
    let best = null, bestDist = threshold;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const { x, y } = this._nodeXY(c, r);
        const d = Phaser.Math.Distance.Between(px, py, x, y);
        if (d < bestDist) { bestDist = d; best = { col: c, row: r }; }
      }
    }
    return best;
  }

  _handleNodeClick(col, row) {
    const clickedPiece = this._getPieceAt(col, row);

    // Multi-kill mode: hanya bisa lanjut capture
    if (this.multiKillPiece) {
      const move = this.validMoves.find(m => m.col === col && m.row === row);
      if (move) {
        this._executeMove(this.multiKillPiece, move);
      }
      return;
    }

    // Pilih piece milik current player
    if (clickedPiece && clickedPiece.player === this.currentTurn) {
      this._selectPiece(clickedPiece);
      return;
    }

    // Execute move jika ada piece terpilih
    if (this.selected) {
      const move = this.validMoves.find(m => m.col === col && m.row === row);
      if (move) {
        this._executeMove(this.selected, move);
      } else {
        // Klik bukan move valid → deselect
        this._clearSelection();
        this._showMsg('Pilih unit untuk digerakkan');
      }
    }
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  _selectPiece(piece) {
    this._clearSelection();

    // Kalau mustCapture, hanya boleh pilih piece yang bisa capture
    const moves = this._getValidMoves(piece);
    if (this.mustCapture) {
      const captureMoves = moves.filter(m => m.isCapture);
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

    // Highlight selected piece
    this._highlightNode(piece.col, piece.row, COLOR_SELECT);

    // Highlight valid moves
    this.validMoves.forEach(m => {
      this._highlightNode(m.col, m.row, m.isCapture ? COLOR_CAPTURE : COLOR_MOVE);
    });

    const action = this.mustCapture ? 'Pilih target serangan!' : 'Pilih tujuan gerakan';
    this._showMsg(action);
  }

  _clearSelection() {
    this.selected   = null;
    this.validMoves = [];
    // Hapus semua highlight
    Object.values(this.nodeSprites).forEach(ns => {
      ns.highlight?.destroy();
      ns.highlight = null;
    });
  }

  _highlightNode(col, row, color) {
    const { x, y }  = this._nodeXY(col, row);
    const key        = `${col},${row}`;
    const ns         = this.nodeSprites[key];
    if (!ns) return;
    ns.highlight?.destroy();
    ns.highlight = this.add.circle(x, y, 38, color, 0.5).setDepth(15);
    const ring = this.add.circle(x, y, 38, color, 0).setDepth(16);
    ring.setStrokeStyle(3, color, 1);
    // Kelompokkan di highlight supaya ikut di-destroy
    ns.highlight = this.add.container(0, 0, [ns.highlight, ring]).setDepth(15);
  }

  // ─── Move Calculation ─────────────────────────────────────────────────────

  _getValidMoves(piece) {
    const { col, row, player } = piece;
    const moves = [];

    // Arah gerak: semua 8 arah (horizontal, vertikal, diagonal)
    // Diagonal terbatas sesuai pattern board
    const dirs = this._getAdjacentDirs(col, row);

    dirs.forEach(([dc, dr]) => {
      const nc = col + dc;
      const nr = row + dr;
      if (!this._inBounds(nc, nr)) return;

      const target = this._getPieceAt(nc, nr);
      if (!target) {
        // Node kosong → bisa pindah
        moves.push({ col: nc, row: nr, isCapture: false, captured: null });
      } else if (target.player !== player) {
        // Ada lawan → cek apakah bisa lompat
        const jc = nc + dc;
        const jr = nr + dr;
        if (this._inBounds(jc, jr) && !this._getPieceAt(jc, jr)) {
          moves.push({ col: jc, row: jr, isCapture: true, captured: target });
        }
      }
    });

    return moves;
  }

  _getAdjacentDirs(col, row) {
    // Horizontal & vertikal selalu ada
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    // Diagonal: bergantian berdasarkan (col+row) % 2
    if ((col + row) % 2 === 0) {
      dirs.push([-1,-1],[1,1]);  // diagonal \
    } else {
      dirs.push([1,-1],[-1,1]);  // diagonal /
    }
    return dirs;
  }

  _inBounds(col, row) {
    return col >= 0 && col < COLS && row >= 0 && row < ROWS;
  }

  _getPieceAt(col, row) {
    return this.pieces.find(p => p.alive && p.col === col && p.row === row) ?? null;
  }

  // ─── Move Execution ───────────────────────────────────────────────────────

  async _executeMove(piece, move) {
    this.busy = true;
    this._clearSelection();

    const { x, y } = this._nodeXY(move.col, move.row);

    // Animasi gerak piece
    await new Promise(resolve => {
      this.tweens.add({
        targets: piece.sprite,
        x, y,
        duration: 180,
        ease: 'Power2',
        onComplete: resolve,
      });
    });

    piece.col = move.col;
    piece.row = move.row;

    // Capture
    if (move.isCapture && move.captured) {
      this._capturePiece(move.captured);
      this._showMsg(`💥 Unit lawan dimakan!`);
      await this._wait(300);

      // Cek multi-kill
      const furtherCaptures = this._getValidMoves(piece).filter(m => m.isCapture);
      if (furtherCaptures.length > 0) {
        this.multiKillPiece = piece;
        this.validMoves     = furtherCaptures;
        furtherCaptures.forEach(m => this._highlightNode(m.col, m.row, COLOR_CAPTURE));
        this._highlightNode(piece.col, piece.row, COLOR_SELECT);
        this._showMsg('🔥 Multi-Kill! Lanjutkan serangan!');
        this.busy = false;
        return;
      }
    }

    this.multiKillPiece = null;

    // Check menang
    if (this._checkWin()) {
      this.busy = false;
      return;
    }

    // Ganti giliran
    this._endTurn();
    this.busy = false;
  }

  _capturePiece(piece) {
    piece.alive = false;
    this.tweens.add({
      targets: piece.sprite,
      alpha: 0,
      scaleX: 0,
      scaleY: 0,
      duration: 250,
      onComplete: () => piece.sprite.destroy(),
    });
    this._updateHUD();
  }

  async _endTurn() {
    this.currentTurn = 1 - this.currentTurn;
    this._updateHUD();

    // Cek apakah player baru punya mandatory capture
    const playerPieces = this.pieces.filter(p => p.alive && p.player === this.currentTurn);
    const allCaptures  = playerPieces.flatMap(p => this._getValidMoves(p).filter(m => m.isCapture));

    if (allCaptures.length > 0) {
      this.mustCapture = true;
      this._showMsg('⚠️ Kamu WAJIB menyerang! Pilih unit yang bisa menyerang.');
    } else {
      this.mustCapture = false;
      this._showMsg('Pilih unit untuk digerakkan');
    }
  }

  _checkWin() {
    const p1Alive = this.pieces.filter(p => p.alive && p.player === 0).length;
    const p2Alive = this.pieces.filter(p => p.alive && p.player === 1).length;

    if (p1Alive === 0) { this._showWinner(1); return true; }
    if (p2Alive === 0) { this._showWinner(0); return true; }
    return false;
  }

  _showWinner(player) {
    this.gameOver = true;
    const W = this.scale.width;
    const H = this.scale.height;
    const names  = ['MERAH', 'BIRU'];
    const colors = [COLOR_P1, COLOR_P2];

    // Overlay
    this.add.rectangle(W/2, H/2, W, H, 0x000000, 0.7).setDepth(200);

    this.add.rectangle(W/2, H/2, 800, 500, colors[player], 1).setDepth(201);
    this.add.text(W/2, H/2 - 80, '🏆 MENANG!', {
      fontFamily: 'Arial Black', fontSize: '90px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(202);
    this.add.text(W/2, H/2 + 30, `Pemain ${names[player]}`, {
      fontFamily: 'Arial Black', fontSize: '56px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(202);

    // Tombol main lagi
    this.add.rectangle(W/2, H/2 + 170, 500, 100, 0x27ae60, 1)
      .setDepth(202)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.scene.restart());

    this.add.text(W/2, H/2 + 170, 'Main Lagi', {
      fontFamily: 'Arial Black', fontSize: '48px', color: '#fff',
    }).setOrigin(0.5).setDepth(203);
  }

  _wait(ms) {
    return new Promise(r => this.time.delayedCall(ms, r));
  }
}
