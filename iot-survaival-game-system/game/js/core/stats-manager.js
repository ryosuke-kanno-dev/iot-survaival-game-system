// ==========================================
// stats-manager.js - 戦績データ管理
// ==========================================
// 責務：
// - 戦績データの保持（キル・命中・被弾・時間）
// - カウント処理
// - 時間計測
// - リセット処理
// - 結果取得メソッドの提供
// - 勝敗結果の記録
//
// 禁止事項：
// - UI操作（DOM操作）
// - ログ出力
// - ゲーム状態管理
// - 外部モジュールへの依存
//
// 設計方針：
// - 純粋なデータ管理クラス
// - プライベートフィールドで保護
// - 将来の拡張を考慮した構造
// ==========================================

class StatsManager {
  // プライベートフィールド（外部から直接アクセス不可）
  #killCount   = 0;
  #hitCount    = 0;
  #damageTaken = 0;
  #startTime   = null;
  #endTime     = null;
  #matchResult = null;  // 'WIN' | 'LOSE' | 'DRAW' | null
  #pausedTotalTime = 0;
  #pauseStartTime = null;
  #initialized = false;

  constructor() {
    this.reset();
    this.#initialized = true;
  }

  // ==========================================
  // 初期化・リセット
  // ==========================================

  /**
   * 全データを初期化
   * PLAYING開始時に呼び出される
   */
  reset() {
    this.#killCount   = 0;
    this.#hitCount    = 0;
    this.#damageTaken = 0;
    this.#startTime   = null;
    this.#endTime     = null;
    this.#matchResult = null;
    this.#pausedTotalTime = 0;
    this.#pauseStartTime = null;
  }

  // ==========================================
  // 時間計測
  // ==========================================

  /**
   * 計測開始
   * game-state が PLAYING に遷移したタイミングで呼ぶ
   */
  start() {
    this.#startTime = Date.now();
    this.#endTime   = null;  // 前回のendTimeをクリア
    this.#pausedTotalTime = 0;
    this.#pauseStartTime = null;
  }

  /**
   * 計測終了
   * DOWN遷移直前（HP=0確定時）に呼ぶ
   */
  end() {
    if (this.#startTime === null) {
      // start() が呼ばれていない場合は何もしない
      return;
    }
    this.#endTime = Date.now();
  }

  // ==========================================
  // PAUSE制御
  // ==========================================

  pause() {
    if (!this.#pauseStartTime && this.#startTime && !this.#endTime) {
      this.#pauseStartTime = Date.now();
    }
  }

  resume() {
    if (this.#pauseStartTime) {
      this.#pausedTotalTime += (Date.now() - this.#pauseStartTime);
      this.#pauseStartTime = null;
    }
  }

  // ==========================================
  // カウント処理
  // ==========================================

  /**
   * キル数を +1
   * 敵HPが0になった箇所で呼ぶ
   */
  addKill() {
    this.#killCount++;
  }

  /**
   * 命中数を +1
   * 命中判定成功箇所で呼ぶ
   */
  addHit() {
    this.#hitCount++;
  }

  /**
   * 被弾数を +1
   * bluetooth-manager.js の被弾通知箇所で呼ぶ
   */
  addDamage() {
    this.#damageTaken++;
  }

  // ==========================================
  // 勝敗結果記録
  // ==========================================

  /**
   * 勝敗結果を記録
   * @param {Object} resultData - 結果データ
   * @param {string} resultData.result - 'WIN' | 'LOSE' | 'DRAW'
   * @param {number} resultData.playerId - 自分のプレイヤーID
   * @param {number|null} resultData.winnerId - 勝者のプレイヤーID
   * @returns {boolean} 記録成功なら true
   */
  recordResult(resultData) {
    if (!resultData || !resultData.result) {
      console.error('[StatsManager] Invalid result data');
      return false;
    }

    const validResults = ['WIN', 'LOSE', 'DRAW'];
    if (!validResults.includes(resultData.result)) {
      console.error('[StatsManager] Invalid result value:', resultData.result);
      return false;
    }

    this.#matchResult = resultData.result;

    console.log('[StatsManager] Match result recorded:', {
      result: this.#matchResult,
      playerId: resultData.playerId,
      winnerId: resultData.winnerId
    });

    return true;
  }

  /**
   * 勝敗結果を取得
   * @returns {string|null} 'WIN' | 'LOSE' | 'DRAW' | null
   */
  getResult() {
    return this.#matchResult;
  }

  // ==========================================
  // データ取得
  // ==========================================

