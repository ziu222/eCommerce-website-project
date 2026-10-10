// ============================================================
// admin-shop-detail.js — Shop Detail Page Logic
// ============================================================

(function () {

    var shopId = null;

    function getQueryParam(name) {
        var params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    function formatCurrency(amount) {
        return "$" + amount.toLocaleString("en-US");
    }

    function formatDate(dateStr) {
        var d = new Date(dateStr);
        var day = String(d.getDate()).padStart(2, "0");
        var month = String(d.getMonth() + 1).padStart(2, "0");
        var year = d.getFullYear();
        return day + "/" + month + "/" + year;
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }


    // ── Topbar ─────────────────────────────────────────────

    function renderTopbar() {
        var user = Auth.getCurrentUser();
        if (!user) return;
        document.getElementById("topbarUserName").textContent = user.name;
        document.getElementById("topbarAvatar").textContent = user.name.charAt(0).toUpperCase();
    }


    // ── Load Shop ──────────────────────────────────────────

    async function loadShop() {
        shopId = Number(getQueryParam("id"));
        var shop = null;
        try {
            shop = await Api.adminShops.get(shopId);
        } catch (e) {
            shop = null;
        }

        if (!shop) {
            document.getElementById("pageTitle").textContent = "Shop Not Found";
            return;
        }

        var products = shop.products;
        var revenue = shop.revenue;
        var orders = { length: shop.orderCount };

        document.getElementById("pageTitle").textContent = shop.shopName;
        document.getElementById("shopInitial").textContent = shop.shopName.charAt(0).toUpperCase();
        document.getElementById("shopName").textContent = shop.shopName;
        document.getElementById("shopOwner").innerHTML = 'Owned by ' + escapeHtml(shop.name) + ' &middot; <span class="badge badge-' + shop.shopStatus + '">' + shop.shopStatus + '</span>';

        renderHeaderActions(shop);
        renderStats(products, revenue, orders);
        renderShopInfo(shop);
        renderContactInfo(shop);
        renderProducts(products);
    }


    // ── Header actions ─────────────────────────────────────

    function renderHeaderActions(shop) {
        var el = document.getElementById("headerActions");
        var html = '';

        if (shop.shopStatus === "pending") {
            html += '<button class="btn-primary" onclick="handleAction(\'active\')"><i class="fa-solid fa-check"></i> Approve</button>';
        }
        if (shop.shopStatus === "active") {
            html += '<button class="btn-danger" onclick="handleAction(\'suspended\')"><i class="fa-solid fa-ban"></i> Suspend</button>';
        }
        if (shop.shopStatus === "suspended") {
            html += '<button class="btn-primary" onclick="handleAction(\'active\')"><i class="fa-solid fa-rotate-left"></i> Reactivate</button>';
        }

        el.innerHTML = html;
    }

    window.handleAction = async function (newStatus) {
        try {
            await Api.adminShops.setStatus(shopId, newStatus);
        } catch (e) {
            alert(e.message);
        }
        loadShop();
    };


    // ── Stats ──────────────────────────────────────────────

    function renderStats(products, revenue, orders) {
        document.getElementById("statProducts").textContent = products.length;
        document.getElementById("statRevenue").textContent = formatCurrency(revenue);
        document.getElementById("statOrders").textContent = orders.length;
    }


    // ── Shop info card ─────────────────────────────────────

    function renderShopInfo(shop) {
        var el = document.getElementById("shopInfo");
        el.innerHTML =
            '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Shop Name</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopName) + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Status</span>'
            + '<span class="badge badge-' + shop.shopStatus + '">' + shop.shopStatus + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Description</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopDescription || "N/A") + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Joined</span>'
            + '<span class="modal-detail-value">' + formatDate(shop.createdAt) + '</span>'
            + '</div>';
    }


    // ── Contact info card ──────────────────────────────────

    function renderContactInfo(shop) {
        var el = document.getElementById("contactInfo");
        el.innerHTML =
            '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Owner</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.name) + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Email</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.email) + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Phone</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopPhone || "N/A") + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Address</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopAddress || "N/A") + '</span>'
            + '</div>';
    }


    // ── Products table ─────────────────────────────────────

    function renderProducts(products) {
        var tbody = document.getElementById("productsTableBody");
        var empty = document.getElementById("emptyProducts");
        var countEl = document.getElementById("productCount");
        countEl.textContent = products.length + " item" + (products.length !== 1 ? "s" : "");

        if (products.length === 0) {
            tbody.innerHTML = "";
            empty.style.display = "block";
            return;
        }

        empty.style.display = "none";
        var html = "";

        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            html += '<tr>'
                + '<td>' + p.id + '</td>'
                + '<td>' + escapeHtml(p.name) + '</td>'
                + '<td><span class="badge badge-confirmed">' + escapeHtml(p.category) + '</span></td>'
                + '<td>' + formatCurrency(p.price) + '</td>'
                + '<td>' + p.stock + '</td>'
                + '</tr>';
        }

        tbody.innerHTML = html;
    }


    // ── Init ───────────────────────────────────────────────

    renderTopbar();
    loadShop();

})();
