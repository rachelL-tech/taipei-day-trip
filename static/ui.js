(() => {
  const UI = (window.AppUI = window.AppUI || {}); // 確保全站共用物件 window.AppUI：若 window.AppUI 已存在（其他檔案已建立過），就沿用。若不存在，就建立空物件 {}

  // 頂部 Loading Bar 效果 (等 API 時會跑)
  let loadingCount = 0; // 支援同時多個請求

  function ensureTopLoading() { // 確保元素存在並取得 <div id="top-loading" class="top-loading">
    let el = document.querySelector("#top-loading");
    if (!el) {
      el = document.createElement("div");
      el.id = "top-loading";
      el.className = "top-loading";
      el.hidden = true; // 預設先隱藏，請求再顯示
      el.innerHTML = `<div class="top-loading__bar"></div>`; // 插入內層 bar，內層跑 keyframes
      document.body.appendChild(el);
    }
    return el; // 讓 startLoading 能拿到 element
  }

  UI.startLoading = function startLoading() {
    loadingCount += 1;
    const el = ensureTopLoading();
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-active")); // 先讓 el 出現在畫面，下加上 class 觸發動畫
  };

  UI.stopLoading = function stopLoading() {
    loadingCount = Math.max(0, loadingCount - 1); // 保底不會變負數，即使 stop 被多呼叫一次也只會「多關一次」，避免在if (loadingCount !== 0)時卡住
    if (loadingCount !== 0) return; // 只要還有任何 fetch 請求沒結束，就不要關 loading

    const el = document.querySelector("#top-loading");
    if (!el) return;

    el.classList.remove("is-active");
    window.setTimeout(() => {
      if (loadingCount === 0) el.hidden = true; // if (loadingCount === 0)防止這 180ms 內又有人 startLoading，別把它藏起來
    }, 180);
  };

  // 顯示/隱藏做 fade/slide
  // 一般元件
  UI.fadeShow = function fadeShow(el) {
    if (!el) return;
    el.hidden = false; // .fade-slide 的 opacity: 0;，預設看不到，等 is-open 才可見 */
    requestAnimationFrame(() => el.classList.add("is-open"));
  };

  UI.fadeHide = function fadeHide(el) {
    if (!el) return;
    el.classList.remove("is-open");
    window.setTimeout(() => (el.hidden = true), 700);
  };

  UI.fadeToggle = function fadeToggle(el, open) {
    if (open) UI.fadeShow(el);
    else UI.fadeHide(el);
  };

  // dialog（因為 dialog 不是用 hidden 控制，要另外定義）
  UI.openDialog = function (dialogEl) {
    if (!dialogEl || dialogEl.open) return;
    dialogEl.showModal();
    requestAnimationFrame(() => dialogEl.classList.add("is-open"));
  };

  UI.closeDialog = function (dialogEl) {
    if (!dialogEl || !dialogEl.open) return;
    dialogEl.classList.remove("is-open");
    window.setTimeout(() => dialogEl.close(), 700);
  };
})();
