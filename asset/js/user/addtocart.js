const CART_KEY = "ecshop_cart";

function getProducts() {
    return JSON.parse(localStorage.getItem("ecshop_products")) || [];
}

function getCart() {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
}

function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(productId) {
    const products = getProducts();
    const cart = getCart();

    const product = products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id:       product.id,
            name:     product.name,
            price:    product.price,
            image:    product.image,
            shopId:   product.shopId || null,
            quantity: 1
        });
    }

    saveCart(cart);
    updateCartBadge();
}

function getCartCount() {
    return getCart().reduce((total, item) => total + item.quantity, 0);
}

function updateCartBadge() {
    const count = getCartCount();
    const badge = document.getElementById("cart-count");
    if (!badge) return;
    const grew = count > Number(badge.textContent || 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-block" : "none";
    if (grew) {
        badge.classList.remove("bump");
        void badge.offsetWidth; // restart the animation if it is already running
        badge.classList.add("bump");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateCartBadge();
});
