// api/auth.js — login, registration and session sync against /api/auth.
// The real session is the httpOnly cookie. "ecshop_currentUser" in localStorage is only a cached
// copy of the server's session user so pages can render and redirect without waiting for the network.
Api.auth = (function () {

    var SESSION_KEY = "ecshop_currentUser";

    function saveSession(session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        // Transitional: pages not yet moved to the API still read users from the local Store.
        if (typeof Store !== "undefined" && Store.ensureUser) Store.ensureUser(session);
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
