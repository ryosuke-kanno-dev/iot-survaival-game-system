<?php
/**
 * ==========================================
 * admin_player_control.php
 * Admin画面からの個別プレイヤー操作（HP全回復、強制ダウン）を行うAPI
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

  // 必須パラメータチェック
  if (!isset($input['player_id']) || !isset($input['match_id']) || !isset($input['action'])) {
    errorResponse('player_id, match_id, action は必須です', 400);
  }

  $player_id = (int)$input['player_id'];
  $match_id  = (int)$input['match_id'];
  $action    = $input['action'];

  if ($player_id < 1 || $match_id < 1) {
    errorResponse('player_id と match_id は正の整数である必要があります', 400);
  }

  // トランザクション開始
  $pdo->beginTransaction();

  // プレイヤーの存在確認
  $stmt = $pdo->prepare("SELECT id, match_id, player_state, version FROM players WHERE id = :player_id AND match_id = :match_id FOR UPDATE");
  $stmt->execute([':player_id' => $player_id, ':match_id' => $match_id]);
  $player = $stmt->fetch();

  if (!$player) {
    $pdo->rollBack();
    errorResponse('指定されたプレイヤーが見つかりません', 404);
  }

  $current_version = (int)$player['version'];
  $new_version = $current_version + 1;

  if ($action === 'reset_hp') {
    // HP全回復 & PLAYING状態へ
    $stmt_update = $pdo->prepare("
      UPDATE players 
      SET 
        hp_head = 100,
        hp_torso = 100,
        hp_right_arm = 100,
        hp_left_arm = 100,
        hp_right_leg = 100,
        hp_left_leg = 100,
        hp_total = 600,
        player_state = 'PLAYING',
        version = :new_version,
        last_update = NOW()
      WHERE id = :player_id AND match_id = :match_id
    ");
    $stmt_update->execute([
      ':new_version' => $new_version,
      ':player_id' => $player_id,
      ':match_id' => $match_id,
    ]);

  } elseif ($action === 'force_down') {
    // 強制ダウン
    $stmt_update = $pdo->prepare("
      UPDATE players 
      SET 
        player_state = 'DOWN',
        version = :new_version,
        last_update = NOW()
      WHERE id = :player_id AND match_id = :match_id
    ");
    $stmt_update->execute([
      ':new_version' => $new_version,
      ':player_id' => $player_id,
      ':match_id' => $match_id,
    ]);

  } else {
    $pdo->rollBack();
    errorResponse('無効なアクションです', 400);
  }

  // コミット
  $pdo->commit();

  successResponse([
    'message' => 'プレイヤー操作が完了しました',
    'action' => $action,
    'new_version' => $new_version
  ]);

} catch (PDOException $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  error_log('Database Error in admin_player_control.php: ' . $e->getMessage());
  errorResponse('データベースエラーが発生しました', 500);
} catch (Exception $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  handleException($e);
}
