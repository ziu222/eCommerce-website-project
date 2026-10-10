// ui.js — the shared shell of the customer pages (header, footer) and the small helpers every page uses:
// money, stars, the product card, toasts. Pages put <header id="site-header" data-active="home"></header>
// and <footer id="site-footer"></footer> in the markup; this file fills them in.

var UI = (function () {

    var esc = function (s) { return Api.escapeHtml(s); };

    // Motion setting: follows the system's "reduce motion" unless the visitor turned full animations on (footer switch).
    var MOTION_KEY = "ecshop_motion";
    var systemReduces = window.matchMedia("(prefers-reduced-motion: reduce)");

    function motionMode() {
        var saved = null;
        try { saved = localStorage.getItem(MOTION_KEY); } catch (e) { /* private mode */ }
        return saved === "full" || !systemReduces.matches ? "full" : "reduced";
    }

    function applyMotion() {
        document.documentElement.dataset.motion = motionMode();
    }
    applyMotion();

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

    // Volt, the mascot: "happy" | "sad" | "" (calm). Decorative, so no alt text.
    function mascot(mood, size) {
        return '<img class="mascot" src="../asset/brand/mascot' + (mood ? "-" + mood : "") + '.svg" alt="" width="' + (size || 96) + '" height="' + (size || 96) + '">';
    }

    // A friendly error block with Volt looking sorry and a way to try again.
    function errorState(title, text) {
        return '<div class="empty error-state" style="grid-column:1/-1">' + mascot("sad", 104) +
            "<h3>" + esc(title) + "</h3><p>" + esc(text || "Check your connection and try again.") + "</p>" +
            '<button type="button" class="btn btn-ghost" onclick="location.reload()"><span class="ms">refresh</span>Try again</button></div>';
    }

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

    // Counts a number from where it was to its new value (money by default). Instant under "reduce motion".
    function countTo(el, to, opts) {
        opts = opts || {};
        var fmt = opts.format || money;
        var from = opts.from !== undefined ? opts.from : Number(el.dataset.value || 0);
        el.dataset.value = String(to);
        if (motionMode() === "reduced" || from === to) { el.textContent = fmt(to); return; }
        var dur = opts.duration || 800;
        var start = null;
        el.textContent = fmt(from);
        function step(t) {
            if (start === null) start = t;
            var p = Math.min(1, (t - start) / dur);
            el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
        setTimeout(function () { el.textContent = fmt(to); }, dur + 250); // in case frames were paused
    }

    // A short burst of confetti over the page, for a moment worth celebrating. Skipped under "reduce motion".
    function confetti() {
        if (motionMode() === "reduced") return;
        var layer = document.createElement("div");
        layer.className = "confetti";
        layer.setAttribute("aria-hidden", "true");
        layer.setAttribute("data-lottie", "confetti");
        layer.setAttribute("data-cover", "");
        layer.setAttribute("data-speed", "0.7");
        document.body.appendChild(layer);
        setTimeout(function () { layer.remove(); }, 2600);
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
            '<a class="brand" href="home.html"><img class="brand-logo" src="../asset/brand/logo-mark.svg" alt="" width="36" height="36"><span class="brand-word">EC<svg class="brand-bolt" viewBox="0 0 14 24" aria-hidden="true"><path d="M10 0L2 12h6l-3 11 9-14H8l3-9z"/></svg>SHOP</span></a>' +
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
            '<div class="footer-brand"><a class="brand" href="home.html"><img class="brand-logo" src="../asset/brand/logo-mark.svg" alt="" width="36" height="36"><span class="brand-word">EC<svg class="brand-bolt" viewBox="0 0 14 24" aria-hidden="true"><path d="M10 0L2 12h6l-3 11 9-14H8l3-9z"/></svg>SHOP</span></a>' +
            "<p>Phones, laptops, audio and more from verified sellers, with support that answers.</p></div>" +
            '<div class="footer-col"><h4>Shop</h4><ul>' + shop + "</ul></div>" +
            '<div class="footer-col"><h4>Help</h4><ul><li><a href="contact.html">Contact us</a></li><li><a href="about.html">About EC SHOP</a></li>' +
            '<li><a href="#" data-open-support>Chat with support</a></li></ul></div>' +
            '<div class="footer-col"><h4>Account</h4><ul><li><a href="profile.html">Profile</a></li><li><a href="wallet.html">Wallet</a></li>' +
            '<li><a href="cart.html">Cart</a></li><li><a href="login.html" data-auth="login">Sign in</a></li></ul></div></div>' +
            '<div class="container footer-base"><span>© 2026 EC SHOP</span><span>Prices in USD</span>' +
            '<button type="button" class="motion-toggle" id="motionToggle" hidden></button></div>';
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
            var mt = f.querySelector("#motionToggle");
            var syncMt = function () {
                var full = document.documentElement.dataset.motion === "full";
                mt.hidden = !systemReduces.matches;
                mt.textContent = full ? "Full animations: on" : "Full animations: off";
                mt.setAttribute("aria-pressed", String(full));
            };
            mt.addEventListener("click", function () {
                try { localStorage.setItem(MOTION_KEY, document.documentElement.dataset.motion === "full" ? "system" : "full"); } catch (e) { /* private mode */ }
                applyMotion();
                syncMt();
            });
            syncMt();
        }
    }

    document.addEventListener("click", function (e) {
        var opener = e.target.closest("[data-open-support]");
        if (!opener) return;
        e.preventDefault();
        if (window.SupportChat) SupportChat.open();
    });

    // ---------- Sign in / sign up sheet
    // The sheet (auth-sheet.js and its CSS) is fetched the first time it is needed, or at idle time for a visitor who is
    // not signed in. UI.openAuth("login" | "signup", { required, next }) opens it over the current page.

    var authReady = null;

    function preloadAuth() {
        if (!authReady) {
            var css = new Promise(function (resolve, reject) {
                var l = document.createElement("link");
                l.rel = "stylesheet";
                l.href = "../asset/css/auth-sheet.css";
                l.onload = resolve;
                l.onerror = reject;
                document.head.appendChild(l);
            });
            var js = new Promise(function (resolve, reject) {
                var s = document.createElement("script");
                s.src = "../asset/js/user/auth-sheet.js";
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
            authReady = Promise.all([css, js]);
        }
        return authReady;
    }

    function openAuth(mode, options) {
        return preloadAuth().then(function () { window.AuthSheet.open(mode, options); }).catch(function () {
            // the sheet could not load: fall back to the plain page
            location.href = "login.html" + (mode === "signup" ? "?auth=signup" : "");
        });
    }

    // For pages that need an account: the sheet opens over the page and closing it without signing in leads home.
    function requireLogin() {
        return openAuth("login", { required: true });
    }

    function signedInCustomer() {
        try { return !!JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { return false; }
    }

    document.addEventListener("click", function (e) {
        var link = e.target.closest("[data-auth]");
        if (!link) return;
        e.preventDefault();
        openAuth(link.dataset.auth);
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
        var loop = el.hasAttribute("data-loop") && motionMode() === "full";
        var fit = el.hasAttribute("data-cover") ? ' preserveAspectRatio="xMidYMid slice"' : "";
        var speed = el.dataset.speed || "1";
        loadPlayer().then(function () {
            el.innerHTML = '<lottie-player src="../asset/lottie/' + el.dataset.lottie + '.json" background="transparent" speed="' + speed + '"' + fit +
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

    var REVEAL = ".page-head, main > section:not(.hero), .card, .pcard, .promise li, .how li, .facts li, .cat-tile, .order, .help-band, .detail-media, .detail-info > *, .auth-panel > *";

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

    if (!document.querySelector('link[rel="icon"]')) {
        var icon = document.createElement("link");
        icon.rel = "icon";
        icon.type = "image/svg+xml";
        icon.href = "../asset/brand/logo-mark.svg";
        document.head.appendChild(icon);
    }
    mount();
    initMotion();
    if (!signedInCustomer()) {
        var wanted = new URLSearchParams(location.search).get("auth");
        if (wanted === "login" || wanted === "signup") openAuth(wanted);
        else if (window.requestIdleCallback) requestIdleCallback(preloadAuth); else setTimeout(preloadAuth, 1500);
    }
    mountAnimations(document.body);
    new MutationObserver(function (records) {
        records.forEach(function (r) {
            [].forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) mountAnimations(n); });
        });
    }).observe(document.body, { childList: true, subtree: true });

    return { mascot: mascot, errorState: errorState, openAuth: openAuth, requireLogin: requireLogin, preloadAuth: preloadAuth, motion: motionMode, countTo: countTo, confetti: confetti, isPlaceholder: isPlaceholder, CATEGORIES: CATEGORIES, categoryLabel: categoryLabel, money: money, stars: stars, discount: discount, productCard: productCard, skeletons: skeletons, toast: toast, fallbackFor: fallbackFor };

})();
