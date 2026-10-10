const PAGE_SIZE = 12;
const SORT_PARAM = { "default": "default", "price-asc": "price_asc", "price-desc": "price_desc", "rating": "rating", "newest": "newest" };

function renderStars(rating) {
    const full  = Math.floor(rating);
    const half  = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(empty);
}

function renderProducts(products) {
    const container = document.getElementById("product-list");

    if (!products.length) {
        container.innerHTML = '<p style="text-align:center;padding:60px;color:var(--muted-text);">Không tìm thấy sản phẩm nào.</p>';
        return;
    }

    container.innerHTML = products.map((p, idx) => {
        const price       = Number(p.price);
        const oldPrice    = Number(p.oldPrice);
        const discountPct = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
        const inStock     = p.stock > 0;
        const animDelay   = (idx % 8) * 0.05;

        return `
        <div class="product-card" style="animation-delay:${animDelay}s"
             onclick="goToDetail(event, ${p.id})">

            <div class="product-img-wrap">
                <img src="${Api.escapeHtml(p.image)}" alt="${Api.escapeHtml(p.name)}" onerror="this.onerror=null;this.src='../asset/img/404.png'" />
                ${discountPct > 0 ? `<span class="discount-badge">-${discountPct}%</span>` : ""}
                <span class="category-chip">${Api.escapeHtml(p.category)}</span>
            </div>

            <div class="card-body">
                <div class="product-name">${Api.escapeHtml(p.name)}</div>

                <div class="product-rating">
                    <span class="stars">${renderStars(p.rating)}</span>
                    <span>${p.rating} (${p.reviews})</span>
                </div>

                <div class="price-box">
                    <span class="new-price">$${price.toLocaleString("en-US")}</span>
                    ${oldPrice > price ? `<span class="old-price">$${oldPrice.toLocaleString("en-US")}</span>` : ""}
                </div>

                <div class="stock-status ${inStock ? "in-stock" : "out-stock"}">
                    ${inStock ? `<i class="fa-solid fa-circle-check" style="font-size:0.7rem"></i> Còn ${p.stock} sản phẩm` : "Hết hàng"}
                </div>

                <button
                    class="cart-btn"
                    onclick="addToCart(${p.id})"
                    ${!inStock ? "disabled" : ""}
                >
                    <i class="fa-solid fa-cart-shopping"></i>
                    Thêm vào giỏ
                </button>
            </div>

        </div>`;
    }).join("");
}

function goToDetail(event, productId) {
    if (event.target.closest(".cart-btn")) return;
    window.location.href = "product-detail.html?id=" + productId;
}

// ── Filter state ──────────────────────────────────────────
const filterState = { category: "all", sort: "default", search: "", page: 1 };

let searchDebounce = null;
let loadSeq = 0;

async function applyFilters() {
    const seq = ++loadSeq;
    const container = document.getElementById("product-list");
    try {
        const res = await Api.products.list({
            category: filterState.category === "all" ? undefined : filterState.category,
            q: filterState.search,
            sort: SORT_PARAM[filterState.sort],
            page: filterState.page,
            limit: PAGE_SIZE
        });
        if (seq !== loadSeq) return; // a newer request superseded this one

        renderProducts(res.items);

        const first = res.total ? (res.page - 1) * res.limit + 1 : 0;
        const countEl = document.getElementById("result-count");
        if (countEl) countEl.textContent =
            `Showing ${first}–${first + res.items.length - (res.total ? 1 : 0)} of ${res.total} product${res.total !== 1 ? "s" : ""}`;

        renderPagination(res);
    } catch (e) {
        if (seq !== loadSeq) return;
        container.innerHTML = `<p style="text-align:center;padding:60px;">Không tải được sản phẩm: ${Api.escapeHtml(e.message)}</p>`;
    }
}

function renderPagination(res) {
    const nav = document.getElementById("pagination");
    if (!nav) return;
    const pages = Math.max(1, Math.ceil(res.total / res.limit));
    if (pages <= 1) { nav.innerHTML = ""; return; }
    nav.innerHTML = `
        <button type="button" data-page="${res.page - 1}" ${res.page <= 1 ? "disabled" : ""}>← Prev</button>
        <span class="page-info">Page ${res.page} / ${pages}</span>
        <button type="button" data-page="${res.page + 1}" ${res.page >= pages ? "disabled" : ""}>Next →</button>`;
}

function goToPage(page) {
    filterState.page = page;
    applyFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── Bootstrap event listeners ─────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    applyFilters();

    // Category pills
    document.getElementById("filter-cats").addEventListener("click", e => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        document.querySelectorAll("#filter-cats .filter-btn")
            .forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        filterState.category = btn.dataset.cat;
        filterState.page = 1;
        applyFilters();
    });

    // Sort select
    document.getElementById("filter-sort").addEventListener("change", e => {
        filterState.sort = e.target.value;
        filterState.page = 1;
        applyFilters();
    });

    // Search input (debounced)
    document.getElementById("filter-search").addEventListener("input", e => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            filterState.search = e.target.value.trim();
            filterState.page = 1;
            applyFilters();
        }, 200);
    });

    document.getElementById("pagination").addEventListener("click", e => {
        const btn = e.target.closest("button[data-page]");
        if (btn && !btn.disabled) goToPage(Number(btn.dataset.page));
    });

    // Cart button
    const cartBtn = document.getElementById("cart-btn");
    if (cartBtn) cartBtn.addEventListener("click", () => window.location.href = "cart.html");
});
