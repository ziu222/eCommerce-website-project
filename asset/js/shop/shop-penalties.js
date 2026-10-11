// shop-penalties.js — a shop's penalty points: where it stands against the levels, the history, and appeals.

(function () {

    var esc = Api.escapeHtml;

    function day(iso) {
        return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    }

    function toast(text, isError) {
        var box = document.getElementById("liveToasts");
        var t = document.createElement("div");
        t.className = "live-toast" + (isError ? " is-error" : "");
        t.textContent = text;
        box.appendChild(t);
        setTimeout(function () { t.classList.add("is-leaving"); }, 4000);
        setTimeout(function () { t.remove(); }, 4500);
    }

    function renderScore(d) {
        var L = d.levels;
        var pts = d.current;
        var level = pts >= L.capProductsAt ? 2 : pts > 0 ? 1 : 0;
        var title = pts === 0 ? "No penalty points" : pts + " penalty point" + (pts > 1 ? "s" : "") + " this quarter";
        var summary = pts === 0 ? "Your shop has full privileges. Keep listings accurate to stay here." :
            pts >= L.suspendAt ? "Your shop is suspended. An admin will review it." :
            pts >= L.capProductsAt ? "Some privileges are limited, see below." :
            "No limits yet. Limits start at " + L.capProductsAt + " points.";
        document.getElementById("penScore").dataset.level = level;
        document.getElementById("penOrb").textContent = pts;
        document.getElementById("penTitle").textContent = title;
        document.getElementById("penSummary").textContent = summary + " Points reset on " + day(d.quarterEndsAt) + ".";

        var fill = document.getElementById("penFill");
        fill.dataset.level = level;
        fill.style.width = Math.min(100, (pts / L.suspendAt) * 100) + "%";
        var track = document.getElementById("penTrack");
        track.setAttribute("aria-label", pts + " of " + L.suspendAt + " points before suspension");
        track.querySelectorAll(".pen-mark").forEach(function (m) { m.remove(); });
        [[L.capProductsAt, "Limits"], [L.freezeAt, "Freeze"], [L.suspendAt, "Suspend"]].forEach(function (m) {
            var el = document.createElement("span");
            el.className = "pen-mark";
            el.style.left = Math.min(100, (m[0] / L.suspendAt) * 100) + "%";
            el.innerHTML = m[0] + "<span>" + m[1] + "</span>";
            el.setAttribute("aria-hidden", "true");
            track.appendChild(el);
        });

        var rows = [
            [L.capProductsAt, "At most " + L.productLimit + " products, and no new vouchers" + (L.noCouponsAt !== L.capProductsAt ? " from " + L.noCouponsAt + " points" : "") + "."],
            [L.freezeAt, "No adding or editing products for " + L.freezeDays + " days after the latest penalty."],
            [L.suspendAt, "The shop is suspended until an admin reviews it."]
        ];
        document.getElementById("penLevels").innerHTML = rows.map(function (r) {
            return '<li class="' + (pts >= r[0] ? "is-active" : "") + '"><strong>' + r[0] + " pts</strong><span>" + r[1] + (pts >= r[0] ? " <em>(applies now)</em>" : "") + "</span></li>";
        }).join("");
    }

    function itemHtml(p) {
        var tag = p.revokedAt ? '<span class="pen-tag removed"><i class="fa-solid fa-rotate-left"></i> Removed on appeal</span>' :
            p.counts ? '<span class="pen-tag counts">Counts until ' + day(p.expiresAt) + "</span>" :
            '<span class="pen-tag expired">Expired</span>';
        var a = p.appeal;
        var appeal = a ?
            '<div class="mod-decided"><span class="badge badge-decided-' + (a.status === "accepted" ? "dismissed" : a.status === "refused" ? "violation" : "minor") + '">' +
            (a.status === "open" ? "Appeal waiting for an admin" : a.status === "accepted" ? "Appeal accepted" : "Appeal refused") + "</span>" +
            '<blockquote class="appeal-msg">' + esc(a.message) + "</blockquote>" +
            (a.note ? "<p><strong>Admin:</strong> " + esc(a.note) + "</p>" : "") + "</div>" :
            p.revokedAt || !p.counts ? "" :
            '<form class="mod-decide" data-penalty="' + p.id + '" novalidate>' +
            '<label class="form-label" for="ap' + p.id + '">Appeal this penalty</label>' +
            '<textarea class="form-input mod-note" id="ap' + p.id + '" rows="3" minlength="10" maxlength="1000" placeholder="What should the admin know? An invoice, a photo of the real product, a mistake in the listing you already fixed…"></textarea>' +
            '<div class="mod-actions"><button type="submit" class="dec dec-ok"><i class="fa-solid fa-paper-plane"></i> Send appeal</button></div>' +
            '<p class="mod-err" role="alert" hidden></p></form>';
        return '<article class="pen-item' + (p.counts ? "" : " is-gone") + '">' +
            '<span class="points-orb" aria-label="' + p.points + ' points">' + p.points + "<small>pt" + (p.points > 1 ? "s" : "") + "</small></span>" +
            '<div class="mod-main"><div class="mod-head">' + tag + "</div>" +
            '<p class="mod-name" style="font-size:15px;">' + esc(p.reason) + "</p>" +
            '<p class="mod-meta">Given ' + day(p.createdAt) + " by " + esc(p.createdBy) + "</p></div>" +
            appeal + "</article>";
    }

    async function load() {
        var list = document.getElementById("penList");
        try {
            var d = await Api.moderation.myPenalties();
            renderScore(d);
            list.innerHTML = d.items.length ? d.items.map(itemHtml).join("") :
                '<div class="mod-empty"><i class="fa-solid fa-shield-heart" aria-hidden="true"></i><p>No penalties so far. Nice work.</p></div>';
        } catch (e) {
            if (e.status === 401 || e.status === 403) { location.href = "../admin/admin-login.html"; return; }
            list.innerHTML = '<div class="mod-empty"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i><p>' + esc(e.message) + "</p></div>";
        }
    }

    document.getElementById("penList").addEventListener("submit", async function (e) {
        e.preventDefault();
        var form = e.target.closest("[data-penalty]");
        var text = form.querySelector("textarea").value.trim();
        var err = form.querySelector(".mod-err");
        err.hidden = true;
        if (text.length < 10) {
            err.textContent = "Write at least 10 characters so the admin understands your case.";
            err.hidden = false;
            return;
        }
        form.querySelector("button").disabled = true;
        try {
            await Api.moderation.appeal(form.dataset.penalty, text);
            toast("Appeal sent. You will get a notification with the decision.");
            load();
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
            form.querySelector("button").disabled = false;
        }
    });

    document.addEventListener("DOMContentLoaded", function () {
        var raw = localStorage.getItem("ecshop_currentUser");
        var user = raw ? JSON.parse(raw) : null;
        if (!user || user.role !== "shop") { location.href = "../admin/admin-login.html"; return; }
        document.getElementById("topbarAvatar").textContent = (user.shopName || user.name || "S").charAt(0).toUpperCase();
        document.getElementById("topbarUserName").textContent = user.shopName || user.name || "Shop";
        ["logoutBtn", "logoutLink"].forEach(function (id) {
            document.getElementById(id).addEventListener("click", async function (ev) {
                ev.preventDefault();
                await Api.auth.logout();
                location.href = "../admin/admin-login.html";
            });
        });
        load();
    });

})();
