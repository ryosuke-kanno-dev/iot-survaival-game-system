<?php
declare(strict_types=1);

require_once 'common.php';

try {
    // GETメソッドチェック
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        errorResponse('GETメソッドのみ許可されています', 405);
    }
    
    // match_id取得（必須）
    $matchId = getQueryParam('match_id', true);
    
    if (!is_numeric($matchId) || (int)$matchId < 1) {
        errorResponse('match_idは正の整数である必要があります', 400);
    }
    
    $matchId = (int)$matchId;
    
    // オプションパラメータ取得
    $playerId = getQueryParam('player_id', false);
    $eventType = getQueryParam('event_type', false);
    $limit = getQueryParam('limit', false) ?? '100';
    $offset = getQueryParam('offset', false) ?? '0';
    
    // limit検証
    if (!is_numeric($limit) || (int)$limit < 1) {
        errorResponse('limitは正の整数である必要があります', 400);
    }
    
    $limit = (int)$limit;
    if ($limit > 500) {
        $limit = 500;
    }
    
    // offset検証
    if (!is_numeric($offset) || (int)$offset < 0) {
        errorResponse('offsetは0以上の整数である必要があります', 400);
    }
    
    $offset = (int)$offset;
    
    // player_id検証
    if ($playerId !== null) {
        if (!is_numeric($playerId) || (int)$playerId < 1) {
            errorResponse('player_idは正の整数である必要があります', 400);
        }
        $playerId = (int)$playerId;
    }
    
    // match存在確認
    $stmt = $pdo->prepare("SELECT id FROM matches WHERE id = :match_id");
    $stmt->execute([':match_id' => $matchId]);
    if (!$stmt->fetch()) {
        errorResponse('Match not found', 404);
    }
    
    // 動的WHERE句構築
    $whereClauses = ['match_id = :match_id'];
    $params = [':match_id' => $matchId];
    
    if ($playerId !== null) {
        $whereClauses[] = 'player_id = :player_id';
        $params[':player_id'] = $playerId;
    }
    
    if ($eventType !== null) {
        $whereClauses[] = 'event_type = :event_type';
        $params[':event_type'] = $eventType;
    }
    
    $whereClause = implode(' AND ', $whereClauses);
    
    // SQL構築
    $sql = "
        SELECT 
            id,
            match_id,
            player_id,
            event_type,
            event_data,
            created_at
        FROM game_events
        WHERE {$whereClause}
        ORDER BY created_at ASC
        LIMIT :limit OFFSET :offset
    ";
    
    $stmt = $pdo->prepare($sql);
    
    // パラメータバインド
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    
    $stmt->execute();
    
    $events = $stmt->fetchAll();
    
    // event_dataをデコード
    foreach ($events as &$event) {
        if ($event['event_data'] !== null) {
            $event['event_data'] = json_decode($event['event_data'], true);
        }
    }
    
    // 成功レスポンス
    jsonResponse([
        'status' => 'success',
        'count' => count($events),
        'events' => $events
    ], 200);
    
} catch (PDOException $e) {
    error_log('Database Error in get_events.php: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Throwable $e) {
    handleException($e);
}
?>