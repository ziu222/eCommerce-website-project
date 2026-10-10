// shop-product.js — the catalogue page: category chips, search, sort and pages, all kept in the URL.

const PAGE_SIZE = 12;
const SORT_PARAM = { "default": "default", "price-asc": "price_asc", "price-desc": "price_desc", "rating": "rating", "newest": "newest" };

const params = new URLSearchParams(location.search);
const filterState = {
    category: params.get("category") || "all",
    sort: SORT_PARAM[params.get("sort")] ? params.get("sort") : "default",
    search: (params.get("q") || "").trim(),
    page: Math.max(1, parseInt(params.get("page"), 10) || 1)
};

let searchDebounce = null;
let loadSeq = 0;

function syncUrl() {
    const p = new URLSearchParams();
    if (filterState.category !== "all") p.set("category", filterState.category);
    if (filterState.sort !== "default") p.set("sort", filterState.sort);
    if (filterState.search) p.set("q", filterState.search);
    if (filterState.page > 1) p.set("page", filterState.page);
    const qs = p.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : ""));
}

function showControls() {
    document.querySelectorAll("#filter-cats .filter-btn").forEach(b => {
        const on = b.dataset.cat === filterState.category;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", String(on));
    });
    document.getElementById("filter-sort").value = filterState.sort;
    document.getElementById("filter-search").value = filterState.search;
    document.getElementById("shop-title").textContent =
        filterState.category === "all" ? "Shop" : UI.categoryLabel(filterState.category);
}

function renderEmpty() {
    document.getElementById("product-list").innerHTML = `
        <div class="empty" style="grid-column:1/-1">
            <span class="ms">search_off</span>
            <h3>No products match</h3>
            <p>Try a different word or clear the filters.</p>
            <button type="button" class="btn btn-ghost" id="clearFilters">Clear filters</button>
        </div>`;
}

async function applyFilters() {
    const seq = ++loadSeq;
    const list = document.getElementById("product-list");
    list.setAttribute("aria-busy", "true");
    if (!list.children.length) list.innerHTML = UI.skeletons(8);
    syncUrl();
    showControls();
    try {
        const res = await Api.products.list({
            category: filterState.category === "all" ? undefined : filterState.category,
            q: filterState.search,
            sort: SORT_PARAM[filterState.sort],
            page: filterState.page,
            limit: PAGE_SIZE
        });
        if (seq !== loadSeq) return; // a newer request superseded this one

        if (res.items.length) list.innerHTML = res.items.map(UI.productCard).join("");
        else renderEmpty();
        list.setAttribute("aria-busy", "false");

        const count = document.getElementById("result-count");
        count.textContent = res.total
            ? `${res.total} product${res.total === 1 ? "" : "s"}${filterState.search ? ` for “${filterState.search}”` : ""}`
            : "";
        renderPagination(res);
    } catch (e) {
        if (seq !== loadSeq) return;
        list.setAttribute("aria-busy", "false");
        list.innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ms">cloud_off</span><h3>Could not load products</h3><p>${Api.escapeHtml(e.message)}</p></div>`;
    }
}

function renderPagination(res) {
    const nav = document.getElementById("pagination");
    const pages = Math.max(1, Math.ceil(res.total / res.limit));
    if (pages <= 1) { nav.innerHTML = ""; return; }
    nav.innerHTML = `
        <button type="button" data-page="${res.page - 1}" ${res.page <= 1 ? "disabled" : ""}>Previous</button>
        <span class="page-info">Page ${res.page} of ${pages}</span>
        <button type="button" data-page="${res.page + 1}" ${res.page >= pages ? "disabled" : ""}>Next</button>`;
}

function goToPage(page) {
    filterState.page = page;
    applyFilters();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

document.addEventListener("DOMContentLoaded", () => {
    applyFilters();

    document.getElementById("filter-cats").addEventListener("click", e => {
        const btn = e.target.closest(".filter-btn");
        if (!btn) return;
        filterState.category = btn.dataset.cat;
        filterState.page = 1;
        applyFilters();
    });

    document.getElementById("filter-sort").addEventListener("change", e => {
        filterState.sort = e.target.value;
        filterState.page = 1;
        applyFilters();
    });

    document.getElementById("filter-search").addEventListener("input", e => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            filterState.search = e.target.value.trim();
            filterState.page = 1;
            applyFilters();
        }, 250);
    });

    document.getElementById("pagination").addEventListener("click", e => {
        const btn = e.target.closest("button[data-page]");
        if (btn && !btn.disabled) goToPage(Number(btn.dataset.page));
    });

    document.getElementById("product-list").addEventListener("click", e => {
        if (!e.target.closest("#clearFilters")) return;
        Object.assign(filterState, { category: "all", sort: "default", search: "", page: 1 });
        applyFilters();
    });
});
