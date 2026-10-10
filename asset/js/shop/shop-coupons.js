var currentShopId  = null;
var currentFilter  = "all";
var currentSearch  = "";
var editingId      = null;

function getCurrentUser() {
    var raw = localStorage.getItem("ecshop_currentUser");
    return raw ? JSON.parse(raw) : null;
}

function renderStats(coupons) {
    var today   = new Date().toISOString().split("T")[0];
    var active  = coupons.filter(function (c) { return c.isActive && (!c.expiresAt || c.expiresAt >= today); }).length;
    var expired = coupons.filter(function (c) { return c.expiresAt && c.expiresAt < today; }).length;
    var used    = coupons.reduce(function (s, c) { return s + (c.usedCount || 0); }, 0);

    document.getElementById("statTotal").textContent   = coupons.length;
    document.getElementById("statActive").textContent  = active;
    document.getElementById("statUsed").textContent    = used;
    document.getElementById("statExpired").textContent = expired;
}

function renderTable() {
    var all   = Store.getCouponsByShop(currentShopId);
    var today = new Date().toISOString().split("T")[0];
    var query = currentSearch.toLowerCase();

    renderStats(all);

    var coupons = all.filter(function (c) {
        if (currentFilter === "active")   return c.isActive && (!c.expiresAt || c.expiresAt >= today);
        if (currentFilter === "inactive") return !c.isActive || (c.expiresAt && c.expiresAt < today);
        return true;
    });

    if (query) {
        coupons = coupons.filter(function (c) { return c.code.toLowerCase().includes(query); });
    }

    var tbody = document.getElementById("couponTableBody");
    var empty = document.getElementById("emptyState");

    if (coupons.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "";
        return;
    }
    empty.style.display = "none";

    tbody.innerHTML = coupons.map(function (c) {
        var expired   = c.expiresAt && c.expiresAt < today;
        var statusCls = (c.isActive && !expired) ? "status-badge delivered" : "status-badge cancelled";
        var statusTxt = (c.isActive && !expired) ? "Active" : (expired ? "Expired" : "Inactive");
        var valueTxt  = c.type === "percent" ? c.value + "%" : "$" + c.value;
        var usageStr  = c.usedCount + " / " + (c.usageLimit > 0 ? c.usageLimit : "∞");

        return '<tr>' +
            '<td><strong>' + c.code + '</strong></td>' +
            '<td>' + (c.type === "percent" ? "Percent" : "Fixed") + '</td>' +
            '<td>' + valueTxt + '</td>' +
            '<td>' + (c.minOrder > 0 ? "$" + c.minOrder : "—") + '</td>' +
            '<td>' + usageStr + '</td>' +
            '<td>' + (c.expiresAt || "Never") + '</td>' +
            '<td><span class="' + statusCls + '">' + statusTxt + '</span></td>' +
            '<td>' +
                '<button class="icon-btn icon-btn-edit" onclick="openModal(' + c.id + ')" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="icon-btn icon-btn-suspend" onclick="deleteCoupon(' + c.id + ')" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }).join("");
}

function openModal(id) {
    editingId = id || null;
    var titleEl = document.getElementById("modalTitle");

    if (editingId) {
        var c = Store.getCoupons().find(function (x) { return x.id === editingId; });
        if (!c) return;
        titleEl.textContent                               = "Edit Coupon";
        document.getElementById("modalCode").value        = c.code;
        document.getElementById("modalType").value        = c.type;
        document.getElementById("modalValue").value       = c.value;
        document.getElementById("modalMinOrder").value    = c.minOrder || 0;
        document.getElementById("modalUsageLimit").value  = c.usageLimit || 0;
        document.getElementById("modalExpiresAt").value   = c.expiresAt || "";
        document.getElementById("modalActive").checked    = c.isActive;
    } else {
        titleEl.textContent                               = "New Coupon";
        document.getElementById("modalCode").value        = "";
        document.getElementById("modalType").value        = "percent";
        document.getElementById("modalValue").value       = "";
        document.getElementById("modalMinOrder").value    = "0";
        document.getElementById("modalUsageLimit").value  = "0";
        document.getElementById("modalExpiresAt").value   = "";
        document.getElementById("modalActive").checked    = true;
    }
    document.getElementById("couponModal").classList.add("show");
}

function closeModal() {
    document.getElementById("couponModal").classList.remove("show");
    editingId = null;
}

function saveModal() {
    var code  = document.getElementById("modalCode").value.trim().toUpperCase();
    var value = parseFloat(document.getElementById("modalValue").value);

    if (!code || isNaN(value) || value <= 0) {
        alert("Code and a valid value are required.");
        return;
    }

    var data = {
        code:       code,
        type:       document.getElementById("modalType").value,
        value:      value,
        minOrder:   parseFloat(document.getElementById("modalMinOrder").value) || 0,
        usageLimit: parseInt(document.getElementById("modalUsageLimit").value) || 0,
        expiresAt:  document.getElementById("modalExpiresAt").value || "",
        isActive:   document.getElementById("modalActive").checked,
        shopId:     currentShopId
    };

    if (editingId) {
        Store.updateCoupon(editingId, data);
    } else {
        Store.addCoupon(data);
    }

    closeModal();
    renderTable();
}

function deleteCoupon(id) {
    var c = Store.getCoupons().find(function (x) { return x.id === id; });
    if (!c) return;
    if (!confirm('Delete coupon "' + c.code + '"?')) return;
    Store.deleteCoupon(id);
    renderTable();
}

document.addEventListener("DOMContentLoaded", function () {
    var user = getCurrentUser();
    if (!user || user.role !== "shop") {
        window.location.href = "../admin/admin-login.html";
        return;
    }

    currentShopId = user.id;

    var avatar = document.getElementById("topbarAvatar");
    var name   = document.getElementById("topbarUserName");
    if (avatar) avatar.textContent = (user.shopName || user.name || "S").charAt(0).toUpperCase();
    if (name)   name.textContent   = user.shopName || user.name || "Shop";

    renderTable();

    document.getElementById("btnNewCoupon").addEventListener("click", function () { openModal(null); });
    document.getElementById("btnSaveCoupon").addEventListener("click", saveModal);

    document.getElementById("logoutBtn").addEventListener("click", async function () {
        await Api.auth.logout();
        window.location.href = "../admin/admin-login.html";
    });

    document.querySelectorAll(".filter-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".filter-tab").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderTable();
        });
    });

    document.getElementById("couponSearch").addEventListener("input", function () {
        currentSearch = this.value;
        renderTable();
    });

    document.getElementById("modalCode").addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });
});
