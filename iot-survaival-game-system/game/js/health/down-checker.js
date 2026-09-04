// ==========================================
// down-checker.js - ダウン判定専用モジュール（完全版）
// ==========================================
import { BODY_PARTS } from "../core/constants.js";

// ==========================================
// 判定ルールの定義
// ==========================================

/**
 * ダウン判定ルールの種類
 */
export const DOWN_RULES = Object.freeze({
  TOTAL_HP_ZERO: "TOTAL_HP_ZERO",
  CORE_PART_ZERO: "CORE_PART_ZERO",
  ANY_PART_ZERO: "ANY_PART_ZERO",
  ALL_PARTS_ZERO: "ALL_PARTS_ZERO",
  MULTIPLE_PARTS_ZERO: "MULTIPLE_PARTS_ZERO",
  CUSTOM: "CUSTOM",
});

/**
 * コア部位（重要部位）
 */
const CORE_PARTS = Object.freeze([BODY_PARTS.HEAD, BODY_PARTS.TORSO]);

/**
 * 手足部位
 */
const LIMB_PARTS = Object.freeze([
  BODY_PARTS.LEFT_ARM,
  BODY_PARTS.RIGHT_ARM,
  BODY_PARTS.LEFT_LEG,
  BODY_PARTS.RIGHT_LEG,
]);

/**
 * 全部位
 */
const ALL_PARTS = Object.freeze(Object.values(BODY_PARTS));

// ==========================================
// 判定関数群（純粋関数）
// ==========================================

/**
 * 合計HPが0かチェック（B案）
 * @param {Object} hpState - HP状態 { part: { current, max } }
 * @returns {Object} { isDown: boolean, reason: string }
 */
function checkTotalHpZero(hpState) {
  let totalHP = 0;

  ALL_PARTS.forEach((part) => {
    totalHP += hpState[part]?.current ?? 0;
  });

  const isDown = totalHP === 0;

  return {
    isDown,
    reason: isDown ? "合計HPが0になりました" : null,
    details: { totalHP },
  };
}

/**
 * コア部位（頭または胴体）が0かチェック（旧B案）
 * @param {Object} hpState - HP状態
 * @returns {Object} { isDown: boolean, reason: string }
 */
function checkCorePartZero(hpState) {
  const headHP = hpState[BODY_PARTS.HEAD]?.current ?? 0;
  const torsoHP = hpState[BODY_PARTS.TORSO]?.current ?? 0;

  const isDown = headHP === 0 || torsoHP === 0;

  let reason = null;
  if (isDown) {
    if (headHP === 0 && torsoHP === 0) {
      reason = "頭と胴体のHPが0になりました";
    } else if (headHP === 0) {
      reason = "頭のHPが0になりました";
    } else {
      reason = "胴体のHPが0になりました";
    }
  }

  return {
    isDown,
    reason,
    details: { headHP, torsoHP },
  };
}

/**
 * いずれかの部位が0かチェック（A案）
 * @param {Object} hpState - HP状態
 * @returns {Object} { isDown: boolean, reason: string }
 */
function checkAnyPartZero(hpState) {
  const zeroParts = [];

  ALL_PARTS.forEach((part) => {
    const hp = hpState[part]?.current ?? 0;
    if (hp === 0) {
      zeroParts.push(part);
    }
  });

  const isDown = zeroParts.length > 0;

  return {
    isDown,
    reason: isDown ? `${zeroParts.join(", ")} のHPが0になりました` : null,
    details: { zeroParts },
  };
}

/**
 * 全部位が0かチェック（C案）
 * @param {Object} hpState - HP状態
 * @returns {Object} { isDown: boolean, reason: string }
 */
function checkAllPartsZero(hpState) {
  const allZero = ALL_PARTS.every((part) => {
    const hp = hpState[part]?.current ?? 0;
    return hp === 0;
  });

  return {
    isDown: allZero,
    reason: allZero ? "全部位のHPが0になりました" : null,
    details: { allZero },
  };
}

