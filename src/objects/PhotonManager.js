/**
 * PhotonManager — Dam-Daman 1v1 online via Photon Realtime.
 *
 * Strategy: deterministic room name per 5-min window → both clients
 * try joinRoom → first one creates (32758 → createRoom), second joins.
 *
 * Events:
 *   1 = GAME_START   { firstTurn: 0 }   master kirim saat 2 player joined
 *   2 = MOVE_PIECE   { pieceId, from, to, capturedId }
 *   3 = GAME_OVER    { winner: 0|1 }
 *   4 = PLAYER_LEFT  {}
 */
import { LoadBalancing, ConnectionProtocol } from 'photon-realtime';

const APP_ID      = '32e9905a-9869-4578-8202-05f7929a1c07';
const APP_VERSION = '2.0-dd';
const REGION      = 'asia';

export const EV = {
  GAME_START:  1,
  MOVE_PIECE:  2,
  GAME_OVER:   3,
  PLAYER_LEFT: 4,
};

const ROOM_OPTIONS = { maxPlayers: 2, isOpen: true, isVisible: true };

export class PhotonManager {
  constructor() {
    this.client = new LoadBalancing.LoadBalancingClient(
      ConnectionProtocol.Wss, APP_ID, APP_VERSION,
    );
    this.client.setRegion?.(REGION);

    // Callbacks — assign dari luar
    this.onStateChange     = null;
    this.onPlayerJoined    = null;
    this.onPlayerLeft      = null;
    this.onGameStart       = null;
    this.onMoveReceived    = null;
    this.onGameOver        = null;
    this.onMatchmakingFail = null;

    this._roomName  = null;
    this._username  = null;
    this.myRoomActorCount = 0;
  }

  connect(username) {
    this._username = username;
    this._gameStartSent = false; // guard double _sendGameStart
    const c = this.client;
    c.setUserId(username);
    // Room per 5-menit window — kedua client generate nama sama
    this._roomName = 'dd-' + Math.floor(Date.now() / (5 * 60 * 1000));

    c.onStateChange = (state) => {
      const name = this._stateName(state);
      console.log('[Photon] state:', name);
      this.onStateChange?.(name);
      if (state === 4) { // JoinedLobby
        console.log('[Photon] joining room:', this._roomName);
        try { c.joinRoom(this._roomName, ROOM_OPTIONS); }
        catch (e) { this._tryCreateRoom(); }
      }
    };

    c.onOperationResponse = (errCode, errMsg, opCode) => {
      if (errCode === 0) return;
      console.warn('[Photon] op error', opCode, errCode, errMsg);
      if (errCode === 32758) {
        // Room not found → create
        console.log('[Photon] room not found → creating:', this._roomName);
        this._tryCreateRoom();
      } else if (errCode === 32766) {
        // Room full → try next slot
        this._roomName = 'dd-' + (Math.floor(Date.now() / (5 * 60 * 1000)) + 1);
        console.log('[Photon] room full → trying next:', this._roomName);
        try { c.joinRoom(this._roomName, ROOM_OPTIONS); }
        catch (e) { this._tryCreateRoom(); }
      } else {
        this.onMatchmakingFail?.(`Error ${errCode}: ${errMsg}`);
      }
    };

    c.onError = (errCode, errMsg) => {
      console.error('[Photon] peer error', errCode, errMsg);
      this.onMatchmakingFail?.(`Koneksi gagal: ${errMsg}`);
    };

    c.onJoinRoom = (createdByMe) => {
      const n = c.myRoomActorCount();
      this.myRoomActorCount = n;
      console.log('[Photon] joined room:', c.myRoom().name, 'actors:', n, 'created:', createdByMe);
      if (n >= 2 && this.isMaster()) {
        this._sendGameStart();
      }
    };

    c.onActorJoin = (actor) => {
      const uname = actor.getCustomProperty?.('name') || actor.userId || 'Player';
      this.myRoomActorCount = c.myRoomActorCount();
      console.log('[Photon] actor join:', actor.actorNr, uname);
      this.onPlayerJoined?.(actor.actorNr, uname);
      if (this.myRoomActorCount >= 2 && this.isMaster()) {
        this._sendGameStart();
      }
    };

    c.onActorLeave = (actor) => {
      this.myRoomActorCount = c.myRoomActorCount();
      console.log('[Photon] actor left:', actor.actorNr);
      this.onPlayerLeft?.(actor.actorNr);
    };

    c.onEvent = (code, content, actorNr) => {
      console.log('[Photon] event', code, content, 'from', actorNr);
      if (code === EV.GAME_START)  this.onGameStart?.(content);
      if (code === EV.MOVE_PIECE)  this.onMoveReceived?.(content);
      if (code === EV.GAME_OVER)   this.onGameOver?.(content);
      if (code === EV.PLAYER_LEFT) this.onPlayerLeft?.();
    };

    c.connectToRegionMaster(REGION);
  }

  // Kirim move ke lawan
  sendMove(pieceId, from, to, capturedId) {
    try {
      this.client.raiseEvent(EV.MOVE_PIECE, { pieceId, from, to, capturedId: capturedId ?? null }, { receivers: 0 });
    } catch (e) { console.warn('[Photon] sendMove failed', e); }
  }

  // Kirim game over
  sendGameOver(winner) {
    try {
      this.client.raiseEvent(EV.GAME_OVER, { winner }, { receivers: 0 });
    } catch (e) { console.warn('[Photon] sendGameOver failed', e); }
  }

  disconnect() {
    try { this.client.disconnect(); } catch (_) {}
  }

  // Master = actor 1, Joiner = actor 2
  // Master = P0 (merah), Joiner = P1 (biru)
  isMaster() {
    try { return this.client.myActor().actorNr === this.client.myRoomMasterActorNr(); }
    catch (_) { return false; }
  }

  myPlayerIdx() {
    // Master = 0 (merah/bawah), Joiner = 1 (biru/atas)
    return this.isMaster() ? 0 : 1;
  }

  _tryCreateRoom() {
    try { this.client.createRoom(this._roomName, ROOM_OPTIONS); }
    catch (e) { this.onMatchmakingFail?.('Gagal membuat ruang.'); }
  }

  _sendGameStart() {
    if (this._gameStartSent) return; // prevent double fire
    this._gameStartSent = true;
    const payload = { firstTurn: 0 }; // merah selalu mulai
    // receivers: 1 = All (termasuk sender)
    this.client.raiseEvent(EV.GAME_START, payload, { receivers: 1 });
    // Trigger lokal kalau SDK exclude sender
    this.onGameStart?.(payload);
  }

  _stateName(s) {
    return ({
      0:'Uninitialized', 1:'PeerCreated', 2:'Queued', 3:'Authenticated',
      4:'JoinedLobby', 5:'Disconnecting', 6:'Disconnected', 7:'ConnectingToGameserver',
      8:'ConnectingToMasterserver', 9:'ConnectedToMaster', 10:'ConnectedToGameserver',
      11:'Joined', 12:'ConnectingToNameServer', 13:'ConnectedToNameServer',
    })[s] ?? `State(${s})`;
  }
}
