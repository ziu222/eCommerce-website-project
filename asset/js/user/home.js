// home.js — the home page: banner carousel, category strip, deals and new arrivals (from the API).

(function () {

    // ---------- banner carousel
    // Next to the banner a rail lists every slide (picture, tag, title). The active item carries a progress bar
    // (a CSS animation); when it finishes the banner moves on by itself. Hovering or focusing the banner pauses that animation.

    var carousel = document.getElementById("carousel");
    var slides = [].slice.call(document.querySelectorAll(".slide"));
    var rail = document.getElementById("carRail");
    var current = 0;

    slides.forEach(function (s, i) {
        var li = document.createElement("li");
        li.innerHTML = '<button type="button" class="rail-item" data-theme="' + s.dataset.theme + '">' +
            '<img src="' + s.querySelector("img").getAttribute("src") + '" alt="">' +
            '<span class="rail-text"><span class="rail-tag">' + Api.escapeHtml(s.dataset.tag) + "</span>" +
            '<span class="rail-title">' + Api.escapeHtml(s.dataset.title) + "</span></span>" +
            '<span class="rail-bar" aria-hidden="true"></span></button>';
        li.firstChild.addEventListener("click", function () { go(i); });
        rail.appendChild(li);
    });
    var items = [].slice.call(rail.querySelectorAll(".rail-item"));

    function go(i) {
        current = (i + slides.length) % slides.length;
        slides.forEach(function (s, k) { s.classList.toggle("is-active", k === current); });
        items.forEach(function (it, k) {
            if (k === current) it.setAttribute("aria-current", "true"); else it.removeAttribute("aria-current");
        });
        // restart the progress bar of the item that just became active
        var bar = items[current].querySelector(".rail-bar");
        bar.style.animation = "none";
        void bar.offsetWidth;
        bar.style.animation = "";
        carousel.dataset.theme = slides[current].dataset.theme;
        // keep the active item in view when the rail scrolls sideways on phones
        if (rail.scrollWidth > rail.clientWidth) rail.scrollTo({ left: items[current].parentNode.offsetLeft - 16, behavior: "smooth" });
    }

    rail.addEventListener("animationend", function (e) {
        if (e.animationName === "dot-fill") go(current + 1);
    });

    // paused while the pointer is over the banner or the rail, or focus is inside them
    var hero = document.querySelector(".hero");
    function syncPause() {
        setTimeout(function () {
            hero.classList.toggle("is-paused", hero.matches(":hover") || hero.contains(document.activeElement));
        }, 0);
    }
    ["mouseenter", "mouseleave", "focusin", "focusout"].forEach(function (ev) { hero.addEventListener(ev, syncPause); });

    // swipe on touch screens
    var startX = null;
    carousel.addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") startX = e.clientX; });
    carousel.addEventListener("pointerup", function (e) {
        if (startX === null) return;
        var dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
    });

    go(0);

    // ---------- products

    function grid(id, products, empty) {
        var el = document.getElementById(id);
        el.innerHTML = products.length
            ? products.map(UI.productCard).join("")
            : '<div class="empty" style="grid-column:1/-1"><span class="ms">inventory_2</span><h3>' + empty + "</h3></div>";
    }

    function failed(id) {
        document.getElementById(id).innerHTML =
            UI.errorState("Could not load products");
    }

    document.getElementById("catList").innerHTML = UI.CATEGORIES.map(function (c) {
        return '<li><a class="cat-tile" href="product.html?category=' + c.key + '"><span class="ms">' + c.icon + "</span>" + c.label + "</a></li>";
    }).join("");

    document.getElementById("dealsGrid").innerHTML = UI.skeletons(4);
    document.getElementById("newGrid").innerHTML = UI.skeletons(4);

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
