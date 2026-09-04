// ==========================================
// linkon-main.js - ゲーム統合司令塔（最終確定版）
// ==========================================
// 責務：
// - 全モジュールの初期化（正しい順序で）
// - モジュール間のイベント接続
// - UIイベントリスナーの登録
//
// 禁止事項：
// - ゲームロジックの実装
// - HP計算・ダメージ処理
// - ダウン判定ロジック
// - デバッグ処理（developer.js に分離）
//
// 設計思想：
// 「処理しない、繋ぐだけ」
// 各モジュールを正しく配線し、協調動作させる
// ==========================================

// ==========================================
// Phase 0: インポート（依存関係の明示）
// ==========================================

// Core（最優先）
import { gameState, GAME_STATES } from "./core/game-state.js";
import { getInitialAmmo } from "./core/constants.js";
import { initStatsManager } from "./core/stats-manager.js";
import { ServerSync } from "./core/server-sync.js";

// Health System（ゲームロジックの中核）
import { healthManager, BODY_PARTS } from "./health/health-manager.js";
import { initDamageDistributor } from "./health/damage-distributor.js";
import { initDownChecker, DOWN_RULES } from "./health/down-checker.js";

// Bluetooth（デバイス通信）
import { bluetoothManager } from "./bluetooth/bluetooth-manager.js";

// Weapon（武器システム）
import { AmmoManager } from "./weapon/ammo-manager.js";

// UI（表示層）
import { initUIHealth } from "./ui/ui-health.js";
import { logger } from "./ui/ui-log.js";
import { initUIConnection } from "./ui/ui-connection.js";
import { initUIAmmo } from "./ui/ui-ammo.js";
import { initUIDown } from "./ui/ui-down.js";
import { initUIStats } from "./ui/ui-stats.js";
import { initUIEnd } from "./ui/ui-end.js";

// Video（演出層）
import { initVideoController } from "./video/video-controller.js";

// Developer（開発）
import { initDeveloperMode } from "./developer.js";

// ==========================================
// アプリケーションクラス
// ==========================================

class LinkONApp {
  constructor() {
    this.initialized = false;
    this.hasGameEnded = false;
    this.hasResultDetermined = false;
    this.hasResultShown = false;
    this.connectionWatchInterval = null;
    this.isConnectionWarningShown = false;
    this.statsSyncInterval = null;

    this.modules = {
      gameState,
      healthManager,
      bluetoothManager,
      logger,
      damageDistributor: null,
      downChecker: null,
      ammoManager: null,
      uiHealth: null,
      uiConnection: null,
      uiAmmo: null,
      videoController: null,
      uiDown: null,
      statsManager: null,
      uiStats: null,
      uiEnd: null,
      serverSync: ServerSync,
    };
  }

  // ==========================================
  // メイン初期化
  // ==========================================
  async init() {
    if (this.initialized) {
      console.warn("既に初期化済みです");
      return;
    }

    logger.system("🚀 SPEC-IR ゲーム初期化開始");

    try {
      this.initCore();

      // ServerSync を初期化（matchData を取得）
      await this.initServerSync();
      logger.system("✅ ServerSync 初期化完了");

      // Health System を初期化（サーバールールを使用）
      await this.initHealthSystem();
      logger.system("✅ Health System 初期化完了");

      this.initWeaponSystem();
      this.initStats();
      this.initUI();
      this.initVideo();
      this.initBluetooth();

      this.connectEvents();
      this.bindUIEvents();
      this.initDeveloper();

      this.initialized = true;
      logger.success("✅ 初期化完了");
    } catch (error) {
      logger.error(`初期化エラー: ${error.message}`);
      console.error(error);
      alert("ゲームの初期化に失敗しました。ページを再読み込みしてください。");
    }
  }

  // ==========================================
  // ① Core 初期化
  // ==========================================

  initCore() {
    gameState.init();
    gameState.forceSetState(GAME_STATES.IDLE);
    logger.system("Core 初期化完了");
  }

  // ==========================================
  // ② Health System 初期化
  // ==========================================
  async initHealthSystem() {
    // サーバーから取得したルールを使用
    // （server-sync.init() で既に取得済み）
    const currentRule = this.modules.serverSync.getDownRule();

    console.log("[LinkON] Initializing Health System with rule:", currentRule);

    this.modules.damageDistributor = initDamageDistributor();
    this.modules.downChecker = initDownChecker({
      rule: currentRule,
    });

    logger.system(`Health System 初期化完了 (Rule: ${currentRule})`);
  }

  // ==========================================
  // ③ Weapon System 初期化
  // ==========================================

