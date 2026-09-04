// ==========================================
// ui-health.js - HP表示専用UIモジュール（最終確定版）
// ==========================================
// 責務：
// - 各部位HPの数値表示更新
// - HP割合に応じた色・クラス切り替え
// - 合計HPの表示更新
// - health-manager との完全同期
//
// 禁止事項：
// - HPの計算・減算・回復ロジック
// - game-state の直接変更
// - ダウン判定・死亡判定
//
// 設計思想：
// 「UIは読むだけ、決めない」
// health-manager を唯一の情報源とし、完全に従属する
// ==========================================

import { BODY_PARTS } from "../health/health-manager.js";

// ==========================================
// 定数定義
// ==========================================

// TODO: 将来的に constants.js に移動
// HP割合による色分け閾値
const HP_COLOR_THRESHOLDS = Object.freeze({
  BLUE: 100, // 100%以上
  GREEN: 50, // 50%〜74%
  YELLOW: 1, // 1%〜49%
  RED: 0, // 0%
});

// 色クラス名
const HP_COLOR_CLASSES = Object.freeze({
  BLUE: "is-high",
  GREEN: "is-mid",
  YELLOW: "is-low",
  RED: "is-zero",
});

// 全部位の配列
const ALL_PARTS = Object.freeze(Object.values(BODY_PARTS));

// デフォルトオプション
const DEFAULT_OPTIONS = Object.freeze({
  autoUpdate: true, // 自動更新を有効にするか
  showMaxHP: true, // 最大HP表示を含めるか
  animateChanges: false, // 変更時にアニメーションするか（将来用）
  updateOnlyChanged: true, // 変更された部位のみ更新するか
});

// ==========================================
// UIHealth クラス
// ==========================================

class UIHealth {
  // プライベートフィールド
  #healthManager = null;
  #elements = {};
  #initialized = false;
  #options = {};
  #isUpdating = false;
  #lastHPValues = {}; // 前回の値を保持（変更検出用）

  /**
   * コンストラクタ
   * @param {Object} healthManager - health-manager インスタンス
   * @param {Object} options - 初期化オプション
   */
  constructor(healthManager, options = {}) {
    this.#healthManager = healthManager;
    this.#options = { ...DEFAULT_OPTIONS, ...options };

    // 前回値を初期化
    this.#initLastValues();
  }

