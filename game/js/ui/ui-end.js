// ==========================================
// ui-end.js - END画面UI制御
// ==========================================
// 責務：
// - END画面の表示更新
// - 戦績描画
// - リザルト表示（勝敗・HP・弾薬・対戦相手）
// - ボタンイベント処理
// - DOM制御のみ
//
// 禁止事項：
// - 計算処理
// - 状態管理
// - ゲームロジック
// ==========================================

import { GAME_STATES } from '../core/game-state.js';

class UIEnd {
  #statsManager  = null;
  #gameState     = null;
  #screenEnd     = null;  // 親要素
  #statsElements = {};    // 戦績表示用DOM要素
  #resultElements = {};   // リザルト表示用DOM要素
  #backBtn       = null;
  #initialized   = false;

  constructor() {}

  // ==========================================
  // 初期化
  // ==========================================

  /**
   * 初期化処理
   * @param {Object} statsManager - StatsManager インスタンス
   * @param {Object} gameState - GameState インスタンス
   * @returns {boolean} 成功なら true
   */
  init(statsManager, gameState) {
    if (this.#initialized) {
      console.warn('ui-end: 既に初期化済みです');
      return false;
    }

    if (!statsManager) {
      console.error('ui-end: statsManager が必要です');
      return false;
    }

    if (!gameState) {
      console.error('ui-end: gameState が必要です');
      return false;
    }

    this.#statsManager = statsManager;
    this.#gameState = gameState;

    if (!this.#initElements()) {
      console.error('ui-end: 初期化に失敗しました');
      return false;
    }

    this.#bindEvents();

    this.#initialized = true;
    console.log('ui-end: 初期化完了');
    return true;
  }

  /**
   * DOM要素を取得
   * 親要素スコープ内で data-stat 属性を使って取得
   * @private
   */
  #initElements() {
    // 親要素を取得
    this.#screenEnd = document.getElementById('screen-end');

    if (!this.#screenEnd) {
      console.error('ui-end: #screen-end が見つかりません');
      return false;
    }

    // ボタンを取得
    this.#backBtn = document.getElementById('backToConnectBtn');

    if (!this.#backBtn) {
      console.error('ui-end: #backToConnectBtn が見つかりません');
      return false;
    }

    // ==========================================
    // 親要素スコープ内で data-stat 属性を使って取得
    // end-stats 内の要素を取得
    // ==========================================
    const statsRoot = this.#screenEnd.querySelector('.end-stats');

    if (statsRoot) {
      this.#statsElements = {
        kills:    statsRoot.querySelector('[data-stat="kills"]'),
        hits:     statsRoot.querySelector('[data-stat="hits"]'),
        damage:   statsRoot.querySelector('[data-stat="damage"]'),
        playTime: statsRoot.querySelector('[data-stat="time"]')
      };

