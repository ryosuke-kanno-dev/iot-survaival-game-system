// ==========================================
// game-state.js - ゲーム状態管理（最終確定版）
// ==========================================

export const GAME_STATES = Object.freeze({
  IDLE:       'IDLE',
  CONNECTING: 'CONNECTING',
  READY:      'READY',
  PLAYING:    'PLAYING',
  DOWN:       'DOWN',
  END:        'END'
});

const STATE_TO_SCREEN = Object.freeze({
  [GAME_STATES.IDLE]:       'screen-connect',
  [GAME_STATES.CONNECTING]: 'screen-connect',
  [GAME_STATES.READY]:      'screen-connect',
  [GAME_STATES.PLAYING]:    'screen-game',
  [GAME_STATES.DOWN]:       'screen-game',
  [GAME_STATES.END]:        'screen-end'
});

const VALID_TRANSITIONS = Object.freeze({
  [GAME_STATES.IDLE]: [
    GAME_STATES.CONNECTING
  ],
  [GAME_STATES.CONNECTING]: [
    GAME_STATES.READY,
    GAME_STATES.IDLE
  ],
  [GAME_STATES.READY]: [
    GAME_STATES.PLAYING,
    GAME_STATES.CONNECTING,
    GAME_STATES.IDLE
  ],
  [GAME_STATES.PLAYING]: [
    GAME_STATES.DOWN,
    GAME_STATES.END
  ],
  [GAME_STATES.DOWN]: [
    GAME_STATES.PLAYING,
    GAME_STATES.END
  ],
  [GAME_STATES.END]: [
    GAME_STATES.IDLE
  ]
});

const MAX_HISTORY_SIZE = 50;

class GameState {
  #currentState = GAME_STATES.IDLE;
  #listeners    = [];
  #screens      = {};
  #history      = [];
  #locked       = false;
  #initialized  = false;

  constructor() {
    this.#recordHistory(GAME_STATES.IDLE, null, '初期化');
  }

  // ==========================================
  // 初期化
  // ==========================================

  init() {
    if (this.#initialized) {
      console.warn('game-state: 既に初期化済みです');
      return;
    }

    this.#screens = {
      'screen-connect': document.getElementById('screen-connect'),
      'screen-game':    document.getElementById('screen-game'),
      'screen-end':     document.getElementById('screen-end')
    };

