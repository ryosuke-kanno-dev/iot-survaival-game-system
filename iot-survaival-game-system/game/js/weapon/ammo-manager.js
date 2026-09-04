// ==========================================
// ammo-manager.js - 改善版（イベントシステム強化）
// ==========================================

import {
  AMMO_CONFIG,
  getInitialAmmo,
  validateAmmoConfig,
} from "../core/constants.js";
import { GAME_STATES } from "../core/game-state.js";

export class AmmoManager {
  // プライベートフィールド（イベントリスナー管理）
  #eventListeners = {};

  constructor(config = {}) {
    console.log("AmmoManager constructor called with config:", config);

    const initialAmmo = getInitialAmmo();

    const settings = {
      maxBullet: config.maxBullet ?? initialAmmo.maxBullet,
      maxReserve: config.maxReserve ?? initialAmmo.maxReserve,
      currentBullet: config.currentAmmo ?? initialAmmo.currentBullet,
      currentReserve: config.currentReserve ?? initialAmmo.currentReserve,
    };

    if (!validateAmmoConfig(settings.currentBullet, settings.currentReserve)) {
      console.error("AmmoManager: 無効な設定値が渡されました", settings);
      throw new Error("Invalid ammo configuration");
    }

    this.initialValues = Object.freeze({
      maxBullet: settings.maxBullet,
      maxReserve: settings.maxReserve,
      current: settings.currentBullet,
      reserve: settings.currentReserve,
    });

    this.maxBullet = settings.maxBullet;
    this.maxReserve = settings.maxReserve;
    this.current = settings.currentBullet;
    this.reserve = settings.currentReserve;
    this.listeners = []; // 後方互換性のため残す

    // ==========================================
    // DOWN状態ガード用の依存注入プロパティ
    // ==========================================
    this._gameState = null; // setGameState() で注入
    this._uiLog = null; // setLogger() で注入
    this._lastWarnTime = 0; // 警告ログの連続出力防止（1秒制限）

    console.log("AmmoManager initialized successfully:", this.getAmmo());
  }

  // ==========================================
  // 依存注入メソッド
  // ==========================================

  /**
   * gameState を注入する
   * @param {Object} gameState - getState() を持つ GameState インスタンス
   */
  setGameState(gameState) {
    this._gameState = gameState;
  }

  /**
   * UIログを注入する
   * @param {Object} logger - add() または warn() を持つロガー
   */
  setLogger(logger) {
    this._uiLog = logger;
  }

  /**
   * PLAYING状態かDOWN状態かをチェックし、弾薬消費を制御する
   * - DOWN: 操作不可（エラー）
   * - PLAYING: 通常の弾薬消費（許可）
   * - それ以外(IDLE等): テストモードとして弾薬消費なしで許可
   * true = 操作を許可しない(ブロック)
   * @private
   * @param {string} actionName - ログに表示する操作名
   * @returns {boolean}
   */
  _isActionBlocked(actionName) {
    if (!this._gameState) return false; // 未注入なら素通り

    const currentState = this._gameState.getState();

    // ダウン中は完全にブロック
    if (currentState === GAME_STATES.DOWN) {
      // 1秒に1回まで警告出力
      const now = Date.now();
      if (now - this._lastWarnTime >= 1000) {
        this._lastWarnTime = now;
        const msg = `⚠ ダウン中なので${actionName}することはできません`;
        if (this._uiLog) {
          this._uiLog.warn?.(msg) ?? this._uiLog.add?.(msg);
        }
        console.warn(`[AmmoManager] ${msg}`);
      }
      return true;
    }
    
    // DOWNでなければブロックしない（PLAYINGかテストモードか）
    return false;
  }

  // ==========================================
  // イベントシステム（.on() メソッド）
  // ==========================================

  /**
   * イベントリスナー登録
   * @param {string} event - イベント名（例: 'ammoChanged'）
   * @param {Function} callback - コールバック関数
   */
  on(event, callback) {
    if (typeof callback !== "function") {
      console.error("[AmmoManager] on: callback must be a function");
      return;
    }

    if (!this.#eventListeners[event]) {
      this.#eventListeners[event] = [];
    }

    this.#eventListeners[event].push(callback);
    console.log(`[AmmoManager] Event listener registered: ${event}`);
  }

