<?php
/**
 * update_match.php - 試合情報更新API
 * 
 * 機能：
 * - 試合状態（status）の更新
 * - ダウンルール（down_rule）の更新
 * - 開始時刻・終了時刻の更新
 * - 勝者の記録
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../config/db.php';

// ==========================================
// 入力データの取得
// ==========================================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Invalid JSON',
        'json_error' => json_last_error_msg()
    ]);
    exit;
}

// ==========================================
// match_id は必須
// ==========================================
if (!isset($input['match_id'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing required field: match_id']);
    exit;
}

$matchId = (int)$input['match_id'];

try {
    // ==========================================
    // 現在の試合データ取得 (status等の判定用)
    // ==========================================
    $stmt = $pdo->prepare("SELECT * FROM matches WHERE id = :match_id FOR UPDATE");
    $stmt->execute(['match_id' => $matchId]);
    $currentMatch = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$currentMatch) {
         http_response_code(404);
         echo json_encode(['error' => 'Match not found']);
         exit;
    }

    // ==========================================
    // 更新するフィールドを動的に構築
    // ==========================================
    $updateFields = [];
    $params = ['match_id' => $matchId];
    
    // status
    if (isset($input['status'])) {
        $validStatuses = ['WAITING', 'PLAYING', 'PAUSED', 'FINISHED'];
        if (in_array($input['status'], $validStatuses, true)) {
            $updateFields[] = 'status = :status';
            $params['status'] = $input['status'];
            
            // 状態遷移に応じた時間処理
            $oldStatus = $currentMatch['status'];
            $newStatus = $input['status'];
            
            if ($newStatus === 'PAUSED' && $oldStatus === 'PLAYING') {
                // PLAYING -> PAUSED: 経過時間を記録し、start_timeをクリア
                $updateFields[] = 'paused_elapsed_time = COALESCE(paused_elapsed_time, 0) + TIMESTAMPDIFF(SECOND, start_time, NOW())';
                $updateFields[] = 'start_time = NULL';
            } elseif ($newStatus === 'PLAYING' && $oldStatus === 'PAUSED') {
                // PAUSED -> PLAYING: start_timeを現在時刻に再設定
                $updateFields[] = 'start_time = NOW()';
            } elseif ($newStatus === 'WAITING') {
                // WAITINGへのリセット時: 一時停止時間もリセット
                $updateFields[] = 'paused_elapsed_time = 0';
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid status value']);
            exit;
        }
    }
    
    // down_rule（新規追加）
    if (isset($input['down_rule'])) {
        $validRules = [
            'TOTAL_HP_ZERO',
            'CORE_PART_ZERO',
            'ANY_PART_ZERO',
            'ALL_PARTS_ZERO',
            'MULTIPLE_PARTS_ZERO'
        ];
        
        if (in_array($input['down_rule'], $validRules, true)) {
            $updateFields[] = 'down_rule = :down_rule';
            $params['down_rule'] = $input['down_rule'];
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid down_rule value']);
            exit;
        }
    }
    
    // duration
    if (isset($input['duration'])) {
        $updateFields[] = 'duration = :duration';
        $params['duration'] = (int)$input['duration'];
    }

    // start_time
    if (isset($input['start_time'])) {
        if ($input['start_time'] === null) {
            $updateFields[] = 'start_time = NULL';
        } elseif ($input['start_time'] === 'NOW') {
            $updateFields[] = 'start_time = NOW()';
        } else {
            $updateFields[] = 'start_time = :start_time';
            $params['start_time'] = $input['start_time'];
        }
    }
    
    // end_time
    if (isset($input['end_time'])) {
        if ($input['end_time'] === null) {
            $updateFields[] = 'end_time = NULL';
        } else {
            $updateFields[] = 'end_time = :end_time';
            $params['end_time'] = $input['end_time'];
        }
    }
    
    // winner_player_id
    if (isset($input['winner_player_id'])) {
        if ($input['winner_player_id'] === null) {
            $updateFields[] = 'winner_player_id = NULL';
        } else {
            $updateFields[] = 'winner_player_id = :winner_player_id';
            $params['winner_player_id'] = (int)$input['winner_player_id'];
        }
    }
    
    // 更新するフィールドがない場合
    if (empty($updateFields)) {
        http_response_code(400);
        echo json_encode(['error' => 'No fields to update']);
        exit;
    }
    
    // updated_at は自動更新されるが、念のため明示的に追加
    $updateFields[] = 'updated_at = NOW()';
    
    // ==========================================
    // SQL実行
    // ==========================================
    $sql = "UPDATE matches SET " . implode(', ', $updateFields) . " WHERE id = :match_id";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    
    if ($stmt->rowCount() === 0) {
        // 更新対象が見つからない、または変更なし
        $stmt = $pdo->prepare("SELECT * FROM matches WHERE id = :match_id");
        $stmt->execute(['match_id' => $matchId]);
        $match = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$match) {
            http_response_code(404);
            echo json_encode(['error' => 'Match not found']);
            exit;
        }
    }
    
    // ==========================================
    // 更新後のデータを取得
    // ==========================================
    $stmt = $pdo->prepare("SELECT * FROM matches WHERE id = :match_id");
    $stmt->execute(['match_id' => $matchId]);
    $updatedMatch = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // ==========================================
    // リセット時のクリーンアップ処理
    // ==========================================
    if (isset($input['status']) && $input['status'] === 'WAITING') {
        try {
            $pdo->exec("DELETE FROM damage_requests");
        } catch (PDOException $e) {
            error_log("[UpdateMatch] Failed to clean up damage_requests: " . $e->getMessage());
        }
    }

    // ==========================================
    // 成功レスポンス
    // ==========================================
    echo json_encode([
        'success' => true,
        'data' => $updatedMatch
    ]);
    
} catch (PDOException $e) {
    error_log("[UpdateMatch] Database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'Database error',
        'message' => $e->getMessage()
    ]);
}
?>