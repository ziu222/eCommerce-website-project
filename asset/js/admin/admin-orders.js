// ============================================================
// admin-orders.js — Orders Management Logic

Auth.requirePermission("orders.view");

(function () {

    var state = {
        status: "all",
        shopId: "all",
        dateFrom: "",
        dateTo: "",
        searchText: "",
        selectedOrderId: null,
        orders: []
    };

    function formatCurrency(amount) {
        return "$" + Number(amount || 0).toLocaleString("en-US");
    }

    function formatDate(dateStr) {
        if (!dateStr) return "-";

        var date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "2-digit",
            year: "numeric"
        });
    }

    function escapeHtml(text) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(text == null ? "" : String(text)));
        return div.innerHTML;
    }

    function renderTopbarUser() {
        var user = Auth.getCurrentUser();
        if (!user) return;

        document.getElementById("topbarUserName").textContent = user.name;
        document.getElementById("topbarAvatar").textContent = user.name.charAt(0).toUpperCase();
    }

    function renderStats() {
        var orders = state.orders;
        var pending = 0;
        var delivered = 0;
        var cancelled = 0;

        for (var i = 0; i < orders.length; i++) {
            var status = orders[i].status;
            if (status === "pending") pending++;
            if (status === "delivered") delivered++;
            if (status === "cancelled") cancelled++;
        }

        document.getElementById("statTotalOrders").textContent = orders.length;
        document.getElementById("statPendingOrders").textContent = pending;
        document.getElementById("statDeliveredOrders").textContent = delivered;
        document.getElementById("statCancelledOrders").textContent = cancelled;
    }

    function renderShopFilter() {
        var seen = {};
        var shops = [];
        for (var k = 0; k < state.orders.length; k++) {
            var s = state.orders[k].shop;
            if (s && !seen[s.id]) { seen[s.id] = true; shops.push(s); }
        }
        shops.sort(function (a, b) { return a.id - b.id; });

        var select = document.getElementById("shopFilter");
        var html = '<option value="all">All Shops</option>';

        for (var i = 0; i < shops.length; i++) {
            html += '<option value="' + shops[i].id + '">' + escapeHtml(shops[i].shopName || "Unknown") + "</option>";
        }

        select.innerHTML = html;
        select.value = state.shopId;
    }

    function getFilteredOrders() {
        var orders = state.orders.slice();
        var results = [];

        orders.sort(function (a, b) {
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            var customerName = order.customer ? order.customer.name : "";
            var shopName = order.shop ? (order.shop.shopName || "") : "";
            var searchTarget = ("#" + order.id + " " + customerName + " " + shopName).toLowerCase();
            var orderDate = order.createdAt || "";

            if (state.status !== "all" && order.status !== state.status) continue;
            if (state.shopId !== "all" && String(order.shopId) !== String(state.shopId)) continue;
            if (state.dateFrom && orderDate < state.dateFrom) continue;
            if (state.dateTo && orderDate > state.dateTo) continue;

            if (state.searchText) {
                if (searchTarget.indexOf(state.searchText.toLowerCase()) === -1) continue;
            }

            results.push(order);
        }

        return results;
    }

    function renderOrdersTable() {
        var orders = getFilteredOrders();
        var tbody = document.getElementById("ordersTableBody");
        var emptyState = document.getElementById("emptyState");

        if (orders.length === 0) {
            tbody.innerHTML = "";
            emptyState.style.display = "block";
            return;
        }

        emptyState.style.display = "none";

        var html = "";
        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            var customerName = order.customer ? order.customer.name : "Unknown";
            var shopName = order.shop ? (order.shop.shopName || "Unknown") : "Unknown";
            var itemCount = order.items ? order.items.length : 0;

            html += "<tr>"
                + '<td><span class="order-id">#' + order.id + "</span></td>"
                + "<td>" + escapeHtml(customerName) + "</td>"
                + "<td>" + escapeHtml(shopName) + "</td>"
                + "<td>" + itemCount + "</td>"
                + "<td>" + formatCurrency(order.total) + "</td>"
                + '<td><span class="badge badge-' + order.status + '">' + escapeHtml(order.status) + "</span></td>"
                + "<td>" + formatDate(order.createdAt) + "</td>"
                + '<td><div class="icon-btn-group"><button class="icon-btn icon-btn-view js-view-order" title="View" data-order-id="' + order.id + '"><i class="fa-solid fa-eye"></i></button></div></td>'
                + "</tr>";
        }

        tbody.innerHTML = html;
    }

    function buildOrderItemsHtml(order) {
        if (!order.items || order.items.length === 0) {
            return "<p>No items found for this order.</p>";
        }

        var html = '<table class="orders-table"><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead><tbody>';

        for (var i = 0; i < order.items.length; i++) {
            var item = order.items[i];
            var name = item.name || "Unknown product";
            var qty = Number(item.qty || 0);
            var price = Number(item.price || 0);
            var subtotal = qty * price;

            html += "<tr>"
                + "<td>" + escapeHtml(name) + "</td>"
                + "<td>" + qty + "</td>"
                + "<td>" + formatCurrency(price) + "</td>"
                + "<td>" + formatCurrency(subtotal) + "</td>"
                + "</tr>";
        }

        html += "</tbody></table>";
        return html;
    }

    var ORDER_STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

    function buildStatusChangeHtml(currentStatus) {
        if (!Auth.hasPermission("orders.manage")) return "";
        var options = ORDER_STATUSES.map(function(s) {
            return '<option value="' + s + '"' + (s === currentStatus ? " selected" : "") + ">" + s + "</option>";
        }).join("");
        return '<div style="margin-top:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
            + '<label style="font-size:13px;font-weight:600;">Change Status:</label>'
            + '<select id="orderStatusSelect" style="padding:4px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">' + options + "</select>"
            + '<button id="btnUpdateOrderStatus" class="btn-submit-modal" style="padding:4px 14px;font-size:13px;">Update</button>'
            + '<span id="orderStatusMsg" style="font-size:12px;color:#10b981;display:none;">Status updated.</span>'
            + "</div>";
    }

    function openOrderModal(orderId) {
        var order = state.orders.find(function (o) { return o.id === Number(orderId); });
        if (!order) return;

        state.selectedOrderId = order.id;

        var customerName = order.customer ? order.customer.name : "Unknown";
        var customerEmail = order.customer ? order.customer.email : "-";
        var shopName = order.shop ? (order.shop.shopName || "Unknown") : "Unknown";

        document.getElementById("orderModalTitle").textContent = "Order #" + order.id;

        var bodyHtml = ""
            + '<div class="review-details">'
            + '<div><strong>Customer:</strong> ' + escapeHtml(customerName) + "</div>"
            + '<div><strong>Email:</strong> ' + escapeHtml(customerEmail) + "</div>"
            + '<div><strong>Shop:</strong> ' + escapeHtml(shopName) + "</div>"
            + '<div><strong>Created:</strong> ' + escapeHtml(formatDate(order.createdAt)) + "</div>"
            + '<div><strong>Total:</strong> ' + escapeHtml(formatCurrency(order.total)) + "</div>"
            + '<div><strong>Status:</strong> <span class="badge badge-' + order.status + '">' + escapeHtml(order.status) + "</span></div>"
            + "</div>"
            + buildStatusChangeHtml(order.status)
            + '<div style="margin-top:16px;"><h4 style="margin-bottom:8px;">Items</h4>' + buildOrderItemsHtml(order) + "</div>";

        document.getElementById("orderModalBody").innerHTML = bodyHtml;

        var btnUpdate = document.getElementById("btnUpdateOrderStatus");
        if (btnUpdate) {
            btnUpdate.addEventListener("click", async function() {
                var newStatus = document.getElementById("orderStatusSelect").value;
                var result = await Api.orders.adminSetStatus(state.selectedOrderId, newStatus);
                if (!result.success) {
                    alert(result.error);
                    document.getElementById("orderStatusSelect").value = order.status;
                    return;
                }
                if (result.success) {
                    for (var n = 0; n < state.orders.length; n++) {
                        if (state.orders[n].id === result.order.id) state.orders[n] = result.order;
                    }
                    order = result.order;
                    var badge = document.querySelector("#orderModalBody .badge");
                    if (badge) {
                        badge.className = "badge badge-" + newStatus;
                        badge.textContent = newStatus;
                    }
                    var msg = document.getElementById("orderStatusMsg");
                    if (msg) { msg.style.display = ""; setTimeout(function() { msg.style.display = "none"; }, 2000); }
                    renderStats();
                    renderOrdersTable();
                }
            });
        }

        document.getElementById("orderModal").classList.add("show");
    }

    function closeOrderModal() {
        document.getElementById("orderModal").classList.remove("show");
        state.selectedOrderId = null;
    }

    function resetFilters() {
        state.status = "all";
        state.shopId = "all";
        state.dateFrom = "";
        state.dateTo = "";
        state.searchText = "";

        document.getElementById("shopFilter").value = "all";
        document.getElementById("dateFromFilter").value = "";
        document.getElementById("dateToFilter").value = "";
        document.getElementById("orderSearchInput").value = "";

        var statusButtons = document.querySelectorAll(".filter-tab[data-status]");
        for (var i = 0; i < statusButtons.length; i++) {
            statusButtons[i].classList.toggle("active", statusButtons[i].getAttribute("data-status") === "all");
        }

        renderOrdersTable();
    }

    function bindEvents() {
        var statusButtons = document.querySelectorAll(".filter-tab[data-status]");
        for (var i = 0; i < statusButtons.length; i++) {
            statusButtons[i].addEventListener("click", function () {
                state.status = this.getAttribute("data-status");

                for (var j = 0; j < statusButtons.length; j++) {
                    statusButtons[j].classList.remove("active");
                }
                this.classList.add("active");

                renderOrdersTable();
            });
        }

        document.getElementById("shopFilter").addEventListener("change", function () {
            state.shopId = this.value;
            renderOrdersTable();
        });

        document.getElementById("dateFromFilter").addEventListener("change", function () {
            state.dateFrom = this.value;
            renderOrdersTable();
        });

        document.getElementById("dateToFilter").addEventListener("change", function () {
            state.dateTo = this.value;
            renderOrdersTable();
        });

        document.getElementById("orderSearchInput").addEventListener("input", function () {
            state.searchText = this.value.trim();
            renderOrdersTable();
        });

        document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);

        document.getElementById("ordersTableBody").addEventListener("click", function (event) {
            var target = event.target;
            if (!target.classList.contains("js-view-order")) return;

            var orderId = Number(target.getAttribute("data-order-id"));
            openOrderModal(orderId);
        });

        document.getElementById("orderModal").addEventListener("click", function (event) {
            if (event.target.id === "orderModal") {
                closeOrderModal();
            }
        });
    }

    window.closeOrderModal = closeOrderModal;

    async function load() {
        try {
            state.orders = await Api.orders.adminList();
        } catch (e) {
            alert("Could not load orders: " + e.message);
        }
        renderStats();
        renderShopFilter();
        renderOrdersTable();
    }

    renderTopbarUser();
    bindEvents();
    load();

})();
