// ==========================================
// ui-down.js - DOWN画面UI制御
// ==========================================

import { GAME_STATES } from '../core/game-state.js';

class UIDown {
  #gameState     = null;
  #statsManager  = null;
  #downOverlay   = null;
  #goEndBtn      = null;
  #statsRoot     = null;  // .down-stats 要素
  #statsElements = {};
  #initialized   = false;
  #isProcessing  = false;

  constructor() {}

  init(gameState, statsManager) {
    if (this.#initialized) {
      console.warn('ui-down: 既に初期化済みです');
      return false;
    }

    if (!gameState || !statsManager) {
      console.error('ui-down: gameState と statsManager が必要です');
      return false;
    }

    this.#gameState = gameState;
    this.#statsManager = statsManager;

    if (!this.#initElements()) {
      console.error('ui-down: 初期化に失敗しました');
      return false;
    }

    this.#bindEvents();
    this.#bindStateChange();

    this.#initialized = true;
    console.log('ui-down: 初期化完了');
    return true;
  }

  /**
   * DOM要素を取得
   * downOverlay 内から .down-stats を探す
   * @private
   */
  #initElements() {
    this.#downOverlay = document.getElementById('downOverlay');
    this.#goEndBtn    = document.getElementById('goEndBtn');

    if (!this.#downOverlay) {
      console.error('ui-down: #downOverlay が見つかりません');
      return false;
    }

    if (!this.#goEndBtn) {
      console.error('ui-down: #goEndBtn が見つかりません');
      return false;
    }

    // ==========================================
    // 修正: downOverlay 内から .down-stats を探す
    // ==========================================
    this.#statsRoot = this.#downOverlay.querySelector('.down-stats');

    if (this.#statsRoot) {
      this.#statsElements = {
        kills:    this.#statsRoot.querySelector('[data-stat="kills"]'),
        hits:     this.#statsRoot.querySelector('[data-stat="hits"]'),
        damage:   this.#statsRoot.querySelector('[data-stat="damage"]'),
        playTime: this.#statsRoot.querySelector('[data-stat="time"]')
      };

      if (!this.#statsElements.kills || !this.#statsElements.hits) {
        console.warn('ui-down: 戦績表示用DOM要素が一部見つかりません');
      }
    } else {
      console.warn('ui-down: .down-stats が見つかりません（戦績表示はスキップされます）');
    }

    return true;
  }

  #bindEvents() {
    this.#goEndBtn.addEventListener('click', () => this.#handleGoEndClick());
  }

  #bindStateChange() {
    this.#gameState.onStateChange((newState, oldState) => {
      if (newState === GAME_STATES.DOWN && oldState === GAME_STATES.PLAYING) {
        const stats = this.#statsManager.getStats();
        this.updateDownStats(stats);
      }
    });
  }

  #handleGoEndClick() {
    if (this.#isProcessing) {
      console.log('ui-down: 処理中のため無視');
      return;
    }

    const currentState = this.#gameState.getState();
    if (currentState !== GAME_STATES.DOWN) {
      console.warn('ui-down: DOWN状態ではないためボタン押下を無視');
      return;
    }

    this.#isProcessing = true;
    this.#hideDownOverlay();
    this.#gameState.endGame('結果を見るボタン押下');

    setTimeout(() => {
      this.#isProcessing = false;
    }, 500);

    console.log('ui-down: END画面へ遷移');
  }

  #hideDownOverlay() {
    if (!this.#downOverlay) return;
    this.#downOverlay.classList.remove('active');
  }

  showDownOverlay() {
    if (!this.#downOverlay) return;
    this.#downOverlay.classList.add('active');
  }

  updateDownStats(stats) {
    if (!stats || !this.#statsRoot) {
      console.warn('ui-down: 戦績データまたはDOM要素がありません');
      return;
    }

    console.log('ui-down: 戦績表示更新', stats);

    if (this.#statsElements.kills)    this.#statsElements.kills.textContent    = stats.killCount;
    if (this.#statsElements.hits)     this.#statsElements.hits.textContent     = stats.hitCount;
    if (this.#statsElements.damage)   this.#statsElements.damage.textContent   = stats.damageTaken;
    if (this.#statsElements.playTime) this.#statsElements.playTime.textContent = this.#formatTime(stats.playTime);
  }

  #formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  isInitialized() { return this.#initialized; }

  getStatus() {
    return {
      initialized:  this.#initialized,
      isProcessing: this.#isProcessing
    };
  }

  debugLog() {
    console.log('=== UIDown 状態 ===');
    console.log('初期化済み:', this.#initialized);
    console.log('処理中:', this.#isProcessing);
    console.log('現在の状態:', this.#gameState?.getState());
    console.log('現在の戦績:', this.#statsManager?.getStats());
  }
}

export function initUIDown(gameState, statsManager) {
  const uiDown = new UIDown();
  uiDown.init(gameState, statsManager);
  return uiDown;
}

export const uiDown = new UIDown();
export default UIDown;