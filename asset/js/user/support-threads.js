// support-threads.js — the "Staff" tab of the support chat: leave a message, read the replies.
// Replies show up on their own while the chat is open (it asks for new messages every few seconds).

var SupportThreads = (function () {

    // staff replies arrive live (support:change from ui.js); polling is only the fallback
    var POLL_THREAD_MS = 20000;
    var POLL_UNREAD_MS = 60000;
    var esc = Api.escapeHtml;

    var root, tabs, botBox, staffTab, botTab;
    var view = "list";            // list | new | thread
    var current = null;           // { id, subject, status, lastId }
    var pollTimer = null;
    var online = false;

    function currentUser() {
        try { return JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { return null; }
    }

    function isCustomer() {
        var u = currentUser();
        return !!u && u.role === "customer";
    }

    function time(iso) {
        return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    function setBadge(n) {
        ["scBadge", "scStaffBadge"].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.textContent = n > 9 ? "9+" : String(n);
            el.hidden = !n;
        });
    }

    // ---------- tabs

    function showTab(which) {
        var staff = which === "staff";
        botBox.classList.toggle("sc-hidden", staff);
        root.classList.toggle("sc-open", staff);
        botTab.setAttribute("aria-selected", String(!staff));
        staffTab.setAttribute("aria-selected", String(staff));
        if (staff) showList(); else stopPolling();
    }

    // ---------- list of conversations

    async function showList() {
        view = "list";
        stopPolling();
        root.innerHTML = '<div class="sc-messages"><p>Loading…</p></div>';
        try {
            var threads = await Api.support.list();
            if (!threads.length) { showNew(); return; }
            var rows = threads.map(function (t) {
                var label = { open: "Waiting for staff", answered: "Staff replied", closed: "Closed" }[t.status];
                return '<button type="button" class="sc-thread" data-id="' + t.id + '">' +
                    '<span class="sc-thread-main"><strong>' + esc(t.subject) + '</strong><span class="sc-thread-last">' + esc(t.lastMessage) + "</span></span>" +
                    '<span class="sc-thread-meta">' + esc(label) + (t.unread ? ' <span class="sc-badge">' + t.unread + "</span>" : "") + "<br>" + esc(time(t.updatedAt)) + "</span></button>";
            }).join("");
            root.innerHTML = '<div class="sc-messages"><div class="sc-threads">' + rows + '</div></div>' +
                '<div class="sc-form"><button type="button" class="sc-send" id="scNewThread" style="flex:1;padding:11px;">New message to staff</button></div>';
            root.querySelectorAll(".sc-thread").forEach(function (b) {
                b.addEventListener("click", function () { showThread(Number(b.dataset.id)); });
            });
            root.querySelector("#scNewThread").addEventListener("click", function () { showNew(); });
        } catch (e) {
            root.innerHTML = '<div class="sc-messages"><p>Could not load your conversations. Please try again.</p></div>';
        }
    }

    // ---------- new message

    async function refreshAvailability() {
        try { online = (await Api.support.availability()).online; } catch (e) { online = false; }
        var note = root.querySelector("#scAvail");
        if (note) note.textContent = availabilityText();
    }

    function availabilityText() {
        return online
            ? "Our staff are online - you will usually get a reply within minutes. / Nhân viên đang trực."
            : "Our staff are away right now. Leave your message and they will reply here as soon as they can. / Hiện chưa có nhân viên trực, họ sẽ trả lời bạn sớm nhất có thể.";
    }

    function showNew(prefill) {
        view = "new";
        stopPolling();
        var shared = window.SupportChat ? SupportChat.turns().filter(function (t) { return t.role === "user" || (t.reply && t.reply.text); }).length : 0;
        root.innerHTML = '<div class="sc-notice" id="scAvail">' + esc(availabilityText()) + "</div>" +
            '<form class="sc-messages" id="scNewForm" style="display:flex;flex-direction:column;gap:10px;">' +
            '<label for="scNewBody"><strong>How can we help?</strong></label>' +
            '<textarea class="sc-input" id="scNewBody" rows="5" maxlength="2000" style="max-height:none;" placeholder="Describe your question. Add your order number if it is about an order."></textarea>' +
            (shared ? '<p class="sc-source">Your chat with the assistant will be shared with our staff so you do not have to repeat yourself.</p>' : "") +
            '<p class="sc-error" id="scNewError" role="alert" hidden></p>' +
            '<div style="display:flex;gap:8px;"><button type="submit" class="sc-send" style="flex:1;padding:11px;">Send to staff</button>' +
            '<button type="button" class="sc-action" id="scNewCancel">Back</button></div></form>';
        var body = root.querySelector("#scNewBody");
        if (prefill) body.value = prefill;
        body.focus();
        root.querySelector("#scNewCancel").addEventListener("click", function () { showList(); });
        root.querySelector("#scNewForm").addEventListener("submit", async function (e) {
            e.preventDefault();
            var text = body.value.trim();
            var err = root.querySelector("#scNewError");
            if (!text) { err.textContent = "Please write a message."; err.hidden = false; return; }
            var transcript = window.SupportChat ? SupportChat.turns().slice(-10).map(function (t) {
                return { role: t.role, content: String(t.role === "user" ? t.content : t.reply.text).slice(0, 1000) };
            }).filter(function (t) { return t.content; }) : [];
            while (transcript.length && transcript[0].role !== "user") transcript.shift();
            try {
                var created = await Api.support.create(text, transcript);
                showThread(created.id);
            } catch (ex) {
                err.textContent = ex.message || "Could not send your message.";
                err.hidden = false;
            }
        });
        refreshAvailability();
    }

    // ---------- one conversation

    function messageHtml(m) {
        var mine = m.authorType === "customer";
        return '<div class="sc-msg' + (mine ? " sc-msg--me" : "") + '" data-id="' + m.id + '">' +
            '<div class="sc-who">' + (mine ? "You" : esc(m.authorName || "Support") + " · staff") + "</div>" +
            '<div class="sc-bubble">' + esc(m.body) + '</div><div class="sc-time">' + esc(time(m.createdAt)) + "</div></div>";
    }

    async function showThread(id) {
        view = "thread";
        stopPolling();
        root.innerHTML = '<div class="sc-notice" id="scThreadHead"></div><div class="sc-messages" id="scThreadMsgs" aria-live="polite"></div>' +
            '<form class="sc-form" id="scReplyForm"><textarea class="sc-input" id="scReplyBody" rows="1" maxlength="2000" placeholder="Write a reply…" aria-label="Your reply"></textarea>' +
            '<button type="submit" class="sc-send">Send</button></form>' +
            '<div class="sc-form" style="padding-top:0;"><button type="button" class="sc-action" id="scBack">← All conversations</button></div>';
        root.querySelector("#scBack").addEventListener("click", function () { showList(); });
        current = { id: id, subject: "", status: "open", lastId: 0 };

        var body = root.querySelector("#scReplyBody");
        root.querySelector("#scReplyForm").addEventListener("submit", async function (e) {
            e.preventDefault();
            var text = body.value.trim();
            if (!text) return;
            try {
                await Api.support.reply(id, text);
                body.value = "";
                await poll();
            } catch (ex) {
                head(ex.status === 409 ? "closed" : null, ex.message);
            }
        });
        body.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); root.querySelector("#scReplyForm").requestSubmit(); }
        });

        await poll(true);
        pollTimer = setInterval(poll, POLL_THREAD_MS);
        body.focus();
    }

    function head(status, error) {
        var el = root.querySelector("#scThreadHead");
        if (!el) return;
        var form = root.querySelector("#scReplyForm");
        var labels = { open: "Waiting for our staff to reply.", answered: "Our staff replied. You can answer here.", closed: "This conversation is closed. Start a new one if you still need help." };
        el.textContent = error || (current.subject ? current.subject + " - " : "") + (labels[status || current.status] || "");
        if (form) form.hidden = (status || current.status) === "closed";
    }

    async function poll(first) {
        if (view !== "thread" || !current || document.hidden && !first) return;
        try {
            var data = await Api.support.get(current.id, current.lastId);
            if (view !== "thread") return;
            current.subject = data.thread.subject;
            current.status = data.thread.status;
            var msgs = root.querySelector("#scThreadMsgs");
            if (!msgs) return;
            var stick = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 40 || first;
            data.messages.forEach(function (m) {
                if (m.id <= current.lastId || msgs.querySelector('[data-id="' + m.id + '"]')) return;
                msgs.insertAdjacentHTML("beforeend", messageHtml(m));
                current.lastId = m.id;
            });
            if (stick) msgs.scrollTop = msgs.scrollHeight;
            head();
            refreshUnread();
        } catch (e) {
            if (e.status === 401) stopPolling();
        }
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        current = view === "thread" ? current : null;
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

        function catchUp(threadId) {
            if (view === "thread" && current && (threadId === undefined || current.id === threadId)) {
                // reading the thread marks it seen, so count what is unread only after that
                poll(true).then(function () { refreshUnread(true); });
                return;
            }
            refreshUnread(true);
            if (view === "list") showList();
        }
        document.addEventListener("support:change", function (e) { catchUp(e.detail.threadId); });
        document.addEventListener("live:resync", function () { catchUp(); });
    }

    // Called by the bot's "Talk to staff" button.
    function open() {
        SupportChat.open();
        showTab("staff");
        showNew();
    }

    document.addEventListener("DOMContentLoaded", init);

    return { open: open };

})();
