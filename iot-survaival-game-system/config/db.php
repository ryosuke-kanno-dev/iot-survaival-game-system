<?php
declare(strict_types=1);

// タイムゾーン設定
date_default_timezone_set('Asia/Tokyo');

// ヘッダー設定
header('Content-Type: application/json; charset=utf-8');

// データベース接続設定
define('DB_HOST', 'localhost');
define('DB_NAME', 'battle_arena');
define('DB_USER', 'root');
define('DB_PASS', '');
define('DB_CHARSET', 'utf8mb4');

function getDbConnection() {
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    try {
        $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        $conn->set_charset('utf8mb4');
        return $conn;
    } catch (mysqli_sql_exception $e) {
        throw new Exception('Database connection error: ' . $e->getMessage());
    }
}

// PDO接続
try {
    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );
    
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
        PDO::ATTR_PERSISTENT         => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET
    ];
    
    $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    
    // 直接アクセス時の接続確認
    if (basename($_SERVER['PHP_SELF']) === 'db.php') {
        echo json_encode([
            'status' => 'success',
            'message' => 'Database connection successful'
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    
} catch (PDOException $e) {
    // エラーログ記録（本番環境では詳細を隠す）
    error_log('Database Connection Error: ' . $e->getMessage());
    
    // クライアントへのレスポンス
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Database connection failed',
        'error' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

?>