  initWeaponSystem() {
    this.modules.ammoManager = new AmmoManager();
    logger.system("Weapon System 初期化完了");
  }

  // ==========================================
  // ④ Stats 初期化
  // ==========================================

  initStats() {
    this.modules.statsManager = initStatsManager();
    logger.system("Stats 初期化完了");
  }

  // ==========================================
  // ⑤ UI 初期化
  // ==========================================

  initUI() {
    this.modules.uiHealth = initUIHealth(healthManager, {
      autoUpdate: true,
      showMaxHP: true,
    });

    this.modules.uiConnection = initUIConnection();
    this.modules.uiAmmo = initUIAmmo(this.modules.ammoManager);

    this.modules.uiDown = initUIDown(
      this.modules.gameState,
      this.modules.statsManager,
    );

    this.modules.uiStats = initUIStats(
      this.modules.statsManager,
      "#screen-game",
    );

    this.modules.uiEnd = initUIEnd(
      this.modules.statsManager,
      this.modules.gameState,
    );

    logger.setCurrentScreen("connect");
    logger.system("UI 初期化完了");
  }

  // ==========================================
  // ⑥ Video 初期化
  // ==========================================

  initVideo() {
    this.modules.videoController = initVideoController({
      autoRestart: false,
      hideOnEnd: true,
      resetOnStop: true,
    });

    logger.system("Video 初期化完了");
  }

  // ==========================================
  // ⑦ Bluetooth 初期化
  // ==========================================

  initBluetooth() {
    bluetoothManager.setGameState(this.modules.gameState);
    bluetoothManager.setStatsManager(this.modules.statsManager);
    logger.system("Bluetooth 初期化完了");
  }

  // ==========================================
  // ⑧ ServerSync 初期化
  // ==========================================
  async initServerSync() {
    const playerId = window.PLAYER_ID || 1;
    const matchId = window.MATCH_ID || 1;

    // ==========================================
    // 修正：await で init() の完了を待つ
    // ==========================================
    await this.modules.serverSync.init(playerId, matchId);

    logger.system(
      `ServerSync 初期化完了 (Player ID: ${playerId}, Match ID: ${matchId})`,
    );

    // ==========================================
    // ポーリングを開始
    // ==========================================
    this.modules.serverSync.startPolling();

    // 接続監視開始
    this.startConnectionWatch();
  }

  // ==========================================
  // ⑨ イベント接続（最重要）
  // ==========================================

  connectEvents() {
    this.modules.ammoManager.setGameState(this.modules.gameState);
    this.modules.ammoManager.setLogger(this.modules.logger);

    this.modules.healthManager.setGameState(this.modules.gameState);
    this.modules.healthManager.setLogger(this.modules.logger);

    this.connectHealthToState();
    this.connectStateToUI();
    this.connectBluetoothToUI();
    this.connectStateToLog();
    this.connectMatchStatusListener();
    this.connectWeaponToSync();

    logger.system("イベント接続完了");
  }

  /**
   * 【接続1】HP変更 → ダウン判定 → 状態遷移 → DOWN送信
   */
  connectHealthToState() {
    healthManager.onChange((event) => {
      const hpState = healthManager.getAllHP();

      // デバッグログ（本番環境では削除推奨）
      console.log("[connectHealthToState] HP changed:", hpState);
      console.log(
        "[connectHealthToState] Current game state:",
        gameState.getState(),
      );

      // ==========================================
      // ダウン判定
      // ==========================================
      const downCheck = this.modules.downChecker.check(hpState);

      console.log("[connectHealthToState] Down check result:", downCheck);

      if (downCheck.isDown && gameState.isPlaying()) {
        console.warn(
          "[connectHealthToState] ⚠️ DOWN判定が発生しました:",
          downCheck.reason,
        );
        gameState.down(downCheck.reason);
      }

      if (!downCheck.isDown && gameState.isDown()) {
        gameState.revive("HPが回復しました");
      }

      // ==========================================
      // 修正：health-manager の実際のキー名に合わせる
      // Console ログから判明：headHp, torsoHp, leftarmHp 形式
      // ==========================================
      const hpData = {
        head: hpState.headHp?.current ?? 0,
        torso: hpState.torsoHp?.current ?? 0,
        rightArm: hpState.rightarmHp?.current ?? 0,
        leftArm: hpState.leftarmHp?.current ?? 0,
        rightLeg: hpState.rightlegHp?.current ?? 0,
        leftLeg: hpState.leftlegHp?.current ?? 0,
      };

      // デバッグログ
      console.log("[connectHealthToState] Extracted HP data:", hpData);

      // HP送信
      this.modules.serverSync.sendHP(hpData);

      // ==========================================
      // Total HP 計算
      // ==========================================
      const totalHP = this.modules.serverSync.calculateTotalHP(hpData);

      console.log("[connectHealthToState] Total HP:", totalHP);
    });
  }

