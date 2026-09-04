// ==========================================
// health-manager.js - HP管理の中核ロジック（完全版）
// ==========================================

import { getInitialHP, BODY_PARTS } from "../core/constants.js";
import { GAME_STATES } from "../core/game-state.js";
import { downChecker } from "./down-checker.js";

// 他のモジュールが health-manager.js 経由でBODY_PARTSを取得できるように再エクスポート
export { BODY_PARTS };

const ALL_PARTS = Object.freeze(Object.values(BODY_PARTS));

export const HP_ACTIONS = Object.freeze({
  DAMAGE: "damage",
  HEAL: "heal",
  RESET: "reset",
  MAX_CHANGED: "maxChanged",
  RESTORE: "restore",
});

const DEFAULT_CONFIG = Object.freeze({
  enableStatistics: true,
  strictMode: true,
  minHP: 0,
  enableHistory: false,
});

class HealthManager {
  #maxHealth = {};
  #currentDamage = {};
  #listeners = [];
  #config = {};
  #statistics = {};
  #initialized = false;
  #initialValues = {};

  // DOWN状態ガード用プロパティ
  #gameState = null;
  #uiLog = null;
  #lastWarnTime = 0;

  constructor(config = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    this.#initialize();
  }

  // ==========================================
  // 依存注入メソッド
  // ==========================================

  setGameState(gameState) {
    this.#gameState = gameState;
  }

  setLogger(logger) {
    this.#uiLog = logger;
  }

  /**
   * PLAYING状態かチェック
   * true = ガードに引っかかった（処理を中断すべき）
   * @private
   */
  #isNotPlaying() {
    if (!this.#gameState) return false;

    if (this.#gameState.getState() !== GAME_STATES.PLAYING) {
      const now = Date.now();
      if (now - this.#lastWarnTime >= 1000) {
        this.#lastWarnTime = now;
        const msg = "⚠ ダウン中なのでダメージは無効です";
        if (this.#uiLog) {
          this.#uiLog.warn?.(msg) ?? this.#uiLog.add?.(msg);
        }
        console.warn(`[HealthManager] ${msg}`);
      }
      return true;
    }
    return false;
  }

  // ==========================================
  // 初期化処理
  // ==========================================

  #initialize() {
    const initialHP = getInitialHP();

