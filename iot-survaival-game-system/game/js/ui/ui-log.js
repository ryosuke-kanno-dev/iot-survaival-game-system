// ==========================================
// ui-log.js - ログ表示専用UIモジュール（複数画面対応版）
// ==========================================
// 責務：
// - ゲーム内ログの一元管理・表示
// - 複数画面のログエリアに対応
// - 指定された画面のログエリアへ出力
// - ログレベル・フィルタリング管理
// - ログのエクスポート・統計機能
// 
// 禁止事項：
// - ログメッセージの生成ロジック
// - ゲームロジックの実行
// - ID属性への依存
// - 画面の表示/非表示制御（これは外部の責務）
// 
// 設計思想：
// 「複数のログエリアを管理し、指定された画面にログ出力」
// 画面切り替えは外部で管理、ui-log.js は出力のみに専念
// ==========================================

// ログタイプの定義
export const LOG_TYPES = {
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SUCCESS: 'success',
  DAMAGE: 'damage',
  HEAL: 'heal',
  SYSTEM: 'system',
  DEBUG: 'debug'
};

// ログレベル（数値が大きいほど重要度が高い）
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// タイプとレベルのマッピング
const TYPE_TO_LEVEL = {
  [LOG_TYPES.DEBUG]: LOG_LEVELS.DEBUG,
  [LOG_TYPES.INFO]: LOG_LEVELS.INFO,
  [LOG_TYPES.SUCCESS]: LOG_LEVELS.INFO,
  [LOG_TYPES.DAMAGE]: LOG_LEVELS.INFO,
  [LOG_TYPES.HEAL]: LOG_LEVELS.INFO,
  [LOG_TYPES.SYSTEM]: LOG_LEVELS.INFO,
  [LOG_TYPES.WARN]: LOG_LEVELS.WARN,
  [LOG_TYPES.ERROR]: LOG_LEVELS.ERROR
};

// ログタイプに対応するアイコン（絵文字）
const LOG_ICONS = {
  [LOG_TYPES.INFO]: '📘',
  [LOG_TYPES.WARN]: '⚠️',
  [LOG_TYPES.ERROR]: '❌',
  [LOG_TYPES.SUCCESS]: '✅',
  [LOG_TYPES.DAMAGE]: '💥',
  [LOG_TYPES.HEAL]: '💊',
  [LOG_TYPES.SYSTEM]: '⚙️',
  [LOG_TYPES.DEBUG]: '🔧'
};

class UILog {
  /**
   * コンストラクタ
   * @param {Object} options - 初期化オプション
   */
  constructor(options = {}) {
    // DOM要素（複数画面対応）
    this.logSections = new Map(); // Map<screenName, logAreaElement>

    // 現在アクティブな画面（外部から設定される）
    this.currentScreen = null;

    // 設定
    this.maxLogs = options.maxLogs || 100;
    this.showTimestamp = options.showTimestamp ?? false;
    this.showIcons = options.showIcons ?? true;
    this.debugMode = options.debugMode ?? false;
    this.logLevel = options.logLevel ?? LOG_LEVELS.DEBUG;
    this.enableConsole = options.enableConsole ?? false;
    this.enableStorage = options.enableStorage ?? false;

    // 内部状態
    this.initialized = false;
    this.logHistory = [];
    this.activeFilters = new Set();
    this.statistics = this.resetStatistics();
  }

  /**
   * 初期化処理
   * DOMContentLoaded後に呼び出すこと
   */
  init() {
    if (this.initialized) {
      console.warn('ui-log: 既に初期化済みです');
      return;
    }

    // DOM要素を取得
    this.initElements();

    // イベントをバインド
    this.bindEvents();

    // localStorage から過去ログを復元（オプション）
    if (this.enableStorage) {
      this.restoreFromStorage();
    }

    this.initialized = true;
    this.info('ログシステム初期化完了');
  }

