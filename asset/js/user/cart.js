// getCart / saveCart / CART_KEY are defined in addtocart.js (loaded before this file)

var activeCoupon   = null;
var discountAmount = 0;
var walletBalance  = 0;
var couponSeq      = 0;

function renderCart() {
    const cart = getCart();
    const container = document.getElementById("cart-items");
    const countLabel = document.getElementById("cart-count-label");

    let totalItems = 0;
    let totalPrice = 0;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="cart-empty">
                <i class="fa-solid fa-cart-shopping"></i>
                <p>Giỏ hàng của bạn đang trống</p>
                <button class="btn-shop" onclick="window.location.href='product.html'">
                    Tiếp tục mua sắm
                </button>
            </div>`;
        if (countLabel) countLabel.textContent = "0 sản phẩm";
        document.getElementById("total-items").textContent = "0";
        document.getElementById("total-price").textContent = "$0";
        return;
    }

    container.innerHTML = cart.map(item => {
        totalItems += item.quantity;
        totalPrice += item.price * item.quantity;
        return cartItem(item);
    }).join("");

    if (countLabel) countLabel.textContent = totalItems + " sản phẩm";
    document.getElementById("total-items").textContent = totalItems;

    var finalDisplay = Math.max(0, totalPrice - discountAmount);
    document.getElementById("total-price").textContent = "$" + finalDisplay.toLocaleString("en-US");

    // The server re-checks the coupon against the current cart (quantities may have changed)
    if (activeCoupon) refreshCoupon();
}

async function refreshCoupon() {
    var seq  = ++couponSeq;
    var code = activeCoupon.code;
    var result = await Api.coupons.validate(code, getCart());
    if (seq !== couponSeq || !activeCoupon) return; // superseded by a newer check or removed
    if (result.valid) {
        discountAmount = result.discount;
        updateDiscountUI(code, discountAmount);
    } else {
        clearCoupon();
    }
    var rawTotal = getCart().reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
    document.getElementById("total-price").textContent = "$" + Math.max(0, rawTotal - discountAmount).toLocaleString("en-US");
}

function cartItem(item) {
    return `
    <div class="cart-item">
        <img src="${Api.escapeHtml(item.image)}" class="cart-item-img" onerror="this.onerror=null;this.src='../asset/img/404.png'" />
        <div class="cart-item-info">
            <div class="cart-item-name">${Api.escapeHtml(item.name)}</div>
            <div class="cart-item-price">$${Number(item.price).toLocaleString("en-US")}</div>
        </div>
        <div class="qty-controls">
            <button class="qty-btn dec" data-id="${item.id}">−</button>
            <span class="qty-display">${item.quantity}</span>
            <button class="qty-btn inc" data-id="${item.id}">+</button>
        </div>
        <button class="remove-btn remove" data-id="${item.id}" title="Xóa">
            <i class="fa-solid fa-trash-can"></i>
        </button>
    </div>`;
}

document.getElementById("cart-items").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (!id) return;

    let cart = getCart();

    if (btn.classList.contains("inc")) {
        const item = cart.find(i => i.id === id);
        if (item) item.quantity++;
    }

    if (btn.classList.contains("dec")) {
        const item = cart.find(i => i.id === id);
        if (item) {
            item.quantity--;
            if (item.quantity <= 0) cart = cart.filter(i => i.id !== id);
        }
    }

    if (btn.classList.contains("remove")) {
        cart = cart.filter(i => i.id !== id);
    }

    saveCart(cart);
    renderCart();
    updateCartBadge();
});

function updateDiscountUI(code, discount) {
    document.getElementById("couponCodeLabel").textContent = code;
    document.getElementById("discountAmount").textContent = "−$" + discount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById("discountRow").style.display = "";
}

function clearCoupon() {
    activeCoupon = null;
    discountAmount = 0;
    document.getElementById("discountRow").style.display = "none";
}

async function applyCoupon() {
    var input  = document.getElementById("couponInput");
    var code   = (input.value || "").trim().toUpperCase();
    var fb     = document.getElementById("couponFeedback");

    if (!code) return;

    var cart   = getCart();
    couponSeq++; // cancels any check still running for the previous code
    var result = await Api.coupons.validate(code, cart);

    if (result.valid) {
        activeCoupon   = result.coupon;
        discountAmount = result.discount;
        updateDiscountUI(code, discountAmount);
        fb.textContent  = "Coupon applied — " + (result.coupon.type === "percent" ? result.coupon.value + "% off" : "$" + result.coupon.value + " off");
        fb.className    = "coupon-feedback success";
        // Refresh total display
        var rawTotal = getCart().reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
        document.getElementById("total-price").textContent = "$" + Math.max(0, rawTotal - discountAmount).toLocaleString("en-US");
    } else {
        clearCoupon();
        fb.textContent = result.message;
        fb.className   = "coupon-feedback error";
    }
}

function initCheckout() {
    const user = getCurrentUser();

    if (user) loadWalletBalance();

    // Validate balance when switching to wallet
    document.querySelectorAll("input[name='payMethod']").forEach(r => {
        r.addEventListener("change", validatePaymentMethod);
    });

    // Coupon apply button
    var applyBtn = document.getElementById("btnApplyCoupon");
    if (applyBtn) applyBtn.addEventListener("click", applyCoupon);

    // Checkout button
    const btn = document.getElementById("btnCheckout");
    if (btn) btn.addEventListener("click", handleCheckout);
}

// Shows the wallet balance in the payment section
async function loadWalletBalance() {
    try {
        walletBalance = (await Api.wallet.get()).balance;
    } catch (e) {
        walletBalance = 0;
    }
    const balEl = document.getElementById("walletBalanceDisplay");
    if (balEl) balEl.textContent = "$" + Number(walletBalance).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    validatePaymentMethod();
}

function validatePaymentMethod() {
    const method  = document.querySelector("input[name='payMethod']:checked")?.value;
    const warning = document.getElementById("pmWarning");
    const btn     = document.getElementById("btnCheckout");
    if (!warning) return;

    if (method === "wallet") {
        const user  = getCurrentUser();
        const cart  = getCart();
        const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const bal   = user ? walletBalance : 0;

        if (bal < total) {
            warning.classList.remove("hidden");
            if (btn) btn.disabled = true;
            return;
        }
    }
    warning.classList.add("hidden");
    if (btn) btn.disabled = false;
}

async function handleCheckout() {
    const user = getCurrentUser();
    if (!user) { window.location.href = "login.html"; return; }

    const cart = getCart();
    if (!cart.length) return;

    const method = document.querySelector("input[name='payMethod']:checked")?.value || "cod";
    const total  = cart.reduce((s, i) => s + i.price * i.quantity, 0);

    if (method === "wallet" && walletBalance < Math.max(0, total - discountAmount)) {
        validatePaymentMethod();
        return;
    }

    // One submit at a time; the server prices the cart, applies the coupon and charges the wallet.
    const btn = document.getElementById("btnCheckout");
    if (btn) btn.disabled = true;
    try {
        const result = await Api.orders.checkout(cart, method, activeCoupon ? activeCoupon.code : null);

        saveCart([]);
        clearCoupon();
        updateCartBadge();
        renderCart();
        if (method === "wallet") loadWalletBalance();

        showOrderModal(result.orders.map(o => o.id), method, result.total);
    } catch (e) {
        if (e.status === 401 || e.status === 403) { window.location.href = "login.html"; return; }
        alert(e.message || "Checkout failed");
    } finally {
        validatePaymentMethod();
    }
}

function showOrderModal(orderIds, method, total) {
    document.getElementById("modalOrderId").textContent = "#" + orderIds.join(", #");
    document.getElementById("modalPayMethod").textContent = method === "wallet" ? "Wallet" : "Cash on Delivery";
    document.getElementById("modalTotal").textContent = "$" + Number(total).toLocaleString("en-US");
    document.getElementById("orderModal").classList.add("is-open");
}

document.addEventListener("DOMContentLoaded", () => {
    renderCart();
    initCheckout();
    const cartBtn = document.getElementById("cart-btn");
    if (cartBtn) cartBtn.addEventListener("click", () => window.location.href = "cart.html");
});
