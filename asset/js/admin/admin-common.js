// admin-common.js — Page guard + logout cho mọi trang admin (protected pages)

// ── AdminModal — shared dialogs (alert + confirm) ─────────────
var AdminModal = (function () {
    var _confirmCallbacks = null;

    function _inject() {
        var wrap = document.createElement("div");
        wrap.innerHTML = [
            '<div class="modal-overlay" id="adminAlertModal">',
            '  <div class="modal-panel modal-panel-sm">',
            '    <div class="admin-modal-icon info" id="adminAlertIcon">',
            '      <i class="fa-solid fa-circle-info"></i>',
            '    </div>',
            '    <div class="admin-modal-center">',
            '      <h3 id="adminAlertTitle">Notice</h3>',
            '      <p id="adminAlertMessage"></p>',
            '    </div>',
            '    <div class="modal-footer" style="justify-content:center;border-top:none;padding-top:4px;">',
            '      <button class="modal-btn close" id="adminAlertOkBtn">OK</button>',
            '    </div>',
            '  </div>',
            '</div>',
            '<div class="modal-overlay" id="adminConfirmModal">',
            '  <div class="modal-panel modal-panel-sm">',
            '    <div class="modal-header">',
            '      <h3 id="adminConfirmTitle">Confirm</h3>',
            '    </div>',
            '    <div class="modal-body">',
            '      <p id="adminConfirmMessage" style="font-size:14px;color:#555;line-height:1.5;"></p>',
            '    </div>',
            '    <div class="modal-footer">',
            '      <button class="modal-btn close" id="adminConfirmCancelBtn">Cancel</button>',
            '      <button class="modal-btn suspend" id="adminConfirmOkBtn">Confirm</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join("");
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

        document.getElementById("adminAlertOkBtn").addEventListener("click", _closeAlert);
        document.getElementById("adminAlertModal").addEventListener("click", function (e) {
            if (e.target === this) _closeAlert();
        });
        document.getElementById("adminConfirmCancelBtn").addEventListener("click", _cancel);
        document.getElementById("adminConfirmOkBtn").addEventListener("click", _ok);
        document.getElementById("adminConfirmModal").addEventListener("click", function (e) {
            if (e.target === this) _cancel();
        });
    }

    function _closeAlert() {
        document.getElementById("adminAlertModal").classList.remove("show");
    }

    function _cancel() {
        document.getElementById("adminConfirmModal").classList.remove("show");
        var cbs = _confirmCallbacks;
        _confirmCallbacks = null;
        if (cbs && typeof cbs.cancel === "function") cbs.cancel();
    }

    function _ok() {
        document.getElementById("adminConfirmModal").classList.remove("show");
        var cbs = _confirmCallbacks;
        _confirmCallbacks = null;
        if (cbs && typeof cbs.ok === "function") cbs.ok();
    }

    function alert(message, type) {
        var t = type || "info";
        var icons   = { success: "fa-circle-check", error: "fa-circle-xmark", info: "fa-circle-info" };
        var titles  = { success: "Success", error: "Error", info: "Notice" };
        var iconEl  = document.getElementById("adminAlertIcon");
        iconEl.className = "admin-modal-icon " + t;
        iconEl.innerHTML = '<i class="fa-solid ' + (icons[t] || icons.info) + '"></i>';
        document.getElementById("adminAlertTitle").textContent   = titles[t] || "Notice";
        document.getElementById("adminAlertMessage").textContent = message;
        document.getElementById("adminAlertModal").classList.add("show");
    }

    function confirm(message, onConfirm, onCancel) {
        document.getElementById("adminConfirmMessage").textContent = message;
        _confirmCallbacks = { ok: onConfirm || null, cancel: onCancel || null };
        document.getElementById("adminConfirmModal").classList.add("show");
    }

    document.addEventListener("DOMContentLoaded", _inject);

    return { alert: alert, confirm: confirm };
})();

(function () {
    // Tầng 1: guard — chạy trước khi DOM parse
    Auth.requireRole("admin", "admin-login.html");

    document.addEventListener("DOMContentLoaded", function () {

        // Bind logout button — không dùng onclick="" trong HTML
        var logoutBtn = document.getElementById("logoutBtn");
        if (logoutBtn) {
            logoutBtn.addEventListener("click", function () {
                Auth.logout("admin-login.html");
            });
        }

        // Hiện tên + avatar + role badge của admin đang login
        var user = Auth.getCurrentUser();
        var topbarName   = document.getElementById("topbarUserName");
        var topbarAvatar = document.getElementById("topbarAvatar");

        if (user) {
            if (topbarName) {
                var roles      = Auth.getAdminRoles();
                var roleLabel  = (user.adminRole && roles[user.adminRole]) ? roles[user.adminRole].label : "Admin";
                topbarName.textContent = (user.name || user.username || "Admin") + " (" + roleLabel + ")";
            }
            if (topbarAvatar) topbarAvatar.textContent = (user.name || user.username || "A").charAt(0).toUpperCase();
        }

        // Ẩn/hiện các element theo permission
        // Supports data-permission="level2" (legacy) and any permission key e.g. "users.admin"
        var permEls = document.querySelectorAll("[data-permission]");
        for (var i = 0; i < permEls.length; i++) {
            var perm  = permEls[i].getAttribute("data-permission");
            var allow = perm === "level2" ? Auth.isSuperAdmin() : Auth.hasPermission(perm);
            permEls[i].style.display = allow ? "" : "none";
        }

        // Hide sidebar nav links for pages this role cannot access
        var NAV_PERMISSIONS = {
            "shops-manage.html": "shops.view",
            "products.html":     "products.view",
            "orders-manage.html":"orders.view",
            "users-manage.html": "users.view",
            "notifications.html":"notifications.view",
            "support.html":      "support.view"
        };
        var navLinks = document.querySelectorAll(".nav-item[href]");
        for (var j = 0; j < navLinks.length; j++) {
            var href     = navLinks[j].getAttribute("href");
            var filename = href.split("/").pop().split("?")[0];
            var reqPerm  = NAV_PERMISSIONS[filename];
            if (reqPerm && !Auth.hasPermission(reqPerm)) {
                navLinks[j].style.display = "none";
            }
        }
    });
})();
