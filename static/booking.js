(() => {
  // Part 5-5: Complete Booking Page
  const TOKEN_KEY = "TOKEN";
  
  // 確保只在 /booking 頁執行
  const userNameEl = document.querySelector("#booking-user-name");
  if (!userNameEl) return;

  const emptyEl = document.querySelector("#booking-empty");
  const contentEl = document.querySelector("#booking-content");

  const imageEl = document.querySelector("#booking-image");
  const attractionNameEl = document.querySelector("#booking-attraction-name");
  const dateEl = document.querySelector("#booking-date");
  const timeEl = document.querySelector("#booking-time");
  const priceEl = document.querySelector("#booking-price");
  const addressEl = document.querySelector("#booking-address");
  const totalEl = document.querySelector("#booking-total");
  const deleteBtn = document.querySelector("#booking-delete-btn");
  const attractionLinkEl = document.querySelector(".booking-trip-card__name");

  const contactNameEl = document.querySelector("#contact-name");
  const contactEmailEl = document.querySelector("#contact-email");

  let currentBooking = null; // 存 booking 資料，之後按付款會用到

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }
  
  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function showEmpty() {
    if (emptyEl) emptyEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
  }

  function showContent() {
    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;
  }

  function TimeText(slot) {
    if (slot === "morning") return "早上 9 點到下午 4 點";
    if (slot === "afternoon") return "下午 2 點到晚上 9 點";
    // return "";
  }

  function PriceText(price) {
    return `新台幣 ${price} 元`;
  }

  async function fetchUser(token) {
    const res = await fetch("/api/user/auth", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    return json.data ?? null;
  }

  async function fetchBooking(token) {
    const res = await fetch("/api/booking", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) return "UNAUTHORIZED";

    const json = await res.json();
    return json.data ?? null; // null 表示沒有 booking
  }

  async function deleteBooking(token) {
    const res = await fetch("/api/booking", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 403) return "UNAUTHORIZED";

    const json = await res.json();
    return !!(res.ok && json.ok);
  }

  function renderBooking(data) {
    // data: { attraction: {id,name,address,image}, date, time, price }
    const attraction = data.attraction || {};

    if (attractionLinkEl && attraction.id) {
      attractionLinkEl.href = `/attraction/${attraction.id}`;
    }
    if (imageEl) imageEl.src = attraction.image || "";
    if (attractionNameEl) attractionNameEl.textContent = attraction.name || "";
    if (addressEl) addressEl.textContent = attraction.address || "";

    if (dateEl) dateEl.textContent = data.date || "";
    if (timeEl) timeEl.textContent = TimeText(data.time);
    if (priceEl) priceEl.textContent = PriceText(data.price);

    if (totalEl) totalEl.textContent = String(data.price);
  }

  function bindDelete(token) {
    if (!deleteBtn) return;
    // When a user clicked on this delete button, fetch Booking API to delete booking data, and refresh page after successful deleting.
    deleteBtn.addEventListener("click", async () => {
      deleteBtn.disabled = true;
      try {
        const ok = await deleteBooking(token);

        if (ok === "UNAUTHORIZED") {
          clearToken();
          window.location.href = "/";
          return;
        }

        if (ok) {
          location.reload();
          return;
        }

        alert("刪除失敗，請稍後再試");
      } catch (err) {
        console.error(err);
        alert("伺服器錯誤，請稍後再試");
      } finally {
        deleteBtn.disabled = false;
      }
    });
  }

  async function init() {
    // 先把畫面收起來，避免閃假資料
    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = true;

    const token = getToken();
    if (!token) {
      window.location.href = "/";
      return;
    }

    // // Fetch User API to check user signed-in status, redirect to homepage if the user has not signed in.
    let user = null;
    try {
      user = await fetchUser(token);
    } catch (err) {
      console.error(err);
    }
    if (!user) {
      clearToken();
      window.location.href = "/";
      return;
    }

    userNameEl.textContent = user.name || "";
    // 自動帶入聯絡資訊
    if (contactNameEl && !contactNameEl.value) contactNameEl.value = user.name || "";
    if (contactEmailEl && !contactEmailEl.value) contactEmailEl.value = user.email || "";

    // Fetch Booking API to get booking data, render the booking page based on the response of API.
    try {
      const booking = await fetchBooking(token);

      if (booking === "UNAUTHORIZED") {
        clearToken();
        window.location.href = "/";
        return;
      }

      if (!booking) {
        showEmpty(); // 沒有預定行程
        return;
      }

      currentBooking = booking;

      renderBooking(booking);
      showContent();
      bindDelete(token);

      initTapPayFields();
      bindSubmit();
    } catch (err) {
      console.error(err);
      alert("載入失敗，請稍後再試");
      showEmpty();
    }
  }

  // Part 6-2: Front-End Process for Credit Card Payment
  // ===== TapPay (Sandbox) =====
  const TAPPAY_APP_ID = 166541;
  const TAPPAY_APP_KEY = "app_6PsSrnZWiKb7BO4xA9EMuiJIXdjcCM3748x4aCJCtRm9YAKdJrdjWS6oJUWv"; 
  const TAPPAY_ENV = "sandbox";
  let tappayInited = false;

  const contactPhoneEl = document.querySelector("#contact-phone");
  const submitBtn = document.querySelector("#booking-submit-btn");

  // TapPay 初始化（setupSDK）
  function initTapPayFields() {
    if (tappayInited) return; // 只初始化一次，防止同一個容器被重複插入iframe，以及綁多次事件監聽（綁幾次回呼幾次，可能造成卡頓或按鈕 disabled/enable 邏輯怪）

    // 確認 TapPay SDK 有載入成功。 TPDirect 是 TapPay SDK 在瀏覽器上掛的全域物件（script 載入後才會出現）
    if (!window.TPDirect) { // script CDN 被擋、或 HTML 沒有引入等
      console.error("TPDirect not loaded");
      return;
    }

    TPDirect.setupSDK(TAPPAY_APP_ID, TAPPAY_APP_KEY, TAPPAY_ENV); // 把 APP_ID / APP_KEY 和環境（sandbox 或 production）交給 TapPay

    // 把 iframe 欄位掛進 DOM
    TPDirect.card.setup({
      fields: { // 告訴 TapPay 要放哪些欄位，以及要放在哪個 DOM 位置
        number: {
          element: "#card-number", // 把卡號 iframe 插到 id 為 card-number 的元素裡
          placeholder: "**** **** **** ****",
        },
        expirationDate: {
          element: "#card-expiration-date", // 把到期日 iframe 插到 id 為 card-expiration-date 的元素裡
          placeholder: "MM / YY",
        },
        ccv: {
          element: "#card-ccv", // 把安全碼 iframe 插到 id 為 card-ccv 的元素裡
          placeholder: "CCV",
        },
      },
      styles: { // 設定 iframe 內 input 的字型、顏色等
        input: {
          color: "#000",
          "font-size": "16px",
          "font-family": "Noto Sans TC, system-ui, -apple-system, Segoe UI, Roboto, PingFang TC, Microsoft JhengHei, Arial, sans-serif",
        },
        ".invalid": { // 欄位狀態不合法時
          color: "#c43131",
        },
      },
    });

    // 預設先禁用，等 canGetPrime = true 才開
    if (submitBtn) submitBtn.disabled = true;

    // 事件監聽：欄位狀態更新事件 → 透過 TPDirect.ccv.onUpdate() 去監測目前輸入狀況，會在任何欄位有狀態變動（點進卡號欄位（focus）、卡號輸入或刪掉數字等）時，內部計算/整理狀態物件，再呼叫 callback 並提供狀態物件當參數（update）。// update = { canGetPrime: true, hasError: false, status: { name_en: 0, email: 0, phone_number: 0, phone_country_code: 0}}
    TPDirect.card.onUpdate((update) => {
      if (!submitBtn) return;

      submitBtn.disabled = !update.canGetPrime; // update.canGetPrime 是布林值。true：全部欄位皆為正確，可以呼叫 getPrime 了 → 按鈕 disabled=false to get prime ；false：格式不完整/不合法 → 按鈕 disabled=true
    });

    tappayInited = true; // 標記已初始化完成
  }

    // get TapPay Prime and send it with other necessary data to the back-end
    function getPrimeOnSubmit(){
      // 得到 TapPay Fields 卡片資訊的輸入狀態
      const tappayStatus = TPDirect.card.getTappayFieldsStatus();
      if (!tappayStatus.canGetPrime) {
        alert("信用卡資訊未填完整或格式錯誤");
        return;
      }
      
      TPDirect.card.getPrime((result) => {
        if (result.status !== 0){
          alert("get prime failed " + result.msg);
          return;
        }
        return result.card.prime;
      });
    }

    function bindSubmit(){
      if (!submitBtn) return;

      submitBtn.addEventListener("click", async () => {
        if (!currentBooking) {
          alert("目前沒有待預訂的行程");
          return;
        }
        
        submitBtn.disabled = true;

        const contact = {
          name: contactNameEl.value.trim() || "",
          email: contactEmailEl.value.trim() || "",
          phone: contactPhoneEl.value.trim() || "",
        }

        if (!contact.name || !contact.email || !contact.phone){
          alert("請完整填寫聯絡資訊")
          return;
        }
        
        // get TapPay Prime and send it with other necessary data to the back-end
        try {
          const prime = getPrimeOnSubmit();
          const res = await fetch("/api/orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  "prime": prime,
                  "order": {
                    "price": currentBooking.price,
                    "trip": {
                      "attraction": {
                        "id": currentBooking.attraction["id"],
                        "name": currentBooking.attraction["name"],
                        "address": currentBooking.attraction["address"],
                        "image": currentBooking.attraction["image"]
                      }
                    },
                    "date": currentBooking.date,
                    "time": currentBooking.time,
                  },
                  "contact": {
                    "name": contactNameEl.value.trim(),
                    "email": contactEmailEl.value.trim(), 
                    "phone": contactPhoneEl.value,
                  }
                })
              });
          const json = await res.json();
        } catch (err) {
            alert(err.message || "取得 prime 失敗")
        } finally {
          // 把按鈕狀態交回「目前 TapPay 欄位狀態」決定
          try {
            const s = TPDirect.card.getTappayFieldsStatus();
            submitBtn.disabled = !s.canGetPrime;
          } catch {
            submitBtn.disabled = false;
          }
        }
      });
    }

  init();

})();