/**
 * ScaleHelper v2 — responsive scaling untuk canvas FHD 1080×1920
 *
 * Design base: 390×844 (desain asli mobile)
 * 
 * Aturan:
 * - Posisi (S/SY): proporsional ke canvas (1080/390 = 2.77, 1920/844 = 2.27)
 * - Ukuran asset (SF/SW/SH): × 3 dari desain asli — biar elemen tampil
 *   JAUH LEBIH BESAR di canvas FHD (user request: "asset discale 3x")
 *
 * Usage di scene:
 *   import { initScale, S, SY, SF, SW, SH } from '../utils/ScaleHelper.js';
 *   create() { initScale(this); ... }
 *   const btn = this.add.image(S(195), SY(422), 'btn');
 *   btn.setDisplaySize(SW(200), SH(60));   // ukuran 3x dari design 200×60
 *   fontSize: `${SF(32)}px`                 // font 3x dari 32px
 */

const DESIGN_WIDTH = 390;
const DESIGN_HEIGHT = 844;
const UI_SCALE = 3; // multiplier ukuran asset

let scaleX = 1;
let scaleY = 1;

/**
 * Init scale factors — panggil sekali di awal scene.create()/preload()
 * @param {Phaser.Scene} scene
 */
export function initScale(scene) {
  const { width, height } = scene.scale;
  scaleX = width / DESIGN_WIDTH;
  scaleY = height / DESIGN_HEIGHT;
}

/** Scale X coordinate (proporsional) */
export function S(x) {
  return x * scaleX;
}

/** Scale Y coordinate (proporsional) */
export function SY(y) {
  return y * scaleY;
}

/** Scale font size — 3x dari design asli */
export function SF(size) {
  return size * UI_SCALE;
}

/** Scale width — 3x dari design asli */
export function SW(w) {
  return w * UI_SCALE;
}

/** Scale height — 3x dari design asli */
export function SH(h) {
  return h * UI_SCALE;
}

export const SCALE_INFO = {
  DESIGN_WIDTH,
  DESIGN_HEIGHT,
  UI_SCALE,
  get scaleX() { return scaleX; },
  get scaleY() { return scaleY; },
};
