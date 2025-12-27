(() => {
  // Fetch Attraction API
  const nameEl = document.querySelector("#attraction-name")
  if (!nameEl) return;

  const subtitleEl = document.querySelector("#attraction-category-mrt")
  const descEl = document.querySelector("#attraction-description")
  const addrEl = document.querySelector("#attraction-address");
  const transportEl = document.querySelector("#attraction-transport");
  const imgEl = document.querySelector("#carousel-image");

  // 從網址抓 id ：不建議經過 index 的 click 事件把 id 存在 cookie/localStorage/變數，因為直接貼連結、在景點頁按重新整理、或從 Google 搜尋進來等情況，都不會經過 index 的 click 事件，而且cookie / localStorage 是「全站共享」，同時開很多不同 id 的 tab 會互相污染
  function getAttractionIdFromPath() {
    const parts = window.location.pathname.split("/"); // window.location.pathname 是網址的「路徑部分」，不含網域與 query。.split("/") 會用 / 切成陣列：/attraction/10  => ["", "attraction", "10"]
    const last = parts[parts.length - 1];
    const id = Number(last);
    return id;
  }

  const attractionId = getAttractionIdFromPath();
  if (!attractionId) {
    nameEl.textContent = "景點編號不正確";
    return Number.isFinite(id) && id > 0 ? id : null; // Number.isFinite(id) 檢查 id 是不是有限的數字（ NaN、Infinity 都會是 false ）
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

    const images = data.images;
    if (images.length > 0) {
      imgEl.src = images[0];
      imgEl.alt = data.name;
    } else {
      imgEl.removeAttribute("src");
      imgEl.alt = "";
    }
    // indicator 先做到「數量正確」：Part 3-5 再做左右切換
    renderIndicator(images.length, 0);
  }

  // Image Slideshow
  function renderIndicator(count, activeIndex = 0) {
    const indicator = document.querySelector(".carousel__indicator");
    indicator.innerHTML = "";

    for (let i = 0; i < count; i++) {
      const seg = document.createElement("span");
      seg.className = "carousel__segment" + (i === activeIndex ? " is-active" : "");
      indicator.appendChild(seg);
    }
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

  init();

})();

// function setActiveIndicator(activeIndex) {
//   document.querySelectorAll(".carousel__segment").forEach((seg, i) => {
//     seg.classList.toggle("is-active", i === activeIndex);
//   });
// }