  /**
   * 【接続2】状態変更 → Video/UI反応
   */
  connectStateToUI() {
    gameState.onStateChange((newState, oldState, reason) => {
      // ① ログ出力
      const reasonText = reason ? `（${reason}）` : "";
      logger.info(`状態遷移: ${oldState} → ${newState} ${reasonText}`);

      // ② 画面切り替え処理
      const screenId = gameState.getCurrentScreen();

      if (screenId) {
        document.querySelectorAll(".screen").forEach((screen) => {
          screen.classList.remove("is-active");
        });

        const target = document.getElementById(screenId);
        if (target) {
          target.classList.add("is-active");
        } else {
          console.warn(`画面IDが見つかりません: ${screenId}`);
        }
      }

      // ③ 状態別処理
      switch (newState) {
        case GAME_STATES.IDLE:
          logger.info("接続画面に移動");

          if (oldState === GAME_STATES.END) {
            setTimeout(() => {
              this.checkConnectionAndTransition();
            }, 100);
          } else {
            logger.info("接続をキャンセルしました");
          }
          break;

        case GAME_STATES.CONNECTING:
          logger.info("Bluetooth接続中...");
          break;

        case GAME_STATES.READY:
          logger.success("接続完了 - ゲーム開始可能");
          break;

        case GAME_STATES.PLAYING:
          if (oldState === GAME_STATES.READY) {
            this.resetGameData();
            this.modules.statsManager.start();
            this.modules.uiStats.start();
            this.startStatsSyncInterval();
            logger.success("ゲーム開始！");
            logger.info("戦績計測開始");
          } else if (oldState === GAME_STATES.DOWN) {
            this.modules.uiStats.start();
            logger.success("蘇生しました！");
          }

          if (this.modules.uiConnection) {
            this.modules.uiConnection.updateGunStatus(
              bluetoothManager.getStatus("gun"),
            );
            this.modules.uiConnection.updateArmorStatus(
              bluetoothManager.getStatus("armor"),
            );
          }
          break;

        case GAME_STATES.DOWN:
          if (oldState === GAME_STATES.PLAYING) {
            this.modules.statsManager.end();
            this.modules.uiStats.stop();
            const finalStats = this.modules.statsManager.getStats();
            this.modules.serverSync.sendStats(finalStats);
            logger.info("戦績計測終了");

            // ここでダウン状態をサーバーに送信
            this.modules.serverSync.sendDown();
          }

          logger.warn("ダウンしました");
          logger.warn("⚠ プレイヤーがダウンしました");
          break;

        case GAME_STATES.END:
          this.modules.uiStats.stop();
          this.stopStatsSyncInterval();
          this.modules.uiEnd.show();
          logger.info("ゲーム終了");
          break;
      }
    });
  }

  /**
   * 【接続3】Bluetooth状態変更 → UI反応 + DB送信
   */
  connectBluetoothToUI() {
    bluetoothManager.onStatusChange((event) => {
      if (event.type === "error") {
        logger.error(`Bluetooth: ${event.message}`);
        return;
      }

      const { deviceType, newStatus } = event;

      // ==========================================
      // UI更新
      // ==========================================
      if (this.modules.uiConnection) {
        if (deviceType === "gun") {
          this.modules.uiConnection.updateGunStatus(newStatus);
        } else if (deviceType === "armor") {
          this.modules.uiConnection.updateArmorStatus(newStatus);
        }
      }

      // ==========================================
      // ログ出力
      // ==========================================
      if (newStatus === "connected") {
        logger.success(`${deviceType} が接続されました`);
      } else if (newStatus === "disconnected") {
        logger.warn(`${deviceType} が切断されました`);
      }

      // ==========================================
      // 追加：Bluetooth接続状態をDBに送信
      // ==========================================
      this.updateBluetoothStatusToDB();

      // ==========================================
      // 追加：Bluetooth切断時のオーバーレイ表示制御
      // ==========================================
      const overlay = document.getElementById("btDisconnectOverlay");
      const currentState = this.modules.gameState.getState();
      
      if (overlay) {
        if (
          !bluetoothManager.isBothConnected() && 
          (currentState === GAME_STATES.PLAYING || currentState === GAME_STATES.DOWN)
        ) {
          overlay.classList.add("active");
        } else {
          overlay.classList.remove("active");
        }
      }
    });
  }

