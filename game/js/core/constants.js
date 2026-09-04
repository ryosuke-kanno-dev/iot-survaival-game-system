// ==========================================
// constants.js - ゲーム設定の一元管理（安全版）
// ==========================================
// 設計方針：
// - Object.freeze で immutable 化
// - 初期値と最大値の整合性を保証
// - 環境判定による安全な開発モード制御
// - 個別エクスポートで疎結合を維持
// - ヘルパー関数で安全な値取得
// ==========================================

// ==========================================
// 環境判定
// ==========================================

/**
 * 開発環境かどうかを判定
 * 本番環境では必ず false になる
 */
const isDevelopmentEnvironment = () => {
  // 本番ドメインのチェック
  const productionHosts = [
    'yourdomain.com',
    'www.yourdomain.com',
    'production.yourdomain.com'
  ];
  
  const currentHost = window.location.hostname;
  
  // 本番ドメインなら開発モードOFF
  if (productionHosts.includes(currentHost)) {
    return false;
  }
  
  // localhost または IP アドレスなら開発モード
  return currentHost === 'localhost' || 
         currentHost === '127.0.0.1' || 
         currentHost.startsWith('192.168.') ||
         currentHost.startsWith('10.0.');
};

// ==========================================
// 部位定数（変更禁止）
// ==========================================

export const BODY_PARTS = Object.freeze({
  HEAD: 'headHp',
  TORSO: 'torsoHp',
  LEFT_ARM: 'leftarmHp',
  RIGHT_ARM: 'rightarmHp',
  LEFT_LEG: 'leftlegHp',
  RIGHT_LEG: 'rightlegHp'
});

// ==========================================
// 赤外線コード（変更禁止）
// ==========================================

export const IR_CODES = Object.freeze({
  SHOOT: 'IR_CODE_1',
  COMMAND2: 'IR_CODE_2',
  COMMAND3: 'IR_CODE_3'
});

// ==========================================
// ダメージテーブル（変更禁止）
// ==========================================

export const DAMAGE_TABLE = Object.freeze({
  '0xD009895': 10,
  '0xD00AABB': -10,
  '0xD00CCDD': 'RESET'
});

// ==========================================
// 部位IDマップ（変更禁止）
// ==========================================

export const PART_ID_MAP = Object.freeze({
  '16': 'headHp',
  '17': 'torsoHp',
  '25': 'leftarmHp',
  '26': 'rightarmHp',
  '27': 'leftlegHp',
  '32': 'rightlegHp'
});

// ==========================================
// Bluetooth サービスUUID（変更禁止）
// ==========================================

export const BLUETOOTH_SERVICES = Object.freeze({
  ARMOR: '12345678-1234-5678-1234-56789abcdef0',
  GUN: '87654321-4321-6789-4321-abcdef987654'
});

// ==========================================
// 体力設定（変更禁止）
// ==========================================

const _HP_CONFIG = {
  HEAD: 100,
  TORSO: 100,
  LEFT_ARM: 100,
  RIGHT_ARM: 100,
  LEFT_LEG: 100,
  RIGHT_LEG: 100
};

export const HP_CONFIG = Object.freeze(_HP_CONFIG);

/**
 * 体力の初期値を取得（リセット用）
 * @returns {Object} 各部位の初期HP
 */
export function getInitialHP() {
  return {
    HEAD: HP_CONFIG.HEAD,
    TORSO: HP_CONFIG.TORSO,
    LEFT_ARM: HP_CONFIG.LEFT_ARM,
    RIGHT_ARM: HP_CONFIG.RIGHT_ARM,
    LEFT_LEG: HP_CONFIG.LEFT_LEG,
    RIGHT_LEG: HP_CONFIG.RIGHT_LEG
  };
}

// ==========================================
// 弾薬設定（変更禁止）
// ==========================================

const _AMMO_CONFIG = {
  // マガジン設定
  MAX_BULLET: 30,
  INITIAL_BULLET: 30,
  
  // 予備マガジン設定
  MAX_RESERVE: 5,
  INITIAL_RESERVE: 5,
  
  // リロード設定
  RELOAD_TIME: 2000
};

// 検証：初期値が最大値を超えていないかチェック
if (_AMMO_CONFIG.INITIAL_BULLET > _AMMO_CONFIG.MAX_BULLET) {
  throw new Error('AMMO_CONFIG: INITIAL_BULLET が MAX_BULLET を超えています');
}
if (_AMMO_CONFIG.INITIAL_RESERVE > _AMMO_CONFIG.MAX_RESERVE) {
  throw new Error('AMMO_CONFIG: INITIAL_RESERVE が MAX_RESERVE を超えています');
}

export const AMMO_CONFIG = Object.freeze(_AMMO_CONFIG);

/**
 * 弾薬の初期値を取得（リセット用）
 * @returns {Object} 弾薬の初期設定
 */
export function getInitialAmmo() {
  return {
    maxBullet: AMMO_CONFIG.MAX_BULLET,
    maxReserve: AMMO_CONFIG.MAX_RESERVE,
    currentBullet: AMMO_CONFIG.INITIAL_BULLET,
    currentReserve: AMMO_CONFIG.INITIAL_RESERVE
  };
}

/**
 * 弾薬設定を検証
 * @param {number} bullet - 現在弾数
 * @param {number} reserve - 予備マガジン数
 * @returns {boolean} 有効な設定かどうか
 */
export function validateAmmoConfig(bullet, reserve) {
  return (
    bullet >= 0 && 
    bullet <= AMMO_CONFIG.MAX_BULLET &&
    reserve >= 0 && 
    reserve <= AMMO_CONFIG.MAX_RESERVE
  );
}