      // 必須要素のチェック
      if (!this.#statsElements.kills || !this.#statsElements.hits) {
        console.warn('ui-end: 戦績表示用DOM要素が一部見つかりません');
      }
    } else {
      console.warn('ui-end: .end-stats が見つかりません（戦績表示はスキップされます）');
    }

    // ==========================================
    // リザルト表示用要素を取得
    // ==========================================
    this.#resultElements = {
      resultStatus: document.getElementById('result-status'),
      playerHpHead: document.getElementById('player-hp-head'),
      playerHpTorso: document.getElementById('player-hp-torso'),
      playerHpRightArm: document.getElementById('player-hp-right-arm'),
      playerHpLeftArm: document.getElementById('player-hp-left-arm'),
      playerHpRightLeg: document.getElementById('player-hp-right-leg'),
      playerHpLeftLeg: document.getElementById('player-hp-left-leg'),
      playerHpTotal: document.getElementById('player-hp-total'),
      playerAmmoCurrent: document.getElementById('player-ammo-current'),
      playerAmmoReserve: document.getElementById('player-ammo-reserve'),
      opponentsData: document.getElementById('opponents-data')
    };

    return true;
  }

  /**
   * イベントをバインド
   * @private
   */
  #bindEvents() {
    this.#backBtn.addEventListener('click', () => this.#handleBackClick());
  }

  // ==========================================
  // イベントハンドラー
  // ==========================================

  /**
   * 「接続画面に戻る」ボタンクリック時の処理
   * @private
   */
  #handleBackClick() {
    console.log('ui-end: 接続画面に戻る');

    // ==========================================
    // gameState を IDLE に遷移
    // statsManager.reset() は呼ばない
    // （リセットは PLAYING遷移時に行う設計）
    // ==========================================
    this.#gameState.reset('接続画面に戻る');
  }

  // ==========================================
  // 表示制御
  // ==========================================

  /**
   * END画面を表示し、戦績を更新
   * @public
   */
  show() {
    if (!this.#initialized) {
      console.warn('ui-end: 初期化されていません');
      return;
    }

    console.log('ui-end: END画面表示');

    // 画面を表示（hidden クラスを除去）
    if (this.#screenEnd) {
      this.#screenEnd.classList.remove('hidden');
    }

    // 戦績データを取得
    const stats = this.#statsManager.getStats();

    if (!stats) {
      console.warn('ui-end: 戦績データが取得できません');
      return;
    }

    // 戦績を描画
    this.#updateStats(stats);
  }

  /**
   * END画面を非表示
   * @public
   */
  hide() {
    if (!this.#screenEnd) return;

    console.log('ui-end: END画面非表示');
    this.#screenEnd.classList.add('hidden');
  }

  /**
   * リザルト画面を表示（STEP10）
   * @public
   * @param {Object} resultData - リザルトデータ
   * @param {string} resultData.result - 'WIN' | 'LOSE' | 'DRAW'
   * @param {Object} resultData.playerHP - 自分のHP
   * @param {Object} resultData.playerAmmo - 自分の弾薬
   * @param {Object} resultData.stats - 戦績データ
   * @param {Array} resultData.allPlayers - 全プレイヤーデータ
   * @param {Array} resultData.opponents - 対戦相手データ
   */
  showResult(resultData) {
    console.log('[UI-End] Showing result screen', resultData);
    
    // 基本の画面表示
    this.show();
    
    // 勝敗表示
    this.#updateResultStatus(resultData.result);
    
    // 自分のデータ表示
    this.#updatePlayerData(resultData.playerHP, resultData.playerAmmo);
    
    // 対戦相手のデータ表示
    this.#updateOpponentsData(resultData.opponents);
  }

  // ==========================================
  // 戦績表示更新
  // ==========================================

  /**
   * 戦績データをDOMに反映
   * @private
   * @param {Object} stats - statsManager.getStats() で取得したデータ
   */
  #updateStats(stats) {
    console.log('ui-end: 戦績表示更新', stats);

    // キル数
    if (this.#statsElements.kills) {
      this.#statsElements.kills.textContent = stats.killCount;
    }

    // 命中数
    if (this.#statsElements.hits) {
      this.#statsElements.hits.textContent = stats.hitCount;
    }

    // 被弾数
    if (this.#statsElements.damage) {
      this.#statsElements.damage.textContent = stats.damageTaken;
    }

    // 生存時間
    if (this.#statsElements.playTime) {
      this.#statsElements.playTime.textContent = this.#formatTime(stats.playTime);
    }
  }

  // ==========================================
  // リザルト表示更新（STEP10）
  // ==========================================

  /**
   * 勝敗ステータス表示更新
   * @private
   */
  #updateResultStatus(result) {
    const resultElement = this.#resultElements.resultStatus;
    if (!resultElement) return;
    
    // 既存のクラスをクリア
    resultElement.className = 'result-status';
    
    // 結果に応じたクラスとテキストを設定
    switch (result) {
      case 'WIN':
        resultElement.classList.add('result-win');
        resultElement.textContent = '🏆 VICTORY';
        break;
      case 'LOSE':
        resultElement.classList.add('result-lose');
        resultElement.textContent = '💀 DEFEAT';
        break;
      case 'DRAW':
        resultElement.classList.add('result-draw');
        resultElement.textContent = '🤝 DRAW';
        break;
      default:
        resultElement.textContent = '— UNKNOWN';
    }
  }

  /**
   * 自分のデータ表示更新
   * @private
   */
  #updatePlayerData(hp, ammo) {
    // HP表示
    if (hp) {
      this.#updateElement('playerHpHead', hp.head || 0);
      this.#updateElement('playerHpTorso', hp.torso || 0);
      this.#updateElement('playerHpRightArm', hp.rightArm || 0);
      this.#updateElement('playerHpLeftArm', hp.leftArm || 0);
      this.#updateElement('playerHpRightLeg', hp.rightLeg || 0);
      this.#updateElement('playerHpLeftLeg', hp.leftLeg || 0);
      
      const totalHP = (hp.head || 0) + (hp.torso || 0) + 
                      (hp.rightArm || 0) + (hp.leftArm || 0) + 
                      (hp.rightLeg || 0) + (hp.leftLeg || 0);
      this.#updateElement('playerHpTotal', totalHP);
    }
    
    // 弾薬表示
    if (ammo) {
      this.#updateElement('playerAmmoCurrent', ammo.current || 0);
      this.#updateElement('playerAmmoReserve', ammo.reserve || 0);
    }
  }

  /**
   * 対戦相手のデータ表示更新
   * @private
   */
  #updateOpponentsData(opponents) {
    const opponentsContainer = this.#resultElements.opponentsData;
    if (!opponentsContainer) return;
    
    if (!opponents || opponents.length === 0) {
      opponentsContainer.innerHTML = '<p class="no-data">対戦相手のデータがありません</p>';
      return;
    }
    
    let html = '';
    opponents.forEach((opponent) => {
      const totalHP = (opponent.hp_head || 0) + (opponent.hp_torso || 0) + 
                      (opponent.hp_right_arm || 0) + (opponent.hp_left_arm || 0) + 
                      (opponent.hp_right_leg || 0) + (opponent.hp_left_leg || 0);
      
      html += `
        <div class="opponent-card">
          <h4>${opponent.name || `Player ${opponent.id}`}</h4>
          <div class="opponent-stats">
            <div class="stat-item">
              <span class="stat-label">合計HP</span>
              <span class="stat-value">${totalHP} / 600</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">弾薬</span>
              <span class="stat-value">${opponent.ammo_current || 0} / ${opponent.ammo_reserve || 0}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">状態</span>
              <span class="stat-value stat-${opponent.player_state.toLowerCase()}">${opponent.player_state}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    opponentsContainer.innerHTML = html;
  }

  /**
   * 要素のテキストを更新（ヘルパー）
   * @private
   */
  #updateElement(key, value) {
    const element = this.#resultElements[key];
    if (element) {
      element.textContent = value;
    }
  }

  // ==========================================
  // ヘルパー
  // ==========================================

  /**
   * 秒数を "分:秒" 形式に変換
   * @private
   * @param {number} seconds - 秒数
   * @returns {string} "1:23" 形式の文字列
   */
  #formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // ステータス取得
  // ==========================================

  /**
   * 初期化済みかどうか
   * @returns {boolean} 初期化済みなら true
   */
  isInitialized() {
    return this.#initialized;
  }

  // ==========================================
  // デバッグ
  // ==========================================

  debugLog() {
    console.log('=== UIEnd 状態 ===');
    console.log('初期化済み:', this.#initialized);
    console.log('現在の戦績:', this.#statsManager?.getStats());
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * UIEnd インスタンスを初期化して返す
 * @param {Object} statsManager - StatsManager インスタンス
 * @param {Object} gameState - GameState インスタンス
 * @returns {UIEnd} UIEnd インスタンス
 */
export function initUIEnd(statsManager, gameState) {
  const uiEnd = new UIEnd();
  uiEnd.init(statsManager, gameState);
  return uiEnd;
}

export const uiEnd = new UIEnd();
export default UIEnd;