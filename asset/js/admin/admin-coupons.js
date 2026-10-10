var currentFilter  = "all";
var currentSearch  = "";
var editingId      = null;
var couponCache    = [];

async function loadCoupons() {
    try {
        couponCache = await Api.coupons.admin.list();
    } catch (e) {
        alert(e.message);
    }
    renderStats();
    renderTable();
}

function renderStats() {
    var coupons = couponCache;
    var today   = new Date().toISOString().split("T")[0];

    var active     = coupons.filter(function (c) { return c.isActive && (!c.expiresAt || c.expiresAt >= today); }).length;
    var shopIssued = coupons.filter(function (c) { return c.shopId !== null && c.shopId !== undefined; }).length;
    var global     = coupons.length - shopIssued;

    document.getElementById("statTotal").textContent     = coupons.length;
    document.getElementById("statActive").textContent    = active;
    document.getElementById("statShopIssued").textContent = shopIssued;
    document.getElementById("statGlobal").textContent   = global;
}

function getShopName(coupon) {
    if (!coupon.shopId) return "Global";
    return (coupon.shop && coupon.shop.shopName) || "Shop #" + coupon.shopId;
}

function renderTable() {
    var coupons = couponCache;
    var today   = new Date().toISOString().split("T")[0];
    var query   = currentSearch.toLowerCase();

    coupons = coupons.filter(function (c) {
        if (currentFilter === "active")   return c.isActive && (!c.expiresAt || c.expiresAt >= today);
        if (currentFilter === "inactive") return !c.isActive || (c.expiresAt && c.expiresAt < today);
        if (currentFilter === "global")   return c.shopId === null || c.shopId === undefined;
        if (currentFilter === "shop")     return c.shopId !== null && c.shopId !== undefined;
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
        var scopeTxt  = Api.escapeHtml(getShopName(c));
        var usageStr  = c.usedCount + " / " + (c.usageLimit > 0 ? c.usageLimit : "∞");
        var valueTxt  = c.type === "percent" ? c.value + "%" : "$" + c.value;

        return '<tr>' +
            '<td><strong>' + c.code + '</strong></td>' +
            '<td>' + scopeTxt + '</td>' +
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

var scopeShops = [];

async function loadScopeShops() {
    try {
        scopeShops = await Api.adminShops.list(); // needs shops.view; others can still create global coupons
    } catch (e) {
        scopeShops = [];
    }
}

function populateScopeDropdown() {
    var select = document.getElementById("modalScope");
    select.innerHTML = '<option value="">Global (all shops)</option>';
    scopeShops.forEach(function (s) {
        var opt = document.createElement("option");
        opt.value       = s.id;
        opt.textContent = s.shopName || s.name;
        select.appendChild(opt);
    });
}

function openModal(id) {
    editingId = id || null;
    populateScopeDropdown();

    var titleEl = document.getElementById("modalTitle");

    if (editingId) {
        var c = couponCache.find(function (x) { return x.id === editingId; });
        if (!c) return;
        titleEl.textContent                                = "Edit Coupon";
        document.getElementById("modalCode").value        = c.code;
        document.getElementById("modalType").value        = c.type;
        document.getElementById("modalValue").value       = c.value;
        document.getElementById("modalMinOrder").value    = c.minOrder || 0;
        document.getElementById("modalUsageLimit").value  = c.usageLimit || 0;
        document.getElementById("modalExpiresAt").value   = c.expiresAt || "";
        document.getElementById("modalScope").value       = c.shopId || "";
        document.getElementById("modalActive").checked    = c.isActive;
    } else {
        titleEl.textContent                                = "New Coupon";
        document.getElementById("modalCode").value        = "";
        document.getElementById("modalType").value        = "percent";
        document.getElementById("modalValue").value       = "";
        document.getElementById("modalMinOrder").value    = "0";
        document.getElementById("modalUsageLimit").value  = "0";
        document.getElementById("modalExpiresAt").value   = "";
        document.getElementById("modalScope").value       = "";
        document.getElementById("modalActive").checked    = true;
    }

    document.getElementById("couponModal").classList.add("show");
}

function closeModal() {
    document.getElementById("couponModal").classList.remove("show");
    editingId = null;
}

async function saveModal() {
    var code  = document.getElementById("modalCode").value.trim().toUpperCase();
    var value = parseFloat(document.getElementById("modalValue").value);

    if (!code || isNaN(value) || value <= 0) {
        alert("Code and a valid value are required.");
        return;
    }

    var scopeVal = document.getElementById("modalScope").value;
    var data = {
        code:         code,
        type:         document.getElementById("modalType").value,
        value:        value,
        minOrder:     parseFloat(document.getElementById("modalMinOrder").value) || 0,
        usageLimit:   parseInt(document.getElementById("modalUsageLimit").value) || 0,
        expiresAt:    document.getElementById("modalExpiresAt").value || "",
        shopId:       scopeVal ? parseInt(scopeVal) : null,
        isActive:     document.getElementById("modalActive").checked
    };

    try {
        if (editingId) {
            await Api.coupons.admin.update(editingId, data);
        } else {
            await Api.coupons.admin.create(data);
        }
    } catch (e) {
        alert(e.message);
        return;
    }

    closeModal();
    await loadCoupons();
}

async function deleteCoupon(id) {
    var c = couponCache.find(function (x) { return x.id === id; });
    if (!c) return;
    if (!confirm('Delete coupon "' + c.code + '"?')) return;
    try {
        await Api.coupons.admin.remove(id);
    } catch (e) {
        alert(e.message);
        return;
    }
    await loadCoupons();
}

document.addEventListener("DOMContentLoaded", function () {
    loadCoupons();
    loadScopeShops();

    document.getElementById("btnNewCoupon").addEventListener("click", function () { openModal(null); });
    document.getElementById("btnSaveCoupon").addEventListener("click", saveModal);

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

    // force uppercase while typing code
    document.getElementById("modalCode").addEventListener("input", function () {
        this.value = this.value.toUpperCase();
    });
});
