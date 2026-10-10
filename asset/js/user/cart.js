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
            <div class="empty card">
                <span class="ms">shopping_bag</span>
                <h3>Your cart is empty</h3>
                <p>Find something you like and it will wait for you here.</p>
                <a class="btn btn-primary" href="product.html">Start shopping</a>
            </div>`;
        if (countLabel) countLabel.textContent = "0 items";
        document.getElementById("total-items").textContent = "0";
        document.getElementById("total-price").textContent = "$0";
        return;
    }

    container.innerHTML = cart.map(item => {
        totalItems += item.quantity;
        totalPrice += item.price * item.quantity;
        return cartItem(item);
    }).join("");

    if (countLabel) countLabel.textContent = totalItems + (totalItems === 1 ? " item" : " items");
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
    var known = getProducts().filter(function (p) { return p.id === item.id; })[0];
    var category = known ? known.category : "";
    var name = Api.escapeHtml(item.name);
    return `
    <article class="cart-line">
        <img src="${Api.escapeHtml(item.image)}" alt="" class="cart-line-img${UI.isPlaceholder(item.image) ? " is-ph" : ""}" data-category="${Api.escapeHtml(category)}">
        <div class="cart-line-info">
            <a class="cart-line-name" href="product-detail.html?id=${item.id}">${name}</a>
            <div class="cart-line-price">${UI.money(item.price)} each</div>
        </div>
        <div class="cart-line-controls">
            <div class="line-qty" role="group" aria-label="Quantity of ${name}">
                <button type="button" class="dec" data-id="${item.id}" aria-label="Decrease quantity">−</button>
                <output>${item.quantity}</output>
                <button type="button" class="inc" data-id="${item.id}" aria-label="Increase quantity">+</button>
            </div>
            <span class="line-total">${UI.money(item.price * item.quantity)}</span>
            <button type="button" class="line-remove remove" data-id="${item.id}" aria-label="Remove ${name}"><span class="ms">delete</span></button>
        </div>
    </article>`;
}

document.getElementById("cart-items").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
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
    else {
        document.getElementById("pmWallet").disabled = true;
        document.getElementById("walletBalanceDisplay").textContent = "Sign in to use";
        document.getElementById("btnCheckout").lastChild.textContent = "Sign in to check out";
    }

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
        UI.toast(e.message || "Checkout failed. Please try again.", "error");
    } finally {
        validatePaymentMethod();
    }
}

function showOrderModal(orderIds, method, total) {
    document.getElementById("modalOrderId").textContent = "#" + orderIds.join(", #");
    document.getElementById("modalPayMethod").textContent = method === "wallet" ? "Wallet" : "Cash on delivery";
    document.getElementById("modalTotal").textContent = "$" + Number(total).toLocaleString("en-US");
    document.getElementById("orderModal").classList.add("is-open");
}

document.addEventListener("DOMContentLoaded", () => {
    renderCart();
    initCheckout();
});
