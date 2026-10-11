// product-detail.js — one product: photo, price, stock, quantity and add to cart, then related products.

(function () {

    var esc = Api.escapeHtml;

    function notFound() {
        document.getElementById("detail-content").innerHTML =
            '<div class="empty" style="grid-column:1/-1">' + UI.mascot("sad", 104) + '<h3>We could not find this product</h3>' +
            '<a class="btn btn-primary" href="product.html">Back to the shop</a></div>';
    }

    function specsHtml(specs) {
        var keys = Object.keys(specs || {});
        if (!keys.length) return "";
        return '<section class="specs" aria-labelledby="specsTitle"><h2 id="specsTitle">Specifications</h2><dl>' +
            keys.map(function (k) { return "<dt>" + esc(k.replace(/_/g, " ")) + "</dt><dd>" + esc(specs[k]) + "</dd>"; }).join("") +
            "</dl></section>";
    }

    function stockHtml(stock) {
        if (stock <= 0) return '<p class="detail-stock out-stock"><span class="ms">cancel</span>Sold out</p>';
        if (stock <= 5) return '<p class="detail-stock low-stock"><span class="ms">schedule</span>Only ' + stock + " left</p>";
        return '<p class="detail-stock in-stock"><span class="ms">check_circle</span>In stock</p>';
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
            stockHtml(p.stock) +
            '<div class="detail-actions">' +
            '<div class="qty" role="group" aria-label="Quantity"><button type="button" id="qtyDec" aria-label="Decrease quantity">−</button>' +
            '<output id="qtyVal" aria-live="polite">1</output><button type="button" id="qtyInc" aria-label="Increase quantity">+</button></div>' +
            '<button type="button" class="btn btn-primary btn-lg" id="btnAddCart"' + (inStock ? "" : " disabled") + '><span class="ms">add_shopping_cart</span>Add to cart</button>' +
            '<button type="button" class="btn btn-ghost btn-lg" id="btnBuyNow"' + (inStock ? "" : " disabled") + ">Buy now</button>" + UI.heart(p.id, p.name, "detail-heart") + "</div>" +
            '<ul class="detail-perks"><li><span class="ms">local_shipping</span>Free delivery on every order</li>' +
            '<li><span class="ms">autorenew</span>30-day returns</li>' +
            '<li><span class="ms">support_agent</span>Questions? <a href="#" data-open-support>Ask our assistant</a></li>' +
            '<li><span class="ms">warning</span>Something wrong with this listing? <button type="button" class="report-link" id="btnReport">Report it</button></li></ul>' +
            specsHtml(p.specs) + "</div>";

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
        document.getElementById("btnAddCart").addEventListener("click", function () {
            add();
            var self = this;
            self.innerHTML = '<span class="ms">check</span>Added';
            setTimeout(function () { self.innerHTML = '<span class="ms">add_shopping_cart</span>Add to cart'; }, 1400);
            UI.toast(qty > 1 ? qty + " items added to your cart" : "Added to your cart");
        });
        document.getElementById("btnBuyNow").addEventListener("click", function () {
            add();
            location.href = "cart.html";
        });
        document.getElementById("btnReport").addEventListener("click", function () { openReport(p); });
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
