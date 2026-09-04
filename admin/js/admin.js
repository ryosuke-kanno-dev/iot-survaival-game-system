// ==========================================
// admin.js - 管理画面（サーバー権威DOWN判定対応版）
// ==========================================

// ==========================================
// 定数定義
// ==========================================
const API_BASE = "/battle_arena/api/";
const MATCH_ID = 1;
let autoRefreshInterval = null;
let playersData = [];
let matchData = null;
let isCheckingGameEnd = false;
let isStartingMatch = false;
let isFetching = false;

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
      console.error("Non-JSON response:", text);
      throw new Error("サーバーからJSONが返されませんでした");
    }

    const data = await response.json();

    if (data.status === "error") {
      throw new Error(data.message || "APIエラーが発生しました");
    }

    return data;
  } catch (error) {
    console.error("API Request Error:", error);
    throw error;
  }
}

// ==========================================
// メッセージ表示
// ==========================================
function showMessage(message, type = "info") {
  const messageArea = document.getElementById("messageArea");
  const messageEl = document.createElement("div");
  messageEl.className = `message ${type}`;
  messageEl.textContent = message;

  messageArea.appendChild(messageEl);

  setTimeout(() => {
    messageEl.remove();
  }, 5000);
}

// ==========================================
// データ取得関数
// ==========================================
async function fetchMatchData() {
  try {
    const data = await apiRequest(`get_match.php?match_id=${MATCH_ID}`);
    matchData = data.data;
    updateMatchDisplay(matchData);
    return matchData;
  } catch (error) {
    showMessage("試合情報の取得に失敗: " + error.message, "error");
    return null;
  }
}

async function fetchPlayersData() {
  try {
    const data = await apiRequest(`get_players.php?match_id=${MATCH_ID}`);
    playersData = data.data || [];

    renderPlayers();
    updatePlayers();

    return playersData;
  } catch (error) {
    showMessage("プレイヤー情報の取得に失敗: " + error.message, "error");
    return null;
  }
}

async function fetchEventsData() {
  try {
    const data = await apiRequest(
      `get_events.php?match_id=${MATCH_ID}&limit=20`,
    );
    updateEventLog(data.events);
    return data.events;
  } catch (error) {
    console.error("イベントログ取得エラー:", error);
    return null;
  }
}

async function fetchAllData() {
  if (isFetching) return;
  isFetching = true;

  try {
    await fetchMatchData();
    await fetchPlayersData();
    await fetchEventsData();
    updateStartButtonState();
    await checkGameEnd();
  } finally {
    isFetching = false;
  }
}

// ==========================================
// プレイヤーUI動的生成（分割配置版）
// ==========================================
function renderPlayers() {
  const player1Container = document.getElementById("player1Container");
  const player2Container = document.getElementById("player2Container");

  if (!player1Container || !player2Container) {
    console.error("Player containers not found");
    return;
  }

  if (playersData.length === 0) {
    player1Container.innerHTML =
      '<p class="no-players">プレイヤーが登録されていません</p>';
    player2Container.innerHTML = "";
    return;
  }

  // Player 1 を生成
  if (playersData.length >= 1) {
    const player = playersData[0];
    const displayNum = 1;
    const prefix = `player${player.id}`;

    player1Container.innerHTML = generatePlayerPanel(
      player,
      displayNum,
      prefix,
    );
    updateHpColors(prefix, player);
  } else {
    player1Container.innerHTML = "";
  }

  // Player 2 を生成
  if (playersData.length >= 2) {
    const player = playersData[1];
    const displayNum = 2;
    const prefix = `player${player.id}`;

    player2Container.innerHTML = generatePlayerPanel(
      player,
      displayNum,
      prefix,
    );
    updateHpColors(prefix, player);
  } else {
    player2Container.innerHTML = "";
  }
}

