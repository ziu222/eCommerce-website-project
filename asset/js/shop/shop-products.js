// shop-products.js — a shop manages its own products. Every save goes back to the admin review queue.

var productCache  = [];
var currentFilter = "all";
var currentSearch = "";
var editingId     = null;
var uploading     = false;

var DEFAULT_IMAGE = "../asset/img/placeholder/audio.svg";
var STATUS_LABEL  = { approved: "Live", pending: "In review", rejected: "Rejected", suspended: "Suspended" };

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
    var count = function (status) { return productCache.filter(function (p) { return p.adminStatus === status; }).length; };
    document.getElementById("statTotal").textContent     = productCache.length;
    document.getElementById("statApproved").textContent  = count("approved");
    document.getElementById("statPending").textContent   = count("pending");
    document.getElementById("statAttention").textContent = count("rejected") + count("suspended");
}

function matchesFilter(p) {
    if (currentFilter === "attention") return p.adminStatus === "rejected" || p.adminStatus === "suspended";
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
        var note = p.adminNote && (p.adminStatus === "rejected" || p.adminStatus === "suspended")
            ? '<div style="font-size:12px;color:#8a6d3b;margin-top:4px;">Admin note: ' + Api.escapeHtml(p.adminNote) + '</div>'
            : "";
        return '<tr>' +
            '<td><div style="display:flex;gap:10px;align-items:center;">' +
                '<img src="' + Api.escapeHtml(p.image) + '" alt="" onerror="this.onerror=null;this.src=\'../asset/img/404.png\'" style="width:44px;height:44px;object-fit:cover;border-radius:8px;background:#f1f3f5;">' +
                '<strong>' + Api.escapeHtml(p.name) + '</strong></div></td>' +
            '<td>' + Api.escapeHtml(p.category) + '</td>' +
            '<td>' + money(p.price) + (p.oldPrice ? ' <s style="color:#6b7280;">' + money(p.oldPrice) + '</s>' : '') + '</td>' +
            '<td>' + p.stock + '</td>' +
            '<td><span class="badge badge-' + p.adminStatus + '">' + (STATUS_LABEL[p.adminStatus] || p.adminStatus) + '</span>' + note + '</td>' +
            '<td>' +
                '<button class="icon-btn icon-btn-edit" onclick="openModal(' + p.id + ')" title="Edit"><i class="fa-solid fa-pen"></i></button>' +
                '<button class="icon-btn icon-btn-suspend" onclick="deleteProduct(' + p.id + ')" title="Delete"><i class="fa-solid fa-trash"></i></button>' +
            '</td>' +
        '</tr>';
    }).join("");
}

function setPreview(url) {
    document.getElementById("imagePreview").src = url || DEFAULT_IMAGE;
}

function showModalError(message) {
    var el = document.getElementById("modalError");
    el.textContent = message || "";
    el.style.display = message ? "" : "none";
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

    try {
        if (editingId) {
            await Api.shopProducts.update(editingId, data);
        } else {
            await Api.shopProducts.create(data);
        }
    } catch (e) {
        showModalError(e.message);
        return;
    }

    closeModal();
    await loadProducts();
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
