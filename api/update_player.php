<?php
/**
 * ==========================================
 * update_player.php
 * プレイヤーの状態・HP・弾薬・戦績を更新するAPI
 * ==========================================
 */
declare(strict_types=1);

require_once 'common.php';

try {
  // POSTメソッドチェック
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    errorResponse('POSTメソッドのみ許可されています', 405);
  }

  // JSON入力を取得
  $input = getJsonInput();

  // player_id 必須チェック
  if (!isset($input['player_id'])) {
    errorResponse('player_id は必須です', 400);
  }

  $playerId = $input['player_id'];

  // player_id の数値チェック
  if (!is_numeric($playerId) || (int)$playerId < 1) {
    errorResponse('player_id は正の整数である必要があります', 400);
  }

  $playerId = (int)$playerId;

  // 更新可能なカラムのホワイトリスト
  $allowedColumns = [
    'player_state',
    'hp_head',
    'hp_torso',
    'hp_right_arm',
    'hp_left_arm',
    'hp_right_leg',
    'hp_left_leg',
    'ammo_current',
    'ammo_reserve',
    'kills',
    'hits',
    'damage_taken',
    'play_time',
    'bluetooth_gun_connected',
    'bluetooth_armor_connected',
    'ready',
    'limb_destroyed_right_arm',
    'limb_destroyed_left_arm',
    'limb_destroyed_right_leg',
    'limb_destroyed_left_leg'
  ];

  // 更新するカラムと値を抽出
  $updateData = [];
  foreach ($input as $key => $value) {
    if (in_array($key, $allowedColumns, true)) {
      $updateData[$key] = $value;
    }
  }

  // 更新項目がない場合
  if (empty($updateData)) {
    errorResponse('更新する項目が指定されていません', 400);
  }

  // トランザクション開始
  $pdo->beginTransaction();

  // 現在の状態を取得
  $stmt = $pdo->prepare("
        SELECT version, player_state 
        FROM players 
        WHERE id = :player_id 
        FOR UPDATE
    ");
  $stmt->execute([':player_id' => $playerId]);
  $player = $stmt->fetch();

  if (!$player) {
    $pdo->rollBack();
    errorResponse('Player not found', 404);
  }

  $currentVersion = (int)$player['version'];
  $currentState = $player['player_state'];

  // 冪等性チェック
  if (isset($updateData['player_state']) && $updateData['player_state'] === $currentState) {
    $pdo->rollBack();
    jsonResponse([
      'status' => 'success',
      'message' => 'Player state already set to ' . $currentState,
      'new_version' => $currentVersion,
      'idempotent' => true
    ], 200);
    exit;
  }

  // ==========================================
  // 修正：version=0 の特別処理
  // version=0 の場合はversionチェックをスキップ
  // （ページロード時のクリーンアップ用）
  // ==========================================
  if (isset($input['version'])) {
    $inputVersion = (int)$input['version'];

    // version=0 はスキップ（特別な初期化リクエスト）
    if ($inputVersion !== 0 && $currentVersion !== $inputVersion) {
      $pdo->rollBack();

      error_log(sprintf(
        "[update_player.php] Version mismatch: player_id=%d, current=%d, received=%d, state=%s",
        $playerId,
        $currentVersion,
        $inputVersion,
        $currentState
      ));

      errorResponse('Version mismatch: データが他のユーザーによって更新されています', 409);
    }

    // ログ記録（デバッグ用）
    if ($inputVersion === 0) {
      error_log(sprintf(
        "[update_player.php] Page load cleanup: player_id=%d, version check skipped",
        $playerId
      ));
    }
  }

  // 動的UPDATE文を構築
  $setClauses = [];
  $params = [':player_id' => $playerId];

  foreach ($updateData as $column => $value) {
    $setClauses[] = "{$column} = :{$column}";
    $params[":{$column}"] = $value;
  }

  $sql = "UPDATE players SET " . implode(', ', $setClauses) . " WHERE id = :player_id";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);

  // 更新後のversionを取得（トリガーで自動的に+1されている）
  $stmt = $pdo->prepare("SELECT version FROM players WHERE id = :player_id");
  $stmt->execute([':player_id' => $playerId]);
  $newVersion = (int)$stmt->fetchColumn();

  // コミット
  $pdo->commit();

  // 成功レスポンス
  jsonResponse([
    'status' => 'success',
    'message' => 'Player updated successfully',
    'new_version' => $newVersion
  ], 200);
} catch (PDOException $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  error_log('Database Error in update_player.php: ' . $e->getMessage());
  errorResponse('Database error occurred', 500);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  handleException($e);
}