  /**
   * Bluetooth接続状態をDBに送信
   * 両方接続時のみREADY=1になる
   * @private
   */
  updateBluetoothStatusToDB() {
    // 現在の接続状態を取得
    const gunStatus = bluetoothManager.getStatus("gun");
    const armorStatus = bluetoothManager.getStatus("armor");

    const connectionStatus = {
      gun: gunStatus === "connected",
      armor: armorStatus === "connected",
    };

    // ServerSync経由で送信
    this.modules.serverSync
      .sendBluetoothStatus(connectionStatus)
      .then((result) => {
        if (result.success) {
          if (result.ready) {
            logger.success("✅ 両デバイス接続完了 - READY状態になりました");
          } else {
            logger.info("📡 Bluetooth接続状態を更新しました");
          }
        } else {
          logger.warn(`Bluetooth状態送信スキップ: ${result.reason}`);
        }
      })
      .catch((error) => {
        logger.error("Bluetooth状態送信エラー: " + error.message);
      });
  }
  /**
   * 【接続4】ゲーム状態変化 → ログ画面切り替え
   */
  connectStateToLog() {
    const subscribeMethod =
      typeof gameState.onChange === "function"
        ? "onChange"
        : typeof gameState.onStateChange === "function"
          ? "onStateChange"
          : typeof gameState.subscribe === "function"
            ? "subscribe"
            : null;

    if (!subscribeMethod) {
      console.warn(
        "connectStateToLog: gameState のイベント購読メソッドが見つかりません",
      );
      return;
    }

    gameState[subscribeMethod]((event) => {
      const newState = event?.newState ?? event?.state ?? event;

      switch (newState) {
        case GAME_STATES.IDLE:
        case GAME_STATES.CONNECTING:
        case GAME_STATES.READY:
          logger.setCurrentScreen("connect");
          break;
        case GAME_STATES.PLAYING:
        case GAME_STATES.DOWN:
          logger.setCurrentScreen("game");
          break;
        case GAME_STATES.END:
          logger.setCurrentScreen("game");
          break;
      }
    });
  }

  /**
   * 【接続5】match.status変化 → ゲーム制御（デバッグ版）
   */
  connectMatchStatusListener() {
    // ログ削減: console.log("[connectMatchStatusListener] Registering event listener...");

    const handler = (event) => {
      // ログ削減: console.log("[connectMatchStatusListener] Event received!");
      // ログ削減: console.log("[matchStatusChanged] ========== EVENT FIRED ==========");
      // ログ削減: console.log("[matchStatusChanged] Event.detail:", event.detail);

      if (!event.detail) {
        console.error("[matchStatusChanged] event.detail is undefined!");
        return;
      }

      const { previousStatus, currentStatus } = event.detail;

      logger.system(
        `Match status changed: ${previousStatus || "null"} → ${currentStatus}`,
      );

      // ==========================================
      // 大文字小文字の差異だけでなく、前後の空白や改行も削除 (.trim())
      // ==========================================
      const prev = previousStatus ? String(previousStatus).trim().toLowerCase() : null;
      const curr = currentStatus ? String(currentStatus).trim().toLowerCase() : null;

      // ログ削減: console.log(`[matchStatusChanged] prev: "${prev}", curr: "${curr}"`);

      // PLAYING への遷移
      if (prev !== "playing" && curr === "playing") {
        // ログ削減: console.log("[matchStatusChanged] ✅ Transition to PLAYING detected");

        const currentGameState = this.modules.gameState.getState();
        // ログ削減: console.log("状態遷移: " + currentGameState + " → PLAYING");

        if (currentGameState !== GAME_STATES.PLAYING) {
          // ログ削減: console.log("🎮 Match started - Starting game...");
          logger.system("🎮 Match started - Starting game...");
          this.modules.gameState.startGame("Match status changed to PLAYING");
        } else {
          // ログ削減: console.log("[matchStatusChanged] Already in PLAYING state");
          logger.info("Already in PLAYING state");
        }
      }

      // FINISHED への遷移
      if (curr === "finished" && !this.hasGameEnded) {
        // ログ削減: console.log("[matchStatusChanged] 🏁 Transition to FINISHED detected");
        logger.system("🏁 Match finished - Ending game...");

        this.hasGameEnded = true;
        this.modules.gameState.endGame("Match status changed to FINISHED");
        this.determineMatchResult();

        logger.success("ゲーム終了処理完了");
      }

      // WAITING へのリマッチ
      if (prev === "finished" && curr === "waiting") {
        // ログ削減: console.log("[matchStatusChanged] 🔄 Rematch detected");
        logger.system("🔄 Detected rematch: finished → waiting");
        this.resetForRematch().catch((error) => {
          logger.error("Rematch reset error: " + error.message);
        });
      }

      // PAUSED の表示処理
      const pauseOverlay = document.getElementById("gamePauseOverlay");
      if (pauseOverlay) {
        // Local is connected, but server is paused. So someone else disconnected.
        if (curr === "paused") {
          if (bluetoothManager.isBothConnected()) {
            pauseOverlay.classList.add("active");
            logger.system("⏸️ Match paused (Other player disconnected)");
          }
          if (typeof this.modules.statsManager.pause === "function") {
            this.modules.statsManager.pause();
          }
        } else {
          pauseOverlay.classList.remove("active");
          if (prev === "paused" && curr === "playing") {
            if (typeof this.modules.statsManager.resume === "function") {
              this.modules.statsManager.resume();
            }
          }
        }
      }

      // ログ削減: console.log("[matchStatusChanged] ========== EVENT HANDLED ==========");
    };

    window.addEventListener("matchStatusChanged", handler);

    // ログ削減: console.log("[connectMatchStatusListener] Event listener registered successfully");
  }
  