    const missingScreens = [];
    Object.entries(this.#screens).forEach(([id, element]) => {
      if (!element) {
        console.error(`game-state: ${id} 要素が見つかりません`);
        missingScreens.push(id);
      }
    });

    if (missingScreens.length > 0) {
      console.warn(`game-state: ${missingScreens.length}個のscreen要素が見つかりませんでした`);
    }

    this.#updateScreenDisplay();
    this.#initialized = true;
  }

  // ==========================================
  // 状態取得API
  // ==========================================

  getState()         { return this.#currentState; }
  getCurrentScreen() { return STATE_TO_SCREEN[this.#currentState] ?? null; }

  isIdle()       { return this.#currentState === GAME_STATES.IDLE; }
  isConnecting() { return this.#currentState === GAME_STATES.CONNECTING; }
  isReady()      { return this.#currentState === GAME_STATES.READY; }
  isPlaying()    { return this.#currentState === GAME_STATES.PLAYING; }
  isDown()       { return this.#currentState === GAME_STATES.DOWN; }
  isEnd()        { return this.#currentState === GAME_STATES.END; }

  is(state)        { return this.#currentState === state; }
  isAnyOf(states)  { return states.includes(this.#currentState); }
  isInGame()       { return this.isAnyOf([GAME_STATES.PLAYING, GAME_STATES.DOWN]); }
  isConnected()    { return this.isAnyOf([GAME_STATES.READY, GAME_STATES.PLAYING, GAME_STATES.DOWN]); }

  // ==========================================
  // 状態変更API（内部）
  // ==========================================

  #setState(newState, options = {}) {
    const { force = false, reason = null } = options;

    if (this.#locked && !force) {
      console.warn(`game-state: 状態がロックされています（${newState} への遷移を拒否）`);
      return false;
    }

    if (this.#currentState === newState) {
      console.debug(`game-state: 既に ${newState} 状態です`);
      return false;
    }

    if (!this.#isValidState(newState)) {
      console.error(`game-state: 無効な状態: ${newState}`);
      return false;
    }

    if (!force && !this.#isValidTransition(this.#currentState, newState)) {
      console.error(`game-state: 不正な状態遷移: ${this.#currentState} → ${newState}`);
      console.info(`game-state: 許可される遷移: ${this.getAvailableTransitions().join(', ')}`);
      return false;
    }

    const oldState = this.#currentState;
    this.#currentState = newState;

    this.#recordHistory(newState, oldState, reason);
    this.#updateScreenDisplay();
    this.#notifyListeners(newState, oldState, reason);

    return true;
  }

  // ==========================================
  // 状態遷移の公開メソッド群
  // ==========================================

  connect(reason = 'Bluetooth接続開始') { return this.#setState(GAME_STATES.CONNECTING, { reason }); }
  ready(reason = '接続完了')            { return this.#setState(GAME_STATES.READY,      { reason }); }
  startGame(reason = 'ゲーム開始')      { return this.#setState(GAME_STATES.PLAYING,    { reason }); }
  down(reason = 'ダウン')               { return this.#setState(GAME_STATES.DOWN,       { reason }); }
  revive(reason = '蘇生')               { return this.#setState(GAME_STATES.PLAYING,    { reason }); }
  endGame(reason = 'ゲーム終了')        { return this.#setState(GAME_STATES.END,        { reason }); }
  reset(reason = 'リセット')            { return this.#setState(GAME_STATES.IDLE,       { reason }); }
  cancelConnection(reason = '接続キャンセル') { return this.#setState(GAME_STATES.IDLE, { reason }); }

  forceSetState(newState, reason = '強制変更') {
    console.warn(`game-state: 強制的に状態を変更: ${this.#currentState} → ${newState}`);
    return this.#setState(newState, { force: true, reason });
  }

  setState(newState, reason = 'BluetoothManager から変更') {
    console.log(`[GameState] setState(${newState}) 呼び出し`);
    console.log(`[GameState] 現在の状態: ${this.#currentState}`);
    console.log(`[GameState] 遷移可能な状態: ${this.getAvailableTransitions().join(', ')}`);
    console.log(`[GameState] ロック状態: ${this.#locked}`);

    const result = this.#setState(newState, { reason });

    console.log(`[GameState] setState(${newState}) 結果: ${result}`);
    console.log(`[GameState] setState 後の状態: ${this.#currentState}`);

    return result;
  }

  // ==========================================
  // 遷移検証
  // ==========================================

  #isValidState(state)            { return Object.values(GAME_STATES).includes(state); }
  #isValidTransition(from, to)    { return VALID_TRANSITIONS[from]?.includes(to) ?? false; }
  canTransitionTo(targetState)    { return this.#isValidTransition(this.#currentState, targetState); }
  getAvailableTransitions()       { return [...(VALID_TRANSITIONS[this.#currentState] || [])]; }

  // ==========================================
  // UI制御
  // ==========================================

  /**
   * アクティブ画面の切り替えと、DOWN状態に応じた
   * pointer-events 制御クラスの付け外しを行う
   */
  // game-state.js の #updateScreenDisplay() のみ修正

  #updateScreenDisplay() {
    if (!this.#initialized) return;

    const activeScreenId = STATE_TO_SCREEN[this.#currentState];

    // 全画面から is-active を除去
    Object.values(this.#screens).forEach(screen => {
      if (screen) screen.classList.remove('is-active');
    });

    // 対象画面に is-active を付与
    const activeScreen = this.#screens[activeScreenId];
    if (activeScreen) {
      activeScreen.classList.add('is-active');
    } else {
      console.error(`game-state: screen要素が見つかりません: ${activeScreenId}`);
    }

    // ==========================================
    // DOWN状態での UI 裏操作防止
    // ==========================================
    const screenGame      = this.#screens['screen-game'];
    const videoContainer  = document.getElementById('videoContainer');
    const body            = document.body;

    if (this.#currentState === GAME_STATES.DOWN) {
      // DOWN 入場時
      if (screenGame)     screenGame.classList.add('down-state');
      if (body)           body.classList.add('down-active');
      if (videoContainer) videoContainer.classList.add('active');

    } else {
      // DOWN 以外（PLAYING復帰含む）
      if (screenGame)     screenGame.classList.remove('down-state');
      if (body)           body.classList.remove('down-active');
      if (videoContainer) videoContainer.classList.remove('active');
    }
  }
  
  // ==========================================
  // イベント通知
  // ==========================================

  #notifyListeners(newState, oldState, reason) {
    this.#listeners.forEach(callback => {
      try {
        callback(newState, oldState, reason);
      } catch (error) {
        console.error('game-state: リスナーエラー:', error);
      }
    });
  }

  onStateChange(callback) {
    if (typeof callback !== 'function') {
      console.error('game-state: コールバックは関数である必要があります');
      return () => {};
    }
    this.#listeners.push(callback);
    return () => this.offStateChange(callback);
  }

  offStateChange(callback) {
    const index = this.#listeners.indexOf(callback);
    if (index !== -1) this.#listeners.splice(index, 1);
  }

  clearListeners() { this.#listeners = []; }

  // ==========================================
  // 履歴管理
  // ==========================================

  #recordHistory(newState, oldState, reason) {
    const record = Object.freeze({
      newState,
      oldState,
      reason,
      timestamp: Date.now(),
      date: new Date().toISOString()
    });

    this.#history.push(record);

    if (this.#history.length > MAX_HISTORY_SIZE) {
      this.#history.shift();
    }
  }

  getHistory(limit = null) {
    const history = limit ? this.#history.slice(-limit) : this.#history;
    return history.map(record => ({ ...record }));
  }

  clearHistory() {
    this.#history = [];
    this.#recordHistory(this.#currentState, null, '履歴クリア');
  }

  // ==========================================
  // 状態ロック
  // ==========================================

  lock()     { this.#locked = true; }
  unlock()   { this.#locked = false; }
  isLocked() { return this.#locked; }

  // ==========================================
  // ステータス情報
  // ==========================================

  getStatus() {
    return Object.freeze({
      currentState:         this.#currentState,
      availableTransitions: this.getAvailableTransitions(),
      locked:               this.#locked,
      initialized:          this.#initialized,
      listenerCount:        this.#listeners.length,
      historyCount:         this.#history.length
    });
  }

  // ==========================================
  // デバッグ用メソッド
  // ==========================================

  debugLog() {
    console.log('=== Game State ===');
    console.log('現在の状態:', this.#currentState);
    console.log('遷移可能な状態:', this.getAvailableTransitions());
    console.log('ロック状態:', this.#locked);
    console.log('初期化済み:', this.#initialized);
    console.log('リスナー数:', this.#listeners.length);
    console.log('履歴件数:', this.#history.length);
  }

  debugHistory() {
    console.log('=== State Transition History ===');
    console.table(
      this.#history.map(record => ({
        遷移: `${record.oldState || '(初期)'} → ${record.newState}`,
        理由: record.reason || '(未指定)',
        時刻: new Date(record.timestamp).toLocaleString()
      }))
    );
  }

  debugTransitionMap() {
    console.log('=== Valid State Transitions ===');
    Object.entries(VALID_TRANSITIONS).forEach(([from, toList]) => {
      console.log(`${from} → [${toList.join(', ')}]`);
    });
  }

  debugAllStates() {
    console.log('=== All Game States ===');
    Object.values(GAME_STATES).forEach(state => {
      const marker = state === this.#currentState ? '← 現在' : '';
      const screen = STATE_TO_SCREEN[state];
      console.log(`${state.padEnd(12)} → ${screen} ${marker}`);
    });
  }
}

export function initGameState() {
  return new GameState();
}

export const gameState = new GameState();

export default GameState;