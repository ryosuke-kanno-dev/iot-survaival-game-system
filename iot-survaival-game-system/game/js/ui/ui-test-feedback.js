// ==========================================
// ui-test-feedback.js - 試合開始前のテストフィードバックUI管理
// ==========================================

/**
 * 画面中央上部に一瞬だけ表示されるテストフィードバック用ポップアップを作成・表示する
 * @param {string} message - 表示するテキスト内容
 * @param {string} type - "shoot" または "hit" (スタイル調整用)
 */
export function showTestFeedback(message, type = "shoot") {
  // コンテナ取得（無ければ作成）
  let container = document.getElementById("testFeedbackContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "testFeedbackContainer";
    container.className = "test-feedback-container";
    document.body.appendChild(container);
  }

  // ポップアップ要素作成
  const popup = document.createElement("div");
  popup.className = `test-feedback-popup test-feedback-${type}`;
  popup.textContent = message;

  // コンテナに追加
  container.appendChild(popup);

  // 表示アニメーション（少し待ってからクラス付与）
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popup.classList.add("is-visible");
    });
  });

  // 数秒後にフェードアウトして削除
  setTimeout(() => {
    popup.classList.remove("is-visible");
    // トランジション完了後にDOMから削除
    setTimeout(() => {
      if (popup.parentNode === container) {
        container.removeChild(popup);
      }
    }, 300); // CSSのtransition時間と合わせる
  }, 1500);
}
