// admin-moderation.js — the moderation queue: cases raised by the rules, the AI, customer reports and the
// backup standard; penalty appeals; banned keywords; and every moderation setting.

Auth.requirePermission("products.view");

(function () {

    var esc = Api.escapeHtml;
    var canManage = Auth.hasPermission("products.manage");
    var state = { source: "", status: "open", appealStatus: "open" };

    var SOURCE = {
        rules: { label: "Rules", icon: "fa-list-check" },
        ai: { label: "AI", icon: "fa-wand-magic-sparkles" },
        report: { label: "Customers", icon: "fa-bullhorn" },
        fallback: { label: "Needs review", icon: "fa-hourglass-half" }
    };
    var PRODUCT_STATUS = { pending: "Checking", approved: "Live", limited: "Shown lower", review: "Hidden, needs review", rejected: "Refused", suspended: "Suspended" };
    var DECIDED = { dismissed: "Dismissed", minor: "Minor", violation: "Violation", severe: "Severe" };

    // ---------- small helpers

    function ago(iso) {
        var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
        if (m < 1) return "just now";
        if (m < 60) return m + " min ago";
        if (m < 1440) return Math.floor(m / 60) + " h ago";
        return Math.floor(m / 1440) + " d ago";
    }

    function money(n) { return "$" + Number(n || 0).toLocaleString("en-US"); }

    function toast(text, isError) {
        var box = document.getElementById("toasts");
        var t = document.createElement("div");
        t.className = "live-toast" + (isError ? " is-error" : "");
        t.textContent = text;
        box.appendChild(t);
        setTimeout(function () { t.classList.add("is-leaving"); }, 3500);
        setTimeout(function () { t.remove(); }, 4000);
    }

    function empty(icon, text) {
        return '<div class="mod-empty"><i class="fa-solid ' + icon + '" aria-hidden="true"></i><p>' + text + "</p></div>";
    }

    // ---------- AI status strip and counters

    async function loadHealth() {
        var strip = document.getElementById("aiStrip");
        try {
            var h = await Api.moderation.health();
            var spent = "$" + h.spentTodayUsd.toFixed(h.spentTodayUsd < 0.01 ? 4 : 2) + " spent today";
            var waiting = h.queueDepth ? h.queueDepth + " waiting, oldest " + h.oldestWaitingMinutes + " min" : "nothing waiting";
            var copy = {
                up: ["AI check is running", spent + " · " + waiting],
                paused: ["AI check paused after repeated errors", "Retrying at " + new Date(h.breakerOpenUntil).toLocaleTimeString() + ". Trusted shops are approved provisionally; others wait. " + waiting],
                budget: ["Today's AI budget is spent", spent + ". The backup standard applies until midnight. " + waiting],
                off: ["AI check is off", "Listings are decided by the rules alone. Turn it on in Settings."]
            }[h.ai];
            strip.dataset.state = h.ai;
            document.getElementById("aiTitle").textContent = copy[0];
            document.getElementById("aiDetail").textContent = copy[1];
            loadAlerts();
        } catch (e) {
            strip.dataset.state = "paused";
            document.getElementById("aiTitle").textContent = "Could not read the moderation status";
            document.getElementById("aiDetail").textContent = e.message;
        }
    }

    // what went wrong with the AI check in the last day (paused after errors, budget reached)
    async function loadAlerts() {
        var box = document.getElementById("aiAlerts");
        var items = (await Api.moderation.alerts()).items;
        box.hidden = !items.length;
        box.innerHTML = items.map(function (a) {
            var at = new Date(a.createdAt);
            return '<div class="ai-alert"><time datetime="' + at.toISOString() + '">' + at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) + "</time>" +
                "<div><strong>" + esc(a.title) + "</strong><span>" + esc(a.message) + "</span></div></div>";
        }).join("");
    }

    async function loadCounts() {
        var all = await Api.moderation.flags({ status: "open", limit: 100 });
        var by = function (s) { return all.items.filter(function (f) { return f.source === s; }).length; };
        document.getElementById("statOpen").textContent = all.total;
        document.getElementById("statReports").textContent = by("report");
        document.getElementById("statAi").textContent = by("ai");
        document.getElementById("countQueue").textContent = all.total || "";
        var badge = document.getElementById("navOpenCases");
        badge.textContent = all.total;
        badge.hidden = !all.total;
        var appeals = await Api.moderation.appeals("open");
        document.getElementById("statAppeals").textContent = appeals.length;
        document.getElementById("countAppeals").textContent = appeals.length || "";
    }

    // ---------- queue

    function reasonsHtml(reasons, source) {
        var src = SOURCE[source] || SOURCE.rules;
        return '<ul class="mod-reasons">' + (reasons || []).map(function (r) {
            return "<li><span class=\"src src-" + source + '"><i class="fa-solid ' + src.icon + '" aria-hidden="true"></i>' + src.label + "</span>" + esc(r.message) + "</li>";
        }).join("") + "</ul>";
    }

    function decideHtml(f) {
        if (f.status !== "open") {
            return '<div class="mod-decided"><span class="badge badge-decided-' + f.status + '">' + DECIDED[f.status] + "</span>" +
                "<span>by " + esc(f.decidedBy || "system") + " · " + ago(f.decidedAt) + "</span>" +
                (f.note ? "<p>" + esc(f.note) + "</p>" : "") + "</div>";
        }
        if (!canManage) return '<div class="mod-decided"><span>You can view cases but not decide them.</span></div>';
        return '<form class="mod-decide" data-flag="' + f.id + '" novalidate>' +
            '<label class="form-label" for="note' + f.id + '">Note to the shop</label>' +
            '<textarea class="form-input mod-note" id="note' + f.id + '" rows="2" maxlength="500" placeholder="Required unless you dismiss the case"></textarea>' +
            '<div class="mod-actions">' +
            '<button type="button" class="dec dec-ok" data-d="dismiss"><i class="fa-solid fa-check"></i> Dismiss</button>' +
            '<button type="button" class="dec dec-warn" data-d="minor"><i class="fa-solid fa-pen"></i> Minor</button>' +
            '<span class="dec-group"><button type="button" class="dec dec-bad" data-d="violation"><i class="fa-solid fa-triangle-exclamation"></i> Violation</button>' +
            '<select class="dec-points" aria-label="Penalty points for a violation"><option value="1">1 pt</option><option value="2">2 pts</option></select></span>' +
            '<button type="button" class="dec dec-severe" data-d="severe"><i class="fa-solid fa-gavel"></i> Severe · 3 pts</button>' +
            "</div>" +
            '<p class="mod-err" role="alert" hidden></p>' +
            "</form>";
    }

    function caseHtml(f) {
        var p = f.product;
        var src = SOURCE[f.source] || SOURCE.rules;
        return '<article class="mod-case" data-case="' + f.id + '">' +
            '<img class="mod-thumb" src="' + esc(p.imageUrl) + '" alt="" loading="lazy" onerror="this.src=\'../asset/img/placeholder/' + esc(p.category) + '.svg\'">' +
            '<div class="mod-main">' +
            '<div class="mod-head"><span class="src-chip src-' + f.source + '"><i class="fa-solid ' + src.icon + '" aria-hidden="true"></i>' + src.label + "</span>" +
            '<span class="badge badge-ps-' + p.adminStatus + '">' + (PRODUCT_STATUS[p.adminStatus] || p.adminStatus) + "</span></div>" +
            '<h2 class="mod-name">' + esc(p.name) + "</h2>" +
            '<p class="mod-meta">' + esc(p.shop ? p.shop.shopName : "Shop #" + p.shopId) + " · " + money(p.price) + " · " + esc(p.category) +
            " · opened " + ago(f.createdAt) + (f.reports ? " · " + f.reports + " report" + (f.reports > 1 ? "s" : "") : "") + "</p>" +
            reasonsHtml(f.reasons, f.source) +
            (p.description ? '<details class="mod-desc"><summary>Listing text</summary><p>' + esc(p.description) + "</p></details>" : "") +
            "</div>" +
            decideHtml(f) +
            "</article>";
    }

    async function loadQueue() {
        var list = document.getElementById("flagList");
        list.innerHTML = '<div class="mod-loading">Loading cases…</div>';
        try {
            var page = await Api.moderation.flags({ status: state.status, source: state.source, limit: 50 });
            list.innerHTML = page.items.length ? page.items.map(caseHtml).join("") :
                empty("fa-circle-check", state.status === "open" ? "Nothing waiting. New cases appear here when the checks or customers raise them." : "No cases with this decision yet.");
        } catch (e) {
            list.innerHTML = empty("fa-circle-exclamation", "Could not load the queue: " + esc(e.message));
        }
    }

    document.getElementById("flagList").addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-d]");
        if (!btn) return;
        var form = btn.closest(".mod-decide");
        var err = form.querySelector(".mod-err");
        var note = form.querySelector(".mod-note").value.trim();
        var d = btn.dataset.d;
        err.hidden = true;
        if (d !== "dismiss" && !note) {
            err.textContent = "Write a short note so the shop knows what to fix.";
            err.hidden = false;
            form.querySelector(".mod-note").focus();
            return;
        }
        var go = async function () {
            form.querySelectorAll("button, select, textarea").forEach(function (el) { el.disabled = true; });
            try {
                var points = d === "violation" ? Number(form.querySelector(".dec-points").value) : undefined;
                var r = await Api.moderation.decide(form.dataset.flag, d, note, points);
                var card = form.closest(".mod-case");
                card.classList.add("is-leaving");
                setTimeout(function () { card.remove(); if (!document.querySelector("#flagList .mod-case")) loadQueue(); }, 280);
                toast(d === "dismiss" ? "Case dismissed, the product is shown normally" :
                    d === "minor" ? "Kept lower until the shop fixes it" :
                    "Product suspended · " + r.points + " point" + (r.points > 1 ? "s" : "") + (r.shopSuspended ? " · shop suspended" : ""));
                loadCounts();
            } catch (ex) {
                err.textContent = ex.message;
                err.hidden = false;
                form.querySelectorAll("button, select, textarea").forEach(function (el) { el.disabled = false; });
            }
        };
        if (d === "violation" || d === "severe") {
            AdminModal.confirm(d === "severe" ? "Suspend this product and give the shop 3 penalty points?" : "Suspend this product and give the shop penalty points?", go);
        } else {
            go();
        }
    });

    // ---------- appeals

    function appealHtml(a) {
        var p = a.penalty;
        var actions = a.status !== "open" ?
            '<div class="mod-decided"><span class="badge badge-decided-' + (a.status === "accepted" ? "dismissed" : "violation") + '">' + (a.status === "accepted" ? "Accepted" : "Refused") + "</span>" +
            "<span>by " + esc(a.decidedBy) + " · " + ago(a.decidedAt) + "</span>" + (a.note ? "<p>" + esc(a.note) + "</p>" : "") + "</div>" :
            !canManage ? '<div class="mod-decided"><span>You can view appeals but not decide them.</span></div>' :
            '<form class="mod-decide" data-appeal="' + a.id + '" novalidate>' +
            '<label class="form-label" for="an' + a.id + '">Reply to the shop</label>' +
            '<textarea class="form-input mod-note" id="an' + a.id + '" rows="2" maxlength="500" placeholder="Why you accept or refuse"></textarea>' +
            '<div class="mod-actions"><button type="button" class="dec dec-ok" data-accept="1"><i class="fa-solid fa-rotate-left"></i> Accept, remove points</button>' +
            '<button type="button" class="dec dec-bad" data-accept="0"><i class="fa-solid fa-xmark"></i> Refuse</button></div>' +
            '<p class="mod-err" role="alert" hidden></p></form>';
        return '<article class="mod-case mod-case--appeal">' +
            '<span class="points-orb" aria-label="' + p.points + ' penalty points">' + p.points + "<small>pt" + (p.points > 1 ? "s" : "") + "</small></span>" +
            '<div class="mod-main"><h2 class="mod-name">' + esc(p.shop ? p.shop.shopName : "Shop #" + p.shopId) + "</h2>" +
            '<p class="mod-meta">Penalty ' + ago(p.createdAt) + " · " + esc(p.reason) + "</p>" +
            '<blockquote class="appeal-msg">' + esc(a.message) + "</blockquote>" +
            '<p class="mod-meta">Appealed ' + ago(a.createdAt) + "</p></div>" +
            actions + "</article>";
    }

    async function loadAppeals() {
        var list = document.getElementById("appealList");
        list.innerHTML = '<div class="mod-loading">Loading appeals…</div>';
        try {
            var items = await Api.moderation.appeals(state.appealStatus);
            list.innerHTML = items.length ? items.map(appealHtml).join("") : empty("fa-scale-balanced", "No appeals here.");
        } catch (e) {
            list.innerHTML = empty("fa-circle-exclamation", "Could not load appeals: " + esc(e.message));
        }
    }

    document.getElementById("appealList").addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-accept]");
        if (!btn) return;
        var form = btn.closest(".mod-decide");
        var err = form.querySelector(".mod-err");
        var note = form.querySelector(".mod-note").value.trim();
        if (!note) {
            err.textContent = "Write a short reply for the shop.";
            err.hidden = false;
            form.querySelector(".mod-note").focus();
            return;
        }
        form.querySelectorAll("button, textarea").forEach(function (el) { el.disabled = true; });
        try {
            await Api.moderation.decideAppeal(form.dataset.appeal, btn.dataset.accept === "1", note);
            toast(btn.dataset.accept === "1" ? "Appeal accepted, points removed" : "Appeal refused");
            loadAppeals();
            loadCounts();
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
            form.querySelectorAll("button, textarea").forEach(function (el) { el.disabled = false; });
        }
    });

    // ---------- keywords

    async function loadKeywords() {
        var rows = await Api.moderation.keywords();
        var chip = function (k) {
            return '<li class="kw-chip kw-' + k.severity + '"><span>' + esc(k.phrase) + "</span>" +
                (canManage ? '<button type="button" data-kw="' + k.id + '" aria-label="Remove ' + esc(k.phrase) + '"><i class="fa-solid fa-xmark"></i></button>' : "") + "</li>";
        };
        var block = rows.filter(function (k) { return k.severity === "block"; });
        var flag = rows.filter(function (k) { return k.severity === "flag"; });
        document.getElementById("kwBlock").innerHTML = block.length ? block.map(chip).join("") : '<li class="kw-none">None yet</li>';
        document.getElementById("kwFlag").innerHTML = flag.length ? flag.map(chip).join("") : '<li class="kw-none">None yet</li>';
    }

    document.getElementById("kwForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var err = document.getElementById("kwError");
        var input = document.getElementById("kwPhrase");
        err.hidden = true;
        try {
            await Api.moderation.addKeyword(input.value.trim(), document.getElementById("kwSeverity").value);
            input.value = "";
            input.focus();
            loadKeywords();
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
        }
    });

    document.querySelector(".kw-groups").addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-kw]");
        if (!btn) return;
        try {
            await Api.moderation.removeKeyword(btn.dataset.kw);
            loadKeywords();
        } catch (ex) { toast(ex.message, true); }
    });

    // ---------- settings

    var SETTINGS = [
        { title: "AI check", icon: "fa-robot", fields: [
            ["aiEnabled", "Run the AI check", "bool", "Off: the rules decide alone."],
            ["aiModel", "Model", "text"],
            ["aiDailyBudgetUsd", "Daily budget (USD)", "num", "When spent, the backup standard applies until midnight."],
            ["aiTimeoutMs", "Timeout (ms)", "num"],
            ["breakerFailures", "Pause after this many failures in a row", "num"],
            ["breakerCooldownMin", "Pause length (minutes)", "num"]
        ] },
        { title: "Backup standard", icon: "fa-life-ring", fields: [
            ["holdHours", "Hours a listing waits before an admin reviews it", "num"],
            ["trustedMinDays", "Trusted shop: days on EC SHOP", "num"],
            ["trustedMinProducts", "Trusted shop: live products", "num"],
            ["trustedMaxPrice", "Trusted shop: price below (USD)", "num"]
        ] },
        { title: "Rules and reports", icon: "fa-list-check", fields: [
            ["reportThreshold", "Customer reports before a case opens", "num"],
            ["priceLowPct", "Flag prices below (% of the category median)", "num"],
            ["priceHighPct", "Flag prices above (% of the category median)", "num"],
            ["listingRules", "Listing rules the AI applies", "area"]
        ] },
        { title: "Penalty points", icon: "fa-scale-balanced", fields: [
            ["capProductsAt", "Product cap from (points)", "num"],
            ["productLimit", "Product cap", "num"],
            ["noCouponsAt", "No vouchers from (points)", "num"],
            ["freezeAt", "Freeze adding and editing from (points)", "num"],
            ["freezeDays", "Freeze length (days)", "num"],
            ["suspendAt", "Suspend the shop at (points)", "num"]
        ] }
    ];
    var loadedSettings = {};

    function fieldHtml(f, value) {
        var id = "set-" + f[0];
        var dis = canManage ? "" : " disabled";
        var help = f[3] ? '<span class="set-help">' + f[3] + "</span>" : "";
        if (f[2] === "bool") {
            return '<label class="set-toggle" for="' + id + '"><input type="checkbox" id="' + id + '" name="' + f[0] + '"' + (value ? " checked" : "") + dis + '><span class="set-switch" aria-hidden="true"></span><span><strong>' + f[1] + "</strong>" + help + "</span></label>";
        }
        var input = f[2] === "area" ?
            '<textarea class="form-input" id="' + id + '" name="' + f[0] + '" rows="4"' + dis + ">" + esc(value) + "</textarea>" :
            '<input class="form-input" id="' + id + '" name="' + f[0] + '" type="' + (f[2] === "num" ? "number" : "text") + '" step="any" value="' + esc(value) + '"' + dis + ">";
        return '<div class="set-field' + (f[2] === "area" ? " set-field--wide" : "") + '"><label class="form-label" for="' + id + '">' + f[1] + "</label>" + input + help + "</div>";
    }

    async function loadSettings() {
        var form = document.getElementById("settingsForm");
        loadedSettings = await Api.moderation.settings();
        form.innerHTML = SETTINGS.map(function (g) {
            return '<fieldset class="set-group"><legend><i class="fa-solid ' + g.icon + '" aria-hidden="true"></i> ' + g.title + "</legend>" +
                '<div class="set-grid">' + g.fields.map(function (f) { return fieldHtml(f, loadedSettings[f[0]]); }).join("") + "</div></fieldset>";
        }).join("") +
            (canManage ? '<div class="set-actions"><p class="mod-err" id="setError" role="alert" hidden></p><button class="btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Save settings</button></div>' : "");
    }

    document.getElementById("settingsForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var patch = {};
        SETTINGS.forEach(function (g) {
            g.fields.forEach(function (f) {
                var el = document.getElementById("set-" + f[0]);
                var v = f[2] === "bool" ? el.checked : f[2] === "num" ? Number(el.value) : el.value;
                if (v !== loadedSettings[f[0]]) patch[f[0]] = v;
            });
        });
        var err = document.getElementById("setError");
        err.hidden = true;
        if (!Object.keys(patch).length) { toast("Nothing changed"); return; }
        try {
            await Api.moderation.saveSettings(patch);
            toast("Settings saved");
            loadSettings();
            loadHealth();
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
        }
    });

    // ---------- tabs and filters

    var loaders = { queue: loadQueue, appeals: loadAppeals, keywords: loadKeywords, settings: loadSettings };
    var tabs = document.querySelectorAll('.mod-tabs [role="tab"]');

    function showTab(name, focus) {
        tabs.forEach(function (t) {
            var on = t.id === "tab-" + name;
            t.setAttribute("aria-selected", on);
            t.tabIndex = on ? 0 : -1;
            document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
            if (on && focus) t.focus();
        });
        history.replaceState(null, "", "#" + name);
        loaders[name]().catch(function (e) { toast(e.message, true); });
    }

    tabs.forEach(function (t, i) {
        t.addEventListener("click", function () { showTab(t.id.slice(4)); });
        t.addEventListener("keydown", function (e) {
            if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
            var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
            showTab(next.id.slice(4), true);
        });
    });

    document.querySelectorAll("#panel-queue .filter-tab").forEach(function (b) {
        b.addEventListener("click", function () {
            document.querySelectorAll("#panel-queue .filter-tab").forEach(function (x) { x.classList.toggle("active", x === b); });
            state.source = b.dataset.source;
            loadQueue();
        });
    });
    document.getElementById("statusFilter").addEventListener("change", function () { state.status = this.value; loadQueue(); });
    document.getElementById("appealFilter").addEventListener("change", function () { state.appealStatus = this.value; loadAppeals(); });
    document.getElementById("refreshBtn").addEventListener("click", function () {
        loadHealth();
        loadCounts();
        var current = document.querySelector('.mod-tabs [aria-selected="true"]').id.slice(4);
        loaders[current]();
    });

    if (!canManage) document.querySelectorAll("[data-manage]").forEach(function (el) { el.hidden = true; });

    var start = (location.hash || "#queue").slice(1);
    showTab(loaders[start] ? start : "queue");
    loadHealth();
    loadCounts().catch(function () { /* counters stay at 0 */ });
    setInterval(loadHealth, 60000);

})();
