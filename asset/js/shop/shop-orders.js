// shop-orders.js — the shop's orders: move each one on (confirm, ship, deliver, cancel) and hear about
// new orders and customer cancellations as they happen, over the server-sent events stream.

(function () {

    var esc = Api.escapeHtml;
    var orders = [];
    var filter = "all";
    var search = "";
    var fresh = {}; // order ids that just changed, highlighted once

    var STATUS_LABEL = { pending: "To confirm", confirmed: "To ship", shipped: "On the way", delivered: "Delivered", cancelled: "Cancelled" };
    // what the shop may do next from each status (mirrors the server's TRANSITIONS for shops)
    var NEXT = {
        pending: [["confirmed", "Confirm", "fa-check"], ["cancelled", "Cancel", "fa-xmark"]],
        confirmed: [["shipped", "Mark shipped", "fa-truck-fast"]],
        shipped: [["delivered", "Mark delivered", "fa-circle-check"]]
    };
    var EVENT_NOTE = { pending: "New order", cancelled: "Cancelled by the customer" };

    function money(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }
    function date(s) { return new Date(s).toLocaleDateString("en-US", { month: "short", day: "2-digit" }); }

    function render() {
        var count = function (s) { return orders.filter(function (o) { return o.status === s; }).length; };
        document.getElementById("statPending").textContent = count("pending");
        document.getElementById("statConfirmed").textContent = count("confirmed");
        document.getElementById("statShipped").textContent = count("shipped");
        document.getElementById("statDelivered").textContent = count("delivered");
        var pending = count("pending");
        var badge = document.getElementById("navPending");
        badge.textContent = pending;
        badge.hidden = !pending;
        document.title = (pending ? "(" + pending + ") " : "") + "My Orders - EC SHOP";

        var q = search.toLowerCase();
        var rows = orders.filter(function (o) {
            if (filter !== "all" && o.status !== filter) return false;
            return !q || ("#" + o.id + " " + (o.customer ? o.customer.name : "")).toLowerCase().indexOf(q) !== -1;
        });
        document.getElementById("emptyState").style.display = rows.length ? "none" : "";
        document.getElementById("orderTableBody").innerHTML = rows.map(function (o) {
            var items = o.items.map(function (i) { return esc(i.name) + " × " + i.qty; }).join("<br>");
            var actions = (NEXT[o.status] || []).map(function (a) {
                return '<button type="button" class="step-btn' + (a[0] === "cancelled" ? " step-btn--danger" : "") + '" data-id="' + o.id + '" data-to="' + a[0] + '"><i class="fa-solid ' + a[2] + '"></i> ' + a[1] + "</button>";
            }).join("");
            return '<tr data-order="' + o.id + '"' + (fresh[o.id] ? ' class="row-fresh"' : "") + ">" +
                '<td><span class="order-id">#' + o.id + "</span></td>" +
                "<td>" + esc(o.customer ? o.customer.name : "—") + (o.shipping ? '<div class="cell-sub">' + esc(o.shipping.address) + "</div>" : "") + "</td>" +
                '<td class="cell-items">' + items + "</td>" +
                "<td><strong>" + money(o.total) + "</strong></td>" +
                "<td>" + (o.paymentMethod === "wallet" ? "Wallet" : "Cash on delivery") + "</td>" +
                '<td><span class="badge badge-' + o.status + '">' + STATUS_LABEL[o.status] + "</span></td>" +
                "<td>" + date(o.createdAt) + "</td>" +
                '<td><div class="step-actions">' + (actions || '<span class="cell-sub">Nothing to do</span>') + "</div></td>" +
                "</tr>";
        }).join("");
        fresh = {};
    }

    async function load() {
        try {
            orders = await Api.orders.shopList();
        } catch (e) {
            if (e.status === 401 || e.status === 403) { location.href = "../admin/admin-login.html"; return; }
            toast("Could not load orders: " + e.message, true);
        }
        render();
    }

    function toast(text, isError) {
        var box = document.getElementById("liveToasts");
        var t = document.createElement("div");
        t.className = "live-toast" + (isError ? " is-error" : "");
        t.textContent = text;
        box.appendChild(t);
        setTimeout(function () { t.classList.add("is-leaving"); }, 4500);
        setTimeout(function () { t.remove(); }, 5000);
    }

    document.getElementById("orderTableBody").addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-to]");
        if (!btn) return;
        var to = btn.dataset.to;
        if (to === "cancelled" && !confirm("Cancel order #" + btn.dataset.id + "? The stock goes back and a wallet payment is refunded.")) return;
        btn.closest(".step-actions").querySelectorAll("button").forEach(function (b) { b.disabled = true; });
        try {
            var updated = await Api.orders.shopSetStatus(btn.dataset.id, to);
            orders = orders.map(function (o) { return o.id === updated.id ? updated : o; });
            render();
        } catch (err) {
            // e.g. the customer cancelled a moment ago: show it and refresh
            toast(err.message, true);
            load();
        }
    });

    // ---------- live updates

    function setLive(state, text) {
        document.getElementById("livePill").dataset.state = state;
        document.getElementById("liveText").textContent = text;
    }

    function listen() {
        if (!window.EventSource) { setLive("off", "Refresh to update"); return; }
        var es = new EventSource("/api/notifications/stream");
        var dropped = false;
        es.addEventListener("open", function () {
            setLive("on", "Live");
            // events sent while the connection was down are not replayed
            if (dropped) { dropped = false; load(); }
        });
        es.addEventListener("error", function () { dropped = true; setLive("off", "Reconnecting…"); });
        es.addEventListener("order", function (e) {
            var d = JSON.parse(e.data);
            fresh[d.orderId] = true;
            toast((EVENT_NOTE[d.status] || "Order updated") + " · #" + d.orderId);
            load();
        });
    }

    // ---------- page

    document.addEventListener("DOMContentLoaded", function () {
        var raw = localStorage.getItem("ecshop_currentUser");
        var user = raw ? JSON.parse(raw) : null;
        if (!user || user.role !== "shop") { location.href = "../admin/admin-login.html"; return; }
        document.getElementById("topbarAvatar").textContent = (user.shopName || user.name || "S").charAt(0).toUpperCase();
        document.getElementById("topbarUserName").textContent = user.shopName || user.name || "Shop";

        ["logoutBtn", "logoutLink"].forEach(function (id) {
            document.getElementById(id).addEventListener("click", async function (e) {
                e.preventDefault();
                await Api.auth.logout();
                location.href = "../admin/admin-login.html";
            });
        });
        document.querySelectorAll(".filter-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll(".filter-tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
                filter = btn.dataset.status;
                render();
            });
        });
        document.getElementById("orderSearch").addEventListener("input", function () { search = this.value.trim(); render(); });

        load();
        listen();
    });

})();
