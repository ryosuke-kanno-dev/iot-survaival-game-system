// ==========================================
// server-sync.js - サーバー同期モジュール（完全版・修正済み）
// ==========================================
import { SERVER_SYNC_CONFIG } from "./constants.js";

const ServerSync = (() => {
  // ==========================================
  // 内部状態
  // ==========================================
  const API_BASE = "/battle_arena/api/";

  let playerId = null;
  let playerVersion = 0;
  let matchId = 1;
  let matchStatus = null;
  let previousMatchStatus = null;
  let myPlayerData = null;
  let pollingInterval = null;
  let isPolling = false;
  let isFetching = false;
  let hasSentReady = false;
  let isDeadSent = false;
  let lastSuccessfulCommunication = Date.now();
  let currentDownRule = null;

  // HP送信用タイマー
  let hpSendTimer = null;

  // 弾薬送信用タイマー
  let ammoSendTimer = null;

  // ==========================================
  // ヘルパー関数
  // ==========================================
  function calculateTotalHP(hpData) {
    return (
      (hpData.head || 0) +
      (hpData.torso || 0) +
      (hpData.rightArm || 0) +
      (hpData.leftArm || 0) +
      (hpData.rightLeg || 0) +
      (hpData.leftLeg || 0)
    );
  }

  // ==========================================
  // API共通関数
  // ==========================================
  async function apiRequest(endpoint, options = {}) {
    const url = API_BASE + endpoint;

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("[ServerSync] Non-JSON response:", text);
        throw new Error("サーバーからJSONが返されませんでした");
      }

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(data.message || "APIエラーが発生しました");
      }

      // ==========================================
      // 追加：通信成功時刻の更新を確認
      // ==========================================
      const oldTime = lastSuccessfulCommunication;
      lastSuccessfulCommunication = Date.now();

      return data;
    } catch (error) {
      console.error("[ServerSync] API Request Error:", error);
      throw error;
    }
  }

  // ==========================================
  // 自動フル終了状態管理
  // ==========================================
  let isAutoEndingMatch = false;

  async function triggerAutoMatchEnd() {
    if (isAutoEndingMatch || matchStatus !== "PLAYING") return;
    isAutoEndingMatch = true;

    try {
      console.log("[ServerSync] Auto ending match due to timeout. Calculating winner...");
      
      // 勝敗の算出
      const playersResult = await apiRequest(`get_players.php?match_id=${matchId}`);
      let winnerId = null;
      
      if (playersResult && playersResult.data) {
        const alivePlayers = playersResult.data.filter((p) => p.player_state !== "DOWN");
        
        if (alivePlayers.length > 0) {
          const maxHp = Math.max(...alivePlayers.map(p => p.hp_total));
          const topPlayers = alivePlayers.filter(p => p.hp_total === maxHp);
          
          if (topPlayers.length === 1) {
            winnerId = topPlayers[0].id; // 同値でなければ体力が最大のプレイヤーが勝利
          }
          // 同値が複数いれば winnerId = null のままで引き分け
        }
      }

      await apiRequest("update_match.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          status: "FINISHED",
          winner_player_id: winnerId
        }),
      });
      console.log(`[ServerSync] Auto ended match. Winner ID: ${winnerId}`);
    } catch (e) {
      console.error("[ServerSync] Failed to auto end match:", e);
    }
  }

  // ==========================================
  // データ取得
  // ==========================================
  async function fetchMatchData() {
    try {
      const result = await apiRequest(`get_match.php?match_id=${matchId}`);

      if (result && result.data) {
        currentDownRule = result.data.down_rule || "TOTAL_HP_ZERO";

        const newMatchStatus = result.data.status;

        if (newMatchStatus !== matchStatus) {
          console.log(
            `[ServerSync] Match status changed: ${matchStatus} → ${newMatchStatus}`,
          );

          previousMatchStatus = matchStatus;
          matchStatus = newMatchStatus;

          const event = new CustomEvent("matchStatusChanged", {
            detail: {
              previousStatus: previousMatchStatus,
              currentStatus: matchStatus,
            },
          });
          window.dispatchEvent(event);
        } else {
          matchStatus = newMatchStatus;
        }

        // ==========================================
        // ==========================================
        // タイマー同期ロジック
        // ==========================================
        const uiStats = window.linkONApp?.modules?.uiStats;
        const hasUiStats = uiStats && typeof uiStats.setRemainingTime === "function" && typeof uiStats.getRemainingTime === "function";

        if (matchStatus === "PLAYING" && result.data.start_time && result.data.duration) {
          const st = result.data.start_time.replace(/-/g, "/");
          const startTime = new Date(st).getTime();
          const elapsedSec = (Date.now() - startTime) / 1000;
          const pausedSec = result.data.paused_elapsed_time ? parseInt(result.data.paused_elapsed_time, 10) : 0;
          const remainingFloat = Math.max(0, result.data.duration - pausedSec - elapsedSec);
          const remainingInt = Math.floor(remainingFloat);

          if (hasUiStats) {
            // PAUSEから復帰した場合の再開処理
            if (previousMatchStatus === "PAUSED") {
              uiStats.start();
            }

            const currentRemaining = uiStats.getRemainingTime() || 0;
            // しきい値以上のズレがある場合のみ補正
            if (Math.abs(currentRemaining - remainingFloat) >= SERVER_SYNC_CONFIG.TIMER_CORRECTION_THRESHOLD_SEC) {
                uiStats.setRemainingTime(remainingInt);
            }
          }

          if (remainingFloat <= 0 && !isAutoEndingMatch) {
             triggerAutoMatchEnd();
          }

        } else if (matchStatus === "PAUSED" && result.data.duration) {
          const pausedSec = result.data.paused_elapsed_time ? parseInt(result.data.paused_elapsed_time, 10) : 0;
          const remainingInt = Math.max(0, result.data.duration - pausedSec);

          if (hasUiStats) {
            uiStats.setRemainingTime(remainingInt);
            uiStats.stop();
          }
          isAutoEndingMatch = false;

        } else if (matchStatus === "WAITING") {
          isAutoEndingMatch = false;
        }
      }

      return result.data;
    } catch (error) {
      console.error("[ServerSync] Failed to fetch match data:", error);
      return null;
    }
  }

  /**
   * 現在のダウンルールを取得
   * @returns {string} ダウンルール名
   */
  function getDownRule() {
    return currentDownRule || "TOTAL_HP_ZERO";
  }

  async function fetchMyPlayerData() {
    if (!playerId) {
      console.error("[ServerSync] Cannot fetch player data: playerId not set");
      return null;
    }

    try {
      const result = await apiRequest(`get_players.php?match_id=${matchId}`);

      if (!result || !result.data) {
        console.error("[ServerSync] Invalid response:", result);
        throw new Error("Invalid response format");
      }

      const players = result.data;

      const myData = players.find((p) => p.id === playerId);

      if (!myData) {
        console.error("[ServerSync] Player not found in:", players);
        throw new Error("Player not found");
      }

      playerVersion = myData.version;
      myPlayerData = myData;

      const gameState = window.linkONApp?.modules?.gameState;

      if (gameState && myData.player_state === "DOWN") {
        if (gameState.getState() === "PLAYING") {
          console.warn(
            "[ServerSync] Server says player is DOWN, updating local state",
          );
          gameState.down("Server validation");
        }
      }

      const hpData = {
        headHp: { current: myData.hp_head },
        torsoHp: { current: myData.hp_torso },
        rightarmHp: { current: myData.hp_right_arm },
        leftarmHp: { current: myData.hp_left_arm },
        rightlegHp: { current: myData.hp_right_leg },
        leftlegHp: { current: myData.hp_left_leg },
      };

      const healthManager = window.linkONApp?.modules?.healthManager;
      if (healthManager && typeof healthManager.syncFromServer === "function") {
        healthManager.syncFromServer(hpData);
      } else {
        const uiHealth = window.linkONApp?.modules?.uiHealth;
        if (uiHealth && typeof uiHealth.update === "function") {
          uiHealth.update(hpData);
        }
      }

      return myData;
    } catch (error) {
      console.error("[ServerSync] Failed to fetch player data:", error);
      return null;
    }
  }

  // ==========================================
  // ポーリング処理
  // ==========================================

  async function poll() {
    const pollStartTime = Date.now();

    if (isFetching) {
      // ログ削減: console.log("[ServerSync] Poll skipped (already fetching)");
      return;
    }

    isFetching = true;

    try {
      await fetchMyPlayerData();
      await fetchMatchData();
      const pollDuration = Date.now() - pollStartTime;

    } catch (error) {
      console.error("[ServerSync] Poll error:", error);
    } finally {
      isFetching = false;
    }
  }

  function startPolling() {
    if (isPolling) {
      console.warn("[ServerSync] Polling already started");
      return;
    }
    // ログ削減: console.log(`[ServerSync] Polling started (${POLLING_INTERVAL / 1000}sec interval)`);
    isPolling = true;
    poll();
    pollingInterval = setInterval(() => {
      poll();
    }, SERVER_SYNC_CONFIG.POLLING_INTERVAL);
  }

  function stopPolling() {
    if (!isPolling) return;
    // ログ削減: console.log("[ServerSync] Polling stopped");
    isPolling = false;
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  }

  // ==========================================
  // READY送信
  // ==========================================

  async function sendReady() {
    if (hasSentReady) {
      console.log("[ServerSync] READY already sent");
      return { success: false, reason: "already_sent" };
    }

    if (matchStatus?.toLowerCase() !== "waiting") {
      console.warn(
        "[ServerSync] Cannot send READY: match status is not waiting",
      );
      return { success: false, reason: "invalid_status" };
    }

    if (!playerId) {
      console.error("[ServerSync] Cannot send READY: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    try {
      console.log("[ServerSync] Sending READY...");

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          player_state: "READY",
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      hasSentReady = true;

      return { success: true, new_version: result.new_version };
    } catch (error) {
      console.error("[ServerSync] Failed to send READY:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // HP送信（デバウンス版）
  // ==========================================

  function sendHP(hpData) {
    clearTimeout(hpSendTimer);
    hpSendTimer = setTimeout(() => {
      actualSendHP(hpData);
      hpSendTimer = null;
    }, SERVER_SYNC_CONFIG.HP_SEND_DEBOUNCE);
  }

  async function actualSendHP(hpData) {
    if (matchStatus?.toLowerCase() !== "playing") {
      console.warn("[ServerSync] Cannot send HP: match status is not playing");
      return { success: false, reason: "invalid_status" };
    }

    if (!playerId) {
      console.error("[ServerSync] Cannot send HP: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    if (!hpData) {
      console.error("[ServerSync] Cannot send HP: hpData is null");
      return { success: false, reason: "no_data" };
    }

    try {
      console.log("[ServerSync] Sending HP...", hpData);

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          hp_head: hpData.head,
          hp_torso: hpData.torso,
          hp_right_arm: hpData.rightArm,
          hp_left_arm: hpData.leftArm,
          hp_right_leg: hpData.rightLeg,
          hp_left_leg: hpData.leftLeg,
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      return { success: true, new_version: result.new_version };
    } catch (error) {
      console.error("[ServerSync] Failed to send HP:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // DOWN送信
  // ==========================================

  async function sendDown() {
    if (isDeadSent) {
      console.log("[ServerSync] DOWN already sent");
      return { success: false, reason: "already_sent" };
    }

    if (matchStatus?.toLowerCase() !== "playing") {
      console.warn(
        "[ServerSync] Cannot send DOWN: match status is not playing",
      );
      return { success: false, reason: "invalid_status" };
    }

    if (!playerId) {
      console.error("[ServerSync] Cannot send DOWN: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    try {
      console.log("[ServerSync] Sending DOWN...");

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          player_state: "DOWN",
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      isDeadSent = true;

      return { success: true, new_version: result.new_version };
    } catch (error) {
      console.error("[ServerSync] Failed to send DOWN:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // ダメージ送信（自動リトライ付きキューイング）
  // ==========================================

  const damageRetryQueue = [];

  function generateRequestId() {
    return 'REQ_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  async function processDamageResult(result) {
    if (result.new_version !== undefined) {
      playerVersion = result.new_version;
    }

    if (result.status === "already_processed") {
       console.log("[ServerSync] Damage already processed by server.");
       return { success: true, reason: "already_processed" };
    }

    if (result.success) {
      // 成功時、サーバーがDOWNと判定した場合はローカル状態を修正
      if (result.is_down && result.player_state === "DOWN") {
        console.warn("[ServerSync] Server determined DOWN state");
        const gameState = window.linkONApp?.modules?.gameState;
        if (gameState && gameState.getState() !== "DOWN") {
          gameState.down("Server validation");
        }
      }
      return {
        success: true,
        newHP: result.new_hp,
        totalHP: result.total_hp,
        isDown: result.is_down,
        playerState: result.player_state,
      };
    }
    return { success: false, reason: "api_failed", result };
  }

  async function sendDamageWithRetry(damageData) {
    if (!playerId) {
      console.error("[ServerSync] Cannot send damage: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    const requestId = generateRequestId();
    damageData.damage_request_id = requestId;
    
    // 即時送信用ペイロード
    const payload = {
      player_id: playerId,
      body_part: damageData.bodyPart,
      damage_amount: damageData.damageAmount,
      damage_request_id: requestId,
      version: 0,
    };

    try {
      const result = await apiRequest("apply_damage.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      return processDamageResult(result);
    } catch (error) {
      console.error("[ServerSync] Initial damage send failed, queueing for retry.", error);
      queueDamageRetry(payload);
      return { success: false, reason: "queued" };
    }
  }

  function queueDamageRetry(payload) {
    if (damageRetryQueue.length >= SERVER_SYNC_CONFIG.MAX_DAMAGE_RETRY_QUEUE) {
      console.warn(`[ServerSync] Damage retry queue is full (${SERVER_SYNC_CONFIG.MAX_DAMAGE_RETRY_QUEUE} items). Discarding oldest.`);
      damageRetryQueue.shift();
    }

    const retryItem = {
      payload,
      retryCount: 0,
    };
    
    damageRetryQueue.push(retryItem);
    
    // 最初のインターバル後に1回目のリトライ
    setTimeout(() => executeDamageRetry(retryItem), SERVER_SYNC_CONFIG.DAMAGE_RETRY_INTERVAL_1_MS);
  }

  async function executeDamageRetry(retryItem) {
    if (!damageRetryQueue.includes(retryItem)) return; // 既に成功・破棄されていれば中断

    retryItem.retryCount++;

    try {
      const result = await apiRequest("apply_damage.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(retryItem.payload),
      });
      
      // 成功したのでキューから削除
      const index = damageRetryQueue.indexOf(retryItem);
      if (index !== -1) damageRetryQueue.splice(index, 1);
      
      // Local state sync if needed (prevent duplicate down triggering etc. which processDamageResult handles safely)
      processDamageResult(result);
    } catch (error) {
      console.warn(`[ServerSync] Retry ${retryItem.retryCount} failed.`, error);
      
      if (retryItem.retryCount === 1) {
        // 次のインターバル後に2回目のリトライ
        setTimeout(() => executeDamageRetry(retryItem), SERVER_SYNC_CONFIG.DAMAGE_RETRY_INTERVAL_2_MS);
      } else {
        // 2回失敗で完全破棄
        console.error(`[ServerSync] Failed to apply damage after 2 retries (req_id: ${retryItem.payload.damage_request_id}). Discarding.`);
        const index = damageRetryQueue.indexOf(retryItem);
        if (index !== -1) damageRetryQueue.splice(index, 1);
      }
    }
  }

  // ==========================================
  // 弾薬送信（デバウンス版）
  // ==========================================

  function sendAmmo(ammoData) {
    clearTimeout(ammoSendTimer);
    ammoSendTimer = setTimeout(() => {
      actualSendAmmo(ammoData);
      ammoSendTimer = null;
    }, SERVER_SYNC_CONFIG.AMMO_SEND_DEBOUNCE);
  }

  async function actualSendAmmo(ammoData) {
    if (matchStatus?.toLowerCase() !== "playing") {
      console.warn(
        "[ServerSync] Cannot send Ammo: match status is not playing",
      );
      return { success: false, reason: "invalid_status" };
    }

    if (!playerId) {
      console.error("[ServerSync] Cannot send Ammo: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    if (!ammoData) {
      console.error("[ServerSync] Cannot send Ammo: ammoData is null");
      return { success: false, reason: "no_data" };
    }

    if (
      typeof ammoData.current !== "number" ||
      typeof ammoData.reserve !== "number"
    ) {
      console.error("[ServerSync] Invalid ammo data type");
      return { success: false, reason: "invalid_data" };
    }

    if (
      ammoData.current < 0 ||
      ammoData.current > 30 ||
      ammoData.reserve < 0 ||
      ammoData.reserve > 5
    ) {
      console.error("[ServerSync] Ammo data out of range", ammoData);
      return { success: false, reason: "out_of_range" };
    }

    try {
      console.log("[ServerSync] Sending Ammo...", ammoData);

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          ammo_current: ammoData.current,
          ammo_reserve: ammoData.reserve,
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      return { success: true, new_version: result.new_version };
    } catch (error) {
      console.error("[ServerSync] Failed to send Ammo:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // 戦績送信
  // ==========================================

  async function sendStats(statsData) {
    if (!playerId) {
      console.error("[ServerSync] Cannot send Stats: playerId not set");
      return { success: false, reason: "no_player_id" };
    }

    if (!statsData) {
      console.error("[ServerSync] Cannot send Stats: statsData is null");
      return { success: false, reason: "no_data" };
    }

    try {
      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          kills: statsData.killCount || 0,
          hits: statsData.hitCount || 0,
          damage_taken: statsData.damageTaken || 0,
          play_time: statsData.playTime || 0,
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      return { success: true, new_version: result.new_version };
    } catch (error) {
      console.error("[ServerSync] Failed to send Stats:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // Bluetooth接続状態送信
  // ==========================================

  async function sendBluetoothStatus(connectionStatus) {
    if (!playerId) {
      console.error(
        "[ServerSync] Cannot send Bluetooth status: playerId not set",
      );
      return { success: false, reason: "no_player_id" };
    }

    if (!connectionStatus) {
      console.error(
        "[ServerSync] Cannot send Bluetooth status: connectionStatus is null",
      );
      return { success: false, reason: "no_data" };
    }

    try {
      const isBothConnected = connectionStatus.gun && connectionStatus.armor;

      console.log("[ServerSync] Sending Bluetooth status...", {
        gun: connectionStatus.gun,
        armor: connectionStatus.armor,
        ready: isBothConnected,
      });

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          bluetooth_gun_connected: connectionStatus.gun ? 1 : 0,
          bluetooth_armor_connected: connectionStatus.armor ? 1 : 0,
          ready: isBothConnected ? 1 : 0,
          version: 0,
        }),
      });

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }

      return {
        success: true,
        new_version: result.new_version,
        ready: isBothConnected,
      };
    } catch (error) {
      console.error("[ServerSync] Failed to send Bluetooth status:", error);
      return { success: false, reason: "api_error", error };
    }
  }

  // ==========================================
  // フラグリセット
  // ==========================================

  function resetDownFlag() {
    console.log("[ServerSync] Resetting DOWN flag");
    isDeadSent = false;
  }

  function resetReadyFlag() {
    console.log("[ServerSync] Resetting READY flag");
    hasSentReady = false;
  }

  // ==========================================
  // 初期化
  // ==========================================

  /**
   * ServerSync を初期化
   * @param {number} playerIdParam - プレイヤーID
   * @param {number} matchIdParam - 試合ID
   */
  async function init(playerIdParam, matchIdParam) {
    playerId = playerIdParam;
    matchId = matchIdParam;

    console.log(
      `[ServerSync] Initialized with playerId: ${playerId}, matchId: ${matchId}`,
    );

    try {
      await fetchMatchData();
      console.log("[ServerSync] Initial down_rule loaded:", currentDownRule);
      console.log("[ServerSync] Initial match status:", matchStatus);

      if (matchStatus?.toLowerCase() === "playing") {
        console.log(
          "[ServerSync] Match is already PLAYING, dispatching event...",
        );

        setTimeout(() => {
          const event = new CustomEvent("matchStatusChanged", {
            detail: {
              previousStatus: null,
              currentStatus: "playing",
            },
          });
          window.dispatchEvent(event);
          console.log(
            "[ServerSync] Initial matchStatusChanged event dispatched",
          );
        }, 500);
      }

      await fetchMyPlayerData();
    } catch (error) {
      console.error("[ServerSync] Failed to load initial data:", error);
      currentDownRule = "TOTAL_HP_ZERO";
    }

    await cleanupOnPageLoad();
  }

  async function cleanupOnPageLoad() {
    if (!playerId) {
      console.warn("[ServerSync] Cannot cleanup: playerId not set");
      return;
    }

    try {
      console.log("[ServerSync] Performing page load cleanup...");

      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: playerId,
          bluetooth_gun_connected: 0,
          bluetooth_armor_connected: 0,
          ready: 0,
          player_state: "IDLE",
          version: 0,
        }),
      });

      console.log("[ServerSync] Page load cleanup completed successfully");

      if (result.new_version !== undefined) {
        playerVersion = result.new_version;
      }
    } catch (error) {
      console.warn("[ServerSync] Cleanup failed (non-fatal):", error);
    }
  }

  // ==========================================
  // データ取得メソッド
  // ==========================================

  function getMatchData() {
    return {
      matchId: matchId,
      matchStatus: matchStatus,
    };
  }

  function getPlayerId() {
    return playerId;
  }

  async function fetchMatchResult() {
    try {
      const data = await apiRequest(`get_match.php?match_id=${matchId}`);
      return data.data;
    } catch (error) {
      console.error("[ServerSync] Failed to fetch match result:", error);
      throw error;
    }
  }

  async function fetchAllPlayers() {
    try {
      const data = await apiRequest(`get_players.php?match_id=${matchId}`);
      return data.data || [];
    } catch (error) {
      console.error("[ServerSync] Failed to fetch all players:", error);
      throw error;
    }
  }

  function getLastCommunicationTime() {
    return lastSuccessfulCommunication;
  }

  function getTimeSinceLastCommunication() {
    return Math.floor((Date.now() - lastSuccessfulCommunication) / 1000);
  }

  function getStatus() {
    return {
      playerId,
      playerVersion,
      matchId,
      matchStatus,
      isPolling,
      hasSentReady,
      isDeadSent,
      myPlayerData,
    };
  }

  // ==========================================
  // 公開API
  // ==========================================

  return {
    init,
    startPolling,
    stopPolling,
    sendReady,
    sendHP,
    sendDown,
    sendAmmo,
    sendBluetoothStatus,
    sendStats,
    sendDamageWithRetry,
    resetDownFlag,
    resetReadyFlag,
    calculateTotalHP,
    getMatchData,
    getPlayerId,
    fetchMatchResult,
    fetchAllPlayers,
    fetchMyPlayerData,
    getLastCommunicationTime,
    getTimeSinceLastCommunication,
    getStatus,
    getDownRule,
  };
})();

export { ServerSync };
export default ServerSync;
