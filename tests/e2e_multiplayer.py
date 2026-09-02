#!/usr/bin/env python3
"""
E2E Multiplayer Test — Udinus Dam-Daman
Uses async_playwright + asyncio.gather for TRUE parallel 2-client Photon matchmaking.
REAL Photon connection (no mocks). Same pattern as ular-tangga e2e_multiplayer.py.
"""
import asyncio
import sys
from playwright.async_api import async_playwright

URL = "https://demo.leolitgames.com/udinus-dam-daman/1.0.0/"

results = []

def log(msg):
    print(f"  {msg}")
    results.append(msg)

def check(label, cond, detail=""):
    status = "✅" if cond else "❌"
    msg = f"{status} {label}" + (f" — {detail}" if detail else "")
    log(msg)
    return cond

async def setup_page(browser, name):
    pg = await browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    pg.on("pageerror", lambda e: errors.append(f"[{name}] PAGEERROR: {e}"))
    pg.on("console", lambda m: errors.append(f"[{name}] ERR: {m.text}") if m.type == "error" else None)
    return pg, errors

async def wait_game_ready(pg):
    await pg.wait_for_function("() => !!window.__game", timeout=20000)
    await pg.wait_for_timeout(2000)

async def get_active_scenes(pg):
    try:
        return await pg.evaluate(
            "() => window.__game?.scene?.scenes?.filter(s=>s.scene?.settings?.active)?.map(s=>s.scene?.key)"
        ) or []
    except:
        return []

async def get_game_state(pg):
    try:
        return await pg.evaluate("""() => {
            const s = window.__gameScene;
            if (!s) return null;
            return {
                gameMode: s.gameMode,
                myPlayerIdx: s.myPlayerIdx,
                currentTurn: s.currentTurn,
                busy: s.busy,
                gameOver: s.gameOver,
                pieces: s.pieces.filter(p => p.alive).length,
            };
        }""")
    except:
        return None

async def start_matchmaking(pg, username):
    await pg.evaluate(f"""() => {{
        window.__game.registry.set('playerName', '{username}');
        window.__game.scene.start('MatchmakingScene');
    }}""")

async def wait_game_scene(pg, timeout=45):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        st = await get_game_state(pg)
        if st and st.get('gameMode') == 'online':
            return True
        await asyncio.sleep(0.5)
    return False

async def wait_for(pg, fn_js, timeout=10):
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            if await pg.evaluate(fn_js):
                return True
        except:
            pass
        await asyncio.sleep(0.3)
    return False

