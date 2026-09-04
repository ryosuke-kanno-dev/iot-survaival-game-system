// ==========================================
// video-controller.js - ダウン時動画制御専用モジュール
// ==========================================
// 責務：
// - ダウン時の動画オーバーレイ表示・再生制御（classベース）
// - 動画終了後の「YOU ARE DOWN」オーバーレイ表示
// - ユーザー操作（閉じるボタン）の処理
//
// 設計方針：
// - display は一切触らない（CSS の display: flex で固定）
// - .active クラスの付け外しのみで表示制御
// - DOWN 入場時のみ再生（GameState 中心制御）
// - 多重再生防止を構造で保証
// - 動画終了後に downOverlay 表示（DOWN状態のみ）
// ==========================================

import { gameState, GAME_STATES } from '../core/game-state.js';

// ==========================================
// 定数定義
// ==========================================

const DEFAULT_OPTIONS = Object.freeze({
  autoRestart:     false,
  hideOnEnd:       true,
  resetOnStop:     true,
  volume:          1.0,
  playbackRate:    1.0,
  fadeInDuration:  300,
  fadeOutDuration: 300
});

const PLAYBACK_STATES = Object.freeze({
  STOPPED: 'stopped',
  PLAYING: 'playing',
  PAUSED:  'paused',
  LOADING: 'loading',
  ERROR:   'error'
});

// ==========================================
// VideoController クラス
// ==========================================

class VideoController {
  #videoContainer = null;
  #video          = null;
  #closeButton    = null;
  #downOverlay    = null;  // ← 追加
  #initialized    = false;
  #playbackState  = PLAYBACK_STATES.STOPPED;
  #options        = {};

  #boundStateChangeHandler  = null;
  #boundVideoEndedHandler   = null;
  #boundVideoPlayHandler    = null;
  #boundVideoPauseHandler   = null;
  #boundVideoErrorHandler   = null;
  #boundVideoLoadedHandler  = null;
  #boundCloseButtonHandler  = null;

  constructor() {
    this.#boundStateChangeHandler  = this.#handleStateChange.bind(this);
    this.#boundVideoEndedHandler   = this.#handleVideoEnded.bind(this);
    this.#boundVideoPlayHandler    = this.#handleVideoPlay.bind(this);
    this.#boundVideoPauseHandler   = this.#handleVideoPause.bind(this);
    this.#boundVideoErrorHandler   = this.#handleVideoError.bind(this);
    this.#boundVideoLoadedHandler  = this.#handleVideoLoaded.bind(this);
    this.#boundCloseButtonHandler  = this.#handleCloseButtonClick.bind(this);
  }

  // ==========================================
  // 初期化
  // ==========================================

  init(options = {}) {
    if (this.#initialized) {
      console.warn('video-controller: 既に初期化済みです');
      return false;
    }

    this.#options = this.#validateOptions({ ...DEFAULT_OPTIONS, ...options });

    if (!this.#initElements()) {
      console.error('video-controller: 初期化に失敗しました');
      return false;
    }

    this.#bindStateChange();
    this.#bindVideoEvents();
    this.#bindButtonEvents();
    this.#applyInitialSettings();

    this.#initialized = true;
    return true;
  }

  #initElements() {
    this.#videoContainer = document.getElementById('videoContainer');
    this.#video          = document.getElementById('myVideo');
    this.#closeButton    = document.getElementById('closeBtn');
    
    // ==========================================
    // 追加1: downOverlay を取得
    // ==========================================
    this.#downOverlay = document.getElementById('downOverlay');

    if (!this.#videoContainer) {
      console.error('video-controller: #videoContainer が見つかりません');
      return false;
    }

    if (!this.#video) {
      console.error('video-controller: #myVideo が見つかりません');
      return false;
    }

    if (!this.#closeButton) {
      console.warn('video-controller: #closeBtn が見つかりません');
    }

    // ==========================================
    // 追加: downOverlay が見つからない場合の警告
    // ==========================================
    if (!this.#downOverlay) {
      console.warn('video-controller: #downOverlay が見つかりません（YOU ARE DOWN表示なし）');
    }

    // 初期状態では .active が付いていないため非表示
    this.#videoContainer.classList.remove('active');
    
