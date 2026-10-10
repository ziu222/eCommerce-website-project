// ui.js — the shared shell of the customer pages (header, footer) and the small helpers every page uses:
// money, stars, the product card, toasts. Pages put <header id="site-header" data-active="home"></header>
// and <footer id="site-footer"></footer> in the markup; this file fills them in.

var UI = (function () {

    var esc = function (s) { return Api.escapeHtml(s); };

    var CATEGORIES = [
        { key: "smartphone", label: "Smartphones", icon: "smartphone" },
        { key: "laptops", label: "Laptops", icon: "laptop_mac" },
        { key: "wearables", label: "Wearables", icon: "watch" },
        { key: "audio", label: "Audio", icon: "headphones" },
        { key: "cameras", label: "Cameras", icon: "photo_camera" },
        { key: "gaming", label: "Gaming", icon: "sports_esports" }
    ];

    var NAV = [
        { id: "home", label: "Home", href: "home.html" },
        { id: "product", label: "Shop", href: "product.html" },
        { id: "about", label: "About", href: "about.html" },
        { id: "contact", label: "Contact", href: "contact.html" }
    ];

    function categoryLabel(key) {
        var c = CATEGORIES.filter(function (x) { return x.key === key; })[0];
        return c ? c.label : key;
    }

    function money(n) {
        return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
    }

    // Five stars filled to the rating (4.3 fills 86%).
    function stars(rating) {
        var pct = Math.max(0, Math.min(5, Number(rating) || 0)) * 20;
        return '<span class="stars" style="--p:' + pct + '%" role="img" aria-label="Rated ' + Number(rating).toFixed(1) + ' out of 5">★★★★★</span>';
    }

    function discount(p) {
        return p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    }

    // Product photos that no longer load fall back to the category picture.
    function fallbackFor(category) {
        var known = CATEGORIES.some(function (c) { return c.key === category; });
        return "../asset/img/placeholder/" + (known ? category : "default") + ".svg";
    }

    document.addEventListener("error", function (e) {
        var img = e.target;
        if (!img || img.tagName !== "IMG" || img.dataset.category === undefined || img.dataset.fellBack) return;
        img.dataset.fellBack = "1";
        img.classList.add("is-ph");
        img.src = fallbackFor(img.dataset.category);
    }, true);

    function isPlaceholder(src) { return String(src).indexOf("/placeholder/") !== -1; }

    // ---------- product card (home, catalogue, related)

    function productCard(p) {
        var off = discount(p);
        var inStock = p.stock > 0;
        var href = "product-detail.html?id=" + p.id;
        var shop = p.shop && p.shop.shopName ? " · " + esc(p.shop.shopName) : "";
        return '<article class="pcard">' +
            '<a class="pcard-media" href="' + href + '" tabindex="-1" aria-hidden="true">' +
            '<img loading="lazy" src="' + esc(p.image) + '" alt=""' + (isPlaceholder(p.image) ? ' class="is-ph"' : "") + ' data-category="' + esc(p.category) + '">' +
            (off ? '<span class="badge badge-sale">-' + off + "%</span>" : "") + "</a>" +
            '<div class="pcard-body">' +
            '<p class="pcard-cat">' + esc(categoryLabel(p.category)) + shop + "</p>" +
            '<h3 class="pcard-name"><a href="' + href + '">' + esc(p.name) + "</a></h3>" +
            '<p class="pcard-rating">' + stars(p.rating) + "<span>" + Number(p.rating).toFixed(1) + " (" + p.reviews + ")</span></p>" +
            '<div class="pcard-foot"><div class="price"><b>' + money(p.price) + "</b>" + (off ? "<s>" + money(p.oldPrice) + "</s>" : "") + "</div>" +
            (inStock
                ? '<button type="button" class="pcard-add" data-add="' + p.id + '" aria-label="Add ' + esc(p.name) + ' to cart"><span class="ms">add_shopping_cart</span></button>'
                : '<span class="pcard-out">Sold out</span>') +
            "</div></div></article>";
    }

    function skeletons(n) {
        return new Array(n + 1).join('<div class="skel pcard-skel"></div>');
    }

    // ---------- toast

    function toast(message, kind) {
        var stack = document.getElementById("toastStack");
        if (!stack) {
            stack = document.createElement("div");
            stack.id = "toastStack";
            stack.className = "toast-stack";
            stack.setAttribute("role", "status");
            stack.setAttribute("aria-live", "polite");
            document.body.appendChild(stack);
        }
        var t = document.createElement("div");
        t.className = "toast" + (kind === "error" ? " is-error" : "");
        t.innerHTML = '<span class="ms">' + (kind === "error" ? "error" : "check_circle") + "</span><span>" + esc(message) + "</span>";
        stack.appendChild(t);
        setTimeout(function () { t.remove(); }, 2800);
    }

    // The round button turns into a green check for a moment.
    function confirmAdd(btn) {
        var icon = btn.querySelector(".ms");
        if (!icon || btn.classList.contains("added")) return;
        btn.classList.add("added");
        icon.textContent = "check";
        setTimeout(function () { btn.classList.remove("added"); icon.textContent = "add_shopping_cart"; }, 1400);
    }

    // Any button with data-add="<product id>" puts that product in the cart.
    document.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-add]");
        if (!btn || btn.disabled) return;
        var id = Number(btn.dataset.add);
        var before = typeof getCartCount === "function" ? getCartCount() : 0;
        if (typeof addToCart === "function") addToCart(id);
        if (typeof getCartCount === "function" && getCartCount() > before) {
            toast("Added to your cart");
            confirmAdd(btn);
        }
        else toast("Could not add this item. Open the product and try again.", "error");
    });

    // ---------- shell

    function header(active) {
        var links = NAV.map(function (n) {
            return '<a href="' + n.href + '"' + (n.id === active ? ' aria-current="page"' : "") + ">" + n.label + "</a>";
        }).join("");
        return '<div class="site-nav-inner container">' +
            '<a class="brand" href="home.html"><span class="brand-mark" aria-hidden="true">EC</span>EC SHOP</a>' +
            '<nav class="nav-links" id="navLinks" aria-label="Main">' + links + "</nav>" +
            '<form class="nav-search" action="product.html" role="search"><span class="ms" aria-hidden="true">search</span>' +
            '<input type="search" name="q" placeholder="Search products" aria-label="Search products" autocomplete="off"></form>' +
            '<div class="nav-actions">' +
            '<div class="user-wrap"><button type="button" id="userBtn" class="user-btn" aria-haspopup="true"><span id="userContent"></span></button>' +
            '<div id="userMenu" class="user-menu hidden"></div></div>' +
            '<a id="cart-btn" class="cart-link" href="cart.html" aria-label="Cart"><span class="ms">shopping_bag</span>' +
            '<span id="cart-count" class="cart-count" style="display:none">0</span></a>' +
            '<button type="button" class="icon-btn nav-toggle" id="navToggle" aria-expanded="false" aria-controls="navLinks" aria-label="Open menu"><span class="ms">menu</span></button>' +
            "</div></div>";
    }

    function footer() {
        var shop = CATEGORIES.map(function (c) {
            return '<li><a href="product.html?category=' + c.key + '">' + c.label + "</a></li>";
        }).join("");
        return '<div class="container footer-grid">' +
            '<div class="footer-brand"><a class="brand" href="home.html"><span class="brand-mark" aria-hidden="true">EC</span>EC SHOP</a>' +
            "<p>Phones, laptops, audio and more from verified sellers, with support that answers.</p></div>" +
            '<div class="footer-col"><h4>Shop</h4><ul>' + shop + "</ul></div>" +
            '<div class="footer-col"><h4>Help</h4><ul><li><a href="contact.html">Contact us</a></li><li><a href="about.html">About EC SHOP</a></li>' +
            '<li><a href="#" data-open-support>Chat with support</a></li></ul></div>' +
            '<div class="footer-col"><h4>Account</h4><ul><li><a href="profile.html">Profile</a></li><li><a href="wallet.html">Wallet</a></li>' +
            '<li><a href="cart.html">Cart</a></li><li><a href="login.html">Sign in</a></li></ul></div></div>' +
            '<div class="container footer-base"><span>© 2026 EC SHOP</span><span>Prices in USD</span></div>';
    }

    function mount() {
        var h = document.getElementById("site-header");
        if (h) {
            h.className = "site-nav";
            h.innerHTML = header(h.dataset.active);
            var toggle = h.querySelector("#navToggle");
            var links = h.querySelector("#navLinks");
            toggle.addEventListener("click", function () {
                var open = links.classList.toggle("is-open");
                toggle.setAttribute("aria-expanded", String(open));
                toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
                toggle.firstChild.textContent = open ? "close" : "menu";
            });
            // The shop page has its own search box, so the header one would only repeat it.
            if (document.getElementById("filter-search")) h.querySelector(".nav-search").hidden = true;
            var q = new URLSearchParams(location.search).get("q");
            if (q) h.querySelector(".nav-search input").value = q;
        }
        var f = document.getElementById("site-footer");
        if (f) {
            f.className = "site-footer";
            f.innerHTML = footer();
        }
    }

    document.addEventListener("click", function (e) {
        var opener = e.target.closest("[data-open-support]");
        if (!opener) return;
        e.preventDefault();
        if (window.SupportChat) SupportChat.open();
    });

    // ---------- Lottie animations
    // Put <span class="anim" data-lottie="name" data-loop><span class="ms">fallback_icon</span></span> anywhere (also in
    // markup added later). The player script is fetched the first time one is needed; until then, and if it cannot be
    // loaded, the fallback icon inside stays. Files live in asset/lottie/.

    var PLAYER = "https://cdn.jsdelivr.net/npm/@lottiefiles/lottie-player@2.0.3/dist/lottie-player.js";
    var playerReady = null;

    function loadPlayer() {
        if (!playerReady) {
            playerReady = new Promise(function (resolve, reject) {
                var s = document.createElement("script");
                s.src = PLAYER;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        return playerReady;
    }

    function mountAnimation(el) {
        if (el.hasAttribute("data-lottie-ready")) return;
        el.setAttribute("data-lottie-ready", "");
        // under "reduce motion" a loop plays once instead of repeating
        var loop = el.hasAttribute("data-loop") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        loadPlayer().then(function () {
            el.innerHTML = '<lottie-player src="../asset/lottie/' + el.dataset.lottie + '.json" background="transparent" speed="1"' +
                (loop ? " loop" : "") + " autoplay></lottie-player>";
        }).catch(function () { /* the fallback icon stays */ });
    }

    function mountAnimations(root) {
        if (root.matches && root.matches("[data-lottie]")) mountAnimation(root);
        if (root.querySelectorAll) [].forEach.call(root.querySelectorAll("[data-lottie]"), mountAnimation);
    }

    // ---------- motion
    // Elements that match REVEAL rise in as they scroll into view. The marker is removed once the
    // animation is done so hover effects on the same element work normally. Under "reduce motion" the CSS keeps only the fade.

    var REVEAL = ".page-head, main > section:not(.hero), .card, .pcard, .promise li, .how li, .facts li, .cat-tile, .order, .help-band, .detail-media, .detail-info > *";

    function initMotion() {
        var header = document.getElementById("site-header");
        if (header) {
            var onScroll = function () { header.classList.toggle("is-stuck", window.scrollY > 8); };
            window.addEventListener("scroll", onScroll, { passive: true });
            onScroll();
        }
        if (!("IntersectionObserver" in window)) return;

        document.documentElement.classList.add("js-reveal");
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var el = entry.target;
                io.unobserve(el);
                el.classList.add("in");
                var delay = 700 + (Number(el.style.getPropertyValue("--i")) || 0) * 70 + 100;
                setTimeout(function () {
                    el.removeAttribute("data-reveal");
                    el.classList.remove("in");
                    el.style.removeProperty("--i");
                }, delay);
            });
        }, { threshold: 0.1, rootMargin: "0px 0px -30px 0px" });

        function tag(el) {
            if (el.hasAttribute("data-reveal") || el.closest(".sc-panel, .site-nav, .site-footer, .modal-backdrop")) return;
            var pos = Array.prototype.indexOf.call(el.parentNode.children, el);
            el.style.setProperty("--i", String(pos < 0 ? 0 : pos % 6));
            el.setAttribute("data-reveal", "");
            io.observe(el);
        }
        function scan(root) {
            if (root.matches && root.matches(REVEAL)) tag(root);
            if (root.querySelectorAll) [].forEach.call(root.querySelectorAll(REVEAL), tag);
        }

        scan(document.body);
        new MutationObserver(function (records) {
            records.forEach(function (r) {
                [].forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) scan(n); });
            });
        }).observe(document.body, { childList: true, subtree: true });
    }

    mount();
    initMotion();
    mountAnimations(document.body);
    new MutationObserver(function (records) {
        records.forEach(function (r) {
            [].forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) mountAnimations(n); });
        });
    }).observe(document.body, { childList: true, subtree: true });

    return { isPlaceholder: isPlaceholder, CATEGORIES: CATEGORIES, categoryLabel: categoryLabel, money: money, stars: stars, discount: discount, productCard: productCard, skeletons: skeletons, toast: toast, fallbackFor: fallbackFor };

})();
