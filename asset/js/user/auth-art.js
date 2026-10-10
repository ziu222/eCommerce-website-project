// auth-art.js — the picture side of the sign in and sign up screens: the product cards lean towards the pointer.
// Each card has a --depth, so the nearer ones move more. Off when motion is reduced.

(function () {

    var aside = document.querySelector(".auth-aside");
    if (!aside || !window.matchMedia("(pointer: fine)").matches) return;

    var frame = null;

    aside.addEventListener("mousemove", function (e) {
        if (document.documentElement.dataset.motion === "reduced" || frame) return;
        frame = requestAnimationFrame(function () {
            frame = null;
            var box = aside.getBoundingClientRect();
            aside.style.setProperty("--px", ((e.clientX - box.left) / box.width - 0.5).toFixed(3));
            aside.style.setProperty("--py", ((e.clientY - box.top) / box.height - 0.5).toFixed(3));
        });
    });

    aside.addEventListener("mouseleave", function () {
        aside.style.setProperty("--px", "0");
        aside.style.setProperty("--py", "0");
    });

})();
