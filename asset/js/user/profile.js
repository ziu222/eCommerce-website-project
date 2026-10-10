// Wallet data from the server, read by renderBalance and getRank
var walletSnapshot = { balance: 0, transactions: [] };

document.addEventListener("DOMContentLoaded", async function () {

    // ── Auth guard ────────────────────────────────────────
    var session = getCurrentUser();
    if (!session || session.role !== "customer") {
        window.location.href = "login.html";
        return;
    }

    Store.seed();

    var fullUser = Store.getUserById(session.id);
    if (!fullUser) {
        window.location.href = "login.html";
        return;
    }

    try { walletSnapshot = await Api.wallet.get(); } catch (e) { /* shown as an empty wallet */ }

    // ── Render profile ────────────────────────────────────
    renderProfile(fullUser);
    renderBalance(fullUser.id);
    renderCoverPhoto(fullUser);

    // ── Cover photo upload ────────────────────────────────
    var profileCover = document.getElementById("profileCover");
    var coverInput   = document.getElementById("coverInput");

    if (profileCover) profileCover.addEventListener("click", function () {
        coverInput.click();
    });

    if (coverInput) coverInput.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            var base64 = ev.target.result;
            fullUser.coverPhoto = base64;
            renderCoverPhoto(fullUser);
            Store.updateUser(fullUser.id, { coverPhoto: base64 });
            showToast("Cover photo updated");
        };
        reader.readAsDataURL(file);
    });

    // ── Avatar upload ─────────────────────────────────────
    var avatarWrap = document.getElementById("avatarWrap");
    var avatarInput = document.getElementById("avatarInput");

    if (avatarWrap) avatarWrap.addEventListener("click", function () {
        avatarInput.click();
    });

    if (avatarInput) avatarInput.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            var base64 = ev.target.result;
            setAvatarDisplay(base64);
            fullUser.avatar = base64;
            Store.updateUser(fullUser.id, { avatar: base64 });
            updateSession(fullUser);
            showToast("Avatar updated");
        };
        reader.readAsDataURL(file);
    });

    // ── Save changes ──────────────────────────────────────
    var form = document.getElementById("profileForm");
    if (form) form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!validateForm(fullUser)) return;

        var name  = document.getElementById("inputName").value.trim();
        var email = document.getElementById("inputEmail").value.trim();
        var newPw = document.getElementById("inputNewPw").value;

        var updates = { name: name, email: email };
        if (newPw) updates.password = newPw;

        Store.updateUser(fullUser.id, updates);
        fullUser = Store.getUserById(fullUser.id);
        updateSession(fullUser);
        renderProfile(fullUser);

        document.getElementById("inputCurrentPw").value = "";
        document.getElementById("inputNewPw").value = "";
        document.getElementById("inputConfirmPw").value = "";

        // Reset email back to readonly
        var emailEl = document.getElementById("inputEmail");
        var editBtn = document.getElementById("emailEditBtn");
        if (emailEl) { emailEl.setAttribute("readonly", ""); emailEl.classList.add("profile-input--readonly"); }
        if (editBtn) editBtn.style.display = "";

        showToast("Profile updated successfully");
    });

    // ── Email edit toggle ─────────────────────────────────
    var emailEditBtn = document.getElementById("emailEditBtn");
    var inputEmail   = document.getElementById("inputEmail");
    if (emailEditBtn && inputEmail) {
        emailEditBtn.addEventListener("click", function () {
            inputEmail.removeAttribute("readonly");
            inputEmail.classList.remove("profile-input--readonly");
            inputEmail.focus();
            emailEditBtn.style.display = "none";
        });
    }

    // ── Cart button ───────────────────────────────────────
    var cartBtn = document.getElementById("cart-btn");
    if (cartBtn) cartBtn.addEventListener("click", function () {
        window.location.href = "cart.html";
    });
});

// ── Helpers ───────────────────────────────────────────────

