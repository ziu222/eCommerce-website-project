// support-page.js — customer/support.html: the customer's conversations with the support staff, as a messaging screen.
//
//   support.html               the list (and, on a wide screen, a hint on the right)
//   support.html?thread=12     one conversation
//   support.html?new=1         the new message form; &topic=orders picks a topic
//
// Every step is a history entry, so the phone's back button goes from a conversation to the list.
// New messages arrive live (support:change from ui.js); polling is only the fallback.

(function () {

    var esc = Api.escapeHtml;
    var POLL_THREAD_MS = 20000;
    var POLL_LIST_MS = 60000;
    var TRANSCRIPT_KEY = "ecshop_support_transcript"; // the bot chat, saved by the Volt widget's "Talk to staff"
    var STATUS_LABEL = { open: "Waiting for staff", answered: "Staff replied", closed: "Closed" };
    var NOTE = {
        open: "Waiting for our staff to reply.",
        answered: "Our staff replied. You can answer here.",
        closed: "This conversation is closed. Start a new message if you still need help."
    };

    var shell, listBox, pane;
    var current = null;     // the open conversation: { id, subject, topic, status, lastId }
    var footStatus = null;  // the status the footer (composer or closed notice) was drawn for
    var pollTimer = null;
    var threads = [];

    function $(id) { return document.getElementById(id); }

    // list | thread | new. On a phone only the list shows the site header; a conversation takes the whole screen.
    function setView(view) {
        shell.dataset.view = view;
        document.body.classList.toggle("sp-focus", view !== "list");
        fitUnderHeader();
    }

    function session() {
        try { return JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { return null; }
    }

    function time(iso) {
        return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    function tag(topicId) {
        var t = Api.supportTopic(topicId);
        return '<span class="sp-tag"><span class="ms" aria-hidden="true">' + t.ms + "</span>" + esc(t.label) + "</span>";
    }

    function pill(status) {
        return '<span class="sp-pill sp-pill--' + status + '">' + esc(STATUS_LABEL[status] || status) + "</span>";
    }

    // ---------- navigation

    function go(search, replace) {
        history[replace ? "replaceState" : "pushState"](null, "", "support.html" + search);
        route(true);
    }

    function route(moved) {
        var q = new URLSearchParams(location.search);
        stopPolling();
        if (q.get("thread")) showThread(Number(q.get("thread")), moved);
        else if (q.get("new")) showNew(q.get("topic"), moved);
        else showHint();
    }

    // internal links ("New message", "Start a new message") stay on the page
    function bindLinks(root) {
        root.querySelectorAll("a[data-go]").forEach(function (a) {
            a.addEventListener("click", function (e) {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                go(a.getAttribute("data-go"));
            });
        });
    }

    function backButton() {
        return '<button type="button" class="sp-back" id="spBack" aria-label="Back to conversations"><span class="ms" aria-hidden="true">chevron_left</span></button>';
    }

    function wireBack() {
        var b = $("spBack");
        if (b) b.addEventListener("click", function () { go(""); });
    }

    // On a phone the pane takes over the screen; move the screen reader to it too.
    function arrive(moved) {
        if (moved) pane.focus({ preventScroll: true });
    }

    // ---------- the list

    function setSelected() {
        listBox.querySelectorAll(".sp-thread").forEach(function (b) {
            b.setAttribute("aria-current", String(!!current && Number(b.dataset.id) === current.id));
        });
    }

    async function loadList() {
        try {
            threads = await Api.support.list();
        } catch (e) {
            if (e.status === 401) { UI.requireLogin(); return; }
            listBox.innerHTML = '<p class="sp-empty">Could not load your conversations. Please try again.</p>';
            return;
        }
        if (!threads.length) {
            listBox.innerHTML = '<p class="sp-empty">No conversations yet. Tell us what you need and the right person will reply here.</p>';
            return;
        }
        listBox.innerHTML = threads.map(function (t) {
            return '<button type="button" class="sp-thread' + (t.unread ? " is-unread" : "") + '" data-id="' + t.id + '">' +
                '<span class="sp-thread-top"><strong>' + esc(t.subject) + "</strong><time>" + esc(time(t.updatedAt)) + "</time></span>" +
                '<span class="sp-thread-last">' + esc(t.lastMessage) + "</span>" +
                '<span class="sp-thread-tags">' + tag(t.topic) + pill(t.status) +
                (t.unread ? '<span class="sp-badge" aria-label="' + t.unread + ' unread">' + t.unread + "</span>" : "") + "</span></button>";
        }).join("");
        listBox.querySelectorAll(".sp-thread").forEach(function (b) {
            b.addEventListener("click", function () { go("?thread=" + b.dataset.id); });
        });
        setSelected();
    }

    // ---------- the right side: a hint when nothing is open (wide screens only; a phone shows the list)

    function showHint() {
        current = null;
        setView("list");
        pane.innerHTML = '<div class="sp-placeholder"><span class="ms" aria-hidden="true">forum</span><h2>Talk to our team</h2>' +
            '<p>Pick a conversation to read it, or tell us what you need and the right person will reply here.</p>' +
            '<a class="btn btn-primary" href="support.html?new=1" data-go="?new=1">New message</a></div>';
        bindLinks(pane);
        setSelected();
    }

    // ---------- one conversation

    function messageHtml(m) {
        var mine = m.authorType === "customer";
        return '<div class="sp-msg' + (mine ? " sp-msg--me" : "") + '" data-id="' + m.id + '">' +
            '<div class="sp-who">' + (mine ? "You" : esc(m.authorName || "Support") + " · staff") + "</div>" +
            '<div class="sp-bubble">' + esc(m.body) + '</div><div class="sp-time">' + esc(time(m.createdAt)) + "</div></div>";
    }

    async function showThread(id, moved) {
        setView("thread");
        current = { id: id, subject: "", topic: "other", status: "open", lastId: 0 };
        footStatus = null;
        pane.innerHTML = '<div class="sp-pane-head">' + backButton() + '<div class="sp-pane-title" id="spHead"></div></div>' +
            '<div class="sp-messages" id="spMsgs" role="log" aria-label="Messages"></div><div id="spFoot"></div>';
        wireBack();
        setSelected();
        arrive(moved);
        await refreshThread(true);
        if (current && current.id === id) pollTimer = setInterval(function () { if (!document.hidden) refreshThread(); }, POLL_THREAD_MS);
    }

    function renderHead(error) {
        var head = $("spHead");
        if (!head || !current) return;
        head.innerHTML = '<h2>' + esc(current.subject) + "</h2>" +
            '<div class="sp-thread-tags">' + tag(current.topic) + pill(current.status) + "</div>" +
            '<p class="sp-pane-note' + (error ? " is-error" : "") + '">' + esc(error || NOTE[current.status] || "") + "</p>";
    }

    // The composer is drawn once per status, so what the customer is typing survives a refresh.
    function renderFoot() {
        var foot = $("spFoot");
        if (!foot || !current || footStatus === current.status) return;
        footStatus = current.status;
        if (current.status === "closed") {
            foot.innerHTML = '<div class="sp-closed"><span>This conversation is closed.</span>' +
                '<a class="btn btn-primary btn-sm" href="support.html?new=1&topic=' + current.topic + '" data-go="?new=1&amp;topic=' + current.topic + '">Start a new message</a></div>';
            bindLinks(foot);
            return;
        }
        foot.innerHTML = '<form class="sp-composer" id="spComposer"><textarea id="spReply" rows="1" maxlength="2000" placeholder="Write a reply…" aria-label="Your reply"></textarea>' +
            '<button type="submit" class="btn btn-primary"><span class="ms" aria-hidden="true">send</span>Send</button></form>';
        var box = $("spReply");
        box.addEventListener("input", function () {
            box.style.height = "auto";
            box.style.height = Math.min(box.scrollHeight, 140) + "px";
        });
        box.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("spComposer").requestSubmit(); }
        });
        $("spComposer").addEventListener("submit", async function (e) {
            e.preventDefault();
            var text = box.value.trim();
            if (!text || !current) return;
            try {
                await Api.support.reply(current.id, text);
                box.value = "";
                box.style.height = "auto";
                await refreshThread();
            } catch (ex) {
                if (ex.status === 409) { current.status = "closed"; renderHead(ex.message); renderFoot(); }
                else renderHead(ex.message || "Could not send your message.");
            }
        });
        box.focus({ preventScroll: true });
    }

    async function refreshThread(first) {
        if (!current) return;
        var id = current.id;
        try {
            var data = await Api.support.get(id, current.lastId);
            if (!current || current.id !== id) return; // another screen was opened meanwhile
            current.subject = data.thread.subject;
            current.topic = data.thread.topic;
            current.status = data.thread.status;
            var box = $("spMsgs");
            if (!box) return;
            var stick = first || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
            var added = 0;
            data.messages.forEach(function (m) {
                if (m.id <= current.lastId || box.querySelector('[data-id="' + m.id + '"]')) return;
                box.insertAdjacentHTML("beforeend", messageHtml(m));
                current.lastId = m.id;
                added++;
            });
            if (stick) box.scrollTop = box.scrollHeight;
            renderHead();
            renderFoot();
            // reading a conversation marks it seen; refresh the badges in the list
            if (first || added) loadList();
        } catch (e) {
            if (e.status === 401) UI.requireLogin();
            else if (e.status === 404) go("", true);
        }
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    // ---------- new message

    function savedTranscript() {
        try {
            var t = JSON.parse(sessionStorage.getItem(TRANSCRIPT_KEY) || "[]");
            return Array.isArray(t) ? t : [];
        } catch (e) { return []; }
    }

    function showNew(topicId, moved) {
        current = null;
        setView("new");
        var transcript = savedTranscript();
        // one radio per topic; the chosen one decides which position of our staff gets the message
        var topics = Api.supportTopics.map(function (t) {
            return '<label class="sp-topic"><input type="radio" name="spTopic" value="' + t.id + '"' + (t.id === topicId ? " checked" : "") + '><span class="ms" aria-hidden="true">' + t.ms + "</span>" + esc(t.label) + "</label>";
        }).join("");
        pane.innerHTML = '<div class="sp-pane-head">' + backButton() + '<div class="sp-pane-title"><h2>New message</h2></div></div>' +
            '<form class="sp-new" id="spNewForm" novalidate>' +
            '<fieldset class="sp-topics"><legend>What do you need help with?</legend><div class="sp-topic-grid">' + topics + "</div></fieldset>" +
            '<div><label class="sp-label" for="spNewBody">Your message</label>' +
            '<textarea class="textarea" id="spNewBody" rows="5" maxlength="2000" placeholder="' + esc(Api.supportTopic(topicId || "other").placeholder) + '"></textarea></div>' +
            (transcript.length ? '<p class="sp-shared"><span class="ms" aria-hidden="true">forum</span>Your chat with the assistant is shared with our staff, so you do not have to repeat yourself.</p>' : "") +
            '<p class="sp-error" id="spNewError" role="alert" hidden></p>' +
            '<div class="sp-new-actions"><button type="submit" class="btn btn-primary btn-lg">Send to staff</button>' +
            '<button type="button" class="btn btn-ghost btn-lg" id="spCancel">Cancel</button></div></form>';
        wireBack();
        setSelected();
        arrive(moved);
        var body = $("spNewBody");
        var err = $("spNewError");
        // choosing a topic tells the customer what to include
        pane.querySelectorAll('input[name="spTopic"]').forEach(function (r) {
            r.addEventListener("change", function () { body.placeholder = Api.supportTopic(r.value).placeholder; err.hidden = true; });
        });
        $("spCancel").addEventListener("click", function () { go(""); });
        $("spNewForm").addEventListener("submit", async function (e) {
            e.preventDefault();
            var chosen = pane.querySelector('input[name="spTopic"]:checked');
            var text = body.value.trim();
            if (!chosen) { err.textContent = "Choose what you need help with."; err.hidden = false; pane.querySelector('input[name="spTopic"]').focus(); return; }
            if (!text) { err.textContent = "Please write a message."; err.hidden = false; body.focus(); return; }
            var submit = e.submitter;
            if (submit) submit.disabled = true;
            try {
                var created = await Api.support.create(text, transcript, chosen.value);
                sessionStorage.removeItem(TRANSCRIPT_KEY);
                go("?thread=" + created.id, true);
            } catch (ex) {
                err.textContent = ex.status === 401 ? "Please sign in again." : (ex.message || "Could not send your message.");
                err.hidden = false;
                if (submit) submit.disabled = false;
            }
        });
        if (!topicId) pane.querySelector('input[name="spTopic"]').focus({ preventScroll: true });
        else body.focus({ preventScroll: true });
    }

    // ---------- availability

    async function refreshAvailability() {
        var online = false;
        try { online = (await Api.support.availability()).online; } catch (e) { /* treat as away */ }
        $("spAvail").dataset.online = String(online);
        $("spAvailText").textContent = online
            ? "Our staff are online, usually a reply within minutes. / Nhân viên đang trực."
            : "Our staff are away. Leave a message and they reply here. / Hiện chưa có nhân viên trực.";
    }

    // ---------- start-up

    // The screen fills what is left under the site header, whatever its height on this device.
    function fitUnderHeader() {
        var nav = document.querySelector(".site-nav");
        if (nav) document.body.style.setProperty("--sp-top", nav.offsetHeight + "px");
    }

    function init() {
        var user = session();
        if (!user || user.role !== "customer") { UI.requireLogin(); return; }
        shell = $("spShell");
        listBox = $("spThreads");
        pane = $("spPane");

        fitUnderHeader();
        window.addEventListener("resize", fitUnderHeader);
        window.addEventListener("load", fitUnderHeader);
        if (window.ResizeObserver) {
            var nav = document.querySelector(".site-nav");
            if (nav) new ResizeObserver(fitUnderHeader).observe(nav);
        }

        $("spNew").addEventListener("click", function (e) {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            go("?new=1");
        });
        window.addEventListener("popstate", function () { route(true); });

        // live: a staff reply or closing (support:change), and what was missed while offline (live:resync)
        document.addEventListener("support:change", function (e) {
            loadList();
            if (current && current.id === e.detail.threadId) refreshThread();
        });
        document.addEventListener("live:resync", function () { loadList(); refreshThread(); });

        refreshAvailability();
        loadList();
        setInterval(function () { if (!document.hidden) { loadList(); refreshAvailability(); } }, POLL_LIST_MS);
        route(false);
    }

    document.addEventListener("DOMContentLoaded", init);
    if (document.readyState !== "loading") init();

})();