/**
 * 複数部位（N個以上）が0かチェック（D案）
 * @param {Object} hpState - HP状態
 * @param {number} threshold - 閾値（デフォルト: 2）
 * @returns {Object} { isDown: boolean, reason: string }
 */
function checkMultiplePartsZero(hpState, threshold = 2) {
  const zeroParts = [];

  ALL_PARTS.forEach((part) => {
    const hp = hpState[part]?.current ?? 0;
    if (hp === 0) {
      zeroParts.push(part);
    }
  });

  const isDown = zeroParts.length >= threshold;

  return {
    isDown,
    reason: isDown ? `${zeroParts.length}部位のHPが0になりました` : null,
    details: { zeroParts, threshold },
  };
}

// ==========================================
// ダウンチェッカークラス
// ==========================================

class DownChecker {
  // プライベートフィールド
  #currentRule = DOWN_RULES.TOTAL_HP_ZERO;
  #customRule = null;
  #multiplePartsThreshold = 2;

  /**
   * コンストラクタ
   * @param {Object} config - 設定
   * @param {string} config.rule - 判定ルール（DOWN_RULES のいずれか）
   * @param {Function} config.customRule - カスタム判定関数
   * @param {number} config.multiplePartsThreshold - 複数部位判定の閾値
   */
  constructor(config = {}) {
    this.#currentRule = config.rule || DOWN_RULES.TOTAL_HP_ZERO;
    this.#customRule = config.customRule || null;
    this.#multiplePartsThreshold = config.multiplePartsThreshold || 2;
  }

  /**
   * ダウン状態かチェック（メインAPI）
   * @param {Object} hpState - HP状態オブジェクト
   * @returns {Object} { isDown: boolean, reason: string, rule: string, details: Object }
   */
  check(hpState) {
    if (!this.#isValidHpState(hpState)) {
      console.error("down-checker: 無効なHP状態が渡されました");
      return {
        isDown: false,
        reason: "エラー: 無効なHP状態",
        rule: this.#currentRule,
        details: {},
      };
    }

    const result = this.#executeRule(hpState);

    return {
      ...result,
      rule: this.#currentRule,
    };
  }

  /**
   * ルールを実行
   * @private
   */
  #executeRule(hpState) {
    switch (this.#currentRule) {
      case DOWN_RULES.TOTAL_HP_ZERO:
        return checkTotalHpZero(hpState);

      case DOWN_RULES.CORE_PART_ZERO:
        return checkCorePartZero(hpState);

      case DOWN_RULES.ANY_PART_ZERO:
        return checkAnyPartZero(hpState);

      case DOWN_RULES.ALL_PARTS_ZERO:
        return checkAllPartsZero(hpState);

      case DOWN_RULES.MULTIPLE_PARTS_ZERO:
        return checkMultiplePartsZero(hpState, this.#multiplePartsThreshold);

      case DOWN_RULES.CUSTOM:
        if (typeof this.#customRule === "function") {
          return this.#customRule(hpState);
        }
        console.error("down-checker: カスタムルールが設定されていません");
        return { isDown: false, reason: "カスタムルールエラー" };

      default:
        console.error(`down-checker: 不明なルール: ${this.#currentRule}`);
        return { isDown: false, reason: "不明なルール" };
    }
  }

  /**
   * HP状態が有効かチェック
   * @private
   */
  #isValidHpState(hpState) {
    if (!hpState || typeof hpState !== "object") {
      return false;
    }

