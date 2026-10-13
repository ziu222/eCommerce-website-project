// support-threads.js — the "Staff" tab of the Volt chat. Conversations with staff live on their own screen
// (customer/support.html); this tab is the doorway to it and keeps the unread badge on the launcher current.

var SupportThreads = (function () {

    var POLL_UNREAD_MS = 60000;
    var TRANSCRIPT_KEY = "ecshop_support_transcript"; // read by support.html to share the bot chat with staff

    // the policy the bot last answered from hints at what the customer needs help with
    var TOPIC_OF_POLICY = {
        shipping: "orders", cancellation: "orders", "order-status": "orders",
        returns: "returns", refunds: "returns",
        payment: "payments", wallet: "payments", coupons: "payments",
        warranty: "products", account: "account"
    };

    var root, tabs, botBox, staffTab, botTab;
    var unread = 0;

    function currentUser() {
        try { return JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { return null; }
    }

    function isCustomer() {
        var u = currentUser();
        return !!u && u.role === "customer";
    }

    function setBadge(n) {
        unread = n;
        ["scBadge", "scStaffBadge", "scDoorBadge"].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = n > 9 ? "9+" : String(n);
            el.hidden = !n;
        });
    }

    // ---------- the tab

    function renderDoor() {
        root.innerHTML = '<div class="sc-door">' +
            '<p class="sc-door-title">Talk to our team</p>' +
            '<p class="sc-door-text">Orders, returns, payments, products or your account: tell us what you need and the right person replies. You can follow every conversation on the Support page.</p>' +
            '<a class="sc-send sc-door-btn" href="support.html?new=1">New message to staff</a>' +
            '<a class="sc-action sc-door-link" href="support.html">My conversations<span class="sc-badge" id="scDoorBadge"' + (unread ? "" : " hidden") + ">" + (unread > 9 ? "9+" : unread) + "</span></a>" +
            "</div>";
    }

    function showTab(which) {
        var staff = which === "staff";
        botBox.classList.toggle("sc-hidden", staff);
        root.classList.toggle("sc-open", staff);
        botTab.setAttribute("aria-selected", String(!staff));
        staffTab.setAttribute("aria-selected", String(staff));
        if (staff) renderDoor();
    }

    // ---------- unread badge on the launcher

    // Skips background tabs on the timer, but always runs when the page loads.
    async function refreshUnread(force) {
        if (!isCustomer() || (document.hidden && !force)) return;
        try { setBadge((await Api.support.unread()).count); } catch (e) { /* signed out meanwhile */ }
    }

    // ---------- start-up

    function init() {
        if (!window.SupportChat || !isCustomer()) return;
        var panel = SupportChat.panel();
        tabs = panel.querySelector("#scTabs");
        botBox = panel.querySelector("#scBot");
        root = panel.querySelector("#scStaff");
        botTab = panel.querySelector("#scTabBot");
        staffTab = panel.querySelector("#scTabStaff");
        tabs.hidden = false;
        botTab.addEventListener("click", function () { showTab("bot"); });
        staffTab.addEventListener("click", function () { showTab("staff"); });
        refreshUnread(true);
        setInterval(refreshUnread, POLL_UNREAD_MS);
        // a staff reply, or a catch-up after being offline, changes the count
        document.addEventListener("support:change", function () { refreshUnread(true); });
        document.addEventListener("live:resync", function () { refreshUnread(true); });
    }

    // Called by the bot's "Talk to staff" button: take the chat so far to the Support page.
    function open() {
        var turns = window.SupportChat ? SupportChat.turns() : [];
        var transcript = turns.slice(-10).map(function (t) {
            return { role: t.role, content: String(t.role === "user" ? t.content : (t.reply && t.reply.text) || "").slice(0, 1000) };
        }).filter(function (t) { return t.content; });
        while (transcript.length && transcript[0].role !== "user") transcript.shift();

        var topic = "";
        for (var i = turns.length - 1; i >= 0 && !topic; i--) {
            var sources = turns[i].reply && turns[i].reply.sources;
            if (sources && sources.length) topic = TOPIC_OF_POLICY[sources[0].slug] || "";
        }
        try { sessionStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript)); } catch (e) { /* private mode: the page just starts empty */ }
        location.href = "support.html?new=1" + (topic ? "&topic=" + topic : "");
    }

    document.addEventListener("DOMContentLoaded", init);

    return { open: open };

})();