  /**
   * 【接続6】弾薬変更 → サーバー同期
   */
  connectWeaponToSync() {
    try {
      // AmmoManager に .on() メソッドがあるか確認
      if (typeof this.modules.ammoManager?.on === "function") {
        this.modules.ammoManager.on("ammoChanged", (ammoData) => {
          this.modules.serverSync.sendAmmo({
            weaponId: 1,
            current: ammoData.current || 0,
            reserve: ammoData.reserve || 0,
          });
        });
        logger.system("弾薬同期イベント接続完了");
      } else {
        logger.warn(
          "⚠️ AmmoManager.on() が実装されていません - 弾薬同期は無効です",
        );
      }
    } catch (error) {
      logger.error("弾薬同期接続エラー: " + error.message);
    }
  }

  /**
   * 勝敗判定処理
   * @private
   */
  async determineMatchResult() {
    if (this.hasResultDetermined) {
      logger.info("Match result already determined");
      return;
    }

    this.hasResultDetermined = true;

    try {
      logger.system("📊 Determining match result...");

      const matchData = await this.modules.serverSync.fetchMatchResult();

      const winnerId = matchData.winner_player_id;
      const playerId = this.modules.serverSync.getPlayerId();

      let result;
      if (winnerId === null) {
        result = "DRAW";
        logger.info("🤝 Match result: DRAW");
      } else if (winnerId === playerId) {
        result = "WIN";
        this.modules.statsManager.addKill();
        logger.success("🏆 Match result: WIN");
      } else {
        result = "LOSE";
        logger.warn("💀 Match result: LOSE");
      }

      const finalStats = this.modules.statsManager.getStats();
      await this.modules.serverSync.sendStats(finalStats);

      const recordSuccess = this.modules.statsManager.recordResult({
        result: result,
        playerId: playerId,
        winnerId: winnerId,
      });

      if (recordSuccess) {
        logger.success("勝敗結果を記録しました");
      } else {
        logger.error("勝敗結果の記録に失敗しました");
      }

      // リザルト画面表示
      if (!this.hasResultShown) {
        await this.showResultScreen();
      }
    } catch (error) {
      logger.error("勝敗判定エラー: " + error.message);
      console.error("[determineMatchResult] Error:", error);

      this.modules.statsManager.recordResult({
        result: "DRAW",
        playerId: this.modules.serverSync.getPlayerId(),
        winnerId: null,
      });

      await this.showResultScreen();
    }
  }

