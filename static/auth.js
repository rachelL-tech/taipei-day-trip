(() => {
    // Part 4-3: User Sign-In Status Checking Procedure
    const TOKEN_KEY = "TOKEN"; // 拿來當 localStorage 的 key 名稱
    const state = { signedIn: false };

    const authLink = document.querySelector("#auth-link");
    if (!authLink) return;

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

            state.signedIn = !!json.data; // !! 會把任何值「轉成布林值（true/false）」
            if (!json.data) { // token 無效：token 已過期、密鑰換了、格式壞了、被竄改
                clearToken(); // 清掉 localStorage 的無效 token
            }
        } catch {
            state.signedIn = false;
        } finally {
            renderAuthLink();
        }
    }

    // Part 4-2: Pop-Up Dialog for User Sign Up/In
    

    checkSignInStatus();
})();