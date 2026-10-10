// admin-users.js — Users Management Page Logic

Auth.requireRole("admin", "admin-login.html");
Auth.requirePermission("users.view");

(function () {

    // ── Tab switching ────────────────────────────────────────
    var tabBtns   = document.querySelectorAll(".filter-tab[data-tab]");
    var tabPanels = document.querySelectorAll(".tab-panel");

    for (var i = 0; i < tabBtns.length; i++) {
        tabBtns[i].addEventListener("click", function () {
            var target = this.dataset.tab;

            for (var j = 0; j < tabBtns.length; j++) {
                tabBtns[j].classList.remove("active");
                tabPanels[j].classList.remove("active");
            }

            this.classList.add("active");
            document.getElementById("panel-" + target).classList.add("active");
        });
    }

    // ── Helpers ──────────────────────────────────────────────
    function esc(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function formatDate(dateStr) {
        if (!dateStr) return "—";
        var d = new Date(dateStr);
        return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-GB");
    }

    // ── Data helpers ─────────────────────────────────────────
    var allUsers = [];

    function getAllUsers() {
        return allUsers;
    }

    async function loadUsers() {
        try {
            allUsers = await Api.adminUsers.list();
        } catch (e) {
            alert("Could not load users: " + e.message);
        }
        renderCustomers();
        renderShops();
        renderAdmins();
        renderBanned();
    }

    async function changeStatus(id, change) {
        try {
            await Api.adminUsers.setStatus(id, change);
        } catch (e) {
            alert(e.message);
        }
        await loadUsers();
    }

    // ── Render Tab 1: Customers ─────────────────────────────
    function renderCustomers() {
        var users     = getAllUsers().filter(function (u) { return u.role === "customer" && u.status !== "banned" && u.status !== "suspended"; });
        var tbody     = document.getElementById("bodyCustomers");
        var emptyMsg  = document.getElementById("emptyCustomers");
        var countEl   = document.getElementById("countCustomers");

        countEl.textContent = users.length;
        tbody.innerHTML = "";

        if (!users.length) { emptyMsg.style.display = ""; return; }
        emptyMsg.style.display = "none";

        users.forEach(function (u, idx) {
            var tr = document.createElement("tr");
            tr.innerHTML =
                "<td>" + (idx + 1) + "</td>" +
                "<td>" + esc(u.name) + "</td>" +
                "<td>" + esc(u.username) + "</td>" +
                "<td>" + esc(u.email) + "</td>" +
                "<td><span class='badge badge-active'>Active</span></td>" +
                "<td>" + formatDate(u.createdAt) + "</td>" +
                "<td><button class='icon-btn icon-btn-suspend' title='Suspend' data-id='" + u.id + "'><i class='fa-solid fa-ban'></i></button></td>";
            tbody.appendChild(tr);
        });
    }

    document.getElementById("bodyCustomers").addEventListener("click", function (e) {
        var btn = e.target.closest(".icon-btn-suspend");
        if (!btn) return;
        changeStatus(parseInt(btn.dataset.id, 10), { status: "suspended" });
    });

    // ── Render Tab 2: Shops ──────────────────────────────────
    var shopStatusFilter = "all";

    function renderShops() {
        var all = getAllUsers().filter(function (u) { return u.role === "shop" && u.status !== "banned" && u.shopStatus !== "suspended"; });
        var pendingCount = all.filter(function (u) { return u.shopStatus === "pending"; }).length;
        var pendingBadge = document.getElementById("countPendingShops");
        if (pendingBadge) pendingBadge.textContent = pendingCount;
        var users = shopStatusFilter === "pending"
            ? all.filter(function (u) { return u.shopStatus === "pending"; })
            : all;
        var tbody    = document.getElementById("bodyShops");
        var emptyMsg = document.getElementById("emptyShops");
        var countEl  = document.getElementById("countShops");

        countEl.textContent = users.length;
        tbody.innerHTML = "";

        if (!users.length) { emptyMsg.style.display = ""; return; }
        emptyMsg.style.display = "none";

        users.forEach(function (u, idx) {
            var isPending = u.shopStatus === "pending";
            var statusBadge = isPending
                ? "<span class='badge badge-pending'>Pending</span>"
                : "<span class='badge badge-active'>Active</span>";
            var actions =
                "<button class='icon-btn icon-btn-view' title='View' data-shop-action='view' data-id='" + u.id + "'><i class='fa-solid fa-eye'></i></button>" +
                (isPending
                    ? "<button class='icon-btn icon-btn-approve' title='Approve' data-shop-action='approve' data-id='" + u.id + "'><i class='fa-solid fa-circle-check'></i></button>"
                    : "<button class='icon-btn icon-btn-suspend' title='Suspend' data-shop-action='suspend' data-id='" + u.id + "'><i class='fa-solid fa-ban'></i></button>");
            var tr = document.createElement("tr");
            tr.innerHTML =
                "<td>" + (idx + 1) + "</td>" +
                "<td>" + esc(u.name) + "</td>" +
                "<td>" + esc(u.shopName || u.username) + "</td>" +
                "<td>" + esc(u.email) + "</td>" +
                "<td>" + statusBadge + "</td>" +
                "<td>" + formatDate(u.createdAt) + "</td>" +
                "<td><div class='icon-btn-group'>" + actions + "</div></td>";
            tbody.appendChild(tr);
        });
    }

    document.getElementById("bodyShops").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-shop-action]");
        if (!btn) return;
        var action = btn.dataset.shopAction;
        var id     = parseInt(btn.dataset.id, 10);
        var all    = getAllUsers();
        var user   = all.filter(function (u) { return u.id === id; })[0];
        if (!user) return;

        if (action === "approve") {
            changeStatus(id, { shopStatus: "active" });
        } else if (action === "suspend") {
            changeStatus(id, { shopStatus: "suspended" });
        } else if (action === "view") {
            openShopViewModal(user);
        }
    });

    // ── Shop View Modal ───────────────────────────────────────
    var shopViewModal = document.getElementById("shopViewModal");
    if (shopViewModal) {
        document.getElementById("shopViewCloseBtn").addEventListener("click", function () { shopViewModal.classList.remove("show"); });
        document.getElementById("shopViewOkBtn").addEventListener("click", function () { shopViewModal.classList.remove("show"); });
        shopViewModal.addEventListener("click", function (e) { if (e.target === shopViewModal) shopViewModal.classList.remove("show"); });
    }

    function openShopViewModal(user) {
        if (!shopViewModal) return;
        document.getElementById("svShopName").textContent = user.shopName || user.username || "—";
        document.getElementById("svOwner").textContent    = user.name || "—";
        document.getElementById("svEmail").textContent    = user.email || "—";
        document.getElementById("svPhone").textContent    = user.shopPhone || "—";
        document.getElementById("svAddress").textContent  = user.shopAddress || "—";
        document.getElementById("svStatus").textContent   = user.shopStatus || "pending";
        document.getElementById("svJoined").textContent   = formatDate(user.createdAt);
        shopViewModal.classList.add("show");
    }

    // ── Shop filter tabs ──────────────────────────────────────
    var btnShopFilterAll     = document.getElementById("shopFilterAll");
    var btnShopFilterPending = document.getElementById("shopFilterPending");

    if (btnShopFilterAll) {
        btnShopFilterAll.addEventListener("click", function () {
            shopStatusFilter = "all";
            btnShopFilterAll.classList.add("active");
            btnShopFilterPending.classList.remove("active");
            renderShops();
        });
    }
    if (btnShopFilterPending) {
        btnShopFilterPending.addEventListener("click", function () {
            shopStatusFilter = "pending";
            btnShopFilterPending.classList.add("active");
            btnShopFilterAll.classList.remove("active");
            renderShops();
        });
    }

    // ── Create Shop Modal ────────────────────────────────────
    var shopModal     = document.getElementById("createShopModal");
    var btnCancelShop = document.getElementById("btnCancelCreateShop");
    var btnSubmitShop = document.getElementById("btnSubmitCreateShop");
    var shopErrorEl   = document.getElementById("createShopError");

    function closeShopModal() { shopModal.classList.remove("show"); }

    if (btnCancelShop) btnCancelShop.addEventListener("click", closeShopModal);
    if (shopModal) shopModal.addEventListener("click", function (e) { if (e.target === shopModal) closeShopModal(); });

    if (btnSubmitShop) {
        btnSubmitShop.addEventListener("click", async function () {
            shopErrorEl.classList.remove("show");

            var data = {
                name:       document.getElementById("csName").value.trim(),
                shopName:   document.getElementById("csShopName").value.trim(),
                email:      document.getElementById("csEmail").value.trim(),
                username:   document.getElementById("csUsername").value.trim(),
                password:   document.getElementById("csPassword").value,
                shopStatus: document.getElementById("csStatus").value
            };

            if (!data.name || !data.shopName || !data.email || !data.username || !data.password) {
                shopErrorEl.textContent = "All fields are required.";
                shopErrorEl.classList.add("show");
                return;
            }
            if (data.password.length < 6) {
                shopErrorEl.textContent = "Password must be at least 6 characters.";
                shopErrorEl.classList.add("show");
                return;
            }

            try {
                await Api.adminUsers.createShop({
                    name:       data.name,
                    shopName:   data.shopName,
                    email:      data.email,
                    username:   data.username,
                    password:   data.password,
                    shopStatus: data.shopStatus
                });
            } catch (e) {
                shopErrorEl.textContent = e.message;
                shopErrorEl.classList.add("show");
                return;
            }

            closeShopModal();
            await loadUsers();
        });
    }

    // ── Render Tab 3: Admins ─────────────────────────────────
    function renderAdmins() {
        var users    = getAllUsers().filter(function (u) { return u.role === "admin"; });
        var tbody    = document.getElementById("bodyAdmins");
        var emptyMsg = document.getElementById("emptyAdmins");
        var countEl  = document.getElementById("countAdmins");

        countEl.textContent = users.length;
        tbody.innerHTML = "";

        if (!users.length) { emptyMsg.style.display = ""; return; }
        emptyMsg.style.display = "none";

        var adminRoles = Auth.getAdminRoles();
        users.forEach(function (u, idx) {
            var roleKey   = u.adminRole || (u.adminLevel === 2 ? "super_admin" : "staff");
            var roleLabel = (adminRoles[roleKey] && adminRoles[roleKey].label) || "Staff";
            var badgeCls  = roleKey === "super_admin" ? "badge-level2" : "badge-level1";
            var roleHtml  = "<span class='badge " + badgeCls + "'>" + esc(roleLabel) + "</span>";
            var tr = document.createElement("tr");
            tr.innerHTML =
                "<td>" + (idx + 1) + "</td>" +
                "<td>" + esc(u.name) + "</td>" +
                "<td>" + esc(u.username) + "</td>" +
                "<td>" + esc(u.email) + "</td>" +
                "<td>" + roleHtml + "</td>" +
                "<td>" + formatDate(u.createdAt) + "</td>";
            tbody.appendChild(tr);
        });
    }

    // ── Render Tab 3: Banned ─────────────────────────────────
    function renderBanned() {
        var users    = getAllUsers().filter(function (u) { return u.status === "banned" || u.status === "suspended" || u.shopStatus === "suspended"; });
        var tbody    = document.getElementById("bodyBanned");
        var emptyMsg = document.getElementById("emptyBanned");
        var countEl  = document.getElementById("countBanned");

        countEl.textContent = users.length;
        tbody.innerHTML = "";

        if (!users.length) { emptyMsg.style.display = ""; return; }
        emptyMsg.style.display = "none";

        users.forEach(function (u, idx) {
            var statusLabel = "<span class='badge badge-banned'>" + esc(u.status || u.shopStatus) + "</span>";
            var tr = document.createElement("tr");
            tr.innerHTML =
                "<td>" + (idx + 1) + "</td>" +
                "<td>" + esc(u.name) + "</td>" +
                "<td>" + esc(u.role) + "</td>" +
                "<td>" + esc(u.email) + "</td>" +
                "<td>" + statusLabel + "</td>" +
                "<td><button class='icon-btn icon-btn-restore' title='Restore' data-id='" + u.id + "'><i class='fa-solid fa-rotate-left'></i></button></td>";
            tbody.appendChild(tr);
        });
    }

    document.getElementById("bodyBanned").addEventListener("click", function (e) {
        var btn = e.target.closest(".icon-btn-restore");
        if (!btn) return;
        var id = parseInt(btn.dataset.id, 10);
        var all = getAllUsers();
        var user = all.filter(function (u) { return u.id === id; })[0];
        if (!user) return;
        var update = { status: "active" };
        if (user.role === "shop") update.shopStatus = "active";
        changeStatus(id, update);
    });

    // ── Create Admin Modal ───────────────────────────────────
    var modal          = document.getElementById("createAdminModal");
    var btnOpen        = document.getElementById("btnCreateAdmin");
    var btnCancel      = document.getElementById("btnCancelCreateAdmin");
    var btnSubmit      = document.getElementById("btnSubmitCreateAdmin");
    var errorEl        = document.getElementById("createAdminError");

    function openModal() {
        document.getElementById("caName").value     = "";
        document.getElementById("caEmail").value    = "";
        document.getElementById("caUsername").value = "";
        document.getElementById("caPassword").value = "";
        document.getElementById("caRole").value     = "staff";
        errorEl.textContent = "";
        errorEl.classList.remove("show");
        modal.classList.add("show");
    }

    function closeModal() {
        modal.classList.remove("show");
    }

    if (btnOpen)   btnOpen.addEventListener("click", openModal);
    if (btnOpen && !Auth.hasPermission("users.admin")) btnOpen.style.display = "none";
    if (btnCancel) btnCancel.addEventListener("click", closeModal);

    modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
    });

    if (btnSubmit) {
        btnSubmit.addEventListener("click", async function () {
            errorEl.classList.remove("show");

            var data = {
                name:      document.getElementById("caName").value.trim(),
                email:     document.getElementById("caEmail").value.trim(),
                username:  document.getElementById("caUsername").value.trim(),
                password:  document.getElementById("caPassword").value,
                adminRole: document.getElementById("caRole").value
            };

            if (!data.name || !data.email || !data.username || !data.password) {
                errorEl.textContent = "All fields are required.";
                errorEl.classList.add("show");
                return;
            }

            var result = await Auth.createAdmin(data);

            if (result.error) {
                errorEl.textContent = result.error;
                errorEl.classList.add("show");
                return;
            }

            closeModal();
            await loadUsers();
        });
    }

    // ── Init ─────────────────────────────────────────────────
    loadUsers();

})();