// ==========================================
// プレイヤーパネル生成（READY対応版）
// ==========================================
function generatePlayerPanel(player, displayNum, prefix) {
  return `
        <div class="player-panel" data-player-id="${player.id}">
            <div class="player-header">
                <h2>👤 ${player.name || `Player ${displayNum}`}</h2>
                <span id="${prefix}State" class="player-state state-${player.player_state.toLowerCase()}">${player.player_state}</span>
                
                <span id="${prefix}Ready" class="ready-badge ${player.ready ? "ready-yes" : "ready-no"}">
                    ${player.ready ? "✅ READY" : "⏳ WAITING"}
                </span>
            </div>
            
            <div class="stat-group">
                <h4>🩹 体力</h4>
                <div class="hp-bars">
                    <div class="hp-bar">
                        <label>頭部</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpHead" style="width: ${player.hp_head}%"></div></div>
                        <span id="${prefix}HpHeadValue">${player.hp_head}</span>
                    </div>
                    <div class="hp-bar">
                        <label>胴体</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpTorso" style="width: ${player.hp_torso}%"></div></div>
                        <span id="${prefix}HpTorsoValue">${player.hp_torso}</span>
                    </div>
                    <div class="hp-bar">
                        <label>右腕</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpRightArm" style="width: ${player.hp_right_arm}%"></div></div>
                        <span id="${prefix}HpRightArmValue">${player.hp_right_arm}</span>
                    </div>
                    <div class="hp-bar">
                        <label>左腕</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpLeftArm" style="width: ${player.hp_left_arm}%"></div></div>
                        <span id="${prefix}HpLeftArmValue">${player.hp_left_arm}</span>
                    </div>
                    <div class="hp-bar">
                        <label>右足</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpRightLeg" style="width: ${player.hp_right_leg}%"></div></div>
                        <span id="${prefix}HpRightLegValue">${player.hp_right_leg}</span>
                    </div>
                    <div class="hp-bar">
                        <label>左足</label>
                        <div class="bar"><div class="bar-fill" id="${prefix}HpLeftLeg" style="width: ${player.hp_left_leg}%"></div></div>
                        <span id="${prefix}HpLeftLegValue">${player.hp_left_leg}</span>
                    </div>
                </div>
                <div class="hp-total">
                    合計HP: <strong id="${prefix}HpTotal">${player.hp_total}</strong> / 600
                </div>
            </div>

            <div class="stat-group">
                <h4>🔫 弾薬</h4>
                <div class="ammo-display">
                    <div class="ammo-current">マガジン: <strong id="${prefix}AmmoCurrent">${player.ammo_current}</strong></div>
                    <div class="ammo-reserve">予備: <strong id="${prefix}AmmoReserve">${player.ammo_reserve}</strong></div>
                </div>
            </div>

            <div class="stat-group">
                <h4>📊 戦績</h4>
                <div class="stats-grid">
                    <div class="stat-item">
                        <span class="stat-label">キル</span>
                        <span class="stat-value" id="${prefix}Kills">${player.kills}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">命中</span>
                        <span class="stat-value" id="${prefix}Hits">${player.hits}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">被弾</span>
                        <span class="stat-value" id="${prefix}Damage">${player.damage_taken}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">時間</span>
                        <span class="stat-value" id="${prefix}Time">${formatTime(player.play_time)}</span>
                    </div>
                </div>
            </div>

            <div class="stat-group">
                <h4>📡 接続状態</h4>
                <div class="connection-grid">
                    <div class="connection-item">
                        <span>🔫 GUN:</span>
                        <span id="${prefix}GunConnection" class="badge ${player.bluetooth_gun_connected ? "badge-success" : "badge-danger"}">
                            ${player.bluetooth_gun_connected ? "接続済" : "未接続"}
                        </span>
                    </div>
                    <div class="connection-item">
                        <span>🛡️ ARMOR:</span>
                        <span id="${prefix}ArmorConnection" class="badge ${player.bluetooth_armor_connected ? "badge-success" : "badge-danger"}">
                            ${player.bluetooth_armor_connected ? "接続済" : "未接続"}
                        </span>
                    </div>
                    
                    <div class="connection-item ready-status">
                        <span>🎮 READY:</span>
                        <span id="${prefix}ReadyStatus" class="badge ${player.ready ? "badge-success" : "badge-warning"}">
                            ${player.ready ? "準備完了" : "準備中"}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Admin個別操作ボタン -->
            <div class="stat-group admin-controls">
                <h4>🛠️ 個別操作</h4>
                <div class="button-group-small">
                    <button class="btn btn-sm btn-success admin-control-btn" onclick="handlePlayerControl('reset_hp', ${player.id}, ${player.match_id})" ${matchData && matchData.status === "PLAYING" ? "" : "disabled"}>HP全回復</button>
                    <button class="btn btn-sm btn-danger admin-control-btn" onclick="handlePlayerControl('force_down', ${player.id}, ${player.match_id})" ${matchData && matchData.status === "PLAYING" ? "" : "disabled"}>強制ダウン</button>
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// プレイヤー動的更新（ポーリング用）
// ==========================================
function updatePlayers() {
  if (!playersData || playersData.length === 0) {
    return;
  }

  let disconnectedPlayers = [];
  const isMatchActive = matchData && (matchData.status === "PLAYING");

  playersData.forEach((player) => {
    const prefix = `player${player.id}`;

    // READY状態の更新
    const readyBadge = document.getElementById(`${prefix}Ready`);
    if (readyBadge) {
      readyBadge.className = `ready-badge ${player.ready ? "ready-yes" : "ready-no"}`;
      readyBadge.textContent = player.ready ? "✅ READY" : "⏳ WAITING";
    }

    const readyStatus = document.getElementById(`${prefix}ReadyStatus`);
    if (readyStatus) {
      readyStatus.className = `badge ${player.ready ? "badge-success" : "badge-warning"}`;
      readyStatus.textContent = player.ready ? "準備完了" : "準備中";
    }

    // Bluetooth接続状態更新
    const gunConnection = document.getElementById(`${prefix}GunConnection`);
    if (gunConnection) {
      gunConnection.className = `badge ${player.bluetooth_gun_connected ? "badge-success" : "badge-danger"}`;
      gunConnection.textContent = player.bluetooth_gun_connected
        ? "接続済"
        : "未接続";
    }

    const armorConnection = document.getElementById(`${prefix}ArmorConnection`);
    if (armorConnection) {
      armorConnection.className = `badge ${player.bluetooth_armor_connected ? "badge-success" : "badge-danger"}`;
      armorConnection.textContent = player.bluetooth_armor_connected
        ? "接続済"
        : "未接続";
    }

    // HP更新
    const hpParts = [
      { key: "hp_head", suffix: "HpHead" },
      { key: "hp_torso", suffix: "HpTorso" },
      { key: "hp_right_arm", suffix: "HpRightArm" },
      { key: "hp_left_arm", suffix: "HpLeftArm" },
      { key: "hp_right_leg", suffix: "HpRightLeg" },
      { key: "hp_left_leg", suffix: "HpLeftLeg" },
    ];

    hpParts.forEach((part) => {
      const barEl = document.getElementById(`${prefix}${part.suffix}`);
      const valueEl = document.getElementById(`${prefix}${part.suffix}Value`);

      if (barEl) {
        barEl.style.width = `${player[part.key]}%`;
      }
      if (valueEl) {
        valueEl.textContent = player[part.key];
      }
    });

    const totalEl = document.getElementById(`${prefix}HpTotal`);
    if (totalEl) {
      totalEl.textContent = player.hp_total;
    }

    // 個別操作ボタンの状態更新
    const controlBtns = document.querySelectorAll(`#${prefix}Container .admin-control-btn`);
    controlBtns.forEach(btn => {
      btn.disabled = !isMatchActive;
    });

    // HP色更新
    updateHpColors(prefix, player);

    // 弾薬更新
    const ammoCurrentEl = document.getElementById(`${prefix}AmmoCurrent`);
    if (ammoCurrentEl) {
      ammoCurrentEl.textContent = player.ammo_current;
    }

    const ammoReserveEl = document.getElementById(`${prefix}AmmoReserve`);
    if (ammoReserveEl) {
      ammoReserveEl.textContent = player.ammo_reserve;
    }

    // 戦績更新
    const killsEl = document.getElementById(`${prefix}Kills`);
    if (killsEl) {
      killsEl.textContent = player.kills || 0;
    }

    const hitsEl = document.getElementById(`${prefix}Hits`);
    if (hitsEl) {
      hitsEl.textContent = player.hits || 0;
    }

    const damageEl = document.getElementById(`${prefix}Damage`);
    if (damageEl) {
      damageEl.textContent = player.damage_taken || 0;
    }

    const timeEl = document.getElementById(`${prefix}Time`);
    if (timeEl) {
      timeEl.textContent = formatTime(player.play_time);
    }

    // ==========================================
    // プレイヤー状態更新（サーバー権威）
    // ==========================================
    const stateEl = document.getElementById(`${prefix}State`);
    if (stateEl) {
      // サーバーが設定したplayer_stateをそのまま表示
      stateEl.className = `player-state state-${player.player_state.toLowerCase()}`;
      stateEl.textContent = player.player_state;
    }

    // ==========================================
    // DOWN状態のビジュアルフィードバック
    // ==========================================
    if (player.player_state === "DOWN") {
      const hpTotalEl = document.getElementById(`${prefix}HpTotal`);
      if (hpTotalEl) {
        hpTotalEl.style.color = "red";
        hpTotalEl.style.fontWeight = "bold";
      }
    }

    // ==========================================
    // Bluetooth切断判定 (PLAYING時のみ)
    // ==========================================
    if (isMatchActive) {
      const missingDevices = [];
      if (!player.bluetooth_gun_connected) missingDevices.push("レーザー銃");
      if (!player.bluetooth_armor_connected) missingDevices.push("防具");

      if (missingDevices.length > 0) {
        const pName = player.name || `Player ${player.id}`;
        disconnectedPlayers.push(`${pName} の ${missingDevices.join("・")}`);
      }
    }
  });

  // ==========================================
  // 切断警告バナーの表示切り替え
  // ==========================================
  const warningBanner = document.getElementById("adminDisconnectWarning");
  const warningText = document.getElementById("adminDisconnectText");
  
  if (warningBanner && warningText) {
    if (disconnectedPlayers.length > 0) {
      warningText.innerHTML = `⚠️ ${disconnectedPlayers.join("<br>⚠️ ")} が切断されました！再接続を待機しています...`;
      warningBanner.classList.remove("hidden");
    } else {
      warningBanner.classList.add("hidden");
    }
  }
}

