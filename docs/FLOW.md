# 全体の処理フロー説明

SPEC-IR システムにおける主要なユースケースの処理フローをシーケンス図で解説します。

---

## 1. ゲーム開始までの流れ

接続からAdminが試合を開始するまでの準備フローです。

```mermaid
sequenceDiagram
    participant P as Player UI
    participant BT as Bluetooth Manager
    participant SS as ServerSync (Polling)
    participant API as Backend API
    participant AD as Admin UI

    P->>SS: Initialize & Start Polling
    SS->>API: get_players.php / get_match.php (2秒毎)
    P->>BT: Bluetooth機器接続操作
    BT-->>P: 接続完了 (connected = true)
    P->>API: update_player.php (ready = 1 送信)
    
    Note over AD,API: 全員の準備ができたらAdminが開始操作
    AD->>API: update_match.php (status = 'PLAYING', duration = X)
    API-->>AD: 成功
    
    SS->>API: get_match.php
    API-->>SS: status = 'PLAYING', start_time設定済み
    SS->>P: matchStatusChanged イベント発火
    P->>P: PLAYING 状態へ遷移 (カウントダウン開始)
```

---

## 2. 被弾からHP反映までの流れ

赤外線被弾からダメージが反映されるまでのサーバー権威フローです。

```mermaid
sequenceDiagram
    participant BT as Bluetooth Manager
    participant SS as ServerSync
    participant API as apply_damage.php
    participant DB as Database
    participant HM as Health Manager

    BT->>BT: IRセンサー反応 (processIRDamage)
    Note over BT: PLAYING中か確認 (テストモード時はポップアップのみ)
    BT->>SS: sendDamageWithRetry({bodyPart, damageAmount})
    SS->>API: POST リクエスト
    
    API->>DB: トランザクション & 重複チェック
    API->>DB: HP計算 & ルールチェック
    DB-->>API: 算出された新しいHP
    API-->>SS: { success: true, new_hp: X, is_down: false }
    
    SS-->>BT: result返却
    BT->>HM: updateLocalHealthFromServer(result)
    Note over HM: UIに即座にHP反映
    
    Note over SS,HM: または後続の get_players.php ポーリングにて他プレイヤー含め同期
```

---

## 3. DOWN判定からゲーム終了までの流れ

いずれかのルールの条件を満たし、サーバーでDOWN判定された際のフローです。

```mermaid
sequenceDiagram
    participant API as apply_damage.php
    participant DB as Database
    participant SS as ServerSync
    participant GS as Game State
    participant HM as Health Manager

    API->>DB: 試合の down_rule を取得＆判定
    Note over API,DB: 例: CORE_PART_ZERO (頭と胴体が0) に合致
    API->>DB: player_state を 'DOWN' に更新
    API-->>SS: { is_down: true, player_state: 'DOWN' }
    
    SS->>GS: gameState.down("Server validation")
    GS->>GS: DOWN画面（動画等）の表示
    
    Note over SS,HM: get_players.php のポーリングでも検知
    SS->>HM: 全プレイヤーState同期、UI反映
```

---

## 4. Admin操作の流れ

Adminが管理画面から特定プレイヤーのステータスを直接操作・補正するフローです。

```mermaid
sequenceDiagram
    participant AD as Admin UI
    participant API as admin_player_control.php
    participant DB as Database
    participant SS as Player ServerSync
    participant P as Player UI

    AD->>AD: 「HP全回復」または「強制ダウン」ボタン押下
    AD->>API: POST { action: 'reset_hp' / 'force_down', player_id: X }
    
    API->>DB: player_state, 該当HPカラム, version更新
    API-->>AD: success
    
    SS->>DB: get_players.php (2秒毎ポーリング)
    DB-->>SS: diff (version変更検知)
    SS->>P: playersDataChanged イベント
    P->>P: 画面が強制的に PLAYING や DOWN へ書き換わる
```

---

