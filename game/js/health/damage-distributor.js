// ==========================================
// damage-distributor.js - ダメージ計算・分配エンジン（完全版）
// ==========================================
// 責務：
// - 被弾情報を「実ダメージ」に変換（計算のみ）
// - 部位選択ロジック（ランダム・指定・複数）
// - ダメージ補正計算（武器・部位倍率・防具・クリティカル）
// - 手足破壊時の分配ルール適用
// - 将来の拡張に対応した設計
// 
// 禁止事項：
// - HP計算・HP変更（health-manager に委譲）
// - DOWN判定（down-checker に委譲）
// - ゲーム状態変更（game-state に委譲）
// - DOM操作・UI更新
// 
// 設計思想：
// 「どこに・どれだけダメージを与えるか」を計算するのみ
// 実際のHP変更は呼び出し側が health-manager を使って行う
// 完全な純粋関数設計で、テスト・拡張が容易
// ==========================================

import { BODY_PARTS } from './health-manager.js';

// ==========================================
// 定数定義（将来的に constants.js に移動）
// ==========================================

// 手足の部位
const LIMB_PARTS = Object.freeze([
  BODY_PARTS.LEFT_ARM,
  BODY_PARTS.RIGHT_ARM,
  BODY_PARTS.LEFT_LEG,
  BODY_PARTS.RIGHT_LEG
]);

// コア部位（手足破壊時の分配先）
const CORE_PARTS = Object.freeze([
  BODY_PARTS.HEAD,
  BODY_PARTS.TORSO
]);

// 全部位の配列
const ALL_PARTS = Object.freeze(Object.values(BODY_PARTS));

// 部位倍率（ヘッドショットボーナスなど）
const DEFAULT_PART_MULTIPLIERS = Object.freeze({
  [BODY_PARTS.HEAD]: 1.5,
  [BODY_PARTS.TORSO]: 1.0,
  [BODY_PARTS.LEFT_ARM]: 0.8,
  [BODY_PARTS.RIGHT_ARM]: 0.8,
  [BODY_PARTS.LEFT_LEG]: 0.8,
  [BODY_PARTS.RIGHT_LEG]: 0.8
});

// 防具レベルによるダメージ軽減率
const DEFAULT_ARMOR_REDUCTION = Object.freeze({
  0: 1.0,   // 防具なし
  1: 0.9,   // レベル1（10%軽減）
  2: 0.8,   // レベル2（20%軽減）
  3: 0.7,   // レベル3（30%軽減）
  4: 0.6    // レベル4（40%軽減）
});

// 武器種別による補正
const DEFAULT_WEAPON_MODIFIERS = Object.freeze({
  'pistol': 1.0,
  'rifle': 1.2,
  'shotgun': 1.5,
  'sniper': 2.0,
  'melee': 0.8
});

// ダメージタイプ
export const DAMAGE_TYPES = Object.freeze({
  NORMAL: 'normal',       // 通常ダメージ
  CRITICAL: 'critical',   // クリティカル
  HEADSHOT: 'headshot',   // ヘッドショット
  MELEE: 'melee',         // 近接
  EXPLOSION: 'explosion', // 爆発
  DOT: 'dot'              // 継続ダメージ
});

// 部位選択方法
export const TARGET_METHODS = Object.freeze({
  SPECIFIED: 'specified', // 指定部位
  RANDOM: 'random',       // ランダム
  ALL: 'all',             // 全部位
  CORE: 'core',           // コア部位のみ
  LIMBS: 'limbs'          // 手足のみ
});

// ==========================================
// DamageDistributor クラス
// ==========================================

class DamageDistributor {
  // プライベートフィールド
  #config = {};
  #destroyedLimbs = {};
  #listeners = [];
  #partMultipliers = {};
  #armorReduction = {};
  #weaponModifiers = {};

  /**
   * コンストラクタ
   * @param {Object} config - 設定オプション
   */
  constructor(config = {}) {
    // 設定を初期化
    this.#config = {
      enableCritical: config.enableCritical ?? true,
      criticalChance: config.criticalChance ?? 0.1,
      criticalMultiplier: config.criticalMultiplier ?? 2.0,
      enableLimbDestruction: config.enableLimbDestruction ?? true,
      distributionRatio: config.distributionRatio ?? 0.5, // 手足破壊時の分配比率
      ...config
    };

