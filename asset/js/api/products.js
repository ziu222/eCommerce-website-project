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
            adminStatus: p.adminStatus,
            adminNote: p.adminNote || "",
            reviewedBy: p.reviewedBy,
            reviewedAt: p.reviewedAt,
            createdAt: String(p.createdAt).slice(0, 10),
            updatedAt: String(p.updatedAt).slice(0, 10)
        };
    }

    // Transitional: cart and orders still read products from the local store until they move to the API.
    function mirror(products) {
        if (typeof Store !== "undefined" && Store.mergeProducts) Store.mergeProducts(products);
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
