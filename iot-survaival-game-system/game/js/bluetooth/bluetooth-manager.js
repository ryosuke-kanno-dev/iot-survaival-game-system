// ==========================================
// bluetooth-manager.js - Bluetooth接続管理の中枢
// ==========================================
// 責務：
// - Bluetooth デバイスの接続・切断・再接続
// - 接続状態の管理
// - デバイスタイプ（銃・防具）の判定と振り分け
// - 接続状態変更の通知
//
// 禁止事項：
// - UI操作（DOM操作・ログ出力など）
// - ゲームロジックの実行
// - 直接的な画面表示更新
// ==========================================

import { BLUETOOTH_SERVICES } from "../core/constants.js";
import { GAME_STATES } from "../core/game-state.js";
import { showTestFeedback } from "../ui/ui-test-feedback.js";
import { logger } from "../ui/ui-log.js";

export const DEVICE_TYPES = {
  GUN: "gun",
  ARMOR: "armor",
};

export const CONNECTION_STATUS = Object.freeze({
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  DISCONNECTING: "disconnecting",
  ERROR: "error",
});

const DEVICE_NAME_PATTERNS = {
  [DEVICE_TYPES.GUN]: "SPEC-IRGun",
  [DEVICE_TYPES.ARMOR]: "SPEC-IRArmor",
};

const CHARACTERISTIC_UUIDS = {
  [DEVICE_TYPES.GUN]: "56789012-3456-7890-1234-abcdefabcdef",
  [DEVICE_TYPES.ARMOR]: "87654321-4321-6789-4321-abcdef987654",
};

class BluetoothManager {
  constructor() {
    this.devices = {
      [DEVICE_TYPES.GUN]: null,
      [DEVICE_TYPES.ARMOR]: null,
    };

    this.characteristics = {
      [DEVICE_TYPES.GUN]: null,
      [DEVICE_TYPES.ARMOR]: null,
    };

    this.status = {
      [DEVICE_TYPES.GUN]: CONNECTION_STATUS.DISCONNECTED,
      [DEVICE_TYPES.ARMOR]: CONNECTION_STATUS.DISCONNECTED,
    };

    this.statusListeners = [];
    this.savedDeviceNames = [];

    // gameState 注入（接続状態 → GAME_STATE遷移 用）
    this._gameState = null;

    // ==========================================
    // 追加: statsManager 注入用（命中・被弾カウント用）
    // ==========================================
    this._statsManager = null;

    // 警告ログ連続出力防止（1秒制限）
    this._lastWarnTime = 0;

    this.onStatusChange(() => {
      this.updateGameStateFromConnection();
    });
  }

  // ==========================================
  // DOWN状態ガード用ヘルパー
  // ==========================================

  /**
   * PLAYING状態かチェックする（IR送信用）
   * PLAYING以外なら警告ログを出して true を返す
   * @private
   * @returns {boolean} true = ガードに引っかかった（送信中断すべき）
   */
  _isNotPlayingForSend() {
    if (!this._gameState) return false;

    if (this._gameState.getState() !== GAME_STATES.PLAYING) {
      const now = Date.now();
      if (now - this._lastWarnTime >= 1000) {
        this._lastWarnTime = now;
        const msg = "⚠ ダウン中なので射撃信号を送信することはできません";
        console.warn(`[BluetoothManager] ${msg}`);
        // UIログはここでは出さない（bluetooth-managerの禁止事項: UI操作）
        // 必要なら上位レイヤー（linkon-main.js）でリスナーとして受け取る
      }
      return true;
    }
    return false;
  }

  /**
   * 信号受信をブロックすべきか判定する
   * DOWN状態またはEND状態の場合は完全に無視する
   * IDLE, CONNECTING, READY, PLAYING の場合は受信を許可する（後続のテスト処理に回すため）
   * @private
   * @returns {boolean} true = 受信処理を中断すべき
   */
  _isNotPlayingForReceive() {
    if (!this._gameState) return false;
    const state = this._gameState.getState();
    // ダウン中と試合終了時は信号を一切受け付けない
    return state === GAME_STATES.DOWN || state === GAME_STATES.END;
  }

