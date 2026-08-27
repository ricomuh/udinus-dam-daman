// Scale helper — same pattern as ular tangga
export function initScale(scene) {
  const { width, height } = scene.scale;
  const scaleX = width  / 1080;
  const scaleY = height / 1920;
  const scale  = Math.min(scaleX, scaleY);
  scene._scale = scale;
  scene._ox    = (width  - 1080 * scale) / 2;
  scene._oy    = (height - 1920 * scale) / 2;
}

export function sx(scene, x) { return scene._ox + x * scene._scale; }
export function sy(scene, y) { return scene._oy + y * scene._scale; }
export function ss(scene, s) { return s * scene._scale; }
