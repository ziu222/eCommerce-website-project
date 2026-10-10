// admin-notifications.js — Quản lý Notifications (Manual send + History)

Auth.requirePermission("notifications.view");

(function () {

    // ── Tab switching (chuyển tab) ───────────────────────────
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
            if (target === "history") renderHistory();
        });
    }

    // ── Helpers (tiện ích) ───────────────────────────────────
    function formatDate(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
            " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    }

    function showToast(msg) {
        var el = document.getElementById("toastMsg");
        el.textContent = msg;
        el.classList.add("show");
        setTimeout(function () { el.classList.remove("show"); }, 3000);
    }

    function showError(id, msg) {
        var el = document.getElementById(id);
        el.textContent = msg;
        el.classList.add("show");
    }

    function clearError(id) {
        var el = document.getElementById(id);
        el.textContent = "";
        el.classList.remove("show");
    }

    // ── Populate specific recipient lists (list người nhận cụ thể) ──
    async function populateSpecificList(listId, role) {
        var select = document.getElementById(listId);
        select.innerHTML = "";
        var users = [];
        try {
            users = await Api.adminNotifications.recipients(role);
        } catch (e) {
            return; // view-only admins cannot send, so they get no recipient list
        }
        users.forEach(function (u) {
            var opt = document.createElement("option");
            opt.value = u.id;
            opt.textContent = (u.name || "") + " (" + u.email + ")";
            select.appendChild(opt);
        });
    }

    populateSpecificList("cSpecificList", "customer");
    populateSpecificList("sSpecificList", "shop");

    // ── Recipient toggle ─────────────────────────────────────
    document.getElementById("cRecipient").addEventListener("change", function () {
        document.getElementById("cSpecificWrap").style.display =
            this.value === "specific" ? "" : "none";
    });
    document.getElementById("sRecipient").addEventListener("change", function () {
        document.getElementById("sSpecificWrap").style.display =
            this.value === "specific" ? "" : "none";
    });

    // ── Send logic 
    async function sendNotification(config) {
        // config: { recipientSelectId, specificListId, typeId, titleId, messageId, errorId, targetRole }
        clearError(config.errorId);

        var recipient = document.getElementById(config.recipientSelectId).value;
        var type      = document.getElementById(config.typeId).value;
        var title     = document.getElementById(config.titleId).value.trim();
        var message   = document.getElementById(config.messageId).value.trim();

        if (!title) {
            showError(config.errorId, "Title is required.");
            return;
        }
        if (!message) {
            showError(config.errorId, "Message is required.");
            return;
        }

        var userIds = [];
        if (recipient !== "all") {
            var select = document.getElementById(config.specificListId);
            userIds = Array.prototype.filter.call(select.options, function (o) { return o.selected; })
                .map(function (o) { return parseInt(o.value, 10); });
            if (!userIds.length) {
                showError(config.errorId, "Please select at least one recipient.");
                return;
            }
        }

        var count = 0;
        try {
            var result = await Api.adminNotifications.send({
                targetRole: config.targetRole,
                userIds: userIds.length ? userIds : undefined,
                type: type,
                title: title,
                message: message
            });
            count = result.count;
        } catch (e) {
            showError(config.errorId, e.message);
            return;
        }

        // Reset form
        document.getElementById(config.recipientSelectId).value = "all";
        document.getElementById(config.specificListId).selectedIndex = -1;
        document.getElementById(config.typeId).value = "info";
        document.getElementById(config.titleId).value = "";
        document.getElementById(config.messageId).value = "";
        document.getElementById(config.specificListId).closest
            && (document.getElementById(config.specificListId).parentElement.style.display = "none");

        showToast("Sent successfully to " + (recipient === "all" ? "all " + config.targetRole + "s" : count + " recipient" + (count > 1 ? "s" : "")) + ".");
    }

    document.getElementById("cSendBtn").addEventListener("click", function () {
        sendNotification({
            recipientSelectId: "cRecipient",
            specificListId:    "cSpecificList",
            typeId:            "cType",
            titleId:           "cTitle",
            messageId:         "cMessage",
            errorId:           "cError",
            targetRole:        "customer"
        });
    });

    document.getElementById("sSendBtn").addEventListener("click", function () {
        sendNotification({
            recipientSelectId: "sRecipient",
            specificListId:    "sSpecificList",
            typeId:            "sType",
            titleId:           "sTitle",
            messageId:         "sMessage",
            errorId:           "sError",
            targetRole:        "shop"
        });
    });

    // ── History
    var histRoleFilter = document.getElementById("histRoleFilter");
    var histTypeFilter = document.getElementById("histTypeFilter");
    var histDateFrom   = document.getElementById("histDateFrom");
    var histDateTo     = document.getElementById("histDateTo");

    document.getElementById("histResetBtn").addEventListener("click", function () {
        histRoleFilter.value = "all";
        histTypeFilter.value = "all";
        histDateFrom.value   = "";
        histDateTo.value     = "";
        renderHistory();
    });

    [histRoleFilter, histTypeFilter, histDateFrom, histDateTo].forEach(function (el) {
        el.addEventListener("change", renderHistory);
    });

    async function renderHistory() {
        var tbody = document.getElementById("historyBody");
        var empty = document.getElementById("historyEmpty");

        var batches = [];
        try {
            batches = await Api.adminNotifications.history({
                role: histRoleFilter.value,
                type: histTypeFilter.value,
                from: histDateFrom.value,
                to: histDateTo.value
            });
        } catch (e) {
            batches = [];
        }

        tbody.innerHTML = "";
        if (!batches.length) {
            empty.style.display = "";
            return;
        }
        empty.style.display = "none";

        var typeBadge = { info: "badge-info", promo: "badge-promo", warning: "badge-warning" };

        batches.forEach(function (b, idx) {
            var recipients = b.recipients.all
                ? "All " + b.targetRole + "s"
                : b.recipients.count + " user" + (b.recipients.count > 1 ? "s" : "");
            var badgeClass = typeBadge[b.type] || "badge-info";
            var tr = document.createElement("tr");
            tr.innerHTML =
                "<td>" + (idx + 1) + "</td>" +
                "<td>" + escHtml(b.title) + "</td>" +
                "<td><span class='badge " + badgeClass + "'>" + escHtml(b.type) + "</span></td>" +
                "<td><span class='badge badge-level1'>" + escHtml(b.targetRole) + "</span></td>" +
                "<td>" + escHtml(recipients) + "</td>" +
                "<td>" + escHtml(b.sentBy || "admin") + "</td>" +
                "<td>" + formatDate(b.createdAt) + "</td>";
            tbody.appendChild(tr);
        });
    }

    function escHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

})();