    // 補正値を初期化（カスタマイズ可能）
    this.#partMultipliers = { ...DEFAULT_PART_MULTIPLIERS, ...(config.partMultipliers || {}) };
    this.#armorReduction = { ...DEFAULT_ARMOR_REDUCTION, ...(config.armorReduction || {}) };
    this.#weaponModifiers = { ...DEFAULT_WEAPON_MODIFIERS, ...(config.weaponModifiers || {}) };

    // 手足破壊状態を初期化
    this.#resetDestroyedLimbs();
  }

  /**
   * 手足破壊状態をリセット
   * @private
   */
  #resetDestroyedLimbs() {
    this.#destroyedLimbs = {};
    LIMB_PARTS.forEach(part => {
      this.#destroyedLimbs[part] = false;
    });
  }

  // ==========================================
  // メインAPI - ダメージ分配計算
  // ==========================================

  /**
   * ダメージを計算・分配
   * @param {Object} damageInfo - ダメージ情報
   * @param {number} damageInfo.rawDamage - 生ダメージ値
   * @param {string} damageInfo.targetMethod - 部位選択方法（TARGET_METHODS）
   * @param {string} damageInfo.targetPart - 指定部位（targetMethod='specified'の場合）
   * @param {string} damageInfo.weaponType - 武器種別（オプション）
   * @param {number} damageInfo.armorLevel - 防具レベル（オプション、デフォルト: 0）
   * @param {string} damageInfo.damageType - ダメージタイプ（オプション）
   * @returns {Array<Object>} ダメージ結果の配列 [{ part, finalDamage, isCritical, ... }]
   */
  distributeDamage(damageInfo) {
    const {
      rawDamage,
      targetMethod = TARGET_METHODS.SPECIFIED,
      targetPart = null,
      weaponType = null,
      armorLevel = 0,
      damageType = DAMAGE_TYPES.NORMAL
    } = damageInfo;

    // バリデーション
    if (!this.#isValidDamageAmount(rawDamage)) {
      console.error(`damage-distributor: 無効なダメージ量: ${rawDamage}`);
      return [];
    }

    // 部位を選択
    const targetParts = this.#selectTargetParts(targetMethod, targetPart);

    if (targetParts.length === 0) {
      console.error(`damage-distributor: 有効な部位が選択されませんでした`);
      return [];
    }

    // 各部位へのダメージを計算
    const results = [];

    for (const part of targetParts) {
      const result = this.#calculateDamageForPart({
        part,
        rawDamage,
        weaponType,
        armorLevel,
        damageType
      });

      results.push(result);

      // 手足破壊時の分配処理
      if (this.#config.enableLimbDestruction && this.#shouldDistributeToCore(part)) {
        const distributedResults = this.#distributeToCore(result.finalDamage);
        results.push(...distributedResults);
      }
    }

    return results;
  }

  /**
   * 単一部位へのダメージを計算（簡易版）
   * @param {string} part - 部位
   * @param {number} rawDamage - 生ダメージ
   * @param {Object} options - オプション
   * @returns {Object} ダメージ結果
   */
  calculateDamage(part, rawDamage, options = {}) {
    return this.distributeDamage({
      rawDamage,
      targetMethod: TARGET_METHODS.SPECIFIED,
      targetPart: part,
      ...options
    })[0] || { part, finalDamage: 0 };
  }

  // ==========================================
  // 内部メソッド - 部位選択
  // ==========================================

  /**
   * ターゲット部位を選択
   * @private
   */
  #selectTargetParts(method, specifiedPart) {
    switch (method) {
      case TARGET_METHODS.SPECIFIED:
        if (!this.#isValidPart(specifiedPart)) {
          console.error(`damage-distributor: 無効な部位: ${specifiedPart}`);
          return [];
        }
        return [specifiedPart];

      case TARGET_METHODS.RANDOM:
        return [this.#selectRandomPart()];

      case TARGET_METHODS.ALL:
        return [...ALL_PARTS];

      case TARGET_METHODS.CORE:
        return [...CORE_PARTS];

      case TARGET_METHODS.LIMBS:
        return [...LIMB_PARTS];

      default:
        console.error(`damage-distributor: 無効なターゲット方法: ${method}`);
        return [];
    }
  }

  /**
   * ランダムに部位を選択
   * @private
   */
  #selectRandomPart() {
    const randomIndex = Math.floor(Math.random() * ALL_PARTS.length);
    return ALL_PARTS[randomIndex];
  }

  /**
   * 重み付きランダム選択（将来用）
   * @private
   */
  #selectWeightedRandomPart(weights = {}) {
    // TODO: 実装
    return this.#selectRandomPart();
  }

  // ==========================================
  // 内部メソッド - ダメージ計算
  // ==========================================

  /**
   * 単一部位へのダメージを計算
   * @private
   */
  #calculateDamageForPart(info) {
    const { part, rawDamage, weaponType, armorLevel, damageType } = info;

    let damage = rawDamage;
    let isCritical = false;

    // 1. クリティカル判定
    if (this.#config.enableCritical && this.#shouldCritical()) {
      damage *= this.#config.criticalMultiplier;
      isCritical = true;
    }

    // 2. 武器補正を適用
    damage = this.#applyWeaponModifier(damage, weaponType);

    // 3. 部位倍率を適用
    damage = this.#applyPartMultiplier(damage, part);

    // 4. 防具補正を適用
    damage = this.#applyArmorReduction(damage, armorLevel);

    // 5. ダメージタイプ別の補正（将来用）
    damage = this.#applyDamageTypeModifier(damage, damageType);

    // 6. 整数化
    const finalDamage = Math.max(0, Math.floor(damage));

    return {
      part,
      finalDamage,
      isCritical,
      rawDamage,
      weaponType,
      armorLevel,
      damageType,
      timestamp: Date.now()
    };
  }

  /**
   * クリティカル判定
   * @private
   */
  #shouldCritical() {
    return Math.random() < this.#config.criticalChance;
  }

  /**
   * 武器補正を適用
   * @private
   */
  #applyWeaponModifier(damage, weaponType) {
    if (!weaponType) return damage;

    const modifier = this.#weaponModifiers[weaponType] ?? 1.0;
    return damage * modifier;
  }

  /**
   * 部位倍率を適用
   * @private
   */
  #applyPartMultiplier(damage, part) {
    const multiplier = this.#partMultipliers[part] ?? 1.0;
    return damage * multiplier;
  }

  /**
   * 防具補正を適用
   * @private
   */
  #applyArmorReduction(damage, armorLevel) {
    const reduction = this.#armorReduction[armorLevel] ?? 1.0;
    return damage * reduction;
  }

  /**
   * ダメージタイプ別補正を適用（将来用）
   * @private
   */
  #applyDamageTypeModifier(damage, damageType) {
    // TODO: ダメージタイプ別の補正を実装
    return damage;
  }

  // ==========================================
  // 手足破壊・分配ロジック
  // ==========================================

  /**
   * 手足破壊状態を更新（外部から呼び出し）
   * @param {string} part - 部位
   * @param {boolean} isDestroyed - 破壊されているか
   */
  setLimbDestruction(part, isDestroyed) {
    if (!this.#isLimb(part)) {
      console.warn(`damage-distributor: ${part} は手足ではありません`);
      return;
    }

    const wasDestroyed = this.#destroyedLimbs[part];
    this.#destroyedLimbs[part] = isDestroyed;

    // 状態変化を通知
    if (wasDestroyed !== isDestroyed) {
      this.#notifyEvent({
        type: isDestroyed ? 'limbDestroyed' : 'limbRestored',
        part,
        timestamp: Date.now()
      });
    }
  }

  /**
   * コア部位への分配が必要か判定
   * @private
   */
  #shouldDistributeToCore(part) {
    return this.#isLimb(part) && this.#destroyedLimbs[part];
  }

  /**
   * ダメージをコア部位に分配
   * @private
   */
  #distributeToCore(damage) {
    const ratio = this.#config.distributionRatio;
    const distributedDamage = Math.floor(damage * ratio);

    return CORE_PARTS.map(part => ({
      part,
      finalDamage: distributedDamage,
      isCritical: false,
      isDistributed: true,
      rawDamage: damage,
      timestamp: Date.now()
    }));
  }

  /**
   * 破壊状態をリセット
   */
  resetLimbDestruction() {
    this.#resetDestroyedLimbs();
  }

  /**
   * 破壊状態を取得
   * @returns {Object} 破壊状態のコピー
   */
  getDestructionState() {
    return { ...this.#destroyedLimbs };
  }

  // ==========================================
  // 設定変更
  // ==========================================

  /**
   * 部位倍率を設定
   * @param {string} part - 部位
   * @param {number} multiplier - 倍率
   */
  setPartMultiplier(part, multiplier) {
    if (!this.#isValidPart(part)) {
      console.error(`damage-distributor: 無効な部位: ${part}`);
      return;
    }

    this.#partMultipliers[part] = multiplier;
  }

  /**
   * 防具軽減率を設定
   * @param {number} level - 防具レベル
   * @param {number} reduction - 軽減率（0.0〜1.0）
   */
  setArmorReduction(level, reduction) {
    this.#armorReduction[level] = Math.max(0, Math.min(1, reduction));
  }

  /**
   * 武器補正を設定
   * @param {string} weaponType - 武器種別
   * @param {number} modifier - 補正値
   */
  setWeaponModifier(weaponType, modifier) {
    this.#weaponModifiers[weaponType] = modifier;
  }

  /**
   * クリティカル設定を変更
   * @param {Object} criticalConfig - クリティカル設定
   */
  setCriticalConfig(criticalConfig) {
    if (criticalConfig.chance !== undefined) {
      this.#config.criticalChance = Math.max(0, Math.min(1, criticalConfig.chance));
    }
    if (criticalConfig.multiplier !== undefined) {
      this.#config.criticalMultiplier = criticalConfig.multiplier;
    }
  }

  // ==========================================
  // バリデーション
  // ==========================================

  /**
   * 部位名が有効かチェック
   * @private
   */
  #isValidPart(part) {
    return ALL_PARTS.includes(part);
  }

  /**
   * ダメージ量が有効かチェック
   * @private
   */
  #isValidDamageAmount(amount) {
    return typeof amount === 'number' && !isNaN(amount) && amount >= 0;
  }

  /**
   * 手足かどうか判定
   * @private
   */
  #isLimb(part) {
    return LIMB_PARTS.includes(part);
  }

  /**
   * コア部位かどうか判定
   * @private
   */
  #isCorePart(part) {
    return CORE_PARTS.includes(part);
  }

  // ==========================================
  // イベント通知
  // ==========================================

  /**
   * イベントを通知
   * @private
   */
  #notifyEvent(event) {
    this.#listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('damage-distributor: リスナーエラー:', error);
      }
    });
  }

  /**
   * イベントを購読
   * @param {Function} callback - コールバック関数
   * @returns {Function} 購読解除関数
   */
  onEvent(callback) {
    if (typeof callback !== 'function') {
      console.error('damage-distributor: コールバックは関数である必要があります');
      return () => {};
    }

    this.#listeners.push(callback);
    return () => this.offEvent(callback);
  }

  /**
   * イベント購読を解除
   * @param {Function} callback - 削除するコールバック関数
   */
  offEvent(callback) {
    const index = this.#listeners.indexOf(callback);
    if (index !== -1) {
      this.#listeners.splice(index, 1);
    }
  }

  // ==========================================
  // デバッグ・ユーティリティ
  // ==========================================

  /**
   * 現在の設定を取得
   * @returns {Object} 設定のコピー
   */
  getConfig() {
    return {
      ...this.#config,
      partMultipliers: { ...this.#partMultipliers },
      armorReduction: { ...this.#armorReduction },
      weaponModifiers: { ...this.#weaponModifiers }
    };
  }

  /**
   * デバッグ情報を出力
   */
  debugLog() {
    console.log('=== Damage Distributor 状態 ===');
    console.log('設定:', this.#config);
    console.log('部位倍率:', this.#partMultipliers);
    console.log('防具軽減:', this.#armorReduction);
    console.log('武器補正:', this.#weaponModifiers);
    console.log('破壊状態:', this.#destroyedLimbs);
    console.log('リスナー数:', this.#listeners.length);
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * DamageDistributor インスタンスを初期化して返す
 * 
 * @param {Object} config - 初期設定（オプション）
 * @returns {DamageDistributor} DamageDistributor インスタンス
 */
export function initDamageDistributor(config = {}) {
  return new DamageDistributor(config);
}

/**
 * シングルトンとしてもエクスポート
 */
export const damageDistributor = new DamageDistributor();

// デフォルトエクスポート
export default DamageDistributor;