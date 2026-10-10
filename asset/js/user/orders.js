// orders.js — the customer's own orders: status, items, total, and cancelling a pending order.

(function () {

    var esc = Api.escapeHtml;
    var STEPS = ["pending", "confirmed", "shipped", "delivered"];
    var STEP_LABEL = { pending: "Placed", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered" };
    var BADGE = { pending: "badge-warn", confirmed: "", shipped: "", delivered: "badge-ok", cancelled: "badge-danger" };
    var PAY = { wallet: "Wallet", cod: "Cash on delivery" };

    function date(iso) {
        return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    }

    function tracker(order) {
        if (order.status === "cancelled") return "";
        var at = STEPS.indexOf(order.status);
        return '<ol class="steps" aria-label="Order progress">' + STEPS.map(function (s, i) {
            return '<li style="--k:' + i + '" class="' + (i < at ? "done" : i === at ? "now" : "") + '"' + (i === at ? ' aria-current="step"' : "") + ">" + STEP_LABEL[s] + "</li>";
        }).join("") + "</ol>";
    }

    function card(o) {
        var items = o.items.map(function (i) {
            return '<li><img src="' + esc(i.image) + '" alt=""' + (UI.isPlaceholder(i.image) ? ' class="is-ph"' : "") + ' data-category="">' +
                '<a href="product-detail.html?id=' + i.productId + '">' + esc(i.name) + "</a>" +
                "<span>" + i.qty + " × " + UI.money(i.price) + "</span></li>";
        }).join("");
        var shop = o.shop && o.shop.shopName ? " · " + esc(o.shop.shopName) : "";
        var paid = o.paymentStatus === "refunded" ? "Refunded" : o.paymentStatus === "paid" ? "Paid" : "Pay on delivery";
        return '<article class="card order">' +
            '<header class="order-head"><div><h2>Order #' + o.id + "</h2><p class=\"muted\">" + esc(date(o.createdAt)) + shop + "</p></div>" +
            '<span class="badge ' + (BADGE[o.status] || "") + '">' + esc(o.status.charAt(0).toUpperCase() + o.status.slice(1)) + "</span></header>" +
            tracker(o) +
            '<ul class="order-items">' + items + "</ul>" +
            '<footer class="order-foot"><div class="muted">' + esc(PAY[o.paymentMethod] || o.paymentMethod) + " · " + paid +
            (o.discount > 0 ? " · saved " + UI.money(o.discount) : "") + "</div>" +
            '<div class="order-total"><span>Total</span><strong>' + UI.money(o.total) + "</strong></div>" +
            (o.status === "pending" ? '<button type="button" class="btn btn-ghost btn-sm" data-cancel="' + o.id + '">Cancel order</button>' : "") +
            "</footer></article>";
    }

    var list = document.getElementById("orderList");

    async function load() {
        try {
            var orders = await Api.orders.mine();
            document.getElementById("orderCount").textContent = orders.length ? orders.length + (orders.length === 1 ? " order" : " orders") : "";
            list.innerHTML = orders.length ? orders.map(card).join("") :
                '<div class="empty card"><span class="anim" data-lottie="empty-box" data-loop style="--size:160px"><span class="ms">receipt_long</span></span><h3>No orders yet</h3><p>When you check out, your orders show up here.</p><a class="btn btn-primary" href="product.html">Start shopping</a></div>';
        } catch (e) {
            if (e.status === 401 || e.status === 403) { location.href = "login.html?next=orders.html"; return; }
            list.innerHTML = '<div class="empty card"><span class="ms">cloud_off</span><h3>Could not load your orders</h3><p>' + esc(e.message) + "</p></div>";
        }
    }

    list.addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-cancel]");
        if (!btn) return;
        if (!confirm("Cancel this order? Items go back in stock and a wallet payment is refunded.")) return;
        btn.disabled = true;
        try {
            await Api.orders.cancel(btn.dataset.cancel);
            UI.toast("Order cancelled");
            load();
        } catch (err) {
            UI.toast(err.message, "error");
            btn.disabled = false;
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        var u = getCurrentUser();
        if (!u || u.role !== "customer") { location.href = "login.html?next=orders.html"; return; }
        load();
    });

})();
