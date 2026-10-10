// ============================================================
// admin-login.js — Trang đăng nhập Admin (login flow)


var currentUser = Auth.getCurrentUser();
if (currentUser && currentUser.role === "admin") {
    window.location.href = "dashboard.html";
}




var toggleBtn = document.getElementById("togglePassword");
var passwordInput = document.getElementById("password");

toggleBtn.addEventListener("click", function () {
    if (passwordInput.type === "password") {
        passwordInput.type = "text";
        toggleBtn.textContent = "Hide";
    } else {
        passwordInput.type = "password";
        toggleBtn.textContent = "Show";
    }
});


// Form submit (handle login)
var loginForm = document.getElementById("loginForm");
var loginError = document.getElementById("loginError");

loginForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    var identifier = document.getElementById("identifier").value.trim();
    var password = document.getElementById("password").value;

    // Ẩn lỗi cũ (clear previous error)
    loginError.classList.remove("show");


    var result = await Auth.authenticate(identifier, password, "admin");

    if (result.error) {
        loginError.textContent = result.error === "Not an admin account"
            ? "You do not have admin access."
            : "Wrong username/email or password. Please try again.";
        loginError.classList.add("show");
        return;
    }

    // Redirect về dashboard
    window.location.href = "dashboard.html";
});
