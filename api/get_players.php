<?php
/**
 * ==========================================
 * get_players.php
 * 試合に参加している全プレイヤーのステータスを取得するAPI
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
    
    // players テーブルから取得
    $stmt = $pdo->prepare("
        SELECT 
            id,
            match_id,
            player_number,
            name,
            player_state,
            hp_head,
            hp_torso,
            hp_right_arm,
            hp_left_arm,
            hp_right_leg,
            hp_left_leg,
            hp_total,
            ammo_current,
            ammo_reserve,
            kills,
            hits,
            damage_taken,
            play_time,
            bluetooth_gun_connected,
            bluetooth_armor_connected,
            ready,
            version,
            last_update
        FROM players
        WHERE match_id = :match_id
        ORDER BY player_number ASC
    ");
    
    $stmt->execute([':match_id' => (int)$matchId]);
    
    $players = $stmt->fetchAll();
    
    // プレイヤーが存在しない場合
    if (empty($players)) {
        errorResponse('Players not found', 404);
    }
    
    // 成功レスポンス
    successResponse($players);
    
} catch (PDOException $e) {
    error_log('Database Error in get_players.php: ' . $e->getMessage());
    errorResponse('Database error occurred', 500);
} catch (Throwable $e) {
    handleException($e);
}
?>