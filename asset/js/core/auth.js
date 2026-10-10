// core/auth.js — Auth dùng chung cho mọi role (Admin / Shop / Customer)
var Auth = (function () {

    var CURRENT_USER_KEY = "ecshop_currentUser";

    var ROLE_CONFIG = {
        admin: {
            loginPage: "admin/login.html"
        },
        shop: {
            loginPage:   "shop/login.html",
            waitingPage: "shop/waiting.html",
            blockedPage: "shop/suspended.html"
        },
        customer: {
            loginPage: "customer/login.html"
        }
    };

    // Admin role permission matrix
    var ADMIN_ROLES = {
        super_admin: {
            label:       "Super Admin",
            permissions: ["*"]
        },
        pm: {
            label:       "Product Manager",
            permissions: [
                "dashboard.view", "dashboard.reports",
                "orders.view", "orders.manage",
                "products.view", "products.manage",
                "shops.view", "shops.manage",
                "notifications.send", "notifications.view"
            ]
        },
        ba: {
            label:       "Business Analyst",
            permissions: [
                "dashboard.view", "dashboard.finance", "dashboard.reports",
                "orders.view",
                "products.view",
                "shops.view",
                "notifications.view"
            ]
        },
        hr: {
            label:       "HR Manager",
            permissions: [
                "dashboard.view",
                "users.view", "users.manage", "users.admin",
                "notifications.send", "notifications.view"
            ]
        },
        staff: {
            label:       "Staff",
            permissions: [
                "dashboard.view",
                "orders.view",
                "products.view", "products.manage",
                "shops.view",
                "notifications.view"
            ]
        }
    };

    // ── Private (internal) ───────────────────────────────────

    function _readSession() {
        try {
            var raw = localStorage.getItem(CURRENT_USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function _writeSession(session) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(session));
    }

    function _resolveAdminRole(user) {
        if (user.adminRole && ADMIN_ROLES[user.adminRole]) return user.adminRole;
        return user.adminLevel === 2 ? "super_admin" : "staff";
    }

    // ── Public API ───────────────────────────────────────────

    // Đăng nhập qua API — trả về { success, session } hoặc { error }
    async function authenticate(identifier, password, portal) {
        try {
            var session = await Api.auth.login(identifier, password, portal);
            return { success: true, session: session };
        } catch (e) {
            return { error: e.message || "Login failed" };
        }
    }

    // Lấy user hiện tại (current session)
    function getCurrentUser() {
        return _readSession();
    }

    // Đăng xuất + auto redirect về đúng login page theo role
    async function logout(redirectPath) {
        var user = getCurrentUser();
        await Api.auth.logout();

        if (redirectPath) {
            window.location.href = redirectPath;
            return;
        }

        if (user && ROLE_CONFIG[user.role]) {
            window.location.href = ROLE_CONFIG[user.role].loginPage;
            return;
        }

        window.location.href = "admin/login.html";
    }

    // Tầng 1 — Page guard (route protection)
    function requireRole(role, redirectPath) {
        var user = getCurrentUser();

        if (!user || user.role !== role) {
            var fallback = ROLE_CONFIG[role] ? ROLE_CONFIG[role].loginPage : "admin/login.html";
            window.location.href = redirectPath || fallback;
            return false;
        }

    // Shop: check thêm shopStatus mỗi lần load page (pending/suspended)
        if (role === "shop") {
            if (user.shopStatus === "pending") {
                window.location.href = ROLE_CONFIG.shop.waitingPage;
                return false;
            }
            if (user.shopStatus === "suspended") {
                window.location.href = ROLE_CONFIG.shop.blockedPage;
                return false;
            }
        }

        return true;
    }

    // Tầng 2 — Permission guard (return true/false, caller tự xử lý UI)
    function hasPermission(perm) {
        var user = getCurrentUser();
        if (!user || user.role !== "admin") return false;
        var perms = user.permissions;
        if (!perms) {
            var roleConfig = ADMIN_ROLES[user.adminRole || _resolveAdminRole(user)];
            if (!roleConfig) return false;
            perms = roleConfig.permissions;
        }
        for (var i = 0; i < perms.length; i++) {
            if (perms[i] === "*" || perms[i] === perm) return true;
        }
        return false;
    }

    // Page-level permission guard — redirects to dashboard if no access
    function requirePermission(perm) {
        if (!hasPermission(perm)) {
            window.location.href = "dashboard.html";
            return false;
        }
        return true;
    }

    // Legacy level-based guard (kept for backward compat)
    function requireLevel(minLevel) {
        var user = getCurrentUser();
        if (!user) return false;
        return (user.adminLevel || 1) >= minLevel;
    }

    function isSuperAdmin() {
        var user = getCurrentUser();
        if (!user) return false;
        if (user.adminRole) return user.adminRole === "super_admin";
        return (user.adminLevel || 1) >= 2;
    }

    // Returns the ADMIN_ROLES map (for dropdowns and label display)
    function getAdminRoles() {
        return ADMIN_ROLES;
    }

    // Đăng ký customer — server tạo tài khoản và đăng nhập luôn
    async function registerCustomer(data) {
        try {
            var session = await Api.auth.register({
                name: data.name, username: data.username, email: data.email, password: data.password
            });
            return { success: true, session: session };
        } catch (e) {
            return { error: e.message };
        }
    }

    // Đăng ký shop — KHÔNG auto login, chờ admin duyệt
    async function registerShop(data) {
        try {
            await Api.auth.registerShop(data);
            return { success: true, pending: true };
        } catch (e) {
            return { error: e.message };
        }
    }

    // Tạo admin mới — chỉ Super Admin hoặc HR được gọi
    function createAdmin(data) {
        if (!hasPermission("users.admin")) return { error: "Không có quyền tạo admin" };
        if (typeof Store === "undefined") return { error: "Store not available" };
        if (Store.getUserByEmail(data.email))       return { error: "Email đã được sử dụng" };
        if (Store.getUserByUsername(data.username)) return { error: "Username đã được sử dụng" };
        if (!data.password || data.password.length < 6) return { error: "Mật khẩu tối thiểu 6 ký tự" };

        var adminRole = data.adminRole || "staff";
        if (!ADMIN_ROLES[adminRole]) adminRole = "staff";

        Store.addUser({
            name:       data.name,
            email:      data.email,
            username:   data.username,
            password:   data.password,
            role:       "admin",
            adminRole:  adminRole,
            adminLevel: adminRole === "super_admin" ? 2 : 1
        });

        return { success: true };
    }

    return {
        authenticate:     authenticate,
        getCurrentUser:   getCurrentUser,
        logout:           logout,
        requireRole:      requireRole,
        requireLevel:     requireLevel,
        requirePermission: requirePermission,
        hasPermission:    hasPermission,
        isSuperAdmin:     isSuperAdmin,
        getAdminRoles:    getAdminRoles,
        registerCustomer: registerCustomer,
        registerShop:     registerShop,
        createAdmin:      createAdmin
    };

})();
