// auth-sheet.js — sign in and sign up as a sheet that slides up over the page the visitor is on.
// Opened through UI.openAuth("login" | "signup", options); ui.js loads this file and its CSS on first use.
//   options.required  the page needs an account: closing the sheet without signing in sends the visitor home
//   options.next      a page to go to after signing in (otherwise the current page is reloaded)

var AuthSheet = (function () {

    var root, sheet, tabs, panels, head;
    var mode = "login";
    var opener = null;
    var opts = {};
    var signedIn = false;
    var busy = false;

    var COPY = {
        login: { title: "Welcome back", sub: "Sign in to check out, track orders and use your wallet." },
        signup: { title: "Create your account", sub: "It takes a minute. You can add money to your wallet later." }
    };

    var BLOCKED = {
        pending: "Your shop is waiting for admin approval.",
        suspended: "This account is suspended.",
        banned: "This account has been banned."
    };

    // Volt watches the form: its eyes follow what you type, it covers them for the password,
    // peeks when the password is shown, looks sorry at an error and cheers when you are in.
    var VOLT = '<svg class="as-volt volt" viewBox="0 0 96 84" aria-hidden="true">' +
        '<g class="volt-antenna"><line x1="48" y1="14" x2="48" y2="7" stroke="#151b1a" stroke-width="2.6" stroke-linecap="round"/>' +
        '<circle class="v-bulb volt-bulb" cx="48" cy="6" r="4" fill="#f2a516"/></g>' +
        '<rect x="12" y="34" width="8" height="16" rx="4" fill="#084f4b"/><rect x="76" y="34" width="8" height="16" rx="4" fill="#084f4b"/>' +
        '<rect x="17" y="14" width="62" height="54" rx="20" fill="#0b6b66"/>' +
        '<rect class="v-screen" x="25" y="23" width="46" height="35" rx="12" fill="#e9f4f2"/>' +
        '<g class="v-brows"><path d="M31 31l9 3M65 31l-9 3" stroke="#151b1a" stroke-width="2.4" stroke-linecap="round"/></g>' +
        '<g class="volt-glance"><g class="v-eyes volt-eyes"><g class="v-look"><ellipse cx="38" cy="38" rx="3.6" ry="4.4" fill="#151b1a"/><ellipse cx="58" cy="38" rx="3.6" ry="4.4" fill="#151b1a"/></g></g></g>' +
        '<g class="v-joy"><path d="M33 39q5-6 10 0M53 39q5-6 10 0" fill="none" stroke="#151b1a" stroke-width="2.6" stroke-linecap="round"/></g>' +
        '<circle cx="31" cy="46" r="2.8" fill="#f4a58a"/><circle cx="65" cy="46" r="2.8" fill="#f4a58a"/>' +
        '<path class="v-smile" d="M42 47q6 4.6 12 0" fill="none" stroke="#151b1a" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path class="v-frown" d="M42 50q6-4.4 12 0" fill="none" stroke="#151b1a" stroke-width="2.6" stroke-linecap="round"/>' +
        '<path class="v-grin" d="M41 46h14q-1.2 7-7 7t-7-7z" fill="#151b1a"/>' +
        '<g class="v-hand v-hand--l"><rect x="22" y="28" width="26" height="20" rx="10" fill="#084f4b"/><rect x="26" y="26" width="5" height="9" rx="2.5" fill="#084f4b"/><rect x="33" y="25" width="5" height="9" rx="2.5" fill="#084f4b"/><rect x="40" y="26" width="5" height="9" rx="2.5" fill="#084f4b"/></g>' +
        '<g class="v-hand v-hand--r"><rect x="48" y="28" width="26" height="20" rx="10" fill="#084f4b"/><rect x="51" y="26" width="5" height="9" rx="2.5" fill="#084f4b"/><rect x="58" y="25" width="5" height="9" rx="2.5" fill="#084f4b"/><rect x="65" y="26" width="5" height="9" rx="2.5" fill="#084f4b"/></g>' +
        "</svg>";

    var volt = null;
    var moodTimer = null;

    function setMood(mood) {
        if (!volt) return;
        volt.dataset.mood = mood || "";
    }

    // Eyes slide from left to right as the text in the focused field grows, and look down at the form.
    function lookAt(input) {
        if (!volt) return;
        var look = volt.querySelector(".v-look");
        if (!input) { look.style.transform = ""; delete volt.dataset.watch; return; }
        volt.dataset.watch = "1";
        var ratio = Math.min(1, (input.value.length || 0) / 28);
        look.style.transform = "translate(" + (-4 + ratio * 8).toFixed(1) + "px, 3px)";
    }

    function watchForm() {
        volt = root.querySelector(".as-volt");
        root.addEventListener("focusin", function (e) {
            var input = e.target.closest("input");
            if (!input) return;
            clearTimeout(moodTimer);
            if (input.type === "password") setMood("shy");
            else if (input.closest(".as-pass")) setMood("peek");
            else { setMood(""); lookAt(input); }
        });
        root.addEventListener("input", function (e) {
            var input = e.target.closest("input");
            if (input && input.type !== "password" && !input.closest(".as-pass")) lookAt(input);
        });
        root.addEventListener("focusout", function () {
            setTimeout(function () {
                if (root.contains(document.activeElement) && document.activeElement.tagName === "INPUT") return;
                if (volt.dataset.mood === "shy" || volt.dataset.mood === "peek") setMood("");
                lookAt(null);
            }, 0);
        });
    }

    function html() {
        function pass(id, label, auto, hint) {
            return '<div class="field as-item"><label for="' + id + '">' + label + '</label><div class="as-pass">' +
                '<input class="input" type="password" id="' + id + '" autocomplete="' + auto + '">' +
                '<button type="button" class="as-eye" aria-label="Show password" aria-pressed="false"><span class="ms">visibility</span></button></div>' +
                (hint ? '<p class="hint">' + hint + "</p>" : "") + "</div>";
        }
        function text(id, label, type, auto) {
            return '<div class="field as-item"><label for="' + id + '">' + label + '</label><input class="input" type="' + type + '" id="' + id + '" autocomplete="' + auto + '"></div>';
        }
        function submit(label) {
            return '<p class="as-error as-item" role="alert" hidden></p>' +
                '<button type="submit" class="btn btn-primary btn-lg btn-block as-submit as-item"><span class="as-label">' + label + '</span><span class="as-spin">' + UI.loader(26, "Signing in") + '</span></button>';
        }
        return '<div class="as-backdrop" data-as-close></div>' +
            '<section class="as-sheet" role="dialog" aria-modal="true" aria-labelledby="asTitle">' +
            '<div class="as-grab" aria-hidden="true"><span></span></div>' +
            '<button type="button" class="as-x" aria-label="Close" data-as-close><span class="ms">close</span></button>' +
            '<div class="as-head"><span class="as-volt-wrap" style="--n:0">' + VOLT + "</span>" + '<h2 id="asTitle" style="--n:1"></h2><p class="muted" id="asSub" style="--n:2"></p></div>' +
            '<div class="as-tabs" role="tablist" data-mode="login"><span class="as-ind" aria-hidden="true"></span>' +
            '<button type="button" role="tab" class="as-tab" id="asTabLogin" data-mode="login" aria-selected="true" aria-controls="asLogin">Sign in</button>' +
            '<button type="button" role="tab" class="as-tab" id="asTabSignup" data-mode="signup" aria-selected="false" aria-controls="asSignup">Create account</button></div>' +
            '<div class="as-panels" id="asPanels">' +
            '<form class="as-panel is-active" id="asLogin" role="tabpanel" aria-labelledby="asTabLogin" novalidate>' +
            text("asUser", "Username", "text", "username") +
            pass("asPass", "Password", "current-password") + submit("Sign in") + "</form>" +
            '<form class="as-panel" id="asSignup" role="tabpanel" aria-labelledby="asTabSignup" novalidate>' +
            text("asName", "Full name", "text", "name") + text("asNewUser", "Username", "text", "username") +
            text("asEmail", "Email", "email", "email") + pass("asNewPass", "Password", "new-password", "At least 6 characters.") + submit("Create account") + "</form>" +
            '<div class="as-panel as-done" id="asDone" role="status" aria-live="polite"></div>' +
            "</div></section>";
    }

    // ---------- building and fitting

    function build() {
        root = document.createElement("div");
        root.className = "as-root";
        root.innerHTML = html();
        document.body.appendChild(root);

        sheet = root.querySelector(".as-sheet");
        tabs = root.querySelector(".as-tabs");
        panels = root.querySelector("#asPanels");
        head = root.querySelector(".as-head");

        // each field and button gets its place in the rise-in order
        root.querySelectorAll(".as-panel").forEach(function (p) {
            [].forEach.call(p.children, function (el, i) { el.style.setProperty("--n", i); });
        });

        root.addEventListener("click", function (e) {
            if (e.target.closest("[data-as-close]")) close(true);
        });
        tabs.addEventListener("click", function (e) {
            var t = e.target.closest(".as-tab");
            if (t && !busy) setMode(t.dataset.mode);
        });
        root.querySelectorAll(".as-eye").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var input = btn.parentNode.querySelector("input");
                var show = input.type === "password";
                input.type = show ? "text" : "password";
                btn.setAttribute("aria-pressed", String(show));
                btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
                btn.firstElementChild.textContent = show ? "visibility_off" : "visibility";
                setMood(show ? "peek" : "shy");
                input.focus();
            });
        });
        root.querySelector("#asLogin").addEventListener("submit", onLogin);
        root.querySelector("#asSignup").addEventListener("submit", onSignup);
        root.addEventListener("keydown", onKey);
        watchForm();
        dragToClose();

        // the box around the panels follows the height of the one that is showing
        if (window.ResizeObserver) {
            var ro = new ResizeObserver(fit);
            root.querySelectorAll(".as-panel").forEach(function (p) { ro.observe(p); });
        }
    }

    function activePanel() {
        return panels.querySelector(".as-panel.is-active");
    }

    function fit() {
        var p = activePanel();
        if (p) panels.style.height = p.offsetHeight + 4 + "px";
    }

    function setMode(next, instant) {
        mode = next;
        var login = root.querySelector("#asLogin");
        var signup = root.querySelector("#asSignup");
        tabs.dataset.mode = mode;
        root.querySelector("#asTabLogin").setAttribute("aria-selected", String(mode === "login"));
        root.querySelector("#asTabSignup").setAttribute("aria-selected", String(mode === "signup"));
        login.classList.toggle("is-left", mode === "signup");
        login.classList.toggle("is-active", mode === "login");
        signup.classList.toggle("is-active", mode === "signup");
        root.querySelector("#asDone").classList.remove("is-active");
        clearErrors();

        var title = root.querySelector("#asTitle");
        var sub = root.querySelector("#asSub");
        function write() { title.textContent = COPY[mode].title; sub.textContent = COPY[mode].sub; }
        if (instant) { write(); } else {
            head.classList.add("is-swapping");
            setTimeout(function () { write(); head.classList.remove("is-swapping"); }, 180);
        }
        fit();
        if (!instant) setTimeout(function () { var f = activePanel().querySelector("input"); if (f) f.focus(); }, 250);
    }

    // ---------- open and close

    function open(startMode, options) {
        if (!root) build();
        opts = options || {};
        opener = document.activeElement;
        signedIn = false;
        busy = false;
        sheet.classList.remove("is-done");
        setMood("");
        setMode(startMode === "signup" ? "signup" : "login", true);
        root.classList.add("as-fresh");
        document.documentElement.classList.add("as-lock");
        // one frame later, so the slide starts from the closed position
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                root.classList.add("is-open");
                fit();
            });
        });
        setTimeout(function () {
            root.classList.remove("as-fresh");
            var f = activePanel().querySelector("input");
            if (f && root.classList.contains("is-open")) f.focus();
        }, 900);
    }

    function close(byVisitor) {
        if (!root || !root.classList.contains("is-open")) return;
        root.classList.remove("is-open");
        document.documentElement.classList.remove("as-lock");
        sheet.style.transform = "";
        sheet.classList.remove("is-dragging");
        root.querySelector(".as-backdrop").style.opacity = "";
        forgetAuthParams();
        if (opener && opener.focus) opener.focus();
        if (byVisitor && opts.required && !signedIn && !/home\.html$/.test(location.pathname)) {
            setTimeout(function () { location.href = "home.html"; }, 350);
        }
    }

    function forgetAuthParams() {
        var p = new URLSearchParams(location.search);
        if (!p.has("auth") && !p.has("next")) return;
        p.delete("auth");
        p.delete("next");
        var qs = p.toString();
        history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    }

    // ---------- keyboard: Escape closes, Tab stays inside the sheet

    function onKey(e) {
        if (e.key === "Escape" && !busy) { close(true); return; }
        if (e.key !== "Tab") return;
        var items = [].filter.call(sheet.querySelectorAll("button, input, a[href]"), function (el) {
            return !el.disabled && el.offsetParent !== null;
        });
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    // ---------- drag the handle down to close (phones)

    function dragToClose() {
        var grab = root.querySelector(".as-grab");
        var startY = null;
        grab.addEventListener("pointerdown", function (e) {
            startY = e.clientY;
            grab.setPointerCapture(e.pointerId);
            sheet.classList.add("is-dragging");
        });
        grab.addEventListener("pointermove", function (e) {
            if (startY === null) return;
            var dy = Math.max(0, e.clientY - startY);
            sheet.style.transform = "translateY(" + dy + "px)";
            root.querySelector(".as-backdrop").style.opacity = String(Math.max(0, 1 - dy / 420));
        });
        function end(e) {
            if (startY === null) return;
            var dy = e.clientY - startY;
            startY = null;
            sheet.classList.remove("is-dragging");
            if (dy > 110) { close(true); return; }
            sheet.style.transform = "";
            root.querySelector(".as-backdrop").style.opacity = "";
        }
        grab.addEventListener("pointerup", end);
        grab.addEventListener("pointercancel", end);
    }

    // ---------- forms

    function clearErrors() {
        root.querySelectorAll(".as-error").forEach(function (el) { el.hidden = true; el.classList.remove("shake"); });
    }

    function fail(form, message) {
        var el = form.querySelector(".as-error");
        el.textContent = message;
        el.hidden = false;
        el.classList.remove("shake");
        void el.offsetWidth; // restart the shake when the same error comes twice
        el.classList.add("shake");
        fit();
        setMood("sad");
        clearTimeout(moodTimer);
        moodTimer = setTimeout(function () { setMood(""); }, 2200);
    }

    function setBusy(form, on) {
        busy = on;
        form.querySelector(".as-submit").classList.toggle("is-busy", on);
        form.querySelector(".as-submit").disabled = on;
    }

    async function onLogin(e) {
        e.preventDefault();
        var form = e.currentTarget;
        var username = root.querySelector("#asUser").value.trim();
        var password = root.querySelector("#asPass").value;
        if (!username || !password) { fail(form, "Enter your username and password."); return; }
        setBusy(form, true);
        try {
            await Api.auth.login(username, password);
        } catch (err) {
            setBusy(form, false);
            fail(form, BLOCKED[err.message] || "Wrong username or password.");
            return;
        }
        succeed();
    }

    async function onSignup(e) {
        e.preventDefault();
        var form = e.currentTarget;
        var v = function (id) { return root.querySelector(id).value.trim(); };
        var pass = root.querySelector("#asNewPass").value;
        if (!v("#asName") || !v("#asNewUser") || !v("#asEmail") || !pass) { fail(form, "Fill in every field."); return; }
        if (pass.length < 6) { fail(form, "Your password needs at least 6 characters."); return; }
        setBusy(form, true);
        try {
            await Api.auth.register({ name: v("#asName"), username: v("#asNewUser"), email: v("#asEmail"), password: pass });
        } catch (err) {
            setBusy(form, false);
            fail(form, err.message || "Could not create your account.");
            return;
        }
        succeed();
    }

    // The sheet turns into a welcome with a drawn check, then slides away and the page picks up where it was.
    function succeed() {
        signedIn = true;
        setMood("happy");
        var user = null;
        try { user = JSON.parse(localStorage.getItem("ecshop_currentUser")); } catch (e) { /* storage blocked */ }
        var name = user && (user.name || user.username) ? Api.escapeHtml(user.name || user.username) : "";
        var done = root.querySelector("#asDone");
        done.innerHTML = '<span class="anim" data-lottie="order-success" style="--size:120px"><span class="ms ms-fill">check_circle</span></span>' +
            "<h3>" + (mode === "signup" ? "Welcome" : "You're in") + (name ? ", " + name : "") + "</h3><p class=\"muted\">Taking you back…</p>";
        panels.querySelectorAll(".as-panel").forEach(function (p) { p.classList.remove("is-active"); });
        root.querySelector("#asLogin").classList.add("is-left");
        done.classList.add("is-active");
        sheet.classList.add("is-done");
        fit();
        setTimeout(function () {
            close(false);
            setTimeout(function () {
                var next = opts.next || new URLSearchParams(location.search).get("next") || "";
                if (/^[a-z-]+\.html(\?[\w=&.-]*)?$/.test(next)) location.href = next;
                else location.reload();
            }, 450);
        }, 1400);
    }

    return { open: open, close: close };

})();