  /**
   * リザルト画面表示処理
   * @private
   */
  async showResultScreen() {
    if (this.hasResultShown) {
      logger.info("Result screen already shown");
      return;
    }

    this.hasResultShown = true;

    try {
      logger.system("🎬 Showing result screen...");

      const result = this.modules.statsManager.getResult() || "DRAW";
      const stats = this.modules.statsManager.getStats();
      const playerHP = this.modules.healthManager.getAllHP();
      const playerAmmo = {
        current: this.modules.ammoManager?.getCurrentAmmo() || 0,
        reserve: this.modules.ammoManager?.getReserveAmmo() || 0,
      };

      let allPlayers = [];
      try {
        allPlayers = await this.modules.serverSync.fetchAllPlayers();
      } catch (error) {
        console.error("[showResultScreen] Failed to fetch players:", error);
      }

      const playerId = this.modules.serverSync.getPlayerId();
      const opponents = allPlayers.filter((p) => p.id !== playerId);

      this.modules.uiEnd.showResult({
        result: result,
        playerHP: playerHP,
        playerAmmo: playerAmmo,
        stats: stats,
        allPlayers: allPlayers,
        opponents: opponents,
      });

      logger.success("リザルト画面を表示しました");
    } catch (error) {
      logger.error("リザルト画面表示エラー: " + error.message);
      console.error("[showResultScreen] Error:", error);

      this.modules.uiEnd.showResult({
        result: this.modules.statsManager.getResult() || "DRAW",
        playerHP: this.modules.healthManager.getAllHP(),
        playerAmmo: { current: 0, reserve: 0 },
        stats: this.modules.statsManager.getStats(),
        allPlayers: [],
        opponents: [],
      });
    }
  }

  /**
   * リマッチ準備リセット処理
   * match.status が finished → waiting に戻ったときに呼び出される
   * @private
   */
  async resetForRematch() {
    try {
      logger.system("🔄 Resetting for rematch...");

      // ==========================================
      // 【1】フラグリセット
      // ==========================================
      this.hasGameEnded = false;
      this.hasResultDetermined = false;
      this.hasResultShown = false;

      // ==========================================
      // 【2】ゲーム状態リセット
      // ==========================================

      // gameState リセット
      if (this.modules.gameState?.reset) {
        this.modules.gameState.reset("リマッチ準備");
      }

      // healthManager リセット
      if (this.modules.healthManager?.reset) {
        this.modules.healthManager.reset();
      }

      // ammoManager リセット
      if (this.modules.ammoManager?.reset) {
        this.modules.ammoManager.reset();
      }

      // ==========================================
      // 【3】統計リセット
      // ==========================================
      if (this.modules.statsManager?.reset) {
        this.modules.statsManager.reset();
      }

      // ==========================================
      // 【4】UI リセット
      // ==========================================

      // uiEnd を非表示
      if (this.modules.uiEnd?.hide) {
        this.modules.uiEnd.hide();
      }

      // uiHealth リセット（UI表示更新）
      if (this.modules.uiHealth?.update) {
        const resetHP = this.modules.healthManager?.getAllHP() || {
          head: 100,
          torso: 100,
          rightArm: 100,
          leftArm: 100,
          rightLeg: 100,
          leftLeg: 100,
        };
        this.modules.uiHealth.update(resetHP);
      }

      // uiAmmo リセット（UI表示更新）
      if (this.modules.uiAmmo?.update) {
        const resetAmmo = {
          current: this.modules.ammoManager?.getCurrentAmmo() || 30,
          reserve: this.modules.ammoManager?.getReserveAmmo() || 5,
        };
        this.modules.uiAmmo.update(resetAmmo);
      }

      // uiStats 停止
      if (this.modules.uiStats?.stop) {
        this.modules.uiStats.stop();
      }

      // ==========================================
      // 【5】通信フラグリセット
      // ==========================================

      // DOWN フラグリセット
      if (this.modules.serverSync?.resetDownFlag) {
        this.modules.serverSync.resetDownFlag();
      }

      // READY フラグリセット（使用しないが後方互換性のため残す）
      if (this.modules.serverSync?.resetReadyFlag) {
        this.modules.serverSync.resetReadyFlag();
      }

      logger.success("✅ Rematch reset completed");

      // ==========================================
      // 【6】Bluetooth接続確認と自動遷移（IDLE → READY）
      // ==========================================

      // 少し待ってから送信（リセット完了を確実にする）
      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.system("📡 Re-checking Bluetooth connection for Rematch...");

      // 単純にDBだけを更新するとローカルが 'IDLE' のままになるため、
      // 接続状況を確認し、繋がっていれば 'READY' へ移行させる
      this.checkConnectionAndTransition();
    } catch (error) {
      logger.error("リマッチリセットエラー: " + error.message);
      console.error("[resetForRematch] Error:", error);
    }
  }

