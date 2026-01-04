(() => {
    const TOKEN_KEY = "TOKEN"; // 拿來當 localStorage 的 key 名稱
    const state = { signedIn: false };

    const authLink = document.querySelector("#auth-link");
    const dialog = document.querySelector("#auth-dialog");
    const titleEl = document.querySelector("#auth-title");
    const signinForm = document.querySelector("#signin-form");
    const signupForm = document.querySelector("#signup-form");

    if (!authLink || !dialog || !signinForm || !signupForm) return;

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
        if (titleEl) titleEl.textContent = isSignup ? "註冊會員帳戶" : "登入會員帳戶";
        signupForm.hidden = !isSignup;
        signinForm.hidden = isSignup;
    }

    // 開/關 dialog
    function openAuthDialog() {
        switchForm("signin"); // 預設打開是登入表單，以符合「At the first shot, show a form for user sign in」。 HTML 寫 signup-form hidden 只保證「頁面第一次載入時」的預設是登入表單。因此在關閉 dialog 後，DOM 狀態不會自動回到 HTML 初始狀態，只要使用者曾經切換到註冊表單，就要確保他在下次打開表單前，把表單切回登入表單
        dialog.showModal();
    }
    function closeAuthDialog() {
        dialog.close();
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
    // 註冊成功後，自動切到登入表單的 timer
    let signupSuccessTimer = null;
    function clearSignupTimer() {
        if (signupSuccessTimer) {
            clearTimeout(signupSuccessTimer); // 取消已經排程出去的 setTimeout
            signupSuccessTimer = null;
        }
    }

    async function handleSignupSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(signupForm); // 用 signupForm 這個 <form> 元素，建立一個 FormData 物件，自動把表單裡所有有 name 的欄位目前的值收集起來
        const name = formData.get("name") ?? "";
        const email = formData.get("email") ?? "";
        const password = formData.get("password") ?? "";

        if (!name || !email || !password) {
            setMessage("請完整填寫姓名、信箱和密碼", "is-error");
            setTimeout(() => setMessage(""), 2000);
            return;
        }
        
        const btn = signupForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true; // 避免防止使用者在 request 還沒回來前一直狂點，造成重複送出表單，及競態問題（race condition）、更好的 UX（按下去後按鈕變不可點，使用者知道「正在處理」）

        try {
            const res = await fetch("/api/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });

            const json = await res.json();
            
            if (json.ok) {
                setMessage("註冊成功，請登入系統", "is-success");
                setTimeout(() => setMessage(""), 2000);

                // 2.5 秒後自動切到登入表單
                clearSignupTimer();
                signupSuccessTimer = setTimeout(() => { // setTimeout 會回傳「計時器識別碼timerId」（在瀏覽器通常是數字，在 Node.js 通常是 Timeout 物件），可以拿這個 ID 之後去 clearTimeout(...) 取消還沒到期的計時器
                    switchForm("signin");
                    signupForm.reset(); // 清掉註冊表單欄位
                    signupSuccessTimer = null; // timer 執行完後把變數清掉，不會殘留一個舊的 ID
                }, 2000);
                return;
            }else{
                setMessage(`註冊失敗：${json.message}`, "is-error");
                setTimeout(() => setMessage(""), 2000);
            }
        } catch (err) {
            setMessage("伺服器錯誤，請稍後再試", "is-error");
            setTimeout(() => setMessage(""), 2000);
        } finally {
            if (btn) btn.disabled = false; // 不管成功失敗，request 完成後都把按鈕設回可點
        }
    }

    // Part 4-5: Sign In Procedure
    function setToken(token) {
        localStorage.setItem(TOKEN_KEY, token);
    }

    async function handleSigninSubmit(e) {
        e.preventDefault();

        const formData = new FormData(signinForm);
        const email = formData.get("email") ?? "";
        const password = formData.get("password") ?? "";

        if(!email || !password){
            setMessage("請輸入信箱和密碼", "is-error");
            setTimeout(() => setMessage(""), 2000);
        }

        const btn = signinForm.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        try{
            const res = await fetch("/api/user/auth", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const json = await res.json()
            if (json.token) {
                setToken(json.token);
                location.reload(); // 把整個目前頁面重新載入一次（等同按下重新整理），但localStorage 不會被清掉
                return;
            }else{
                setMessage(json.message, "is-error");
                setTimeout(() => setMessage(""), 2000);
            }
        } catch (err){
            setMessage("伺服器錯誤，請稍後再試", "is-error");
            setTimeout(() => setMessage(""), 2000);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ===== 事件監聽 =====
    // 點擊 authLink 打開 dialog
    authLink.addEventListener("click", (e) => {
        e.preventDefault();
        
        if (state.signedIn) {
            // 已登入狀態下，點 authLink 是「登出系統」（Part 4-6: Sign Out Procedure）
            clearToken();
            location.reload();
        } else {
            // 未登入狀態下，點 authLink 是「登入/註冊」
            openAuthDialog();
        }
    });

    // 點擊關閉按鈕/backdrop
    const closeBtn = dialog.querySelector('[data-action="close"]');
    if (closeBtn) closeBtn.addEventListener("click", closeAuthDialog);
    dialog.addEventListener("click", (e) => {
        if (e.target === dialog) { // 點到 backdrop 時，e.target 會是 dialog 本身，因為 <dialog> 的「backdrop」不是一個獨立的 DOM 元素；它是 dialog 元素自己畫出來的背景區（由瀏覽器渲染、用 ::backdrop 去樣式化）。所以你點到那塊「灰灰的背景」時，瀏覽器會把這個 click 事件實際命中的 DOM 節點視為 dialog 本身；相反地，點在對話框內容區（裡面有 form、button…）時，e.target 就會是那些子元素，而不是 dialog
            closeAuthDialog();
        }
    });
    dialog.addEventListener("close", (e) => {
        clearSignupTimer(); // 若使用者註冊成功立刻關掉註冊表單，又立刻再打開表單（openAuthDialog()預設是登入表單），再立刻手動點註冊表單時，因為上輪沒清 timer，時間到會又切回登入表單，造成困擾
        
        signinForm.reset(); // 把 <form> 裡的欄位回到「初始值」，回到預設值，若沒有預設值，就清空(不會刪掉 DOM、也不會把 JS 變數 state 一起重置) 
        signupForm.reset();
    });

    // 點擊「點此註冊、點此登入」，跳轉表單
    dialog.addEventListener("click",(e) => {
        const a = e.target.closest("a[data-action]"); // 從點到的元素開始往上（父層）找，找到最近的「<a> 且具有 data-action 屬性」的那個元素
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
    
    // 送出註冊表單
    signupForm.addEventListener("submit", handleSignupSubmit);

    // 送出登入表單
    signinForm.addEventListener("submit", handleSigninSubmit);

    checkSignInStatus();
})();