function renderProfile(user) {
    var displayName = user.name || user.username || "User";
    var initial     = displayName.charAt(0).toUpperCase();

    setAvatarDisplay(user.avatar || null, initial);

    var nameEl = document.getElementById("profileDisplayName");
    if (nameEl) nameEl.textContent = displayName;

    var unameEl = document.getElementById("profileDisplayUsername");
    if (unameEl) unameEl.textContent = "@" + (user.username || "");

    var memberEl = document.getElementById("metaMember");
    if (memberEl && user.createdAt) {
        var d = new Date(user.createdAt);
        memberEl.textContent = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }

    var rank = getRank(user.id);
    var rankEl = document.getElementById("profileRank");
    if (rankEl) {
        rankEl.textContent = rank.label;
        rankEl.className = "rank-badge " + rank.cls;
    }

    var inputName = document.getElementById("inputName");
    var inputEmail = document.getElementById("inputEmail");
    var inputUsername = document.getElementById("inputUsername");
    if (inputName) inputName.value = user.name || "";
    if (inputEmail) inputEmail.value = user.email || "";
    if (inputUsername) inputUsername.value = user.username || "";
}

function setAvatarDisplay(src, fallbackInitial) {
    var avatarEl = document.getElementById("profileAvatar");
    if (!avatarEl) return;
    if (src) {
        avatarEl.innerHTML = '<img src="' + src + '" alt="avatar" />';
    } else {
        avatarEl.textContent = fallbackInitial || "?";
    }
}

function renderCoverPhoto(user) {
    var coverEl = document.getElementById("profileCover");
    if (!coverEl) return;
    var existing = coverEl.querySelector("img");
    if (user.coverPhoto) {
        if (existing) {
            existing.src = user.coverPhoto;
        } else {
            var img = document.createElement("img");
            img.src = user.coverPhoto;
            img.alt = "cover";
            coverEl.insertBefore(img, coverEl.firstChild);
        }
    } else if (existing) {
        existing.remove();
    }
}

function renderBalance(userId) {
    var balance = walletSnapshot.balance || 0;
    var el = document.getElementById("profileBalance");
    if (el) el.textContent = "$" + Number(balance).toLocaleString("en-US", { minimumFractionDigits: 2 });
}

function validateForm(fullUser) {
    var ok = true;

    var name      = document.getElementById("inputName").value.trim();
    var email     = document.getElementById("inputEmail").value.trim();
    var currentPw = document.getElementById("inputCurrentPw").value;
    var newPw     = document.getElementById("inputNewPw").value;
    var confirmPw = document.getElementById("inputConfirmPw").value;

    clearErrors();

    if (!name) { showError("errorName", "Name is required"); ok = false; }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("errorEmail", "Enter a valid email"); ok = false;
    }

    if (newPw || currentPw || confirmPw) {
        if (!currentPw) {
            showError("errorCurrentPw", "Enter your current password"); ok = false;
        } else if (currentPw !== fullUser.password) {
            showError("errorCurrentPw", "Current password is incorrect"); ok = false;
        }
        if (newPw && newPw.length < 6) {
            showError("errorNewPw", "New password must be at least 6 characters"); ok = false;
        }
        if (newPw !== confirmPw) {
            showError("errorConfirmPw", "Passwords do not match"); ok = false;
        }
    }

    return ok;
}

function showError(id, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    var input = el.previousElementSibling;
    if (input) input.classList.add("error");
}

function clearErrors() {
    document.querySelectorAll(".profile-field-error").forEach(function (el) {
        el.classList.remove("show");
        el.textContent = "";
    });
    document.querySelectorAll(".profile-input.error").forEach(function (el) {
        el.classList.remove("error");
    });
}

function updateSession(user) {
    var session = getCurrentUser();
    if (!session) return;
    var updated = Object.assign({}, session, {
        name: user.name,
        email: user.email,
        username: user.username,
        avatar: user.avatar || ""
    });
    localStorage.setItem("ecshop_currentUser", JSON.stringify(updated));
    renderUser();
}

function getRank(userId) {
    var txns = walletSnapshot.transactions || [];
    var spent = txns
        .filter(function (t) { return t.type === "payment"; })
        .reduce(function (sum, t) { return sum + Math.abs(t.amount); }, 0);

    if (spent >= 3000) return { label: "VIP+",   cls: "rank-vipplus" };
    if (spent >= 1000) return { label: "VIP",    cls: "rank-vip" };
    if (spent >= 200)  return { label: "Elite",  cls: "rank-elite" };
    return                    { label: "Normal", cls: "rank-normal" };
}

function showToast(msg) {
    var toast = document.getElementById("profileToast");
    if (!toast) return;
    toast.querySelector(".toast-msg").textContent = msg;
    toast.classList.add("show");
    setTimeout(function () { toast.classList.remove("show"); }, 2800);
}
