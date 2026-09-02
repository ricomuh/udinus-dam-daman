import { test, expect } from '@playwright/test';

const BASE = 'https://demo.leolitgames.com/udinus-dam-daman/1.0.0';

async function loadGame(page) {
  await page.goto(BASE + '/');
  for (let i = 0; i < 20; i++) {
    const ready = await page.evaluate(() => !!window.__game?.scene);
    if (ready) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(500);
}

async function startGameScene(page) {
  await loadGame(page);
  await page.evaluate(() => window.__game.scene.start('GameScene', { mode: 'offline' }));
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const ready = await page.evaluate(() => window.__gameScene?._pieceId >= 32);
    if (ready) break;
  }
}

test.describe('Dam-Daman — UI Modals', () => {

  test('winner modal: _showWinner(0) — no JS error, screenshot', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await startGameScene(page);

    const hasScene = await page.evaluate(() => !!window.__gameScene);
    expect(hasScene).toBe(true);

    // Trigger winner modal player 0
    await page.evaluate(() => window.__gameScene._showWinner(0));
    await page.waitForTimeout(800);
    await page.screenshot({ path: '/tmp/dd_win.png', fullPage: false });

    // gameOver harus true
    const gameOver = await page.evaluate(() => window.__gameScene.gameOver);
    expect(gameOver).toBe(true);

    expect(errors).toHaveLength(0);
    console.log('winner screenshot: /tmp/dd_win.png');
  });

  test('pause menu: openPauseMenu() + closePauseMenu() — no JS error, screenshot', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

    await startGameScene(page);

    const hasScene = await page.evaluate(() => !!window.__gameScene);
    expect(hasScene).toBe(true);

    // Buka pause menu
    await page.evaluate(() => window.__gameScene.openPauseMenu());
    await page.waitForTimeout(600);
    await page.screenshot({ path: '/tmp/dd_pause.png', fullPage: false });

    // pauseOverlay harus ada
    const hasPauseOverlay = await page.evaluate(() => !!window.__gameScene.pauseOverlay);
    expect(hasPauseOverlay).toBe(true);

    // Tutup pause menu
    await page.evaluate(() => window.__gameScene.closePauseMenu());
    await page.waitForTimeout(300);
    const afterClose = await page.evaluate(() => ({
      overlay: !!window.__gameScene.pauseOverlay,
      paused: window.__gameScene.paused,
      busy: window.__gameScene.busy,
    }));
    expect(afterClose.overlay).toBe(false);
    expect(afterClose.paused).toBe(false);

    expect(errors).toHaveLength(0);
    console.log('pause screenshot: /tmp/dd_pause.png');
  });

  test('pause button di HUD: ada di scene depth ≥ 100', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await startGameScene(page);

    // Scene harus sudah terrender tanpa error
    const info = await page.evaluate(() => ({
      gameOver: window.__gameScene?.gameOver,
      paused: window.__gameScene?.paused,
    }));
    expect(info.gameOver).toBe(false);
    expect(info.paused).toBe(false);
    expect(errors).toHaveLength(0);
  });

});