// ==========================================
// ダメージ設定（変更禁止）
// ==========================================

const _DAMAGE_CONFIG = {
  HEAD: 2.0,
  TORSO: 1.0,
  LIMB: 0.7
};

export const DAMAGE_CONFIG = Object.freeze(_DAMAGE_CONFIG);

/**
 * 部位別ダメージ倍率を取得
 * @param {string} part - 部位名（BODY_PARTS の値）
 * @returns {number} ダメージ倍率
 */
export function getDamageMultiplier(part) {
  switch (part) {
    case BODY_PARTS.HEAD:
      return DAMAGE_CONFIG.HEAD;
    case BODY_PARTS.TORSO:
      return DAMAGE_CONFIG.TORSO;
    case BODY_PARTS.LEFT_ARM:
    case BODY_PARTS.RIGHT_ARM:
    case BODY_PARTS.LEFT_LEG:
    case BODY_PARTS.RIGHT_LEG:
      return DAMAGE_CONFIG.LIMB;
    default:
      console.warn(`Unknown body part: ${part}, using default multiplier`);
      return DAMAGE_CONFIG.TORSO;
  }
}

// ==========================================
// Bluetooth設定（変更禁止）
// ==========================================

const _BLUETOOTH_CONFIG = {
  CONNECT_TIMEOUT: 10000,
  RECONNECT_ATTEMPTS: 3,
  RECONNECT_DELAY: 2000
};

export const BLUETOOTH_CONFIG = Object.freeze(_BLUETOOTH_CONFIG);

// ==========================================
// ゲーム設定（変更禁止）
// ==========================================

const _GAME_CONFIG = {
  DOWN_DURATION: 5000,
  DOWN_VIDEO_PATH: '/assets/videos/down.mp4'
};

export const GAME_CONFIG = Object.freeze(_GAME_CONFIG);

// ==========================================
// サーバー同期設定（変更禁止）
// ==========================================

const _SERVER_SYNC_CONFIG = {
  POLLING_INTERVAL: 2000,
  HP_SEND_DEBOUNCE: 300,
  AMMO_SEND_DEBOUNCE: 200,
  TIMER_CORRECTION_THRESHOLD_SEC: 0.5,
  MAX_DAMAGE_RETRY_QUEUE: 10,
  DAMAGE_RETRY_INTERVAL_1_MS: 3000,
  DAMAGE_RETRY_INTERVAL_2_MS: 5000
};

export const SERVER_SYNC_CONFIG = Object.freeze(_SERVER_SYNC_CONFIG);

// ==========================================
// 開発モード設定（環境自動判定）
// ==========================================

const _DEV_CONFIG = {
  // 環境に応じて自動判定
  ENABLED: isDevelopmentEnvironment(),
  
  // 詳細ログ（開発環境のみ）
  VERBOSE_LOGGING: isDevelopmentEnvironment()
};

export const DEV_CONFIG = Object.freeze(_DEV_CONFIG);

// 開発モード状態をログ出力（デバッグ用）
if (DEV_CONFIG.ENABLED) {
  console.log('🛠️ 開発モードが有効です');
  console.log('Environment:', window.location.hostname);
} else {
  console.log('🚀 本番モードで動作中');
}

// ==========================================
// ユーティリティ関数
// ==========================================

/**
 * すべての設定値を取得（デバッグ用）
 * @returns {Object} すべての設定
 */
export function getAllConfigs() {
  return {
    BODY_PARTS: { ...BODY_PARTS },
    IR_CODES: { ...IR_CODES },
    DAMAGE_TABLE: { ...DAMAGE_TABLE },
    PART_ID_MAP: { ...PART_ID_MAP },
    BLUETOOTH_SERVICES: { ...BLUETOOTH_SERVICES },
    HP_CONFIG: { ...HP_CONFIG },
    AMMO_CONFIG: { ...AMMO_CONFIG },
    DAMAGE_CONFIG: { ...DAMAGE_CONFIG },
    BLUETOOTH_CONFIG: { ...BLUETOOTH_CONFIG },
    GAME_CONFIG: { ...GAME_CONFIG },
    SERVER_SYNC_CONFIG: { ...SERVER_SYNC_CONFIG },
    DEV_CONFIG: { ...DEV_CONFIG }
  };
}

/**
 * 設定値を検証（起動時チェック用）
 * @returns {Object} 検証結果
 */
export function validateAllConfigs() {
  const errors = [];
  
  // 弾薬設定の検証
  if (AMMO_CONFIG.INITIAL_BULLET > AMMO_CONFIG.MAX_BULLET) {
    errors.push('AMMO: INITIAL_BULLET > MAX_BULLET');
  }
  if (AMMO_CONFIG.INITIAL_RESERVE > AMMO_CONFIG.MAX_RESERVE) {
    errors.push('AMMO: INITIAL_RESERVE > MAX_RESERVE');
  }
  
  // HP設定の検証
  Object.entries(HP_CONFIG).forEach(([part, hp]) => {
    if (hp <= 0) {
      errors.push(`HP: ${part} is <= 0`);
    }
  });
  
  // ダメージ倍率の検証
  Object.entries(DAMAGE_CONFIG).forEach(([part, multiplier]) => {
    if (multiplier < 0) {
      errors.push(`DAMAGE: ${part} multiplier is < 0`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// 起動時に設定を検証
const validation = validateAllConfigs();
if (!validation.valid) {
  console.error('❌ 設定エラーが検出されました:', validation.errors);
  throw new Error('Invalid configuration detected. Please check constants.js');
}