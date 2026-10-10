// ===== Sign up form (signup.html): the account is created on the server and signed in =====

const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const value = (id) => document.getElementById(id).value.trim();
    const show = (message) => {
      const el = document.getElementById("authError");
      el.textContent = message;
      el.hidden = false;
    };

    if (!value("suName") || !value("suUser") || !value("suEmail") || !value("suPass")) {
      show("Fill in every field.");
      return;
    }
    if (document.getElementById("suPass").value.length < 6) {
      show("Your password needs at least 6 characters.");
      return;
    }

    const submit = document.getElementById("authSubmit");
    submit.disabled = true;
    try {
      await Api.auth.register({
        name: value("suName"),
        username: value("suUser"),
        email: value("suEmail"),
        password: document.getElementById("suPass").value
      });
    } catch (err) {
      show(err.message);
      submit.disabled = false;
      return;
    }
    window.location.href = "home.html";
  });
}

// Show / hide password
document.querySelectorAll(".pass-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    btn.setAttribute("aria-pressed", String(reveal));
    btn.setAttribute("aria-label", reveal ? "Hide password" : "Show password");
    btn.firstElementChild.textContent = reveal ? "visibility_off" : "visibility";
  });
});
