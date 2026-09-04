// ==========================================
// ui-ammo.js - 弾数表示専用UIモジュール
// ==========================================
// 責務：
// - マガジン内残弾の表示更新
// - マガジン数の表示更新
// - 弾数情報の視覚的表現
//
// 禁止事項：
// - 弾数の計算・減算・リロード処理
// - ammo-manager の状態変更
// - game-state の直接操作
// ==========================================

class UIAmmo {
  constructor(ammoManager) {
    console.log('UIAmmo root:', this.root);
    this.ammoManager = ammoManager;
    this.root = document.querySelector('[data-role="game-ammo"]');
    this.elements = {};

    // game画面にUIが存在しない場合は何もしない
    if (!this.root) {
      console.info('ui-ammo: game-ammo 要素が見つかりません（オプション）');
      return;
    }

    this.initElements();
    this.bindEvents();

    // 初期描画
    this.render();
  }

  /**
   * DOM要素を初期化・キャッシュ
   */
  initElements() {
    this.elements.display = {
      bulletCount: this.root.querySelector('[data-ammo="current"]'),
      reserveCount: this.root.querySelector('[data-ammo="reserve"]')
    };

    // 開発用入力欄（存在する場合のみ使用）
    this.elements.inputs = {
      bullet: document.getElementById('bulletInput'),
      reserve: document.getElementById('reserveInput'),
      maxBullet: document.getElementById('maxBulletInput'),
      maxReserve: document.getElementById('maxReserveInput')
    };

    // 開発用ボタン
    this.elements.buttons = {
      updateAmmo: document.getElementById('updateAmmoButton'),
      updateMaxAmmo: document.getElementById('updateMaxAmmoButton')
    };
  }

  /**
   * ammoManager の変更イベントを購読
   */
  bindEvents() {
    if (!this.root) return;

    this.ammoManager.onChange(() => {
      this.render();
    });

    // 開発用: 弾数更新ボタン
    if (this.elements.buttons.updateAmmo) {
      this.elements.buttons.updateAmmo.addEventListener('click', () => {
        this.handleAmmoUpdate();
      });
    }

    // 開発用: 最大弾数更新ボタン
    if (this.elements.buttons.updateMaxAmmo) {
      this.elements.buttons.updateMaxAmmo.addEventListener('click', () => {
        this.handleMaxAmmoUpdate();
      });
    }
  }

  /**
   * 弾数表示を描画（メイン描画メソッド）
   */
  render() {
    if (!this.root) return;

    const ammo = this.ammoManager.getAmmo();
    
    if (!ammo) {
      console.warn('ui-ammo: getAmmo() returned null or undefined');
      return;
    }

    // 型安全な値の取得（オブジェクトが直接渡されるバグを防ぐ）
    const current = typeof ammo.current === 'number' ? ammo.current : 0;
    const maxBullet = typeof ammo.maxBullet === 'number' ? ammo.maxBullet : 0;
    const reserve = typeof ammo.reserve === 'number' ? ammo.reserve : 0;
    const maxReserve = typeof ammo.maxReserve === 'number' ? ammo.maxReserve : 0;

    this.updateBulletCount(current, maxBullet);
    this.updateReserveCount(reserve, maxReserve);
  }

  /**
   * マガジン内残弾の表示を更新
   */
  updateBulletCount(current, max) {
    const element = this.elements.display.bulletCount;
    if (!element) return;

    element.textContent = `${current} / ${max}`;

    element.classList.remove('is-low', 'is-empty');

    if (current === 0) {
      element.classList.add('is-empty');
    } else if (current <= max * 0.3) {
      element.classList.add('is-low');
    }
  }

  /**
   * マガジン数の表示を更新
   */
  updateReserveCount(current, max) {
    const element = this.elements.display.reserveCount;
    if (!element) return;

    element.textContent = `${current} / ${max}`;

    element.classList.remove('is-empty');

    if (current === 0) {
      element.classList.add('is-empty');
    }
  }

  /**
   * UI表示をリセット
   */
  reset() {
    this.render();
  }

  // ==========================================
  // 開発用メソッド
  // ==========================================

  handleAmmoUpdate() {
    const bulletInput = this.elements.inputs.bullet;
    const reserveInput = this.elements.inputs.reserve;

    if (!bulletInput || !reserveInput) {
      console.warn('ui-ammo: 弾数入力欄が見つかりません');
      return;
    }

    const bulletCount = parseInt(bulletInput.value, 10);
    const reserveCount = parseInt(reserveInput.value, 10);

    if (isNaN(bulletCount) || isNaN(reserveCount)) {
      console.error('ui-ammo: 無効な入力値です');
      return;
    }

    if (bulletCount < 0 || reserveCount < 0) {
      console.error('ui-ammo: 弾数は0以上である必要があります');
      return;
    }

    this.ammoManager.setAmmo(bulletCount, reserveCount);
  }

  handleMaxAmmoUpdate() {
    const maxBulletInput = this.elements.inputs.maxBullet;
    const maxReserveInput = this.elements.inputs.maxReserve;

    if (!maxBulletInput || !maxReserveInput) {
      console.warn('ui-ammo: 最大弾数入力欄が見つかりません');
      return;
    }

    const maxBullet = parseInt(maxBulletInput.value, 10);
    const maxReserve = parseInt(maxReserveInput.value, 10);

    if (isNaN(maxBullet) || isNaN(maxReserve)) {
      console.error('ui-ammo: 無効な入力値です');
      return;
    }

    if (maxBullet < 1 || maxReserve < 1) {
      console.error('ui-ammo: 最大弾数は1以上である必要があります');
      return;
    }

    this.ammoManager.setMaxAmmo(maxBullet, maxReserve);
  }

  // ==========================================
  // 将来的な拡張用メソッド
  // ==========================================

  showAmmoWarning() {
    // 実装予定
  }

  showReloadAnimation() {
    // 実装予定
  }
}

/**
 * UIAmmo インスタンスを初期化
 */
export function initUIAmmo(ammoManager) {
  if (!ammoManager) {
    console.error('ui-ammo: ammoManager が渡されていません');
    return null;
  }

  return new UIAmmo(ammoManager);
}