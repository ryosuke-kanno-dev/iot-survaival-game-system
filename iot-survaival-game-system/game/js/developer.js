// ==========================================
// developer.js - 開発用デバッグ機能（薄いラッパー）
// ==========================================

import { GAME_STATES } from './core/game-state.js';
import { BODY_PARTS } from './health/health-manager.js';
import { CONNECTION_STATUS } from './bluetooth/bluetooth-manager.js';

// ==========================================
// 開発モード設定
// ==========================================

const IS_DEVELOPMENT = true;

// 開発セクションの表示制御
if (IS_DEVELOPMENT) {
  const devSection = document.getElementById('development');
  if (devSection) {
    devSection.classList.remove('hidden');
  }
}

// ==========================================
// DeveloperMode クラス
// ==========================================

class DeveloperMode {
  constructor(modules) {
    this.modules = modules;
    this.initialized = false;
    this.elements = {};
  }

  /**
   * 初期化
   */
  init() {
    if (this.initialized) {
      console.warn('DeveloperMode: 既に初期化済み');
      return;
    }

    const devSection = document.getElementById('development');
    if (!devSection) {
      console.info('DeveloperMode: 開発セクションが見つかりません');
      return;
    }

    console.log('🛠️ DeveloperMode 初期化開始');

    this.cacheElements();
    this.bindEvents();
    this.updateConnectionUI();

    this.initialized = true;
    console.log('✅ DeveloperMode 初期化完了');
  }

  /**
   * DOM要素をキャッシュ
   */
  cacheElements() {
    this.elements.inputs = {
      damage: document.getElementById('damageInput'),
      heal: document.getElementById('healInput'),
      headHp: document.getElementById('headHpInput'),
      torsoHp: document.getElementById('torsoHpInput'),
      leftarmHp: document.getElementById('leftarmHpInput'),
      rightarmHp: document.getElementById('rightarmHpInput'),
      leftlegHp: document.getElementById('leftlegHpInput'),
      rightlegHp: document.getElementById('rightlegHpInput'),
      bullet: document.getElementById('bulletInput'),
      reserve: document.getElementById('reserveInput'),
      maxBullet: document.getElementById('maxBulletInput'),
      maxReserve: document.getElementById('maxReserveInput')
    };

    this.elements.deviceButtons = document.querySelectorAll('[data-dev-device]');
  }

  /**
   * イベントリスナー登録
   */
  bindEvents() {
    document.addEventListener('click', (e) => {
      this.handleDelegatedClick(e);
    });

    this.bindIndividualEvents();
  }

  /**
   * イベント委譲ハンドラー
   */
  handleDelegatedClick(e) {
    const stateButton = e.target.closest('[data-dev-state]');
    if (stateButton) {
      this.handleStateChange(stateButton.dataset.devState);
      return;
    }

    const deviceButton = e.target.closest('[data-dev-device]');
    if (deviceButton) {
      this.handleDeviceToggle(deviceButton);
      return;
    }

    this.handleButtonById(e.target);
  }

