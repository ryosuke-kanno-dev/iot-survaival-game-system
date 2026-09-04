# データベース定義書

SPEC-IR システムで使用する `battle_arena` データベースのテーブル構成と、環境をゼロから構築するための完全なSQLスクリプトを記載します。

## テーブル一覧

| テーブル名 | 役割 |
|---|---|
| `matches` | 試合全体の状態・ルール・残り時間（タイマー基準）を管理する |
| `players` | 参加プレイヤー全員の個別HP、弾薬、BLE接続状態、スコア等を管理する |
| `damage_requests` | 通信リトライによるダメージ二重適用を防ぐための処理済みID記録 |
| `game_events` | ※将来の拡張用（システム上の各種イベントログを記録） |

---

## 各テーブルの詳細

### 1. `matches` (試合管理)

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| `id` | INT | NO | AUTO_INCREMENT | 試合ID（主キー） |
| `status` | ENUM | NO | 'WAITING' | 試合状態 ('WAITING', 'PLAYING', 'FINISHED') |
| `down_rule` | VARCHAR(50) | NO | 'TOTAL_HP_ZERO' | 適用ルール ('TOTAL_HP_ZERO', 'CORE_PART_ZERO' 等全5種) |
| `duration` | INT | NO | 180 | 試合時間（秒） |
| `paused_elapsed_time` | INT | YES | 0 | 一時停止までに経過した累計時間（秒） |
| `start_time` | DATETIME | YES | NULL | 試合開始時刻（タイマー同期基準値） |
| `end_time` | DATETIME | YES | NULL | 試合終了時刻 |
| `winner_player_id` | INT | YES | NULL | 勝者ID（NULLは引き分け） |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | 作成日時 |
| `updated_at` | DATETIME | NO | CURRENT_TIMESTAMP | 更新日時（レコード変更時に自動更新）|

### 2. `players` (プレイヤー管理)

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| `id` | INT | NO | AUTO_INCREMENT | プレイヤーID（主キー） |
| `match_id` | INT | NO | - | 参加中の試合ID (外部キー: `matches.id`のカスケード削除) |
| `player_number` | INT | NO | - | プレイヤー番号(1, 2) |
| `name` | VARCHAR(50) | YES| NULL | プレイヤー表示名 |
| `player_state` | ENUM | NO | 'IDLE' | 現状態 ('IDLE', 'CONNECTING', 'READY', 'PLAYING', 'DOWN', 'END') |
| `hp_head` | INT | NO | 100 | 頭部HP (0-100) ※以下Torso, Arms, Legs も同様に各100 |
| `hp_total` | INT | NO | 600 | 合計HP **※DBトリガー(BEFORE UPDATE等)で自動計算される** |
| `ammo_current` | INT | NO | 30 | マガジン内弾数（0-30） |
| `ammo_reserve` | INT | NO | 5 | 予備マガジン数（0-5） |
| `bluetooth_gun_connected`| TINYINT(1)| NO| 0 | 銃デバイスのBLE接続（1=接続済） |
| `bluetooth_armor_connected`| TINYINT(1)| NO | 0 | 防具デバイスのBLE接続（1=接続済） |
| `ready` | TINYINT(1)| NO | 0 | READYフラグ |
| `version` | INT | NO | 0 | 変更バージョン（差分ポーリング用に変更時自動+1される） |
| `last_update` | DATETIME | NO | CURRENT_TIMESTAMP | 最終更新日時（自動更新） |

### 3. `damage_requests` (重複実行防止キュー)

通信エラー発生時、同じダメージリクエストが複数回来た場合弾くためのキーボードテーブル。

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---|---|---|---|---|
| `request_id` | VARCHAR(64) | NO | - | リクエスト一意キー(UUID等) (主キー) |
| `created_at` | DATETIME | NO | CURRENT_TIMESTAMP | 登録日時。試合リセット時にクリアされる |

---

## データベース一括構築SQLスクリプト

新規環境のXAMPPなどで実行することで、**すべてのテーブル構造と動作に必要な初期データ**を含んだ状態を作り出す完全なSQLです。

