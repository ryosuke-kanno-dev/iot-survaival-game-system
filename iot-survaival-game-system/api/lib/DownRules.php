<?php

/**
 * DownRules.php
 * ダウン判定ルール集約クラス
 * 
 * 責務：
 * - 試合ルールに応じたDOWN判定
 * - 判定ロジックの一元管理
 * - 拡張可能な設計
 * 
 * 対応ルール：
 * - TOTAL_HP_ZERO: 合計HPが0でDOWN
 * - CORE_PART_ZERO: 頭部または胴体が0でDOWN
 * - ANY_PART_ZERO: いずれかの部位が0でDOWN
 * - ALL_PARTS_ZERO: 全部位が0でDOWN
 * - MULTIPLE_PARTS_ZERO: 複数部位（2個以上）が0でDOWN
 */

class DownRules
{

  // ==========================================
  // ルール定数（down-checker.js と対応）
  // ==========================================

  const TOTAL_HP_ZERO = 'TOTAL_HP_ZERO';
  const CORE_PART_ZERO = 'CORE_PART_ZERO';
  const ANY_PART_ZERO = 'ANY_PART_ZERO';
  const ALL_PARTS_ZERO = 'ALL_PARTS_ZERO';
  const MULTIPLE_PARTS_ZERO = 'MULTIPLE_PARTS_ZERO';
    
    // ==========================================
    // メイン判定メソッド
    // ==========================================

  /**
   * DOWN判定を実行
   * 
   * @param string $rule ルール名
   * @param array $playerData プレイヤーデータ
   * @return array ['isDown' => bool, 'reason' => string]
   */
  public static function check($rule, $playerData)
  {
    // バリデーション
    if (!self::isValidRule($rule)) {
      error_log("[DownRules] Invalid rule: {$rule}");
      // デフォルトルールにフォールバック
      $rule = self::TOTAL_HP_ZERO;
    }

    if (!self::isValidPlayerData($playerData)) {
      error_log("[DownRules] Invalid player data");
      return ['isDown' => false, 'reason' => 'Invalid data'];
    }

    // ルールに応じて判定
    switch ($rule) {
      case self::TOTAL_HP_ZERO:
        return self::checkTotalHpZero($playerData);

      case self::CORE_PART_ZERO:
        return self::checkCorePartZero($playerData);

      case self::ANY_PART_ZERO:
        return self::checkAnyPartZero($playerData);

      case self::ALL_PARTS_ZERO:
        return self::checkAllPartsZero($playerData);

      case self::MULTIPLE_PARTS_ZERO:
        return self::checkMultiplePartsZero($playerData);

      default:
        return self::checkTotalHpZero($playerData);
    }
  }
    
    // ==========================================
    // 個別判定ロジック（private static）
    // ==========================================

  /**
   * 合計HPが0かチェック
   * @param array $player プレイヤーデータ
   * @return array
   */
  private static function checkTotalHpZero($player)
  {
    $totalHP = $player['hp_head'] +
      $player['hp_torso'] +
      $player['hp_right_arm'] +
      $player['hp_left_arm'] +
      $player['hp_right_leg'] +
      $player['hp_left_leg'];

    $isDown = ($totalHP <= 0);

    return [
      'isDown' => $isDown,
      'reason' => $isDown ? 'Total HP = 0' : '',
      'totalHP' => $totalHP
    ];
  }

  /**
   * コア部位（頭または胴体）が0かチェック
   * @param array $player プレイヤーデータ
   * @return array
   */
  private static function checkCorePartZero($player)
  {
    $headZero = ($player['hp_head'] <= 0);
    $torsoZero = ($player['hp_torso'] <= 0);
    $isDown = $headZero || $torsoZero;

    $reason = '';
    if ($headZero && $torsoZero) {
      $reason = 'Head and Torso HP = 0';
    } elseif ($headZero) {
      $reason = 'Head HP = 0';
    } elseif ($torsoZero) {
      $reason = 'Torso HP = 0';
    }

    return [
      'isDown' => $isDown,
      'reason' => $reason
    ];
  }

