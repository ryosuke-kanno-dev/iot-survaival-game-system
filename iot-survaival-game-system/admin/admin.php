<!DOCTYPE html>
<html lang="ja">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Battle Arena - Host Control Panel</title>
  <link rel="stylesheet" href="./css/admin.css">
</head>

<body>
  <!-- 切断警告バナー -->
  <div id="adminDisconnectWarning" class="admin-warning-banner hidden">
    <div class="warning-content">
      <span class="warning-icon">⚠️</span>
      <span id="adminDisconnectText" class="warning-text">プレイヤーのデバイスが切断されました</span>
    </div>
  </div>

  <div class="container">
    <header class="header">
      <h1>🎮 Battle Arena - Host Control Panel</h1>
      <div class="connection-status">
        <span id="connectionStatus" class="status-badge">⚫ 未接続</span>
      </div>
    </header>

    <section class="control-panel">
      <div class="control-group">
        <h3>試合管理</h3>
        <div class="button-group">
          <button id="startMatchBtn" class="btn btn-primary" onclick="startMatch()">🎯 試合開始</button>
          <button id="endMatchBtn" class="btn btn-danger" onclick="endMatch()">🛑 試合強制終了</button>
          <button id="resetMatchBtn" class="btn btn-secondary" onclick="resetMatch()">🔄 リセット(次の試合へ)</button>
        </div>
        <div id="startConditions" class="start-conditions"></div>
      </div>

      <!-- 試合設定エリア（admin.php に追加） -->
      <div class="match-settings">
        <h3>⚙️ 試合設定</h3>

        <!-- 試合時間選択 -->
        <div class="setting-item">
          <label for="matchDurationSelect">試合時間</label>
          <select id="matchDurationSelect" class="form-select">
            <option value="60">1分</option>
            <option value="120">2分</option>
            <option value="180" selected>3分</option>
            <option value="300">5分</option>
            <option value="600">10分</option>
          </select>
        </div>

        <!-- ルール選択 -->
        <div class="setting-item">
          <label for="downRuleSelect">ダウン判定ルール</label>
          <select id="downRuleSelect" class="form-select">
            <option value="TOTAL_HP_ZERO">合計HPが0でDOWN（耐久重視）</option>
            <option value="CORE_PART_ZERO">頭部または胴体が0でDOWN（バランス型）</option>
            <option value="ANY_PART_ZERO">いずれかの部位が0でDOWN（高難易度）</option>
            <option value="ALL_PARTS_ZERO">全部位が0でDOWN（低難易度）</option>
            <option value="MULTIPLE_PARTS_ZERO">複数部位（2個以上）が0でDOWN（中難易度）</option>
          </select>
          <button id="updateRuleBtn" class="btn btn-primary">設定を変更</button>
        </div>

        <!-- 現在の設定表示 -->
        <div class="current-rule">
          <strong>現在の設定:</strong>
          <span id="currentDurationDisplay" class="badge bg-secondary" style="font-size: 1.1em; margin-right: 5px;">3分</span>
          <span id="currentRuleDisplay">合計HPが0でDOWN</span>
          <span id="currentRuleCode" class="rule-code">(TOTAL_HP_ZERO)</span>
        </div>

        <!-- ルール説明 -->
        <div class="rule-description" id="ruleDescription">
          <p>💡 合計HPが0になるとDOWNします。全身のダメージを考慮するバランスの良いルールです。</p>
        </div>
      </div>

      <div class="control-group">
        <h3>データ更新</h3>
        <div class="button-group">
          <button class="btn btn-info" onclick="fetchAllData()">🔄 全データ更新</button>
          <label class="checkbox-label">
            <input type="checkbox" id="autoRefresh" checked>
            <span>自動更新（2秒）</span>
          </label>
        </div>
      </div>
    </section>

    <section class="status-flow">
      <div class="flow-title">⏩ ゲーム進行フロー</div>
      <div class="flow-steps">
        <div class="flow-step" data-status="WAITING">
          <div class="step-icon">🔵</div>
          <div class="step-label">待機中</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step" data-status="PLAYING">
          <div class="step-icon">🔴</div>
          <div class="step-label">プレイ中</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step" data-status="FINISHED">
          <div class="step-icon">🏁</div>
          <div class="step-label">終了</div>
        </div>
      </div>
    </section>

    <section class="main-content">
      <!-- Player 1 用コンテナ -->
      <div id="player1Container" class="player-container">
        <!-- Player1は動的生成 -->
      </div>

      <!-- Match Center（既存） -->
      <div class="match-center">
        <div class="match-status">
          <h3>試合状態</h3>
          <div class="status-display">
            <div id="matchStatus" class="status-badge status-large">WAITING</div>
            <div id="matchId" class="match-id">Match ID: 1</div>
          </div>
        </div>
        <div class="match-times">
          <div class="time-item">
            <span>残り時間</span>
            <strong id="matchRemainingTime" style="font-size: 1.8em; color: #ff4757;">0:00</strong>
          </div>
          <div class="time-item">
            <span>開始時刻</span>
            <strong id="matchStartTime">-</strong>
          </div>
          <div class="time-item">
            <span>終了時刻</span>
            <strong id="matchEndTime">-</strong>
          </div>
        </div>
        <div class="winner-display" id="winnerDisplay" style="display:none;">
          <div class="winner-badge">
            <div class="winner-icon">🏆</div>
            <div class="winner-text">Winner</div>
            <div class="winner-name" id="winnerName">-</div>
          </div>
        </div>
      </div>

      <!-- Player 2 用コンテナ -->
      <div id="player2Container" class="player-container">
        <!-- Player2は動的生成 -->
      </div>
    </section>

    <section class="event-log">
      <h3>📜 イベントログ（最新20件）</h3>
      <div id="eventLogContainer" class="log-container">
        <p class="log-empty">イベントログがありません</p>
      </div>
    </section>

    <div id="messageArea" class="message-area"></div>
  </div>

  <script src="./js/admin.js"></script>
</body>

</html>