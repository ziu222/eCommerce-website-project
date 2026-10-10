// ===== Lấy dữ liệu User (LocalStorage) =====
function getUsers() {
  return JSON.parse(localStorage.getItem("ecshop_users")) || [];
}

// ===== User Session (phiên đăng nhập) =====
function getCurrentUser() {
  return JSON.parse(localStorage.getItem("ecshop_currentUser"));
}

function renderUser() {
  const user = getCurrentUser();

  const userBtn     = document.getElementById("userBtn");
  const userContent = document.getElementById("userContent");
  const userMenu    = document.getElementById("userMenu");

  if (!userBtn || !userContent) return;

  if (!user) {
    userBtn.classList.remove("user-btn--logged-in");
    userBtn.classList.add("user-btn--guest");
    userContent.className = "user-content-pill";
    userContent.innerHTML = `<span class="material-symbols-outlined">person</span><span class="user-guest-label">Login</span>`;
    if (userMenu) { userMenu.classList.add("hidden"); userMenu.style.display = ""; }
    userBtn.onclick = () => { window.location.href = "login.html"; };
    return;
  }

  userBtn.classList.remove("user-btn--guest");

  const displayName = user.name || user.username || "User";
  const initial     = displayName.charAt(0).toUpperCase();

  const avatarInner = user.avatar
    ? `<img src="${user.avatar}" alt="${initial}" />`
    : initial;

  userBtn.classList.add("user-btn--logged-in");
  // Remove material-symbols-outlined so the font's ligature engine doesn't mangle display text
  userContent.className = "user-content-pill";
  userContent.innerHTML = `
    <span class="user-avatar">${avatarInner}</span>
    <span class="user-display-name">${displayName}</span>
    <span class="material-symbols-outlined user-chevron" id="userChevron">expand_more</span>`;

  if (userMenu) {
    userMenu.style.display = "";
    userMenu.innerHTML = `
      <div class="udm-profile">
        <div class="udm-avatar-wrap">
          <div class="udm-big-avatar">${avatarInner}</div>
          <span class="udm-online"></span>
        </div>
        <div class="udm-info">
          <div class="udm-name">${displayName}</div>
          <div class="udm-email">${user.email || user.username || ""}</div>
        </div>
      </div>
      <div class="udm-divider"></div>
      <button class="udm-item" onclick="window.location.href='profile.html'">
        <span class="material-symbols-outlined udm-icon">account_circle</span>
        View Profile
      </button>
      <button class="udm-item" onclick="window.location.href='wallet.html'">
        <span class="material-symbols-outlined udm-icon">account_balance_wallet</span>
        Wallet
      </button>
      <div class="udm-divider"></div>
      <button class="udm-item udm-item--danger" onclick="logout()">
        <span class="material-symbols-outlined udm-icon">logout</span>
        Sign Out
      </button>`;
    userMenu.classList.add("hidden");
  }

  userBtn.onclick = (e) => {
    e.stopPropagation();
    const menu     = document.getElementById("userMenu");
    const chevron  = document.getElementById("userChevron");
    if (!menu) return;
    const isOpen = menu.classList.toggle("hidden") === false;
    if (chevron) chevron.style.transform = isOpen ? "rotate(180deg)" : "rotate(0deg)";
  };
}

document.addEventListener("click", (e) => {
  const menu    = document.getElementById("userMenu");
  const btn     = document.getElementById("userBtn");
  const chevron = document.getElementById("userChevron");
  if (menu && btn && !btn.contains(e.target)) {
    menu.classList.add("hidden");
    if (chevron) chevron.style.transform = "rotate(0deg)";
  }
});

async function logout() {
  await Api.auth.logout();
  location.reload();
}

var CustomerModal = (function () {
  var hideTimer = null;
  var lastActiveElement = null;

  function getEls() {
    return {
      overlay: document.getElementById("customerModal"),
      title: document.getElementById("customerModalTitle"),
      message: document.getElementById("customerModalMessage"),
      okBtn: document.getElementById("customerModalOk")
    };
  }

  function close(options) {
    var opts = options || {};
    var els = getEls();
    if (!els.overlay) return;

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    els.overlay.classList.remove("show");
    els.overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("customer-modal-open");

    if (opts.restoreFocus !== false && lastActiveElement && typeof lastActiveElement.focus === "function") {
      lastActiveElement.focus();
    }
    lastActiveElement = null;

    if (typeof opts.onClose === "function") {
      opts.onClose();
    }
  }

  function open(options) {
    var opts = options || {};
    var els = getEls();
    if (!els.overlay) return false;

    lastActiveElement = document.activeElement;

    if (els.title) {
      els.title.textContent = opts.title || "Success";
    }
    if (els.message) {
      els.message.textContent = opts.message || "Action completed successfully.";
    }

    els.overlay.classList.add("show");
    els.overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("customer-modal-open");

    if (els.okBtn) {
      els.okBtn.textContent = opts.buttonText || "Continue";
      els.okBtn.focus();
    }

    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (opts.autoCloseMs && opts.autoCloseMs > 0) {
      hideTimer = setTimeout(function () {
        close({ restoreFocus: false, onClose: opts.onAutoClose });
      }, opts.autoCloseMs);
    }

    return true;
  }

  function init() {
    var els = getEls();
    if (!els.overlay) return;

    if (els.okBtn) {
      els.okBtn.addEventListener("click", function () {
        close();
      });
    }

    els.overlay.addEventListener("click", function (e) {
      if (e.target === els.overlay) {
        close();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.overlay.classList.contains("show")) {
        close();
      }
    });
  }

  return {
    init: init,
    open: open,
    close: close
  };
})();

// ===== Điều hướng (navigation) =====
const signupTab = document.querySelector(".auth-links span:first-child");
const loginTab = document.querySelector(".auth-links span:last-child");

if (signupTab && loginTab) {
  signupTab.addEventListener("click", () => {
    window.location.href = "signup.html";
  });

  loginTab.addEventListener("click", () => {
    window.location.href = "login.html";
  });
}

// ===== Login flow =====
const loginForm = document.getElementById("loginForm");

if (loginForm) {
  loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const inputs = loginForm.querySelectorAll("input");
    const username = inputs[0].value.trim();
    const password = inputs[1].value.trim();

    try {
      await Api.auth.login(username, password);
    } catch (err) {
      const blocked = {
        pending: "Shop của bạn đang chờ admin duyệt.",
        suspended: "Tài khoản đã bị tạm khóa.",
        banned: "Tài khoản đã bị khóa."
      };
      alert(blocked[err.message] || err.message || "Sai tên hoặc mật khẩu!");
      return;
    }

    var shown = CustomerModal.open({
      title: "Đăng nhập thành công",
      message: "Chào mừng bạn quay lại. Đang chuyển đến trang chủ...",
      buttonText: "Ở lại",
      autoCloseMs: 1250,
      onAutoClose: function () {
        window.location.href = "home.html";
      }
    });

    if (!shown) {
      window.location.href = "home.html";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderUser();
  CustomerModal.init();
});