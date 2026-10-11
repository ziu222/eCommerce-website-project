// api/commerce.js — wallet, coupons and orders against /api.
// Responses are mapped to the field names the pages already use.

Api.wallet = (function () {

    var GATEWAY_LABEL = { momo: "MoMo", shopee: "ShopeePay", vnqr: "VNQRPay" };

    function describe(tx) {
        if (tx.type === "topup") return "Nạp tiền qua " + Api.escapeHtml(GATEWAY_LABEL[tx.gateway] || tx.gateway || "ví");
        if (tx.type === "refund") return "Hoàn tiền đơn #" + tx.orderId;
        return "Thanh toán đơn #" + tx.orderId;
    }

    // Resolves to { balance, transactions } where transactions use the old store's shape (deposit / payment / refund).
    async function get() {
        var data = await Api.request("GET", "/wallet");
        return {
            balance: data.balance,
            transactions: data.transactions.map(function (tx) {
                return {
                    id: tx.id,
                    type: tx.type === "topup" ? "deposit" : tx.type,
                    amount: tx.amount,
                    balanceAfter: tx.balanceAfter,
                    orderId: tx.orderId,
                    description: describe(tx),
                    date: tx.createdAt
                };
            })
        };
    }

    function topUp(amount, gateway) {
        return Api.request("POST", "/wallet/topup", { amount: amount, gateway: gateway });
    }

    return { get: get, topUp: topUp };

})();

Api.coupons = (function () {

    function toApi(data, omit) {
        var body = {
            code: data.code,
            type: data.type,
            value: data.value,
            minOrder: data.minOrder,
            usageLimit: data.usageLimit,
            expiresAt: data.expiresAt || null,
            isActive: data.isActive
        };
        if (!omit && data.shopId !== undefined) body.shopId = data.shopId;
        return body;
    }

    // Cart items are { id, quantity } as stored by addtocart.js. Resolves like the old Store.validateCoupon.
    async function validate(code, cart) {
        try {
            var res = await Api.request("POST", "/coupons/validate", {
                code: code,
                items: cart.map(function (i) { return { productId: i.id, qty: i.quantity }; })
            });
            return { valid: true, discount: res.discount, applicableTotal: res.applicableTotal, coupon: res.coupon };
        } catch (e) {
            return { valid: false, message: e instanceof Api.ApiError && e.status === 400 ? e.message : "Could not check the coupon right now" };
        }
    }

    function crud(base, omitShop) {
        return {
            list: function () { return Api.request("GET", base); },
            create: function (data) { return Api.request("POST", base, toApi(data, omitShop)); },
            update: function (id, data) { return Api.request("PATCH", base + "/" + id, toApi(data, omitShop)); },
            remove: function (id) { return Api.request("DELETE", base + "/" + id); }
        };
    }

    return { validate: validate, shop: crud("/shop/coupons", true), admin: crud("/admin/coupons", false) };

})();

Api.orders = (function () {

    function toLegacy(o) {
        return {
            id: o.id,
            customerId: o.customerId,
            userId: o.customerId,
            customer: o.customer,
            shopId: o.shopId,
            shop: o.shop,
            subtotal: o.subtotal,
            discount: o.discount,
            total: o.total,
            couponCode: o.couponCode,
            status: o.status,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            shipping: o.shipping || null,
            createdAt: String(o.createdAt).slice(0, 10),
            items: o.items.map(function (i) {
                return { productId: i.productId, name: i.name, image: i.imageUrl, qty: i.qty, price: i.price };
            }),
            statusHistory: o.statusHistory
        };
    }

    // Resolves to { orders, total }; one order is created per shop in the cart.
    async function checkout(cart, paymentMethod, couponCode, addressId) {
        var res = await Api.request("POST", "/orders/checkout", {
            paymentMethod: paymentMethod,
            couponCode: couponCode || undefined,
            addressId: addressId || undefined,
            items: cart.map(function (i) { return { productId: i.id, qty: i.quantity }; })
        });
        return { orders: res.orders.map(toLegacy), total: res.total };
    }

    async function adminList(params) {
        var qs = new URLSearchParams();
        Object.keys(params || {}).forEach(function (k) { if (params[k] !== undefined && params[k] !== "" && params[k] !== "all") qs.set(k, params[k]); });
        var query = qs.toString();
        return (await Api.request("GET", "/admin/orders" + (query ? "?" + query : ""))).map(toLegacy);
    }

    // Resolves to { success, order } or { success: false, error } like the old Store.updateOrderStatus callers expect.
    async function adminSetStatus(id, status) {
        try {
            return { success: true, order: toLegacy(await Api.request("PATCH", "/admin/orders/" + id + "/status", { status: status })) };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // The signed-in customer's own orders, newest first.
    async function mine() {
        return (await Api.request("GET", "/orders")).map(toLegacy);
    }

    // Only a pending order can be cancelled; the server refunds a wallet payment.
    async function cancel(id) {
        return toLegacy(await Api.request("POST", "/orders/" + encodeURIComponent(id) + "/cancel"));
    }

    // The signed-in shop's orders, newest first, and moving one on (confirm, ship, deliver, cancel).
    async function shopList() {
        return (await Api.request("GET", "/shop/orders")).map(toLegacy);
    }

    async function shopSetStatus(id, status) {
        return toLegacy(await Api.request("PATCH", "/shop/orders/" + encodeURIComponent(id) + "/status", { status: status }));
    }

    return { checkout: checkout, mine: mine, cancel: cancel, adminList: adminList, adminSetStatus: adminSetStatus, shopList: shopList, shopSetStatus: shopSetStatus };

})();
