// main.js — Trang Home của Customer (page logic)

var allProducts = [];
var filteredProducts = [];
var currentCategory = "all";
var currentQuery = "";
var loadSeq = 0;
var searchTimer = null;
var hasShownPromotionPopup = false;


// -- Init (khởi tạo) --------------------------------------------

async function initializeApp() {
    showPromotionPopup();
    initializeEventListeners();
    await loadProducts();
}

// Customer pages only get products an admin approved; the API enforces that.
async function loadProducts() {
    var seq = ++loadSeq;
    try {
        var page = await Api.products.list({
            category: currentCategory === "all" ? undefined : currentCategory,
            q: currentQuery,
            limit: 24
        });
        if (seq !== loadSeq) return; // a newer request superseded this one
        allProducts = page.items;
        filteredProducts = page.items;
        renderProducts(filteredProducts);
    } catch (e) {
        if (seq !== loadSeq) return;
        var container = document.getElementById("productContainer");
        if (container) container.innerHTML = '<div class="no-products"><h4>Could not load products</h4><p>' + Api.escapeHtml(e.message) + '</p></div>';
    }
}


// -- Promotion Modal (khuyến mãi) --------------------------------

function showPromotionPopup() {
    if (hasShownPromotionPopup) return;
    var el = document.getElementById("promotionModal");
    if (!el) return;
    var modal = new bootstrap.Modal(el);
    modal.show();
    hasShownPromotionPopup = true;
}


// -- Price Helpers (tiện ích về giá) -----------------------------

function calculateDiscount(oldPrice, newPrice) {
    if (!oldPrice || oldPrice <= newPrice) return 0;
    return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

function formatPrice(price) {
    return price.toLocaleString("en-US");
}


// -- Image Fallback (ảnh fallback) -------------------------------

function handleProductImageError(imageEl) {
    if (!imageEl) return;
    if (imageEl.dataset.fallbackApplied === "1") return;
    imageEl.dataset.fallbackApplied = "1";
    imageEl.src = "../asset/img/404.png";
}


// -- Star Rating (đánh giá sao) 

function generateStarRating(rating) {
    var stars = "";
    var full = Math.floor(rating);
    var hasHalf = rating % 1 !== 0;

    for (var i = 0; i < full; i++) {
        stars += '<i class="fas fa-star"></i>';
    }
    if (hasHalf) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }
    var empty = 5 - Math.ceil(rating);
    for (var j = 0; j < empty; j++) {
        stars += '<i class="far fa-star"></i>';
    }
    return stars;
}


// -- Render Products --------------------------------------------

function renderProducts(products) {
    var container = document.getElementById("productContainer");
    if (!container) return;

    container.innerHTML = "";

    if (products.length === 0) {
        container.innerHTML =
            '<div style="grid-column: 1 / -1;">' +
                '<div class="no-products">' +
                    '<i class="fas fa-inbox"></i>' +
                    '<h4>No products found</h4>' +
                    '<p>Try selecting a different category or search term.</p>' +
                '</div>' +
            '</div>';
        return;
    }

    for (var i = 0; i < products.length; i++) {
        var product = products[i];
        var discount = calculateDiscount(product.oldPrice, product.price);
        var stars = generateStarRating(product.rating);

        var col = document.createElement("div");
        col.className = "product-item";

        var card = document.createElement("div");
        card.className = "card product-card h-100 position-relative";
        card.innerHTML =
            (discount > 0 ? '<div class="product-discount-badge">-' + discount + '%</div>' : '') +
            '<div class="product-actions">' +
                '<button class="action-btn wishlist-btn" title="Add to Wishlist">' +
                    '<i class="fas fa-heart"></i>' +
                '</button>' +
                '<button class="action-btn view-btn" onclick="viewProduct(' + product.id + ')" title="View Details">' +
                    '<i class="fas fa-eye"></i>' +
                '</button>' +
            '</div>' +
            '<div class="product-image-wrapper">' +
                '<img src="' + Api.escapeHtml(product.image) + '" alt="' + Api.escapeHtml(product.name) + '" class="product-card-img product-card-img-crop" onerror="handleProductImageError(this)">' +
            '</div>' +
            '<div class="product-card-body">' +
                '<h6 class="product-name">' + Api.escapeHtml(product.name) + '</h6>' +
                '<div class="product-price-section">' +
                    '<span class="product-price-new">$' + formatPrice(product.price) + '</span>' +
                    (product.oldPrice ? '<span class="product-price-old">$' + formatPrice(product.oldPrice) + '</span>' : '') +
                '</div>' +
                '<div class="product-rating">' +
                    '<div class="stars">' + stars + '</div>' +
                    '<span class="review-count">(' + product.reviews + ')</span>' +
                '</div>' +
            '</div>';

        col.appendChild(card);
        container.appendChild(col);
    }
}


// -- Filter & Search --------------------------------------------

function filterProducts(category) {
    currentCategory = category;
    loadProducts();
}

function searchProducts(query) {
    currentQuery = (query || "").trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadProducts, 250);
}


// -- View Product -----------------------------------------------

function viewProduct(productId) {
    var toastEl = document.getElementById("comingSoonToast");
    if (toastEl && window.bootstrap) {
        bootstrap.Toast.getOrCreateInstance(toastEl).show();
    }
}


// -- Event Listeners --------------------------------------------

function initializeEventListeners() {
    // Cart button → navigate to cart
    var cartBtn = document.getElementById("cart-btn");
    if (cartBtn) cartBtn.addEventListener("click", function () {
        window.location.href = "cart.html";
    });

    // Category sidebar clicks
    var categoryItems = document.querySelectorAll(".category-item");
    for (var i = 0; i < categoryItems.length; i++) {
        categoryItems[i].addEventListener("click", function () {
            for (var j = 0; j < categoryItems.length; j++) {
                categoryItems[j].classList.remove("active");
            }
            this.classList.add("active");

            var category = this.getAttribute("data-category");
            filterProducts(category);

            // Sync filter buttons
            var filterBtns = document.querySelectorAll(".filter-btn");
            for (var k = 0; k < filterBtns.length; k++) {
                filterBtns[k].classList.remove("active");
                if (filterBtns[k].getAttribute("data-category") === category) {
                    filterBtns[k].classList.add("active");
                }
            }
        });
    }

    // Filter button clicks
    var filterBtns = document.querySelectorAll(".filter-btn");
    for (var i = 0; i < filterBtns.length; i++) {
        filterBtns[i].addEventListener("click", function () {
            for (var j = 0; j < filterBtns.length; j++) {
                filterBtns[j].classList.remove("active");
            }
            this.classList.add("active");

            var category = this.getAttribute("data-category");
            filterProducts(category);
        });
    }

    // Search input
    var searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keyup", function () {
            searchProducts(this.value);
        });
    }
}


// -- Start ------------------------------------------------------

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
} else {
    initializeApp();
}

// Expose to global (for onclick handlers in HTML)
window.viewProduct = viewProduct;
window.filterProducts = filterProducts;
window.searchProducts = searchProducts;
window.handleProductImageError = handleProductImageError;

// ── Scroll-reveal (Intersection Observer) ───────────────────────
(function () {
    var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("revealed");
                io.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    function observeRevealElements() {
        document.querySelectorAll(".reveal, .reveal-fade").forEach(function (el) {
            io.observe(el);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeRevealElements);
    } else {
        observeRevealElements();
    }
})();