  /**
   * いずれかの部位が0かチェック
   * @param array $player プレイヤーデータ
   * @return array
   */
  private static function checkAnyPartZero($player)
  {
    $zeroParts = [];

    if ($player['hp_head'] <= 0) $zeroParts[] = 'head';
    if ($player['hp_torso'] <= 0) $zeroParts[] = 'torso';
    if ($player['hp_right_arm'] <= 0) $zeroParts[] = 'right_arm';
    if ($player['hp_left_arm'] <= 0) $zeroParts[] = 'left_arm';
    if ($player['hp_right_leg'] <= 0) $zeroParts[] = 'right_leg';
    if ($player['hp_left_leg'] <= 0) $zeroParts[] = 'left_leg';

    $isDown = count($zeroParts) > 0;

    return [
      'isDown' => $isDown,
      'reason' => $isDown ? implode(', ', $zeroParts) . ' HP = 0' : '',
      'zeroParts' => $zeroParts
    ];
  }

  /**
   * 全部位が0かチェック
   * @param array $player プレイヤーデータ
   * @return array
   */
  private static function checkAllPartsZero($player)
  {
    $isDown = ($player['hp_head'] <= 0) &&
      ($player['hp_torso'] <= 0) &&
      ($player['hp_right_arm'] <= 0) &&
      ($player['hp_left_arm'] <= 0) &&
      ($player['hp_right_leg'] <= 0) &&
      ($player['hp_left_leg'] <= 0);

    return [
      'isDown' => $isDown,
      'reason' => $isDown ? 'All parts HP = 0' : ''
    ];
  }

  /**
   * 複数部位（N個以上）が0かチェック
   * @param array $player プレイヤーデータ
   * @param int $threshold 閾値（デフォルト: 2）
   * @return array
   */
  private static function checkMultiplePartsZero($player, $threshold = 2)
  {
    $zeroParts = 0;

    if ($player['hp_head'] <= 0) $zeroParts++;
    if ($player['hp_torso'] <= 0) $zeroParts++;
    if ($player['hp_right_arm'] <= 0) $zeroParts++;
    if ($player['hp_left_arm'] <= 0) $zeroParts++;
    if ($player['hp_right_leg'] <= 0) $zeroParts++;
    if ($player['hp_left_leg'] <= 0) $zeroParts++;

    $isDown = ($zeroParts >= $threshold);

    return [
      'isDown' => $isDown,
      'reason' => $isDown ? "{$zeroParts} parts HP = 0 (threshold: {$threshold})" : '',
      'zeroParts' => $zeroParts
    ];
  }
    
    // ==========================================
    // バリデーション
    // ==========================================

  /**
   * ルールが有効かチェック
   * @param string $rule ルール名
   * @return bool
   */
  private static function isValidRule($rule)
  {
    $validRules = [
      self::TOTAL_HP_ZERO,
      self::CORE_PART_ZERO,
      self::ANY_PART_ZERO,
      self::ALL_PARTS_ZERO,
      self::MULTIPLE_PARTS_ZERO
    ];

    return in_array($rule, $validRules, true);
  }

  /**
   * プレイヤーデータが有効かチェック
   * @param array $player プレイヤーデータ
   * @return bool
   */
  private static function isValidPlayerData($player)
  {
    $requiredKeys = [
      'hp_head',
      'hp_torso',
      'hp_right_arm',
      'hp_left_arm',
      'hp_right_leg',
      'hp_left_leg'
    ];

    foreach ($requiredKeys as $key) {
      if (!isset($player[$key]) || !is_numeric($player[$key])) {
        return false;
      }
    }

    return true;
  }
    
    // ==========================================
    // ユーティリティ（Admin画面用）
    // ==========================================

  /**
   * 利用可能なルール一覧を取得
   * @return array ルール名の配列
   */
  public static function getAvailableRules()
  {
    return [
      self::TOTAL_HP_ZERO,
      self::CORE_PART_ZERO,
      self::ANY_PART_ZERO,
      self::ALL_PARTS_ZERO,
      self::MULTIPLE_PARTS_ZERO
    ];
  }

  /**
   * ルールの説明を取得（Admin画面用）
   * @param string $rule ルール名
   * @return string 説明文
   */
  public static function getRuleDescription($rule)
  {
    $descriptions = [
      self::TOTAL_HP_ZERO => '合計HPが0でDOWN（耐久重視）',
      self::CORE_PART_ZERO => '頭部または胴体が0でDOWN（バランス型）',
      self::ANY_PART_ZERO => 'いずれかの部位が0でDOWN（高難易度）',
      self::ALL_PARTS_ZERO => '全部位が0でDOWN（低難易度）',
      self::MULTIPLE_PARTS_ZERO => '複数部位（2個以上）が0でDOWN（中難易度）'
    ];

    return $descriptions[$rule] ?? '不明なルール';
  }
}
