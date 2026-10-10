// admin-support.js — the support inbox for CSKH staff: waiting conversations, reading, replying, closing.
// The list and the open conversation refresh by themselves, and a heartbeat tells customers someone is online.

Auth.requirePermission("support.view");

(function () {

    var LIST_POLL_MS = 10000;
    var THREAD_POLL_MS = 4000;
    var HEARTBEAT_MS = 30000;
    var esc = Api.escapeHtml;

    var statusFilter = "open";
    var openId = null;       // id of the conversation on the right
    var lastMessageId = 0;
    var canReply = Auth.hasPermission("support.reply");

    function el(id) { return document.getElementById(id); }

    function time(iso) {
        return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }

    // ---------- list

    async function loadList() {
        try {
            var threads = await Api.adminSupport.list(statusFilter || undefined);
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
        } catch (e) { /* counts are decoration */ }
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
                '<span class="support-item-subject">' + esc(t.subject) + "</span>" +
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

        loadList();
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