  /**
   * 戦績の定期送信を開始
   * @private
   */
  startStatsSyncInterval() {
    if (this.statsSyncInterval) {
      clearInterval(this.statsSyncInterval);
    }

    console.log("[linkon-main] Starting stats sync interval...");

    this.statsSyncInterval = setInterval(() => {
      const currentState = this.modules.gameState.getState();

      // PLAYING または DOWN 状態の時のみ送信
      if (
        currentState === GAME_STATES.PLAYING ||
        currentState === GAME_STATES.DOWN
      ) {
        const stats = this.modules.statsManager.getStats();

        this.modules.serverSync
          .sendStats(stats)
          .then((result) => {
            if (result.success) {
              console.log("[linkon-main] Stats sent successfully");
            }
          })
          .catch((error) => {
            console.error("[linkon-main] Stats send error:", error);
          });
      }
    }, 3000); // 3秒ごと
  }

  /**
   * 戦績の定期送信を停止
   * @private
   */
  stopStatsSyncInterval() {
    if (this.statsSyncInterval) {
      clearInterval(this.statsSyncInterval);
      this.statsSyncInterval = null;
      console.log("[linkon-main] Stats sync interval stopped");
    }
  }

  /**
   * 接続監視開始
   * @private
   */
  startConnectionWatch() {
    if (this.connectionWatchInterval) {
      logger.info("Connection watch already running");
      return;
    }

    logger.system("🔍 Starting connection watch...");

    const CHECK_INTERVAL = 2000;
    const TIMEOUT_THRESHOLD = 6; // 修正：10秒 → 6秒

    this.connectionWatchInterval = setInterval(() => {
      try {
        const timeSinceLastComm =
          this.modules.serverSync.getTimeSinceLastCommunication();

        if (timeSinceLastComm >= TIMEOUT_THRESHOLD) {
          if (!this.isConnectionWarningShown) {
            logger.warn(
              `⚠️ 接続が不安定です（最終通信: ${timeSinceLastComm}秒前）`,
            );

            if (this.modules.uiConnection?.showWarning) {
              this.modules.uiConnection.showWarning("接続が不安定です");
            }

            this.isConnectionWarningShown = true;
          }
        } else {
          if (this.isConnectionWarningShown) {
            logger.success("✅ 接続が復帰しました");

            if (this.modules.uiConnection?.hideWarning) {
              this.modules.uiConnection.hideWarning();
            }

            this.isConnectionWarningShown = false;
          }
        }
      } catch (error) {
        console.error("[startConnectionWatch] Error:", error);
      }
    }, CHECK_INTERVAL);

    logger.success("Connection watch started");
  }

  /**
   * 接続監視停止
   * @private
   */
  stopConnectionWatch() {
    if (this.connectionWatchInterval) {
      clearInterval(this.connectionWatchInterval);
      this.connectionWatchInterval = null;
      logger.system("Connection watch stopped");
    }
  }

  /**
   * 全ゲームデータをリセット
   * READY → PLAYING 遷移時のみ呼び出される
   * @private
   */
  resetGameData() {
    logger.info("🔄 ゲームデータリセット開始");

    // 戦績データ
    this.modules.statsManager.reset();

    // HP（全部位）
    this.modules.healthManager.reset();

    // ==========================================
    // 追加：リセット後のHP確認
    // ==========================================
    const resetHP = this.modules.healthManager.getAllHP();
    console.log("[resetGameData] HP after reset:", resetHP);

    // 四肢破壊状態
    this.modules.damageDistributor.resetLimbDestruction();

    // 弾数
    if (this.modules.ammoManager) {
      this.modules.ammoManager.reset();
    }

    // タイマー停止（uiStats は start() で自動再開される）
    this.modules.uiStats.stop();

    logger.success("✅ ゲームデータリセット完了");
  }

  /**
   * 接続確認と状態遷移
   * IDLE 遷移時に呼び出され、正しい遷移フロー（IDLE → CONNECTING → READY）を経由する
   * @private
   */
  checkConnectionAndTransition() {
    const currentState = gameState.getState();

    // IDLE 以外では実行しない
    if (currentState !== GAME_STATES.IDLE) {
      return;
    }

    logger.info("🔍 Bluetooth接続確認中...");

    // ==========================================
    // ステップ1: まず CONNECTING に遷移
    // IDLE → CONNECTING の正しいフローを踏む
    // ==========================================
    const transitionResult = gameState.connect("接続確認開始");

    if (!transitionResult) {
      logger.error("❌ CONNECTING への遷移に失敗しました");
      return;
    }

    // ==========================================
    // ステップ2: 少し待ってから接続状態を確認
    // CONNECTING 状態を確実に経由するための待機時間
    // ==========================================
    setTimeout(() => {
      const isBothConnected = bluetoothManager.isBothConnected();

      if (isBothConnected) {
        // 接続済み → READY に遷移
        logger.success("✅ Bluetooth接続済み - READY へ遷移");
        gameState.ready("接続確認完了");

        // ==========================================
        // 追加：接続状態をDBに送信
        // ==========================================
        this.updateBluetoothStatusToDB();
      } else {
        // 未接続 → IDLE に戻る
        logger.info("ℹ️ Bluetooth未接続 - 接続してください");
        gameState.cancelConnection("未接続のため IDLE に戻る");
      }
    }, 100);
  }

