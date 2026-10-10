// Data layer (storage) dùng LocalStorage
var Store = (function () {

    var KEYS = {
        products:      "ecshop_products",
        users:         "ecshop_users",
        orders:        "ecshop_orders",
        cart:          "ecshop_cart",
        notifications: "ecshop_notifications",
        coupons:       "ecshop_coupons",
        seeded:        "ecshop_seeded"
    };


    function _get(key) {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    }

    function _set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    function _nextId(key) {
        var items = _get(key) || [];
        if (items.length === 0) return 1;
        var maxId = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].id > maxId) maxId = items[i].id;
        }
        return maxId + 1;
    }

    function getTodayString() {
        return new Date().toISOString().split("T")[0];
    }


    // Seed data (khởi tạo dữ liệu mẫu)
    function migrateNewSeedProducts() {
        if (localStorage.getItem("ecshop_products_v3")) return;
        if (typeof SEED_PRODUCTS === "undefined") return;
        var products = _get(KEYS.products) || [];
        var existingIds = {};
        for (var i = 0; i < products.length; i++) existingIds[products[i].id] = true;
        var added = false;
        for (var j = 0; j < SEED_PRODUCTS.length; j++) {
            if (!existingIds[SEED_PRODUCTS[j].id]) {
                products.push(SEED_PRODUCTS[j]);
                added = true;
            }
        }
        if (added) _set(KEYS.products, products);
        localStorage.setItem("ecshop_products_v3", "true");
    }

    function migrateSeedProductStatuses() {
        if (localStorage.getItem("ecshop_product_seed_v2")) return;
        if (typeof SEED_PRODUCTS === "undefined") return;
        var products = _get(KEYS.products) || [];
        var changed = false;
        for (var i = 0; i < products.length; i++) {
            for (var j = 0; j < SEED_PRODUCTS.length; j++) {
                if (SEED_PRODUCTS[j].id === products[i].id) {
                    var seedStatus = SEED_PRODUCTS[j].adminStatus || "approved";
                    if (products[i].adminStatus !== seedStatus && products[i].adminStatus === "pending") {
                        products[i].adminStatus = seedStatus;
                        changed = true;
                    }
                    break;
                }
            }
        }
        if (changed) _set(KEYS.products, products);
        localStorage.setItem("ecshop_product_seed_v2", "true");
    }

    function migrateUserWallet() {
        if (localStorage.getItem("ecshop_wallet_v1")) return;
        var users = _get(KEYS.users) || [];
        var changed = false;
        for (var i = 0; i < users.length; i++) {
            if (users[i].walletBalance === undefined) {
                users[i].walletBalance = users[i].role === "customer" ? 200 : 0;
                changed = true;
            }
            if (users[i].walletTransactions === undefined) {
                users[i].walletTransactions = [];
                changed = true;
            }
        }
        if (changed) _set(KEYS.users, users);
        localStorage.setItem("ecshop_wallet_v1", "true");
    }

    function seed() {
        if (localStorage.getItem(KEYS.seeded)) {
            if (!_get(KEYS.notifications)) {
                _set(KEYS.notifications, []);
            }
            var _existingCoupons = _get(KEYS.coupons);
            if (typeof SEED_COUPONS !== "undefined" && (!_existingCoupons || _existingCoupons.length === 0)) {
                _set(KEYS.coupons, SEED_COUPONS);
            }
            migrateSeedProductStatuses();
            migrateNewSeedProducts();
            migrateProductSchema();
            migrateOrderSchema();
            migrateUserWallet();
            return;
        }

        _set(KEYS.products,       typeof SEED_PRODUCTS       !== "undefined" ? SEED_PRODUCTS       : []);
        _set(KEYS.users,           typeof SEED_USERS          !== "undefined" ? SEED_USERS          : []);
        _set(KEYS.orders,          typeof SEED_ORDERS         !== "undefined" ? SEED_ORDERS         : []);
        _set(KEYS.cart, []);
        _set(KEYS.notifications,   typeof SEED_NOTIFICATIONS  !== "undefined" ? SEED_NOTIFICATIONS  : []);
        if (typeof SEED_COUPONS !== "undefined") _set(KEYS.coupons, SEED_COUPONS);

        localStorage.setItem(KEYS.seeded, "true");
        migrateProductSchema();
        migrateOrderSchema();
        console.log("Store: seed data loaded into LocalStorage");
    }

    function resetAll() {
        localStorage.removeItem(KEYS.products);
        localStorage.removeItem(KEYS.users);
        localStorage.removeItem(KEYS.orders);
        localStorage.removeItem(KEYS.cart);
        localStorage.removeItem(KEYS.notifications);
        localStorage.removeItem(KEYS.seeded);
        localStorage.removeItem("ecshop_currentUser");
        seed();
        console.log("Store: all data reset");
    }


    // PRODUCTS (Sản phẩm)

    function getSeedProductTemplate(productId) {
        if (typeof SEED_PRODUCTS === "undefined" || !SEED_PRODUCTS) return null;
        for (var i = 0; i < SEED_PRODUCTS.length; i++) {
            if (SEED_PRODUCTS[i].id === productId) return SEED_PRODUCTS[i];
        }
        return null;
    }

    function normalizeProduct(product) {
        if (!product) return null;

        var normalized = {};
        var seedProduct = getSeedProductTemplate(product.id);
        var key;

        for (key in product) {
            normalized[key] = product[key];
        }

        if (seedProduct) {
            for (key in seedProduct) {
                if (normalized[key] === undefined || normalized[key] === null || normalized[key] === "") {
                    normalized[key] = seedProduct[key];
                }
            }
        }

        var legacyStatus = normalized.visible === true ? "approved" : null;
        normalized.adminStatus = normalized.adminStatus || legacyStatus || (seedProduct && seedProduct.adminStatus) || "approved";
        normalized.adminNote = normalized.adminNote || "";
        normalized.submittedAt = normalized.submittedAt || normalized.createdAt || getTodayString();
        normalized.reviewedAt = normalized.reviewedAt || (normalized.adminStatus !== "pending" ? (normalized.updatedAt || normalized.createdAt || normalized.submittedAt) : null);
        normalized.reviewedBy = normalized.reviewedBy || (normalized.adminStatus !== "pending" ? "admin" : null);
        normalized.updatedAt = normalized.updatedAt || normalized.createdAt || normalized.submittedAt;
        normalized.price = Number(normalized.price) || 0;
        normalized.oldPrice = Number(normalized.oldPrice) || 0;
        normalized.rating = Number(normalized.rating) || 0;
        normalized.reviews = Number(normalized.reviews) || 0;
        normalized.stock = Number(normalized.stock) || 0;
        normalized.description = normalized.description || "";

        return normalized;
    }

    function migrateProductSchema() {
        var products = _get(KEYS.products) || [];
        var changed = false;

        for (var i = 0; i < products.length; i++) {
            var product = products[i];
            var needsNormalize = (
                product.adminStatus === undefined ||
                product.adminNote === undefined ||
                product.submittedAt === undefined ||
                product.reviewedAt === undefined ||
                product.reviewedBy === undefined ||
                product.updatedAt === undefined
            );

            if (needsNormalize) {
                products[i] = normalizeProduct(product);
                changed = true;
            }
        }

        if (changed) {
            _set(KEYS.products, products);
        }
    }

    function getProducts() {
        migrateProductSchema();
        var products = _get(KEYS.products) || [];
        var result = [];
        for (var i = 0; i < products.length; i++) {
            result.push(normalizeProduct(products[i]));
        }
        return result;
    }

    function getProductById(id) {
        var products = getProducts();
        for (var i = 0; i < products.length; i++) {
            if (products[i].id === id) return products[i];
        }
        return null;
    }

    function getProductsByStatus(status) {
        if (!status || status === "all") return getProducts();

        var products = getProducts();
        var result = [];
        for (var i = 0; i < products.length; i++) {
            if (products[i].adminStatus === status) {
                result.push(products[i]);
            }
        }
        return result;
    }

    function getApprovedProducts() {
        return getProductsByStatus("approved");
    }

    function getProductStats() {
        var products = getProducts();
        var counts = { total: products.length, pending: 0, approved: 0, rejected: 0, suspended: 0 };

        for (var i = 0; i < products.length; i++) {
            var status = products[i].adminStatus || "approved";
            if (counts[status] !== undefined) {
                counts[status]++;
            }
        }

        return counts;
    }

    function getProductsByCategory(category) {
        if (!category || category === "all") return getApprovedProducts();
        var products = getApprovedProducts();
        var result = [];
        for (var i = 0; i < products.length; i++) {
            if (products[i].category === category) result.push(products[i]);
        }
        return result;
    }

    function searchProducts(query) {
        var lower = (query || "").toLowerCase().trim();
        if (!lower) return getApprovedProducts();
        var products = getApprovedProducts();
        var result = [];
        for (var i = 0; i < products.length; i++) {
            var p = products[i];
            var name = (p.name || "").toLowerCase();
            var category = (p.category || "").toLowerCase();
            if (name.indexOf(lower) !== -1 || category.indexOf(lower) !== -1) {
                result.push(p);
            }
        }
        return result;
    }

    function getProductsByShop(shopId) {
        var products = getProducts();
        var result = [];
        for (var i = 0; i < products.length; i++) {
            if (products[i].shopId === shopId) result.push(products[i]);
        }
        return result;
    }

    function addProduct(data) {
        var products = getProducts();
        var today = getTodayString();
        var newProduct = normalizeProduct({
            id:          _nextId(KEYS.products),
            shopId:      data.shopId || 0,
            name:        data.name || "New Product",
            price:       Number(data.price) || 0,
            oldPrice:    Number(data.oldPrice) || 0,
            image:       data.image || "../asset/img/404.png",
            category:    data.category || "smartphone",
            rating:      Number(data.rating) || 0,
            reviews:     Number(data.reviews) || 0,
            stock:       Number(data.stock) || 0,
            description: data.description || "",
            adminStatus: data.adminStatus || "pending",
            adminNote:   data.adminNote || "",
            submittedAt: data.submittedAt || today,
            reviewedAt:  data.reviewedAt || null,
            reviewedBy:  data.reviewedBy || null,
            createdAt:   today,
            updatedAt:   today
        });
        products.push(newProduct);
        _set(KEYS.products, products);
        return newProduct;
    }

    function updateProduct(id, data) {
        var products = getProducts();
        for (var i = 0; i < products.length; i++) {
            if (products[i].id === id) {
                var keys = Object.keys(data);
                for (var k = 0; k < keys.length; k++) {
                    products[i][keys[k]] = data[keys[k]];
                }
                if (!data.updatedAt) {
                    products[i].updatedAt = getTodayString();
                }
                products[i] = normalizeProduct(products[i]);
                _set(KEYS.products, products);
                return products[i];
            }
        }
        return null;
    }

    // Transitional: stores products fetched from the API (same ids) so cart and order code that
    // still reads LocalStorage can find them. Removed together with the store.
    function mergeProducts(list) {
        var byId = {};
        var products = _get(KEYS.products) || [];
        for (var i = 0; i < products.length; i++) byId[products[i].id] = i;
        for (var j = 0; j < list.length; j++) {
            if (byId[list[j].id] === undefined) {
                byId[list[j].id] = products.length;
                products.push(list[j]);
            } else {
                products[byId[list[j].id]] = list[j];
            }
        }
        _set(KEYS.products, products);
    }

    function deleteProduct(id) {
        var products = getProducts();
        var filtered = [];
        for (var i = 0; i < products.length; i++) {
            if (products[i].id !== id) filtered.push(products[i]);
        }
        if (filtered.length === products.length) return false;
        _set(KEYS.products, filtered);
        return true;
    }

    function getCurrentReviewerLabel() {
        var currentUser = (typeof Auth !== "undefined" && Auth.getCurrentUser)
            ? Auth.getCurrentUser()
            : null;

        if (!currentUser) return "admin";
        return currentUser.username || currentUser.name || currentUser.email || currentUser.role || "admin";
    }

    function requireAdminReviewer() {
        var currentUser = (typeof Auth !== "undefined" && Auth.getCurrentUser)
            ? Auth.getCurrentUser()
            : null;

        return !!(currentUser && currentUser.role === "admin");
    }

    function dispatchProductNotification(product, event, adminNote) {
        var messageMap = {
            approved: {
                type: "info",
                title: "Product approved",
                message: 'Your product "' + product.name + '" has been approved and is now visible to customers.'
            },
            rejected: {
                type: "warning",
                title: "Product rejected",
                message: 'Your product "' + product.name + '" was rejected. Reason: ' + (adminNote || "No note provided.")
            },
            suspended: {
                type: "warning",
                title: "Product suspended",
                message: 'Your product "' + product.name + '" has been suspended. Reason: ' + (adminNote || "No note provided.")
            },
            restored: {
                type: "info",
                title: "Product restored",
                message: 'Your product "' + product.name + '" has been restored and is live again.'
            }
        };

        var payload = messageMap[event];
        if (!payload) return null;

        return addNotification({
            targetId: product.shopId,
            targetRole: "shop",
            sentBy: "admin",
            type: payload.type,
            title: payload.title,
            message: payload.message
        });
    }

    function reviewProduct(productId, newStatus, adminNote) {
        if (!requireAdminReviewer()) {
            return { success: false, error: "Only admin can review products." };
        }

        if (newStatus !== "approved" && newStatus !== "rejected") {
            return { success: false, error: "Invalid review action." };
        }

        var product = getProductById(productId);
        if (!product) {
            return { success: false, error: "Product not found." };
        }

        if (product.adminStatus !== "pending") {
            return { success: false, error: "Only pending products can be reviewed." };
        }

        var note = (adminNote || "").trim();
        if (newStatus === "rejected" && !note) {
            return { success: false, error: "Rejection note is required." };
        }

        var updated = updateProduct(productId, {
            adminStatus: newStatus,
            adminNote: note,
            reviewedAt: getTodayString(),
            reviewedBy: getCurrentReviewerLabel(),
            updatedAt: getTodayString()
        });

        dispatchProductNotification(updated, newStatus, note);
        return { success: true, product: updated };
    }

    function suspendProduct(productId, adminNote) {
        if (!requireAdminReviewer()) {
            return { success: false, error: "Only admin can suspend products." };
        }

        var note = (adminNote || "").trim();
        if (!note) {
            return { success: false, error: "Suspend note is required." };
        }

        var product = getProductById(productId);
        if (!product) {
            return { success: false, error: "Product not found." };
        }

        if (product.adminStatus !== "approved") {
            return { success: false, error: "Only approved products can be suspended." };
        }

        var updated = updateProduct(productId, {
            adminStatus: "suspended",
            adminNote: note,
            reviewedAt: getTodayString(),
            reviewedBy: getCurrentReviewerLabel(),
            updatedAt: getTodayString()
        });

        dispatchProductNotification(updated, "suspended", note);
        return { success: true, product: updated };
    }

    function restoreProduct(productId) {
        if (!requireAdminReviewer()) {
            return { success: false, error: "Only admin can restore products." };
        }

        var product = getProductById(productId);
        if (!product) {
            return { success: false, error: "Product not found." };
        }

        if (product.adminStatus !== "suspended") {
            return { success: false, error: "Only suspended products can be restored." };
        }

        var updated = updateProduct(productId, {
            adminStatus: "approved",
            adminNote: "",
            reviewedAt: getTodayString(),
            reviewedBy: getCurrentReviewerLabel(),
            updatedAt: getTodayString()
        });

        dispatchProductNotification(updated, "restored", "");
        return { success: true, product: updated };
    }


    // User

    function getUsers() {
        return _get(KEYS.users) || [];
    }

    function getUserById(id) {
        var users = getUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].id === id) return users[i];
        }
        return null;
    }

    function getUserByEmail(email) {
        var lower = email.toLowerCase().trim();
        var users = getUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].email.toLowerCase() === lower) return users[i];
        }
        return null;
    }

    function getUserByUsername(username) {
        var lower = username.toLowerCase().trim();
        var users = getUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].username && users[i].username.toLowerCase() === lower) return users[i];
        }
        return null;
    }

    function getShops() {
        var users = getUsers();
        var result = [];
        for (var i = 0; i < users.length; i++) {
            if (users[i].role === "shop") result.push(users[i]);
        }
        return result;
    }

    function getShopById(shopId) {
        var users = getUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].id === shopId && users[i].role === "shop") return users[i];
        }
        return null;
    }

    function getCustomers() {
        var users = getUsers();
        var result = [];
        for (var i = 0; i < users.length; i++) {
            if (users[i].role === "customer") result.push(users[i]);
        }
        return result;
    }

    function updateShopStatus(shopId, newStatus) {
        return updateUser(shopId, { shopStatus: newStatus });
    }