  /**
   * DOM要素を初期化（複数画面対応）
   */
  initElements() {
    // data-log-screen 属性を持つ全てのセクションを取得
    const logSections = document.querySelectorAll('[data-log-screen]');

    if (logSections.length === 0) {
      console.warn('ui-log: data-log-screen を持つ要素が見つかりません');
      return;
    }

    // 各セクションごとにログエリアを登録
    logSections.forEach(section => {
      const screenName = section.dataset.logScreen;
      const logArea = section.querySelector('[data-log-area]');

      if (logArea) {
        this.logSections.set(screenName, {
          section: section,
          logArea: logArea,
          textbox: section.querySelector('[data-log-textbox]'),
          sendButton: section.querySelector('[data-log-send]')
        });

        console.log(`ui-log: ${screenName} 画面のログエリアを登録しました`);
      } else {
        console.warn(`ui-log: ${screenName} 画面に data-log-area が見つかりません`);
      }
    });

    // デフォルトで最初の画面をアクティブに設定
    if (this.logSections.size > 0 && !this.currentScreen) {
      this.currentScreen = this.logSections.keys().next().value;
      console.log(`ui-log: デフォルト画面を ${this.currentScreen} に設定`);
    }
  }

  /**
   * イベントをバインド
   */
  bindEvents() {
    // 各画面の送信ボタンにイベントリスナーを登録
    this.logSections.forEach((elements, screenName) => {
      const { sendButton, textbox } = elements;

      if (sendButton && textbox) {
        sendButton.addEventListener('click', () => {
          this.handleSend(screenName, textbox);
        });

        // Enter キーでも送信
        textbox.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSend(screenName, textbox);
          }
        });
      }
    });
  }

  /**
   * 送信処理
   * @param {string} screenName - 画面名
   * @param {HTMLElement} textbox - テキストボックス要素
   */
  handleSend(screenName, textbox) {
    const message = textbox.value.trim();

    if (message === '') {
      return;
    }

    // ログに追加（該当する画面にのみ出力）
    this.addToScreen(screenName, `[送信] ${message}`, LOG_TYPES.INFO);

    // テキストボックスをクリア
    textbox.value = '';
  }

  /**
   * 現在アクティブな画面を設定（外部から呼び出される）
   * @param {string} screenName - 画面名
   */
  setCurrentScreen(screenName) {
    if (!this.logSections.has(screenName)) {
      console.warn(`ui-log: 画面 '${screenName}' は登録されていません`);
      return;
    }

    this.currentScreen = screenName;
    console.log(`ui-log: 現在の画面を ${screenName} に設定しました`);
  }

  /**
   * 現在アクティブな画面を取得
   * @returns {string|null} 現在の画面名
   */
  getCurrentScreen() {
    return this.currentScreen;
  }

  /**
   * 指定された画面のログエリアを取得
   * @param {string} screenName - 画面名（省略時は現在アクティブな画面）
   * @returns {HTMLElement|null} ログエリア要素
   */
  getLogArea(screenName = null) {
    const targetScreen = screenName || this.currentScreen;

    if (!targetScreen) {
      console.warn('ui-log: アクティブな画面が設定されていません');
      return null;
    }

    const elements = this.logSections.get(targetScreen);
    return elements ? elements.logArea : null;
  }

  // ==========================================
  // ログ追加API
  // ==========================================

  /**
   * ログを追加（現在アクティブな画面にのみ出力）
   * @param {string} message - ログメッセージ
   * @param {string} type - ログタイプ（LOG_TYPES のいずれか）
   */
  add(message, type = LOG_TYPES.INFO) {
    const currentScreen = this.getCurrentScreen();
    
    if (!currentScreen) {
      console.warn('ui-log: 現在アクティブな画面が設定されていません');
      // console にだけ出力
      if (this.enableConsole) {
        const consoleMethod = this.getConsoleMethod(type);
        consoleMethod(`[${type.toUpperCase()}] ${message}`);
      }
      return;
    }

    this.addToScreen(currentScreen, message, type);
  }

  /**
   * 指定された画面のログエリアにログを追加
   * @param {string} screenName - 画面名
   * @param {string} message - ログメッセージ
   * @param {string} type - ログタイプ
   */
  addToScreen(screenName, message, type = LOG_TYPES.INFO) {
    // ログタイプの妥当性チェック
    if (!Object.values(LOG_TYPES).includes(type)) {
      console.warn(`ui-log: 無効なログタイプ: ${type}`);
      type = LOG_TYPES.INFO;
    }

    // ログレベルフィルタリング
    const level = TYPE_TO_LEVEL[type];
    if (level < this.logLevel) {
      return;
    }

    // ログデータを作成
    const logData = {
      message,
      type,
      level,
      screen: screenName,
      timestamp: Date.now(),
      timestampStr: this.getTimestamp()
    };

    // 履歴に追加
    this.logHistory.push(logData);

    // 統計を更新
    this.updateStatistics(type);

    // 指定された画面のログエリアに表示
    const logArea = this.getLogArea(screenName);

    if (logArea && this.shouldDisplay(type)) {
      const logEntry = this.createLogEntry(logData);
      logArea.appendChild(logEntry);

      // 自動スクロール
      this.scrollToBottom(logArea);

      // 古いログを削除
      this.trimLogs(logArea);
    }

    // console.log にも出力（オプション）
    if (this.enableConsole) {
      const consoleMethod = this.getConsoleMethod(type);
      consoleMethod(`[${screenName}] [${type.toUpperCase()}] ${message}`);
    }

    // localStorage に保存（オプション）
    if (this.enableStorage) {
      this.saveToStorage();
    }
  }

  /**
   * 全ての画面のログエリアにログを追加
   * @param {string} message - ログメッセージ
   * @param {string} type - ログタイプ
   */
  addToAll(message, type = LOG_TYPES.INFO) {
    this.logSections.forEach((elements, screenName) => {
      this.addToScreen(screenName, message, type);
    });
  }

  /**
   * ログエントリー要素を作成
   * @param {Object} logData - ログデータ
   * @returns {HTMLElement} ログ要素
   */
  createLogEntry(logData) {
    const { message, type, timestampStr } = logData;

    const logEntry = document.createElement('div');
    logEntry.classList.add('log-entry', `log-${type}`);
    logEntry.setAttribute('data-log-type', type);
    logEntry.setAttribute('data-timestamp', logData.timestamp);

    // ログの内容を構築
    let logContent = '';

    // アイコンを追加
    if (this.showIcons && LOG_ICONS[type]) {
      logContent += `${LOG_ICONS[type]} `;
    }

    // タイムスタンプを追加
    if (this.showTimestamp) {
      logContent += `[${timestampStr}] `;
    }

    // メッセージを追加
    logContent += message;

    logEntry.textContent = logContent;

    return logEntry;
  }

  /**
   * 現在時刻を取得（HH:MM:SS形式）
   * @returns {string} タイムスタンプ
   */
  getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * ログを表示すべきか判定（フィルター考慮）
   * @param {string} type - ログタイプ
   * @returns {boolean} 表示すべきなら true
   */
  shouldDisplay(type) {
    if (this.activeFilters.size === 0) {
      return true;
    }
    return this.activeFilters.has(type);
  }

  /**
   * console のメソッドを取得
   * @param {string} type - ログタイプ
   * @returns {Function} console のメソッド
   */
  getConsoleMethod(type) {
    switch (type) {
      case LOG_TYPES.ERROR:
        return console.error;
      case LOG_TYPES.WARN:
        return console.warn;
      case LOG_TYPES.DEBUG:
        return console.debug;
      default:
        return console.log;
    }
  }

  // ==========================================
  // ログ管理
  // ==========================================

  /**
   * ログエリアを最下部までスクロール
   * @param {HTMLElement} logArea - ログエリア要素
   */
  scrollToBottom(logArea) {
    if (!logArea) return;
    logArea.scrollTop = logArea.scrollHeight;
  }

  /**
   * 古いログを削除（最大保持数を超えた場合）
   * @param {HTMLElement} logArea - ログエリア要素
   */
  trimLogs(logArea) {
    if (!logArea) return;

    const logs = logArea.querySelectorAll('.log-entry');

    if (logs.length > this.maxLogs) {
      const removeCount = logs.length - this.maxLogs;

      for (let i = 0; i < removeCount; i++) {
        logs[i].remove();
      }
    }

    // 履歴も制限
    if (this.logHistory.length > this.maxLogs * 2) {
      this.logHistory = this.logHistory.slice(-this.maxLogs * 2);
    }
  }

  /**
   * 指定画面のログをクリア
   * @param {string} screenName - 画面名（省略時は現在アクティブな画面）
   */
  clear(screenName = null) {
    const logArea = this.getLogArea(screenName);

    if (logArea) {
      logArea.innerHTML = '';
    }

    // 指定画面のログのみ履歴から削除
    if (screenName) {
      this.logHistory = this.logHistory.filter(log => log.screen !== screenName);
    } else {
      this.logHistory = [];
    }

    this.statistics = this.resetStatistics();
  }

  /**
   * 全画面のログをクリア
   */
  clearAll() {
    this.logSections.forEach((elements) => {
      elements.logArea.innerHTML = '';
    });

    this.logHistory = [];
    this.statistics = this.resetStatistics();
  }

  // ==========================================
  // フィルタリング
  // ==========================================

  /**
   * フィルターを切り替え
   * @param {string} type - ログタイプ
   */
  toggleFilter(type) {
    if (this.activeFilters.has(type)) {
      this.activeFilters.delete(type);
    } else {
      this.activeFilters.add(type);
    }

    this.applyFilters();
  }

  /**
   * フィルターを適用（全画面）
   */
  applyFilters() {
    this.logSections.forEach((elements) => {
      const logs = elements.logArea.querySelectorAll('.log-entry');

      logs.forEach(log => {
        const logType = log.getAttribute('data-log-type');

        if (this.shouldDisplay(logType)) {
          log.style.display = '';
        } else {
          log.style.display = 'none';
        }
      });
    });
  }

  /**
   * フィルターをリセット
   */
  resetFilters() {
    this.activeFilters.clear();
    this.applyFilters();
  }

  // ==========================================
  // 統計
  // ==========================================

  /**
   * 統計をリセット
   * @returns {Object} 統計オブジェクト
   */
  resetStatistics() {
    return {
      total: 0,
      info: 0,
      warn: 0,
      error: 0,
      success: 0,
      damage: 0,
      heal: 0,
      system: 0,
      debug: 0
    };
  }

  /**
   * 統計を更新
   * @param {string} type - ログタイプ
   */
  updateStatistics(type) {
    this.statistics.total++;
    if (this.statistics[type] !== undefined) {
      this.statistics[type]++;
    }
  }

  /**
   * 統計を取得
   * @returns {Object} 統計オブジェクト
   */
  getStatistics() {
    return { ...this.statistics };
  }

  // ==========================================
  // エクスポート
  // ==========================================

  /**
   * ログをテキストとしてエクスポート
   * @returns {string} ログテキスト
   */
  exportAsText() {
    return this.logHistory
      .map(log => {
        let line = '';

        if (this.showTimestamp) {
          line += `[${log.timestampStr}] `;
        }

        line += `[${log.type.toUpperCase()}] `;

        if (log.screen) {
          line += `[${log.screen}] `;
        }

        line += log.message;

        return line;
      })
      .join('\n');
  }

  /**
   * ログをJSONとしてエクスポート
   * @returns {string} JSON文字列
   */
  exportAsJSON() {
    return JSON.stringify(this.logHistory, null, 2);
  }

  /**
   * ログをファイルとしてダウンロード
   * @param {string} format - 'text' または 'json'
   */
  download(format = 'text') {
    const content = format === 'json' 
      ? this.exportAsJSON()
      : this.exportAsText();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `game-log-${Date.now()}.${format === 'json' ? 'json' : 'txt'}`;
    a.click();

    URL.revokeObjectURL(url);

    this.success('ログをダウンロードしました');
  }

  // ==========================================
  // ストレージ（永続化）
  // ==========================================

  /**
   * localStorage に保存
   */
  saveToStorage() {
    try {
      const data = {
        logs: this.logHistory.slice(-this.maxLogs),
        statistics: this.statistics,
        timestamp: Date.now()
      };

      localStorage.setItem('game-logs', JSON.stringify(data));
    } catch (error) {
      console.error('ui-log: ストレージ保存エラー:', error);
    }
  }

  /**
   * localStorage から復元
   */
  restoreFromStorage() {
    try {
      const data = JSON.parse(localStorage.getItem('game-logs'));

      if (data && Array.isArray(data.logs)) {
        this.logHistory = data.logs;
        this.statistics = data.statistics || this.resetStatistics();

        // UI に再表示（各画面ごと）
        data.logs.forEach(logData => {
          const logArea = this.getLogArea(logData.screen);

          if (logArea) {
            const logEntry = this.createLogEntry(logData);
            logArea.appendChild(logEntry);
          }
        });

        // 全ログエリアをスクロール
        this.logSections.forEach((elements) => {
          this.scrollToBottom(elements.logArea);
        });
      }
    } catch (error) {
      console.error('ui-log: ストレージ復元エラー:', error);
    }
  }

  /**
   * localStorage をクリア
   */
  clearStorage() {
    localStorage.removeItem('game-logs');
  }

  // ==========================================
  // 設定変更
  // ==========================================

  /**
   * ログ設定を更新
   * @param {Object} options - 設定オプション
   */
  updateOptions(options = {}) {
    if (options.maxLogs !== undefined) {
      this.maxLogs = options.maxLogs;
    }
    if (options.showTimestamp !== undefined) {
      this.showTimestamp = options.showTimestamp;
    }
    if (options.showIcons !== undefined) {
      this.showIcons = options.showIcons;
    }
    if (options.debugMode !== undefined) {
      this.debugMode = options.debugMode;
    }
    if (options.logLevel !== undefined) {
      this.logLevel = options.logLevel;
    }
    if (options.enableConsole !== undefined) {
      this.enableConsole = options.enableConsole;
    }
    if (options.enableStorage !== undefined) {
      this.enableStorage = options.enableStorage;
    }
  }

  // ==========================================
  // 便利メソッド（タイプ別ショートカット）
  // ==========================================

  info(message) {
    this.add(message, LOG_TYPES.INFO);
  }

  warn(message) {
    this.add(message, LOG_TYPES.WARN);
  }

  error(message) {
    this.add(message, LOG_TYPES.ERROR);
  }

  success(message) {
    this.add(message, LOG_TYPES.SUCCESS);
  }

  damage(message) {
    this.add(message, LOG_TYPES.DAMAGE);
  }

  heal(message) {
    this.add(message, LOG_TYPES.HEAL);
  }

  system(message) {
    this.add(message, LOG_TYPES.SYSTEM);
  }

  debug(message) {
    this.add(message, LOG_TYPES.DEBUG);
  }

  // ==========================================
  // デバッグ用メソッド
  // ==========================================

  /**
   * 現在の状態をコンソールに出力
   */
  debugLog() {
    console.log('=== UI Log 状態 ===');
    console.log('初期化済み:', this.initialized);
    console.log('登録画面数:', this.logSections.size);
    console.log('登録画面:', Array.from(this.logSections.keys()));
    console.log('現在アクティブな画面:', this.getCurrentScreen());
    console.log('ログ数:', this.logHistory.length);
    console.log('統計:', this.getStatistics());
    console.log('アクティブフィルター:', Array.from(this.activeFilters));
    console.log('設定:', {
      maxLogs: this.maxLogs,
      showTimestamp: this.showTimestamp,
      showIcons: this.showIcons,
      debugMode: this.debugMode,
      logLevel: this.logLevel
    });
  }
}

/**
 * UILog インスタンスを初期化して返す
 * linkon-main.js から呼び出される
 * 
 * @param {Object} options - 初期化オプション
 * @returns {UILog} UILog インスタンス
 */
export function initUILog(options = {}) {
  const log = new UILog(options);
  log.init();
  return log;
}

/**
 * シングルトンとしてエクスポート
 * 他のモジュールから直接参照される場合に使用
 * 
 * 使用例:
 * import { logger } from './ui/ui-log.js';
 * logger.setCurrentScreen('game');
 * logger.info('ログメッセージ');
 */
export const logger = new UILog({
  maxLogs: 100,
  showTimestamp: false,
  showIcons: true,
  debugMode: false,
  logLevel: LOG_LEVELS.INFO,
  enableConsole: false,
  enableStorage: false
});

// 自動初期化（DOMContentLoaded を待たずに使用可能にする）
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => logger.init());
  } else {
    logger.init();
  }
}