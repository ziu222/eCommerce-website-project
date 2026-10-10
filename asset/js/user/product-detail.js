// product-detail.js — Single product detail page logic

(function () {

    function renderStars(rating) {
        const full  = Math.floor(rating);
        const half  = rating - full >= 0.5 ? "½" : "";
        const empty = 5 - full - (half ? 1 : 0);
        return "★".repeat(full) + half + "☆".repeat(empty);
    }

    function showToast() {
        const toast = document.getElementById("cartToast");
        if (!toast) return;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2500);
    }

    function renderDetail(product) {
        const price       = Number(product.price);
        const oldPrice    = Number(product.oldPrice);
        const discountPct = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
        const inStock     = product.stock > 0;

        document.getElementById("breadcrumb-name").textContent = product.name;
        document.title = product.name + " - EC SHOP";

        document.getElementById("detail-content").innerHTML = `
            <div class="detail-img-col">
                <img
                    class="detail-main-img"
                    src="${Api.escapeHtml(product.image)}"
                    alt="${Api.escapeHtml(product.name)}"
                    onerror="this.onerror=null;this.src='../asset/img/404.png'"
                />
            </div>

            <div class="detail-info-col">
                <div class="detail-top-row">
                    <span class="detail-category">${Api.escapeHtml(product.category)}</span>
                    ${discountPct > 0 ? `<span class="detail-discount-badge">-${discountPct}% OFF</span>` : ""}
                </div>

                <h1 class="detail-name">${Api.escapeHtml(product.name)}</h1>

                <div class="detail-rating">
                    <span class="stars">${renderStars(product.rating)}</span>
                    <strong>${product.rating}</strong>
                    <span>(${product.reviews} đánh giá)</span>
                </div>

                <div class="detail-price-box">
                    <span class="detail-new-price">$${price.toLocaleString("en-US")}</span>
                    ${oldPrice > price ? `<span class="detail-old-price">$${oldPrice.toLocaleString("en-US")}</span>` : ""}
                </div>

                ${product.description ? `
                <div class="detail-description">${Api.escapeHtml(product.description)}</div>
                ` : ""}

                <div class="detail-stock ${inStock ? "in-stock" : "out-stock"}">
                    <i class="fa-solid ${inStock ? "fa-circle-check" : "fa-circle-xmark"}"></i>
                    ${inStock ? `Còn ${product.stock} sản phẩm` : "Hết hàng"}
                </div>

                <div class="detail-actions">
                    <div class="qty-box">
                        <button id="qtyDec">−</button>
                        <span class="qty-val" id="qtyVal">1</span>
                        <button id="qtyInc">+</button>
                    </div>
                    <button
                        class="btn-add-cart"
                        id="btnAddCart"
                        ${!inStock ? "disabled" : ""}
                    >
                        <i class="fa-solid fa-cart-shopping"></i>
                        Thêm vào giỏ hàng
                    </button>
                </div>
            </div>
        `;

        // Qty controls
        let qty = 1;
        const qtyVal  = document.getElementById("qtyVal");
        const qtyDec  = document.getElementById("qtyDec");
        const qtyInc  = document.getElementById("qtyInc");
        const btnAdd  = document.getElementById("btnAddCart");

        if (qtyDec) qtyDec.addEventListener("click", () => {
            if (qty > 1) { qty--; qtyVal.textContent = qty; }
        });

        if (qtyInc) qtyInc.addEventListener("click", () => {
            if (qty < product.stock) { qty++; qtyVal.textContent = qty; }
        });

        if (btnAdd) btnAdd.addEventListener("click", () => {
            for (let i = 0; i < qty; i++) addToCart(product.id);
            showToast();
        });
    }

    async function renderRelated(currentProduct) {
        let related = [];
        try {
            const res = await Api.products.list({ category: currentProduct.category, limit: 5 });
            related = res.items.filter(p => p.id !== currentProduct.id).slice(0, 4);
        } catch (e) {
            return; // related products are optional
        }

        if (related.length === 0) return;

        const section = document.getElementById("related-section");
        const list    = document.getElementById("related-list");
        if (!section || !list) return;

        section.style.display = "";

        list.innerHTML = related.map((p, idx) => {
            const price       = Number(p.price);
            const oldPrice    = Number(p.oldPrice);
            const discountPct = oldPrice > price ? Math.round((1 - price / oldPrice) * 100) : 0;
            const inStock     = p.stock > 0;
            const delay       = idx * 0.07;

            return `
            <div class="product-card" style="animation-delay:${delay}s"
                 onclick="window.location.href='product-detail.html?id=${p.id}'">
                <div class="product-img-wrap">
                    <img src="${Api.escapeHtml(p.image)}" alt="${Api.escapeHtml(p.name)}" onerror="this.onerror=null;this.src='../asset/img/404.png'" />
                    ${discountPct > 0 ? `<span class="discount-badge">-${discountPct}%</span>` : ""}
                    <span class="category-chip">${Api.escapeHtml(p.category)}</span>
                </div>
                <div class="card-body">
                    <div class="product-name">${Api.escapeHtml(p.name)}</div>
                    <div class="price-box">
                        <span class="new-price">$${price.toLocaleString("en-US")}</span>
                        ${oldPrice > price ? `<span class="old-price">$${oldPrice.toLocaleString("en-US")}</span>` : ""}
                    </div>
                    <button class="cart-btn" onclick="event.stopPropagation(); addToCart(${p.id})" ${!inStock ? "disabled" : ""}>
                        <i class="fa-solid fa-cart-shopping"></i> Thêm vào giỏ
                    </button>
                </div>
            </div>`;
        }).join("");
    }

    async function init() {
        const params    = new URLSearchParams(window.location.search);
        const productId = parseInt(params.get("id"), 10);

        if (!productId) {
            document.getElementById("detail-content").innerHTML =
                '<p style="padding:60px;text-align:center;color:var(--muted-text);">Sản phẩm không tồn tại. <a href="product.html" style="color:var(--primary-color)">Quay lại</a></p>';
            return;
        }

        let product = null;
        try {
            product = await Api.products.get(productId);
        } catch (e) {
            product = null;
        }
        if (!product) {
            document.getElementById("detail-content").innerHTML =
                '<p style="padding:60px;text-align:center;color:var(--muted-text);">Sản phẩm không tìm thấy. <a href="product.html" style="color:var(--primary-color)">Quay lại</a></p>';
            return;
        }

        renderDetail(product);
        renderRelated(product);

        const cartBtn = document.getElementById("cart-btn");
        if (cartBtn) cartBtn.addEventListener("click", () => window.location.href = "cart.html");
    }

    document.addEventListener("DOMContentLoaded", init);

})();
