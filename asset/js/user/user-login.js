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
    userContent.innerHTML = `<span class="ms">person</span><span class="user-guest-label">Sign in</span>`;
    if (userMenu) { userMenu.classList.add("hidden"); userMenu.style.display = ""; }
    userBtn.onclick = () => { UI.openAuth("login"); };
    return;
  }

  userBtn.classList.remove("user-btn--guest");

  const displayName = Api.escapeHtml(user.name || user.username || "User");
  const email       = Api.escapeHtml(user.email || user.username || "");
  const initial     = (user.name || user.username || "U").charAt(0).toUpperCase();

  const avatarInner = user.avatar
    ? `<img src="${Api.escapeHtml(user.avatar)}" alt="" />`
    : initial;

  userBtn.classList.add("user-btn--logged-in");
  // Remove material-symbols-outlined so the font's ligature engine doesn't mangle display text
  userContent.className = "user-content-pill";
  userContent.innerHTML = `
    <span class="user-avatar">${avatarInner}</span>
    <span class="user-display-name">${displayName}</span>
    <span class="ms user-chevron" id="userChevron">expand_more</span>`;

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
          <div class="udm-email">${email}</div>
        </div>
      </div>
      <div class="udm-divider"></div>
      <button class="udm-item" onclick="window.location.href='profile.html'">
        <span class="ms udm-icon">account_circle</span>
        View Profile
      </button>
      <button class="udm-item" onclick="window.location.href='profile.html#orders'">
        <span class="ms udm-icon">receipt_long</span>
        My Orders
      </button>
      <button class="udm-item" onclick="window.location.href='wallet.html'">
        <span class="ms udm-icon">account_balance_wallet</span>
        Wallet
      </button>
      <div class="udm-divider"></div>
      <button class="udm-item udm-item--danger" onclick="logout()">
        <span class="ms udm-icon">logout</span>
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

document.addEventListener("DOMContentLoaded", renderUser);