//register user
    // Transitional: mirrors an API-registered user into the local store (same id) so pages
    // that still read users from LocalStorage keep working. Removed together with the store.
    function ensureUser(session) {
        if (getUserById(session.id)) return;
        var users = getUsers();
        users.push({
            id: session.id, name: session.name, username: session.username, email: session.email,
            password: "", role: session.role, avatar: session.avatar || "",
            createdAt: new Date().toISOString().split("T")[0],
            walletBalance: 0, walletTransactions: [],
            shopName: session.shopName || "", shopStatus: session.shopStatus || undefined
        });
        _set(KEYS.users, users);
    }

    function addUser(data) {
        var users = getUsers();
        var newUser = {
            id:        _nextId(KEYS.users),
            name:      data.name     || "",
            username:  data.username || "",
            email:     data.email    || "",
            password:  data.password || "",
            role:      data.role     || "customer",
            avatar:    data.avatar   || "",
            createdAt: new Date().toISOString().split("T")[0]
        };
        // If role is shop, add shop-specific fields
        if (newUser.role === "shop") {
            newUser.shopName        = data.shopName        || "";
            newUser.shopDescription = data.shopDescription || "";
            newUser.shopAddress     = data.shopAddress     || "";
            newUser.shopPhone       = data.shopPhone       || "";
            newUser.shopStatus      = data.shopStatus      || "pending";
            newUser.shopAvatar      = data.shopAvatar      || "";
        }
        users.push(newUser);
        _set(KEYS.users, users);
        return newUser;
    }

    function updateUser(id, data) {
        var users = getUsers();
        for (var i = 0; i < users.length; i++) {
            if (users[i].id === id) {
                var keys = Object.keys(data);
                for (var k = 0; k < keys.length; k++) {
                    users[i][keys[k]] = data[keys[k]];
                }
                _set(KEYS.users, users);
                return users[i];
            }
        }
        return null;
    }

    // ── WALLET

    function getWalletBalance(userId) {
        var user = getUserById(userId);
        return user ? (Number(user.walletBalance) || 0) : 0;
    }

    function getWalletTransactions(userId) {
        var user = getUserById(userId);
        return user ? (user.walletTransactions || []) : [];
    }

    function _nextWalletTxId(txs) {
        if (!txs || txs.length === 0) return 1;
        var max = 0;
        for (var i = 0; i < txs.length; i++) { if (txs[i].id > max) max = txs[i].id; }
        return max + 1;
    }

    function topUpWallet(userId, amount, description) {
        var user = getUserById(userId);
        if (!user) return null;
        var amt = Number(amount);
        if (!amt || amt <= 0) return null;
        var txs = user.walletTransactions ? user.walletTransactions.slice() : [];
        var tx = {
            id:          _nextWalletTxId(txs),
            type:        "deposit",
            amount:      amt,
            description: description || "Nạp tiền",
            orderId:     null,
            date:        new Date().toISOString()
        };
        txs.push(tx);
        updateUser(userId, { walletBalance: (Number(user.walletBalance) || 0) + amt, walletTransactions: txs });
        return tx;
    }

    function deductWallet(userId, amount, orderId) {
        var user = getUserById(userId);
        if (!user) return null;
        var amt     = Number(amount);
        var balance = Number(user.walletBalance) || 0;
        if (balance < amt) return null;
        var txs = user.walletTransactions ? user.walletTransactions.slice() : [];
        var tx = {
            id:          _nextWalletTxId(txs),
            type:        "payment",
            amount:      amt,
            description: "Thanh toán đơn #" + orderId,
            orderId:     orderId || null,
            date:        new Date().toISOString()
        };
        txs.push(tx);
        updateUser(userId, { walletBalance: balance - amt, walletTransactions: txs });
        return tx;
    }

    function refundWallet(userId, amount, orderId) {
        var user = getUserById(userId);
        if (!user) return null;
        var amt = Number(amount);
        var txs = user.walletTransactions ? user.walletTransactions.slice() : [];
        var tx = {
            id:          _nextWalletTxId(txs),
            type:        "refund",
            amount:      amt,
            description: "Hoàn tiền đơn #" + orderId,
            orderId:     orderId || null,
            date:        new Date().toISOString()
        };
        txs.push(tx);
        updateUser(userId, { walletBalance: (Number(user.walletBalance) || 0) + amt, walletTransactions: txs });
        return tx;
    }

    function deleteUser(id) {
        var users = getUsers();
        var filtered = [];
        for (var i = 0; i < users.length; i++) {
            if (users[i].id !== id) filtered.push(users[i]);
        }
        if (filtered.length === users.length) return false;
        _set(KEYS.users, filtered);
        return true;
    }

    function getNotifications() {
        return _get(KEYS.notifications) || [];
    }

    function addNotification(data) {
        var notifications = getNotifications();
        var item = {
            id:         _nextId(KEYS.notifications),
            targetId:   data.targetId !== undefined ? data.targetId : 0,
            targetRole: data.targetRole || "customer",
            orderId:    data.orderId || null,
            sentBy:     data.sentBy || "system",
            source:     data.source || "auto",
            batchId:    data.batchId || null,
            type:       data.type || "info",
            title:      data.title || "Notification",
            message:    data.message || "",
            isRead:     false,
            createdAt:  new Date().toISOString()
        };

        notifications.unshift(item);
        _set(KEYS.notifications, notifications);
        return item;
    }

    function getNotificationsByTarget(targetRole, targetId) {
        return getNotifications().filter(function (n) {
            return n.targetRole === targetRole &&
                (n.targetId === "all" || n.targetId === targetId);
        });
    }

    function markNotificationRead(id, targetRole, targetId) {
        var notifications = getNotifications();
        var changed = false;
        for (var i = 0; i < notifications.length; i++) {
            var n = notifications[i];
            if (n.id === id && n.targetRole === targetRole &&
                (n.targetId === "all" || n.targetId === targetId)) {
                n.isRead = true;
                changed = true;
                break;
            }
        }
        if (changed) _set(KEYS.notifications, notifications);
        return changed;
    }

    function getUnreadCount(targetRole, targetId) {
        return getNotificationsByTarget(targetRole, targetId)
            .filter(function (n) { return !n.isRead; }).length;
    }

    function markAllNotificationsRead(targetRole, targetId) {
        var notifications = getNotifications();
        var changed = false;
        for (var i = 0; i < notifications.length; i++) {
            var n = notifications[i];
            if (n.targetRole === targetRole &&
                (n.targetId === "all" || n.targetId === targetId) &&
                !n.isRead) {
                n.isRead = true;
                changed = true;
            }
        }
        if (changed) _set(KEYS.notifications, notifications);
        return changed;
    }

    function getOrderCustomerId(order) {
        if (!order) return 0;
        if (order.customerId !== undefined && order.customerId !== null) return order.customerId;
        if (order.userId !== undefined && order.userId !== null) return order.userId;
        return 0;
    }

    function migrateOrderSchema() {
        var orders = getOrders();
        var changed = false;

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            var customerId = getOrderCustomerId(order);

            if (order.customerId === undefined || order.customerId === null) {
                order.customerId = customerId;
                changed = true;
            }

            if (order.userId === undefined || order.userId === null) {
                order.userId = customerId;
                changed = true;
            }
            if (order.paymentMethod === undefined) {
                order.paymentMethod = "cod";
                changed = true;
            }
            if (order.paymentStatus === undefined) {
                order.paymentStatus = "pending";
                changed = true;
            }
        }

        if (changed) {
            _set(KEYS.orders, orders);
        }
    }


    // ── ORDERS (logic in admin-orders.js)

    function getOrders() {
        return _get(KEYS.orders) || [];
    }

    function getOrderById(id) {
        var orders = getOrders();
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].id === id) return orders[i];
        }
        return null;
    }

    function getOrdersByUser(userId) {
        var orders = getOrders();
        var result = [];
        for (var i = 0; i < orders.length; i++) {
            if (getOrderCustomerId(orders[i]) === userId) result.push(orders[i]);
        }
        return result;
    }

    function getOrdersByStatus(status) {
        var orders = getOrders();
        var result = [];
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].status === status) result.push(orders[i]);
        }
        return result;
    }

    function getOrdersByShop(shopId) {
        var orders = getOrders();
        var result = [];
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].shopId === shopId) result.push(orders[i]);
        }
        return result;
    }

    function getFilteredFinanceOrders(filters) {
        filters = filters || {};

        var orders = getOrders();
        var result = [];

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            if (order.status !== "delivered") continue;

            if (filters.shopId && filters.shopId !== "all" && String(order.shopId) !== String(filters.shopId)) {
                continue;
            }

            if (filters.dateFrom && new Date(order.createdAt) < new Date(filters.dateFrom)) {
                continue;
            }

            if (filters.dateTo && new Date(order.createdAt) > new Date(filters.dateTo)) {
                continue;
            }

            result.push(order);
        }

        return result;
    }

    function normalizeChangedBy(changedBy) {
        if (changedBy === "customer" || changedBy === "shop" || changedBy === "admin") {
            return changedBy;
        }

        var currentUser = (typeof Auth !== "undefined" && Auth.getCurrentUser)
            ? Auth.getCurrentUser()
            : null;
        if (currentUser && (currentUser.role === "customer" || currentUser.role === "shop" || currentUser.role === "admin")) {
            return currentUser.role;
        }

        return null;
    }

    function isAllowedStatusTransition(fromStatus, toStatus, changedBy) {
        if (fromStatus === toStatus) return false;

        if (changedBy === "admin") {
            return allowedStatuses[newStatus] === true;
        }

        if (changedBy === "shop") {
            if (fromStatus === "pending" && (toStatus === "confirmed" || toStatus === "cancelled")) return true;
            if (fromStatus === "confirmed" && toStatus === "shipped") return true;
            if (fromStatus === "shipped" && toStatus === "delivered") return true;
            return false;
        }

        if (changedBy === "customer") {
            return fromStatus === "pending" && toStatus === "cancelled";
        }

        return false;
    }

    function ensureOrderStatusHistory(order) {
        if (Array.isArray(order.statusHistory) && order.statusHistory.length > 0) {
            return;
        }

        var baseStatus = order.status || "pending";
        var baseTime = order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString();

        order.statusHistory = [{
            status: baseStatus,
            changedAt: baseTime,
            changedBy: "customer"
        }];
    }

    function addOrder(data) {
        var orders = getOrders();
        var customerId = data.customerId || data.userId || 0;
        var nowIso = new Date().toISOString();
        var payMethod = data.paymentMethod === "wallet" ? "wallet" : "cod";
        var newOrder = {
            id:            _nextId(KEYS.orders),
            customerId:    customerId,
            userId:        customerId,
            shopId:        data.shopId   || 0,
            items:         data.items    || [],
            total:         Number(data.total) || 0,
            status:        "pending",
            paymentMethod: payMethod,
            paymentStatus: payMethod === "wallet" ? "paid" : "pending",
            statusHistory: [{
                status: "pending",
                changedAt: nowIso,
                changedBy: "customer"
            }],
            createdAt: nowIso.split("T")[0]
        };
        orders.push(newOrder);
        _set(KEYS.orders, orders);
        return newOrder;
    }

    function updateOrderStatus(id, newStatus, changedBy) {
        var orders = getOrders();
        var normalizedChangedBy = normalizeChangedBy(changedBy);
        var allowedStatuses = {
            pending: true,
            confirmed: true,
            shipped: true,
            delivered: true,
            cancelled: true
        };

        if (!allowedStatuses[newStatus] || !normalizedChangedBy) {
            return null;
        }

        for (var i = 0; i < orders.length; i++) {
            if (orders[i].id === id) {
                var currentStatus = orders[i].status || "pending";
                ensureOrderStatusHistory(orders[i]);

                if (!isAllowedStatusTransition(currentStatus, newStatus, normalizedChangedBy)) {
                    return null;
                }

                orders[i].status = newStatus;
                orders[i].statusHistory.push({
                    status: newStatus,
                    changedAt: new Date().toISOString(),
                    changedBy: normalizedChangedBy
                });
                _set(KEYS.orders, orders);
                return orders[i];
            }
        }
        return null;
    }

    function deleteOrder(id) {
        var orders = getOrders();
        var filtered = [];
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].id !== id) filtered.push(orders[i]);
        }
        if (filtered.length === orders.length) return false;
        _set(KEYS.orders, filtered);
        return true;
    }


    // ── CART (tested in shop.js) not official

    function getCart() {
        return _get(KEYS.cart) || [];
    }

    function addToCart(productId, qty) {
        var cart = getCart();
        // Check if product already in cart
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].productId === productId) {
                cart[i].qty += qty;
                _set(KEYS.cart, cart);
                return cart[i];
            }
        }
        // New item
        var item = { productId: productId, qty: qty };
        cart.push(item);
        _set(KEYS.cart, cart);
        return item;
    }

    function updateCartQty(productId, qty) {
        var cart = getCart();
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].productId === productId) {
                cart[i].qty = qty;
                _set(KEYS.cart, cart);
                return cart[i];
            }
        }
        return null;
    }

    function removeFromCart(productId) {
        var cart = getCart();
        var filtered = [];
        for (var i = 0; i < cart.length; i++) {
            if (cart[i].productId !== productId) filtered.push(cart[i]);
        }
        if (filtered.length === cart.length) return false;
        _set(KEYS.cart, filtered);
        return true;
    }

    function clearCart() {
        _set(KEYS.cart, []);
    }

    function getCartTotal() {
        var cart = getCart();
        var total = 0;
        for (var i = 0; i < cart.length; i++) {
            var product = getProductById(cart[i].productId);
            if (product) {
                total += product.price * cart[i].qty;
            }
        }
        return total;
    }


    //   STATS (for admin dashboard) 

    function getTotalRevenue() {
        var orders = getOrders();
        var total = 0;
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].status !== "cancelled") {
                total += orders[i].total;
            }
        }
        return total;
    }

    function getShopRevenue(shopId) {
        var orders = getOrdersByShop(shopId);
        var total = 0;
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].status !== "cancelled") {
                total += orders[i].total;
            }
        }
        return total;
    }

    function getOrderCountByStatus() {
        var orders = getOrders();
        var counts = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
        for (var i = 0; i < orders.length; i++) {
            var s = orders[i].status;
            if (counts[s] !== undefined) counts[s]++;
        }
        return counts;
    }

    function getTopProducts(limit) {
        var orders = getOrders();
        var soldMap = {};
        for (var i = 0; i < orders.length; i++) {
            if (orders[i].status === "cancelled") continue;
            var items = orders[i].items;
            for (var j = 0; j < items.length; j++) {
                var pid = items[j].productId;
                soldMap[pid] = (soldMap[pid] || 0) + items[j].qty;
            }
        }
        // Convert to array and sort
        var arr = [];
        var pids = Object.keys(soldMap);
        for (var k = 0; k < pids.length; k++) {
            var product = getProductById(Number(pids[k]));
            if (product) {
                arr.push({ product: product, sold: soldMap[pids[k]] });
            }
        }
        arr.sort(function (a, b) { return b.sold - a.sold; });
        return arr.slice(0, limit || 5);
    }

    function getProductCountByCategory() {
        var products = getProducts();
        var counts = {};
        for (var i = 0; i < products.length; i++) {
            var cat = products[i].category;
            counts[cat] = (counts[cat] || 0) + 1;
        }
        return counts;
    }

    function getFinanceSummary(filters) {
        var orders = getFilteredFinanceOrders(filters);
        var activeShopMap = {};
        var totalRevenue = 0;

        for (var i = 0; i < orders.length; i++) {
            totalRevenue += Number(orders[i].total) || 0;

            var shop = getShopById(orders[i].shopId);
            if (shop && shop.shopStatus === "active") {
                activeShopMap[shop.id] = true;
            }
        }

        return {
            totalRevenue: totalRevenue,
            paidOrders: orders.length,
            avgOrderValue: orders.length ? Math.round(totalRevenue / orders.length) : 0,
            activeShops: Object.keys(activeShopMap).length
        };
    }

    function getRevenueByShop(filters) {
        var orders = getFilteredFinanceOrders(filters);
        var shopMap = {};
        var grandTotal = 0;
        var result = [];
        var i;

        for (i = 0; i < orders.length; i++) {
            var order = orders[i];
            var shop = getShopById(order.shopId);
            var shopName = shop ? (shop.shopName || shop.name) : ("Shop #" + order.shopId);
            var revenue = Number(order.total) || 0;

            if (!shopMap[order.shopId]) {
                shopMap[order.shopId] = {
                    shopId: order.shopId,
                    shopName: shopName,
                    orderCount: 0,
                    revenue: 0,
                    percentage: 0
                };
            }

            shopMap[order.shopId].orderCount += 1;
            shopMap[order.shopId].revenue += revenue;
            grandTotal += revenue;
        }

        for (var key in shopMap) {
            if (!Object.prototype.hasOwnProperty.call(shopMap, key)) continue;
            shopMap[key].percentage = grandTotal
                ? Math.round((shopMap[key].revenue / grandTotal) * 1000) / 10
                : 0;
            result.push(shopMap[key]);
        }

        result.sort(function (a, b) {
            return b.revenue - a.revenue;
        });

        return result;
    }

    function getTransactions(filters) {
        var orders = getFilteredFinanceOrders(filters).slice();
        orders.sort(function (a, b) {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        return orders;
    }


    // COUPONS

    function getCoupons() {
        return _get(KEYS.coupons) || [];
    }

    function getCouponsByShop(shopId) {
        return getCoupons().filter(function (c) { return c.shopId === shopId; });
    }

    function getCouponByCode(code) {
        var upper = (code || "").toUpperCase();
        var all = getCoupons();
        for (var i = 0; i < all.length; i++) {
            if (all[i].code.toUpperCase() === upper) return all[i];
        }
        return null;
    }

    function addCoupon(data) {
        var coupons = getCoupons();
        var coupon = Object.assign({}, data, {
            id:        _nextId(KEYS.coupons),
            code:      (data.code || "").toUpperCase(),
            usedCount: 0,
            createdAt: getTodayString()
        });
        coupons.push(coupon);
        _set(KEYS.coupons, coupons);
        return coupon;
    }

    function updateCoupon(id, data) {
        var coupons = getCoupons();
        for (var i = 0; i < coupons.length; i++) {
            if (coupons[i].id === id) {
                Object.assign(coupons[i], data);
                _set(KEYS.coupons, coupons);
                return coupons[i];
            }
        }
        return null;
    }

    function deleteCoupon(id) {
        var coupons = getCoupons().filter(function (c) { return c.id !== id; });
        _set(KEYS.coupons, coupons);
    }

    function validateCoupon(code, cart) {
        var coupon = getCouponByCode(code);
        if (!coupon) return { valid: false, message: "Invalid coupon code" };
        if (!coupon.isActive) return { valid: false, message: "Coupon is inactive" };

        var today = getTodayString();
        if (coupon.expiresAt && today > coupon.expiresAt) return { valid: false, message: "Coupon has expired" };
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return { valid: false, message: "Coupon usage limit reached" };

        var applicableTotal = 0;
        if (coupon.shopId === null || coupon.shopId === undefined) {
            for (var i = 0; i < cart.length; i++) {
                applicableTotal += cart[i].price * cart[i].quantity;
            }
        } else {
            var hasShopItems = false;
            for (var j = 0; j < cart.length; j++) {
                if (cart[j].shopId === coupon.shopId) {
                    applicableTotal += cart[j].price * cart[j].quantity;
                    hasShopItems = true;
                }
            }
            if (!hasShopItems) return { valid: false, message: "No items from this shop in your cart" };
        }

        if (coupon.minOrder > 0 && applicableTotal < coupon.minOrder) {
            return { valid: false, message: "Minimum order $" + coupon.minOrder + " required" };
        }

        var discount = coupon.type === "percent"
            ? applicableTotal * coupon.value / 100
            : Math.min(coupon.value, applicableTotal);

        return { valid: true, discount: discount, applicableTotal: applicableTotal, coupon: coupon };
    }

    function useCoupon(id) {
        var coupons = getCoupons();
        for (var i = 0; i < coupons.length; i++) {
            if (coupons[i].id === id) {
                coupons[i].usedCount = (coupons[i].usedCount || 0) + 1;
                _set(KEYS.coupons, coupons);
                return;
            }
        }
    }


    // Public API

    return {
        seed:       seed,
        resetAll:   resetAll,

        // Products
        getProducts:             getProducts,
        getApprovedProducts:     getApprovedProducts,
        getProductById:          getProductById,
        getProductsByStatus:     getProductsByStatus,
        getProductsByCategory:   getProductsByCategory,
        getProductsByShop:       getProductsByShop,
        getProductStats:         getProductStats,
        searchProducts:          searchProducts,
        addProduct:              addProduct,
        updateProduct:           updateProduct,
        deleteProduct:           deleteProduct,
        mergeProducts:           mergeProducts,
        reviewProduct:           reviewProduct,
        suspendProduct:          suspendProduct,
        restoreProduct:          restoreProduct,

        // Users
        getUsers:             getUsers,
        getUserById:          getUserById,
        getUserByEmail:       getUserByEmail,
        getUserByUsername:    getUserByUsername,
        addUser:              addUser,
        ensureUser:           ensureUser,
        updateUser:           updateUser,
        deleteUser:           deleteUser,

        // Wallet
        getWalletBalance:         getWalletBalance,
        getWalletTransactions:    getWalletTransactions,
        topUpWallet:              topUpWallet,
        deductWallet:             deductWallet,
        refundWallet:             refundWallet,

        // Shops (filtered from users)
        getShops:             getShops,
        getShopById:          getShopById,
        getCustomers:         getCustomers,
        updateShopStatus:     updateShopStatus,

        // Notifications
        getNotifications:             getNotifications,
        addNotification:              addNotification,
        getNotificationsByTarget:     getNotificationsByTarget,
        markNotificationRead:         markNotificationRead,
        getUnreadCount:               getUnreadCount,
        markAllNotificationsRead:     markAllNotificationsRead,

        // Orders
        getOrders:            getOrders,
        getOrderById:         getOrderById,
        getOrdersByUser:      getOrdersByUser,
        getOrdersByShop:      getOrdersByShop,
        getOrdersByStatus:    getOrdersByStatus,
        getOrderCustomerId:   getOrderCustomerId,
        addOrder:             addOrder,
        updateOrderStatus:    updateOrderStatus,
        deleteOrder:          deleteOrder,

        // Cart
        getCart:              getCart,
        addToCart:            addToCart,
        updateCartQty:        updateCartQty,
        removeFromCart:       removeFromCart,
        clearCart:            clearCart,
        getCartTotal:         getCartTotal,

        // Stats
        getTotalRevenue:          getTotalRevenue,
        getShopRevenue:           getShopRevenue,
        getOrderCountByStatus:    getOrderCountByStatus,
        getTopProducts:           getTopProducts,
        getProductCountByCategory: getProductCountByCategory,

        // Finance
        getFinanceSummary:       getFinanceSummary,

        getRevenueByShop:        getRevenueByShop,
        getTransactions:         getTransactions,

        // Coupons
        getCoupons:         getCoupons,
        getCouponsByShop:   getCouponsByShop,
        getCouponByCode:    getCouponByCode,
        addCoupon:          addCoupon,
        updateCoupon:       updateCoupon,
        deleteCoupon:       deleteCoupon,
        validateCoupon:     validateCoupon,
        useCoupon:          useCoupon
    };

})();

// Auto-seed on load
Store.seed();
