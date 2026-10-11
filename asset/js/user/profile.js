// profile.js — the account hub: overview, orders, wishlist, addresses, notifications, personal info and security.
// Sections are switched with the URL hash (#overview, #wishlist, ...) so they can be linked to.

(function () {

    var esc = Api.escapeHtml;
    var PANELS = ["overview", "orders", "wishlist", "addresses", "notifications", "personal", "security"];
    var me = null;
    var loaded = {};
    var notes = [];
    var addresses = [];

    function money(n, decimals) {
        return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
    }

    function ago(iso) {
        var s = (Date.now() - new Date(iso).getTime()) / 1000;
        if (s < 60) return "just now";
        if (s < 3600) return Math.floor(s / 60) + " min ago";
        if (s < 86400) return Math.floor(s / 3600) + " h ago";
        if (s < 86400 * 7) return Math.floor(s / 86400) + " d ago";
        return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" });
    }

    function empty(icon, title, text, action) {
        return '<div class="empty"><span class="anim" data-lottie="empty-box" data-loop style="--size:140px"><span class="ms">' + icon + "</span></span>" +
            "<h3>" + title + "</h3>" + (text ? "<p>" + text + "</p>" : "") + (action || "") + "</div>";
    }

    // ---------- sections

    function show(name) {
        if (PANELS.indexOf(name) === -1) name = "overview";
        PANELS.forEach(function (p) { document.getElementById("panel-" + p).hidden = p !== name; });
        document.querySelectorAll(".account-nav [data-panel]").forEach(function (a) {
            if (a.dataset.panel === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
        });
        if (!loaded[name]) { loaded[name] = true; LOADERS[name](); }
    }

    var LOADERS = {
        overview: loadOverview,
        orders: Orders.load,
        wishlist: loadWishlist,
        addresses: loadAddresses,
        notifications: loadNotes,
        personal: function () {},
        security: function () {}
    };

    // ---------- identity

    function renderIdentity(u) {
        var name = u.name || u.username || "User";
        document.getElementById("profileDisplayName").textContent = name;
        document.getElementById("profileDisplayUsername").textContent = "@" + (u.username || "");
        document.getElementById("greetName").textContent = name;
        if (u.createdAt) document.getElementById("metaMember").textContent = new Date(u.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        setAvatar(u.avatar, name.charAt(0).toUpperCase());
        setCover(u.coverPhoto);
        document.getElementById("inputName").value = u.name || "";
        document.getElementById("inputEmail").value = u.email || "";
        document.getElementById("inputUsername").value = u.username || "";
        document.getElementById("lastLogin").textContent = u.lastLoginAt
            ? new Date(u.lastLoginAt).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
            : "not recorded yet";
    }

    function setAvatar(src, initial) {
        var el = document.getElementById("profileAvatar");
        if (src) el.innerHTML = '<img src="' + esc(src) + '" alt="">';
        else el.textContent = initial || "?";
    }

    function setCover(src) {
        var cover = document.getElementById("profileCover");
        var img = cover.querySelector("img");
        if (src) {
            if (!img) { img = document.createElement("img"); img.alt = ""; cover.insertBefore(img, cover.firstChild); }
            img.src = src;
        } else if (img) img.remove();
    }

    function greeting() {
        var h = new Date().getHours();
        return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    }

    // ---------- overview

    async function loadOverview() {
        document.getElementById("greeting").textContent = greeting();
        document.getElementById("activeOrder").innerHTML = UI.skeletonList("row", 1);
        document.getElementById("tierBox").innerHTML = UI.skeletonList("row", 1);
        document.getElementById("recentNotes").innerHTML = UI.skeletonList("row", 2);

        var results = await Promise.allSettled([Api.wallet.get(), Api.orders.mine(), Api.account.membership(), Api.account.wishlist.ids(), Api.account.notifications.list()]);
        var wallet = results[0].value, orders = results[1].value || [], tier = results[2].value, ids = results[3].value || [], list = results[4].value || [];

        if (wallet) UI.countTo(document.getElementById("statWallet"), wallet.balance, { format: function (n) { return money(n, 2); } });
        var active = orders.filter(function (o) { return o.status === "pending" || o.status === "confirmed" || o.status === "shipped"; });
        UI.countTo(document.getElementById("statActive"), active.length, { format: function (n) { return String(Math.round(n)); } });
        if (tier) UI.countTo(document.getElementById("statSpent"), tier.spent, { format: function (n) { return money(n); } });
        setSaved(ids.length);

        renderLatestOrder(active[0] || orders[0]);
        if (tier) renderTier(tier);
        notes = list;
        renderRecent();
        setUnread();
    }

    function renderLatestOrder(o) {
        var box = document.getElementById("activeOrder");
        if (!o) {
            box.innerHTML = '<div class="empty"><span class="ms">shopping_bag</span><p>No orders yet.</p><a class="btn btn-primary btn-sm" href="product.html">Start shopping</a></div>';
            return;
        }
        var first = o.items[0] || { name: "Order", image: "" };
        var steps = ["pending", "confirmed", "shipped", "delivered"];
        var at = steps.indexOf(o.status);
        var labels = { pending: "Placed", confirmed: "Confirmed", shipped: "Shipped", delivered: "Delivered" };
        box.innerHTML = '<div class="mini-order"><div class="mini-order-top">' +
            '<img src="' + esc(first.image) + '" alt=""' + (UI.isPlaceholder(first.image) ? ' class="is-ph"' : "") + ' data-category="">' +
            "<div><strong>" + esc(first.name) + (o.items.length > 1 ? " +" + (o.items.length - 1) + " more" : "") + "</strong>" +
            '<span class="muted">Order #' + o.id + " · " + money(o.total, 2) + "</span></div>" +
            '<span class="badge' + (o.status === "cancelled" ? " badge-danger" : o.status === "delivered" ? " badge-ok" : "") + '">' + esc(o.status.charAt(0).toUpperCase() + o.status.slice(1)) + "</span></div>" +
            (o.status === "cancelled" ? "" : '<ol class="track">' + steps.map(function (s, i) {
                return '<li style="--k:' + i + '" class="' + (i <= at ? "done" : "") + '">' + labels[s] + "</li>";
            }).join("") + "</ol>") + "</div>";
    }

    function renderTier(t) {
        var badge = document.getElementById("tierBadge");
        badge.dataset.tier = t.tier.key;
        document.getElementById("tierName").textContent = t.tier.name;
        var pct = t.next ? Math.min(100, Math.round(((t.spent - t.tier.min) / (t.next.min - t.tier.min)) * 100)) : 100;
        var reached = t.tiers.map(function (x) { return x.key; }).indexOf(t.tier.key);
        document.getElementById("tierBox").innerHTML =
            '<div class="tier-now"><span class="tier-badge" data-tier="' + esc(t.tier.key) + '"><span class="ms ms-fill">workspace_premium</span>' + esc(t.tier.name) + "</span>" +
            '<span class="muted">' + money(t.spent) + " spent</span></div>" +
            '<div class="tier-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Progress to the next tier"><span style="--pct:' + pct + '%"></span></div>' +
            '<div class="tier-steps">' + t.tiers.map(function (x, i) { return '<span class="' + (i <= reached ? "on" : "") + '">' + esc(x.name) + "</span>"; }).join("") + "</div>" +
            "<p>" + (t.next ? "Spend <strong>" + money(t.next.remaining, 2) + "</strong> more on delivered orders to reach " + esc(t.next.name) + "." : "You have reached the top tier. Thank you!") + "</p>" +
            '<ul class="perks">' + t.perks.map(function (p) { return '<li><span class="ms">check_circle</span>' + esc(p) + "</li>"; }).join("") + "</ul>";
    }

    // ---------- notifications

    function noteHtml(n) {
        var icon = n.type === "warning" ? "warning" : n.type === "promo" ? "local_offer" : "notifications";
        return '<button type="button" class="note' + (n.isRead ? "" : " unread") + '" data-note="' + n.id + '" data-type="' + esc(n.type) + '">' +
            '<span class="note-icon"><span class="ms">' + icon + "</span></span>" +
            '<span><span class="note-title">' + esc(n.title) + '</span><span class="note-msg" style="display:block">' + esc(n.message) + "</span></span>" +
            '<span class="note-time">' + esc(ago(n.createdAt)) + "</span></button>";
    }

    function renderRecent() {
        var box = document.getElementById("recentNotes");
        box.innerHTML = notes.length ? '<div class="note-list">' + notes.slice(0, 3).map(noteHtml).join("") + "</div>" : '<p class="muted">Nothing new. Order updates will show up here.</p>';
    }

    function renderNotes() {
        var box = document.getElementById("noteList");
        box.innerHTML = notes.length ? notes.map(noteHtml).join("") : empty("notifications", "You are all caught up", "Order updates and news will show up here.");
        document.getElementById("readAll").hidden = !notes.some(function (n) { return !n.isRead; });
    }

    function setUnread() {
        var unread = notes.filter(function (n) { return !n.isRead; }).length;
        var el = document.getElementById("unreadCount");
        el.textContent = unread;
        el.hidden = !unread;
        UI.setBell(unread);
    }

    async function loadNotes() {
        document.getElementById("noteList").innerHTML = UI.skeletonList("row", 4);
        try { notes = await Api.account.notifications.list(); } catch (e) { notes = []; }
        renderNotes();
        setUnread();
    }

    document.addEventListener("click", function (e) {
        var b = e.target.closest("[data-note]");
        if (!b || !b.classList.contains("unread")) return;
        var id = Number(b.dataset.note);
        notes.forEach(function (n) { if (n.id === id) n.isRead = true; });
        document.querySelectorAll('[data-note="' + id + '"]').forEach(function (x) { x.classList.remove("unread"); });
        setUnread();
        Api.account.notifications.read(id).catch(function () { /* stays read here */ });
    });

    document.getElementById("readAll").addEventListener("click", async function () {
        await Api.account.notifications.readAll();
        notes.forEach(function (n) { n.isRead = true; });
        renderNotes();
        renderRecent();
        setUnread();
        UI.toast("All caught up");
    });

    // ---------- wishlist

    function setSaved(n) {
        document.getElementById("statSaved").textContent = n;
        var el = document.getElementById("savedCount");
        el.textContent = n;
        el.hidden = !n;
    }

    async function loadWishlist() {
        var grid = document.getElementById("wishGrid");
        grid.innerHTML = UI.skeletons(3);
        var list = [];
        try { list = await Api.account.wishlist.list(); } catch (e) { grid.innerHTML = UI.errorState("Could not load your wishlist", e.message); return; }
        setSaved(list.length);
        grid.innerHTML = list.length ? list.map(UI.productCard).join("")
            : '<div style="grid-column:1/-1">' + empty("favorite", "Nothing saved yet", "Tap the heart on any product to keep it here.", '<a class="btn btn-primary" href="product.html">Browse the shop</a>') + "</div>";
    }

    // an order changed status (ui.js got it over the live stream): the open section reloads,
    // the other sections that show orders reload the next time they open
    document.addEventListener("order:change", function () {
        ["overview", "orders", "notifications"].forEach(function (p) {
            if (!loaded[p]) return;
            if (document.getElementById("panel-" + p).hidden) loaded[p] = false; else LOADERS[p]();
        });
    });

    // a product unsaved from the wishlist tab leaves the grid
    document.addEventListener("wishlist:change", function (e) {
        var n = Number(document.getElementById("statSaved").textContent) + (e.detail.saved ? 1 : -1);
        setSaved(Math.max(0, n));
        if (e.detail.saved || document.getElementById("panel-wishlist").hidden) return;
        var btn = document.querySelector('#wishGrid [data-save="' + e.detail.id + '"]');
        var card = btn && btn.closest(".pcard");
        if (!card) return;
        card.style.transition = "opacity 0.3s, transform 0.3s";
        card.style.opacity = "0";
        card.style.transform = "scale(0.96)";
        setTimeout(function () { card.remove(); if (!document.querySelector("#wishGrid .pcard")) loadWishlist(); }, 300);
    });

    // ---------- addresses

    var editing = null;

    function addrHtml(a) {
        return '<article class="addr' + (a.isDefault ? " is-default" : "") + '">' +
            '<div class="addr-top"><strong>' + esc(a.label || a.recipient) + "</strong>" + (a.isDefault ? '<span class="badge badge-ok">Default</span>' : "") + "</div>" +
            "<p>" + esc(a.recipient) + " · " + esc(a.phone) + "</p><p>" + esc(VNAddress.line(a)) + "</p>" +
            '<div class="addr-actions">' +
            (a.isDefault ? "" : '<button type="button" class="link-btn" data-addr-default="' + a.id + '"><span class="ms">check_circle</span>Make default</button>') +
            '<button type="button" class="link-btn" data-addr-edit="' + a.id + '"><span class="ms">edit</span>Edit</button>' +
            '<button type="button" class="link-btn link-btn--danger" data-addr-delete="' + a.id + '"><span class="ms">delete</span>Delete</button></div></article>';
    }

    function renderAddresses() {
        document.getElementById("addrGrid").innerHTML = addresses.map(addrHtml).join("") +
            (addresses.length < 10 ? '<button type="button" class="addr-add" id="addrAdd"><span class="ms">add</span>Add an address</button>' : "");
    }

    async function loadAddresses() {
        document.getElementById("addrGrid").innerHTML = UI.skeletonList("row", 2);
        try { addresses = await Api.account.addresses.list(); } catch (e) { addresses = []; }
        renderAddresses();
    }

    function openForm(a) {
        editing = a || null;
        var form = document.getElementById("addrForm");
        document.getElementById("addrFormTitle").textContent = a ? "Edit address" : "New address";
        VNAddress.fill(form, "af", a, me && me.name);
        document.getElementById("afDefault").checked = a ? a.isDefault : !addresses.length;
        document.getElementById("afDefault").disabled = !!(a && a.isDefault);
        document.getElementById("afError").hidden = true;
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("afRecipient").focus();
    }

    document.getElementById("addrGrid").addEventListener("click", async function (e) {
        if (e.target.closest("#addrAdd")) { openForm(null); return; }
        var edit = e.target.closest("[data-addr-edit]");
        var def = e.target.closest("[data-addr-default]");
        var del = e.target.closest("[data-addr-delete]");
        try {
            if (edit) openForm(addresses.filter(function (a) { return a.id === Number(edit.dataset.addrEdit); })[0]);
            if (def) { await Api.account.addresses.update(Number(def.dataset.addrDefault), { isDefault: true }); await loadAddresses(); UI.toast("Default address changed"); }
            if (del) {
                if (del.dataset.confirm !== "1") {
                    // a second press confirms, so nothing is deleted by a stray click
                    del.dataset.confirm = "1";
                    del.lastChild.textContent = "Press again to delete";
                    setTimeout(function () { if (del.isConnected) { del.dataset.confirm = ""; del.lastChild.textContent = "Delete"; } }, 3000);
                    return;
                }
                await Api.account.addresses.remove(Number(del.dataset.addrDelete));
                await loadAddresses();
                UI.toast("Address deleted");
            }
        } catch (err) { UI.toast(err.message, "error"); }
    });

    document.getElementById("afFields").innerHTML = VNAddress.html("af");
    document.getElementById("afCancel").addEventListener("click", function () { document.getElementById("addrForm").hidden = true; });

    document.getElementById("addrForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var err = document.getElementById("afError");
        err.hidden = true;
        var data = await VNAddress.read(this, "af");
        if (!data) return;
        if (document.getElementById("afDefault").checked) data.isDefault = true;
        try {
            if (editing) await Api.account.addresses.update(editing.id, data); else await Api.account.addresses.add(data);
            document.getElementById("addrForm").hidden = true;
            await loadAddresses();
            UI.toast(editing ? "Address updated" : "Address added");
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
        }
    });

    // ---------- personal info and security

    function fieldError(id, msg) {
        var el = document.getElementById(id);
        el.textContent = msg;
        el.classList.add("show");
        var input = el.previousElementSibling;
        if (input) input.classList.add("error");
    }

    function clearErrors(form) {
        form.querySelectorAll(".profile-field-error").forEach(function (el) { el.classList.remove("show"); el.textContent = ""; });
        form.querySelectorAll(".profile-input.error").forEach(function (el) { el.classList.remove("error"); });
    }

    function syncSession(u) {
        try {
            var s = JSON.parse(localStorage.getItem("ecshop_currentUser"));
            if (!s) return;
            localStorage.setItem("ecshop_currentUser", JSON.stringify(Object.assign({}, s, { name: u.name, email: u.email, username: u.username, avatar: u.avatar || "" })));
            if (window.renderUser) renderUser();
        } catch (e) { /* storage blocked */ }
    }

    document.getElementById("profileForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var form = e.currentTarget;
        clearErrors(form);
        var name = document.getElementById("inputName").value.trim();
        var email = document.getElementById("inputEmail").value.trim();
        if (!name) { fieldError("errorName", "Name is required"); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { fieldError("errorEmail", "Enter a valid email"); return; }
        try {
            me = await Api.profile.update({ name: name, email: email });
            renderIdentity(me);
            syncSession(me);
            UI.toast("Profile updated");
        } catch (err) {
            if (/mail/i.test(err.message)) fieldError("errorEmail", err.message); else UI.toast(err.message, "error");
        }
    });

    document.getElementById("passwordForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        var form = e.currentTarget;
        clearErrors(form);
        var cur = document.getElementById("inputCurrentPw").value;
        var pw = document.getElementById("inputNewPw").value;
        var again = document.getElementById("inputConfirmPw").value;
        if (!cur) { fieldError("errorCurrentPw", "Enter your current password"); return; }
        if (pw.length < 6) { fieldError("errorNewPw", "Use at least 6 characters"); return; }
        if (pw !== again) { fieldError("errorConfirmPw", "Passwords do not match"); return; }
        try {
            await Api.profile.update({ currentPassword: cur, newPassword: pw });
            form.reset();
            UI.toast("Password updated");
        } catch (err) {
            if (/password/i.test(err.message)) fieldError("errorCurrentPw", err.message); else UI.toast(err.message, "error");
        }
    });

    document.getElementById("logoutAll").addEventListener("click", async function () {
        var btn = this;
        if (btn.dataset.confirm !== "1") {
            btn.dataset.confirm = "1";
            btn.lastChild.textContent = "Press again to confirm";
            setTimeout(function () { btn.dataset.confirm = ""; btn.lastChild.textContent = "Sign out of other devices"; }, 4000);
            return;
        }
        btn.disabled = true;
        try {
            await Api.account.logoutAll();
            UI.toast("Signed out of every other device");
        } catch (err) {
            UI.toast(err.message, "error");
        } finally {
            btn.disabled = false;
            btn.dataset.confirm = "";
            btn.lastChild.textContent = "Sign out of other devices";
        }
    });

    // ---------- photos

    function resizeImage(file, maxWidth, maxHeight, quality) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            var url = URL.createObjectURL(file);
            img.onload = function () {
                var scale = Math.min(1, maxWidth / img.width, maxHeight / img.height);
                var canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.round(img.width * scale));
                canvas.height = Math.max(1, Math.round(img.height * scale));
                canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("That file is not a valid image")); };
            img.src = url;
        });
    }

    function photoPicker(buttonId, inputId, w, h, q, field, done) {
        document.getElementById(buttonId).addEventListener("click", function () { document.getElementById(inputId).click(); });
        document.getElementById(inputId).addEventListener("change", async function (e) {
            var file = e.target.files[0];
            if (!file) return;
            try {
                var data = {};
                data[field] = await resizeImage(file, w, h, q);
                me = await Api.profile.update(data);
                done(me);
            } catch (err) { UI.toast(err.message, "error"); }
            e.target.value = "";
        });
    }

    // ---------- start

    document.addEventListener("DOMContentLoaded", async function () {
        var session = null;
        try { session = JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { /* none */ }
        if (!session || session.role !== "customer") { UI.requireLogin(); return; }
        try { me = await Api.profile.get(); } catch (e) { UI.requireLogin(); return; }

        renderIdentity(me);
        photoPicker("profileCover", "coverInput", 1200, 500, 0.7, "coverPhoto", function (u) { setCover(u.coverPhoto); UI.toast("Cover photo updated"); });
        photoPicker("avatarWrap", "avatarInput", 256, 256, 0.85, "avatar", function (u) { setAvatar(u.avatar); syncSession(u); UI.toast("Profile photo updated"); });

        // the tier badge and counts in the header and nav are always filled
        Api.account.membership().then(function (t) {
            document.getElementById("tierBadge").dataset.tier = t.tier.key;
            document.getElementById("tierName").textContent = t.tier.name;
        }).catch(function () { /* stays Member */ });
        Api.account.wishlist.ids().then(function (ids) { setSaved(ids.length); }).catch(function () {});
        Api.account.notifications.unread().then(function (r) {
            var el = document.getElementById("unreadCount");
            el.textContent = r.count;
            el.hidden = !r.count;
        }).catch(function () {});

        window.addEventListener("hashchange", function () { show(location.hash.slice(1)); });
        show(location.hash.slice(1) || "overview");
    });

})();
