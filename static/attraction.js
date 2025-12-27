(() => {
  // Part 3-2: Fetch Attraction API
  const nameEl = document.querySelector("#attraction-name")
  if (!nameEl) return; // 確定在景點頁

  const subtitleEl = document.querySelector("#attraction-category-mrt")
  const descEl = document.querySelector("#attraction-description")
  const addrEl = document.querySelector("#attraction-address");
  const transportEl = document.querySelector("#attraction-transport");
  const imgEl = document.querySelector("#carousel-image");
  const indicatorEl = document.querySelector(".carousel__indicator");
  let images = [];

  // 從網址抓 id ：不建議經過 index 的 click 事件把 id 存在 cookie/localStorage/變數，因為直接貼連結、在景點頁按重新整理、或從 Google 搜尋進來等情況，都不會經過 index 的 click 事件，而且cookie / localStorage 是「全站共享」，同時開很多不同 id 的 tab 會互相污染
  function getAttractionIdFromPath() {
    const parts = window.location.pathname.split("/"); // window.location.pathname 是網址的「路徑部分」，不含網域與 query。.split("/") 會用 / 切成陣列：/attraction/10  => ["", "attraction", "10"]
    const last = parts[parts.length - 1];
    const id = Number(last);
    return Number.isFinite(id) && id > 0 ? id : null; // Number.isFinite(id) 檢查 id 是不是有限的數字（ NaN、Infinity 會是 false ）
  }

  const attractionId = getAttractionIdFromPath();
  if (!attractionId) {
    nameEl.textContent = "景點編號不正確";
    return;
  }

  async function fetchAttraction(id) {
    const res = await fetch(`/api/attraction/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(`Fetch attraction failed: ${res.status} ${res.statusText}`);
    }
    const json = await res.json();
    return json;
  }

  function renderAttraction(data) {
    nameEl.textContent = data.name ?? "";
    subtitleEl.textContent = `${data.category ?? ""} at ${data.mrt ?? ""}`;
    descEl.textContent = data.description ?? "";
    addrEl.textContent = data.address ?? "";
    transportEl.textContent = data.transport ?? "";

    images = data.images;
    if (!imgEl || !indicatorEl) return;
    // 沒圖片時，不要殘留舊圖
    if (slideImages.length === 0) { 
      imgEl.removeAttribute("src");
      imgEl.alt = "";
      return;
    }
    createSegment(slideImages.length, 0);
    showSlide(0);
  }

  async function init() {
    try {
      const json = await fetchAttraction(attractionId);
      renderAttraction(json.data);
    } catch (err) {
      console.error(err);
      nameEl.textContent = "載入失敗，請稍後再試";
    }
  }

  // Part 3-3: Time Selection
  const priceEl = document.querySelector(".booking-card__price");
  const timeEl = document.querySelector(".booking-card__time");

  const TIME_PRICE = {
    morning: 2000,
    afternoon: 2500,
  };

  function setPriceByTime(time){
    if(!priceEl) return;
    const price = TIME_PRICE[time];
    priceEl.textContent = `新台幣 ${price} 元`;
  }

  function getCheckedTime() {
    const checked = document.querySelector('input[name="time"]:checked'); // 選到 <input> ＋ name="time"＋目前已勾選的 DOM 元素
    if(!checked) return "morning";
    return checked.value;
  }

  function bindTimeSelection() {
    // 綁事件前，先把畫面價格跟「目前被勾選的 radio」同步（避免未來你改預設值會不同步）
    setPriceByTime(getCheckedTime());

    if (!timeEl) return;
    timeEl.addEventListener("change", (e) => {
      const input = e.target.closest('input[name="time"]');
      if (!input) return;
      setPriceByTime(input.value);
    });
  }

  // Part 3-5: Image Slideshow
  const leftBtn = document.querySelector(".carousel__btn--left");
  const rightBtn = document.querySelector(".carousel__btn--right");

  // 把click事件翻譯成使用者想去第幾張
  function bindSlideshow() {
    if (leftBtn) leftBtn.addEventListener("click", () => showSlide(currentIndex - 1));
    if (rightBtn) rightBtn.addEventListener("click", () => showSlide(currentIndex + 1));
  }

  // 建立 segment
  function createSegment(count, activeIndex) {
    indicatorEl.innerHTML = "";

    for (let i = 0; i < count; i++) {
      const seg = document.createElement("span");
      seg.className = "carousel__segment" + (i === activeIndex ? " is-active" : "");
      indicatorEl.appendChild(seg);
    }
  }

  // 更新 is-active 狀態
  function setActiveSegment(activeIndex) {
    document.querySelectorAll(".carousel__segment").forEach((seg, i) => {
      seg.classList.toggle("is-active", i === activeIndex); // toggle(className, condition) 代表 condition 是 true 時 → 加上 "is-active"（原本就有的話 → 維持不變，不會重複加）; condition 是 false 時 → 移除 "is-active"（原本沒有的話 → 維持不變）
    });
  }

  // 無限循環輪播：第一張往左時跳到最後一張；最後一張往右時跳到第一張。例如count = 5 ， i = -1 時，return 4 ；i = 5 時，return 0
  function normalizeIndex(i, count) {
  return ((i % count) + count) % count; // 負數也能正確循環
  }

  function showSlide(targetIndex) {
    const count = images.length;
    if (!imgEl || count === 0) return; // 如果 count === 0，左箭頭 click 時，currentIndex 會變 NaN

    currentIndex = normalizeIndex(targetIndex, count);
    imgEl.src = images[currentIndex];
    imgEl.alt = nameEl.textContent ?? "";
    setActiveSegment(currentIndex);
  }

  bindTimeSelection();
  bindSlideshow();
  init();
})();