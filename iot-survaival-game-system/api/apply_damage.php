<?php
// ==========================================
// apply_damage.php - ダメージ適用API（修正版）
// ==========================================

error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

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

// ==========================================
// DownRules クラスを読み込み
// ==========================================
require_once __DIR__ . '/lib/DownRules.php';
require_once __DIR__ . '/../config/db.php';

// ==========================================
// 入力データの取得
// ==========================================
$rawInput = file_get_contents('php://input');
error_log("[ApplyDamage] Raw input: " . $rawInput);

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
// 必須フィールドチェック
// ==========================================
$requiredFields = ['player_id', 'body_part', 'damage_amount'];
foreach ($requiredFields as $field) {
    if (!isset($input[$field])) {
        http_response_code(400);
        echo json_encode([
            'error' => "Missing required field: {$field}",
            'received' => $input
        ]);
        exit;
    }
}

$playerId = (int)$input['player_id'];
$bodyPart = $input['body_part'];
$damageAmount = (int)$input['damage_amount'];
$version = isset($input['version']) ? (int)$input['version'] : null;
$damageRequestId = isset($input['damage_request_id']) ? $input['damage_request_id'] : null;

error_log("[ApplyDamage] Processing: player={$playerId}, part={$bodyPart}, damage={$damageAmount}, req_id={$damageRequestId}");

// ==========================================
// 部位名マッピング
// ==========================================
$partColumnMap = [
    'headHp' => 'hp_head',
    'torsoHp' => 'hp_torso',
    'rightarmHp' => 'hp_right_arm',
    'leftarmHp' => 'hp_left_arm',
    'rightlegHp' => 'hp_right_leg',
    'leftlegHp' => 'hp_left_leg'
];

if (!isset($partColumnMap[$bodyPart])) {
    http_response_code(400);
    echo json_encode([
        'error' => "Invalid body part: {$bodyPart}",
        'valid_parts' => array_keys($partColumnMap)
    ]);
    exit;
}

$columnName = $partColumnMap[$bodyPart];

try {
    // ==========================================
    // トランザクション開始
    // ==========================================
    $pdo->beginTransaction();
    
    // ==========================================
    // damage_request_id の重複チェックと記録
    // ==========================================
    if ($damageRequestId) {
        $stmtCheck = $pdo->prepare("SELECT 1 FROM damage_requests WHERE request_id = :req_id FOR UPDATE");
        $stmtCheck->execute(['req_id' => $damageRequestId]);
        if ($stmtCheck->fetch()) {
            $pdo->rollBack();
            error_log("[ApplyDamage] Duplicate request ID: {$damageRequestId}. Skipping.");
            http_response_code(200);
            echo json_encode(['status' => 'already_processed']);
            exit;
        }
        
        $stmtInsert = $pdo->prepare("INSERT INTO damage_requests (request_id) VALUES (:req_id)");
        $stmtInsert->execute(['req_id' => $damageRequestId]);
    }
    
    // ==========================================
    // プレイヤーデータと試合ルールを取得（JOIN）
    // ==========================================
    $stmt = $pdo->prepare("
        SELECT p.*, m.down_rule 
        FROM players p
        LEFT JOIN matches m ON p.match_id = m.id
        WHERE p.id = :player_id 
        FOR UPDATE
    ");
    $stmt->execute(['player_id' => $playerId]);
    $player = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$player) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(['error' => 'Player not found', 'player_id' => $playerId]);
        exit;
    }
    
    error_log("[ApplyDamage] Player found: id={$player['id']}, state={$player['player_state']}, down_rule={$player['down_rule']}");
    
    // ==========================================
    // バージョンチェック
    // ==========================================
    if ($version !== null && $version !== 0 && $player['version'] !== $version) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode([
            'error' => 'Version conflict',
            'current_version' => $player['version'],
            'sent_version' => $version
        ]);
        exit;
    }
    
    // ==========================================
    // DOWN状態チェック
    // ==========================================
    if ($player['player_state'] === 'DOWN') {
        $pdo->rollBack();
        http_response_code(200);
        echo json_encode([
            'success' => false,
            'reason' => 'Player already DOWN',
            'player_state' => 'DOWN'
        ]);
        exit;
    }
    
    // ==========================================
    // HP計算
    // ==========================================
    $currentHP = (int)$player[$columnName];
    $newHP = max(0, $currentHP - $damageAmount);
    $actualDamage = $currentHP - $newHP;
    
    error_log("[ApplyDamage] HP calculation: {$columnName} {$currentHP} → {$newHP}");
    
    // ==========================================
    // HP更新
    // ==========================================
    $stmt = $pdo->prepare("
        UPDATE players 
        SET {$columnName} = :new_hp,
            version = version + 1,
            last_update = NOW()
        WHERE id = :player_id
    ");
    $stmt->execute([
        'new_hp' => $newHP,
        'player_id' => $playerId
    ]);
    
    // ==========================================
    // 更新後データ取得
    // ==========================================
    $stmt = $pdo->prepare("SELECT * FROM players WHERE id = :player_id");
    $stmt->execute(['player_id' => $playerId]);
    $updatedPlayer = $stmt->fetch(PDO::FETCH_ASSOC);
    
    // ==========================================
    // 合計HP取得（TRIGGERで自動計算済み）
    // ==========================================
    $totalHP = (int)$updatedPlayer['hp_total'];
    
    error_log("[ApplyDamage] Total HP: {$totalHP}");
    
    // ==========================================
    // DOWN判定（DownRules.php を使用）
    // ==========================================
    $downRule = $player['down_rule'] ?? 'TOTAL_HP_ZERO';
    $downCheck = DownRules::check($downRule, $updatedPlayer);
    
    $shouldBeDown = $downCheck['isDown'];
    $downReason = $downCheck['reason'];
    
    error_log("[ApplyDamage] DOWN check: rule={$downRule}, isDown=" . ($shouldBeDown ? 'YES' : 'NO') . ", reason={$downReason}");
    
    // ==========================================
    // DOWN状態に変更
    // ==========================================
    if ($shouldBeDown && $updatedPlayer['player_state'] !== 'DOWN') {
        error_log("[ApplyDamage] Player {$playerId}: DOWN ({$downReason}, rule: {$downRule})");
        
        $stmt = $pdo->prepare("
            UPDATE players 
            SET player_state = 'DOWN',
                version = version + 1
            WHERE id = :player_id
        ");
        $stmt->execute(['player_id' => $playerId]);
        
        // 最新versionを取得
        $stmt = $pdo->prepare("SELECT version FROM players WHERE id = :player_id");
        $stmt->execute(['player_id' => $playerId]);
        $finalVersion = $stmt->fetch(PDO::FETCH_ASSOC)['version'];
    } else {
        $finalVersion = $updatedPlayer['version'];
    }
    
    $pdo->commit();
    
    // ==========================================
    // 成功レスポンス
    // ==========================================
    echo json_encode([
        'success' => true,
        'damage_applied' => $actualDamage,
        'body_part' => $bodyPart,
        'new_hp' => $newHP,
        'total_hp' => $totalHP,
        'player_state' => $shouldBeDown ? 'DOWN' : $updatedPlayer['player_state'],
        'is_down' => $shouldBeDown,
        'down_reason' => $downReason,
        'down_rule' => $downRule,
        'new_version' => $finalVersion
    ]);
    
    error_log("[ApplyDamage] Success!");
    
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[ApplyDamage] Database error: " . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'error' => 'Database error',
        'message' => $e->getMessage()
    ]);
}
?>