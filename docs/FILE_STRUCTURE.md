# フォルダ・ファイル構成と役割一覧

SPEC-IR レーザーガンバトルアリーナシステムのコードベース全体の構造と各ファイルの役割を整理したドキュメントです。

## 全体ツリー構成
```text
/battle_arena/
├── .htaccess     # ルート層のセキュリティ設定
├── api/          # バックエンドAPI（PHP）
│   └── .htaccess # API層のCORS・直リンク防止セキュリティ設定
├── admin/        # 管理者用画面
├── game/         # プレイヤー用画面（SPA）
│   ├── assets/   # 画像・動画・音声
│   ├── css/      # スタイルシート
│   └── js/       # アプリケーションロジック（ES Modules）
└── config/       # 共通設定
```

---

## 各ディレクトリとファイルの詳細

### `/config/`
* `database.php`
  * **役割**: データベースへの接続（PDO）と接続情報の定義
  * **主要処理**: `$pdo` へのインスタンス生成、エラーモード定義(PDO::ERRMODE_EXCEPTION)
  * **依存**: 各PHPファイルによって `require_once` で呼ばれる

### `/api/` (バックエンドAPI)
* `common.php`
  * **役割**: 全APIで使用する共通処理やレスポンスフォーマットの提供
  * **主要処理**: `getJsonInput()`, `successResponse()`, `errorResponse()`, 例外ハンドラ
  * **依存**: すべてのAPIファイル
* `apply_damage.php`
  * **役割**: ダメージ適用とDOWN判定をサーバー側で処理する
  * **主要処理**: `damage_requests`を用いた重複実行チェック、部位HP計算、`DownRules::check()`による判定、`player_state`の更新
  * **呼び出し元**: `server-sync.js` (`sendDamageWithRetry` 経由)
* `get_match.php`
  * **役割**: 現在の試合全体情報の取得（ポーリング用）
  * **主要処理**: 該当試合の取得、残り時間計算の基準となる `start_time`, `duration` の返却
  * **呼び出し元**: `server-sync.js` (`fetchMatchData`)
* `get_players.php`
  * **役割**: 自他プレイヤーのHPや状態の取得（ポーリング用）
  * **主要処理**: `players`テーブルから全プレイヤーデータの取得（`version`による差分取得対応）
  * **呼び出し元**: `server-sync.js` (`fetchPlayersData`)
* `update_match.php`
  * **役割**: 試合情報の更新（試合開始、終了、リセット）
  * **主要処理**: `matches`の `status`/`duration`/`start_time` 更新や、終了/リセット時の `damage_requests` クリーンアップ処理
  * **呼び出し元**: `admin.js`, `server-sync.js` (0秒終了時のトリガー)
* `update_player.php`
  * **役割**: プレイヤー個人の状態（READYや弾薬）の更新
  * **主要処理**: `players` テーブルの特定カラムの更新
  * **呼び出し元**: `server-sync.js` (弾薬送信・READY状態送信)
* `update_player_state.php`
  * **役割**: サーバーステータスの強制変更（DOWN等への遷移）
  * **主要処理**: `player_state` カラムの手動更新
  * **呼び出し元**: `server-sync.js` (`sendDown`)
* `admin_player_control.php`
  * **役割**: Admin画面からの個別プレイヤー操作
  * **主要処理**: 指定されたプレイヤーの「HP全回復」または「強制ダウン」の処理
  * **呼び出し元**: `admin.js`

### `/admin/` (管理者画面)
* `admin.php`
  * **役割**: 管理者用ダッシュボードのUIテンプレート
  * **主要処理**: HTML構造、プレイヤー一覧のレンダリング領域、エラー（Bluetooth切断等）の警告パネル、試合時間設定ドロップダウン
  * **依存**: `admin.js`, `admin.css`
* `admin.js`
  * **役割**: 管理画面のフロントエンドロジック
  * **主要処理**: UIの描画、試合開始/終了のAPI呼び出し、カウントダウンの定期表示更新、個別プレイヤー操作ボタンのハンドラー処理
* `admin.css`
  * **役割**: 管理画面専用のスタイル定義（グリッドレイアウトや警告表示など）

### `/game/` (プレイヤー用ゲーム画面)
* `game.php`
  * **役割**: メインゲーム画面のエントリーポイント（スマホ用SPA）
  * **主要処理**: 全画面のHTML枠組み構築、JavaScriptモジュール群のロード
* `css/game.css`
  * **役割**: ゲーム全体、UI要素、テストフィードバック等のスタイル定義

#### `/game/js/core/` (通信・定数)
* `config.js`
  * **役割**: Bluetoothデバイスの識別フラグやサービス設定用
* `constants.js`
  * **役割**: プロジェクト全体の不変定数群（ハードコーディング排除用）の一元管理
  * **主要処理**: 部位定数、時間しきい値(TIMER_CORRECTION_THRESHOLD)、リトライ間隔やIRコードの定義
* `server-sync.js`
  * **役割**: サーバーAPIとの通信担当・タイマー補正・エラー時のキューイング
  * **主要処理**: イベントリスナーを用いた疎結合のポーリング処理 (`get_match`, `get_players`)、`sendDamageWithRetry`（非同期再送付ダメージ送信）、タイマーの `ui-stats.js` への補正命令と0秒終了発火

#### `/game/js/bluetooth/` (ハードウェア連携)
* `bluetooth-device.js`
  * **役割**: Web Bluetooth APIを利用した各デバイス（銃・防具）の低レベルな接続・切断・Characteristics管理
* `bluetooth-manager.js`
  * **役割**: 複数デバイスの統合管理とアプリロジック連携
  * **主要処理**: 赤外線信号(IR)受信時のパースからダメージ送信への橋渡し、射撃処理(`executeShoot`)、切断検知による警告表示・操作ブロックの制御、開始前の「テスト発射・被弾確認ポップアップ」発生
* `ir-receiver.js`
  * **役割**: 赤外線生データから部位コードとダメージ量の変換処理

#### `/game/js/modules/` (ビジネスロジック)
* `linkon-main.js`
  * **役割**: ゲーム全体の初期化・各モジュールの調整（ディスパッチャー）
  * **主要処理**: `matchStatusChanged` などカスタムイベントのリスニング、状態遷移ごとの初期化呼び出し
* `game-state.js`
  * **役割**: プレイヤーの状態遷移 (`CONNECTING` -> `READY` -> `PLAYING` -> `DOWN` -> `END`) を管理
* `ammo-manager.js`
  * **役割**: 射撃時の弾薬消費およびリロード処理の管理
* `health/health-manager.js`
  * **役割**: UI連携を主目的とした各部位のHP状態の監視と表示更新のハブ
* `health/down-checker.js`
  * **役割**: `matches` の `down_rule` （全5種）に応じたローカルの死亡条件の判定

#### `/game/js/ui/` (UIコンポーネント)
* `ui-stats.js`
  * **役割**: 画面上部のHPバー、数値表示、残り時間のカウントダウンUIの管理
  * **主要処理**: `server-sync.js`からの `setRemainingTime` を受け付け、`setInterval`により毎秒カウントダウンを表示
* `ui-overlays.js`
  * **役割**: 背景レイヤー、DOWN動画、オーバーレイ画面全般の制御
  * **主要処理**: 切断時の警告（再接続ボタン配置）や、試合終了時リザルト画面の生成
* `ui-test-feedback.js`
  * **役割**: `WAITING`, `READY` 等のプレイ中でない際に表示されるテスト用ポップアップ処理
  * **主要処理**: 射撃や被弾時に「発射OK」「腕：命中」といった通知を一時的に表示して消去
