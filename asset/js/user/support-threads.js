// support-threads.js — the "Staff" tab of the support chat: leave a message, read the replies.
// Replies show up on their own while the chat is open (it asks for new messages every few seconds).

var SupportThreads = (function () {

    // staff replies arrive live (support:change from ui.js); polling is only the fallback
    var POLL_THREAD_MS = 20000;
    var POLL_UNREAD_MS = 60000;
    var esc = Api.escapeHtml;

    var root, tabs, botBox, staffTab, botTab;
    var view = "list";            // list | new | thread
    var current = null;           // { id, subject, topic, status, lastId }
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

    // ---------- small pieces shared by the list and the conversation

    var STATUS_LABEL = { open: "Waiting for staff", answered: "Staff replied", closed: "Closed" };

    function tag(topicId) {
        var t = Api.supportTopic(topicId);
        return '<span class="sc-tag"><span class="ms" aria-hidden="true">' + t.ms + "</span>" + esc(t.label) + "</span>";
    }

    function pill(status) {
        return '<span class="sc-pill sc-pill--' + status + '">' + esc(STATUS_LABEL[status] || status) + "</span>";
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
                return '<button type="button" class="sc-thread' + (t.unread ? " is-unread" : "") + '" data-id="' + t.id + '">' +
                    '<span class="sc-thread-top"><strong>' + esc(t.subject) + "</strong><time>" + esc(time(t.updatedAt)) + "</time></span>" +
                    '<span class="sc-thread-last">' + esc(t.lastMessage) + "</span>" +
                    '<span class="sc-thread-tags">' + tag(t.topic) + pill(t.status) +
                    (t.unread ? '<span class="sc-badge" aria-label="' + t.unread + ' unread">' + t.unread + "</span>" : "") + "</span></button>";
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
        if (!note) return;
        note.dataset.online = String(online);
        note.querySelector("#scAvailText").textContent = availabilityText();
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
        // one radio per topic; the chosen one decides which position of our staff gets the message
        var topics = Api.supportTopics.map(function (t) {
            return '<label class="sc-topic"><input type="radio" name="scTopic" value="' + t.id + '"><span class="ms" aria-hidden="true">' + t.ms + "</span>" + esc(t.label) + "</label>";
        }).join("");
        root.innerHTML = '<p class="sc-avail" id="scAvail" data-online="false"><span class="sc-avail-dot" aria-hidden="true"></span><span id="scAvailText">' + esc(availabilityText()) + "</span></p>" +
            '<form class="sc-messages sc-new" id="scNewForm">' +
            '<fieldset class="sc-topics"><legend>What do you need help with?</legend><div class="sc-topic-grid">' + topics + "</div></fieldset>" +
            '<label for="scNewBody" class="sc-label">Your message</label>' +
            '<textarea class="sc-input sc-new-body" id="scNewBody" rows="3" maxlength="2000" placeholder="Describe your question."></textarea>' +
            (shared ? '<p class="sc-source">Your chat with the assistant will be shared with our staff so you do not have to repeat yourself.</p>' : "") +
            '<p class="sc-error" id="scNewError" role="alert" hidden></p>' +
            '<div class="sc-new-actions"><button type="submit" class="sc-send">Send to staff</button>' +
            '<button type="button" class="sc-action" id="scNewCancel">Back</button></div></form>';
        var body = root.querySelector("#scNewBody");
        if (prefill) body.value = prefill;
        // choosing a topic tells the customer what to include
        root.querySelectorAll('input[name="scTopic"]').forEach(function (r) {
            r.addEventListener("change", function () {
                body.placeholder = Api.supportTopic(r.value).placeholder;
                root.querySelector("#scNewError").hidden = true;
            });
        });
        root.querySelector('input[name="scTopic"]').focus();
        root.querySelector("#scNewCancel").addEventListener("click", function () { showList(); });
        root.querySelector("#scNewForm").addEventListener("submit", async function (e) {
            e.preventDefault();
            var text = body.value.trim();
            var err = root.querySelector("#scNewError");
            var chosen = root.querySelector('input[name="scTopic"]:checked');
            if (!chosen) { err.textContent = "Choose what you need help with."; err.hidden = false; root.querySelector('input[name="scTopic"]').focus(); return; }
            if (!text) { err.textContent = "Please write a message."; err.hidden = false; body.focus(); return; }
            var transcript = window.SupportChat ? SupportChat.turns().slice(-10).map(function (t) {
                return { role: t.role, content: String(t.role === "user" ? t.content : t.reply.text).slice(0, 1000) };
            }).filter(function (t) { return t.content; }) : [];
            while (transcript.length && transcript[0].role !== "user") transcript.shift();
            try {
                var created = await Api.support.create(text, transcript, chosen.value);
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
        root.innerHTML = '<div class="sc-thread-head" id="scThreadHead" aria-live="polite"></div><div class="sc-messages" id="scThreadMsgs" aria-live="polite"></div>' +
            '<form class="sc-form" id="scReplyForm"><textarea class="sc-input" id="scReplyBody" rows="1" maxlength="2000" placeholder="Write a reply…" aria-label="Your reply"></textarea>' +
            '<button type="submit" class="sc-send">Send</button></form>' +
            '<div class="sc-form" style="padding-top:0;"><button type="button" class="sc-action" id="scBack">← All conversations</button></div>';
        root.querySelector("#scBack").addEventListener("click", function () { showList(); });
        current = { id: id, subject: "", topic: "other", status: "open", lastId: 0 };

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
        var st = status || current.status;
        var notes = { open: "Waiting for our staff to reply.", answered: "Our staff replied. You can answer here.", closed: "This conversation is closed. Start a new one if you still need help." };
        el.innerHTML = (current.subject ? '<p class="sc-thread-title">' + esc(current.subject) + "</p>" : "") +
            '<div class="sc-thread-tags">' + tag(current.topic) + pill(st) + "</div>" +
            '<p class="sc-thread-note' + (error ? " is-error" : "") + '">' + esc(error || notes[st] || "") + "</p>";
        if (form) form.hidden = st === "closed";
    }

    async function poll(first) {
        if (view !== "thread" || !current || document.hidden && !first) return;
        try {
            var data = await Api.support.get(current.id, current.lastId);
            if (view !== "thread") return;
            current.subject = data.thread.subject;
            current.topic = data.thread.topic;
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
