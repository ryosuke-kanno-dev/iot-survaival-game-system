<?php
// ==========================================
// game.php - SPEC-IR ゲームメイン
// ==========================================
// 設計思想：
// - 1ページ構成（ページ遷移なし）
// - 状態管理はJS（game-state.js）が担当
// - PHPは器としてHTMLを出力するのみ
// ==========================================
?>
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="SPEC-IR Bluetooth ゲーム">
  <title>SPEC-IR Game</title>
  
  <!-- スタイルシート -->
  <link rel="stylesheet" href="./css/variables.css">
  <link rel="stylesheet" href="./css/base.css">
  <link rel="stylesheet" href="./css/layout.css">
  <link rel="stylesheet" href="./css/components.css">
  <link rel="stylesheet" href="./css/game.css">
  <link rel="stylesheet" href="./css/animations.css">
  <link rel="stylesheet" href="./css/developer.css">

  <!-- ==========================================
    プレイヤーID取得（GETパラメータ）
    例: game.php?player_id=1
  ========================================== -->
  <?php
    $player_id = isset($_GET['player_id']) ? (int)$_GET['player_id'] : 1;
    $match_id  = isset($_GET['match_id']) ? (int)$_GET['match_id'] : 1;
  ?>
    
  <script>
    // グローバル変数としてplayerIdを設定
    window.PLAYER_ID = <?php echo $player_id; ?>;
    window.MATCH_ID  = <?php echo $match_id; ?>;
  </script>

</head>
<body class="state-off">

