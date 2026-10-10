// api/auth.js — login, registration and session sync against /api/auth.
// The real session is the httpOnly cookie. "ecshop_currentUser" in localStorage is only a cached
// copy of the server's session user so pages can render and redirect without waiting for the network.
Api.auth = (function () {

    var SESSION_KEY = "ecshop_currentUser";

    function saveSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
    }

    async function login(identifier, password, portal) {
        return saveSession(await Api.request("POST", "/auth/login", { identifier: identifier, password: password, portal: portal }));
    }

    async function register(data) {
        return saveSession(await Api.request("POST", "/auth/register", data));
    }

    function registerShop(data) {
        return Api.request("POST", "/auth/register-shop", data);
    }

    async function logout() {
        try { await Api.request("POST", "/auth/logout"); } catch (e) { /* cookie is cleared client-side below either way */ }
        clearSession();
    }

    // Refreshes the cached session from the server. A cached session the server no longer
    // accepts (expired, account suspended, pre-API leftovers) is dropped and the page reloads once.
    async function sync() {
        if (!localStorage.getItem(SESSION_KEY)) return;
        try {
            saveSession(await Api.request("GET", "/auth/me"));
        } catch (e) {
            if (e instanceof Api.ApiError && (e.status === 401 || e.status === 403)) {
                clearSession();
                window.location.reload();
            }
        }
    }

    // The pre-API local store kept users (with plaintext passwords), orders and more in this browser. Remove them once.
    function purgeLegacyData() {
        try {
            if (localStorage.getItem("ecshop_api_v1")) return;
            ["ecshop_users", "ecshop_orders", "ecshop_notifications", "ecshop_coupons", "ecshop_seeded",
             "ecshop_products", "ecshop_products_v3", "ecshop_product_seed_v2", "ecshop_wallet_v1"].forEach(function (k) {
                localStorage.removeItem(k);
            });
            localStorage.setItem("ecshop_api_v1", "1");
        } catch (e) { /* storage unavailable */ }
    }
    purgeLegacyData();

    document.addEventListener("DOMContentLoaded", sync);

    return {
        login: login,
        register: register,
        registerShop: registerShop,
        logout: logout,
        sync: sync,
        clearSession: clearSession
    };

})();