  // ==========================================
  // IR送受信メソッド実装時のガードパターン
  // ==========================================
  /**
   * 射撃信号を送信（実装例）
   * 実際のデバイスに合わせて修正してください
   */
  async sendShootSignal() {
    if (this._isNotPlayingForSend()) return false;

    const characteristic = this.getCharacteristic(DEVICE_TYPES.GUN);
    if (!characteristic) return false;

    try {
      // 実際の射撃信号データ（デバイスに合わせて修正）
      const shootData = new Uint8Array([0x01]); // 例
      await characteristic.writeValue(shootData);

      // ==========================================
      // 射撃成功時に命中カウント
      // ==========================================
      if (this._statsManager) {
        this._statsManager.addHit();
        // ログ削減: console.log("[BT] Hit counted");
      }

      return true;
    } catch (error) {
      console.error("[BT] Shoot signal error:", error);
      return false;
    }
  }

  saveConnection(device, characteristic, deviceType) {
    this.devices[deviceType] = device;
    this.characteristics[deviceType] = characteristic;

    // ==========================================
    // 修正：両方のデバイスでリスナーを設定
    // ==========================================

    // GUN: 射撃通知リスナー
    if (deviceType === DEVICE_TYPES.GUN) {
      this.setupShootListener(characteristic, deviceType);
    }

    // ARMOR: 被弾通知リスナー
    if (deviceType === DEVICE_TYPES.ARMOR) {
      this.setupDamageListener(characteristic, deviceType);
    }
  }