    // ==========================================
    // 追加: downOverlay も初期状態で非表示
    // ==========================================
    if (this.#downOverlay) {
      this.#downOverlay.classList.remove('active');
    }

    return true;
  }

  #applyInitialSettings() {
    if (!this.#video) return;
    this.#video.volume       = this.#options.volume;
    this.#video.playbackRate = this.#options.playbackRate;
    this.#video.loop         = this.#options.autoRestart;
  }

  #validateOptions(options) {
    return {
      ...options,
      volume:          Math.max(0,    Math.min(1, options.volume       || 1)),
      playbackRate:    Math.max(0.25, Math.min(4, options.playbackRate || 1)),
      fadeInDuration:  Math.max(0, options.fadeInDuration  || 300),
      fadeOutDuration: Math.max(0, options.fadeOutDuration || 300)
    };
  }

  // ==========================================
  // イベントバインド
  // ==========================================

  #bindStateChange() {
    gameState.onStateChange(this.#boundStateChangeHandler);
  }

  #bindVideoEvents() {
    if (!this.#video) return;
    this.#video.addEventListener('ended',      this.#boundVideoEndedHandler);
    this.#video.addEventListener('play',       this.#boundVideoPlayHandler);
    this.#video.addEventListener('pause',      this.#boundVideoPauseHandler);
    this.#video.addEventListener('error',      this.#boundVideoErrorHandler);
    this.#video.addEventListener('loadeddata', this.#boundVideoLoadedHandler);
  }

  #bindButtonEvents() {
    if (!this.#closeButton) return;
    this.#closeButton.addEventListener('click', this.#boundCloseButtonHandler);
  }

  // ==========================================
  // イベントハンドラー
  // ==========================================

  /**
   * ゲーム状態変化時の処理
   * 動画再生の唯一の起点。DOWN 入場時のみ play() を呼ぶ。
   * @private
   */
  #handleStateChange(newState, oldState) {
    // DOWN 状態になったら動画再生（唯一の起点）
    if (newState === GAME_STATES.DOWN) {
      this.play();
    }

    // DOWN から PLAYING に復帰したら動画停止 + overlay非表示
    if (oldState === GAME_STATES.DOWN && newState === GAME_STATES.PLAYING) {
      this.stop();
      // ==========================================
      // 追加3-1: PLAYING復帰時に downOverlay を非表示
      // ==========================================
      this.#hideDownOverlay();
    }

    // END 状態になったら動画停止 + overlay非表示
    if (newState === GAME_STATES.END) {
      this.stop();
      // ==========================================
      // 追加3-2: END時に downOverlay を非表示
      // ==========================================
      this.#hideDownOverlay();
    }
  }

  /**
   * 動画終了時の処理
   * DOWN状態のときのみ downOverlay を表示する
   * @private
   */
  #handleVideoEnded() {
    // ==========================================
    // 修正2: DOWN状態チェックを追加
    // DOWN状態でなければ何もしない（安全設計）
    // ==========================================
    const currentState = gameState.getState();
    
    if (currentState !== GAME_STATES.DOWN) {
      console.log('video-controller: DOWN状態ではないため overlay 表示をスキップ');
      return;
    }

    // ==========================================
    // autoRestart（ループ）が true なら何もしない
    // ==========================================
    if (this.#options.autoRestart) {
      return;
    }

    // ==========================================
    // 動画を非表示にする
    // ==========================================
    if (this.#options.hideOnEnd) {
      this.hide();
    }

    // ==========================================
    // 追加2: DOWN状態のときだけ downOverlay を表示
    // ==========================================
    this.#showDownOverlay();

    this.#playbackState = PLAYBACK_STATES.STOPPED;
  }

  #handleVideoPlay() {
    this.#playbackState = PLAYBACK_STATES.PLAYING;
  }

  #handleVideoPause() {
    if (this.#playbackState !== PLAYBACK_STATES.STOPPED) {
      this.#playbackState = PLAYBACK_STATES.PAUSED;
    }
  }

  #handleVideoError(event) {
    console.error('video-controller: 動画エラー:', event);
    this.#playbackState = PLAYBACK_STATES.ERROR;
    this.hide();
  }

  #handleVideoLoaded() {}

  #handleCloseButtonClick() {
    this.stop();
  }

  // ==========================================
  // DOWN Overlay 制御（追加メソッド）
  // ==========================================

  /**
   * downOverlay を表示（DOWN状態のみ）
   * @private
   */
  #showDownOverlay() {
    if (!this.#downOverlay) {
      console.warn('video-controller: #downOverlay が存在しないため表示できません');
      return;
    }

    // ==========================================
    // 多重発火防止: 既に active なら何もしない
    // ==========================================
    if (this.#downOverlay.classList.contains('active')) {
      console.log('video-controller: downOverlay は既に表示中');
      return;
    }

    this.#downOverlay.classList.add('active');
    console.log('video-controller: YOU ARE DOWN オーバーレイ表示');
  }

  /**
   * downOverlay を非表示
   * @private
   */
  #hideDownOverlay() {
    if (!this.#downOverlay) return;

    this.#downOverlay.classList.remove('active');
    console.log('video-controller: YOU ARE DOWN オーバーレイ非表示');
  }

  // ==========================================
  // 動画制御API（公開メソッド）
  // ==========================================

  /**
   * 動画を再生
   * 多重再生防止: PLAYING 状態なら即 return
   * 表示制御: .active クラスのみで制御（display は触らない）
   * @param {boolean} withFade - フェード効果（デフォルト: true）
   * @returns {Promise<boolean>} 成功なら true
   */
  async play(withFade = true) {
    if (!this.#initialized || !this.#video) {
      console.warn('video-controller: 初期化されていません');
      return false;
    }

    // 多重再生防止: 既に再生中なら何もしない
    if (this.#playbackState === PLAYBACK_STATES.PLAYING) {
      console.log('video-controller: 既に再生中のため再生をスキップ');
      return true;
    }

    try {
      // ==========================================
      // 追加: 動画再生前に downOverlay を非表示にする
      // （動画→overlay の順番を保証）
      // ==========================================
      this.#hideDownOverlay();

      // .active クラスで表示（display は触らない）
      await this.show(withFade);

      // 再生位置をリセット
      this.#video.currentTime = 0;

      // 再生開始
      await this.#video.play();

      this.#playbackState = PLAYBACK_STATES.PLAYING;
      console.log('video-controller: 動画再生開始');
      return true;

    } catch (error) {
      console.error('video-controller: 再生エラー:', error);
      this.#playbackState = PLAYBACK_STATES.ERROR;
      return false;
    }
  }

  /**
   * 動画を停止
   * 表示制御: .active クラスのみで制御
   * @param {boolean} withFade - フェード効果（デフォルト: true）
   */
  async stop(withFade = true) {
    if (!this.#initialized || !this.#video) return;

    this.#video.pause();

    if (this.#options.resetOnStop) {
      this.#video.currentTime = 0;
    }

    await this.hide(withFade);
    this.#playbackState = PLAYBACK_STATES.STOPPED;
    console.log('video-controller: 動画停止');
  }

  pause() {
    if (!this.#video) return;
    this.#video.pause();
    this.#playbackState = PLAYBACK_STATES.PAUSED;
  }

  async resume() {
    if (!this.#video) return false;
    try {
      await this.#video.play();
      this.#playbackState = PLAYBACK_STATES.PLAYING;
      return true;
    } catch (error) {
      console.error('video-controller: 再開エラー:', error);
      return false;
    }
  }

  /**
   * 動画コンテナを表示
   * display は一切触らず、.active クラスのみで制御
   * @param {boolean} withFade - フェード効果
   */
  async show(withFade = true) {
    if (!this.#videoContainer) return;

    this.#videoContainer.classList.add('active');

    if (withFade) {
      await new Promise(resolve => {
        setTimeout(resolve, this.#options.fadeInDuration);
      });
    }
  }

  /**
   * 動画コンテナを非表示
   * display は一切触らず、.active クラスのみで制御
   * @param {boolean} withFade - フェード効果
   */
  async hide(withFade = true) {
    if (!this.#videoContainer) return;

    if (withFade) {
      await new Promise(resolve => {
        setTimeout(resolve, this.#options.fadeOutDuration);
      });
    }

    this.#videoContainer.classList.remove('active');
  }

  // ==========================================
  // 動画ソース管理
  // ==========================================

  async changeVideo(videoSrc) {
    if (!this.#video) return false;

    try {
      const wasPlaying = this.#playbackState === PLAYBACK_STATES.PLAYING;

      if (wasPlaying) this.#video.pause();

      this.#video.src = videoSrc;

      await new Promise((resolve, reject) => {
        this.#video.addEventListener('loadeddata', resolve, { once: true });
        this.#video.addEventListener('error',      reject,  { once: true });
        this.#video.load();
      });

      if (wasPlaying) await this.#video.play();

      return true;

    } catch (error) {
      console.error('video-controller: 動画変更エラー:', error);
      return false;
    }
  }

  // ==========================================
  // 設定変更
  // ==========================================

  setVolume(volume) {
    if (!this.#video) return;
    const v = Math.max(0, Math.min(1, volume));
    this.#video.volume    = v;
    this.#options.volume  = v;
  }

  setPlaybackRate(rate) {
    if (!this.#video) return;
    const r = Math.max(0.25, Math.min(4, rate));
    this.#video.playbackRate    = r;
    this.#options.playbackRate  = r;
  }

  setLoop(loop) {
    if (!this.#video) return;
    this.#video.loop          = loop;
    this.#options.autoRestart = loop;
  }

  updateOptions(options) {
    this.#options = this.#validateOptions({ ...this.#options, ...options });
    this.#applyInitialSettings();
  }

  // ==========================================
  // 状態取得
  // ==========================================

  getPlaybackState() { return this.#playbackState; }
  isPlaying()        { return this.#playbackState === PLAYBACK_STATES.PLAYING; }
  isVisible()        { return this.#videoContainer?.classList.contains('active') ?? false; }
  getCurrentTime()   { return this.#video?.currentTime || 0; }
  getDuration()      { return this.#video?.duration    || 0; }
  getProgress()      { const d = this.getDuration(); return d === 0 ? 0 : this.getCurrentTime() / d; }
  isInitialized()    { return this.#initialized; }

  // ==========================================
  // クリーンアップ
  // ==========================================

  cleanup() {
    this.stop(false);
    this.#hideDownOverlay();

    gameState.offStateChange(this.#boundStateChangeHandler);

    if (this.#video) {
      this.#video.removeEventListener('ended',      this.#boundVideoEndedHandler);
      this.#video.removeEventListener('play',       this.#boundVideoPlayHandler);
      this.#video.removeEventListener('pause',      this.#boundVideoPauseHandler);
      this.#video.removeEventListener('error',      this.#boundVideoErrorHandler);
      this.#video.removeEventListener('loadeddata', this.#boundVideoLoadedHandler);
    }

    if (this.#closeButton) {
      this.#closeButton.removeEventListener('click', this.#boundCloseButtonHandler);
    }

    this.#initialized = false;
  }

  // ==========================================
  // デバッグ
  // ==========================================

  getOptions() {
    return { ...this.#options };
  }

  getStatus() {
    return {
      initialized:   this.#initialized,
      playbackState: this.#playbackState,
      isVisible:     this.isVisible(),
      currentTime:   this.getCurrentTime(),
      duration:      this.getDuration(),
      progress:      this.getProgress(),
      volume:        this.#video?.volume       || 0,
      playbackRate:  this.#video?.playbackRate || 1
    };
  }

  debugLog() {
    console.log('=== Video Controller 状態 ===');
    console.log('初期化済み:', this.#initialized);
    console.log('再生状態:', this.#playbackState);
    console.log('表示中:', this.isVisible());
    console.log('再生位置:', `${this.getCurrentTime().toFixed(2)}s / ${this.getDuration().toFixed(2)}s`);
    console.log('進捗:', `${(this.getProgress() * 100).toFixed(1)}%`);
    console.log('音量:', this.#video?.volume);
    console.log('再生速度:', this.#video?.playbackRate);
    console.log('オプション:', this.#options);
  }
}

// ==========================================
// エクスポート
// ==========================================

export function initVideoController(options = {}) {
  const controller = new VideoController();
  controller.init(options);
  return controller;
}

export const videoController = new VideoController();

export { PLAYBACK_STATES };
export default VideoController;