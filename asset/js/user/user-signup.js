// ===== Sign up flow (account is created on the server and logged in) =====

const signupForm = document.getElementById("signupForm");
if (signupForm) {
  signupForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const inputs = signupForm.querySelectorAll("input");

    try {
      await Api.auth.register({
        name: inputs[0].value.trim(),
        username: inputs[1].value.trim(),
        email: inputs[2].value.trim(),
        password: inputs[3].value.trim()
      });
    } catch (err) {
      alert(err.message);
      return;
    }

    alert("Đăng ký thành công!");
    window.location.href = "home.html";
  });
}
