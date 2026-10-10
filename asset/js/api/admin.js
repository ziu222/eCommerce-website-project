// api/admin.js — admin screens (users, shops, notifications, dashboard, finance) and the signed-in user's profile.

Api.adminUsers = (function () {
    return {
        list: function () { return Api.request("GET", "/admin/users"); },
        setStatus: function (id, change) { return Api.request("PATCH", "/admin/users/" + id + "/status", change); },
        createShop: function (data) { return Api.request("POST", "/admin/users/shops", data); },
        createAdmin: function (data) { return Api.request("POST", "/admin/users/admins", data); }
    };
})();

Api.adminShops = (function () {
    return {
        list: function () { return Api.request("GET", "/admin/shops"); },
        get: function (id) { return Api.request("GET", "/admin/shops/" + id); },
        // Resolves to { shop, temporaryPassword }; the password is shown once and never stored.
        create: function (data) { return Api.request("POST", "/admin/shops", data); },
        update: function (id, data) { return Api.request("PATCH", "/admin/shops/" + id, data); },
        setStatus: function (id, shopStatus) { return Api.request("PATCH", "/admin/shops/" + id + "/status", { shopStatus: shopStatus }); }
    };
})();

Api.adminNotifications = (function () {

    function query(params) {
        var qs = new URLSearchParams();
        Object.keys(params || {}).forEach(function (k) {
            if (params[k] && params[k] !== "all") qs.set(k, params[k]);
        });
        var s = qs.toString();
        return s ? "?" + s : "";
    }

    return {
        recipients: function (role) { return Api.request("GET", "/admin/notifications/recipients?role=" + encodeURIComponent(role)); },
        send: function (data) { return Api.request("POST", "/admin/notifications", data); },
        // params: { role, type, from, to } (YYYY-MM-DD)
        history: function (params) { return Api.request("GET", "/admin/notifications" + query(params)); }
    };
})();

Api.adminStats = (function () {

    function dashboard() {
        return Api.request("GET", "/admin/dashboard");
    }

    // filters: { shopId ("all" or an id), dateFrom, dateTo }
    function finance(filters) {
        var qs = new URLSearchParams();
        if (filters && filters.shopId && filters.shopId !== "all") qs.set("shopId", filters.shopId);
        if (filters && filters.dateFrom) qs.set("dateFrom", filters.dateFrom);
        if (filters && filters.dateTo) qs.set("dateTo", filters.dateTo);
        var s = qs.toString();
        return Api.request("GET", "/admin/finance" + (s ? "?" + s : ""));
    }

    return { dashboard: dashboard, finance: finance };
})();

Api.profile = (function () {
    return {
        get: function () { return Api.request("GET", "/users/me"); },
        // changes: { name, email, avatar, coverPhoto, currentPassword, newPassword } (any subset)
        update: function (changes) { return Api.request("PATCH", "/users/me", changes); }
    };
})();
