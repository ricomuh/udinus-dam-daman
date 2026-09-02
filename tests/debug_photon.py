"""Debug real Photon MOVE_PIECE event flow."""
import asyncio
from playwright.async_api import async_playwright

URL = "https://demo.leolitgames.com/udinus-dam-daman/1.0.0/"

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage","--disable-webgl"]
        )
        async def mk(name):
            pg = await b.new_page(viewport={"width":390,"height":844})
            errs = []
            pg.on("pageerror", lambda e: errs.append(f"[{name}] {e}"))
            pg.on("console", lambda m: print(f"[{name}][{m.type}] {m.text}") if m.type in ("error","warn","log") else None)
            return pg, errs

        pg1, e1 = await mk("P1")
        pg2, e2 = await mk("P2")

        await pg1.goto(URL, wait_until="networkidle", timeout=40000)
        await pg2.goto(URL, wait_until="networkidle", timeout=40000)
        for pg in (pg1, pg2):
            await pg.wait_for_function("() => !!window.__game", timeout=20000)
            await pg.wait_for_timeout(1500)

        # Start matchmaking
        await pg1.evaluate("() => { window.__game.registry.set('playerName','PA'); window.__game.scene.start('MatchmakingScene'); }")
        await asyncio.sleep(0.4)
        await pg2.evaluate("() => { window.__game.registry.set('playerName','PB'); window.__game.scene.start('MatchmakingScene'); }")

        # Wait GameScene
        async def wait_gs(pg, timeout=50):
            for _ in range(int(timeout/0.5)):
                st = await pg.evaluate("""() => {
                    const s = window.__gameScene;
                    return s && s.gameMode === 'online' ? {i: s.myPlayerIdx, t: s.currentTurn, busy: s.busy} : null;
                }""")
                if st: return st
                await asyncio.sleep(0.5)
            return None

        s1 = await wait_gs(pg1)
        s2 = await wait_gs(pg2)
        print(f"P1: {s1}  P2: {s2}")
        if not (s1 and s2):
            print("MATCHMAKING FAILED"); await b.close(); return

        # Hook raw Photon onEvent to count MOVE_PIECE
        for pg, nm in [(pg1,"P1"),(pg2,"P2")]:
            await pg.evaluate(f"""() => {{
                const s = window.__gameScene;
                window.__photonEvents = [];
                if (!s.photon) {{ console.log('{nm} no photon'); return; }}
                const orig = s.photon.client.onEvent;
                s.photon.client.onEvent = function(code, content, actorNr) {{
                    window.__photonEvents.push({{code, content: JSON.stringify(content), actorNr}});
                    console.log('{nm} raw event code=' + code + ' actorNr=' + actorNr);
                    if (orig) orig.call(this, code, content, actorNr);
                }};
                // Also hook onMoveReceived
                window.__moveRecvCount = 0;
                const origMR = s.photon.onMoveReceived;
                s.photon.onMoveReceived = (data) => {{
                    window.__moveRecvCount++;
                    window.__lastMoveRecvData = data;
                    console.log('{nm} onMoveReceived', JSON.stringify(data));
                    if (origMR) origMR(data);
                }};
            }}""")

        # Determine master
        master = pg1 if s1['i'] == 0 else pg2
        other  = pg2 if master is pg1 else pg1
        mn = "P1" if master is pg1 else "P2"
        print(f"master={mn} myPlayerIdx=0")

        # Execute move via __forceMove
        result = await master.evaluate("""() => {
            const s = window.__gameScene;
            if (!s || s.currentTurn !== s.myPlayerIdx || s.busy) return {ok:false, reason:'turn/busy', t:s.currentTurn, i:s.myPlayerIdx, busy:s.busy};
            const piece = s.pieces.find(p => p.player === s.myPlayerIdx && p.alive);
            if (!piece) return {ok:false, reason:'no piece'};
            const moves = s._getValidMoves(piece);
            const move = moves.find(m => !m.isCapture) || moves[0];
            if (!move) return {ok:false, reason:'no move'};
            window.__lastMove = {pieceId: piece.id, from: piece.node, to: move.to, capturedId: null};
            s.__forceMove(piece, move);
            return {ok:true, pieceId:piece.id, from:piece.node, to:move.to};
        }""")
        print(f"execute on master: {result}")

        await asyncio.sleep(4)

        # Check results
        for pg, nm in [(master, mn), (other, "other")]:
            ev_count = await pg.evaluate("() => (window.__photonEvents||[]).length")
            mv_count = await pg.evaluate("() => window.__moveRecvCount ?? 0")
            last_recv = await pg.evaluate("() => JSON.stringify(window.__lastMoveRecvData ?? null)")
            photon_ok = await pg.evaluate("() => !!window.__gameScene?.photon")
            turn = await pg.evaluate("() => window.__gameScene?.currentTurn")
            print(f"{nm}: raw_events={ev_count} moveRecv={mv_count} lastRecv={last_recv} photon={photon_ok} turn={turn}")

        print("P1 errs:", e1[:3])
        print("P2 errs:", e2[:3])
        await b.close()

asyncio.run(run())
