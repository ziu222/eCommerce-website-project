// api/account.js — the signed-in customer's address book, saved products, membership, notifications and sessions.

Api.account = (function () {

    var base = "/users/me";

    return {
        addresses: {
            list: function () { return Api.request("GET", base + "/addresses"); },
            add: function (data) { return Api.request("POST", base + "/addresses", data); },
            update: function (id, data) { return Api.request("PATCH", base + "/addresses/" + id, data); },
            remove: function (id) { return Api.request("DELETE", base + "/addresses/" + id); }
        },
        wishlist: {
            // products come back in the shape the pages use, and are cached for add-to-cart
            list: async function () { return Api.products.mirror((await Api.request("GET", base + "/wishlist")).map(Api.products.toLegacy)); },
            ids: function () { return Api.request("GET", base + "/wishlist/ids"); },
            save: function (productId) { return Api.request("PUT", base + "/wishlist/" + productId); },
            unsave: function (productId) { return Api.request("DELETE", base + "/wishlist/" + productId); }
        },
        membership: function () { return Api.request("GET", base + "/membership"); },
        notifications: {
            list: function () { return Api.request("GET", "/notifications"); },
            unread: function () { return Api.request("GET", "/notifications/unread-count"); },
            read: function (id) { return Api.request("POST", "/notifications/" + id + "/read"); },
            readAll: function () { return Api.request("POST", "/notifications/read-all"); }
        },
        // signs out every other device; this browser stays signed in
        logoutAll: function () { return Api.request("POST", "/auth/logout-all"); }
    };

})();