async def wait_matchmaking_ready(pg, timeout=15):
    """Tunggu MatchmakingScene aktif dan Photon connect mulai."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        try:
            mm = await pg.evaluate("() => !!window.__matchmakingScene")
            if mm:
                return True
        except:
            pass
        await asyncio.sleep(0.3)
    return False

async def run_matchmaking_phase(pg1, pg2):
    await start_matchmaking(pg1, "PlayerA")
    await asyncio.sleep(0.4)
    await start_matchmaking(pg2, "PlayerB")

    # Tunggu MatchmakingScene aktif dulu
    mm1 = await wait_matchmaking_ready(pg1)
    mm2 = await wait_matchmaking_ready(pg2)
    if not mm1 or not mm2:
        return False, False

    # Both should reach GameScene online
    g1 = await wait_game_scene(pg1, timeout=50)
    g2 = await wait_game_scene(pg2, timeout=50)
    return g1, g2

async def verify_move_sync(pg_master, pg_other):
    """Master (myPlayerIdx=0/merah, first turn) executes a move, verify synced to other."""
    # Wait for master's turn
    ok_start = await wait_for(pg_master, "() => window.__gameScene && window.__gameScene.currentTurn === window.__gameScene.myPlayerIdx && !window.__gameScene.busy")
    if not ok_start:
        return False, [False, "master never got turn"]

    # Execute a move on master (bypass tween — __forceMove instant, real Photon sendMove)
    executed = await pg_master.evaluate("""() => {
        const s = window.__gameScene;
        if (!s || s.currentTurn !== s.myPlayerIdx || s.busy || s.gameOver) return false;
        const piece = s.pieces.find(p => p.player === s.myPlayerIdx && p.alive);
        if (!piece) return false;
        const moves = s._getValidMoves(piece);
        const move = moves.find(m => !m.isCapture) || moves[0];
        if (!move) return false;
        window.__lastMove = { pieceId: piece.id, from: piece.node, to: move.to, capturedId: move.captured ? move.captured.id : null };
        s.__forceMove(piece, move);
            return true;
        }""")

    # Ambil lastMove dari master setelah __forceMove
    last_move = await pg_master.evaluate("() => window.__lastMove ? {...window.__lastMove} : null")
    if not last_move:
        check("T03a2 move captured on master", False, "no __lastMove")
        return False, [False, "no __lastMove"]
    check("T03a2 move captured on master", True, f"pieceId={last_move['pieceId']} from={last_move['from']} to={last_move['to']}")

    # T03a1: cek turn master — harus advance ke 1 setelah forceMove
    master_state = await get_game_state(pg_master)
    if master_state:
        check("T03a1 master turn advanced", master_state['currentTurn'] != 0, f"turn={master_state['currentTurn']}")

    # Verify other client received it — piece moved on their board (via real Photon MOVE_PIECE event)
    pid  = last_move['pieceId']
    dest = last_move['to']
    ok_recv = await wait_for(pg_other, f"""() => {{
        const s = window.__gameScene;
        if (!s) return false;
        const piece = s.pieces.find(p => p.id === {pid});
        return piece && piece.node === {dest};
    }}""", timeout=12)
    check("T03a3 move synced to other", ok_recv, f"pieceId={pid} expected node={dest}")
    return ok_recv, [ok_recv, "move not synced to other"]

async def verify_game_over(pg_winner, pg_loser):
    """Winner triggers game over, verify loser shows winner modal."""
    await pg_winner.evaluate("() => { const s = window.__gameScene; if (s && s._showWinner) s._showWinner(s.myPlayerIdx); }")
    await asyncio.sleep(2)
    # Verify loser got gameOver via photon
    ok = await wait_for(pg_loser, "() => window.__gameScene?.gameOver === true", timeout=10)
    return ok

async def verify_player_left_handling(pg1, pg2):
    """Disconnect one, verify other shows opponent-left overlay."""
    await pg2.evaluate("() => { const s = window.__gameScene; if (s && s.photon) s.photon.disconnect(); }")
    # The other side should set gameOver/opponent-left
    ok = await wait_for(pg1, "() => window.__gameScene?.gameOver === true || !!window.__gameScene?._opponentLeftShown", timeout=10)
    return ok

async def run_tests():
    print("\n" + "="*60)
    print("  UDINUS DAM-DAMAN — REAL PHOTON MULTIPLAYER E2E")
    print("  (2 real clients, real Photon connection, no mocks)")
    print("="*60 + "\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-webgl"],
        )

        pg1, err1 = await setup_page(browser, "P1")
        pg2, err2 = await setup_page(browser, "P2")

        await asyncio.gather(
            pg1.goto(URL, wait_until="networkidle", timeout=40000),
            pg2.goto(URL, wait_until="networkidle", timeout=40000),
        )
        await asyncio.gather(wait_game_ready(pg1), wait_game_ready(pg2))

        # Bundle check
        b1 = await pg1.evaluate("() => [...document.scripts].map(s=>s.src).find(u=>u.includes('index'))")
        check("T00a bundle loaded P1", bool(b1), b1 or "none")

        # ── T01: Real matchmaking (both start) ──
        print("\n── T01: Real Photon Matchmaking ──")
        g1, g2 = await run_matchmaking_phase(pg1, pg2)
        check("T01a P1 → GameScene online", g1)
        check("T01b P2 → GameScene online", g2)

        if not (g1 and g2):
            log("❌ Matchmaking failed — check Photon connectivity & app id")
            # Dump matchmaking status
            for pg, nm in [(pg1,"P1"),(pg2,"P2")]:
                mm_state = await pg.evaluate("() => window.__matchmakingScene?.photon?.getState?.() ?? 'N/A'")
                log(f"  {nm} matchmaking state: {mm_state}")
            await browser.close()
            await _summary()
            return 1

        await asyncio.sleep(1.5)

        # ── T02: Initial state ──
        print("\n── T02: Initial Game State ──")
        s1 = await get_game_state(pg1)
        s2 = await get_game_state(pg2)
        check("T02a state P1 online", s1 and s1.get('gameMode') == 'online')
        check("T02b state P2 online", s2 and s2.get('gameMode') == 'online')
        if s1 and s2:
            check("T02c myPlayerIdx differ", s1['myPlayerIdx'] != s2['myPlayerIdx'], f"P1={s1['myPlayerIdx']} P2={s2['myPlayerIdx']}")
            check("T02d 32 pieces total (16+16)", s1['pieces'] == 32 and s2['pieces'] == 32, f"P1={s1['pieces']} P2={s2['pieces']}")
            check("T02e turn 0 first", s1['currentTurn'] == 0, f"P1 turn={s1['currentTurn']}")

        # Determine master (first turn = myPlayerIdx 0)
        master_pg = pg1 if s1 and s1['myPlayerIdx'] == 0 else pg2
        other_pg  = pg2 if master_pg == pg1 else pg1
        master_nm = "P1" if master_pg == pg1 else "P2"

        # ── T03: Move sync (master → other) ──
        print(f"\n── T03: Move Sync ({master_nm} → other) ──")
        ok_sync, detail = await verify_move_sync(master_pg, other_pg)
        check("T03a master move executed & synced", ok_sync, str(detail))

        # Sanity: screenshot both boards
        await asyncio.gather(
            master_pg.screenshot(path="/tmp/dd_mp_master.png"),
            other_pg.screenshot(path="/tmp/dd_mp_other.png"),
        )
        check("T03b screenshots saved", True, "/tmp/dd_mp_master.png, /tmp/dd_mp_other.png")

        # ── T04: Turn switched ──
        print("\n── T04: Turn Switching ──")
        s_after = await get_game_state(master_pg)
        check("T04 turn advanced", s_after and s_after['currentTurn'] == 1, str(s_after.get('currentTurn') if s_after else None))

        # ── T05: Game over broadcast ──
        print("\n── T05: Game Over Broadcast ──")
        ok_go = await verify_game_over(master_pg, other_pg)
        check("T05a game over synced to other", ok_go)

        # ── T06: Page errors ──
        print("\n── T06: Page Errors ──")
        critical = [e for e in (err1 + err2) if any(k in e for k in ['QueueOp','Cannot read','Uncaught TypeError','is not a function','undefined'])]
        check("T06 no critical errors", len(critical) == 0, f"{critical[:3]}")

        await browser.close()

    await _summary()
    return 0 if all(not r.startswith("❌") for r in results) else 1

async def _summary():
    print("\n" + "="*60)
    passed = sum(1 for r in results if r.startswith("✅"))
    failed = sum(1 for r in results if r.startswith("❌"))
    print(f"  PASSED: {passed}  FAILED: {failed}  TOTAL: {passed+failed}")
    print("="*60)
    for r in results:
        if r.startswith("❌"):
            print(f"  {r}")

if __name__ == "__main__":
    code = asyncio.run(run_tests())
    sys.exit(code)