  // ==========================================
  // UIイベントリスナー登録
  // ==========================================

  bindUIEvents() {
    this.bindCoreButtons();
  }

  bindCoreButtons() {
    const handlers = {
      connectButton: () => this.handleConnect(),
      "start-button": () => this.handleStartGame(),
      "end-button": () => this.handleEndGame(),
      fullReset: () => this.handleFullReset(),
      btReconnectBtn: () => this.handleReconnect(),
    };

    this.registerButtons(handlers);
  }

  registerButtons(handlers) {
    Object.entries(handlers).forEach(([id, handler]) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener("click", (e) => {
          console.log(`[linkon-main] Button clicked: ${id}`);
          handler(e);
        });
        console.log(`[linkon-main] ✅ Bound event listener to #${id}`);
      } else {
        console.warn(`[linkon-main] ⚠️ Button not found: #${id}`);
      }
    });
  }

  // ==========================================
  // コア機能ハンドラー
  // ==========================================

  async handleConnect() {
    logger.info("Bluetooth接続開始...");

    const result = await bluetoothManager.connect();

    if (!result) {
      logger.error("接続失敗");
      return;
    }

    logger.success(`${result.deviceType} 接続完了`);
  }

  async handleReconnect() {
    console.log("[linkon-main] 🔄 再接続ボタンがクリックされました！");
    logger.info("Bluetooth再接続開始...");

    if (typeof bluetoothManager.reconnect === "function") {
      try {
        const result = await bluetoothManager.reconnect();
        if (result) {
          console.log("[linkon-main] ✅ 再接続成功！");
          logger.success("再接続完了");
        } else {
          console.log("[linkon-main] ❌ 再接続失敗。");
          logger.error("再接続失敗");
        }
      } catch (e) {
        console.error("[linkon-main] ❌ 再接続中にエラー:", e);
      }
    } else {
      console.warn("[linkon-main] reconnectメソッドが実装されていません");
      logger.warn("reconnectメソッドが実装されていません");
    }
  }

  handleHealthReset() {
    healthManager.reset();
    this.modules.damageDistributor.resetLimbDestruction();
    logger.success("体力リセット完了");
  }

  handleAmmoReset() {
    if (!this.modules.ammoManager) {
      logger.error("AmmoManager が初期化されていません");
      return;
    }
    this.modules.ammoManager.reset();
    logger.success("弾数リセット完了");
  }

  handleStartGame() {
    if (!bluetoothManager.isBothConnected()) {
      alert("銃と防具の両方を接続してください");
      logger.warn("デバイス未接続");
      return;
    }

    gameState.startGame("ユーザーがゲーム開始");
  }

  handleEndGame() {
    gameState.endGame("ユーザーがゲーム終了");
  }

  handleFullReset() {
    logger.info("🔄 手動リセット実行");
    this.resetGameData();
    logger.success("完全リセット完了");
  }

  // ==========================================
  // Developer Mode 初期化
  // ==========================================

  initDeveloper() {
    if (window.location.hostname === "production-domain.com") {
      return;
    }

    initDeveloperMode({
      gameState: this.modules.gameState,
      bluetoothManager: this.modules.bluetoothManager,
      healthManager: this.modules.healthManager,
      damageDistributor: this.modules.damageDistributor,
      ammoManager: this.modules.ammoManager,
      logger: this.modules.logger,
    });

    logger.system("Developer Mode 初期化完了");
  }

  // ==========================================
  // デバッグ
  // ==========================================

  debugAll() {
    console.log("=== LinkON App 状態 ===");
    console.log("初期化:", this.initialized);

    gameState.debugLog?.();
    healthManager.debugLog?.();
    this.modules.uiHealth?.debugLog?.();
    this.modules.ammoManager?.debugLog?.();
    logger.debugLog?.();
  }
}

// ==========================================
// アプリケーション起動
// ==========================================

document.addEventListener("DOMContentLoaded", async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    const app = new LinkONApp();
    await app.init();

    window.linkONApp = app;
    window.debugGame = () => app.debugAll();
  } catch (error) {
    console.error("❌ 起動エラー:", error);
    alert("ゲームの起動に失敗しました。ページを再読み込みしてください。");
  }
});