<!-- メインアプリケーション -->
<main id="app">

  <!-- ==========================================
       接続画面（旧 LinkOFF.html 相当）
       ========================================== -->
  <section id="screen-connect" class="screen screen--off is-active">
    <header class="game-header">GGOルール説明</header>

    <div class="game-main">
      <!-- 体力の説明 -->
      <section class="custom-box">
        <h1>体力の説明</h1>
        <p>体力は頭、胴体、両腕、両足に分かれていてそれぞれに体力が割り振られています。</p>
      </section>

      <!-- 戦績データ -->
      <div class="playing-stats passive">
        <div class="stat-item">
          <span class="stat-label">キル</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">命中</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">被弾</span>
          <span class="stat-value">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">残り時間</span>
          <span class="stat-value">0:00</span>
        </div>
      </div>

      <!-- 弾数表示サンプル -->
      <section class="ammo">
        <div class="ammo__container">

          <div class="ammo__magazine ammo-box">
            <p class="ammo__label">装填弾数</p>
            <p class="ammo__value">6 / 12</p>
          </div>

          <div class="ammo__reserve ammo-box">
            <p class="ammo__label">予備マガジン</p>
            <p class="ammo__value">3 / 5</p>
          </div>

        </div>
      </section>

      <!-- HP表示サンプル -->
      <section class="health-section">
        <div class="hp-progress">
          <div class="hp-bar is-blue">100hp</div>
          <div class="hp-bar is-green">99hp~50hp</div>
          <div class="hp-bar is-yellow">49hp~1hp</div>
          <div class="hp-bar is-red">0hp</div>
        </div>
        <div class="human-body">
          <div class="body-visual">
            <div class="body-part head is-high"><hr class="line-head"></div>
            <div class="body-part torso is-mid"><hr class="line-torso"></div>
            <div class="body-part leftarm is-mid"><hr class="line-leftarm"></div>
            <div class="body-part rightarm is-low"><hr class="line-rightarm"></div>
            <div class="body-part leftleg is-low"><hr class="line-leftleg"></div>
            <div class="body-part rightleg is-zero"><hr class="line-rightleg"></div>
          </div>

          <div class="body-hp">
            <div class="body-hp-item head">HP: 100/100</div>
            <div class="body-hp-item torso">HP: 70/100</div>
            <div class="body-hp-item leftarm">HP: 50/100</div>
            <div class="body-hp-item rightarm">HP: 30/100</div>
            <div class="body-hp-item leftleg">HP: 10/100</div>
            <div class="body-hp-item rightleg">HP: 0/100</div>
          </div>
        </div>
        <div class="total">
          <div class="total-hp-color is-low"></div>
          <div class="total-hp">HP: 260/600</div>
        </div>
      </section>

      <!-- ゲームルール -->
      <section class="custom-box">
        <h2>ゲームルール</h2>
          <ul>
            <li>悪口ダメ絶対</li>
            <li>暴力ダメ絶対</li>
          </ul>
      </section>

      <!-- 機器接続方法 -->
      <section class="custom-box">
        <h2>機器接続方法</h2>
        <p>以下のBluetooth接続ボタンをクリックし<br>
          「SPEC-IRGun」と「SPEC-IRArmor」<br>
          を選択します。<br>
          完了すると、アイコンが緑色になります。</p>
      </section>

      <!-- 接続セクション -->
      <section class="connection-section">
        <div class="section-title">接続用</div>
        <button id="connectButton" class="connection-button">Bluetooth 接続</button>
        <div class="device-status">
          <div class="device disconnected" data-device="gun">
            <span class="status-icon"></span>
            <span class="device-label">レーザー銃:<span class="status-text">未接続</span></span>
          </div>
          <div class="device disconnected" data-device="armor">
            <span class="status-icon"></span>
            <span class="device-label">防具:<span class="status-text">未接続</span></span>
          </div>
        </div>
      </section>

      <!-- ログエリア・テキスト送信 -->
      <section data-log-screen="connect">
        <div class="log-section">
          <div class="section-title">確認用のログ</div>
          <div class="log-area" data-log-area>
            <p>📜 ここにログが表示されます</p>
          </div>
          <div style="display: flex;">
            <textarea data-log-textbox class="log-textarea" placeholder="送信するテキストを入力"></textarea>
            <button data-log-send class="log-send">送信</button>
          </div>
        </div>
      </section>

      <button class="action-button" id="start-button">ゲームを始める</button>
    </div>
  </section>

  <!-- ==========================================
       ゲーム画面（旧 LinkON.html 相当）
       ========================================== -->
  <section id="screen-game" class="screen screen--on">
    <header class="game-header">GGOゲーム画面</header>

    <div class="game-main">
      <!-- 戦績データ -->
      <div class="playing-stats">
        <div class="stat-item">
          <span class="stat-label">キル</span>
          <span class="stat-value" data-stat="kills">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">命中</span>
          <span class="stat-value" data-stat="hits">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">被弾</span>
          <span class="stat-value" data-stat="damage">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">残り時間</span>
          <span class="stat-value" data-stat="time">0:00</span>
        </div>
      </div>

      <!-- 弾数表示 -->
      <section class="ammo" data-role="game-ammo">
        <div class="ammo__container">

          <div class="ammo__magazine ammo-box">
            <p class="ammo__label">装填弾数</p>
            <p class="ammo__value" data-ammo="current"></p>
          </div>

          <div class="ammo__reserve ammo-box">
            <p class="ammo__label">予備マガジン</p>
            <p class="ammo__value" data-ammo="reserve"></p>
          </div>

        </div>
      </section>

      <!-- HP表示（実際のゲーム用） -->
      <section class="health-section">
        <div class="human-body">
          <div class="body-visual">
            <div class="body-part head" id="headHpColor"><hr class="line-head"></div>
            <div class="body-part torso" id="torsoHpColor"><hr class="line-torso"></div>
            <div class="body-part leftarm" id="leftarmHpColor"><hr class="line-leftarm"></div>
            <div class="body-part rightarm" id="rightarmHpColor"><hr class="line-rightarm"></div>
            <div class="body-part leftleg" id="leftlegHpColor"><hr class="line-leftleg"></div>
            <div class="body-part rightleg" id="rightlegHpColor"><hr class="line-rightleg"></div>
          </div>

          <div class="body-hp">
            <div class="body-hp-item head" id="headHp"></div>
            <div class="body-hp-item torso" id="torsoHp"></div>
            <div class="body-hp-item leftarm" id="leftarmHp"></div>
            <div class="body-hp-item rightarm" id="rightarmHp"></div>
            <div class="body-hp-item leftleg" id="leftlegHp"></div>
            <div class="body-hp-item rightleg" id="rightlegHp"></div>
          </div>
        </div>
        <div class="total">
          <div class="total-hp-color" id="totalHpColor"></div>
          <div class="total-hp" id="totalHp">HP: 600/600</div>
        </div>
      </section>

      <!-- デバイス状態 -->
      <section class="connection-section">
        <div class="section-title">接続確認</div>
        <div class="device-status">
          <div class="device disconnected" data-device="gun">
            <span class="status-icon"></span>
            <span class="device-label">レーザー銃:<span class="status-text">未接続</span></span>
          </div>
          <div class="device disconnected" data-device="armor">
            <span class="status-icon"></span>
            <span class="device-label">防具:<span class="status-text">未接続</span></span>
          </div>
        </div>
      </section>

      <!-- ログエリア・テキスト送信 -->
      <section data-log-screen="game">
        <div class="log-section">
          <div class="section-title">確認用のログ</div>
          <div class="log-area" data-log-area>
            <p>📜 ここにログが表示されます</p>
          </div>
          <div style="display: flex;">
            <textarea data-log-textbox class="log-textarea" placeholder="送信するテキストを入力"></textarea>
            <button data-log-send class="log-send">送信</button>
          </div>
        </div>
      </section>

      <button class="action-button" id="end-button">ゲームをやめる</button>

    </div>

    <!-- ダウン時動画オーバーレイ -->
    <div id="videoContainer">
      <button id="closeBtn">×</button>
      <video id="myVideo" controls>
      <source src="../assets/video/down.mp4" type="video/mp4">
      お使いのブラウザは動画タグをサポートしていません。
      </video>
    </div>
    <div id="downOverlay" class="down-overlay">
      <h1 class="down-title">YOU ARE DOWN</h1>
      
      <!-- 戦績表示エリア -->
      <div class="down-stats">
        <div class="stat-item">
          <span class="stat-label">キル</span>
          <span class="stat-value" data-stat="kills">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">命中</span>
          <span class="stat-value" data-stat="hits">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">被弾</span>
          <span class="stat-value" data-stat="damage">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">生存時間</span>
          <span class="stat-value" data-stat="time">0:00</span>
        </div>
      </div>
      
      <button class="button" id="goEndBtn">結果を見る</button>
    </div>

    <!-- Bluetooth切断時警告オーバーレイ -->
    <div id="btDisconnectOverlay" class="bt-disconnect-overlay">
      <div class="bt-disconnect-content">
        <div class="bt-disconnect-icon">⚠️</div>
        <h2 class="bt-disconnect-title">接続エラー</h2>
        <p class="bt-disconnect-text">
          防具または銃とのBluetooth接続が切れました。<br>
          再接続されるまでお待ちください...
        </p>

        <!-- 再接続用ステータス表示 -->
        <div class="device-status" style="margin-top: 15px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px;">
          <div class="device disconnected" data-device="gun" id="reconnect-status-gun">
            <span class="status-icon"></span>
            <span class="device-label">レーザー銃:<span class="status-text">未接続</span></span>
          </div>
          <div class="device disconnected" data-device="armor" id="reconnect-status-armor">
            <span class="status-icon"></span>
            <span class="device-label">防具:<span class="status-text">未接続</span></span>
          </div>
        </div>

        <button id="btReconnectBtn" class="action-button" style="margin-top: 20px;">再接続する</button>
      </div>
    </div>

    <!-- ゲーム一時停止用オーバーレイ -->
    <div id="gamePauseOverlay" class="bt-disconnect-overlay">
      <div class="bt-disconnect-content" style="background: rgba(40, 40, 40, 0.95);">
        <div class="bt-disconnect-icon">⏸️</div>
        <h2 class="bt-disconnect-title">Game Paused</h2>
        <p class="bt-disconnect-text">
          試合が一時停止中です。<br>
          他のプレイヤーの通信切断などを確認しています...
        </p>
      </div>
    </div>
  </section>

  <!-- ==========================================
       終了画面
       ========================================== -->
  <section id="screen-end" class="screen screen--end">
    <header class="game-header">ゲーム終了</header>
    
    <div class="game-main">
      <h1 class="end-title">GAME RESULT</h1>

      <!-- 勝敗表示 -->
      <div id="result-status" class="result-status"></div>

      <!-- 自分のデータ -->
      <div class="player-data-section">
        <h3 class="section-title">Your Stats</h3>
        
        <!-- HP表示 -->
        <div class="player-hp-display">
          <div class="hp-item">
            <span class="hp-label">頭部</span>
            <span class="hp-value" id="player-hp-head">-</span>
          </div>
          <div class="hp-item">
            <span class="hp-label">胴体</span>
            <span class="hp-value" id="player-hp-torso">-</span>
          </div>
          <div class="hp-item">
            <span class="hp-label">右腕</span>
            <span class="hp-value" id="player-hp-right-arm">-</span>
          </div>
          <div class="hp-item">
            <span class="hp-label">左腕</span>
            <span class="hp-value" id="player-hp-left-arm">-</span>
          </div>
          <div class="hp-item">
            <span class="hp-label">右足</span>
            <span class="hp-value" id="player-hp-right-leg">-</span>
          </div>
          <div class="hp-item">
            <span class="hp-label">左足</span>
            <span class="hp-value" id="player-hp-left-leg">-</span>
          </div>
          <div class="hp-item hp-total">
            <span class="hp-label">合計</span>
            <span class="hp-value" id="player-hp-total">-</span>
          </div>
        </div>
        
        <!-- 弾薬表示 -->
        <div class="player-ammo-display">
          <div class="ammo-item">
            <span class="ammo-label">マガジン</span>
            <span class="ammo-value" id="player-ammo-current">-</span>
          </div>
          <div class="ammo-item">
            <span class="ammo-label">予備</span>
            <span class="ammo-value" id="player-ammo-reserve">-</span>
          </div>
        </div>
      </div>

      <!-- 戦績表示エリア（既存） -->
      <div class="end-stats">
        <div class="stat-item">
          <span class="stat-label">キル</span>
          <span class="stat-value" data-stat="kills">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">命中</span>
          <span class="stat-value" data-stat="hits">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">被弾</span>
          <span class="stat-value" data-stat="damage">0</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">生存時間</span>
          <span class="stat-value" data-stat="time">0:00</span>
        </div>
      </div>

      <!-- 対戦相手のデータ -->
      <div class="opponents-section">
        <h3 class="section-title">Opponents</h3>
        <div id="opponents-data" class="opponents-container"></div>
      </div>

      <button class="button" id="backToConnectBtn">
        接続画面に戻る
      </button>

    </div>
  </section>
