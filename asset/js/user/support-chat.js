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

    // Volt drawn inline so its eyes can blink and its antenna bulb can glow while it thinks.
    var VOLT = '<svg viewBox="0 0 64 64" aria-hidden="true" class="volt">' +
        '<g class="volt-antenna"><line x1="32" y1="11" x2="32" y2="5" stroke="#151b1a" stroke-width="2.2" stroke-linecap="round"/>' +
        '<circle class="volt-bulb" cx="32" cy="4.5" r="3.2" fill="#f2a516"/></g>' +
        '<rect x="5" y="25" width="6" height="12" rx="3" fill="#084f4b"/><rect x="53" y="25" width="6" height="12" rx="3" fill="#084f4b"/>' +
        '<rect x="9" y="10" width="46" height="40" rx="15" fill="#0b6b66"/><rect x="15" y="17" width="34" height="25" rx="9" fill="#e9f4f2"/>' +
        '<g class="volt-glance"><g class="volt-eyes"><ellipse cx="25" cy="27.5" rx="2.7" ry="3.3" fill="#151b1a"/><ellipse cx="39" cy="27.5" rx="2.7" ry="3.3" fill="#151b1a"/></g></g>' +
        '<circle cx="20.5" cy="33" r="2.2" fill="#f4a58a"/><circle cx="43.5" cy="33" r="2.2" fill="#f4a58a"/>' +
        '<path d="M27.5 34q4.5 3.6 9 0" fill="none" stroke="#151b1a" stroke-width="2.2" stroke-linecap="round"/>' +
        '<rect x="24" y="50" width="16" height="7" rx="3.5" fill="#084f4b"/></svg>';

    function avatar(mood) {
        return '<img class="sc-ava" src="../asset/brand/mascot' + (mood ? "-" + mood : "") + '.svg" alt="" width="30" height="30">';
    }

    function money(n) {
        return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
    }

    // ---------- rendering

    // One message. Volt's messages carry its face on the left; "extra" (a comparison card) sits under the bubble.
    function bubble(who, html, mine, mood, extra) {
        var wrap = document.createElement("div");
        wrap.className = "sc-msg" + (mine ? " sc-msg--me" : " sc-msg--bot");
        var label = '<span class="visually-hidden">' + esc(mine ? "You:" : (who || "Volt") + ":") + "</span>";
        wrap.innerHTML = mine
            ? label + '<div class="sc-bubble">' + html + "</div>"
            : avatar(mood) + '<div class="sc-col">' + label + '<div class="sc-bubble">' + html + "</div>" + (extra || "") + "</div>";
        messagesEl.appendChild(wrap);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return wrap;
    }

    function cap(s) {
        s = String(s);
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    // A card under the reply: one column per product, labels in a narrow column that never breaks words.
    function comparisonTable(c) {
        var head = c.products.map(function (p) {
            return '<th scope="col"><a href="' + esc(p.url) + '">' + esc(p.name) + "</a></th>";
        }).join("");
        var rows = c.rows.map(function (r) {
            var cells = r.values.map(function (v) {
                var text = r.label === "Price" ? money(v) : cap(v);
                return "<td" + (r.label === "Price" ? ' class="sc-price"' : "") + ">" + esc(text) + "</td>";
            }).join("");
            return '<tr><th scope="row">' + esc(r.label) + "</th>" + cells + "</tr>";
        }).join("");
        return '<div class="sc-compare" tabindex="0" aria-label="Product comparison"><table><thead><tr><td></td>' + head + "</tr></thead><tbody>" + rows + "</tbody></table></div>";
    }

    function actionButtons(reply) {
        var user = currentUser();
        var out = [];
        if (reply.type === "login" || (reply.actions || []).indexOf("login") !== -1) {
            out.push('<a class="sc-action" href="' + esc(loginUrl()) + '" data-auth="login">Sign in / Đăng nhập</a>');
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
            html += '<div class="sc-source"><span class="ms">menu_book</span>' + reply.sources.slice(0, 2).map(function (s) { return esc(s.title.split(" / ")[0]); }).join(", ") + "</div>";
        }
        html += actionButtons(reply);
        var wrap = bubble("Volt", html, false, "", reply.comparison ? comparisonTable(reply.comparison) : "");
        var staffBtn = wrap.querySelector('[data-act="staff"]');
        if (staffBtn) staffBtn.addEventListener("click", function () { window.SupportThreads.open(turns); });
    }

    function renderAll() {
        messagesEl.innerHTML = "";
        bubble("Volt", "Hi, I'm <strong>Volt</strong>. Ask me about delivery, returns, payments and coupons, or have me compare two products.<span class=\"sc-vi\">Mình trả lời được cả tiếng Việt.</span>", false, "happy");
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
        messagesEl.lastChild.querySelector(".sc-col").appendChild(chips);
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
        var thinking = bubble("Volt", '<span class="thinking">' + UI.loader(22, "Volt is thinking") + '<span class="typing">Volt is thinking</span></span>', false);
        panel.classList.add("is-thinking");

        try {
            var messages = turns.slice(-MAX_SENT).map(function (t) {
                return { role: t.role, content: t.role === "user" ? t.content : t.reply.text };
            });
            // The API wants the conversation to start with the customer.
            while (messages.length && messages[0].role !== "user") messages.shift();
            var data = await Api.request("POST", "/assistant/chat", { messages: messages });
            thinking.remove();
            panel.classList.remove("is-thinking");
            turns.push({ role: "assistant", content: data.text, reply: data });
            renderReply(data);
        } catch (e) {
            thinking.remove();
            panel.classList.remove("is-thinking");
            turns.pop();
            bubble("Volt", esc(e.status === 429
                ? "You are sending messages too fast. Please wait a moment. / Bạn gửi quá nhanh, vui lòng chờ một chút."
                : "Sorry, I could not answer right now. Please try again. / Xin lỗi, hiện mình chưa trả lời được."), false, "sad");
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
        launcher.setAttribute("aria-label", "Open support chat with Volt");
        launcher.innerHTML = '<span class="sc-face">' + VOLT + '</span><span>Ask Volt</span><span class="sc-badge" id="scBadge" hidden></span>';

        panel = document.createElement("section");
        panel.className = "sc-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", "Support chat");
        panel.innerHTML =
            '<div class="sc-header"><span class="sc-face sc-face--head">' + VOLT + '</span><div class="sc-title">Volt<span class="sc-subtitle">EC SHOP assistant · staff reply here too</span></div>' +
            '<button type="button" class="sc-close" aria-label="Close chat"><span class="ms">close</span></button></div>' +
            '<div class="sc-tabs" role="tablist" id="scTabs" hidden>' +
            '<button type="button" role="tab" class="sc-tab" id="scTabBot" aria-selected="true">Assistant</button>' +
            '<button type="button" role="tab" class="sc-tab" id="scTabStaff" aria-selected="false">Staff <span class="sc-badge" id="scStaffBadge" hidden></span></button></div>' +
            '<div class="sc-bot" id="scBot"><div class="sc-messages" id="scMessages" aria-live="polite"></div>' +
            '<form class="sc-form" id="scForm"><textarea class="sc-input" id="scInput" rows="1" maxlength="1000" placeholder="Ask Volt…" aria-label="Your message"></textarea>' +
            '<button type="submit" class="sc-send" id="scSend" aria-label="Send"><span class="ms">send</span></button></form></div>' +
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