    this.#initialValues = Object.freeze({
      HEAD: initialHP.HEAD,
      TORSO: initialHP.TORSO,
      LEFT_ARM: initialHP.LEFT_ARM,
      RIGHT_ARM: initialHP.RIGHT_ARM,
      LEFT_LEG: initialHP.LEFT_LEG,
      RIGHT_LEG: initialHP.RIGHT_LEG,
    });

    ALL_PARTS.forEach((part) => {
      const partKey = this.#getPartKey(part);
      this.#maxHealth[part] = this.#initialValues[partKey];
      this.#currentDamage[part] = 0;
    });

    this.#resetStatistics();
    this.#initialized = true;

    console.log("HealthManager 初期化完了:", {
      initialValues: this.#initialValues,
      maxHealth: this.#maxHealth,
    });
  }

  #getPartKey(part) {
    const keyMap = {
      [BODY_PARTS.HEAD]: "HEAD",
      [BODY_PARTS.TORSO]: "TORSO",
      [BODY_PARTS.LEFT_ARM]: "LEFT_ARM",
      [BODY_PARTS.RIGHT_ARM]: "RIGHT_ARM",
      [BODY_PARTS.LEFT_LEG]: "LEFT_LEG",
      [BODY_PARTS.RIGHT_LEG]: "RIGHT_LEG",
    };
    return keyMap[part];
  }

  #resetStatistics() {
    this.#statistics = {
      totalDamageDealt: 0,
      totalHealingDone: 0,
      damageByPart: {},
      healingByPart: {},
      resets: 0,
      maxHPChanges: 0,
    };

    ALL_PARTS.forEach((part) => {
      this.#statistics.damageByPart[part] = 0;
      this.#statistics.healingByPart[part] = 0;
    });
  }

  #updateStatistics(part, action, amount) {
    if (!this.#config.enableStatistics) return;

    switch (action) {
      case HP_ACTIONS.DAMAGE:
        this.#statistics.totalDamageDealt += amount;
        if (part !== "all") this.#statistics.damageByPart[part] += amount;
        break;
      case HP_ACTIONS.HEAL:
        this.#statistics.totalHealingDone += amount;
        if (part !== "all") this.#statistics.healingByPart[part] += amount;
        break;
      case HP_ACTIONS.RESET:
        this.#statistics.resets++;
        break;
      case HP_ACTIONS.MAX_CHANGED:
        this.#statistics.maxHPChanges++;
        break;
    }
  }

  // ==========================================
  // HP取得API
  // ==========================================

  getCurrentHP(part) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, 0);
    return Math.max(
      this.#maxHealth[part] - this.#currentDamage[part],
      this.#config.minHP,
    );
  }

  getMaxHP(part) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, 0);
    return this.#maxHealth[part];
  }

  getDamage(part) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, 0);
    return this.#currentDamage[part];
  }

  getHPPercentage(part) {
    if (!this.#isValidPart(part)) return 0;
    const currentHP = this.getCurrentHP(part);
    const maxHP = this.#maxHealth[part];
    if (maxHP === 0) return 0;
    return (currentHP / maxHP) * 100;
  }

  getAllHP() {
    const result = {};
    ALL_PARTS.forEach((part) => {
      result[part] = {
        current: this.getCurrentHP(part),
        max: this.#maxHealth[part],
        damage: this.#currentDamage[part],
        percentage: this.getHPPercentage(part),
      };
    });
    return Object.freeze(result);
  }

  getTotalHP() {
    let totalCurrent = 0,
      totalMax = 0,
      totalDamage = 0;
    ALL_PARTS.forEach((part) => {
      totalCurrent += this.getCurrentHP(part);
      totalMax += this.#maxHealth[part];
      totalDamage += this.#currentDamage[part];
    });
    const percentage = totalMax > 0 ? (totalCurrent / totalMax) * 100 : 0;
    return Object.freeze({
      current: totalCurrent,
      max: totalMax,
      damage: totalDamage,
      percentage,
    });
  }

  getState() {
    return Object.freeze({
      maxHealth: { ...this.#maxHealth },
      currentDamage: { ...this.#currentDamage },
      allHP: this.getAllHP(),
      totalHP: this.getTotalHP(),
      statistics: this.getStatistics(),
      timestamp: Date.now(),
    });
  }

  // ==========================================
  // ダメージAPI
  // ==========================================

  /**
   * 指定部位にダメージを適用
   *
   * ガード: PLAYING以外なら無効（#isNotPlaying でログも出す）
   *
   * DOWN多重発火防止:
   *   ダメージ適用後に合計HP=0 かつ PLAYING なら
   *   gameState.down() を1度だけ呼ぶ。
   *   2発目以降は #isNotPlaying() が DOWN を検知して
   *   先頭でreturnするため多重発火しない。
   */
  applyDamage(part, amount) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, false);
    if (!this.#isValidAmount(amount))
      return this.#handleError(`無効なダメージ量: ${amount}`, false);

    // PLAYING以外なら無効（DOWN中は警告ログも出る）
    if (this.#isNotPlaying()) return false;

    const damageAmount = Math.floor(amount);

    if (this.#currentDamage[part] >= this.#maxHealth[part]) return true;

    const oldDamage = this.#currentDamage[part];
    const newDamage = Math.min(oldDamage + damageAmount, this.#maxHealth[part]);

    if (oldDamage !== newDamage) {
      this.#currentDamage[part] = newDamage;
      const actualDamage = newDamage - oldDamage;
      this.#updateStatistics(part, HP_ACTIONS.DAMAGE, actualDamage);
      this.#notifyChange(part, HP_ACTIONS.DAMAGE, actualDamage);
    }

    // ==========================================
    // DOWN多重発火防止 & downCheckerによる判定
    // ==========================================
    if (
      this.#gameState &&
      this.#gameState.getState() === GAME_STATES.PLAYING
    ) {
      // 最新のルールをサーバー同期モジュールから取得して反映（動的同期）
      if (window.linkONApp && window.linkONApp.modules.serverSync) {
        downChecker.setRule(window.linkONApp.modules.serverSync.getDownRule());
      }
      
      const checkResult = downChecker.check(this.getAllHP());
      if (checkResult.isDown) {
        this.#gameState.down(checkResult.reason || "条件によりDOWN");
      }
    }

    return true;
  }

  applyDamageToAll(amount) {
    if (!this.#isValidAmount(amount))
      return this.#handleError(`無効なダメージ量: ${amount}`, false);
    let success = true;
    ALL_PARTS.forEach((part) => {
      if (!this.applyDamage(part, amount)) success = false;
    });
    return success;
  }

  heal(part, amount) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, false);
    if (!this.#isValidAmount(amount))
      return this.#handleError(`無効な回復量: ${amount}`, false);

    const healAmount = Math.floor(amount);
    if (this.#currentDamage[part] === 0) return true;

    const oldDamage = this.#currentDamage[part];
    const newDamage = Math.max(oldDamage - healAmount, 0);

    if (oldDamage !== newDamage) {
      this.#currentDamage[part] = newDamage;
      const actualHeal = oldDamage - newDamage;
      this.#updateStatistics(part, HP_ACTIONS.HEAL, actualHeal);
      this.#notifyChange(part, HP_ACTIONS.HEAL, actualHeal);
    }

    return true;
  }

  healAll(amount) {
    if (!this.#isValidAmount(amount))
      return this.#handleError(`無効な回復量: ${amount}`, false);
    let success = true;
    ALL_PARTS.forEach((part) => {
      if (!this.heal(part, amount)) success = false;
    });
    return success;
  }

  fullHeal(part) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, false);
    const oldDamage = this.#currentDamage[part];
    if (oldDamage > 0) {
      this.#currentDamage[part] = 0;
      this.#updateStatistics(part, HP_ACTIONS.HEAL, oldDamage);
      this.#notifyChange(part, HP_ACTIONS.HEAL, oldDamage);
    }
    return true;
  }

  reset() {
    console.log("HealthManager: 初期値にリセットします");
    ALL_PARTS.forEach((part) => {
      const partKey = this.#getPartKey(part);
      this.#maxHealth[part] = this.#initialValues[partKey];
      this.#currentDamage[part] = 0;
    });
    console.log("HealthManager: リセット完了", {
      maxHealth: this.#maxHealth,
      currentDamage: this.#currentDamage,
      initialValues: this.#initialValues,
    });
    this.#updateStatistics("all", HP_ACTIONS.RESET, 0);
    this.#notifyChange("all", HP_ACTIONS.RESET, 0);
  }

  // ==========================================
  // 最大HP設定API
  // ==========================================

  setMaxHP(part, value) {
    if (!this.#isValidPart(part))
      return this.#handleError(`無効な部位名: ${part}`, false);
    if (!this.#isValidAmount(value) || value <= 0)
      return this.#handleError(`無効な最大HP: ${value}`, false);

    const newMaxHP = Math.floor(value);
    const oldMaxHP = this.#maxHealth[part];

    if (oldMaxHP !== newMaxHP) {
      this.#maxHealth[part] = newMaxHP;
      if (this.#currentDamage[part] > newMaxHP)
        this.#currentDamage[part] = newMaxHP;
      this.#updateStatistics(part, HP_ACTIONS.MAX_CHANGED, newMaxHP);
      this.#notifyChange(part, HP_ACTIONS.MAX_CHANGED, newMaxHP);
    }
    return true;
  }

  setMaxHPAll(value) {
    if (!this.#isValidAmount(value) || value <= 0)
      return this.#handleError(`無効な最大HP: ${value}`, false);
    let success = true;
    ALL_PARTS.forEach((part) => {
      if (!this.setMaxHP(part, value)) success = false;
    });
    return success;
  }

  // ==========================================
  // スナップショット・復元
  // ==========================================

  createSnapshot() {
    return {
      maxHealth: { ...this.#maxHealth },
      currentDamage: { ...this.#currentDamage },
      statistics: { ...this.#statistics },
      timestamp: Date.now(),
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object")
      return this.#handleError("無効なスナップショット", false);
    try {
      if (!snapshot.maxHealth || !snapshot.currentDamage)
        throw new Error("スナップショットデータが不完全です");
      this.#maxHealth = { ...snapshot.maxHealth };
      this.#currentDamage = { ...snapshot.currentDamage };
      if (snapshot.statistics) this.#statistics = { ...snapshot.statistics };
      this.#notifyChange("all", HP_ACTIONS.RESTORE, 0);
      return true;
    } catch (error) {
      return this.#handleError(
        `スナップショット復元エラー: ${error.message}`,
        false,
      );
    }
  }

  // ==========================================
  // サーバー同期メソッド
  // ==========================================

  /**
   * サーバーからの直接同期
   * uiHealthだけではなく内部状態も正確にするため
   */
  syncFromServer(hpData) {
    let changed = false;
    const keyMap = {
      [BODY_PARTS.HEAD]: "headHp",
      [BODY_PARTS.TORSO]: "torsoHp",
      [BODY_PARTS.RIGHT_ARM]: "rightarmHp",
      [BODY_PARTS.LEFT_ARM]: "leftarmHp",
      [BODY_PARTS.RIGHT_LEG]: "rightlegHp",
      [BODY_PARTS.LEFT_LEG]: "leftlegHp",
    };

    ALL_PARTS.forEach((part) => {
      const key = keyMap[part];
      if (hpData[key] && hpData[key].current !== undefined) {
        // 現在のHPからダメージ量を逆算
        const newDamage = this.#maxHealth[part] - hpData[key].current;
        // 0未満にならないよう制限
        const validDamage = Math.max(0, newDamage);
        
        if (this.#currentDamage[part] !== validDamage) {
          this.#currentDamage[part] = validDamage;
          changed = true;
        }
      }
    });

    if (changed) {
      this.#notifyChange("all", HP_ACTIONS.RESTORE, 0);
      console.log("[HealthManager] Synced from server data successfully.");
    }
  }

  // ==========================================
  // 統計情報
  // ==========================================

  getStatistics() {
    if (!this.#config.enableStatistics) return null;
    return Object.freeze({
      ...this.#statistics,
      damageByPart: { ...this.#statistics.damageByPart },
      healingByPart: { ...this.#statistics.healingByPart },
    });
  }

  resetStatistics() {
    if (this.#config.enableStatistics) this.#resetStatistics();
  }

  // ==========================================
  // プライベートメソッド
  // ==========================================

  #isValidPart(part) {
    return ALL_PARTS.includes(part);
  }
  #isValidAmount(amount) {
    return typeof amount === "number" && !isNaN(amount) && amount >= 0;
  }

  #handleError(message, returnValue) {
    const errorMessage = `health-manager: ${message}`;
    if (this.#config.strictMode) throw new Error(errorMessage);
    console.error(errorMessage);
    return returnValue;
  }

  #notifyChange(part, action, amount) {
    const event = Object.freeze({
      part,
      action,
      amount,
      timestamp: Date.now(),
      state: this.getState(),
    });
    this.#listeners.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error("health-manager: リスナーエラー:", error);
      }
    });
  }

  // ==========================================
  // イベント購読
  // ==========================================

  onChange(callback) {
    if (typeof callback !== "function") {
      this.#handleError("コールバックは関数である必要があります");
      return () => {};
    }
    this.#listeners.push(callback);
    return () => this.offChange(callback);
  }

  offChange(callback) {
    const index = this.#listeners.indexOf(callback);
    if (index !== -1) this.#listeners.splice(index, 1);
  }

  clearListeners() {
    this.#listeners = [];
  }

  // ==========================================
  // デバッグ
  // ==========================================

  debugLog() {
    console.log("=== Health Manager 状態 ===");
    console.log("初期値:", this.#initialValues);
    console.log("合計HP:", this.getTotalHP());
    console.log("部位別HP:", this.getAllHP());
    console.log("統計情報:", this.getStatistics());
    console.log("リスナー数:", this.#listeners.length);
    console.log("設定:", this.#config);
  }

  isInitialized() {
    return this.#initialized;
  }

  // ==========================================
  // エイリアスメソッド（互換性のため）
  // ==========================================

  /**
   * applyDamage() のエイリアス
   * @param {string} part - 部位名
   * @param {number} amount - ダメージ量
   * @returns {boolean}
   */
  takeDamage(part, amount) {
    return this.applyDamage(part, amount);
  }

  /**
   * 簡易な部位名を受け入れるラッパー
   * @param {string} simplePart - 'head', 'torso', 'rightArm' など
   * @param {number} amount - ダメージ量
   * @returns {boolean}
   */
  takeDamageSimple(simplePart, amount) {
    const partNameMap = {
      head: BODY_PARTS.HEAD,
      torso: BODY_PARTS.TORSO,
      rightArm: BODY_PARTS.RIGHT_ARM,
      leftArm: BODY_PARTS.LEFT_ARM,
      rightLeg: BODY_PARTS.RIGHT_LEG,
      leftLeg: BODY_PARTS.LEFT_LEG,
    };

    const fullPartName = partNameMap[simplePart];

    if (!fullPartName) {
      return this.#handleError(`無効な部位名: ${simplePart}`, false);
    }

    return this.applyDamage(fullPartName, amount);
  }
}

export function initHealthManager(config = {}) {
  return new HealthManager(config);
}

export const healthManager = new HealthManager();
export default HealthManager;
