// IIFE(() => { ... })()，宣告一個匿名箭頭函式，然後立刻呼叫。當這支 JS 檔被載入並執行時，立刻跑裡面的初始化程式碼
(() => {
  // Fetch Attraction API
  const gridEl = document.querySelector(".attraction-grid");
  if (!gridEl) return;

  // 避免按 Enter 送出 form 造成頁面刷新（你後面 Part 2-5 會接管 submit）
  const searchForm = document.querySelector(".search-bar");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => e.preventDefault());
  }

  // 之後 Part 2-3 / 2-5 會用到：集中管理狀態
  const state = {
    nextPage: 0,
    isLoading: false,
    category: "",
    keyword: "",
  };

  function buildAttractionsUrl({ page, category, keyword }) {
    const params = new URLSearchParams();
    params.set("page", String(page));

    // 有值才塞，避免送出空字串參數
    if (category) params.set("category", category);
    if (keyword) params.set("keyword", keyword);

    return `/api/attractions?${params.toString()}`;
  }

  async function fetchAttractions({ page, category, keyword }) {
    const url = buildAttractionsUrl({ page, category, keyword });
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`Fetch /api/attractions failed: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    return json; // { nextPage, data }
  }

  function createAttractionCard(item) {
    const id = item.id;
    const name = item.name ?? "";
    const category = item.category ?? "";
    const mrt = item.mrt ?? "";
    const imgSrc = Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : "";

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

  function renderAttractions(list, { replace = false } = {}) {
    if (replace) gridEl.textContent = "";

    const frag = document.createDocumentFragment();
    list.forEach((item) => {
      frag.appendChild(createAttractionCard(item));
    });

    gridEl.appendChild(frag);
  }

  async function loadFirstPage() {
    if (state.isLoading) return;
    state.isLoading = true;

    try {
      // 把你目前 index.html 裡的 placeholder cards 清掉（你原本就註解說會改成動態塞）:contentReference[oaicite:5]{index=5}
      gridEl.textContent = "";

      const json = await fetchAttractions({
        page: 0,
        category: state.category,
        keyword: state.keyword,
      });

      renderAttractions(json.data, { replace: false });
      state.nextPage = json.nextPage; // Part 2-3 會用到（可能是 null）:contentReference[oaicite:6]{index=6}
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

// Category Selection

// Filtering by Category and Keyword

// MRT Name List and Filtered by MRT Name