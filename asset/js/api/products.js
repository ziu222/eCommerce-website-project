// api/products.js — catalog (public), shop products and admin review against /api.
// Responses are mapped to the field names the pages already use (image, reviews, oldPrice 0 = none).
Api.products = (function () {

    function toLegacy(p) {
        return {
            id: p.id,
            shopId: p.shopId,
            shop: p.shop || null,
            name: p.name,
            price: p.price,
            oldPrice: p.oldPrice || 0,
            image: p.imageUrl,
            imageUrl: p.imageUrl,
            category: p.category,
            rating: p.rating,
            reviews: p.reviewCount,
            stock: p.stock,
            description: p.description,
            specs: p.specs || {},
            details: p.details || null,
            adminStatus: p.adminStatus,
            adminNote: p.adminNote || "",
            moderationReasons: p.moderationReasons || [],
            reviewedBy: p.reviewedBy,
            reviewedAt: p.reviewedAt,
            createdAt: String(p.createdAt).slice(0, 10),
            updatedAt: String(p.updatedAt).slice(0, 10)
        };
    }

    // addtocart.js builds cart lines from this browser-side cache of products the shopper has seen.
    // Prices are only for display: checkout prices every line again on the server.
    function mirror(products) {
        try {
            var stored = JSON.parse(localStorage.getItem("ecshop_products") || "[]");
            var index = {};
            stored.forEach(function (p, i) { index[p.id] = i; });
            products.forEach(function (p) {
                if (index[p.id] === undefined) { index[p.id] = stored.length; stored.push(p); }
                else { stored[index[p.id]] = p; }
            });
            localStorage.setItem("ecshop_products", JSON.stringify(stored));
        } catch (e) { /* storage full or blocked: this product just cannot be added to the cart */ }
        return products;
    }

    function query(params) {
        var qs = new URLSearchParams();
        Object.keys(params || {}).forEach(function (k) {
            if (params[k] !== undefined && params[k] !== null && params[k] !== "") qs.set(k, params[k]);
        });
        var s = qs.toString();
        return s ? "?" + s : "";
    }

    // params: { category, q, minPrice, maxPrice, sort, page, limit }
    async function list(params) {
        var page = await Api.request("GET", "/products" + query(params));
        page.items = mirror(page.items.map(toLegacy));
        return page;
    }

    async function get(id) {
        var product = toLegacy(await Api.request("GET", "/products/" + encodeURIComponent(id)));
        mirror([product]);
        return product;
    }

    function categories() {
        return Api.request("GET", "/products/categories");
    }

    return { list: list, get: get, categories: categories, toLegacy: toLegacy, mirror: mirror, query: query };

})();

// Admin review. Methods resolve to { success, product } or { success: false, error } like the old Store calls.
Api.adminProducts = (function () {

    async function listAll(params) {
        var page = await Api.request("GET", "/admin/products" + Api.products.query(params));
        return Api.products.mirror(page.items.map(Api.products.toLegacy));
    }

    function stats() {
        return Api.request("GET", "/admin/products/stats");
    }

    async function act(path, body) {
        try {
            var product = await Api.request("POST", "/admin/products/" + path, body || {});
            Api.products.mirror([Api.products.toLegacy(product)]);
            return { success: true, product: product };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    return {
        listAll: listAll,
        stats: stats,
        review: function (id, decision, note) { return act(id + "/review", { decision: decision, note: note || undefined }); },
        suspend: function (id, note) { return act(id + "/suspend", { note: note || undefined }); },
        restore: function (id) { return act(id + "/restore"); }
    };

})();

// A shop's own products. Every create or edit goes back to the admin review queue.
Api.shopProducts = (function () {

    function toApi(data) {
        var body = {
            name: data.name,
            price: data.price,
            imageUrl: data.imageUrl,
            category: data.category,
            stock: data.stock,
            description: data.description
        };
        if (data.oldPrice) body.oldPrice = data.oldPrice;
        if (data.details) body.details = data.details;
        return body;
    }

    return {
        list: async function () { return (await Api.request("GET", "/shop/products")).map(Api.products.toLegacy); },
        create: function (data) { return Api.request("POST", "/shop/products", toApi(data)); },
        update: function (id, data) { return Api.request("PATCH", "/shop/products/" + id, toApi(data)); },
        remove: function (id) { return Api.request("DELETE", "/shop/products/" + id); }
    };

})();

// Product photos. Resolves to the https url of the stored image.
Api.uploads = (function () {

    async function image(file) {
        var form = new FormData();
        form.append("file", file);
        var res = await fetch("/api/uploads/image", { method: "POST", credentials: "same-origin", body: form });
        var data = null;
        try { data = await res.json(); } catch (e) { /* empty body */ }
        if (!res.ok) {
            throw new Api.ApiError(res.status, (data && data.message) || res.statusText);
        }
        return data.url;
    }

    return { image: image };

})();