function updateHpColors(prefix, player) {
  const parts = ["Head", "Torso", "RightArm", "LeftArm", "RightLeg", "LeftLeg"];
  const values = [
    player.hp_head,
    player.hp_torso,
    player.hp_right_arm,
    player.hp_left_arm,
    player.hp_right_leg,
    player.hp_left_leg,
  ];

  parts.forEach((part, index) => {
    const barEl = document.getElementById(`${prefix}Hp${part}`);
    if (!barEl) return;

    const percentage = values[index];
    if (percentage > 66) {
      barEl.style.background = "linear-gradient(90deg, #28a745, #20c997)";
    } else if (percentage > 33) {
      barEl.style.background = "linear-gradient(90deg, #ffc107, #ff9800)";
    } else {
      barEl.style.background = "linear-gradient(90deg, #dc3545, #c82333)";
    }
  });
}

// ==========================================
// 試合開始条件チェック（READY対応版）
// ==========================================
function canStartMatch() {
  const conditions = {
    matchWaiting: false,
    playersReady: false,
    minPlayers: false,
  };

  const reasons = [];

  // Match が WAITING 状態か
  if (matchData && matchData.status === "WAITING") {
    conditions.matchWaiting = true;
  } else {
    reasons.push("試合がWAITING状態ではありません");
  }

  // 最低2人いるか
  if (playersData.length >= 2) {
    conditions.minPlayers = true;
  } else {
    reasons.push(`プレイヤーが不足しています（現在${playersData.length}人）`);
  }

  // ready フラグで判定
  const allReady = playersData.every((p) => p.ready === 1);
  if (allReady && playersData.length > 0) {
    conditions.playersReady = true;
  } else {
    const notReadyPlayers = playersData.filter((p) => p.ready !== 1);
    if (notReadyPlayers.length > 0) {
      const names = notReadyPlayers
        .map((p) => p.name || `Player ${p.id}`)
        .join(", ");
      reasons.push(`READY状態でないプレイヤーがいます: ${names}`);
    }
  }

  return {
    canStart:
      conditions.matchWaiting &&
      conditions.playersReady &&
      conditions.minPlayers,
    conditions,
    reasons,
  };
}

