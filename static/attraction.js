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
  const TOKEN_KEY = "TOKEN";
  const PENDING_BOOKING_KEY = "PENDING_BOOKING";

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

    initSlideshowWithImages(data.images);
  }

  async function init() {
    window.AppUI.startLoading();
    try {
      const json = await fetchAttraction(attractionId);
      renderAttraction(json.data);
    } catch (err) {
      console.error(err);
      nameEl.textContent = "載入失敗，請稍後再試";
    } finally {
      window.AppUI.stopLoading();
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
    const checked = document.querySelector('input[name="time"]:checked'); // 選到 <input> ＋ name="time"＋ 目前勾選的 DOM 元素
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

  // 無限循環輪播：第一張往左時跳到最後一張；最後一張往右時跳到第一張。例如count = 5 ， i = -1 時，return 4 ；i = 5 時，return 0
  function normalizeIndex(i, count) {
    return ((i % count) + count) % count; // 負數也能正確循環
  }

  function showSlide(targetIndex) {
    const count = images.length;
    if (!imgEl || count === 0) return;

    currentIndex = normalizeIndex(targetIndex, count);

    imgEl.src = images[currentIndex];
    imgEl.alt = nameEl.textContent ?? "";

    setActiveSegment(currentIndex);
    preloadAround(currentIndex);
  }
  
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

  // 更新 segment 的 is-active 狀態
  function setActiveSegment(activeIndex) {
    document.querySelectorAll(".carousel__segment").forEach((seg, i) => {
      seg.classList.toggle("is-active", i === activeIndex); // toggle(className, condition) 代表 condition 是 true 時 → 加上 "is-active"（原本就有的話 → 維持不變，不會重複加）; condition 是 false 時 → 移除 "is-active"（原本沒有的話 → 維持不變）
    });
  }

  // 圖片預載功能
  const preloadCache = new Map();
  
  function preloadImage(url) {
    if (!url) return;
    if (preloadCache.has(url)) return;

    const img = new Image();
    img.src = url;

    preloadCache.set(url, img);
  }

  function preloadAround(centerIndex) {
    const count = images.length;
    if (count <= 1) return;

    for (let offset = 1; offset <= 2; offset++) { // offset=0 代表自己那張，預載前後圖時通常會跳過自己
      preloadImage(images[normalizeIndex(centerIndex + offset, count)]);
      preloadImage(images[normalizeIndex(centerIndex - offset, count)]);
    }
  }

  function initSlideshowWithImages(newImages) {
    images = newImages;
    currentIndex = 0;

    if (!imgEl) return;

    if (images.length === 0) {
      imgEl.removeAttribute("src");
      imgEl.alt = "";
      if (indicatorEl) indicatorEl.innerHTML = "";
      return;
    }

    createSegment(images.length, 0);
    preloadAround(0); // 預載前後2張
    showSlide(0);
  }

  // Part 5-4: Create a Booking
  function isPastDate(dateStr) {
    if (!dateStr) return false;
    const [y, m, d] = dateStr.split("-").map(Number);
    const selected = new Date(y, m - 1, d);
    selected.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return selected < today;
  }

  function bindCreateBooking() {
    const bookingForm = document.querySelector(".booking-card__form");
    if (!bookingForm) return;

    const dateInput = bookingForm.querySelector('#booking-date');
    const todayStr = new Date().toLocaleDateString("en-CA") // new Date()：建立「現在此刻」的日期時間物件（包含年月日、時分秒）；.toLocaleDateString("en-CA")把日期用加拿大英文格式輸出成字串（YYYY-MM-DD）

    if (dateInput) dateInput.min = todayStr; // 把 min 設成「今天」後： min 是 HTML date input 的屬性，允許選擇/輸入的最小日期

    bookingForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const date = dateInput ? dateInput.value : null;
      const time = getCheckedTime();
      const price = TIME_PRICE[time];

      if (!date) {
        alert("請選擇日期");
        return;
      }

      if(date < todayStr) {
        alert("日期不可選擇過去日期");
        return;
      }

      const bookingData = {
        attractionId: attractionId,
        date: date,
        time: time,
        price: price,
      }; 
      
      const btn = bookingForm.querySelector('.booking-card__submit');
      if (btn) btn.disabled = true;

      const token = localStorage.getItem(TOKEN_KEY);
      try {
        // 未登入：先存 pending，再打開登入 dialog
        if (!token) {
          sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(bookingData)); // sessionStorage 只能存字串
          window.AuthDialog.open();
          return;
        }

        // 已登入：直接建立預定
        window.AppUI.startLoading();
        const res = await fetch("/api/booking", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify(bookingData),
        });

        const json = await res.json();
        console.log(json);

        if (res.ok && json.ok) {
          window.location.href = "/booking";
          return;
        } 

        if (res.status === 403) { // Token 過期/無效：當作未登入處理
          localStorage.removeItem(TOKEN_KEY);
          sessionStorage.setItem(PENDING_BOOKING_KEY, JSON.stringify(bookingData));
          window.AuthDialog.open();
          return;
        }

        alert(json.message);
      } catch (err) {
        console.error(err);
        alert("伺服器錯誤，請稍後再試");
        return;
      } finally {
        if (btn) btn.disabled = false;
        window.AppUI.stopLoading();
      }
    });
  }

  bindTimeSelection();
  bindSlideshow();
  bindCreateBooking();
  init();
})();
