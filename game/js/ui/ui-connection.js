// ==========================================
// ui-connection.js - Bluetooth接続状態表示専用UIモジュール
// ==========================================

export const CONNECTION_STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected'
};

const DEVICE_TYPES = {
  GUN: 'gun',
  ARMOR: 'armor'
};

const STATUS_TEXT = {
  [CONNECTION_STATUS.DISCONNECTED]: '未接続',
  [CONNECTION_STATUS.CONNECTING]: '接続中...',
  [CONNECTION_STATUS.CONNECTED]: '接続済'
};

class UIConnection {
  // プライベートフィールド（警告バナー用）
  #warningBanner = null;
  #isWarningShown = false;

  constructor() {
    this.currentStatus = {
      gun: CONNECTION_STATUS.DISCONNECTED,
      armor: CONNECTION_STATUS.DISCONNECTED
    };

    // ==========================================
    // 修正: NodeList（複数要素）として保持する
    // ==========================================
    this.initElements();
  }

  /**
   * DOM要素を初期化・キャッシュ
   * 修正: querySelector → querySelectorAll
   * 画面をまたいで同じ data-device を持つ要素が複数あっても全て対象にする
   */
  initElements() {
    this.elements = {
      gun:   document.querySelectorAll('.device[data-device="gun"]'),
      armor: document.querySelectorAll('.device[data-device="armor"]')
    };

    // 要素数をログ（デバッグ用）
    console.log(`[ui-connection] gun 要素数: ${this.elements.gun.length}`);
    console.log(`[ui-connection] armor 要素数: ${this.elements.armor.length}`);

    // 警告バナー作成
    this.#createWarningBanner();
  }

  /**
   * 警告バナーを作成
   * @private
   */
  #createWarningBanner() {
    // 既に存在する場合は何もしない
    if (document.getElementById('connection-warning-banner')) {
      this.#warningBanner = document.getElementById('connection-warning-banner');
      return;
    }
    
    // 警告バナー要素を作成
    const banner = document.createElement('div');
    banner.id = 'connection-warning-banner';
    banner.className = 'connection-warning-banner hidden';
    banner.innerHTML = `
      <div class="warning-content">
        <span class="warning-icon">⚠️</span>
        <span class="warning-text">接続が不安定です</span>
      </div>
    `;
    
    // body の先頭に追加（全画面で表示されるように）
    document.body.insertBefore(banner, document.body.firstChild);
    
    this.#warningBanner = banner;
    
    console.log('[ui-connection] Warning banner created');
  }

  updateGunStatus(status) {
    this.updateDeviceStatus(DEVICE_TYPES.GUN, status);
  }

  updateArmorStatus(status) {
    this.updateDeviceStatus(DEVICE_TYPES.ARMOR, status);
  }

  /**
   * 指定デバイスの接続状態を更新（共通処理）
   * 修正: 全ての該当要素をループして更新する
   */
  updateDeviceStatus(deviceType, status) {
    if (!Object.values(CONNECTION_STATUS).includes(status)) {
      console.error(`ui-connection: 無効な接続状態: ${status}`);
      return;
    }

    const nodeList = this.elements[deviceType];

    if (!nodeList || nodeList.length === 0) {
      console.warn(`ui-connection: "${deviceType}" の要素が見つかりません`);
      return;
    }

    // 状態保存
    this.currentStatus[deviceType] = status;

    // ==========================================
    // 修正: 全要素に対して更新を適用
    // ==========================================
    nodeList.forEach(deviceEl => {
      // クラスの付け替え
      deviceEl.classList.remove(
        CONNECTION_STATUS.DISCONNECTED,
        CONNECTION_STATUS.CONNECTING,
        CONNECTION_STATUS.CONNECTED,
        'error'
      );
      deviceEl.classList.add(status);

      // テキスト更新
      const textEl = deviceEl.querySelector('.status-text');
      if (textEl) {
        textEl.textContent = STATUS_TEXT[status] ?? '';
      }
    });
  }

  updateAll(gunStatus, armorStatus) {
    this.updateGunStatus(gunStatus);
    this.updateArmorStatus(armorStatus);
  }

  reset() {
    this.updateAll(
      CONNECTION_STATUS.DISCONNECTED,
      CONNECTION_STATUS.DISCONNECTED
    );
  }

  getStatus() {
    return { ...this.currentStatus };
  }

  isBothConnected() {
    return (
      this.currentStatus.gun === CONNECTION_STATUS.CONNECTED &&
      this.currentStatus.armor === CONNECTION_STATUS.CONNECTED
    );
  }

  isConnected(deviceType) {
    return this.currentStatus[deviceType] === CONNECTION_STATUS.CONNECTED;
  }

  // ==========================================
  // 接続警告表示制御（STEP12）
  // ==========================================

  /**
   * 警告を表示
   * @param {string} message - 警告メッセージ
   * @public
   */
  showWarning(message = '接続が不安定です') {
    if (!this.#warningBanner) {
      console.warn('[UIConnection] Warning banner not initialized');
      return;
    }
    
    if (this.#isWarningShown) {
      return;
    }
    
    console.log('[UIConnection] Showing connection warning');
    
    // メッセージ更新
    const textElement = this.#warningBanner.querySelector('.warning-text');
    if (textElement) {
      textElement.textContent = message;
    }
    
    // 表示
    this.#warningBanner.classList.remove('hidden');
    this.#isWarningShown = true;
  }

  /**
   * 警告を非表示
   * @public
   */
  hideWarning() {
    if (!this.#warningBanner) {
      return;
    }
    
    if (!this.#isWarningShown) {
      return;
    }
    
    console.log('[UIConnection] Hiding connection warning');
    
    // 非表示
    this.#warningBanner.classList.add('hidden');
    this.#isWarningShown = false;
  }

  showConnectingAnimation(deviceType) {}
  toggleReconnectButton(show) {}
}

export function initUIConnection() {
  return new UIConnection();
}

export const uiConnection = new UIConnection();