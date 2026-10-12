// shop-products.js — a shop manages its own products. Every save is checked again by the rules and the AI;
// the result arrives over the live stream and the table updates itself.

var productCache  = [];
var currentFilter = "all";
var currentSearch = "";
var editingId     = null;
var uploading     = false;

var DEFAULT_IMAGE = "../asset/img/placeholder/audio.svg";
var STATUS_LABEL  = { approved: "Live", pending: "Checking…", limited: "Shown lower", review: "Waiting for an admin", rejected: "Refused", suspended: "Suspended" };
var CHECKING      = ["pending", "review"];
var ATTENTION     = ["limited", "rejected", "suspended"];

function money(n) {
    return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function loadProducts() {
    try {
        productCache = await Api.shopProducts.list();
    } catch (e) {
        alert("Could not load your products: " + e.message);
    }
    renderTable();
}

function renderStats() {
    var count = function (list) { return productCache.filter(function (p) { return list.indexOf(p.adminStatus) !== -1; }).length; };
    document.getElementById("statTotal").textContent     = productCache.length;
    document.getElementById("statApproved").textContent  = count(["approved"]);
    document.getElementById("statPending").textContent   = count(CHECKING);
    document.getElementById("statAttention").textContent = count(ATTENTION);
}

function matchesFilter(p) {
    if (currentFilter === "attention") return ATTENTION.indexOf(p.adminStatus) !== -1;
    if (currentFilter === "pending") return CHECKING.indexOf(p.adminStatus) !== -1;
    return currentFilter === "all" || p.adminStatus === currentFilter;
}

function renderTable() {
    renderStats();
    var query = currentSearch.toLowerCase();
    var rows = productCache.filter(function (p) {
        return matchesFilter(p) && (!query || p.name.toLowerCase().includes(query));
    });

    var tbody = document.getElementById("productTableBody");
    var empty = document.getElementById("emptyState");
    if (!rows.length) {
        tbody.innerHTML = "";
        empty.style.display = "";
        return;
    }
    empty.style.display = "none";

    tbody.innerHTML = rows.map(function (p) {
        var note = whyHtml(p);
        return '<tr>' +
            '<td><div style="display:flex;gap:10px;align-items:center;">' +
                '<img src="' + Api.escapeHtml(p.image) + '" alt="" onerror="this.onerror=null;this.src=\'../asset/img/404.png\'" style="width:44px;height:44px;object-fit:cover;border-radius:8px;background:#f1f3f5;">' +
                '<strong>' + Api.escapeHtml(p.name) + '</strong></div></td>' +
            '<td>' + Api.escapeHtml(p.category) + '</td>' +
            '<td>' + money(p.price) + (p.oldPrice ? ' <s style="color:#6b7280;">' + money(p.oldPrice) + '</s>' : '') + '</td>' +
            '<td>' + p.stock + '</td>' +
            '<td class="status-cell"><span class="badge badge-ps-' + p.adminStatus + (p.adminStatus === "pending" ? " is-checking" : "") + '">' + (STATUS_LABEL[p.adminStatus] || p.adminStatus) + '</span>' + note + '</td>' +
            '<td>' +
                '<button class="icon-btn icon-btn-edit" onclick="openModal(' + p.id + ')" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="icon-btn icon-btn-suspend" onclick="deleteProduct(' + p.id + ')" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }).join("");
}

// Why a product is not simply live: the checks' reasons or the admin's note, with what to do next.
function whyHtml(p) {
    var esc = Api.escapeHtml;
    if (p.adminStatus === "approved" || p.adminStatus === "pending") return "";
    var lines = (p.moderationReasons || []).map(function (r) { return "<li>" + esc(r.message) + "</li>"; });
    if (p.adminNote && (p.adminStatus === "suspended" || p.adminStatus === "rejected" || p.adminStatus === "limited")) {
        lines.push("<li><strong>Admin:</strong> " + esc(p.adminNote) + "</li>");
    }
    var next = {
        limited: "Customers can still buy it. Fix the points below and save to show it normally.",
        review: "An admin will look at it soon.",
        rejected: "Edit the listing to try again.",
        suspended: "Edit the listing; an admin will review it again."
    }[p.adminStatus] || "";
    return '<div class="why">' + (lines.length ? "<ul>" + lines.join("") + "</ul>" : "") + (next ? "<p>" + next + "</p>" : "") + "</div>";
}

function setPreview(url) {
    document.getElementById("imagePreview").src = url || DEFAULT_IMAGE;
}

function showModalError(message) {
    var el = document.getElementById("modalError");
    el.textContent = message || "";
    el.style.display = message ? "" : "none";
}

// ---------- product page content: plain text in the form, structured `details` on the API

var FEATURE_ICONS = [
    [/batter|charg/i, "battery_charging_full"], [/camera|lens|photo|video/i, "camera"],
    [/display|screen/i, "display_settings"], [/sound|audio|speaker|noise|mic/i, "graphic_eq"],
    [/chip|processor|memory|ram/i, "memory"], [/water|dust|resist/i, "water_drop"],
    [/wi-?fi|bluetooth|5g|wireless|connect/i, "wifi"], [/game|gaming/i, "sports_esports"],
    [/secur|privacy|protect/i, "shield"], [/fast|speed|refresh/i, "speed"]
];

function featureIcon(title, old) {
    var same = (old || []).find(function (f) { return f.title === title; });
    if (same) return same.icon;
    for (var i = 0; i < FEATURE_ICONS.length; i++) if (FEATURE_ICONS[i][0].test(title)) return FEATURE_ICONS[i][1];
    return "bolt";
}

function fillDetails(d) {
    d = d || {};
    document.getElementById("modalOverview").value = d.overview || "";
    document.getElementById("modalFeatures").value = (d.features || []).map(function (f) { return f.title + " | " + f.body; }).join("\n");
    document.getElementById("modalSpecs").value = (d.specGroups || []).map(function (g) {
        return "## " + g.group + "\n" + g.items.map(function (it) { return it[0] + ": " + it[1]; }).join("\n");
    }).join("\n\n");
    document.getElementById("modalBox").value = (d.inTheBox || []).join("\n");
}

function lines(id) {
    return document.getElementById(id).value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
}

// throws a message the form shows when a line does not follow the format
function readDetails(old) {
    var d = {};
    var overview = document.getElementById("modalOverview").value.trim();
    if (overview) d.overview = overview;

    var features = lines("modalFeatures").map(function (l) {
        var at = l.indexOf("|");
        if (at < 1) throw "Technology lines need a title, then | and the text.";
        var title = l.slice(0, at).trim();
        return { title: title, body: l.slice(at + 1).trim(), icon: featureIcon(title, old && old.features) };
    });
    if (features.length) d.features = features;

    var groups = [];
    lines("modalSpecs").forEach(function (l) {
        if (l.indexOf("##") === 0) { groups.push({ group: l.replace(/^#+/, "").trim(), items: [] }); return; }
        var at = l.indexOf(":");
        if (at < 1) throw "Specification lines need a label, then : and the value (\"" + l + "\").";
        if (!groups.length) groups.push({ group: "General", items: [] });
        groups[groups.length - 1].items.push([l.slice(0, at).trim(), l.slice(at + 1).trim()]);
    });
    groups = groups.filter(function (g) { return g.items.length; });
    if (groups.length) d.specGroups = groups;

    var box = lines("modalBox");
    if (box.length) d.inTheBox = box;
    return d;
}

function openModal(id) {
    editingId = id || null;
    showModalError("");
    document.getElementById("modalImageFile").value = "";
    document.getElementById("uploadStatus").textContent = "PNG, JPEG or WebP, up to 2 MB";

    var p = editingId ? productCache.find(function (x) { return x.id === editingId; }) : null;
    if (editingId && !p) return;

    document.getElementById("modalTitle").textContent        = p ? "Edit Product" : "New Product";
    document.getElementById("reviewHint").style.display      = p ? "" : "none";
    document.getElementById("modalName").value               = p ? p.name : "";
    document.getElementById("modalCategory").value           = p ? p.category : "smartphone";
    document.getElementById("modalStock").value              = p ? p.stock : 1;
    document.getElementById("modalPrice").value              = p ? p.price : "";
    document.getElementById("modalOldPrice").value           = p && p.oldPrice ? p.oldPrice : "";
    document.getElementById("modalDescription").value        = p ? p.description : "";
    document.getElementById("modalImageUrl").value           = p ? p.image : "";
    setPreview(p ? p.image : "");
    fillDetails(p && p.details);
    document.getElementById("pageContent").open = false;
    document.getElementById("productModal").classList.add("show");
}

function closeModal() {
    document.getElementById("productModal").classList.remove("show");
    editingId = null;
}

async function onImageChosen() {
    var file = this.files[0];
    var status = document.getElementById("uploadStatus");
    if (!file) return;

    uploading = true;
    status.textContent = "Uploading…";
    try {
        var url = await Api.uploads.image(file);
        document.getElementById("modalImageUrl").value = url;
        setPreview(url);
        status.textContent = "Uploaded";
    } catch (e) {
        status.textContent = e.status === 503
            ? "Photo uploads are not set up on this server. Paste an https:// image link instead."
            : e.message;
        this.value = "";
    } finally {
        uploading = false;
    }
}

async function saveModal() {
    if (uploading) { showModalError("Wait for the photo to finish uploading."); return; }

    var data = {
        name:        document.getElementById("modalName").value.trim(),
        category:    document.getElementById("modalCategory").value,
        stock:       parseInt(document.getElementById("modalStock").value, 10),
        price:       parseFloat(document.getElementById("modalPrice").value),
        oldPrice:    parseFloat(document.getElementById("modalOldPrice").value) || 0,
        description: document.getElementById("modalDescription").value.trim(),
        imageUrl:    document.getElementById("modalImageUrl").value.trim() || DEFAULT_IMAGE
    };

    if (!data.name) { showModalError("Name is required."); return; }
    if (!(data.price > 0)) { showModalError("Enter a price above zero."); return; }
    if (!(data.stock >= 0)) { showModalError("Stock cannot be negative."); return; }
    if (data.oldPrice && data.oldPrice <= data.price) { showModalError("The old price must be higher than the price."); return; }
    var current = editingId ? productCache.find(function (x) { return x.id === editingId; }) : null;
    try {
        data.details = readDetails(current && current.details);
    } catch (msg) {
        document.getElementById("pageContent").open = true;
        showModalError(msg);
        return;
    }

    try {
        if (editingId) {
            await Api.shopProducts.update(editingId, data);
        } else {
            await Api.shopProducts.create(data);
        }
    } catch (e) {
        // the listing rules list every problem; show them as a list
        var reasons = e.body && e.body.reasons;
        if (reasons && reasons.length) {
            showModalError("This listing can't be published:\n• " + reasons.map(function (r) { return r.message; }).join("\n• "));
        } else {
            showModalError(e.message);
        }
        return;
    }

    closeModal();
    toast(editingId ? "Saved. Checking the listing…" : "Listing saved. Checking it now…");
    await loadProducts();
}

function toast(text, isError) {
    var box = document.getElementById("liveToasts");
    if (!box) return;
    var t = document.createElement("div");
    t.className = "live-toast" + (isError ? " is-error" : "");
    t.textContent = text;
    box.appendChild(t);
    setTimeout(function () { t.classList.add("is-leaving"); }, 4000);
    setTimeout(function () { t.remove(); }, 4500);
}

// The verdict of the automatic check arrives a few seconds after a save.
function listenLive() {
    if (!window.EventSource) return;
    var es = new EventSource("/api/notifications/stream");
    var VERDICT = { approved: "is live", limited: "is shown lower, see why in the table", review: "is waiting for an admin", rejected: "was refused, see why in the table", suspended: "was suspended" };
    es.addEventListener("product", function (e) {
        var d = JSON.parse(e.data);
        var p = productCache.find(function (x) { return x.id === d.productId; });
        if (VERDICT[d.status]) toast((p ? '"' + p.name + '"' : "Your product") + " " + VERDICT[d.status], d.status === "rejected" || d.status === "suspended");
        loadProducts();
    });
}

async function deleteProduct(id) {
    var p = productCache.find(function (x) { return x.id === id; });
    if (!p) return;
    if (!confirm('Delete "' + p.name + '"?')) return;
    try {
        await Api.shopProducts.remove(id);
    } catch (e) {
        alert(e.message);
        return;
    }
    await loadProducts();
}

document.addEventListener("DOMContentLoaded", function () {
    var user = Auth.getCurrentUser();
    if (!user || user.role !== "shop") {
        window.location.href = "../admin/admin-login.html";
        return;
    }

    document.getElementById("topbarAvatar").textContent   = (user.shopName || user.name || "S").charAt(0).toUpperCase();
    document.getElementById("topbarUserName").textContent = user.shopName || user.name || "Shop";

    loadProducts();
    listenLive();

    document.getElementById("btnNewProduct").addEventListener("click", function () { openModal(null); });
    document.getElementById("btnSaveProduct").addEventListener("click", saveModal);
    document.getElementById("modalImageFile").addEventListener("change", onImageChosen);
    document.getElementById("modalImageUrl").addEventListener("input", function () { setPreview(this.value.trim()); });

    var logout = async function () {
        await Api.auth.logout();
        window.location.href = "../admin/admin-login.html";
    };
    document.getElementById("logoutBtn").addEventListener("click", logout);
    document.getElementById("logoutLink").addEventListener("click", function (e) { e.preventDefault(); logout(); });

    document.querySelectorAll(".filter-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
            document.querySelectorAll(".filter-tab").forEach(function (b) { b.classList.remove("active"); });
            btn.classList.add("active");
            currentFilter = btn.dataset.filter;
            renderTable();
        });
    });

    document.getElementById("productSearch").addEventListener("input", function () {
        currentSearch = this.value;
        renderTable();
    });
});