// ==========================================
// 開始ボタン状態更新
// ==========================================
function updateStartButtonState() {
  const btn = document.getElementById("startMatchBtn");
  const conditionsEl = document.getElementById("startConditions");

  if (!btn) {
    console.warn("startMatchBtn not found");
    return;
  }

  const check = canStartMatch();

  if (check.canStart) {
    btn.disabled = false;
    btn.classList.remove("disabled", "btn-disabled");
    btn.classList.add("btn-success");
    btn.title = "試合を開始できます";

    if (conditionsEl) {
      conditionsEl.innerHTML =
        '<span class="condition-ok">✅ 開始条件を満たしています</span>';
    }
  } else {
    btn.disabled = true;
    btn.classList.add("disabled", "btn-disabled");
    btn.classList.remove("btn-success");

    if (check.reasons.length > 0) {
      const notReadyCount = playersData.filter((p) => p.ready !== 1).length;
      if (matchData?.status !== "WAITING") {
        btn.title = "試合中または終了済みです";
      } else if (notReadyCount > 0) {
        btn.title = `${notReadyCount}人が準備中です`;
      } else {
        btn.title = check.reasons[0];
      }
    }

    if (conditionsEl) {
      conditionsEl.innerHTML =
        '<div class="condition-error">❌ 開始条件未達成<ul>' +
        check.reasons.map((r) => `<li>${r}</li>`).join("") +
        "</ul></div>";
    }
  }
}

// ==========================================
// 試合開始処理
// ==========================================
async function startMatch() {
  if (isStartingMatch) {
    showMessage("試合開始処理中です", "info");
    return;
  }

  const check = canStartMatch();

  if (!check.canStart) {
    showMessage(
      "開始条件を満たしていません: " + check.reasons.join(", "),
      "error",
    );
    return;
  }

  isStartingMatch = true;
  stopAutoRefresh();

  const updatedPlayerIds = [];
  let matchUpdated = false;

  try {
    for (const player of playersData) {
      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: player.id,
          player_state: "PLAYING",
          version: 0, // 強制上書き
        }),
      });

      updatedPlayerIds.push(player.id);

      const playerIndex = playersData.findIndex((p) => p.id === player.id);
      if (playerIndex !== -1) {
        playersData[playerIndex].version = result.new_version;
        playersData[playerIndex].player_state = "PLAYING";
      }
    }

    const durationSelect = document.getElementById("matchDurationSelect");
    const duration = durationSelect ? parseInt(durationSelect.value, 10) : 180;

    await apiRequest("update_match.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: MATCH_ID,
        status: "PLAYING",
        start_time: "NOW",
        duration: duration,
      }),
    });

    matchUpdated = true;

    await apiRequest("add_event.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: MATCH_ID,
        player_id: null,
        event_type: "START",
        event_data: { player_count: playersData.length },
      }),
    });

    showMessage("試合を開始しました", "success");
    await fetchAllData();
  } catch (error) {
    showMessage("試合開始エラー: " + error.message, "error");

    console.error("試合開始失敗、ロールバック試行...");

    try {
      for (const playerId of updatedPlayerIds) {
        const player = playersData.find((p) => p.id === playerId);
        if (player) {
          await apiRequest("update_player.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              player_id: playerId,
              player_state: "IDLE",
              version: 0, // ロールバック時も強制上書き
            }),
          });
        }
      }

      if (matchUpdated) {
        await apiRequest("update_match.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            match_id: MATCH_ID,
            status: "WAITING",
            start_time: null,
          }),
        });
      }

      showMessage("ロールバック完了", "info");
    } catch (rollbackError) {
      showMessage("ロールバック失敗: " + rollbackError.message, "error");
    }

    await fetchAllData();
  } finally {
    isStartingMatch = false;
    if (document.getElementById("autoRefresh").checked) {
      startAutoRefresh();
    }
  }
}