  /**
   * ID指定のボタン処理
   */
  handleButtonById(target) {
    const buttonId = target.id;
    if (!buttonId) return;

    const handlers = {
      'devConnectButton': () => this.callMainHandler('handleConnect'),
      'devReconnectButton': () => this.callMainHandler('handleReconnect'),
      'damageReset': () => this.callMainHandler('handleHealthReset'),
      'DamageButton': () => this.handleDamageAll(),
      'DamageHealButton': () => this.handleHealAll(),
      'partDamage1': () => this.handleDamagePart(BODY_PARTS.HEAD),
      'partDamage2': () => this.handleDamagePart(BODY_PARTS.TORSO),
      'partDamage3': () => this.handleDamagePart(BODY_PARTS.LEFT_ARM),
      'partDamage4': () => this.handleDamagePart(BODY_PARTS.RIGHT_ARM),
      'partDamage5': () => this.handleDamagePart(BODY_PARTS.LEFT_LEG),
      'partDamage6': () => this.handleDamagePart(BODY_PARTS.RIGHT_LEG),
      'partHeal1': () => this.handleHealPart(BODY_PARTS.HEAD),
      'partHeal2': () => this.handleHealPart(BODY_PARTS.TORSO),
      'partHeal3': () => this.handleHealPart(BODY_PARTS.LEFT_ARM),
      'partHeal4': () => this.handleHealPart(BODY_PARTS.RIGHT_ARM),
      'partHeal5': () => this.handleHealPart(BODY_PARTS.LEFT_LEG),
      'partHeal6': () => this.handleHealPart(BODY_PARTS.RIGHT_LEG),
      'updateAmmoButton': () => this.handleAmmoUpdate(),
      'updateMaxAmmoButton': () => this.handleMaxAmmoUpdate(),
      'healthCheck': () => this.handleShoot(),
      'reloadButton': () => this.handleReload(),
      'resetButton': () => this.callMainHandler('handleAmmoReset'),
      'fullReset': () => this.callMainHandler('handleFullReset'),
      'testDownVideo': () => this.handleTestDownVideo(),
      'send-ir': () => this.handleSendIR(),
      'testPopupShoot': () => this.handleTestPopupShoot(),
      'testPopupHit': () => this.handleTestPopupHit()
    };

    const handler = handlers[buttonId];
    if (handler) {
      handler();
    }
  }

  /**
   * 個別イベント
   */
  bindIndividualEvents() {
    const updateHpButton = document.getElementById('updateHpButton');
    if (updateHpButton) {
      updateHpButton.addEventListener('click', () => {
        this.handleHPUpdate();
      });
    }
  }

  // ==========================================
  // 本番ハンドラー呼び出し
  // ==========================================

  callMainHandler(methodName) {
    const app = window.linkONApp;
    if (!app) {
      console.error('DeveloperMode: linkONApp が見つかりません');
      return;
    }

    if (typeof app[methodName] !== 'function') {
      console.error(`DeveloperMode: ${methodName} は関数ではありません`);
      return;
    }

    app[methodName]();
  }

  // ==========================================
  // ハンドラー実装
  // ==========================================

  /**
   * 状態遷移
   */
  handleStateChange(targetState) {
    const { gameState, logger } = this.modules;

    logger.system(`デバッグ: 状態を ${targetState} に変更`);

    switch (targetState) {
      case 'IDLE':
        gameState.forceSetState(GAME_STATES.IDLE, '開発モード遷移');
        break;
      case 'PLAYING':
        gameState.forceSetState(GAME_STATES.PLAYING, '開発モード遷移');
        break;
      case 'END':
        gameState.forceSetState(GAME_STATES.END, '開発モード遷移');
        break;
      default:
        logger.error(`未知の状態: ${targetState}`);
    }
  }

  /**
   * デバイス接続トグル
   */
  handleDeviceToggle(btn) {
    const { bluetoothManager, logger } = this.modules;
    const deviceType = btn.dataset.devDevice;
    const isConnected = btn.dataset.devConnected === 'true';
    const newIsConnected = !isConnected;

    // booleanではなく正式な接続状態へ変換
    const newStatus = newIsConnected
      ? CONNECTION_STATUS.CONNECTED
      : CONNECTION_STATUS.DISCONNECTED;

    // ボタン内部状態更新
    btn.dataset.devConnected = newIsConnected.toString();
    btn.textContent = `${deviceType === 'gun' ? '銃' : '防具'}: ${newIsConnected ? 'ON' : 'OFF'}`;
    btn.classList.toggle('is-connected', newIsConnected);

    // BluetoothManagerへ通知（文字列ステータスを渡す）
    if (typeof bluetoothManager.setDevConnection === 'function') {
      bluetoothManager.setDevConnection(deviceType, newStatus);
      
      // 接続確認UIを更新（複数対応）
      this.updateAllConnectionUI(deviceType, newStatus);
      
      logger.info(`デバッグ: ${deviceType} を ${newStatus} に設定`);
      console.log(`開発用 ${deviceType} 接続状態:`, newStatus);
    } else {
      logger.error('bluetoothManager.setDevConnection() が実装されていません');
    }
  }

