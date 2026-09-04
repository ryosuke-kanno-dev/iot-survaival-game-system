-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: battle_arena
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `damage_requests`
--

DROP TABLE IF EXISTS `damage_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `damage_requests` (
  `request_id` varchar(64) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`request_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `game_events`
--

DROP TABLE IF EXISTS `game_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `game_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `match_id` int(11) NOT NULL COMMENT '試合ID',
  `player_id` int(11) DEFAULT NULL COMMENT 'プレイヤーID（NULLの場合は試合全体イベント）',
  `event_type` varchar(50) NOT NULL COMMENT 'イベント種別（HIT/KILL/DAMAGE/DOWN/REVIVE/etc）',
  `event_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'イベント詳細データ（JSON形式）' CHECK (json_valid(`event_data`)),
  `created_at` datetime DEFAULT current_timestamp() COMMENT 'イベント発生日時',
  PRIMARY KEY (`id`),
  KEY `idx_match_event` (`match_id`,`event_type`),
  KEY `idx_player_event` (`player_id`,`event_type`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_event_type` (`event_type`),
  CONSTRAINT `fk_event_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_event_player` FOREIGN KEY (`player_id`) REFERENCES `players` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='ゲームイベントログテーブル（将来の拡張用）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `matches`
--

DROP TABLE IF EXISTS `matches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `matches` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `status` enum('WAITING','PLAYING','PAUSED','FINISHED') NOT NULL DEFAULT 'WAITING' COMMENT '試合状態: WAITING=待機中, PLAYING=プレイ中, PAUSED=一時停止, FINISHED=終了',
  `down_rule` varchar(50) DEFAULT 'TOTAL_HP_ZERO' COMMENT 'ダウン判定ルール: TOTAL_HP_ZERO=合計HP0, CORE_PART_ZERO=頭胴体0, ANY_PART_ZERO=任意部位0, ALL_PARTS_ZERO=全部位0, MULTIPLE_PARTS_ZERO=複数部位0',
  `duration` int(11) DEFAULT 180,
  `paused_elapsed_time` int(11) DEFAULT 0 COMMENT '一時停止までに経過した累計時間（秒）',
  `start_time` datetime DEFAULT NULL COMMENT 'ゲーム開始時刻',
  `end_time` datetime DEFAULT NULL COMMENT 'ゲーム終了時刻',
  `winner_player_id` int(11) DEFAULT NULL COMMENT '勝利プレイヤーID（NULLの場合は引き分け）',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '作成日時',
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '更新日時',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_start_time` (`start_time`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='試合全体の状態管理テーブル';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `players`
--

DROP TABLE IF EXISTS `players`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `players` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `match_id` int(11) NOT NULL COMMENT '試合ID',
  `player_number` int(11) NOT NULL COMMENT 'プレイヤー番号（1,2,...）',
  `name` varchar(50) DEFAULT NULL COMMENT 'プレイヤー名',
  `player_state` enum('IDLE','CONNECTING','READY','PLAYING','DOWN','END') NOT NULL DEFAULT 'IDLE' COMMENT 'プレイヤー状態: IDLE=待機, CONNECTING=接続中, READY=準備完了, PLAYING=プレイ中, DOWN=ダウン, END=終了',
  `hp_head` int(11) NOT NULL DEFAULT 100 COMMENT '頭部HP (0-100)',
  `hp_torso` int(11) NOT NULL DEFAULT 100 COMMENT '胴体HP (0-100)',
  `hp_right_arm` int(11) NOT NULL DEFAULT 100 COMMENT '右腕HP (0-100)',
  `hp_left_arm` int(11) NOT NULL DEFAULT 100 COMMENT '左腕HP (0-100)',
  `hp_right_leg` int(11) NOT NULL DEFAULT 100 COMMENT '右足HP (0-100)',
  `hp_left_leg` int(11) NOT NULL DEFAULT 100 COMMENT '左足HP (0-100)',
  `hp_total` int(11) NOT NULL DEFAULT 600 COMMENT '合計HP（トリガーで自動計算、0-600）',
  `limb_destroyed_right_arm` tinyint(1) NOT NULL DEFAULT 0 COMMENT '右腕破壊フラグ (0=正常, 1=破壊)',
  `limb_destroyed_left_arm` tinyint(1) NOT NULL DEFAULT 0 COMMENT '左腕破壊フラグ (0=正常, 1=破壊)',
  `limb_destroyed_right_leg` tinyint(1) NOT NULL DEFAULT 0 COMMENT '右足破壊フラグ (0=正常, 1=破壊)',
  `limb_destroyed_left_leg` tinyint(1) NOT NULL DEFAULT 0 COMMENT '左足破壊フラグ (0=正常, 1=破壊)',
  `ammo_current` int(11) NOT NULL DEFAULT 30 COMMENT 'マガジン内弾数（0-30）',
  `ammo_reserve` int(11) NOT NULL DEFAULT 5 COMMENT '予備マガジン数（0-5）',
  `kills` int(11) NOT NULL DEFAULT 0 COMMENT 'キル数',
  `hits` int(11) NOT NULL DEFAULT 0 COMMENT '命中数',
  `damage_taken` int(11) NOT NULL DEFAULT 0 COMMENT '被弾数',
  `play_time` int(11) NOT NULL DEFAULT 0 COMMENT 'プレイ時間（秒）',
  `bluetooth_gun_connected` tinyint(1) NOT NULL DEFAULT 0 COMMENT '銃デバイス接続状態 (0=未接続, 1=接続済)',
  `bluetooth_armor_connected` tinyint(1) NOT NULL DEFAULT 0 COMMENT '防具デバイス接続状態 (0=未接続, 1=接続済)',
  `ready` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'READY状態フラグ (0=未準備, 1=準備完了)',
  `version` int(11) NOT NULL DEFAULT 0 COMMENT '更新バージョン（更新ごとに+1、ポーリング差分検出用）',
  `last_update` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '最終更新日時',
  `created_at` datetime DEFAULT current_timestamp() COMMENT '作成日時',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_match_player_number` (`match_id`,`player_number`),
  KEY `idx_match_player` (`match_id`,`player_number`),
  KEY `idx_player_state` (`player_state`),
  KEY `idx_version` (`version`),
  KEY `idx_last_update` (`last_update`),
  CONSTRAINT `fk_match` FOREIGN KEY (`match_id`) REFERENCES `matches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='プレイヤーのリアルタイム状態管理テーブル';
/*!40101 SET character_set_client = @saved_cs_client */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_players_before_insert
BEFORE INSERT ON players
FOR EACH ROW
BEGIN
    -- hp_total 自動計算
    SET NEW.hp_total = NEW.hp_head + NEW.hp_torso + NEW.hp_right_arm + 
                       NEW.hp_left_arm + NEW.hp_right_leg + NEW.hp_left_leg;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'NO_ZERO_IN_DATE,NO_ZERO_DATE,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
/*!50003 CREATE*/ /*!50017 DEFINER=`root`@`localhost`*/ /*!50003 TRIGGER trg_players_before_update
BEFORE UPDATE ON players
FOR EACH ROW
BEGIN
    -- ==========================================
    -- 処理1: hp_total 自動計算
    -- 部位HPが変更された場合、合計値も自動更新
    -- ==========================================
    SET NEW.hp_total = NEW.hp_head + NEW.hp_torso + NEW.hp_right_arm + 
                       NEW.hp_left_arm + NEW.hp_right_leg + NEW.hp_left_leg;
    
    -- ==========================================
    -- 処理2: version 自動インクリメント
    -- ポーリング差分検出用
    -- 任意のカラム更新時に必ず+1される
    -- ==========================================
    SET NEW.version = OLD.version + 1;
END */;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-20 11:31:24