// ==========================================
// 勝敗判定（サーバー権威対応版）
// ==========================================
async function checkGameEnd() {
  if (isCheckingGameEnd) {
    return;
  }

  if (!matchData || matchData.status !== "PLAYING") {
    return;
  }

  // ==========================================
  // 修正：player_state で DOWN 判定
  // ==========================================
  const downPlayers = playersData.filter((p) => p.player_state === "DOWN");

  if (downPlayers.length === 0) {
    // 誰もDOWNしていない
    return;
  }

  isCheckingGameEnd = true;

  try {
    // ==========================================
    // 修正：player_state で生存判定
    // ==========================================
    const alivePlayers = playersData.filter((p) => p.player_state !== "DOWN");

    if (alivePlayers.length === 0) {
      // 全員DOWN（引き分け）
      await endMatchWithWinner(null);
    } else {
      // 生存者の中で最もHPが多い人が勝者
      const maxHp = Math.max(...alivePlayers.map(p => p.hp_total));
      const topPlayers = alivePlayers.filter(p => p.hp_total === maxHp);

      if (topPlayers.length > 1) {
        // 同値の場合は引き分け
        await endMatchWithWinner(null);
      } else {
        await endMatchWithWinner(topPlayers[0].id);
      }
    }
  } finally {
    isCheckingGameEnd = false;
  }
}

async function endMatchWithWinner(winnerId) {
  try {
    // ==========================================
    // 全プレイヤーをDOWN状態に更新
    // ==========================================
    for (const player of playersData) {
      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: player.id,
          player_state: "DOWN",
          version: 0, // 強制上書き
        }),
      });

      const playerIndex = playersData.findIndex((p) => p.id === player.id);
      if (playerIndex !== -1) {
        playersData[playerIndex].version = result.new_version;
        playersData[playerIndex].player_state = "DOWN";
      }
    }

    // ==========================================
    // Match を FINISHED に更新
    // ==========================================
    await apiRequest("update_match.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: MATCH_ID,
        status: "FINISHED",
        end_time: new Date().toISOString().slice(0, 19).replace("T", " "),
        winner_player_id: winnerId,
      }),
    });

    // ==========================================
    // イベントログ追加
    // ==========================================
    await apiRequest("add_event.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: MATCH_ID,
        player_id: winnerId,
        event_type: "END",
        event_data: { winner_id: winnerId },
      }),
    });

    const winnerName = winnerId
      ? playersData.find((p) => p.id === winnerId)?.name
      : "引き分け";
    showMessage(`試合終了: ${winnerName} の勝利`, "success");
    await fetchAllData();
  } catch (error) {
    showMessage("試合終了処理エラー: " + error.message, "error");
  }
}

// ==========================================
// 手動試合終了（安全性強化）
// ==========================================
async function endMatch() {
  if (!matchData || matchData.status !== "PLAYING") {
    showMessage("試合がPLAYING状態ではありません", "error");
    return;
  }

  if (!confirm("試合を強制終了しますか？")) {
    return;
  }

  if (playersData.length === 0) {
    showMessage("プレイヤーが存在しません", "error");
    return;
  }

  // 生存者の中で最もHPが多い人を勝者とする（同値は引き分け）
  const alivePlayers = playersData.filter((p) => p.player_state !== "DOWN");
  
  if (alivePlayers.length === 0) {
    await endMatchWithWinner(null);
  } else {
    const maxHp = Math.max(...alivePlayers.map(p => p.hp_total));
    const topPlayers = alivePlayers.filter(p => p.hp_total === maxHp);

    if (topPlayers.length > 1) {
      await endMatchWithWinner(null);
    } else {
      await endMatchWithWinner(topPlayers[0].id);
    }
  }
}