  /**
   * 接続確認UIを更新（複数要素に対応）
   */
  updateAllConnectionUI(deviceType, status) {
    // data-device 属性で該当する全ての要素を取得
    const deviceElements = document.querySelectorAll(`[data-device="${deviceType}"]`);
    
    if (deviceElements.length === 0) {
      console.warn(`接続確認UI要素が見つかりません: ${deviceType}`);
      return;
    }

    const isConnected = status === CONNECTION_STATUS.CONNECTED;

    deviceElements.forEach(element => {
      // クラスを更新
      if (isConnected) {
        element.classList.remove('disconnected');
        element.classList.add('connected');
      } else {
        element.classList.remove('connected');
        element.classList.add('disconnected');
      }

      // ステータステキストを更新
      const statusText = element.querySelector('.status-text');
      if (statusText) {
        statusText.textContent = isConnected ? '接続済み' : '未接続';
      }
    });

    console.log(`接続確認UIを更新しました: ${deviceType} (${deviceElements.length}個の要素)`);
  }

  /**
   * 接続状態UI更新（初期化時）
   */
  updateConnectionUI() {
    const { bluetoothManager } = this.modules;
    
    if (typeof bluetoothManager.isConnected !== 'function') {
      console.warn('DeveloperMode: bluetoothManager.isConnected() が実装されていません');
      this.elements.deviceButtons.forEach(btn => {
        const deviceType = btn.dataset.devDevice;
        btn.dataset.devConnected = 'false';
        btn.textContent = `${deviceType === 'gun' ? '銃' : '防具'}: OFF`;
        btn.classList.remove('is-connected');
      });
      return;
    }
    
    // トグルボタンの状態を更新
    this.elements.deviceButtons.forEach(btn => {
      const deviceType = btn.dataset.devDevice;
      const isConnected = bluetoothManager.isConnected(deviceType) ?? false;
      
      btn.dataset.devConnected = isConnected.toString();
      btn.textContent = `${deviceType === 'gun' ? '銃' : '防具'}: ${isConnected ? 'ON' : 'OFF'}`;
      btn.classList.toggle('is-connected', isConnected);
    });

    // 接続確認UIの状態を更新
    ['gun', 'armor'].forEach(deviceType => {
      const isConnected = bluetoothManager.isConnected(deviceType) ?? false;
      const status = isConnected ? CONNECTION_STATUS.CONNECTED : CONNECTION_STATUS.DISCONNECTED;
      this.updateAllConnectionUI(deviceType, status);
    });
  }

  /**
   * 全身ダメージ
   */
  handleDamageAll() {
    const { healthManager, logger } = this.modules;
    const amount = this.getInputValue('damage', 10);

    Object.values(BODY_PARTS).forEach(part => {
      healthManager.applyDamage(part, amount);
    });

    logger.damage(`デバッグ: 全身に ${amount} ダメージ`);
  }

  /**
   * 全身回復
   */
  handleHealAll() {
    const { healthManager, logger } = this.modules;
    const amount = this.getInputValue('heal', 10);

    Object.values(BODY_PARTS).forEach(part => {
      healthManager.heal(part, amount);
    });

    logger.heal(`デバッグ: 全身を ${amount} 回復`);
  }

  /**
   * 部位別ダメージ
   */
  handleDamagePart(part) {
    const { healthManager, damageDistributor, logger } = this.modules;
    const amount = this.getInputValue('damage', 10);

    healthManager.applyDamage(part, amount);

    if (this.isLimb(part)) {
      const currentHP = healthManager.getCurrentHP(part);
      if (currentHP === 0) {
        damageDistributor.setLimbDestruction(part, true);
      }
    }

    logger.damage(`デバッグ: ${part} に ${amount} ダメージ`);
  }

