(() => {
    const TOKEN_KEY = "TOKEN"; // 拿來當 localStorage 的 key 名稱
    const state = { signedIn: false };

    const authLink = document.querySelector("#auth-link");
    const dialog = document.querySelector("#auth-dialog");
    const titleEl = document.querySelector("#auth-title");
    const closeBtn = dialog.querySelector('[data-action="close"]');
    const signinForm = document.querySelector("#signin-form");
    const signupForm = document.querySelector("#signup-form");
    const submitBtn = document.querySelector(".auth-form__submit");

    if (!authLink || !dialog || !titleEl || !signinForm || !signupForm) {
        return;
    } else {
        // Part 4-2: Pop-Up Dialog for User Sign Up/In
        // 告訴使用者表單送出結果
        function setMessage(text = "", type = "") {
            const msgEl = (signinForm.hidden ? signupForm : signinForm).querySelector(".auth-form__message"); // 取得目前顯示的 form 裡的 auth-form__message
            if (!msgEl) return;
            msgEl.textContent = text;
            msgEl.classList.remove("is-error", "is-success");
            if (type) msgEl.classList.add(type);
        }

        // 切換 form
        function switchForm(form) {
            const isSignup = form === "signup";
            titleEl.textContent = isSignup ? "註冊會員帳戶" : "登入會員帳戶";
            signupForm.hidden = !isSignup;
            signinForm.hidden = isSignup;
            setMessage(); // 切換表單時清掉訊息
        }

        // 開/關 dialog
        function openAuthDialog() {
            switchForm("signin"); // 預設打開是登入表單，因為 HTML 先寫 signup-form hidden 只保證「頁面第一次載入時」預設是登入表單。關閉 dialog 後，DOM 狀態不會自動回到 HTML 初始狀態。使用者有可能曾經切換到註冊表單，所以打開表單前，要把表單切回登入表單，避免看到上次留下的狀態
            dialog.showModal();
        }
        function closeAuthDialog() {
            dialog.close();
        }
        window.openAuthDialog = openAuthDialog;

        // 事件監聽：點擊 authLink 打開 dialog。統一放在part4-3處理

        // 事件監聽：點擊關閉按鈕/backdrop
        if (closeBtn) closeBtn.addEventListener("click", closeAuthDialog);
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) { // 點到 backdrop 時，e.target 會是 dialog 本身，因為 <dialog> 的「backdrop」不是一個獨立的 DOM 元素；它是 dialog 元素自己畫出來的背景區（由瀏覽器渲染、用 ::backdrop 去樣式化）。所以你點到那塊「灰灰的背景」時，瀏覽器會把這個 click 事件實際命中的 DOM 節點視為 dialog 本身；相反地，點在對話框內容區（裡面有 form、button…）時，e.target 就會是那些子元素，而不是 dialog
                closeAuthDialog();
            }
        });
        dialog.addEventListener("close", (e) => {
            signinForm.reset(); // 把 <form> 裡的欄位回到「初始值」，回到那個預設值，若沒有預設值，就清空。(不會刪掉 DOM、也不會把 JS 變數 state 一起重置) 
            signupForm.reset();
        });
        // 事件監聽：點擊「點此註冊」，跳轉到註冊表單
        dialog.addEventListener("click",(e) => {
            const a = e.target.closest("a[data-action]"); // 從點到的元素開始往上（父層）找，找到最近的「<a> 且具有 data-action 屬性」的那一個。
            if (!a) return;

            const action = a.dataset.action;
            if (action === "to-signup") {
                e.preventDefault();
                switchForm("signup");
            } else if (action === "to-signin") {
                e.preventDefault();
                switchForm("signin");
            }
        });
    }

    // Part 4-3: User Sign-In Status Checking Procedure
    function renderAuthLink() {
        authLink.textContent = state.signedIn ? "登出系統" : "登入/註冊";
    }

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function clearToken() {
        localStorage.removeItem(TOKEN_KEY);
    }

    async function checkSignInStatus() {
        const token = getToken();

        if (!token) {
            state.signedIn = false;
            renderAuthLink();
            return;
        } // 沒有 token 就直接跳過 API 檢查

        try {
            const res = await fetch("/api/user/auth", {
                headers: { Authorization: `Bearer ${token}` },
            }); // 任務要求"fetch User API to get current signed-in user information"，確認 token 有效性後，再渲染 authLink

            const json = await res.json();

            state.signedIn = !!json.data;
            if (!json.data) { // token 無效：token 已過期、密鑰換了、格式壞了、被竄改
                clearToken(); // 清掉 localStorage 的無效 token
            }
        } catch {
            state.signedIn = false;
        } finally {
            renderAuthLink();
        }
    }

    // Part 4-4: Sign Up Procedure
    // setMessage("註冊成功，請登入", "is-success");
    // Part 4-5: Sign In Procedure
    // setMessage("登入失敗：帳號或密碼錯誤", "is-error");

    authLink.addEventListener("click", (e) => {
        e.preventDefault();
        
        if (state.signedIn) {
            // 已登入狀態下，點 authLink 是「登出系統」
            clearToken();
            location.reload();
        } else {
            // 未登入狀態下，點 authLink 是「登入/註冊」
            openAuthDialog();
        }
    });

    checkSignInStatus();
})();