<?php
declare(strict_types=1);

require_once 'common.php';

try {
    // POSTメソッドチェック
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        errorResponse('POSTメソッドのみ許可されています', 405);
    }
    
    // JSON入力を取得
    $input = getJsonInput();
    
    // 必須項目チェック
    if (!isset($input['match_id'])) {
        errorResponse('match_id は必須です', 400);
    }
    
    if (!isset($input['event_type'])) {
        errorResponse('event_type は必須です', 400);
    }
    
    $matchId = $input['match_id'];
    $playerId = $input['player_id'] ?? null;
    $eventType = $input['event_type'];
    $eventData = $input['event_data'] ?? null;
    
    // match_id の数値チェック
    if (!is_numeric($matchId) || (int)$matchId < 1) {
        errorResponse('match_id は正の整数である必要があります', 400);
    }
    
    $matchId = (int)$matchId;
    
    // event_type のホワイトリストチェック
    $allowedEventTypes = ['HIT', 'DAMAGE', 'KILL', 'RELOAD', 'START', 'END', 'DOWN', 'REVIVE', 'SHOOT'];
    if (!in_array($eventType, $allowedEventTypes, true)) {
        errorResponse('Invalid event_type', 400);
    }
    
    // player_id の数値チェック（指定されている場合）
    if ($playerId !== null) {
        if (!is_numeric($playerId) || (int)$playerId < 1) {
            errorResponse('player_id は正の整数である必要があります', 400);
        }
        $playerId = (int)$playerId;
    }
    
    // event_data をJSON文字列に変換（指定されている場合）
    $eventDataJson = null;
    if ($eventData !== null) {
        $eventDataJson = json_encode($eventData, JSON_UNESCAPED_UNICODE);
        if ($eventDataJson === false) {
            errorResponse('event_data のJSON変換に失敗しました', 400);
        }
    }
    
    // トランザクション開始
    $pdo->beginTransaction();
    
    // match_id の存在確認
    $stmt = $pdo->prepare("SELECT id FROM matches WHERE id = :match_id");
    $stmt->execute([':match_id' => $matchId]);
    if (!$stmt->fetch()) {
        $pdo->rollBack();
        errorResponse('Match not found', 404);
    }
    
    // player_id の存在確認（指定されている場合）
    if ($playerId !== null) {
        $stmt = $pdo->prepare("SELECT id FROM players WHERE id = :player_id");
        $stmt->execute([':player_id' => $playerId]);
        if (!$stmt->fetch()) {
            $pdo->rollBack();
            errorResponse('Player not found', 404);
        }
    }
    
    // game_events テーブルへINSERT
    $stmt = $pdo->prepare("
        INSERT INTO game_events (
            match_id,
            player_id,
            event_type,
            event_data
        ) VALUES (
            :match_id,
            :player_id,
            :event_type,
            :event_data
        )
    ");
    
    $stmt->execute([
        ':match_id' => $matchId,
        ':player_id' => $playerId,
        ':event_type' => $eventType,
        ':event_data' => $eventDataJson
    ]);
    
    // INSERT実行
    $stmt->execute([
        ':match_id' => $matchId,
        ':player_id' => $playerId,
        ':event_type' => $eventType,
        ':event_data' => $eventDataJson
    ]);

    // ★ コミット前に取得する
    $eventId = (int)$pdo->lastInsertId();

    // コミット
    $pdo->commit();

    // 成功レスポンス
    jsonResponse([
        'status' => 'success',
        'message' => 'Event recorded successfully',
        'event_id' => $eventId
    ], 200);
    
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Database Error in add_event.php: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    handleException($e);
}
?>