// ==========================================
// リセット処理（完全初期化版）
// ==========================================
async function resetMatch() {
  if (
    !confirm(
      "試合を完全リセットしますか？\n\n・試合状態: WAITING\n・プレイヤー: 全員IDLE\n・HP/弾薬: 初期値\n・戦績: リセット\n・Bluetooth接続状態: クリア\n\nこの操作は取り消せません。",
    )
  ) {
    return;
  }

  try {
    // 全プレイヤーを完全初期化
    for (const player of playersData) {
      const result = await apiRequest("update_player.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_id: player.id,
          player_state: "IDLE",

          // HP初期化
          hp_head: 100,
          hp_torso: 100,
          hp_right_arm: 100,
          hp_left_arm: 100,
          hp_right_leg: 100,
          hp_left_leg: 100,

          // 弾薬初期化
          ammo_current: 30,
          ammo_reserve: 5,

          // 戦績初期化
          kills: 0,
          hits: 0,
          damage_taken: 0,
          play_time: 0,

          // Bluetooth接続状態もクリア
          bluetooth_gun_connected: 0,
          bluetooth_armor_connected: 0,
          ready: 0,

          version: 0,
        }),
      });

      const playerIndex = playersData.findIndex((p) => p.id === player.id);
      if (playerIndex !== -1) {
        playersData[playerIndex].version = result.new_version;
      }
    }

    // Match状態を初期化
    await apiRequest("update_match.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: MATCH_ID,
        status: "WAITING",
        start_time: null,
        end_time: null,
        winner_player_id: null,
      }),
    });

    showMessage("試合を完全リセットしました", "success");
    await fetchAllData();
  } catch (error) {
    showMessage("リセットエラー: " + error.message, "error");
  }
}

// ==========================================
// 表示更新関数
// ==========================================
function updateMatchDisplay(match) {
  document.getElementById("matchStatus").textContent = match.status;
  document.getElementById("matchId").textContent = `Match ID: ${match.id}`;

  document.querySelectorAll(".flow-step").forEach((step) => {
    step.classList.remove("active");
    if (step.dataset.status === match.status) {
      step.classList.add("active");
    }
  });

  document.getElementById("matchStartTime").textContent =
    match.start_time || "-";
  document.getElementById("matchEndTime").textContent = match.end_time || "-";

  if (match.winner_player_id) {
    const winner = playersData.find((p) => p.id === match.winner_player_id);
    document.getElementById("winnerDisplay").style.display = "block";
    document.getElementById("winnerName").textContent = winner
      ? winner.name
      : `Player ${match.winner_player_id}`;
  } else {
    document.getElementById("winnerDisplay").style.display = "none";
  }

  const durationSelect = document.getElementById("matchDurationSelect");
  if (durationSelect) {
    // サーバーの値が前回から変化した場合のみ上書き（初期ロード含む）、Adminの設定変更中の中断を防ぐ
    if (match.duration && window._lastSyncedDuration !== match.duration) {
      durationSelect.value = match.duration;
      window._lastSyncedDuration = match.duration;
    }
    // PLAYING中は変更不可
    durationSelect.disabled = (match.status !== "WAITING");
  }

  updateCurrentRuleDisplay(match);
  
  if (!window.adminTimerStarted) {
    window.adminTimerStarted = true;
    setInterval(() => {
      const timeEl = document.getElementById("matchRemainingTime");
      if (!timeEl || !matchData) return;
      
      if ((matchData.status === "PLAYING" || matchData.status === "PAUSED") && matchData.duration) {
        let remaining = matchData.duration;
        const pausedSec = matchData.paused_elapsed_time ? parseInt(matchData.paused_elapsed_time, 10) : 0;
        
        if (matchData.status === "PLAYING" && matchData.start_time) {
          const st = matchData.start_time.replace(/-/g, "/");
          const startTime = new Date(st).getTime();
          const elapsed = Date.now() - startTime;
          remaining = Math.max(0, matchData.duration - pausedSec - Math.floor(elapsed / 1000));
        } else if (matchData.status === "PAUSED") {
          remaining = Math.max(0, matchData.duration - pausedSec);
        }
        
        timeEl.textContent = formatTime(remaining);
        
        if (remaining <= 0 && !window.isAutoEndingMatch && matchData.status === "PLAYING") {
          window.isAutoEndingMatch = true;
          autoEndMatch();
        }
      } else if (matchData.status === "WAITING") {
        const dur = durationSelect ? parseInt(durationSelect.value, 10) : 180;
        timeEl.textContent = formatTime(dur);
        window.isAutoEndingMatch = false;
      } else {
        timeEl.textContent = "0:00";
      }
    }, 1000);
  }
}

async function autoEndMatch() {
  if (matchData.status !== "PLAYING") return;
  showMessage("時間切れにより試合を終了します", "info");
  
  const alivePlayers = playersData.filter((p) => p.player_state !== "DOWN");
  if (alivePlayers.length === 0) {
    await endMatchWithWinner(null);
  } else {
    const maxHp = Math.max(...alivePlayers.map(p => p.hp_total));
    const topPlayers = alivePlayers.filter(p => p.hp_total === maxHp);

    if (topPlayers.length > 1) {
      // 最大HPが同じプレイヤーが複数いる場合は引き分け
      await endMatchWithWinner(null);
    } else {
      await endMatchWithWinner(topPlayers[0].id);
    }
  }
}