  /**
   * プレイ時間を取得（秒単位）
   * @returns {number} プレイ時間（秒）
   */
  getPlayTime() {
    if (this.#startTime === null) {
      return 0;
    }

    let endPoint = this.#endTime || Date.now();
    if (this.#pauseStartTime) {
      endPoint = this.#pauseStartTime;
    }

    return Math.max(0, Math.floor((endPoint - this.#startTime - this.#pausedTotalTime) / 1000));
  }

  /**
   * プレイ時間を取得（ミリ秒単位）
   * より正確な時間が必要な場合に使用
   * @returns {number} プレイ時間（ミリ秒）
   */
  getPlayTimeMs() {
    if (this.#startTime === null) {
      return 0;
    }

    const endPoint = this.#endTime || Date.now();
    return endPoint - this.#startTime;
  }

  /**
   * 現在の戦績を全て取得
   * ui-down.js や screen-end などで使用
   * @returns {Object} 戦績データ
   */
  getStats() {
    return Object.freeze({
      killCount:   this.#killCount,
      hitCount:    this.#hitCount,
      damageTaken: this.#damageTaken,
      playTime:    this.getPlayTime(),      // 秒単位
      playTimeMs:  this.getPlayTimeMs(),    // ミリ秒単位
      startTime:   this.#startTime,
      endTime:     this.#endTime,
      matchResult: this.#matchResult        // 追加
    });
  }

  /**
   * 個別データ取得（将来の拡張用）
   */
  getKillCount()   { return this.#killCount; }
  getHitCount()    { return this.#hitCount; }
  getDamageTaken() { return this.#damageTaken; }
  getStartTime()   { return this.#startTime; }
  getEndTime()     { return this.#endTime; }

  // ==========================================
  // ステータス情報
  // ==========================================

  /**
   * 計測中かどうか
   * @returns {boolean} 計測中なら true
   */
  isRunning() {
    return this.#startTime !== null && this.#endTime === null;
  }

  /**
   * 計測完了（終了済み）かどうか
   * @returns {boolean} 終了済みなら true
   */
  isFinished() {
    return this.#startTime !== null && this.#endTime !== null;
  }

  /**
   * 初期化済みかどうか
   * @returns {boolean} 初期化済みなら true
   */
  isInitialized() {
    return this.#initialized;
  }

  // ==========================================
  // 将来の拡張用（オプション）
  // ==========================================

  /**
   * スナップショットを作成
   * セーブデータとして保存したい場合などに使用
   * @returns {Object} 現在の状態の完全なコピー
   */
  createSnapshot() {
    return {
      killCount:   this.#killCount,
      hitCount:    this.#hitCount,
      damageTaken: this.#damageTaken,
      startTime:   this.#startTime,
      endTime:     this.#endTime,
      matchResult: this.#matchResult,
      timestamp:   Date.now()
    };
  }

  /**
   * スナップショットから復元
   * セーブデータから読み込む場合などに使用
   * @param {Object} snapshot - createSnapshot() で作成したデータ
   * @returns {boolean} 成功なら true
   */
  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }

    this.#killCount   = snapshot.killCount   ?? 0;
    this.#hitCount    = snapshot.hitCount    ?? 0;
    this.#damageTaken = snapshot.damageTaken ?? 0;
    this.#startTime   = snapshot.startTime   ?? null;
    this.#endTime     = snapshot.endTime     ?? null;
    this.#matchResult = snapshot.matchResult ?? null;

    return true;
  }

  // ==========================================
  // デバッグ用（開発時のみ使用）
  // ==========================================

  /**
   * 現在の状態をコンソールに出力
   * 本番環境では使用しない
   */
  debugLog() {
    console.log('=== StatsManager 状態 ===');
    console.log('キル数:', this.#killCount);
    console.log('命中数:', this.#hitCount);
    console.log('被弾数:', this.#damageTaken);
    console.log('プレイ時間:', this.getPlayTime(), '秒');
    console.log('勝敗結果:', this.#matchResult || 'なし');
    console.log('計測中:', this.isRunning());
    console.log('終了済み:', this.isFinished());
    console.log('開始時刻:', this.#startTime ? new Date(this.#startTime).toLocaleString() : 'なし');
    console.log('終了時刻:', this.#endTime   ? new Date(this.#endTime).toLocaleString()   : 'なし');
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * StatsManager インスタンスを初期化して返す
 * linkon-main.js から呼び出される
 * @returns {StatsManager} StatsManager インスタンス
 */
export function initStatsManager() {
  return new StatsManager();
}

/**
 * シングルトンとしてもエクスポート
 * 他のモジュールから直接参照される場合に使用
 */
export const statsManager = new StatsManager();

// デフォルトエクスポート
export default StatsManager;