## 5. Bluetooth切断・再接続の流れ

ハードウェアの通信が切れた際の安全保護ループです。

```mermaid
sequenceDiagram
    participant HW as Hardware (Gun/Armor)
    participant BT as Bluetooth Manager
    participant UI as UI Overlays
    participant GS as Game State

    HW--xBT: 物理的に接続切断 (Event 発火)
    BT->>BT: handleDisconnection()
    BT->>GS: isBluetoothConnected = false
    
    Note over BT,UI: 他の操作（射撃や被弾）をブロック
    BT->>UI: showDisconnectWarning() -> 赤い警告オーバーレイ表示
    
    Player->>UI: 「手動で再接続する」ボタン押下
    UI->>BT: connect() 呼び出し
    BT->>HW: 再接続成功
    BT->>GS: isBluetoothConnected = true
    BT->>UI: hideDisconnectWarning()
    Note over BT,UI: ゲーム処理が再開
```

---

## 6. タイマー時間切れの流れ

クライアント側で時間を管理し、サーバーと同期しながら終了を主導するフローです。

```mermaid
sequenceDiagram
    participant POL as Polling (get_match)
    participant SS as ServerSync
    participant UI as UI Stats
    participant API as update_match.php

    POL-->>SS: start_time と duration を取得
    SS->>SS: 現在のサーバー時間との差分（残り時間）計算
    
    SS->>UI: uiStats.setRemainingTime(秒) で補正
    Note over UI: UI内部の setInterval で毎秒カウントダウン
    
    SS->>SS: 毎回のポーリング時、残り時間 <= 0 をチェック
    SS->>API: get_players.php (全員の最新HPを取得して引き分け/勝者IDを判定)
    SS->>API: triggerAutoMatchEnd() 呼び出し (status = 'FINISHED', winner_player_id = NULL等)
    API-->>SS: 成功
    
    SS->>SS: matchStatusChanged ('FINISHED')
    SS->>UI: END画面遷移
```

---

## 7. 通信エラー・リトライの流れ

ネットワークが不安定な野外等でパケットロスが発生した場合のバックアップフローです。

```mermaid
sequenceDiagram
    participant BT as Bluetooth Manager
    participant SS as ServerSync
    participant Q as Memory Queue
    participant API as apply_damage.php

    BT->>SS: sendDamageWithRetry() (id: REQ_123 生成)
    SS->>API: POST リクエスト
    API--xSS: Network Error / Timeout
    
    SS->>Q: キューに {payload: REQ_123, retryCount: 0} 追加
    SS-->>BT: { success: false, reason: "queued" } (UI即時更新スキップ)
    
    Note over SS,Q: 3秒後 (1回目の自動リトライ)
    SS->>API: executeDamageRetry()
    API->>API: damage_requests テーブルで REQ_123 重複チェック
    Note over API: 未処理ならトランザクション処理して保存
    API-->>SS: success (または already_processed)
    
    SS->>Q: キューから REQ_123 を削除
    SS->>BT: UI状態等の後追い更新
```

---

## 8. リマッチ（再試合）の流れ

試合終了後からデバイスを切断せずに、そのまま次の試合へ移行する際のフローです。

```mermaid
sequenceDiagram
    participant AD as Admin UI
    participant API as update_match.php
    participant SS as Player ServerSync
    participant GS as Game State
    participant LM as LinkON Main

    AD->>API: リセット実行 (status = 'WAITING')
    API-->>AD: 成功
    
    SS->>API: get_match.php (ポーリング)
    API-->>SS: status = 'WAITING'
    SS->>LM: matchStatusChanged ('WAITING')
    
    LM->>GS: gameState.reset() (IDLEへ遷移)
    LM->>LM: checkConnectionAndTransition()
    
    Note over LM,GS: Bluetooth接続が維持されている場合
    LM->>GS: CONNECTING 経由で即座に READY へ遷移
    LM->>API: update_player.php (ready = 1 再送信)
```
