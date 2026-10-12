// product-detail.js — one product: the buy box, then the story below it (overview, technology,
// grouped specifications, what is in the box), then related products.

(function () {

    var esc = Api.escapeHtml;

    // a glyph for each spec group, matched on its name; the page loads exactly these icons
    var GROUP_ICON = [
        [/display|screen/i, "display_settings"],
        [/perform|chip|processor|memory|storage/i, "memory"],
        [/camera|lens|sensor|video|optic/i, "camera"],
        [/batter|charg|power/i, "battery_charging_full"],
        [/connect|wireless|network|port/i, "wifi"],
        [/audio|sound|speaker|mic/i, "graphic_eq"],
        [/durab|water|protect|build/i, "water_drop"],
        [/gaming|controller/i, "sports_esports"]
    ];

    function groupIcon(name) {
        for (var i = 0; i < GROUP_ICON.length; i++) if (GROUP_ICON[i][0].test(name)) return GROUP_ICON[i][1];
        return "info";
    }

    function notFound() {
        document.getElementById("detail-content").innerHTML =
            '<div class="empty" style="grid-column:1/-1">' + UI.mascot("sad", 104) + '<h3>We could not find this product</h3>' +
            '<a class="btn btn-primary" href="product.html">Back to the shop</a></div>';
    }

    function stockHtml(stock) {
        if (stock <= 0) return '<p class="detail-stock out-stock"><span class="ms">cancel</span>Sold out</p>';
        if (stock <= 5) return '<p class="detail-stock low-stock"><span class="ms">schedule</span>Only ' + stock + " left</p>";
        return '<p class="detail-stock in-stock"><span class="ms">check_circle</span>In stock</p>';
    }

    // the short key specs, as a 2 by 2 "at a glance" grid in the buy box
    function glanceHtml(specs) {
        var keys = Object.keys(specs || {}).slice(0, 4);
        if (!keys.length) return "";
        return '<dl class="glance">' + keys.map(function (k) {
            return '<div><dt>' + esc(k.replace(/_/g, " ")) + "</dt><dd>" + esc(specs[k]) + "</dd></div>";
        }).join("") + "</dl>";
    }

    function renderDetail(p) {
        var off = UI.discount(p);
        var inStock = p.stock > 0;
        var shopName = p.shop && p.shop.shopName ? p.shop.shopName : "";
        var catLabel = UI.categoryLabel(p.category);

        document.title = p.name + " - EC SHOP";
        document.getElementById("breadcrumb").innerHTML =
            '<a href="home.html">Home</a><span aria-hidden="true">/</span><a href="product.html">Shop</a><span aria-hidden="true">/</span>' +
            '<a href="product.html?category=' + encodeURIComponent(p.category) + '">' + esc(catLabel) + '</a><span aria-hidden="true">/</span>' +
            '<span aria-current="page">' + esc(p.name) + "</span>";

        document.getElementById("detail-content").innerHTML =
            '<div class="detail-media"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '"' + (UI.isPlaceholder(p.image) ? ' class="is-ph"' : "") + ' data-category="' + esc(p.category) + '">' +
            (off ? '<span class="badge badge-sale">-' + off + "%</span>" : "") + "</div>" +
            '<div class="detail-info">' +
            '<a class="detail-cat" href="product.html?category=' + encodeURIComponent(p.category) + '">' + esc(catLabel) + "</a>" +
            '<h1 class="detail-name">' + esc(p.name) + "</h1>" +
            '<div class="detail-meta">' + UI.stars(p.rating) + "<span><strong>" + Number(p.rating).toFixed(1) + "</strong> · " + p.reviews + " reviews</span>" +
            (shopName ? "<span>Sold by <strong>" + esc(shopName) + "</strong></span>" : "") + "</div>" +
            '<div class="detail-price"><b>' + UI.money(p.price) + "</b>" +
            (off ? "<s>" + UI.money(p.oldPrice) + '</s><span class="detail-save">You save ' + UI.money(p.oldPrice - p.price) + "</span>" : "") + "</div>" +
            (p.description ? '<p class="detail-desc">' + esc(p.description) + "</p>" : "") +
            glanceHtml(p.specs) +
            stockHtml(p.stock) +
            '<div class="detail-actions">' +
            '<div class="qty" role="group" aria-label="Quantity"><button type="button" id="qtyDec" aria-label="Decrease quantity">−</button>' +
            '<output id="qtyVal" aria-live="polite">1</output><button type="button" id="qtyInc" aria-label="Increase quantity">+</button></div>' +
            '<button type="button" class="btn btn-primary btn-lg" id="btnAddCart"' + (inStock ? "" : " disabled") + '><span class="ms">add_shopping_cart</span>Add to cart</button>' +
            '<button type="button" class="btn btn-ghost btn-lg" id="btnBuyNow"' + (inStock ? "" : " disabled") + ">Buy now</button>" + UI.heart(p.id, p.name, "detail-heart") + "</div>" +
            '<ul class="detail-perks"><li><span class="ms">local_shipping</span>Free delivery</li>' +
            '<li><span class="ms">autorenew</span>30-day returns</li>' +
            '<li><span class="ms">verified</span>Checked seller</li></ul>' +
            '<p class="detail-help"><a href="#" data-open-support>Questions? Ask our assistant</a><span aria-hidden="true">·</span>' +
            '<button type="button" class="report-link" id="btnReport">Report this listing</button></p>' +
            "</div>";

        var qty = 1;
        var val = document.getElementById("qtyVal");
        var dec = document.getElementById("qtyDec");
        var inc = document.getElementById("qtyInc");
        function show(animate) {
            val.textContent = qty;
            if (animate) {
                val.classList.remove("tick");
                void val.offsetWidth;
                val.classList.add("tick");
            }
            dec.disabled = qty <= 1;
            inc.disabled = qty >= p.stock;
        }
        dec.addEventListener("click", function () { if (qty > 1) { qty--; show(true); } });
        inc.addEventListener("click", function () { if (qty < p.stock) { qty++; show(true); } });
        show();

        function add() {
            for (var i = 0; i < qty; i++) addToCart(p.id);
        }
        var resetBtn = null;
        document.getElementById("btnAddCart").addEventListener("click", function () {
            add();
            var self = this;
            // "Cart to tick" by Josh Duckworth (LottieFiles), recoloured: asset/lottie/cart-tick.json
            self.innerHTML = '<span class="anim btn-anim" data-lottie="cart-tick" data-speed="1.4"><span class="ms">check</span></span>Added';
            clearTimeout(resetBtn);
            resetBtn = setTimeout(function () { self.innerHTML = '<span class="ms">add_shopping_cart</span>Add to cart'; }, 1800);
            flyToCart();
            UI.toast(qty > 1 ? qty + " items added to your cart" : "Added to your cart");
        });
        document.getElementById("btnBuyNow").addEventListener("click", function () {
            add();
            location.href = "cart.html";
        });
        document.getElementById("btnReport").addEventListener("click", function () { openReport(p); });

        renderStory(p);
    }

    // ---------- motion (Motion 11, loaded by the page; everything still works without it)

    var M = window.Motion;
    var EASE_OUT = [0.22, 1, 0.36, 1];

    function moving() { return !!M && UI.motion() === "full"; }

    // A copy of the product photo arcs from the gallery into the bag in the header, which then bumps.
    function flyToCart() {
        var img = document.querySelector(".detail-media img");
        var bag = document.getElementById("cart-btn");
        if (!moving() || !img || !bag) return;
        var a = img.getBoundingClientRect(), b = bag.getBoundingClientRect();
        if (b.width === 0 || a.bottom < 0) return;
        var size = Math.min(a.width, a.height) * 0.5;
        var ghost = img.cloneNode();
        ghost.className = "fly-ghost";
        ghost.removeAttribute("alt");
        ghost.style.cssText = "left:" + (a.left + (a.width - size) / 2) + "px;top:" + (a.top + (a.height - size) / 2) + "px;width:" + size + "px;height:" + size + "px";
        document.body.appendChild(ghost);
        setTimeout(function () { ghost.remove(); }, 1500); // never left behind if the flight stalls
        var dx = b.left + b.width / 2 - (a.left + a.width / 2);
        var dy = b.top + b.height / 2 - (a.top + a.height / 2);
        M.animate(ghost, { x: [0, dx * 0.45, dx], y: [0, Math.min(dy, 0) - 80, dy], scale: [1, 0.6, 0.08], opacity: [1, 1, 0.6] },
            { duration: 0.75, ease: [EASE_OUT, [0.55, 0, 0.9, 0.4]] }).then(function () {
            ghost.remove();
            M.animate(bag, { scale: [1, 1.28, 1] }, { type: "spring", bounce: 0.5, duration: 0.5 });
        });
    }

    // ---------- the story below the buy box: one panel at a time, switched by tabs

    // The overview: the opening sentence as the headline, the rest as body copy, the technology
    // titles as quick highlights, and a card with the first line of each spec group.
    function overviewHtml(p, d) {
        if (!d.overview) return "";
        var paras = d.overview.split(/\n\s*\n/).filter(Boolean);
        // one long paragraph reads better split after its first sentence
        if (paras.length === 1) {
            var cut = paras[0].search(/\.\s/);
            if (cut > 40 && cut < paras[0].length - 40) paras = [paras[0].slice(0, cut + 1), paras[0].slice(cut + 2)];
        }
        // a short opening sentence makes a better headline than "About the ..."
        var head = paras[0].length <= 140 ? paras.shift() : "About the " + p.name;
        var points = (d.features || []).slice(0, 4).map(function (f) {
            return '<li><span class="ms" aria-hidden="true">check</span>' + esc(f.title) + "</li>";
        }).join("");
        var nums = (d.specGroups && d.specGroups.length ? d.specGroups.map(function (g) {
                // the first line of each group that says more than yes or no
                return g.items.find(function (it) { return !/^(yes|no)$/i.test(it[1]); }) || [];
            }) :
            Object.keys(p.specs || {}).map(function (k) { return [k.replace(/_/g, " "), p.specs[k]]; }))
            .filter(function (x) { return x[1]; }).slice(0, 4);
        return '<div class="pd-overview"><div class="ov-copy">' +
            '<p class="ov-kicker">' + esc(UI.categoryLabel(p.category)) + (p.shop && p.shop.shopName ? " · " + esc(p.shop.shopName) : "") + "</p>" +
            '<h2 class="ov-head">' + esc(head) + "</h2>" +
            paras.map(function (x) { return '<p class="ov-body">' + esc(x) + "</p>"; }).join("") +
            (points ? '<ul class="ov-points">' + points + "</ul>" : "") + "</div>" +
            (nums.length ? '<aside class="ov-card" aria-label="Key numbers"><p class="ov-card-title">Key numbers</p><dl>' +
                nums.map(function (n) { return "<div><dt>" + esc(n[0]) + "</dt><dd>" + esc(n[1]) + "</dd></div>"; }).join("") + "</dl>" +
                (d.specGroups && d.specGroups.length ? '<button type="button" class="ov-more" data-tab="specifications">See all specifications<span class="ms" aria-hidden="true">arrow_forward</span></button>' : "") +
                "</aside>" : "") +
            "</div>";
    }

    function technologyHtml(d) {
        var f = d.features || [];
        if (!f.length) return "";
        return "<h2>The technology inside</h2>" +
            '<div class="tech tech--' + Math.min(f.length, 3) + '">' + f.slice(0, 3).map(function (x, i) {
                return '<article class="tech-tile tech-tile--' + (i + 1) + '">' +
                    '<span class="tech-icon"><span class="ms">' + esc(x.icon || "info") + "</span></span>" +
                    "<h3>" + esc(x.title) + "</h3><p>" + esc(x.body) + "</p></article>";
            }).join("") + "</div>";
    }

    function specsHtml(p, d) {
        var groups = d.specGroups && d.specGroups.length ? d.specGroups :
            // no grouped specs yet: show the short key specs as one group
            Object.keys(p.specs || {}).length ? [{ group: "Key specifications", items: Object.keys(p.specs).map(function (k) { return [k.replace(/_/g, " "), p.specs[k]]; }) }] : [];
        if (!groups.length) return "";
        return "<h2>Specifications</h2>" +
            '<div class="spec-groups">' + groups.map(function (g) {
                return '<div class="spec-group"><h3><span class="ms" aria-hidden="true">' + groupIcon(g.group) + "</span>" + esc(g.group) + "</h3><dl>" +
                    g.items.map(function (it) { return "<div><dt>" + esc(it[0]) + "</dt><dd>" + esc(it[1]) + "</dd></div>"; }).join("") +
                    "</dl></div>";
            }).join("") + "</div>" +
            '<p class="spec-note"><span class="ms" aria-hidden="true">info</span>Specifications are for reference and can differ by region, model year or configuration. Check with the seller before you buy.</p>';
    }

    function boxHtml(p, d) {
        var items = d.inTheBox || [];
        if (!items.length) return "";
        return "<h2>In the box</h2>" +
            '<ul class="box-list">' + items.map(function (it, i) {
                return '<li style="--i:' + i + '"><span class="ms" aria-hidden="true">' + (i === 0 ? "inventory_2" : "check") + "</span>" + esc(it) + "</li>";
            }).join("") + "</ul>";
    }

    function renderStory(p) {
        var d = p.details || {};
        var parts = [
            ["overview", "Overview", overviewHtml(p, d)],
            ["technology", "Technology", technologyHtml(d)],
            ["specifications", "Specifications", specsHtml(p, d)],
            ["in-the-box", "In the box", boxHtml(p, d)]
        ].filter(function (x) { return x[2]; });
        var host = document.getElementById("pd-more");
        if (!parts.length) { host.innerHTML = ""; return; }
        var start = Math.max(0, parts.findIndex(function (x) { return "#" + x[0] === location.hash; }));
        var single = parts.length === 1;
        host.innerHTML =
            (single ? "" : '<div class="pd-tabs" role="tablist" aria-label="Product details">' +
                parts.map(function (x, i) {
                    return '<button type="button" role="tab" class="pd-tab" id="pd-tab-' + x[0] + '" aria-controls="pd-panel-' + x[0] + '" aria-selected="' + (i === start) + '"' +
                        (i === start ? "" : ' tabindex="-1"') + ">" + x[1] + "</button>";
                }).join("") + '<span class="pd-tab-bar" aria-hidden="true"></span></div>') +
            '<div class="pd-stage">' + parts.map(function (x, i) {
                return '<section class="pd-panel" id="pd-panel-' + x[0] + '"' + (single ? "" : ' role="tabpanel" aria-labelledby="pd-tab-' + x[0] + '" tabindex="0"') +
                    (i === start ? "" : " hidden") + ">" + x[2] + "</section>";
            }).join("") + "</div>";
        if (!single) tabsFor(host, parts.map(function (x) { return x[0]; }), start);
    }

    // The pieces of a panel that come in one after another when it opens.
    var PANEL_ITEMS = ".pd-panel > h2, .ov-copy > *, .ov-points li, .ov-card, .tech-tile, .spec-group, .spec-note, .box-list li";

    // Tabs switch the panel in place: the bar springs to the chosen tab, the new panel slides in from
    // the side of its tab, the stage eases to the new height and the panel's pieces rise in one by one.
    function tabsFor(host, ids, current) {
        var tabs = Array.prototype.slice.call(host.querySelectorAll(".pd-tab"));
        var panels = Array.prototype.slice.call(host.querySelectorAll(".pd-panel"));
        var bar = host.querySelector(".pd-tab-bar");
        var stage = host.querySelector(".pd-stage");
        var list = host.querySelector(".pd-tabs");
        var running = [];

        // on phones the site header carries a search row, so it is taller than --nav-h
        var hdr = document.querySelector(".site-nav");
        function fit() {
            if (hdr) host.style.setProperty("--hdr-h", hdr.offsetHeight + "px");
            moveBar(false);
        }

        function moveBar(animate) {
            var t = tabs[current];
            var from = { left: bar.style.left || "0px", width: bar.style.width || "0px" };
            var to = { left: t.offsetLeft + "px", width: t.offsetWidth + "px" };
            // the bar is placed first, so it ends in the right spot even if no frame ever plays
            bar.style.left = to.left;
            bar.style.width = to.width;
            if (animate && moving()) {
                M.animate(bar, { left: [from.left, to.left], width: [from.width, to.width] }, { type: "spring", bounce: 0.22, duration: 0.5 });
            }
            // keep the chosen tab visible on narrow screens without scrolling the page
            if (t.offsetLeft < list.scrollLeft || t.offsetLeft + t.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = t.offsetLeft - 16;
        }

        // a second click while a switch is still playing jumps the old one to its end first
        function settle() {
            running.forEach(function (a) { a.stop(); });
            running = [];
            panels.forEach(function (el, i) {
                el.hidden = i !== current;
                el.style.opacity = "";
                el.style.transform = "";
            });
            stage.style.height = "";
            stage.classList.remove("is-entering");
            stage.querySelectorAll(PANEL_ITEMS).forEach(function (el) { el.style.opacity = ""; el.style.transform = ""; });
        }

        function select(i, focus) {
            if (i === current) return;
            settle();
            var from = panels[current], to = panels[i], dir = i > current ? 1 : -1;
            current = i;
            tabs.forEach(function (t, k) {
                t.setAttribute("aria-selected", String(k === i));
                if (k === i) t.removeAttribute("tabindex"); else t.setAttribute("tabindex", "-1");
            });
            if (focus) tabs[i].focus();
            moveBar(true);
            history.replaceState(null, "", "#" + ids[i]);

            // when the tabs are stuck under the header, start the new panel right below them
            var past = stage.getBoundingClientRect().top - ((hdr ? hdr.offsetHeight : 64) + list.offsetHeight);
            if (past < 0) window.scrollTo(0, window.scrollY + past);

            // the panel changes at once; the motion only plays on top, so a paused or missing
            // animation can never leave the wrong panel showing
            var h0 = stage.offsetHeight;
            from.hidden = true;
            to.hidden = false;
            if (!moving()) return;
            var h1 = stage.offsetHeight;
            stage.classList.add("is-entering");
            var grow = M.animate(stage, { height: [h0 + "px", h1 + "px"] }, { duration: 0.38, ease: EASE_OUT });
            var rise = M.animate(to.querySelectorAll(PANEL_ITEMS), { opacity: [0, 1], y: [14, 0] }, { duration: 0.42, ease: EASE_OUT, delay: M.stagger(0.045, { startDelay: 0.04 }) });
            running.push(grow, rise, M.animate(to, { opacity: [0, 1], x: [24 * dir, 0] }, { duration: 0.34, ease: EASE_OUT }));
            grow.then(function () { if (panels[current] === to) stage.style.height = ""; });
            rise.then(function () { if (panels[current] === to) stage.classList.remove("is-entering"); });
        }

        tabs.forEach(function (t, i) {
            t.addEventListener("click", function () { select(i, false); });
        });
        // links inside a panel that open another tab ("See all specifications")
        stage.addEventListener("click", function (e) {
            var go = e.target.closest("[data-tab]");
            var i = go ? ids.indexOf(go.dataset.tab) : -1;
            if (i >= 0) select(i, true);
        });
        // arrow keys move along the tabs (and open them), Home and End jump to the ends
        list.addEventListener("keydown", function (e) {
            var k = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 }[e.key];
            if (k === undefined) return;
            e.preventDefault();
            select((k + tabs.length) % tabs.length, true);
        });

        fit();
        window.addEventListener("resize", fit);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    }

    // ---------- report a listing (customers only; three reports send it to the moderation queue)

    var REPORT_REASONS = [
        ["counterfeit", "Fake or a copy of a brand"],
        ["prohibited", "Not allowed to be sold"],
        ["misleading", "Wrong photo, title or price"],
        ["offplatform", "Asks to pay or chat outside EC SHOP"],
        ["other", "Something else"]
    ];

    function openReport(p) {
        var user = getCurrentUser();
        if (!user) { UI.openAuth("login"); return; }
        if (user.role !== "customer") { UI.toast("Only customer accounts can report a listing", "error"); return; }

        var dlg = document.createElement("dialog");
        dlg.className = "addr-dialog report-dialog";
        dlg.setAttribute("aria-labelledby", "rpTitle");
        dlg.innerHTML = '<form class="addr-dialog-form" novalidate>' +
            '<header class="addr-dialog-head"><h2 id="rpTitle">Report this listing</h2>' +
            '<button type="button" class="icon-btn" data-close aria-label="Close"><span class="ms">close</span></button></header>' +
            '<div class="addr-dialog-body">' +
            '<p class="report-lead">Our team reviews reported listings. The seller is not told who reported it.</p>' +
            '<p class="report-product"><img src="' + esc(p.image) + '" alt=""><span>' + esc(p.name) + "</span></p>" +
            '<fieldset class="report-reasons"><legend>What is wrong?</legend>' +
            REPORT_REASONS.map(function (r, i) {
                return '<label class="report-reason"><input type="radio" name="reason" value="' + r[0] + '"' + (i === 0 ? " required" : "") + "><span>" + r[1] + "</span></label>";
            }).join("") + "</fieldset>" +
            '<div class="field"><label for="rpNote">Details <span class="muted">(optional)</span></label>' +
            '<textarea class="textarea" id="rpNote" rows="3" maxlength="500" placeholder="What did you notice?"></textarea></div>' +
            '<p class="error" id="rpError" role="alert" hidden></p></div>' +
            '<footer class="addr-dialog-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button>' +
            '<button type="submit" class="btn btn-primary">Send report</button></footer></form>';
        document.body.appendChild(dlg);
        dlg.addEventListener("close", function () { dlg.remove(); });
        dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
        dlg.querySelector("form").addEventListener("submit", async function (e) {
            e.preventDefault();
            var picked = dlg.querySelector('input[name="reason"]:checked');
            var err = dlg.querySelector("#rpError");
            err.hidden = true;
            if (!picked) {
                err.textContent = "Choose what is wrong with the listing.";
                err.hidden = false;
                dlg.querySelector('input[name="reason"]').focus();
                return;
            }
            var btn = dlg.querySelector('[type="submit"]');
            btn.disabled = true;
            try {
                await Api.moderation.report(p.id, picked.value, dlg.querySelector("#rpNote").value.trim());
                dlg.close();
                UI.toast("Thanks, our team will take a look");
                document.getElementById("btnReport").outerHTML = '<span class="report-done">Reported, thank you</span>';
            } catch (ex) {
                if (ex.status === 409) {
                    dlg.close();
                    UI.toast("You already reported this listing");
                    return;
                }
                err.textContent = ex.message;
                err.hidden = false;
                btn.disabled = false;
            }
        });
        dlg.showModal();
        dlg.querySelector('input[name="reason"]').focus();
    }

    async function renderRelated(p) {
        try {
            var res = await Api.products.list({ category: p.category, limit: 5 });
            var related = res.items.filter(function (x) { return x.id !== p.id; }).slice(0, 4);
            if (!related.length) return;
            document.getElementById("related-list").innerHTML = related.map(UI.productCard).join("");
            document.getElementById("related-section").hidden = false;
        } catch (e) { /* related products are optional */ }
    }

    async function init() {
        var id = parseInt(new URLSearchParams(location.search).get("id"), 10);
        if (!id) { notFound(); return; }
        var product = null;
        try { product = await Api.products.get(id); } catch (e) { product = null; }
        if (!product) { notFound(); return; }
        renderDetail(product);
        renderRelated(product);
    }

    document.addEventListener("DOMContentLoaded", init);

})();