  /**
   * 部位別回復
   */
  handleHealPart(part) {
    const { healthManager, damageDistributor, logger } = this.modules;
    const amount = this.getInputValue('heal', 10);

    healthManager.heal(part, amount);

    if (this.isLimb(part)) {
      const currentHP = healthManager.getCurrentHP(part);
      if (currentHP > 0) {
        damageDistributor.setLimbDestruction(part, false);
      }
    }

    logger.heal(`デバッグ: ${part} を ${amount} 回復`);
  }

  /**
   * HP設定更新
   */
  handleHPUpdate() {
    const { healthManager, logger } = this.modules;

    const hpValues = {
      [BODY_PARTS.HEAD]: this.getInputValue('headHp', 100),
      [BODY_PARTS.TORSO]: this.getInputValue('torsoHp', 100),
      [BODY_PARTS.LEFT_ARM]: this.getInputValue('leftarmHp', 100),
      [BODY_PARTS.RIGHT_ARM]: this.getInputValue('rightarmHp', 100),
      [BODY_PARTS.LEFT_LEG]: this.getInputValue('leftlegHp', 100),
      [BODY_PARTS.RIGHT_LEG]: this.getInputValue('rightlegHp', 100)
    };

    Object.entries(hpValues).forEach(([part, maxHP]) => {
      healthManager.setMaxHP(part, maxHP);
      
      const currentHP = healthManager.getCurrentHP(part);
      const diff = maxHP - currentHP;
      
      if (diff > 0) {
        healthManager.heal(part, diff);
      } else if (diff < 0) {
        healthManager.applyDamage(part, Math.abs(diff));
      }
    });

    logger.success('デバッグ: HP設定を更新しました');
  }

  /**
   * 弾数更新
   */
  handleAmmoUpdate() {
    const { ammoManager, logger } = this.modules;
    if (!ammoManager) {
        logger.error('AmmoManager が見つかりません');
        return;
    }

    const bullet = parseInt(document.getElementById('bulletInput').value, 10);
    const maxBullet = parseInt(document.getElementById('maxBulletInput').value, 10);

    const currentState = ammoManager.getAmmo();

    // ① 最大値を更新（reserveは現在値を維持）
    ammoManager.setMaxAmmo(maxBullet, currentState.maxReserve);

    // ② 現在値を更新（reserveは現在値を維持）
    ammoManager.setAmmo(bullet, currentState.reserve);

    logger.success(`装填弾数 ${bullet}/${maxBullet} に更新`);
  }

  /**
   * 最大弾数更新
   */
  handleMaxAmmoUpdate() {
    const { ammoManager, logger } = this.modules;
    if (!ammoManager) {
        logger.error('AmmoManager が見つかりません');
        return;
    }

    const reserve    = parseInt(document.getElementById('reserveInput').value, 10);
    const maxReserve = parseInt(document.getElementById('maxReserveInput').value, 10);

    if (isNaN(reserve) || isNaN(maxReserve)) {
        logger.error('デバッグ: 無効な入力値です');
        return;
    }

    // ① まず最大値を更新
    ammoManager.setMaxAmmo(ammoManager.getAmmo().maxBullet, maxReserve);

    // ② setMaxAmmo 後に最新状態を再取得
    //    （setMaxAmmo 内で reserve が clamp されている可能性があるため）
    const updatedState = ammoManager.getAmmo();

    // ③ ユーザー入力値を新しい maxReserve でクランプ
    //    validateAmmoConfig は静的定数(AMMO_CONFIG.MAX_RESERVE)で検証するため、
    //    それを超えた値は setAmmo 内で弾かれる。
    //    → updatedState.maxReserve と AMMO_CONFIG.MAX_RESERVE の小さい方に収める
    const clampedReserve = Math.max(0, Math.min(reserve, updatedState.maxReserve));

    // ④ 現在値を更新（bullet は維持）
    const result = ammoManager.setAmmo(updatedState.current, clampedReserve);

    if (!result) {
        logger.error(
        `予備マガジン更新失敗: reserve=${clampedReserve} が検証を通過しませんでした。` +
        `AMMO_CONFIG.MAX_RESERVE の上限を超えていないか確認してください。`
        );
        return;
    }

    logger.success(`予備マガジン ${clampedReserve}/${maxReserve} に更新`);
  }

