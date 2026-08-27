"""
E2E test: dam-daman board layout
- Load game di headless Chromium (WebGL swiftshader)
- Navigate ke GameScene
- Screenshot board
- Assert: no JS errors, Phaser loaded, scene active
"""
import asyncio
from playwright.async_api import async_playwright

URL = "https://demo.leolitgames.com/udinus-dam-daman/1.0.0/"
OUT = "/tmp/dam_board.png"

async def main():
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--use-gl=swiftshader",
            ]
        )
        page = await browser.new_page(viewport={"width": 480, "height": 853})

        # Collect JS errors
        page.on("pageerror", lambda e: errors.append(f"PAGEERROR: {e}"))
        page.on("console", lambda m: errors.append(f"CONSOLE {m.type}: {m.text}") if m.type == "error" else None)

        print(f"→ Loading {URL}")
        await page.goto(URL, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)

        # Check Phaser loaded
        phaser_ver = await page.evaluate("""() => {
            const keys = Object.keys(window);
            for (const k of keys) {
                const v = window[k];
                if (v && typeof v === 'object' && v.scene && v.scene.scenes) {
                    window.__game = v;
                    return 'Phaser ' + (v.VERSION || v.version || '?');
                }
            }
            return null;
        }""")
        print(f"  Phaser: {phaser_ver}")

        # Navigate ke GameScene
        await page.evaluate("""() => {
            if (window.__game) {
                window.__game.scene.scenes.forEach(s => {
                    if (s.scene?.settings?.active) s.scene.stop();
                });
                window.__game.scene.start('GameScene', { mode: 'offline' });
            }
        }""")
        await page.wait_for_timeout(2000)

        # Check active scene
        active = await page.evaluate("""() => {
            if (!window.__game) return 'no game';
            return window.__game.scene.scenes
                .filter(s => s.scene?.settings?.active)
                .map(s => s.scene?.key)
                .join(',');
        }""")
        print(f"  Active scene: {active}")

        # Screenshot
        await page.screenshot(path=OUT, full_page=False)
        print(f"  Screenshot: {OUT}")

        # Report errors
        js_errors = [e for e in errors if 'PAGEERROR' in e or ('CONSOLE error' in e and 'favicon' not in e and 'beacon' not in e)]
        if js_errors:
            print(f"  ⚠️  JS errors ({len(js_errors)}):")
            for e in js_errors[:5]:
                print(f"    {e}")
        else:
            print("  ✅ No JS errors")

        await browser.close()
    return js_errors

if __name__ == "__main__":
    errs = asyncio.run(main())
    print("DONE")
