// ============================================================
// admin-shops.js — Shops Management Page Logic
// ============================================================

Auth.requirePermission("shops.view");

(function () {

    var currentFilter = "all";
    var currentSearch = "";
    var allShops = [];

    function findShop(id) {
        return allShops.filter(function (s) { return s.id === id; })[0] || null;
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


    // ── Topbar user ────────────────────────────────────────

    function renderTopbar() {
        var user = Auth.getCurrentUser();
        if (!user) return;
        document.getElementById("topbarUserName").textContent = user.name;
        document.getElementById("topbarAvatar").textContent = user.name.charAt(0).toUpperCase();
    }


    // ── Stats cards ────────────────────────────────────────

    function renderStats() {
        var shops = allShops;
        var active = 0, pending = 0;

        for (var i = 0; i < shops.length; i++) {
            if (shops[i].shopStatus === "active") active++;
            else if (shops[i].shopStatus === "pending") pending++;
        }

        document.getElementById("statTotal").textContent = shops.length;
        document.getElementById("statActive").textContent = active;
        document.getElementById("statPending").textContent = pending;
    }


    // ── Table rendering ────────────────────────────────────

    function getFilteredShops() {
        var shops = allShops;
        var result = [];

        for (var i = 0; i < shops.length; i++) {
            var shop = shops[i];

            if (currentFilter !== "all" && shop.shopStatus !== currentFilter) continue;

            if (currentSearch) {
                var q = currentSearch.toLowerCase();
                var nameMatch = shop.shopName.toLowerCase().indexOf(q) !== -1;
                var ownerMatch = shop.name.toLowerCase().indexOf(q) !== -1;
                if (!nameMatch && !ownerMatch) continue;
            }

            result.push(shop);
        }

        return result;
    }

    function renderTable() {
        var shops = getFilteredShops();
        var tbody = document.getElementById("shopsTableBody");
        var empty = document.getElementById("emptyState");

        if (shops.length === 0) {
            tbody.innerHTML = "";
            empty.style.display = "block";
            return;
        }

        empty.style.display = "none";
        var html = "";

        for (var i = 0; i < shops.length; i++) {
            var s = shops[i];
            html += '<tr>'
                + '<td>' + s.id + '</td>'
                + '<td><a href="shop-detail.html?id=' + s.id + '" class="shop-name-link">' + escapeHtml(s.shopName) + '</a></td>'
                + '<td>' + escapeHtml(s.name) + '</td>'
                + '<td><span class="badge badge-' + s.shopStatus + '">' + s.shopStatus + '</span></td>'
                + '<td>' + s.productCount + '</td>'
                + '<td>' + formatCurrency(s.revenue) + '</td>'
                + '<td>' + getActionButtons(s) + '</td>'
                + '</tr>';
        }

        tbody.innerHTML = html;
        bindTableEvents();
    }

    function getActionButtons(shop) {
        var btns = '<div class="icon-btn-group">';

        if (shop.shopStatus === "pending") {
            btns += '<button class="icon-btn icon-btn-approve" data-id="' + shop.id + '" title="Approve">'
                + '<i class="fa-solid fa-circle-check"></i></button>';
        }
        if (shop.shopStatus === "active") {
            btns += '<button class="icon-btn icon-btn-suspend" data-id="' + shop.id + '" title="Suspend">'
                + '<i class="fa-solid fa-ban"></i></button>';
        }
        if (shop.shopStatus === "suspended") {
            btns += '<button class="icon-btn icon-btn-restore" data-id="' + shop.id + '" title="Reactivate">'
                + '<i class="fa-solid fa-rotate-left"></i></button>';
        }

        btns += '<button class="icon-btn icon-btn-edit" data-id="' + shop.id + '" title="Edit">'
            + '<i class="fa-solid fa-pen"></i></button>';

        btns += '<button class="icon-btn icon-btn-view" data-id="' + shop.id + '" title="View Details">'
            + '<i class="fa-solid fa-eye"></i></button>';

        btns += '</div>';
        return btns;
    }


    // ── Table event binding ────────────────────────────────

    function bindTableEvents() {
        var approveButtons = document.querySelectorAll(".icon-btn-approve");
        for (var i = 0; i < approveButtons.length; i++) {
            approveButtons[i].addEventListener("click", function () {
                changeStatus(Number(this.getAttribute("data-id")), "active");
            });
        }

        var suspendButtons = document.querySelectorAll(".icon-btn-suspend");
        for (var i = 0; i < suspendButtons.length; i++) {
            suspendButtons[i].addEventListener("click", function () {
                changeStatus(Number(this.getAttribute("data-id")), "suspended");
            });
        }

        var reactivateButtons = document.querySelectorAll(".icon-btn-restore");
        for (var i = 0; i < reactivateButtons.length; i++) {
            reactivateButtons[i].addEventListener("click", function () {
                changeStatus(Number(this.getAttribute("data-id")), "active");
            });
        }

        var editButtons = document.querySelectorAll(".icon-btn-edit");
        for (var i = 0; i < editButtons.length; i++) {
            editButtons[i].addEventListener("click", function () {
                openFormModal(Number(this.getAttribute("data-id")));
            });
        }

        var viewButtons = document.querySelectorAll(".icon-btn-view");
        for (var i = 0; i < viewButtons.length; i++) {
            viewButtons[i].addEventListener("click", function () {
                openDetailModal(Number(this.getAttribute("data-id")));
            });
        }
    }


    // ── Filter tabs ────────────────────────────────────────

    var filterTabs = document.querySelectorAll(".filter-tab");
    for (var i = 0; i < filterTabs.length; i++) {
        filterTabs[i].addEventListener("click", function () {
            for (var j = 0; j < filterTabs.length; j++) {
                filterTabs[j].classList.remove("active");
            }
            this.classList.add("active");
            currentFilter = this.getAttribute("data-filter");
            renderTable();
        });
    }


    // ── Search ─────────────────────────────────────────────

    var searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", function () {
        currentSearch = this.value.trim();
        renderTable();
    });


    // ── Detail Modal (quick view) ──────────────────────────

    function openDetailModal(shopId) {
        var shop = findShop(shopId);
        if (!shop) return;

        var revenue = shop.revenue;

        document.getElementById("modalTitle").textContent = "Shop Details";

        var body = document.getElementById("modalBody");
        body.innerHTML =
            '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Shop Name</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopName) + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
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
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Description</span>'
            + '<span class="modal-detail-value">' + escapeHtml(shop.shopDescription || "N/A") + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Status</span>'
            + '<span class="badge badge-' + shop.shopStatus + '">' + shop.shopStatus + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Products</span>'
            + '<span class="modal-detail-value">' + shop.productCount + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Revenue</span>'
            + '<span class="modal-detail-value">' + formatCurrency(revenue) + '</span>'
            + '</div>'
            + '<div class="modal-detail-row">'
            + '<span class="modal-detail-label">Joined</span>'
            + '<span class="modal-detail-value">' + formatDate(shop.createdAt) + '</span>'
            + '</div>';

        var footer = document.getElementById("modalFooter");
        footer.innerHTML = '<a href="shop-detail.html?id=' + shop.id + '" class="modal-btn approve">View Full Details</a>'
            + '<button class="modal-btn close" onclick="closeModal()">Close</button>';

        document.getElementById("shopModal").classList.add("show");
    }

    window.closeModal = function () {
        document.getElementById("shopModal").classList.remove("show");
    };

    document.getElementById("shopModal").addEventListener("click", function (e) {
        if (e.target === this) closeModal();
    });


    // ── Form Modal (add / edit) ────────────────────────────

    document.getElementById("btnAddShop").addEventListener("click", function () {
        openFormModal(null);
    });

    function openFormModal(shopId) {
        var form = document.getElementById("shopForm");
        form.reset();
        document.getElementById("formError").textContent = "";
        document.getElementById("formShopId").value = "";

        if (shopId) {
            var shop = findShop(shopId);
            if (!shop) return;
            document.getElementById("formModalTitle").textContent = "Edit Shop";
            document.getElementById("formSubmitBtn").textContent = "Save Changes";
            document.getElementById("formShopId").value = shop.id;
            document.getElementById("formShopName").value = shop.shopName || "";
            document.getElementById("formOwnerName").value = shop.name || "";
            document.getElementById("formEmail").value = shop.email || "";
            document.getElementById("formPhone").value = shop.shopPhone || "";
            document.getElementById("formAddress").value = shop.shopAddress || "";
            document.getElementById("formDescription").value = shop.shopDescription || "";
            document.getElementById("formOwnerName").disabled = true;
            document.getElementById("formEmail").disabled = true;
        } else {
            document.getElementById("formModalTitle").textContent = "Add Shop";
            document.getElementById("formSubmitBtn").textContent = "Add Shop";
            document.getElementById("formOwnerName").disabled = false;
            document.getElementById("formEmail").disabled = false;
        }

        document.getElementById("formModal").classList.add("show");
    }

    window.closeFormModal = function () {
        document.getElementById("formModal").classList.remove("show");
    };

    document.getElementById("formModal").addEventListener("click", function (e) {
        if (e.target === this) closeFormModal();
    });

    document.getElementById("formSubmitBtn").addEventListener("click", async function () {
        var shopId = document.getElementById("formShopId").value;
        var shopName = document.getElementById("formShopName").value.trim();
        var ownerName = document.getElementById("formOwnerName").value.trim();
        var email = document.getElementById("formEmail").value.trim();
        var phone = document.getElementById("formPhone").value.trim();
        var address = document.getElementById("formAddress").value.trim();
        var description = document.getElementById("formDescription").value.trim();
        var errorEl = document.getElementById("formError");

        if (!shopName || !ownerName || !email) {
            errorEl.textContent = "Shop name, owner name, and email are required.";
            return;
        }

        try {
            if (shopId) {
                await Api.adminShops.update(Number(shopId), {
                    shopName: shopName,
                    shopPhone: phone,
                    shopAddress: address,
                    shopDescription: description
                });
            } else {
                var created = await Api.adminShops.create({
                    name: ownerName,
                    shopName: shopName,
                    email: email,
                    shopPhone: phone,
                    shopAddress: address,
                    shopDescription: description
                });
                // The owner needs this to sign in; it is not stored anywhere and cannot be shown again.
                alert("Shop created (pending approval).\n\nUsername: " + created.shop.username +
                      "\nTemporary password: " + created.temporaryPassword +
                      "\n\nShare it with the owner now - it will not be shown again.");
            }
        } catch (e) {
            errorEl.textContent = e.message;
            return;
        }

        closeFormModal();
        await load();
    });




    function refresh() {
        renderStats();
        renderTable();
    }

    async function load() {
        try {
            allShops = await Api.adminShops.list();
        } catch (e) {
            alert("Could not load shops: " + e.message);
        }
        refresh();
    }

    async function changeStatus(id, shopStatus) {
        try {
            await Api.adminShops.setStatus(id, shopStatus);
        } catch (e) {
            alert(e.message);
        }
        await load();
    }


    // Khoi tao

    renderTopbar();
    load();

})();
