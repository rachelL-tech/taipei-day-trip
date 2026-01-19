(() => {
    const userNameEl = document.querySelector("#booking-user-name");

    const failedEl = document.querySelector("#payment-content--failed");
    const successEl = document.querySelector("#payment-content--success");

    const orderNumberEls = document.querySelectorAll("[data-order-number]");

    const imageEl = document.querySelector("#booking-image");
    const attractionNameEl = document.querySelector("#booking-attraction-name");
    const dateEl = document.querySelector("#booking-date");
    const timeEl = document.querySelector("#booking-time");
    const priceEl = document.querySelector("#booking-price");
    const addressEl = document.querySelector("#booking-address");
    const attractionLinkEl = document.querySelector(".booking-trip-card__name");

    function showSection(which) {
        if (failedEl) failedEl.hidden = which !== "failed";
        if (successEl) successEl.hidden = which !== "success";
    }

    function getToken(){
        return localStorage.getItem("TOKEN");
    }

    function formatTime(raw) {
        if (raw === "morning") return "早上 9 點到下午 4 點";
        if (raw === "afternoon") return "下午 1 點到晚上 8 點";
    }
  
    function renderSuccess(data) {
        const trip = data.trip;
        const attraction = trip.attraction;

        if (imageEl && attraction.image) imageEl.src = attraction.image;

        if (attractionLinkEl) {
        // 「台北一日遊：<span id="booking-attraction-name">..</span>」
        if (attraction.id != null) attractionLinkEl.href = `/attraction/${attraction.id}`;
        }

        if (attractionNameEl && attraction.name) attractionNameEl.textContent = attraction.name;
        if (addressEl && attraction.address) addressEl.textContent = attraction.address;

        if (dateEl && trip.date) dateEl.textContent = trip.date;
        if (timeEl) timeEl.textContent = formatTime(trip.time);

        const amount = data.price;
        if (priceEl && amount != null) priceEl.textContent = `新台幣 ${amount} 元`;
    }

    async function init(){
        const orderNumber = new URLSearchParams(location.search).get("number"); // location.search 是網址 ? 後面的 query string，new URLSearchParams() 把 query string 變成「可查 key/value」的物件
        orderNumberEls.forEach((el) => (el.textContent = orderNumber)); // orderNumberEls 是用 querySelectorAll 拿到的 NodeList，沒有 textContent 方法

        // 沒有訂單編號：直接顯示失敗（但仍可點回 booking / home）
        if (!orderNumber) {
            showSection("failed");
            return;
        }

        const token = getToken();
        if (!token) {
            window.location.href = "/";
            return;
        }

        // 取登入者資訊，顯示名字
        try {
            const res = await fetch("/api/user/auth", { headers: { Authorization: `Bearer ${token}` }
            })
            const json = await res.json();

            if (res.ok && json.data && userNameEl) {
                userNameEl.textContent = json.data.name;
            }
        } catch(err) {
            // 就算名字抓不到，也不影響後續訂單顯示
            console.warn("fetch user failed:", err);
        }

        // 查訂單狀態
        try {
            const res = await fetch(`/api/order/${encodeURIComponent(orderNumber)}`, { headers: { Authorization: `Bearer ${token}` }
            })

            const json = await res.json();

            if (!res.ok || !json || json.error) {
                showSection("failed");
                return;
            }

            const data = json.data;
            const paid = (data.status === 0);

            renderSuccess(data);
            showSection(paid ? "success" : "failed");
        } catch(err) { // 連線層級失敗、res.json() 解析失敗（不是合法 JSON）
            console.warn("fetch order failed:", err);
            showSection("failed");
            return;
        }
    }

    init();
})();