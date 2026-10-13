// admin-support.js — the support inbox for CSKH staff: waiting conversations, reading, replying, closing.
// The list and the open conversation update live, and a heartbeat tells customers someone is online.

Auth.requirePermission("support.view");

(function () {

    // changes arrive live over /api/admin/support/stream; polling is only the fallback
    var LIST_POLL_MS = 60000;
    var THREAD_POLL_MS = 20000;
    var HEARTBEAT_MS = 30000;
    var esc = Api.escapeHtml;

    var statusFilter = "open";
    var topicFilter = null;  // "mine" | "all" | a topic id; chosen from the first summary
    var mineTopics = [];     // the topics of this staff member; empty means every topic
    var byTopic = {};        // waiting conversations per topic
    var openId = null;       // id of the conversation on the right
    var lastMessageId = 0;
    var canReply = Auth.hasPermission("support.reply");

    function el(id) { return document.getElementById(id); }

    function time(iso) {
        return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    // ---------- list

    function topicTag(id) {
        var t = Api.supportTopic(id);
        return '<span class="support-tag"><i class="fa-solid ' + t.fa + '" aria-hidden="true"></i>' + esc(t.label) + "</span>";
    }

    async function loadList() {
        try {
            var threads = await Api.adminSupport.list(statusFilter || undefined, topicFilter && topicFilter !== "all" ? topicFilter : undefined);
            renderList(threads);
        } catch (e) {
            el("threadList").innerHTML = "";
            el("listEmpty").textContent = "Could not load conversations: " + e.message;
            el("listEmpty").hidden = false;
        }
        loadCounts();
    }

    async function loadCounts() {
        try {
            var s = await Api.adminSupport.summary();
            el("countOpen").textContent = s.open;
            el("countAnswered").textContent = s.answered;
            mineTopics = s.mine;
            byTopic = s.byTopic;
            // a position that handles some topics starts on them; the lead and generalists start on everything
            if (topicFilter === null) topicFilter = mineTopics.length ? "mine" : "all";
            renderTopicFilter(s.open);
        } catch (e) { /* counts are decoration */ }
    }

    function renderTopicFilter(totalOpen) {
        var sum = function (ids) { return ids.reduce(function (n, id) { return n + (byTopic[id] || 0); }, 0); };
        var chips = [];
        if (mineTopics.length) chips.push(["mine", "My topics", sum(mineTopics)]);
        chips.push(["all", "All topics", totalOpen]);
        Api.supportTopics.forEach(function (t) { chips.push([t.id, t.label, byTopic[t.id] || 0]); });
        el("topicFilter").innerHTML = chips.map(function (c) {
            return '<button type="button" class="support-topic-chip" data-topic="' + c[0] + '" aria-pressed="' + (topicFilter === c[0]) + '">' + esc(c[1]) +
                (c[2] ? ' <span class="support-count">' + c[2] + "</span>" : "") + "</button>";
        }).join("");
        el("topicFilter").querySelectorAll(".support-topic-chip").forEach(function (b) {
            b.addEventListener("click", function () { topicFilter = b.dataset.topic; loadList(); });
        });
    }

    function renderList(threads) {
        var box = el("threadList");
        el("listEmpty").hidden = threads.length > 0;
        el("listEmpty").textContent = "No conversations here.";
        box.innerHTML = threads.map(function (t) {
            var last = t.lastMessage ? (t.lastMessage.authorType === "agent" ? "You: " : "") + t.lastMessage.body : "";
            return '<button type="button" class="support-item" data-id="' + t.id + '"' + (t.id === openId ? ' aria-current="true"' : "") + ">" +
                '<span class="support-item-top"><span class="support-item-name">' + esc(t.customer.name) + "</span>" +
                '<span class="support-item-time">' + esc(time(t.updatedAt)) + "</span></span>" +
                '<span class="support-item-subject">' + esc(t.subject) + "</span>" + topicTag(t.topic) +
                '<span class="support-item-last">' + esc(last) + "</span></button>";
        }).join("");
        box.querySelectorAll(".support-item").forEach(function (b) {
            b.addEventListener("click", function () { openThread(Number(b.dataset.id)); });
        });
    }

    // ---------- one conversation

    function messageHtml(m) {
        var staff = m.authorType === "agent";
        return '<div class="support-msg' + (staff ? " support-msg--staff" : "") + '" data-id="' + m.id + '">' +
            '<div class="support-who">' + esc(staff ? (m.authorName || "Staff") + " (staff)" : (el("threadMeta").dataset.customer || "Customer")) + "</div>" +
            '<div class="support-bubble">' + esc(m.body) + '</div><div class="support-time">' + esc(time(m.createdAt)) + "</div></div>";
    }

    function setStatus(status) {
        var badge = el("threadStatus");
        var label = { open: "Waiting", answered: "Answered", closed: "Closed" }[status] || status;
        badge.textContent = label;
        badge.className = "badge " + ({ open: "badge-pending", answered: "badge-confirmed", closed: "badge-cancelled" }[status] || "");
        var closed = status === "closed";
        el("threadTopic").disabled = closed || !canReply;
        el("replyForm").hidden = closed || !canReply;
        el("btnClose").hidden = closed || !canReply;
    }

    async function openThread(id) {
        openId = id;
        lastMessageId = 0;
        el("detailPlaceholder").hidden = true;
        el("threadPane").hidden = false;
        el("threadMessages").innerHTML = "";
        document.querySelectorAll(".support-item").forEach(function (b) {
            b.setAttribute("aria-current", String(Number(b.dataset.id) === id));
        });
        await refreshThread(true);
        el("replyBody").focus();
    }

    // `force` updates even when the tab is in the background (used right after the staff member acts).
    async function refreshThread(first, force) {
        if (!openId || (document.hidden && !first && !force)) return;
        var id = openId;
        try {
            var t = await Api.adminSupport.get(id, lastMessageId);
            if (id !== openId) return; // another conversation was opened meanwhile

            el("threadSubject").textContent = t.subject;
            var meta = el("threadMeta");
            meta.dataset.customer = t.customer.name;
            meta.textContent = t.customer.name + " · " + t.customer.email + (t.assignedTo ? " · handled by " + t.assignedTo : "");
            setStatus(t.status);
            el("threadTopic").value = t.topic;

            if (first) {
                el("botBox").hidden = !t.botTranscript.length;
                el("botTranscript").innerHTML = t.botTranscript.map(function (turn) {
                    return "<p><strong>" + (turn.role === "user" ? esc(t.customer.name) : "Assistant") + ":</strong> " + esc(turn.content) + "</p>";
                }).join("");
            }

            var box = el("threadMessages");
            var stick = first || box.scrollHeight - box.scrollTop - box.clientHeight < 40;
            t.messages.forEach(function (m) {
                if (m.id <= lastMessageId || box.querySelector('[data-id="' + m.id + '"]')) return;
                box.insertAdjacentHTML("beforeend", messageHtml(m));
                lastMessageId = m.id;
            });
            if (stick) box.scrollTop = box.scrollHeight;
        } catch (e) {
            if (e.status === 404) { openId = null; el("threadPane").hidden = true; el("detailPlaceholder").hidden = false; }
        }
    }

    async function sendReply() {
        var body = el("replyBody").value.trim();
        if (!body || !openId) return;
        el("btnReply").disabled = true;
        try {
            await Api.adminSupport.reply(openId, body);
            el("replyBody").value = "";
            await refreshThread(false, true);
            await loadList();
        } catch (e) {
            alert(e.message);
        } finally {
            el("btnReply").disabled = false;
        }
    }

    // the customer may have picked the wrong topic: moving the conversation hands it to the right position
    async function changeTopic() {
        var select = el("threadTopic");
        if (!openId) return;
        try {
            await Api.adminSupport.setTopic(openId, select.value);
            await loadList();
        } catch (e) {
            alert(e.message);
            refreshThread(false, true);
        }
    }

    async function closeThread() {
        if (!openId || !confirm("Close this conversation? The customer will have to start a new one to write again.")) return;
        try {
            await Api.adminSupport.close(openId);
            await refreshThread(false, true);
            await loadList();
        } catch (e) {
            alert(e.message);
        }
    }

    // ---------- live updates

    var listTimer = null;
    // several events can land at once (a reply also changes the list); refresh the list once
    function soonLoadList() {
        clearTimeout(listTimer);
        listTimer = setTimeout(loadList, 300);
    }

    function listenLive() {
        if (!window.EventSource) return;
        var es = new EventSource("/api/admin/support/stream");
        var dropped = false;
        es.addEventListener("error", function () { dropped = true; });
        es.addEventListener("open", function () {
            if (!dropped) return;
            dropped = false;
            // events sent while offline are not replayed
            soonLoadList();
            refreshThread(false, true);
        });
        es.addEventListener("support", function (e) {
            var d = JSON.parse(e.data);
            soonLoadList();
            if (d.threadId === openId) refreshThread(false, true);
        });
    }

    // ---------- start-up

    function init() {
        var user = Auth.getCurrentUser();
        if (user) {
            el("topbarUserName").textContent = user.name;
            el("topbarAvatar").textContent = (user.name || "A").charAt(0).toUpperCase();
        }

        document.querySelectorAll("#supportTabs .filter-tab").forEach(function (btn) {
            btn.addEventListener("click", function () {
                document.querySelectorAll("#supportTabs .filter-tab").forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");
                statusFilter = btn.dataset.status;
                loadList();
            });
        });

        el("replyForm").addEventListener("submit", function (e) { e.preventDefault(); sendReply(); });
        el("replyBody").addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(); }
        });
        el("btnClose").addEventListener("click", closeThread);
        el("threadTopic").innerHTML = Api.supportTopics.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label) + "</option>"; }).join("");
        el("threadTopic").addEventListener("change", changeTopic);

        // the first summary decides which topics to start on, then the list loads
        loadCounts().then(loadList);
        listenLive();
        setInterval(function () { if (!document.hidden) loadList(); }, LIST_POLL_MS);
        setInterval(function () { refreshThread(false); }, THREAD_POLL_MS);

        if (canReply) {
            var beat = function () { Api.adminSupport.heartbeat().catch(function () { /* offline briefly */ }); };
            beat();
            setInterval(beat, HEARTBEAT_MS);
        }
    }

    init();

})();