  /**
   * 射撃
   */
  handleShoot() {
    const { ammoManager, logger } = this.modules;
    if (!ammoManager) {
      logger.error('AmmoManager が見つかりません');
      return;
    }

    if (typeof ammoManager.shoot === 'function') {
      const result = ammoManager.shoot();
      if (result) {
        logger.info('デバッグ: 射撃成功');
      } else {
        logger.warn('デバッグ: 射撃失敗（弾切れ）');
      }
    } else {
      logger.error('AmmoManager.shoot() が実装されていません');
    }
  }

  /**
   * リロード
   */
  handleReload() {
    const { ammoManager, logger } = this.modules;
    if (!ammoManager) {
      logger.error('AmmoManager が見つかりません');
      return;
    }

    if (typeof ammoManager.reload === 'function') {
      const result = ammoManager.reload();
      if (result) {
        logger.info('デバッグ: リロード成功');
      } else {
        logger.warn('デバッグ: リロード失敗（マガジンなし）');
      }
    } else {
      logger.error('AmmoManager.reload() が実装されていません');
    }
  }

  /**
   * ダウン動画テスト
   */
  handleTestDownVideo() {
    const { gameState, logger } = this.modules;
    logger.system('デバッグ: ダウン動画テスト実行');
    gameState.down('デバッグ: 動画テスト');
  }

  /**
   * 赤外線送信テスト
   */
  handleSendIR() {
    const { logger } = this.modules;
    const amount = this.getInputValue('damage', 10);
    logger.info(`デバッグ: ${amount}ダメージの赤外線送信（未実装）`);
  }

  handleTestPopupShoot() {
    import('./ui/ui-test-feedback.js').then(module => {
      module.showTestFeedback("🎯 射撃検知！(Dev)", "shoot");
    });
  }

  handleTestPopupHit() {
    import('./ui/ui-test-feedback.js').then(module => {
      module.showTestFeedback("💥 被弾センサー反応！(Dev)", "hit");
    });
  }

  // ==========================================
  // ヘルパー関数
  // ==========================================

  isLimb(part) {
    const limbs = [
      BODY_PARTS.LEFT_ARM,
      BODY_PARTS.RIGHT_ARM,
      BODY_PARTS.LEFT_LEG,
      BODY_PARTS.RIGHT_LEG
    ];
    return limbs.includes(part);
  }

  getInputValue(inputKey, defaultValue) {
    const input = this.elements.inputs[inputKey];
    if (!input) return defaultValue;

    const value = parseInt(input.value, 10);
    if (isNaN(value)) return defaultValue;

    return Math.max(1, Math.min(100, value));
  }
}

// ==========================================
// エクスポート（シングルトン）
// ==========================================

let devModeInstance = null;

export function initDeveloperMode(modules) {
  if (!IS_DEVELOPMENT) {
    console.info('DeveloperMode: 本番環境のため無効化');
    return null;
  }

  if (devModeInstance) {
    console.warn('DeveloperMode: 既に初期化済み');
    return devModeInstance;
  }

  const required = ['gameState', 'bluetoothManager', 'healthManager', 'damageDistributor', 'ammoManager', 'logger'];
  const missing = required.filter(key => !modules[key]);
  
  if (missing.length > 0) {
    console.error(`DeveloperMode: 必要なモジュールが不足しています: ${missing.join(', ')}`);
    return null;
  }

  devModeInstance = new DeveloperMode(modules);
  devModeInstance.init();

  if (typeof window !== 'undefined') {
    window.devMode = devModeInstance;
  }

  return devModeInstance;
}