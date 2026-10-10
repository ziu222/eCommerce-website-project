// home.js — the home page: category strip, featured products, deals and new arrivals, all from the API.

(function () {

    function grid(id, products, empty) {
        var el = document.getElementById(id);
        el.innerHTML = products.length
            ? products.map(UI.productCard).join("")
            : '<div class="empty" style="grid-column:1/-1"><span class="ms">inventory_2</span><h3>' + empty + "</h3></div>";
    }

    function failed(id) {
        document.getElementById(id).innerHTML =
            '<div class="empty" style="grid-column:1/-1"><span class="ms">cloud_off</span><h3>Could not load products</h3><p>Please refresh the page.</p></div>';
    }

    function heroTile(p) {
        return '<a class="hero-tile" href="product-detail.html?id=' + p.id + '">' +
            '<img src="' + Api.escapeHtml(p.image) + '" alt=""' + (UI.isPlaceholder(p.image) ? ' class="is-ph"' : "") + ' data-category="' + Api.escapeHtml(p.category) + '">' +
            '<span class="hero-tile-name">' + Api.escapeHtml(p.name) + "</span>" +
            '<span class="hero-tile-price">' + UI.money(p.price) + "</span></a>";
    }

    document.getElementById("catList").innerHTML = UI.CATEGORIES.map(function (c) {
        return '<li><a class="cat-tile" href="product.html?category=' + c.key + '"><span class="ms">' + c.icon + "</span>" + c.label + "</a></li>";
    }).join("");

    document.getElementById("dealsGrid").innerHTML = UI.skeletons(4);
    document.getElementById("newGrid").innerHTML = UI.skeletons(4);

    Api.products.list({ sort: "rating", limit: 12 }).then(function (page) {
        document.getElementById("heroFeature").innerHTML = page.items.slice(0, 4).map(heroTile).join("");
    }).catch(function () {
        document.getElementById("heroFeature").hidden = true;
    });

    // The API has no "discounted" filter, so take the first page and keep what has a price drop.
    Api.products.list({ limit: 60 }).then(function (page) {
        var deals = page.items.filter(function (p) { return UI.discount(p) > 0; })
            .sort(function (a, b) { return UI.discount(b) - UI.discount(a); })
            .slice(0, 8);
        grid("dealsGrid", deals, "No deals right now");
    }).catch(function () { failed("dealsGrid"); });

    Api.products.list({ sort: "newest", limit: 8 }).then(function (page) {
        grid("newGrid", page.items, "Nothing new yet");
    }).catch(function () { failed("newGrid"); });

})();
