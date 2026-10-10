// support-chat.js — the support assistant on the customer pages: a floating button and a chat panel.
// The bot answers policy questions and compares products. Talking to staff is added by support-threads.js.

var SupportChat = (function () {

    var HISTORY_KEY = "ecshop_support_chat";
    var MAX_SENT = 10;
    var esc = Api.escapeHtml;

    function currentUser() {
        try { return JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { return null; }
    }

    var turns = [];          // what the customer and the bot have said; kept for the browser session
    var panel, messagesEl, inputEl, sendBtn, launcher, botBox;
    var busy = false;

    function load() {
        try { turns = JSON.parse(sessionStorage.getItem(HISTORY_KEY) || "[]"); } catch (e) { turns = []; }
    }

    function save() {
        try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(turns.slice(-40))); } catch (e) { /* private mode */ }
    }

    function money(n) {
        return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
    }

    // ---------- rendering

    function bubble(who, html, mine) {
        var wrap = document.createElement("div");
        wrap.className = "sc-msg" + (mine ? " sc-msg--me" : "");
        wrap.innerHTML = (who ? '<div class="sc-who">' + esc(who) + "</div>" : "") + '<div class="sc-bubble">' + html + "</div>";
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return wrap;
    }

    function comparisonTable(c) {
        var head = c.products.map(function (p) {
            return '<th scope="col"><a href="' + esc(p.url) + '">' + esc(p.name) + "</a></th>";
        }).join("");
        var rows = c.rows.map(function (r) {
            var cells = r.values.map(function (v) {
                return "<td>" + esc(r.label === "Price" ? money(v) : v) + "</td>";
            }).join("");
            return '<tr><td scope="row">' + esc(r.label) + "</td>" + cells + "</tr>";
        }).join("");
        return '<div class="sc-compare"><table><thead><tr><th></th>' + head + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    }

    function actionButtons(reply) {
        var user = currentUser();
        var out = [];
        if (reply.type === "login" || (reply.actions || []).indexOf("login") !== -1) {
            out.push('<a class="sc-action" href="' + esc(loginUrl()) + '">Sign in / Đăng nhập</a>');
        }
        var wantsStaff = reply.type === "handoff" || (reply.actions || []).indexOf("handoff") !== -1;
        if (wantsStaff && user && user.role === "customer" && window.SupportThreads) {
            out.push('<button type="button" class="sc-action" data-act="staff">Talk to staff / Gặp nhân viên</button>');
        }
        return out.length ? '<div class="sc-actions">' + out.join("") + "</div>" : "";
    }

    function loginUrl() {
        var inCustomer = location.pathname.indexOf("/customer/") !== -1;
        return (inCustomer ? "" : "../customer/") + "login.html";
    }

    function renderReply(reply) {
        var html = esc(reply.text);
        if (reply.sources && reply.sources.length) {
            html += '<div class="sc-source">Source: ' + reply.sources.slice(0, 2).map(function (s) { return esc(s.title.split(" / ")[0]); }).join(", ") + "</div>";
        }
        var wrap = bubble("EC SHOP Assistant", html, false);
        var bubbleEl = wrap.querySelector(".sc-bubble");
        if (reply.comparison) bubbleEl.insertAdjacentHTML("beforeend", comparisonTable(reply.comparison));
        bubbleEl.insertAdjacentHTML("beforeend", actionButtons(reply));
        var staffBtn = bubbleEl.querySelector('[data-act="staff"]');
        if (staffBtn) staffBtn.addEventListener("click", function () { window.SupportThreads.open(turns); });
    }

    function renderAll() {
        messagesEl.innerHTML = "";
        bubble("EC SHOP Assistant", esc("Hi! I can answer questions about shipping, returns, payments and coupons, and compare products - for example \"iPhone 17 Pro vs Galaxy S25 Ultra\". " +
            "Xin chào! Mình trả lời về giao hàng, đổi trả, thanh toán, mã giảm giá và so sánh sản phẩm."), false);
        var chips = document.createElement("div");
        chips.className = "sc-chips";
        [["Return policy", "What is your return policy?"], ["Shipping", "How much is shipping and how long does it take?"], ["Compare phones", "Compare iPhone 17 Pro and Galaxy S25 Ultra"], ["Talk to staff", "I want to talk to a person"]].forEach(function (c) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "sc-chip";
            b.textContent = c[0];
            b.addEventListener("click", function () { ask(c[1]); });
            chips.appendChild(b);
        });
        messagesEl.appendChild(chips);
        turns.forEach(function (t) {
            if (t.role === "user") bubble("", esc(t.content), true);
            else if (t.reply) renderReply(t.reply);
        });
    }

    // ---------- talking to the bot

    async function ask(text) {
        text = (text || "").trim();
        if (!text || busy) return;
        busy = true;
        sendBtn.disabled = true;
        inputEl.value = "";

        turns.push({ role: "user", content: text });
        bubble("", esc(text), true);
        var thinking = bubble("EC SHOP Assistant", "…", false);

        try {
            var messages = turns.slice(-MAX_SENT).map(function (t) {
                return { role: t.role, content: t.role === "user" ? t.content : t.reply.text };
            });
            // The API wants the conversation to start with the customer.
            while (messages.length && messages[0].role !== "user") messages.shift();
            var data = await Api.request("POST", "/assistant/chat", { messages: messages });
            thinking.remove();
            turns.push({ role: "assistant", content: data.text, reply: data });
            renderReply(data);
        } catch (e) {
            thinking.remove();
            turns.pop();
            bubble("EC SHOP Assistant", esc(e.status === 429
                ? "You are sending messages too fast. Please wait a moment. / Bạn gửi quá nhanh, vui lòng chờ một chút."
                : "Sorry, I could not answer right now. Please try again. / Xin lỗi, hiện mình chưa trả lời được."), false);
        } finally {
            busy = false;
            sendBtn.disabled = false;
            save();
            inputEl.focus();
        }
    }

    // ---------- panel

    function open() {
        panel.classList.add("sc-open");
        launcher.style.display = "none";
        inputEl.focus();
    }

    function close() {
        panel.classList.remove("sc-open");
        launcher.style.display = "";
        launcher.focus();
    }

    function build() {
        launcher = document.createElement("button");
        launcher.type = "button";
        launcher.className = "sc-launcher";
        launcher.setAttribute("aria-label", "Open support chat");
        launcher.innerHTML = '<span class="ms" aria-hidden="true">forum</span><span>Support</span><span class="sc-badge" id="scBadge" hidden></span>';

        panel = document.createElement("section");
        panel.className = "sc-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Support chat");
        panel.innerHTML =
            '<div class="sc-header"><div class="sc-title">EC SHOP Support<span class="sc-subtitle">Assistant 24/7 · staff replies when available</span></div>' +
            '<button type="button" class="sc-close" aria-label="Close chat"><span class="ms">close</span></button></div>' +
            '<div class="sc-tabs" role="tablist" id="scTabs" hidden>' +
            '<button type="button" role="tab" class="sc-tab" id="scTabBot" aria-selected="true">Assistant</button>' +
            '<button type="button" role="tab" class="sc-tab" id="scTabStaff" aria-selected="false">Staff <span class="sc-badge" id="scStaffBadge" hidden></span></button></div>' +
            '<div class="sc-bot" id="scBot"><div class="sc-messages" id="scMessages" aria-live="polite"></div>' +
            '<form class="sc-form" id="scForm"><textarea class="sc-input" id="scInput" rows="1" maxlength="1000" placeholder="Ask a question…" aria-label="Your message"></textarea>' +
            '<button type="submit" class="sc-send" id="scSend">Send</button></form></div>' +
            '<div class="sc-staff" id="scStaff"></div>';

        document.body.appendChild(launcher);
        document.body.appendChild(panel);

        messagesEl = panel.querySelector("#scMessages");
        inputEl = panel.querySelector("#scInput");
        sendBtn = panel.querySelector("#scSend");
        botBox = panel.querySelector("#scBot");

        launcher.addEventListener("click", open);
        panel.querySelector(".sc-close").addEventListener("click", close);
        panel.querySelector("#scForm").addEventListener("submit", function (e) { e.preventDefault(); ask(inputEl.value); });
        inputEl.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(inputEl.value); }
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && panel.classList.contains("sc-open")) close();
        });
    }

    function init() {
        load();
        build();
        renderAll();
    }

    document.addEventListener("DOMContentLoaded", init);

    return { open: open, close: close, ask: ask, panel: function () { return panel; }, turns: function () { return turns; } };

})();
