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

      renderBooking(booking);
      showContent();
      bindDelete(token);
    } catch (err) {
      console.error(err);
      alert("載入失敗，請稍後再試");
      showEmpty();
    }
  }

  init();
})();