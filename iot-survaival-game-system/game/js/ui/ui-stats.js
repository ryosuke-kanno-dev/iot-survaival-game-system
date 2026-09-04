// ==========================================
// ui-stats.js - PLAYING中の戦績リアルタイム表示
// ==========================================

class UIStats {
  #statsManager  = null;
  #roots         = [];     // ← 変更: 複数の親要素を保持
  #statsElements = [];     // ← 変更: 複数セットのDOM要素を保持
  #updateTimer   = null;
  #initialized   = false;
  #remainingTime = null;   // 残り時間（秒）

  /**
   * コンストラクタ
   * @param {Object} statsManager - StatsManager インスタンス
   * @param {string|HTMLElement|null} parentSelector - 親要素のセレクタまたは要素（省略時は全体から検索）
   */
  constructor(statsManager, parentSelector = null) {
    if (!statsManager) {
      console.error('ui-stats: statsManager が必要です');
      return;
    }

    this.#statsManager = statsManager;

    if (!this.#initElements(parentSelector)) {
      console.error('ui-stats: DOM要素の初期化に失敗しました');
      return;
    }

    this.#initialized = true;
    console.log('ui-stats: 初期化完了（管理対象: ' + this.#roots.length + '箇所）');
  }

  // ==========================================
  // 初期化
  // ==========================================

  /**
   * DOM要素を取得
   * 親要素スコープ内で .playing-stats を全て取得
   * @private
   * @param {string|HTMLElement|null} parentSelector - 親要素
   * @returns {boolean} 成功なら true
   */
  #initElements(parentSelector) {
    let searchScope;

    // 親要素を決定
    if (typeof parentSelector === 'string') {
      // セレクタ文字列が渡された場合
      searchScope = document.querySelector(parentSelector);
      if (!searchScope) {
        console.error('ui-stats: 親要素が見つかりません:', parentSelector);
        return false;
      }
    } else if (parentSelector instanceof HTMLElement) {
      // DOM要素が直接渡された場合
      searchScope = parentSelector;
    } else {
      // 省略された場合はdocument全体から検索
      searchScope = document;
    }

    // .playing-stats を全て取得
    const playingStatsElements = searchScope.querySelectorAll('.playing-stats');

    if (playingStatsElements.length === 0) {
      console.error('ui-stats: .playing-stats が見つかりません');
      return false;
    }

    // 各 .playing-stats に対して子要素を取得
    playingStatsElements.forEach(root => {
      const elements = {
        kills:  root.querySelector('[data-stat="kills"]'),
        hits:   root.querySelector('[data-stat="hits"]'),
        damage: root.querySelector('[data-stat="damage"]'),
        time:   root.querySelector('[data-stat="time"]')
      };

      // 必須要素のチェック
      if (!elements.kills || !elements.hits || !elements.damage || !elements.time) {
        console.warn('ui-stats: 一部のDOM要素が見つかりません（この .playing-stats はスキップ）', root);
        return; // この要素はスキップ
      }

      this.#roots.push(root);
      this.#statsElements.push(elements);
    });

    if (this.#roots.length === 0) {
      console.error('ui-stats: 有効な .playing-stats が1つも見つかりませんでした');
      return false;
    }

    return true;
  }

  // ==========================================
  // リアルタイム更新制御
  // ==========================================

  start() {
    if (!this.#initialized) {
      console.warn('ui-stats: 初期化されていません');
      return;
    }

    if (this.#updateTimer) {
      this.stop();
    }

    console.log('ui-stats: リアルタイム更新開始');
    this.update(false); // 初回はカウントダウンさせない
    this.#updateTimer = setInterval(() => this.update(true), 1000);
  }

  stop() {
    if (this.#updateTimer) {
      clearInterval(this.#updateTimer);
      this.#updateTimer = null;
      console.log('ui-stats: リアルタイム更新停止');
    }
  }

  // ==========================================
  // DOM更新
  // ==========================================

  /**
   * 外部（ServerSync等）から正確な残り時間をセットする
   */
  setRemainingTime(seconds) {
    this.#remainingTime = seconds;
    this.update(false);
  }

  getRemainingTime() {
    return this.#remainingTime;
  }

  /**
   * 戦績データを取得して全てのDOMを更新
   * @public
   */
  update(tick = false) {
    if (!this.#initialized) return;

    const stats = this.#statsManager.getStats();

    // tick が true で、remainingTime がセットされていれば1秒減らす
    if (tick && this.#remainingTime !== null && this.#remainingTime > 0) {
      this.#remainingTime--;
    }

    if (!stats) {
      console.warn('ui-stats: 戦績データが取得できません');
      return;
    }

    // 全ての .playing-stats を更新
    this.#statsElements.forEach(elements => {
      if (elements.kills)  elements.kills.textContent  = stats.killCount;
      if (elements.hits)   elements.hits.textContent   = stats.hitCount;
      if (elements.damage) elements.damage.textContent = stats.damageTaken;
      if (elements.time)   {
          // remainingTime が未設定なら 0:00 を表示
          const displaySec = this.#remainingTime !== null ? Math.max(0, this.#remainingTime) : 0;
          elements.time.textContent = this.#formatTime(displaySec);
      }
    });
  }

  // ==========================================
  // ヘルパー
  // ==========================================

  #formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // ==========================================
  // ステータス取得
  // ==========================================

  isInitialized() { return this.#initialized; }
  isRunning()     { return this.#updateTimer !== null; }
  getStatsCount() { return this.#roots.length; }

  debugLog() {
    console.log('=== UIStats 状態 ===');
    console.log('初期化済み:', this.#initialized);
    console.log('更新中:', this.isRunning());
    console.log('管理対象数:', this.getStatsCount());
    console.log('現在の戦績:', this.#statsManager?.getStats());
  }
}

// ==========================================
// エクスポート
// ==========================================

/**
 * UIStats インスタンスを初期化して返す
 * @param {Object} statsManager - StatsManager インスタンス
 * @param {string|HTMLElement|null} parentSelector - 親要素（省略時は全体検索）
 * @returns {UIStats} UIStats インスタンス
 */
export function initUIStats(statsManager, parentSelector = null) {
  return new UIStats(statsManager, parentSelector);
}

export default UIStats;