  /**
   * GUN側のボタン押下通知を受信
   * "BluetoothGunShoot1" を受信したら射撃処理を実行
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @param {string} deviceType
   */
  setupShootListener(characteristic, deviceType) {
    console.log(`[BT] 🎯 setupShootListener called for ${deviceType}`);
    // ログ削減: console.log("[BT] characteristic:", characteristic);

    if (!characteristic) {
      console.warn("[BT] Cannot setup shoot listener: characteristic is null");
      return;
    }

    // ログ削減: console.log(`[BT] Setting up shoot listener for ${deviceType}`);

    // ボタン押下通知を受信
    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      // PLAYING以外では無視
      if (this._isNotPlayingForReceive()) return;

      const data = event.target.value;

      // TextDecoderで文字列に変換
      const decoder = new TextDecoder("utf-8");
      const message = decoder.decode(data);

      console.log(`[BT] Received from GUN: "${message}"`);

      // ==========================================
      // "BluetoothGunShoot1" を受信したら射撃処理
      // ==========================================
      if (message === "BluetoothGunShoot1") {
        console.log("[BT] 🎯 Shoot button pressed! Executing shoot...");

        // 射撃処理を実行
        this.executeShoot();
      } else if (message === "IRSent") {
        console.log("[BT] ✅ IR signal sent confirmation received");
      }
    });

    // 通知を開始
    characteristic
      .startNotifications()
      .then(() => {
        console.log(`[BT] ✅ ${deviceType} shoot notifications started`);
      })
      .catch((error) => {
        console.error(
          `[BT] Failed to start notifications for ${deviceType}:`,
          error,
        );
      });
  }

  /**
   * 射撃処理を実行
   * 1. 弾数チェック
   * 2. 命中カウント
   * 3. IRコード送信
   */
  async executeShoot() {
    // ログ削減: console.log("[BT] executeShoot() called");

    // ==========================================
    // テストモード確認: 試合中以外はテスト表示を行って終了する
    // ==========================================
    const gameState = window.linkONApp?.modules?.gameState;
    if (gameState) {
      const state = gameState.getState();
      if (state !== GAME_STATES.PLAYING && state !== GAME_STATES.DOWN && state !== GAME_STATES.END) {
        console.log("[BT] 🎯 射撃テストを検知");
        showTestFeedback("🎯 射撃検知！", "shoot");
        // テスト時も他のプレイヤーの防具を鳴らすために赤外線だけは送信する
        await this.sendIRCode("IR_CODE_1");
        return;
      }
    }

    // ==========================================
    // STEP 1: 接続チェック (isBluetoothConnected フラグの代わり)
    // ==========================================
    if (!this.isBothConnected()) {
      console.warn("[BT] ⚠️ Bluetooth disconnected! Cannot shoot.");
      return;
    }

    const serverSync = window.linkONApp?.modules?.serverSync;
    if (serverSync) {
      const matchData = serverSync.getMatchData();
      if (matchData && matchData.matchStatus === "PAUSED") {
        console.warn("[BT] ⚠️ Match is PAUSED! Cannot shoot.");
        return;
      }
    }

    // ==========================================
    // STEP 2: AmmoManager を取得
    // ==========================================
    const ammoManager = window.linkONApp?.modules?.ammoManager;

    if (!ammoManager) {
      console.error("[BT] ❌ AmmoManager not available");
      return;
    }

    const currentAmmo = ammoManager.getCurrentAmmo();
    console.log(`[BT] Current ammo: ${currentAmmo}`);

    // ==========================================
    // STEP 2: 弾数チェック
    // ==========================================
    if (currentAmmo <= 0) {
      console.warn("[BT] ⚠️ Out of ammo! Cannot shoot.");
      return;
    }

    // ==========================================
    // STEP 3: shoot() で弾数を減らす
    // ==========================================
    const shootResult = ammoManager.shoot();

    if (!shootResult) {
      console.warn("[BT] ⚠️ Shoot failed (not in PLAYING state or out of ammo)");
      return;
    }

    // ログ削減: console.log(`[BT] 💥 Shot fired! Ammo remaining: ${ammoManager.getCurrentAmmo()}`);

    // ==========================================
    // STEP 4: 命中カウント
    // ==========================================
    if (this._statsManager) {
      this._statsManager.addHit();
      logger.system("🔫 射撃アクションを実行しました");
      // ログ削減: console.log("[BT] ✅ Hit counted");
    }

    // ==========================================
    // STEP 5: IRコードをESP32に送信
    // ==========================================
    await this.sendIRCode("IR_CODE_1");
  }

  /**
   * IRコード文字列をESP32に送信
   * @param {string} irCode - IRコード名（例: "IR_CODE_1"）
   */
  async sendIRCode(irCode) {
    const characteristic = this.getCharacteristic(DEVICE_TYPES.GUN);

    if (!characteristic) {
      console.error(
        "[BT] Cannot send IR code: GUN characteristic not available",
      );
      return false;
    }

    try {
      // TextEncoderで文字列をUint8Arrayに変換
      const encoder = new TextEncoder();
      const data = encoder.encode(irCode);

      console.log(`[BT] Sending IR code to ESP32: "${irCode}"`);

      await characteristic.writeValue(data);

      console.log("[BT] ✅ IR code sent successfully");

      return true;
    } catch (error) {
      console.error("[BT] Failed to send IR code:", error);
      return false;
    }
  }

  /**
   * 被弾通知リスナーをセットアップ
   * @param {BluetoothRemoteGATTCharacteristic} characteristic
   * @param {string} deviceType
   */
  setupDamageListener(characteristic, deviceType) {
    if (!characteristic) {
      console.warn("[BT] Cannot setup damage listener: characteristic is null");
      return;
    }

    // ログ削減: console.log(`[BT] Setting up damage listener for ${deviceType}`);

    // 被弾通知を受信
    characteristic.addEventListener("characteristicvaluechanged", (event) => {
      // PLAYING以外では無視
      if (this._isNotPlayingForReceive()) return;

      const data = event.target.value;

      // ==========================================
      // 修正：TextDecoderで文字列に変換
      // ==========================================
      const decoder = new TextDecoder("utf-8");
      const message = decoder.decode(data);

      console.log(`[BT] 📡 Received from ARMOR: "${message}"`);

      // ==========================================
      // IR信号受信処理
      // ==========================================
      if (message.startsWith("IR:")) {
        const irCode = message.substring(3); // "IR:" を削除
        console.log(`[BT] 🎯 IR Signal detected: ${irCode}`);

        // ダメージ処理
        this.processIRDamage(irCode);
      } else {
        console.log(`[BT] ℹ️ Unknown message from ARMOR: "${message}"`);
      }
    });

    // 通知を開始
    characteristic
      .startNotifications()
      .then(() => {
        console.log(`[BT] ✅ ${deviceType} damage notifications started`);
      })
      .catch((error) => {
        console.error(
          `[BT] Failed to start notifications for ${deviceType}:`,
          error,
        );
      });
  }

  /**
   * IR信号からダメージを処理（サーバー権威版）
   * @param {string} irCode - 受信したIRコード
   */
  async processIRDamage(irCode) {
    console.log(`[BT] 💥 Processing IR damage: ${irCode}`);

    // ==========================================
    // テストモード確認: 試合中以外はテスト表示を行ってダメージ処理をスキップする
    // ==========================================
    const gameState = window.linkONApp?.modules?.gameState;
    if (gameState) {
      const state = gameState.getState();
      if (state !== GAME_STATES.PLAYING && state !== GAME_STATES.DOWN && state !== GAME_STATES.END) {
        console.log("[BT] 💥 被弾テストを検知");
        showTestFeedback("💥 被弾センサー反応！", "hit");
        return;
      }
    }

    // ==========================================
    // 接続チェック (isBluetoothConnected フラグの代わり)
    // ==========================================
    if (!this.isBothConnected()) {
      console.warn("[BT] ⚠️ Bluetooth disconnected! Ignoring damage.");
      return;
    }

    // ==========================================
    // IRコードに応じてダメージ量を決定
    // ==========================================
    let damageAmount = 10;
    let bodyPart = "head";

    if (
      irCode === "0xD009895" ||
      irCode === "0x40040D009895" ||
      irCode.includes("D009895")
    ) {
      damageAmount = 10;
      bodyPart = "head";
    } else if (irCode === "0xAABB" || irCode === "0x40040D00AABB") {
      damageAmount = 15;
      bodyPart = "torso";
    } else if (irCode === "0xCCDD" || irCode === "0x40040D00CCDD") {
      damageAmount = 5;
      bodyPart = "rightArm";
    }

    console.log(`[BT] Damage: ${damageAmount} to ${bodyPart}`);

    // ==========================================
    // 部位名を health-manager 形式に変換
    // ==========================================
    const partNameMap = {
      head: "headHp",
      torso: "torsoHp",
      rightArm: "rightarmHp",
      leftArm: "leftarmHp",
      rightLeg: "rightlegHp",
      leftLeg: "leftlegHp",
    };

    const healthManagerPartName = partNameMap[bodyPart];

    if (!healthManagerPartName) {
      console.error(`[BT] ❌ Invalid body part: ${bodyPart}`);
      return;
    }

    // ==========================================
    // サーバーにダメージを送信（サーバー権威）
    // ==========================================
    const serverSync = window.linkONApp?.modules?.serverSync;

    if (!serverSync) {
      console.error("[BT] ❌ ServerSync not available");
      return;
    }

    try {
      const result = await serverSync.sendDamageWithRetry({
        bodyPart: healthManagerPartName,
        damageAmount: damageAmount,
      });

      if (result.success) {
        console.log(
          `[BT] ✅ Damage applied by server: -${damageAmount}HP to ${bodyPart}`,
        );
        console.log(
          `[BT] New HP: ${result.newHP}, Total HP: ${result.totalHP}`,
        );

        // ==========================================
        // 追加：サーバーの計算結果をクライアントに反映
        // health-manager.js を更新（表示用）
        // ==========================================
        this.updateLocalHealthFromServer(result);

        if (result.isDown) {
          console.warn("[BT] 💀 Server determined DOWN state");
        }
      } else {
        console.warn("[BT] ⚠️ Damage not applied:", result.reason);
      }
    } catch (error) {
      console.error("[BT] ❌ Error sending damage:", error);
      return;
    }

    // ==========================================
    // 被弾カウント
    // ==========================================
    if (this._statsManager) {
      this._statsManager.addDamage();
      logger.damage(`💥 被弾しました（部位: ${bodyPart} / ダメージ: ${damageAmount}）`);
      console.log("[BT] ✅ Damage stat counted");
    }

    // ==========================================
    // ESP32にダメージ確認を送信
    // ==========================================
    this.sendDamageCommand(`DAMAGE_${bodyPart.toUpperCase()}`);
  }

  /**
   * サーバーのHP計算結果をローカルのhealth-managerに反映
   * @param {Object} serverResult - サーバーからのレスポンス
   */
  updateLocalHealthFromServer(serverResult) {
    console.log("[BT] Updating local health from server result");

    // ==========================================
    // 最新のプレイヤーデータをサーバーから取得
    // ==========================================
    const serverSync = window.linkONApp?.modules?.serverSync;

    if (serverSync && typeof serverSync.fetchMyPlayerData === "function") {
      // 非同期で最新データを取得（UI更新）
      serverSync
        .fetchMyPlayerData()
        .then(() => {
          console.log("[BT] ✅ Local health data synced from server");
        })
        .catch((error) => {
          console.error("[BT] Failed to sync health data:", error);
        });
    } else {
      console.warn("[BT] fetchMyPlayerData not available");
    }
  }

  /**
   * ダメージコマンドをESP32（ARMOR）に送信
   * @param {string} command - ダメージコマンド（例: "DAMAGE_HEAD"）
   */
  async sendDamageCommand(command) {
    const characteristic = this.getCharacteristic(DEVICE_TYPES.ARMOR);

    if (!characteristic) {
      console.warn("[BT] Cannot send damage command: ARMOR not connected");
      return false;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);

      console.log(`[BT] 📤 Sending damage command: "${command}"`);

      await characteristic.writeValue(data);

      console.log("[BT] ✅ Damage command sent to ARMOR");

      return true;
    } catch (error) {
      console.error("[BT] Failed to send damage command:", error);
      return false;
    }
  }

  // ==========================================
  // Bluetooth接続・切断
  // ==========================================

  isBluetoothAvailable() {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  }

  async connect() {
    if (!this.isBluetoothAvailable()) {
      return this.handleError("Bluetooth API がサポートされていません");
    }

    try {
      // STEP 1: デバイス選択
      const device = await this.requestDevice();
      if (!device) return null;

      // STEP 2: デバイスタイプ判定
      const deviceType = this.getDeviceType(device.name);
      if (!deviceType) {
        return this.handleError(`不明なデバイス: ${device.name}`);
      }

      console.log(`[BT] Device type detected: ${deviceType}`);

      // STEP 3: 接続中ステータスに変更
      this.updateStatus(deviceType, CONNECTION_STATUS.CONNECTING);

      // STEP 4: GATT サーバーに接続
      const server = await device.gatt.connect();
      console.log("[BT] GATT server connected");

      // STEP 5: Characteristic を取得
      const characteristic = await this.getCharacteristicFromServer(
        server,
        deviceType,
      );
      console.log(`[BT] Characteristic obtained`);

      // STEP 6: 接続情報を保存 & リスナー設定
      console.log(`[BT] Calling saveConnection for ${deviceType}...`);
      this.saveConnection(device, characteristic, deviceType);
      console.log(`[BT] saveConnection completed`);

      // STEP 7: 切断イベントリスナーを設定
      device.addEventListener("gattserverdisconnected", () => {
        console.log(`[BT] ${deviceType} disconnected`);
        this.handleDisconnection(deviceType);
      });

      // STEP 8: 接続完了ステータスに変更
      this.updateStatus(deviceType, CONNECTION_STATUS.CONNECTED);

      console.log(`[BT] ✅ ${deviceType} connection completed successfully!`);

      return { deviceType, characteristic };
    } catch (error) {
      console.error("[BT] Connect error:", error);
      return this.handleError(`接続エラー: ${error.message}`, error);
    }
  }

  /**
   * 切断を監視
   * @param {BluetoothDevice} device
   * @param {string} deviceType
   */
  watchDisconnection(device, deviceType) {
    device.addEventListener("gattserverdisconnected", () => {
      console.log(`[BT] ${deviceType} disconnected`);
      this.handleDisconnection(deviceType);
    });
  }

  /**
   * 機器切断時の処理
   * @param {string} deviceType
   */
  handleDisconnection(deviceType) {
    console.log(`[BT] handleDisconnection called for: ${deviceType}`);
    
    // 状態をDISCONNECTEDに更新
    this.updateStatus(deviceType, CONNECTION_STATUS.DISCONNECTED);
    
    // キャッシュをクリア
    this.devices[deviceType] = null;
    this.characteristics[deviceType] = null;
    
    // UIや状態の更新処理へ
    this.updateGameStateFromConnection();
  }

  async requestDevice() {
    try {
      return await navigator.bluetooth.requestDevice({
        acceptAllDevices: false,
        filters: [
          { name: DEVICE_NAME_PATTERNS[DEVICE_TYPES.GUN] },
          { name: DEVICE_NAME_PATTERNS[DEVICE_TYPES.ARMOR] },
        ],
        optionalServices: [BLUETOOTH_SERVICES.ARMOR, BLUETOOTH_SERVICES.GUN],
      });
    } catch (error) {
      if (error.name === "NotFoundError") return null;
      throw error;
    }
  }

  getDeviceType(deviceName) {
    for (const [type, pattern] of Object.entries(DEVICE_NAME_PATTERNS)) {
      if (deviceName.includes(pattern)) return type;
    }
    return null;
  }

  async getCharacteristicFromServer(server, deviceType) {
    const serviceUUID = BLUETOOTH_SERVICES[deviceType.toUpperCase()];
    const characteristicUUID = CHARACTERISTIC_UUIDS[deviceType];
    const service = await server.getPrimaryService(serviceUUID);
    return await service.getCharacteristic(characteristicUUID);
  }

  saveConnection(device, characteristic, deviceType) {
    console.log(`[BT] saveConnection called with deviceType: ${deviceType}`);
    console.log("[BT] characteristic:", characteristic);
    console.log("[BT] DEVICE_TYPES.GUN:", DEVICE_TYPES.GUN);

    this.devices[deviceType] = device;
    this.characteristics[deviceType] = characteristic;

    console.log("[BT] Devices and characteristics saved");

    // ==========================================
    // デバッグログを追加
    // ==========================================

    // GUN: 射撃通知リスナー
    if (deviceType === DEVICE_TYPES.GUN) {
      console.log(
        "[BT] ✅ deviceType matches DEVICE_TYPES.GUN, calling setupShootListener...",
      );
      this.setupShootListener(characteristic, deviceType);
    } else {
      console.log(
        `[BT] ❌ deviceType (${deviceType}) does NOT match DEVICE_TYPES.GUN (${DEVICE_TYPES.GUN})`,
      );
    }

    // ARMOR: 被弾通知リスナー
    if (deviceType === DEVICE_TYPES.ARMOR) {
      console.log(
        "[BT] ✅ deviceType matches DEVICE_TYPES.ARMOR, calling setupDamageListener...",
      );
      this.setupDamageListener(characteristic, deviceType);
    } else {
      console.log(
        `[BT] ❌ deviceType (${deviceType}) does NOT match DEVICE_TYPES.ARMOR (${DEVICE_TYPES.ARMOR})`,
      );
    }
  }

  async disconnect(deviceType) {
    const device = this.devices[deviceType];
    if (!device || !device.gatt.connected) return false;

    try {
      device.gatt.disconnect();
      this.updateStatus(deviceType, CONNECTION_STATUS.DISCONNECTED);
      return true;
    } catch (error) {
      this.handleError(`切断エラー: ${error.message}`, error);
      return false;
    }
  }

  async disconnectAll() {
    await Promise.all([
      this.disconnect(DEVICE_TYPES.GUN),
      this.disconnect(DEVICE_TYPES.ARMOR),
    ]);
  }

  // ==========================================
  // 状態管理・通知
  // ==========================================

  updateStatus(deviceType, status) {
    const oldStatus = this.status[deviceType];
    if (oldStatus === status) return;
    this.status[deviceType] = status;
    this.notifyStatusChange(deviceType, status, oldStatus);
    
    // システムログへの出力追加
    if (status === CONNECTION_STATUS.CONNECTED) {
      logger.system(`📡 [通信] ${deviceType === DEVICE_TYPES.GUN ? 'レーザー銃' : '防具'}が接続されました`);
    } else if (status === CONNECTION_STATUS.DISCONNECTED) {
      logger.system(`⚠️ [通信] ${deviceType === DEVICE_TYPES.GUN ? 'レーザー銃' : '防具'}が切断されました`);
    }

    // ==========================================
    // 追加: 試合中切断時のPAUSE制御
    // ==========================================
    this.handlePauseLogic();
  }

  notifyStatusChange(deviceType, newStatus, oldStatus) {
    this.statusListeners.forEach((listener) => {
      try {
        listener({ deviceType, newStatus, oldStatus });
      } catch (error) {
        console.error("Bluetooth status listener error:", error);
      }
    });
  }

  async handlePauseLogic() {
    if (!this._gameState) return;

    // 自分のスマホのローカル状態がPLAYINGやDOWNのときのみ発動
    const currentState = this._gameState.getState();
    if (currentState !== GAME_STATES.PLAYING && currentState !== GAME_STATES.DOWN) return;

    const matchId = window.MATCH_ID || 1;

    try {
      if (!this.isBothConnected()) {
        console.log("[BT] A device disconnected during match. Requesting PAUSE.");
        await fetch('/battle_arena/api/update_match.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_id: matchId, status: 'PAUSED' })
        });
      } else {
        console.log("[BT] Devices fully reconnected. Requesting RESUME (PLAYING).");
        await fetch('/battle_arena/api/update_match.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_id: matchId, status: 'PLAYING' })
        });
      }
    } catch (e) {
      console.error("[BT] Failed to update pause status:", e);
    }
  }

  handleError(message, error = null) {
    this.notifyError({ message, error });
    return null;
  }

  notifyError(errorInfo) {
    this.statusListeners.forEach((listener) => {
      try {
        listener({ type: "error", ...errorInfo });
      } catch (error) {
        console.error("Bluetooth error listener error:", error);
      }
    });
  }

  // ==========================================
  // 公開API
  // ==========================================

  isConnected(deviceType) {
    return this.status[deviceType] === CONNECTION_STATUS.CONNECTED;
  }
  isBothConnected() {
    return (
      this.isConnected(DEVICE_TYPES.GUN) && this.isConnected(DEVICE_TYPES.ARMOR)
    );
  }
  getCharacteristic(deviceType) {
    return this.characteristics[deviceType];
  }

  getStatus(deviceType = null) {
    if (deviceType) return this.status[deviceType];
    return { ...this.status };
  }

  onStatusChange(callback) {
    if (typeof callback !== "function") {
      console.error(
        "bluetooth-manager: コールバックは関数である必要があります",
      );
      return;
    }
    this.statusListeners.push(callback);
  }

  offStatusChange(callback) {
    const index = this.statusListeners.indexOf(callback);
    if (index !== -1) this.statusListeners.splice(index, 1);
  }

  getSavedDeviceNames() {
    return [...this.savedDeviceNames];
  }

  // ==========================================
  // 開発用メソッド
  // ==========================================

  setDevConnection(deviceType, status) {
    if (deviceType !== DEVICE_TYPES.GUN && deviceType !== DEVICE_TYPES.ARMOR) {
      console.error("BluetoothManager: 無効なデバイスタイプ", deviceType);
      return;
    }
    console.log(`BluetoothManager (開発): ${deviceType} を ${status} に設定`);
    this.updateStatus(deviceType, status);
  }

  async reconnect() {
    console.log("[BT] 再接続を試行します...");
    
    // どちらかが切断されている場合のみ接続ダイアログを開く
    if (this.isBothConnected()) {
      console.log("[BT] 既に両方のデバイスが接続されています。");
      return true;
    }

    // connect()は1回の呼び出しで1つのデバイスを選択させるため、
    // ここでそのまま connect() を呼べば、切断されている方を選択できる。
    // ※ 既存の接続は維持する（updateStatusでDISCONNECTEDに上書きしない）
    return await this.connect();
  }

  // ==========================================
  // 接続状態 → GAME_STATE遷移
  // ==========================================

  setGameState(gameState) {
    console.log("[BT] setGameState() 呼び出し:", gameState);
    console.log("[BT] gameState.setState の型:", typeof gameState?.setState);
    console.log("[BT] gameState.getState の型:", typeof gameState?.getState);

    if (!gameState || typeof gameState.setState !== "function") {
      console.error(
        "[BT] ❌ setGameState: 無効な gameState が渡されました。" +
          "setState() メソッドが存在しないか、gameState が null です。",
        gameState,
      );
      return;
    }

    this._gameState = gameState;
    console.log("[BT] ✅ gameState の注入完了");
  }

  /**
   * statsManager を注入する
   * linkon-main.js の initBluetooth() から呼び出す
   * @param {Object} statsManager - StatsManager インスタンス
   */
  setStatsManager(statsManager) {
    console.log("[BT] setStatsManager() 呼び出し:", statsManager);

    if (!statsManager || typeof statsManager.addHit !== "function") {
      console.error(
        "[BT] ❌ setStatsManager: 無効な statsManager が渡されました。",
        statsManager,
      );
      return;
    }

    this._statsManager = statsManager;
    console.log("[BT] ✅ statsManager の注入完了");
  }

  updateGameStateFromConnection() {
    console.log("[BT] updateGameStateFromConnection() 呼び出し");
    console.log("[BT] 現在の BT status:", { ...this.status });

    if (!this._gameState) {
      console.warn(
        "[BT] ⚠️ _gameState が未注入のため遷移をスキップ。setGameState() が呼ばれましたか？",
      );
      return;
    }

    const gunStatus = this.status[DEVICE_TYPES.GUN];
    const armorStatus = this.status[DEVICE_TYPES.ARMOR];

    const gunConnected = gunStatus === CONNECTION_STATUS.CONNECTED;
    const armorConnected = armorStatus === CONNECTION_STATUS.CONNECTED;
    const gunActive =
      gunConnected || gunStatus === CONNECTION_STATUS.CONNECTING;
    const armorActive =
      armorConnected || armorStatus === CONNECTION_STATUS.CONNECTING;

    let nextState;
    if (gunConnected && armorConnected) nextState = GAME_STATES.READY;
    else if (gunActive || armorActive) nextState = GAME_STATES.CONNECTING;
    else nextState = GAME_STATES.IDLE;

    const currentState = this._gameState.getState();

    // ==========================================
    // 追加要件: 試合中（PLAYING / DOWN）の場合は、
    // IDLEやCONNECTINGに戻さず、現在の状態を維持する
    // ==========================================
    if (
      currentState === GAME_STATES.PLAYING || 
      currentState === GAME_STATES.DOWN
    ) {
      console.log(`[BT] 試合中 (${currentState}) のため、状態遷移はスキップしフラグのみ更新します。`);
      
      // UIの接続状態アイコン等は LinkONApp 側の 
      // this.modules.bluetoothManager.onStatusChange 等で検知して更新される
      return;
    }

    console.log(`[BT] 判定結果: ${currentState} → ${nextState}`);

    if (currentState === nextState) {
      console.log("[BT] 同じ状態のためスキップ");
      return;
    }

    console.log(`[BT] setState(${nextState}) を呼び出します`);
    const result = this._gameState.setState(nextState);
    console.log("[BT] setState の戻り値:", result);
    console.log("[BT] setState 後の実際の状態:", this._gameState.getState());

    if (!result) {
      console.error(
        `[BT] ❌ setState(${nextState}) が false を返しました。` +
          `VALID_TRANSITIONS に ${currentState} → ${nextState} のパスがない可能性があります。`,
      );
    }
  }

  /**
   * 射撃信号を送信
   * 実際のデバイスプロトコルに合わせて修正してください
   * @returns {Promise<boolean>} 成功なら true
   */
  async sendShootSignal() {
    if (this._isNotPlayingForSend()) return false;

    const characteristic = this.getCharacteristic(DEVICE_TYPES.GUN);
    if (!characteristic) {
      console.warn("[BT] Gun characteristic not available");
      return false;
    }

    try {
      // ==========================================
      // 実際の射撃信号データ（デバイスに合わせて修正）
      // 以下は例です。実際のプロトコルを確認してください
      // ==========================================
      const shootData = new Uint8Array([0x01]); // 例: 0x01 = 射撃コマンド

      await characteristic.writeValue(shootData);

      console.log("[BT] Shoot signal sent");

      // ==========================================
      // 射撃成功時に命中カウント
      // ==========================================
      if (this._statsManager) {
        this._statsManager.addHit();
        console.log("[BT] ✅ Hit counted");
      }

      return true;
    } catch (error) {
      console.error("[BT] Shoot signal error:", error);
      return false;
    }
  }
}

// export文はそのまま
export function initBluetoothManager() {
  return new BluetoothManager();
}

export const bluetoothManager = new BluetoothManager();
