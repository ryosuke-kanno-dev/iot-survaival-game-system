<?php
declare(strict_types=1);

// タイムゾーン設定
date_default_timezone_set('Asia/Tokyo');

// ヘッダー設定
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

// データベース接続読み込み
require_once __DIR__ . '/../config/db.php';

// ==========================================
// JSON レスポンス関数
// ==========================================

/**
 * JSON レスポンスを返して終了
 */
function jsonResponse(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

/**
 * エラーレスポンスを返して終了
 */
function errorResponse(string $message, int $statusCode = 400): void {
    jsonResponse([
        'status' => 'error',
        'message' => $message
    ], $statusCode);
}

/**
 * 成功レスポンスを返して終了
 */
function successResponse(array $data = []): void {
    jsonResponse([
        'status' => 'success',
        'data' => $data
    ], 200);
}

// ==========================================
// 入力取得関数
// ==========================================

/**
 * JSON入力を取得
 */
function getJsonInput(): array {
    $json = file_get_contents('php://input');
    
    if (empty($json)) {
        errorResponse('リクエストボディが空です', 400);
    }
    
    $data = json_decode($json, true);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        errorResponse('無効なJSON形式です: ' . json_last_error_msg(), 400);
    }
    
    return $data;
}

/**
 * GETパラメータを取得
 */
function getQueryParam(string $key, bool $required = true): ?string {
    if (!isset($_GET[$key]) || trim($_GET[$key]) === '') {
        if ($required) {
            errorResponse("必須パラメータ '{$key}' が指定されていません", 400);
        }
        return null;
    }
    
    return trim($_GET[$key]);
}

/**
 * POSTパラメータを取得
 */
function getPostParam(string $key, bool $required = true): ?string {
    if (!isset($_POST[$key]) || trim($_POST[$key]) === '') {
        if ($required) {
            errorResponse("必須パラメータ '{$key}' が指定されていません", 400);
        }
        return null;
    }
    
    return trim($_POST[$key]);
}

// ==========================================
// 例外ハンドリング
// ==========================================

/**
 * 例外を処理してエラーレスポンスを返す
 */
function handleException(Throwable $e): void {
    // エラーログに詳細を記録
    error_log('Exception: ' . $e->getMessage());
    error_log('File: ' . $e->getFile() . ' Line: ' . $e->getLine());
    error_log('Trace: ' . $e->getTraceAsString());
    
    // クライアントには詳細を出さない
    errorResponse('Internal Server Error', 500);
}

// ==========================================
// グローバル例外ハンドラー設定
// ==========================================
set_exception_handler('handleException');

// ==========================================
// $pdo がグローバルで利用可能
// ==========================================
?>