</main>

<section id="development" class="development hidden">
  <span class="development-line-top"></span>
  <p class="development-head">ここから下は開発用です。</p>
  
  <div class="dev-state-switch">
    <p class="development-title">画面遷移</p>
    <button data-dev-state="IDLE" class="mini-button">OFFへ</button>
    <button data-dev-state="PLAYING" class="mini-button">ONへ</button>
    <button data-dev-state="END" class="mini-button">ENDへ</button>
  </div>

  <div class="dev-bluetooth-toggle">
    <p class="development-title">銃・防具 接続</p>
    <button class="dev-toggle-btn button"data-dev-device="gun"data-dev-connected="false">銃: OFF</button>
    <button class="dev-toggle-btn button"data-dev-device="armor"data-dev-connected="false">防具: OFF</button>
  </div>

  <!-- Bluetooth接続 -->
  <div>
    <p class="development-title">Bluetooth接続</p>
    <button class="button" id="devConnectButton">Bluetooth 接続</button>
    <button class="button" id="devReconnectButton">Bluetooth 再接続</button>
  </div>
      
  <!-- ダメージ設定 -->
  <div>
    <p class="development-title">ダメージ検証</p>
    <div>
      <label for="damageInput">ダメージ値:</label>
      <input class="input" type="number" id="damageInput" min="1" max="100" value="10">
    </div>

    <button id="DamageButton" class="button">全体ダメージ</button>

    <div>
      <button id="partDamage1" class="damage mini-button">頭</button>
      <button id="partDamage2" class="damage mini-button">胴体</button>
      <button id="partDamage3" class="damage mini-button">左腕</button>
      <button id="partDamage4" class="damage mini-button">右腕</button>
      <button id="partDamage5" class="damage mini-button">左脚</button>
      <button id="partDamage6" class="damage mini-button">右脚</button>
    </div>
  </div>

  <!-- 回復設定 -->
  <div>
    <p class="development-title">回復検証</p>
    <div>
      <label for="healInput">回復値:</label>
      <input class="input" type="number" id="healInput" min="1" max="100" value="10">
    </div>

    <button id="DamageHealButton" class="button">全体回復</button>

    <div>
      <button id="partHeal1" class="damage mini-button">頭</button>
      <button id="partHeal2" class="damage mini-button">胴体</button>
      <button id="partHeal3" class="damage mini-button">左腕</button>
      <button id="partHeal4" class="damage mini-button">右腕</button>
      <button id="partHeal5" class="damage mini-button">左脚</button>
      <button id="partHeal6" class="damage mini-button">右脚</button>
    </div>
  </div>

  <!-- HP設定 -->
  <div style="display: grid;">
    <p class="development-title">体力設定</p>
    <div>
      <label for="headHpInput" style="margin-left: 15px;">頭のHP:</label>
      <input class="input2" type="number" id="headHpInput" min="1" max="100" value="100">
      <label for="torsoHpInput">胴体のHP:</label>
      <input class="input2" type="number" id="torsoHpInput" min="1" max="100" value="100">
    </div>

    <div>
      <label for="leftarmHpInput">左腕のHP:</label>
      <input class="input2" type="number" id="leftarmHpInput" min="1" max="100" value="100">
      <label for="rightarmHpInput">右腕のHP:</label>
      <input class="input2" type="number" id="rightarmHpInput" min="1" max="100" value="100">
    </div>

    <div>
      <label for="leftlegHpInput">左脚のHP:</label>
      <input class="input2" type="number" id="leftlegHpInput" min="1" max="100" value="100">
      <label for="rightlegHpInput">右脚のHP:</label>
      <input class="input2" type="number" id="rightlegHpInput" min="1" max="100" value="100">
    </div>

    <button id="updateHpButton" class="button">体力更新</button>
  </div>

  <!-- 弾数設定 -->
  <div class="ammo-settings">
    <p class="development-title">弾数設定</p>
    <div>
      <input class="input" type="number" id="bulletInput" min="1" max="30" value="5">
      <label for="reserveInput">／</label>
      <input class="input" type="number" id="maxBulletInput" min="1" max="30" value="5">
      <button id="updateAmmoButton" class="button">装填弾数更新</button>
    </div>

    <div>
      <input class="input" type="number" id="reserveInput" min="1" max="30" value="5">
      <label for="maxReserveInput">／</label>
      <input class="input" type="number" id="maxReserveInput" min="1" max="30" value="5">
      <button id="updateMaxAmmoButton" class="button">予備マガジン更新</button>
    </div>
    <button id="healthCheck" class="button">射撃</button>
    <button id="reloadButton" class="button">リロード</button>
  </div>

  <!-- リセット -->
  <div class="debug-reset">
    <p class="development-title">リセット</p>
    <button id="damageReset" class="damage button">体力リセット</button>
    <button id="resetButton" class="button">弾数リセット</button>
    <button id="fullReset" class="button">全てリセット</button>
  </div>

  <!-- その他設定 -->
  <div class="development-others">
    <p class="development-title">その他開発用</p>
    <button id="send-ir" class="send-ir button">赤外線発射(10ダメージ)</button>
    <button id="testDownVideo" class="button">ダウン時検証</button>
    <button id="testPopupShoot" class="button">🎯 射撃テスト表示</button>
    <button id="testPopupHit" class="button">💥 被弾テスト表示</button>
  </div>

  <p class="development-head">ここまでが開発用です。</p>
  <span class="development-line-bottom"></span>
</section>

<footer class="game-footer">© SPEC GGO</footer>

<!-- JavaScript無効時の警告 -->
<noscript>
  <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;font-size:18px;">
    <p>⚠️ このゲームにはJavaScriptが必要です。</p>
    <p>ブラウザの設定でJavaScriptを有効にしてください。</p>
  </div>
</noscript>

<!-- メインスクリプト（ES6 modules） -->
<script type="module" src="./js/linkon-main.js"></script>
</body>
</html>