// home.js — the home page: banner carousel, category strip, deals and new arrivals (from the API).

(function () {

    // ---------- banner carousel
    // Each dot carries a progress bar (CSS animation). When the bar finishes the slideshow moves on,
    // so hovering, focusing or pausing only has to pause that animation.

    var carousel = document.getElementById("carousel");
    var slides = [].slice.call(document.querySelectorAll(".slide"));
    var dotsBox = document.getElementById("carDots");
    var playBtn = document.getElementById("carPlay");
    var current = 0;
    var stopped = false;

    slides.forEach(function (s, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "dot";
        d.setAttribute("aria-label", "Go to slide " + (i + 1));
        d.addEventListener("click", function () { go(i); });
        dotsBox.appendChild(d);
    });
    var dots = [].slice.call(dotsBox.children);

    function go(i) {
        current = (i + slides.length) % slides.length;
        slides.forEach(function (s, k) { s.classList.toggle("is-active", k === current); });
        dots.forEach(function (d, k) {
            if (k === current) d.setAttribute("aria-current", "true"); else d.removeAttribute("aria-current");
            // restart the progress bar of the dot that just became active
            if (k === current) { d.style.animation = "none"; void d.offsetWidth; d.style.animation = ""; }
        });
        carousel.dataset.theme = slides[current].dataset.theme;
    }

    function setStopped(value) {
        stopped = value;
        carousel.classList.toggle("is-stopped", stopped);
        document.getElementById("slides").setAttribute("aria-live", stopped ? "polite" : "off");
        playBtn.setAttribute("aria-label", stopped ? "Play slideshow" : "Pause slideshow");
        playBtn.firstElementChild.textContent = stopped ? "play_arrow" : "pause";
    }

    dotsBox.addEventListener("animationend", function (e) {
        if (e.animationName === "dot-fill" && !stopped) go(current + 1);
    });
    playBtn.addEventListener("click", function () { setStopped(!stopped); });
    document.getElementById("carPrev").addEventListener("click", function () { go(current - 1); });
    document.getElementById("carNext").addEventListener("click", function () { go(current + 1); });

    // paused while the pointer is over the banner or focus is inside it
    function syncPause() {
        setTimeout(function () {
            carousel.classList.toggle("is-paused", carousel.matches(":hover") || carousel.contains(document.activeElement));
        }, 0);
    }
    ["mouseenter", "mouseleave", "focusin", "focusout"].forEach(function (ev) { carousel.addEventListener(ev, syncPause); });

    // swipe on touch screens
    var startX = null;
    carousel.addEventListener("pointerdown", function (e) { if (e.pointerType === "touch") startX = e.clientX; });
    carousel.addEventListener("pointerup", function (e) {
        if (startX === null) return;
        var dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) go(current + (dx < 0 ? 1 : -1));
    });

    setStopped(stopped);
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
            '<div class="empty" style="grid-column:1/-1"><span class="ms">cloud_off</span><h3>Could not load products</h3><p>Please refresh the page.</p></div>';
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