  /**
   * 前回値を初期化
   * @private
   */
  #initLastValues() {
    ALL_PARTS.forEach((part) => {
      this.#lastHPValues[part] = { current: null, max: null };
    });
    this.#lastHPValues.total = { current: null, max: null };
  }

  // ==========================================
  // 初期化
  // ==========================================

  /**
   * 初期化処理
   * DOMContentLoaded後に呼び出すこと
   * @returns {boolean} 成功なら true
   */
  init() {
    if (this.#initialized) {
      console.warn("ui-health: 既に初期化済みです");
      return false;
    }

    // health-manager の存在確認
    if (!this.#healthManager) {
      console.error("ui-health: healthManager が設定されていません");
      return false;
    }

    // DOM要素を取得・キャッシュ
    if (!this.#initElements()) {
      console.error("ui-health: 必要なDOM要素が見つかりません");
      return false;
    }

    // イベントをバインド
    this.#bindEvents();

    // 初期表示を更新
    this.updateAll();

    this.#initialized = true;
    return true;
  }

  /**
   * DOM要素を初期化・キャッシュ
   * @private
   * @returns {boolean} 成功なら true
   */
  #initElements() {
    let missingElements = 0;

    // 各部位のDOM要素をキャッシュ
    ALL_PARTS.forEach((part) => {
      const hp = document.getElementById(part);
      const color = document.getElementById(part + "Color");
      const input = document.getElementById(part + "Input");

      this.#elements[part] = { hp, color, input };

      // 必須要素（hp, color）のチェック
      if (!hp || !color) {
        console.warn(`ui-health: ${part} の表示要素が見つかりません`);
        missingElements++;
      }
    });

    // 合計HPのDOM要素をキャッシュ
    this.#elements.total = {
      hp: document.getElementById("totalHp"),
      color: document.getElementById("totalHpColor"),
    };

    // 合計HP要素は任意
    if (!this.#elements.total.hp || !this.#elements.total.color) {
      console.info("ui-health: 合計HP表示要素が見つかりません（オプション）");
    }

    // 最大HP更新ボタン（開発用・任意）
    this.#elements.updateHpButton = document.getElementById("updateHpButton");

    // 必須要素が多数欠けている場合はエラー
    if (missingElements > ALL_PARTS.length / 2) {
      console.error(
        `ui-health: ${missingElements}個の必須要素が見つかりません`,
      );
      return false;
    }

    return true;
  }

  /**
   * healthManager の変更イベントを購読
   * @private
   */
  #bindEvents() {
    if (!this.#options.autoUpdate) return;

    // healthManager からの通知を受け取る
    this.#healthManager.onChange((event) => {
      this.#handleHealthChange(event);
    });

    // 開発用: 最大HP更新ボタン
    if (this.#elements.updateHpButton) {
      this.#elements.updateHpButton.addEventListener("click", () => {
        this.#handleMaxHPUpdate();
      });
    }
  }

  // ==========================================
  // イベントハンドラー
  // ==========================================

  /**
   * healthManager からの変更通知を処理
   * @private
   */
  #handleHealthChange(event) {
    if (!this.#initialized) return;

    // 重複更新を防ぐ
    if (this.#isUpdating) return;

    this.#isUpdating = true;

    try {
      if (event.part === "all") {
        // 全部位更新
        this.updateAll();
      } else if (this.#isValidPart(event.part)) {
        // 個別部位更新
        this.updatePart(event.part);
        // 部位が更新されたら合計HPも更新
        this.#updateTotalHP();
      }
    } catch (error) {
      console.error("ui-health: HP変更処理中にエラー:", error);
    } finally {
      this.#isUpdating = false;
    }
  }

  // ==========================================
  // 表示更新メソッド（公開API）
  // ==========================================

  /**
   * 指定部位のHP表示を更新
   * @param {string} part - 部位名（例: 'headHp'）
   */
  updatePart(part) {
    if (!this.#isValidPart(part)) {
      console.warn(`ui-health: 無効な部位名: ${part}`);
      return;
    }

    const elements = this.#elements[part];
    if (!elements) {
      console.warn(`ui-health: 部位 "${part}" の要素が見つかりません`);
      return;
    }

    try {
      // healthManager から現在のHPを取得
      const currentHP = this.#healthManager.getCurrentHP(part);
      const maxHP = this.#healthManager.getMaxHP(part);

      // 値が変更された場合のみ更新（パフォーマンス最適化）
      if (
        this.#options.updateOnlyChanged &&
        this.#hasNotChanged(part, currentHP, maxHP)
      ) {
        return;
      }

      // HP数値表示を更新
      this.#updateHPText(elements.hp, currentHP, maxHP);

      // HP色表示を更新
      this.#updateHPColor(elements.color, currentHP, maxHP);

      // 前回値を記録
      this.#lastHPValues[part] = { current: currentHP, max: maxHP };
    } catch (error) {
      console.error(`ui-health: ${part} の更新中にエラー:`, error);
    }
  }

  /**
   * 全部位のHP表示を更新
   */
  updateAll() {
    ALL_PARTS.forEach((part) => {
      this.updatePart(part);
    });

    // 合計HPも更新
    this.#updateTotalHP();
  }

  /**
   * 全部位のHP表示を更新
   */
  updateAll() {
    ALL_PARTS.forEach((part) => {
      this.updatePart(part);
    });

    // 合計HPも更新
    this.#updateTotalHP();
  }

  // ==========================================
  // 追加：サーバーデータからの更新メソッド
  // ==========================================

  /**
   * サーバーから取得したHPデータで表示を更新
   * @param {Object} hpData - HP データ
   * @param {Object} hpData.headHp - 頭部HP { current: number }
   * @param {Object} hpData.torsoHp - 胴体HP { current: number }
   * @param {Object} hpData.rightarmHp - 右腕HP { current: number }
   * @param {Object} hpData.leftarmHp - 左腕HP { current: number }
   * @param {Object} hpData.rightlegHp - 右脚HP { current: number }
   * @param {Object} hpData.leftlegHp - 左脚HP { current: number }
   */
  update(hpData) {
    if (!this.#initialized) {
      console.warn("ui-health: 初期化されていません");
      return;
    }

    if (!hpData) {
      console.warn("ui-health: hpData が null です");
      return;
    }

    // 各部位のHP表示を更新
    ALL_PARTS.forEach((part) => {
      const partData = hpData[part];

      if (!partData) {
        console.warn(`[UIHealth] ${part} のデータがありません`);
        return;
      }

      const elements = this.#elements[part];
      if (!elements) {
        return;
      }

      try {
        // サーバーから取得した現在HP
        const currentHP = partData.current;

        // healthManagerから最大HPを取得
        const maxHP = this.#healthManager.getMaxHP(part);

        // HP表示を更新
        this.#updateHPText(elements.hp, currentHP, maxHP);
        this.#updateHPColor(elements.color, currentHP, maxHP);

        // 前回値を記録
        this.#lastHPValues[part] = { current: currentHP, max: maxHP };

      } catch (error) {
        console.error(`[UIHealth] ${part} の更新中にエラー:`, error);
      }
    });

    // 合計HPも更新
    this.#updateTotalHP();
  }

  /**
   * UI表示をリセット（初期値に戻す）
   */
  reset() {
    if (!this.#initialized) {
      console.warn("ui-health: 初期化されていません");
      return;
    }

    // 前回値をクリア
    this.#initLastValues();

    // 全表示を更新
    this.updateAll();
  }

  // ==========================================
  // 内部更新メソッド
  // ==========================================

  /**
   * HP数値表示を更新
   * @private
   */
  #updateHPText(element, currentHP, maxHP) {
    if (!element) return;

    const text = this.#options.showMaxHP
      ? `HP: ${currentHP}/${maxHP}`
      : `${currentHP}`;

    element.textContent = text;

    // TODO: アニメーション
    if (this.#options.animateChanges) {
      this.#animateHPChange(element);
    }
  }

  /**
   * HP色表示を更新
   * @private
   */
  #updateHPColor(element, currentHP, maxHP) {
    if (!element) return;

    // HP割合を計算（0除算を防ぐ）
    const percentage = maxHP > 0 ? (currentHP / maxHP) * 100 : 0;

    // 色クラスを決定
    const colorClass = this.#getColorClass(percentage);

    // 既存の色クラスを全て削除
    this.#removeAllColorClasses(element);

    // 新しい色クラスを適用
    element.classList.add(colorClass);

    // data属性に割合を保存（CSS・デバッグで利用可能）
    element.setAttribute("data-hp-percentage", percentage.toFixed(1));
    element.setAttribute("data-hp-current", currentHP);
    element.setAttribute("data-hp-max", maxHP);
  }

  /**
   * 合計HPの表示を更新
   * @private
   */
  #updateTotalHP() {
    const totalElements = this.#elements.total;
    if (!totalElements.hp && !totalElements.color) {
      // 合計HP表示要素がない場合はスキップ
      return;
    }

    try {
      // healthManager から合計HPを取得
      const totalHP = this.#healthManager.getTotalHP();

      // 値が変更された場合のみ更新
      if (
        this.#options.updateOnlyChanged &&
        this.#hasNotChanged("total", totalHP.current, totalHP.max)
      ) {
        return;
      }

      // 合計HP表示を更新
      this.#updateHPText(totalElements.hp, totalHP.current, totalHP.max);

      // 合計HP色表示を更新
      this.#updateHPColor(totalElements.color, totalHP.current, totalHP.max);

      // 前回値を記録
      this.#lastHPValues.total = { current: totalHP.current, max: totalHP.max };
    } catch (error) {
      console.error("ui-health: 合計HPの更新中にエラー:", error);
    }
  }

  // ==========================================
  // ユーティリティメソッド
  // ==========================================

  /**
   * HP割合から色クラスを決定
   * @private
   */
  #getColorClass(percentage) {
    if (percentage >= HP_COLOR_THRESHOLDS.BLUE) {
      return HP_COLOR_CLASSES.BLUE;
    } else if (percentage >= HP_COLOR_THRESHOLDS.GREEN) {
      return HP_COLOR_CLASSES.GREEN;
    } else if (percentage >= HP_COLOR_THRESHOLDS.YELLOW) {
      return HP_COLOR_CLASSES.YELLOW;
    } else {
      return HP_COLOR_CLASSES.RED;
    }
  }

  /**
   * 要素から全ての色クラスを削除
   * @private
   */
  #removeAllColorClasses(element) {
    if (!element) return;

    Object.values(HP_COLOR_CLASSES).forEach((colorClass) => {
      element.classList.remove(colorClass);
    });
  }

  /**
   * 部位名が有効かチェック
   * @private
   */
  #isValidPart(part) {
    return ALL_PARTS.includes(part);
  }

  /**
   * 値が前回から変更されていないかチェック
   * @private
   */
  #hasNotChanged(part, currentHP, maxHP) {
    const last = this.#lastHPValues[part];
    return last && last.current === currentHP && last.max === maxHP;
  }

  // ==========================================
  // 開発用メソッド
  // ==========================================

  /**
   * 最大HP更新処理（開発用）
   * 入力欄から値を読み取り、healthManager に反映
   * @private
   */
  #handleMaxHPUpdate() {
    ALL_PARTS.forEach((part) => {
      const input = this.#elements[part]?.input;
      if (!input) return;

      const value = parseInt(input.value, 10);

      // 妥当性チェック
      if (!isNaN(value) && value > 0) {
        this.#healthManager.setMaxHP(part, value);
      }
    });

    // 更新後に全表示を更新
    this.updateAll();
  }

  /**
   * アニメーション効果（将来用）
   * @private
   */
  #animateHPChange(element) {
    // TODO: 実装
    // element.classList.add('hp-change-animation');
    // setTimeout(() => element.classList.remove('hp-change-animation'), 500);
  }

  // ==========================================
  // 状態取得
  // ==========================================

  /**
   * 初期化済みかチェック
   * @returns {boolean} 初期化済みなら true
   */
  isInitialized() {
    return this.#initialized;
  }

  /**
   * 現在の設定を取得
   * @returns {Object} 設定のコピー
   */
  getOptions() {
    return { ...this.#options };
  }

  /**
   * 表示中のHP値を取得（デバッグ用）
   * @returns {Object} 全部位のHP表示値
   */
  getDisplayedValues() {
    const values = {};

    ALL_PARTS.forEach((part) => {
      const elements = this.#elements[part];
      if (elements?.hp) {
        values[part] = {
          text: elements.hp.textContent,
          color: this.#getActiveColorClass(elements.color),
        };
      }
    });

    if (this.#elements.total?.hp) {
      values.total = {
        text: this.#elements.total.hp.textContent,
        color: this.#getActiveColorClass(this.#elements.total.color),
      };
    }

    return values;
  }

  /**
   * 要素に適用されている色クラスを取得
   * @private
   */
  #getActiveColorClass(element) {
    if (!element) return null;

    for (const colorClass of Object.values(HP_COLOR_CLASSES)) {
      if (element.classList.contains(colorClass)) {
        return colorClass;
      }
    }

    return null;
  }

  // ==========================================
  // デバッグ
  // ==========================================

  /**
   * 現在の状態をコンソールに出力（デバッグ用）
   */
  debugLog() {
    console.log("=== UI Health 状態 ===");
    console.log("初期化済み:", this.#initialized);
    console.log("オプション:", this.#options);
    console.log("要素数:", Object.keys(this.#elements).length);
    console.log("更新中:", this.#isUpdating);

    console.log("\n部位別HP:");
    ALL_PARTS.forEach((part) => {
      try {
        const currentHP = this.#healthManager.getCurrentHP(part);
        const maxHP = this.#healthManager.getMaxHP(part);
        const percentage = this.#healthManager.getHPPercentage(part);
        const color = this.#getColorClass(percentage);

        console.log(
          `  ${part}: ${currentHP}/${maxHP} (${percentage.toFixed(1)}%) - ${color}`,
        );
      } catch (error) {
        console.error(`  ${part}: エラー`, error);
      }
    });

    console.log("\n合計HP:");
    try {
      const totalHP = this.#healthManager.getTotalHP();
      const color = this.#getColorClass(totalHP.percentage);
      console.log(
        `  ${totalHP.current}/${totalHP.max} (${totalHP.percentage.toFixed(1)}%) - ${color}`,
      );
    } catch (error) {
      console.error("  エラー", error);
    }
  }

  /**
   * DOM要素の状態を確認
   */
  debugElements() {
    console.log("=== UI Health DOM要素 ===");

    ALL_PARTS.forEach((part) => {
      const elements = this.#elements[part];
      console.log(`${part}:`, {
        hp: elements?.hp ? "✓" : "✗",
        color: elements?.color ? "✓" : "✗",
        input: elements?.input ? "✓" : "✗",
      });
    });

    console.log("total:", {
      hp: this.#elements.total?.hp ? "✓" : "✗",
      color: this.#elements.total?.color ? "✓" : "✗",
    });

    console.log("updateHpButton:", this.#elements.updateHpButton ? "✓" : "✗");
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * UIHealth インスタンスを初期化して返す
 * linkon-main.js から呼び出される
 *
 * @param {Object} healthManager - health-manager.js のインスタンス
 * @param {Object} options - 初期化オプション
 * @param {boolean} options.autoUpdate - 自動更新を有効にするか（デフォルト: true）
 * @param {boolean} options.showMaxHP - 最大HP表示を含めるか（デフォルト: true）
 * @param {boolean} options.animateChanges - 変更時にアニメーションするか（デフォルト: false）
 * @param {boolean} options.updateOnlyChanged - 変更された部位のみ更新するか（デフォルト: true）
 * @returns {UIHealth|null} UIHealth インスタンス（失敗時は null）
 */
export function initUIHealth(healthManager, options = {}) {
  if (!healthManager) {
    console.error("ui-health: healthManager が渡されていません");
    return null;
  }

  const uiHealth = new UIHealth(healthManager, options);

  if (!uiHealth.init()) {
    console.error("ui-health: 初期化に失敗しました");
    return null;
  }

  return uiHealth;
}

// 定数をエクスポート（他モジュールで参照可能）
export { HP_COLOR_THRESHOLDS, HP_COLOR_CLASSES };

// デフォルトエクスポート
export default UIHealth;
