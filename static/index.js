// IIFE(() => { ... })()，宣告一個匿名箭頭函式，然後立刻呼叫。當這支 JS 檔被載入並執行時，立刻跑裡面的初始化程式碼
(() => {
  // Fetch Attraction API (without filtering)
  const gridEl = document.querySelector(".attraction-grid");
  if (!gridEl) return;

  // 避免按 Enter 送出 form 造成頁面刷新（你後面 Part 2-5 會接管 submit）
  const searchForm = document.querySelector(".search-bar");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => e.preventDefault());
  }

  // for Part 2-3 / 2-5：集中管理頁面狀態
  const state = {
    nextPage: 0,
    isLoading: false, // 防止短時間重複 fetch（Part 2-3）
    category: "",
    keyword: "", // 搜尋條件（Part 2-5）
  };

  // 把參數組成 API URL（含 query string）
  function buildAttractionsUrl({ page, category, keyword }) {
    const params = new URLSearchParams();
    // page 一定有值

    params.set("page", String(page));
    // category、keyword 有值才塞參數
    if (category) params.set("category", category);
    if (keyword) params.set("keyword", keyword);

    return `/api/attractions?${params.toString()}`;
  }

  // 打 /api/attractions
  async function fetchAttractions({ page, category, keyword }) {
    const url = buildAttractionsUrl({ page, category, keyword });
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Fetch /api/attractions failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return json; // { nextPage, data }
  }

  // 把「一筆 attraction 資料」轉成「一張卡片 DOM」
  function createAttractionCard(item) {
    const id = item.id;
    const name = item.name;
    const category = item.category;
    const mrt = item.mrt;
    const imgSrc = item.images.length > 0 ? item.images[0] : "";

    // <article class="attraction-card" data-attraction-id="...">
    const article = document.createElement("article");
    article.className = "attraction-card";
    article.dataset.attractionId = String(id);

    // <a class="attraction-card__link" href="/attraction/<id>">
    const link = document.createElement("a");
    link.className = "attraction-card__link";
    link.href = `/attraction/${encodeURIComponent(id)}`;

    // <div class="attraction-card__media">...</div>
    const media = document.createElement("div");
    media.className = "attraction-card__media";

    const img = document.createElement("img");
    img.className = "attraction-card__image";
    img.src = imgSrc;
    img.alt = name;
    img.loading = "lazy";

    const titleBar = document.createElement("div");
    titleBar.className = "attraction-card__title-bar";

    const title = document.createElement("h3");
    title.className = "attraction-card__title";
    title.textContent = name;

    titleBar.appendChild(title);
    media.appendChild(img);
    media.appendChild(titleBar);

    // <div class="attraction-card__meta">...</div>
    const meta = document.createElement("div");
    meta.className = "attraction-card__meta";

    const mrtSpan = document.createElement("span");
    mrtSpan.className = "attraction-card__mrt";
    mrtSpan.textContent = mrt;

    const catSpan = document.createElement("span");
    catSpan.className = "attraction-card__category";
    catSpan.textContent = category;

    meta.appendChild(mrtSpan);
    meta.appendChild(catSpan);

    link.appendChild(media);
    link.appendChild(meta);
    article.appendChild(link);

    return article;
  }

  // 把「多筆 attraction 資料陣列」渲染到 gridEl 裡
  function renderAttractions(list, { replace = false } = {}) {
    if (replace) gridEl.textContent = "";

    const frag = document.createDocumentFragment(); // 在記憶體裡先建立一個「看不見的暫存容器」再一次插入，避免一直操作 DOM ，效能跟流暢度會比較好
    list.forEach((item) => {
      frag.appendChild(createAttractionCard(item));
    });

    gridEl.appendChild(frag);
  }

  // 載入並顯示第一頁的景點，且把 nextPage 存起來
  async function loadFirstPage() {
    if (state.isLoading) return; // 防止重複觸發

    state.isLoading = true;

    try {
      const json = await fetchAttractions({
        page: 0,
        category: state.category,
        keyword: state.keyword,
      });

      renderAttractions(json.data, { replace: true });
      state.nextPage = json.nextPage; // for Part 2-3 
    } catch (err) {
      console.error(err);
      gridEl.textContent = "載入失敗，請稍後再試。";
      state.nextPage = null;
    } finally {
      state.isLoading = false;
    }
  }

  document.addEventListener("DOMContentLoaded", loadFirstPage);
})();

// Fetch Attraction API for More Data Automatically
// state.pendingLoadMore：載入中又被觸發了嗎？（先記起來）

// Category Selection

// Filtering by Category and Keyword
// 用 requestId 或 AbortController，讓最後一次操作有效

// MRT Name List and Filtered by MRT Name
// 用 requestId 或 AbortController，讓最後一次操作有效