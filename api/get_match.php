<?php
/**
 * ==========================================
 * get_match.php
 * 試合情報（ルールや進行状況）を取得するAPI
 * ==========================================
 */
declare(strict_types=1);

require_once 'common.php';

try {
  // match_id をクエリパラメータから取得
  $matchId = getQueryParam('match_id', true);

  // 数値チェック
  if (!is_numeric($matchId) || (int)$matchId < 1) {
    errorResponse('match_id は正の整数である必要があります', 400);
  }

  // matches テーブルから取得
  $stmt = $pdo->prepare("
        SELECT 
            id,
            status,
            down_rule,
            duration,
            paused_elapsed_time,
            start_time,
            end_time,
            winner_player_id,
            created_at,
            updated_at
        FROM matches
        WHERE id = :match_id
    ");

  $stmt->execute([':match_id' => (int)$matchId]);

  $match = $stmt->fetch();

  // データが存在しない場合
  if (!$match) {
    errorResponse('Match not found', 404);
  }

  // 成功レスポンス
  successResponse($match);
} catch (PDOException $e) {
  error_log('Database Error in get_match.php: ' . $e->getMessage());
  errorResponse('Database error occurred', 500);
} catch (Throwable $e) {
  handleException($e);
}