  /**
   * イベントリスナー削除
   * @param {string} event - イベント名
   * @param {Function} callback - 削除するコールバック関数
   */
  off(event, callback) {
    if (!this.#eventListeners[event]) {
      return;
    }

    this.#eventListeners[event] = this.#eventListeners[event].filter(
      (listener) => listener !== callback,
    );
  }

  /**
   * イベント発火（内部用）
   * @private
   * @param {string} event - イベント名
   * @param {*} data - イベントデータ
   */
  #emit(event, data) {
    if (this.#eventListeners[event]) {
      this.#eventListeners[event].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[AmmoManager] Event handler error (${event}):`, error);
        }
      });
    }
  }

  // ==========================================
  // 弾薬操作メソッド
  // ==========================================

  getAmmo() {
    return {
      current: this.current,
      reserve: this.reserve,
      maxBullet: this.maxBullet,
      maxReserve: this.maxReserve,
    };
  }

  getCurrentAmmo() {
    return this.current;
  }

  getReserveAmmo() {
    return this.reserve;
  }

  setAmmo(current, reserve) {
    if (
      current < 0 ||
      current > this.maxBullet ||
      reserve < 0 ||
      reserve > this.maxReserve
    ) {
      console.warn("AmmoManager: 無効な弾数が指定されました", {
        current,
        reserve,
      });
      return false;
    }

    this.current = Math.max(0, Math.min(current, this.maxBullet));
    this.reserve = Math.max(0, Math.min(reserve, this.maxReserve));
    this.notifyChange();
    return true;
  }

  setMaxAmmo(maxBullet, maxReserve) {
    this.maxBullet = Math.max(1, maxBullet);
    this.maxReserve = Math.max(1, maxReserve);
    this.current = Math.min(this.current, this.maxBullet);
    this.reserve = Math.min(this.reserve, this.maxReserve);
    this.notifyChange();
  }

  /**
   * 射撃（1発消費）
   * DOWN状態中は処理を中断し警告ログを出す
   * PLAYING以外の状態（IDLE等）はテストモードとして弾は減らさずに成功(true)を返す
   */
  shoot() {
    if (this._isActionBlocked("射撃")) return false;

    // PLAYING以外の状態（IDLE, READY等）はテスト用のため弾数を減らさない
    if (this._gameState && this._gameState.getState() !== GAME_STATES.PLAYING) {
      return true;
    }

    if (this.current <= 0) return false;

    this.current--;
    this.notifyChange();

    return true;
  }

  /**
   * リロード（予備マガジン消費）
   * DOWN状態中は処理を中断し警告ログを出す
   * PLAYING以外の状態（IDLE等）はテストモードとして弾は減らさずに成功(true)を返す
   */
  reload() {
    if (this._isActionBlocked("リロード")) return false;

    // PLAYING以外の状態（IDLE, READY等）はテスト用のため予備マガジンを減らさない
    if (this._gameState && this._gameState.getState() !== GAME_STATES.PLAYING) {
      return true;
    }

    if (this.reserve <= 0) return false;

    this.reserve--;
    this.current = this.maxBullet;
    this.notifyChange();

    return true;
  }

  reset() {
    this.maxBullet = this.initialValues.maxBullet;
    this.maxReserve = this.initialValues.maxReserve;
    this.current = this.initialValues.current;
    this.reserve = this.initialValues.reserve;
    this.notifyChange();
  }

  /**
   * 変更通知（既存メソッド - 後方互換性のため残す）
   * @param {Function} callback - コールバック関数
   */
  onChange(callback) {
    if (typeof callback === "function") {
      this.listeners.push(callback);
    }
  }

  /**
   * 変更通知を全リスナーに送信
   * 既存の onChange() と新しい on('ammoChanged') の両方に対応
   * @private
   */
  notifyChange() {
    const ammoState = this.getAmmo();

    // ==========================================
    // 既存の onChange() リスナーに通知（後方互換性）
    // ==========================================
    this.listeners.forEach((listener) => {
      try {
        listener(ammoState);
      } catch (error) {
        console.error("AmmoManager: リスナー実行エラー", error);
      }
    });

    // ==========================================
    // 新しい .on('ammoChanged') リスナーに通知
    // ==========================================
    this.#emit("ammoChanged", {
      current: this.current,
      reserve: this.reserve,
    });
  }

  // ==========================================
  // デバッグ
  // ==========================================

  debugLog() {
    console.log("=== AmmoManager 状態 ===");
    console.log("現在弾数:", this.current);
    console.log("予備マガジン:", this.reserve);
    console.log("最大弾数:", this.maxBullet);
    console.log("最大予備:", this.maxReserve);
    console.log("初期値:", this.initialValues);
    console.log("onChange リスナー数:", this.listeners.length);
    console.log("on() リスナー数:", Object.keys(this.#eventListeners).length);
  }
}