```sql
-- ==========================================================
-- 1. データベース作成
-- ==========================================================
CREATE DATABASE IF NOT EXISTS battle_arena CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE battle_arena;

-- ==========================================================
-- 2. テーブル削除 (再構築用)
-- ==========================================================
DROP TRIGGER IF EXISTS trg_players_before_insert;
DROP TRIGGER IF EXISTS trg_players_before_update;
DROP TABLE IF EXISTS game_events;
DROP TABLE IF EXISTS damage_requests;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS matches;

-- ==========================================================
-- 3. テーブル作成
-- ==========================================================
CREATE TABLE matches (
  id INT NOT NULL AUTO_INCREMENT,
  status ENUM('WAITING','PLAYING','PAUSED','FINISHED') NOT NULL DEFAULT 'WAITING' COMMENT '試合状態',
  down_rule VARCHAR(50) DEFAULT 'TOTAL_HP_ZERO' COMMENT 'ダウン判定ルール',
  duration INT DEFAULT 180 COMMENT '試合時間（秒）',
  paused_elapsed_time INT DEFAULT 0 COMMENT '一時停止までに経過した累計時間（秒）',
  start_time DATETIME DEFAULT NULL COMMENT 'ゲーム開始時刻',
  end_time DATETIME DEFAULT NULL COMMENT 'ゲーム終了時刻',
  winner_player_id INT DEFAULT NULL COMMENT '勝利プレイヤーID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE players (
  id INT NOT NULL AUTO_INCREMENT,
  match_id INT NOT NULL COMMENT '試合ID',
  player_number INT NOT NULL,
  name VARCHAR(50) DEFAULT NULL,
  player_state ENUM('IDLE','CONNECTING','READY','PLAYING','DOWN','END') NOT NULL DEFAULT 'IDLE',
  hp_head INT NOT NULL DEFAULT 100,
  hp_torso INT NOT NULL DEFAULT 100,
  hp_right_arm INT NOT NULL DEFAULT 100,
  hp_left_arm INT NOT NULL DEFAULT 100,
  hp_right_leg INT NOT NULL DEFAULT 100,
  hp_left_leg INT NOT NULL DEFAULT 100,
  hp_total INT NOT NULL DEFAULT 600 COMMENT '合計HP（トリガーで自動計算）',
  limb_destroyed_right_arm TINYINT(1) NOT NULL DEFAULT 0,
  limb_destroyed_left_arm TINYINT(1) NOT NULL DEFAULT 0,
  limb_destroyed_right_leg TINYINT(1) NOT NULL DEFAULT 0,
  limb_destroyed_left_leg TINYINT(1) NOT NULL DEFAULT 0,
  ammo_current INT NOT NULL DEFAULT 30,
  ammo_reserve INT NOT NULL DEFAULT 5,
  kills INT NOT NULL DEFAULT 0,
  hits INT NOT NULL DEFAULT 0,
  damage_taken INT NOT NULL DEFAULT 0,
  play_time INT NOT NULL DEFAULT 0,
  bluetooth_gun_connected TINYINT(1) NOT NULL DEFAULT 0,
  bluetooth_armor_connected TINYINT(1) NOT NULL DEFAULT 0,
  ready TINYINT(1) NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 0 COMMENT 'ポーリング差分検出用',
  last_update DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_match_player_number (match_id, player_number),
  KEY idx_match_player (match_id, player_number),
  KEY idx_player_state (player_state),
  KEY idx_version (version),
  KEY idx_last_update (last_update),
  CONSTRAINT fk_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE damage_requests (
  request_id VARCHAR(64) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (request_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE game_events (
  id INT NOT NULL AUTO_INCREMENT,
  match_id INT NOT NULL,
  player_id INT DEFAULT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data LONGTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(event_data)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_match_event (match_id, event_type),
  CONSTRAINT fk_event_match FOREIGN KEY (match_id) REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_event_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ==========================================================
-- 4. DBトリガー設定 (versionとhp_totalの自動計算)
-- ==========================================================
DELIMITER //

CREATE TRIGGER trg_players_before_insert
BEFORE INSERT ON players
FOR EACH ROW
BEGIN
    SET NEW.hp_total = NEW.hp_head + NEW.hp_torso + NEW.hp_right_arm + 
                       NEW.hp_left_arm + NEW.hp_right_leg + NEW.hp_left_leg;
END //

CREATE TRIGGER trg_players_before_update
BEFORE UPDATE ON players
FOR EACH ROW
BEGIN
    -- hp_total 自動計算
    SET NEW.hp_total = NEW.hp_head + NEW.hp_torso + NEW.hp_right_arm + 
                       NEW.hp_left_arm + NEW.hp_right_leg + NEW.hp_left_leg;
    
    -- version 自動インクリメント(ポーリング差分判定用)
    SET NEW.version = OLD.version + 1;
END //

DELIMITER ;

-- ==========================================================
-- 5. テスト用初期データ INSERT
-- ==========================================================
INSERT INTO matches (id, status, down_rule, duration, start_time) 
VALUES (1, 'WAITING', 'TOTAL_HP_ZERO', 180, NULL);

INSERT INTO players (match_id, player_number, name, player_state,
  hp_head, hp_torso, hp_right_arm, hp_left_arm, hp_right_leg, hp_left_leg)
VALUES 
(1, 1, 'Player 1', 'IDLE', 100, 100, 100, 100, 100, 100),
(1, 2, 'Player 2', 'IDLE', 100, 100, 100, 100, 100, 100);

COMMIT;
```