    // 少なくとも1つの部位情報があるか
    return ALL_PARTS.some((part) => {
      return hpState[part] && typeof hpState[part].current === "number";
    });
  }

  // ==========================================
  // ルール変更API
  // ==========================================

  /**
   * 判定ルールを変更
   * @param {string} rule - DOWN_RULES のいずれか
   */
  setRule(rule) {
    if (!Object.values(DOWN_RULES).includes(rule)) {
      console.error(`down-checker: 無効なルール: ${rule}`);
      return;
    }

    this.#currentRule = rule;
  }

  /**
   * カスタムルールを設定
   * @param {Function} customRule - (hpState) => { isDown, reason }
   */
  setCustomRule(customRule) {
    if (typeof customRule !== "function") {
      console.error("down-checker: カスタムルールは関数である必要があります");
      return;
    }

    this.#customRule = customRule;
    this.#currentRule = DOWN_RULES.CUSTOM;
  }

  /**
   * 複数部位判定の閾値を設定
   * @param {number} threshold - 閾値
   */
  setMultiplePartsThreshold(threshold) {
    if (typeof threshold !== "number" || threshold < 1) {
      console.error("down-checker: 閾値は1以上の数値である必要があります");
      return;
    }

    this.#multiplePartsThreshold = threshold;
  }

  /**
   * 現在のルールを取得
   * @returns {string} 現在のルール
   */
  getCurrentRule() {
    return this.#currentRule;
  }

  // ==========================================
  // 便利メソッド
  // ==========================================

  /**
   * 簡易チェック（boolean のみ）
   * @param {Object} hpState - HP状態
   * @returns {boolean} ダウン状態なら true
   */
  isDown(hpState) {
    return this.check(hpState).isDown;
  }

  /**
   * 行動可能かチェック
   * @param {Object} hpState - HP状態
   * @returns {boolean} 行動可能なら true
   */
  canAct(hpState) {
    return !this.isDown(hpState);
  }

  /**
   * 射撃可能かチェック
   * @param {Object} hpState - HP状態
   * @returns {boolean} 射撃可能なら true
   */
  canShoot(hpState) {
    return this.canAct(hpState);
  }

  // ==========================================
  // 静的メソッド（純粋関数として使用）
  // ==========================================

  /**
   * 合計HPが0かチェック（静的）
   * @static
   */
  static checkTotalHpZero(hpState) {
    return checkTotalHpZero(hpState);
  }

  /**
   * コア部位が0かチェック（静的）
   * @static
   */
  static checkCorePartZero(hpState) {
    return checkCorePartZero(hpState);
  }

  /**
   * いずれかの部位が0かチェック（静的）
   * @static
   */
  static checkAnyPartZero(hpState) {
    return checkAnyPartZero(hpState);
  }

  /**
   * 全部位が0かチェック（静的）
   * @static
   */
  static checkAllPartsZero(hpState) {
    return checkAllPartsZero(hpState);
  }

  /**
   * 複数部位が0かチェック（静的）
   * @static
   */
  static checkMultiplePartsZero(hpState, threshold = 2) {
    return checkMultiplePartsZero(hpState, threshold);
  }

  // ==========================================
  // デバッグ
  // ==========================================

  /**
   * 現在の設定を取得
   * @returns {Object} 設定情報
   */
  getConfig() {
    return {
      currentRule: this.#currentRule,
      hasCustomRule: !!this.#customRule,
      multiplePartsThreshold: this.#multiplePartsThreshold,
    };
  }

  /**
   * デバッグ情報を出力
   */
  debugLog() {
    console.log("=== Down Checker 状態 ===");
    console.log("現在のルール:", this.#currentRule);
    console.log("カスタムルール:", this.#customRule ? "設定済み" : "なし");
    console.log("複数部位閾値:", this.#multiplePartsThreshold);
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * DownChecker インスタンスを初期化して返す
 *
 * @param {Object} config - 初期設定
 * @param {string} config.rule - 判定ルール（デフォルト: TOTAL_HP_ZERO）
 * @param {Function} config.customRule - カスタム判定関数
 * @param {number} config.multiplePartsThreshold - 複数部位判定の閾値
 * @returns {DownChecker} DownChecker インスタンス
 */
export function initDownChecker(config = {}) {
  return new DownChecker(config);
}

/**
 * シングルトンとしてもエクスポート
 * デフォルトは「合計HPが0」ルール（B案）
 */
export const downChecker = new DownChecker({
  rule: DOWN_RULES.TOTAL_HP_ZERO,
});

// 純粋関数を個別にエクスポート（テスト・直接利用向け）
export {
  checkTotalHpZero,
  checkCorePartZero,
  checkAnyPartZero,
  checkAllPartsZero,
  checkMultiplePartsZero,
};

// デフォルトエクスポート
export default DownChecker;
