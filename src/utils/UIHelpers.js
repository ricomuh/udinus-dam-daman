// Helpers UI bersama — dipakai semua scene supaya animasi tombol & modal konsisten.

/**
 * Attach consistent hover/press scale animations to a button.
 * All `parts` (frame + icon + text) scale together using their base scale as anchor.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.GameObject} btn   The interactive game object (receives events).
 * @param {Phaser.GameObjects.GameObject[]} parts All visual parts to scale together (include `btn`).
 * @param {object} [opts]
 * @param {number} [opts.hoverMul=1.06] Scale multiplier on hover.
 * @param {number} [opts.downMul=0.95]  Scale multiplier when pressed.
 * @param {number} [opts.duration=120]  Tween duration in ms.
 * @param {() => boolean} [opts.enabled] Optional gate: if returns false, hover/down are ignored.
 * @param {(state:'over'|'out'|'down'|'up') => void} [opts.onState] Optional state hook.
 */
export function attachHoverScale(scene, btn, parts, opts = {}) {
  const hoverMul = opts.hoverMul ?? 1.06;
  const downMul = opts.downMul ?? 0.95;
  const duration = opts.duration ?? 120;
  const enabled = opts.enabled ?? (() => true);

  const items = parts.map((p) => ({
    obj: p,
    baseX: p.scaleX,
    baseY: p.scaleY,
  }));

  const tweenTo = (mul) => {
    items.forEach(({ obj, baseX, baseY }) => {
      scene.tweens.add({
        targets: obj,
        scaleX: baseX * mul,
        scaleY: baseY * mul,
        duration,
        ease: 'Sine.easeOut',
      });
    });
  };

  btn.on('pointerover', () => { if (enabled()) { tweenTo(hoverMul); opts.onState?.('over'); } });
  btn.on('pointerout',  () => { tweenTo(1);  opts.onState?.('out'); });
  btn.on('pointerdown', () => { if (enabled()) { tweenTo(downMul); opts.onState?.('down'); } });
  btn.on('pointerup',   () => { if (enabled()) { tweenTo(hoverMul); opts.onState?.('up'); } });

  // Reset helper supaya caller bisa paksa kembali ke base scale (mis. saat tombol jadi disabled).
  return {
    reset: () => {
      items.forEach(({ obj, baseX, baseY }) => {
        scene.tweens.killTweensOf(obj);
        obj.setScale(baseX, baseY);
      });
    },
  };
}

/**
 * Play a polished open animation on a modal container (popup window + its contents).
 * - Overlay fades in.
 * - Popup pops in with a back-ease scale (from 0.7) and slides up slightly.
 *
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Container} overlay The full overlay container (incl. dim background).
 * @param {Phaser.GameObjects.GameObject} popup   The main popup frame (scaled & slid).
 * @param {object} [opts]
 * @param {number} [opts.duration=320]
 * @param {number} [opts.slide=18]      Pixels to slide up from.
 * @param {number} [opts.fromScale=0.7]
 */
export function playModalOpen(scene, overlay, popup, opts = {}) {
  const duration = opts.duration ?? 320;
  const slide = opts.slide ?? 18;
  const fromScale = opts.fromScale ?? 0.7;

  const targetY = popup.y;
  overlay.setAlpha(0);
  popup.setScale(fromScale);
  popup.y = targetY + slide;

  scene.tweens.add({
    targets: overlay,
    alpha: 1,
    duration: Math.min(220, duration),
    ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: popup,
    scaleX: 1,
    scaleY: 1,
    y: targetY,
    duration,
    ease: 'Back.easeOut',
  });
}