function updateEventLog(events) {
  const container = document.getElementById("eventLogContainer");

  if (!events || events.length === 0) {
    container.innerHTML = '<p class="log-empty">イベントログがありません</p>';
    return;
  }

  let html = "";
  [...events].reverse().forEach((event) => {
    html += `
            <div class="log-item">
                <span class="log-time">${event.created_at}</span>
                <span class="log-type">${event.event_type}</span>
                ${event.player_id ? `Player ${event.player_id}` : ""}
                ${event.event_data ? `<div class="log-details">${JSON.stringify(event.event_data)}</div>` : ""}
            </div>
        `;
  });

  container.innerHTML = html;
}

// ボタンイベント登録
document
  .getElementById("resetMatchBtn")
  ?.addEventListener("click", async () => {
    if (
      !confirm(
        "試合データを初期化しますか？\n\n・試合状態: WAITING\n・プレイヤー: 全員IDLE\n・HP/弾薬: 初期値\n・戦績: リセット\n\nこの操作は取り消せません。",
      )
    ) {
      return;
    }

    await resetMatch();
  });

// ==========================================
// ユーティリティ
// ==========================================
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ==========================================
// 自動更新制御
// ==========================================
function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(() => {
    if (document.getElementById("autoRefresh").checked && !isStartingMatch) {
      fetchAllData();
    }
  }, 2000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

// ==========================================
// ルール管理機能
// ==========================================

/**
 * ルール名を日本語表記に変換
 */
const RULE_NAMES = {
  TOTAL_HP_ZERO: "合計HPが0でDOWN",
  CORE_PART_ZERO: "頭部または胴体が0でDOWN",
  ANY_PART_ZERO: "いずれかの部位が0でDOWN",
  ALL_PARTS_ZERO: "全部位が0でDOWN",
  MULTIPLE_PARTS_ZERO: "複数部位（2個以上）が0でDOWN",
};

/**
 * ルールの詳細説明
 */
const RULE_DESCRIPTIONS = {
  TOTAL_HP_ZERO:
    "💡 合計HPが0になるとDOWNします。全身のダメージを考慮するバランスの良いルールです。耐久戦向け。",
  CORE_PART_ZERO:
    "💡 頭部または胴体のHPが0になると即座にDOWNします。重要部位を狙う戦略性が求められます。バランス型。",
  ANY_PART_ZERO:
    "💡 いずれかの部位のHPが0になると即座にDOWNします。非常に難易度が高く、緊張感のある戦闘になります。高難易度モード。",
  ALL_PARTS_ZERO:
    "💡 全ての部位のHPが0にならないとDOWNしません。非常に長期戦になります。低難易度モード。",
  MULTIPLE_PARTS_ZERO:
    "💡 2つ以上の部位のHPが0になるとDOWNします。適度な難易度の戦闘が楽しめます。中難易度モード。",
};

/**
 * 試合設定（ダウンルール・試合時間）を更新
 * @param {string} newRule - 新しいルール
 * @param {number} newDuration - 新しい試合時間（秒）
 */
async function updateMatchSettings(newRule, newDuration) {
  // バリデーション
  if (!RULE_NAMES[newRule]) {
    showMessage("無効なルールが選択されました", "error");
    return;
  }

  // 試合中は変更不可
  if (matchData && matchData.status !== "WAITING") {
    showMessage("試合中は設定を変更できません", "error");
    return;
  }

  // 確認ダイアログ
  const ruleName = RULE_NAMES[newRule];
  const durationDesc = newDuration ? `${newDuration / 60}分` : '変更なし';
  if (!confirm(`試合時間を「${durationDesc}」、ルールを「${ruleName}」に変更しますか？`)) {
    return;
  }

  try {
    showMessage("設定を変更中...", "info");

    // APIで更新
    const reqBody = {
      match_id: MATCH_ID,
      down_rule: newRule,
    };
    if (newDuration) reqBody.duration = newDuration;

    const result = await apiRequest("update_match.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    });

    showMessage("試合設定を保存しました", "success");

    // matchData を更新して表示を更新
    if (result && result.data) {
      matchData = result.data;
      updateCurrentRuleDisplay(matchData);
    }
  } catch (error) {
    showMessage("ルール変更エラー: " + error.message, "error");
    console.error("Rule update error:", error);
  }
}

/**
 * ルール説明を更新
 * @param {string} rule - ルール名
 */
function updateRuleDescription(rule) {
  const descriptionEl = document.getElementById("ruleDescription");
  if (!descriptionEl) return;

  const description = RULE_DESCRIPTIONS[rule] || "💡 ルールの説明がありません";

  descriptionEl.innerHTML = `<p>${description}</p>`;
}

/**
 * 現在の設定（ルール・試合時間）表示を更新
 * @param {Object} matchData - 試合データ
 */
function updateCurrentRuleDisplay(matchData) {

  if (!matchData) {
    console.error("[updateCurrentRuleDisplay] matchData is null/undefined!");
    return;
  }

  const currentRule = matchData.down_rule || "TOTAL_HP_ZERO";
  const currentDuration = matchData.duration || 180;

  // ==========================================
  // 試合時間表示を更新
  // ==========================================
  const durationDisplayEl = document.getElementById("currentDurationDisplay");
  if (durationDisplayEl) {
    durationDisplayEl.textContent = `${Math.floor(currentDuration / 60)}分`;
  }

  // ==========================================
  // ルール表示名を更新
  // ==========================================
  const displayEl = document.getElementById("currentRuleDisplay");

  if (displayEl) {
    const ruleName = RULE_NAMES[currentRule] || currentRule;
    displayEl.textContent = ruleName;
  } else {
    console.error("[updateCurrentRuleDisplay] displayEl not found!");
  }

  // ==========================================
  // ルールコードを更新
  // ==========================================
  const codeEl = document.getElementById("currentRuleCode");

  if (codeEl) {
    const codeText = `(${currentRule})`;
    codeEl.textContent = codeText;
  } else {
    console.error("[updateCurrentRuleDisplay] codeEl not found!");
  }

  // ==========================================
  // セレクトボックスを現在のルールに設定
  // ==========================================
  const selectEl = document.getElementById("downRuleSelect");

  if (selectEl) {
    // サーバー側の値が前回と変わった場合のみ更新、Admin変更中の中断を防ぐ
    if (window._lastSyncedRule !== currentRule) {
      selectEl.value = currentRule;
      window._lastSyncedRule = currentRule;
    }
  } else {
    console.error("[updateCurrentRuleDisplay] selectEl not found!");
  }

  // ==========================================
  // 説明を更新
  // ==========================================
  if (selectEl) {
    updateRuleDescription(selectEl.value);
  } else {
    console.log(
      "[updateCurrentRuleDisplay] Updating description for:",
      currentRule,
    );
    updateRuleDescription(currentRule);
  }

  // ==========================================
  // 試合中はロック
  // ==========================================
  const settingsEl = document.querySelector(".match-settings");

  if (settingsEl) {
    if (matchData.status !== "WAITING") {
      settingsEl.classList.add("locked");
    } else {
      settingsEl.classList.remove("locked");
    }
  }

}

/**
 * ルール選択UIを初期化
 */
function initRuleSelection() {
  const selectEl = document.getElementById("downRuleSelect");
  if (selectEl) {
    // 選択が変更されたら説明を即座に更新
    selectEl.addEventListener("change", (e) => {
      updateRuleDescription(e.target.value);
      console.log("[Admin] Rule selected:", e.target.value);
    });

    // フォーカス管理（ログのみ）
    selectEl.addEventListener("focus", () => {
      console.log("[Admin] Select focused - value updates paused");
    });
  }

  // 変更ボタンのイベントリスナー
  const updateBtn = document.getElementById("updateRuleBtn");
  if (updateBtn) {
    updateBtn.addEventListener("click", () => {
      const selectedRule = selectEl?.value;
      const durationSelect = document.getElementById("matchDurationSelect");
      const selectedDuration = durationSelect ? parseInt(durationSelect.value, 10) : null;
      if (selectedRule) {
        console.log("[Admin] Update button clicked, rule:", selectedRule, "duration:", selectedDuration);
        updateMatchSettings(selectedRule, selectedDuration);
      }
    });
  }

  console.log("[Admin] Rule selection UI initialized");
}

// ==========================================
// Admin個別操作: プレイヤー状態の強制変更
// ==========================================
async function handlePlayerControl(action, playerId, matchId) {
  if (!matchData || matchData.status !== "PLAYING") {
    showMessage("試合中のみ操作可能です", "error");
    return;
  }

  const actionName = action === "reset_hp" ? "HP全回復" : "強制ダウン";
  if (!confirm(`本当に対象プレイヤー(${playerId})を「${actionName}」にしますか？`)) {
    return;
  }

  try {
    const response = await fetch("/battle_arena/api/admin_player_control.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, player_id: playerId, match_id: matchId }),
    });

    const data = await response.json();
    if (data.status === "success") {
      showMessage(`プレイヤー${playerId}の${actionName}処理が完了しました`, "success");
      // 画面即時反映のためデータ再取得
      fetchAllData();
    } else {
      showMessage("個別操作エラー: " + data.message, "error");
    }
  } catch (error) {
    console.error("個別操作エラー:", error);
    showMessage("API通信エラーが発生しました", "error");
  }
}

// ==========================================
// 初期化
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  console.log("Admin Panel Initialized (Server Authority Mode)");

  fetchAllData();
  startAutoRefresh();
  initRuleSelection();

  document.getElementById("autoRefresh").addEventListener("change", (e) => {
    if (e.target.checked) {
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  });
});
