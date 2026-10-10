// contact.js — the contact form opens a real conversation with the support staff (customers only).

(function () {

    var form = document.getElementById("contactForm");
    var msg = document.getElementById("contactMsg");
    var err = document.getElementById("contactError");
    var send = document.getElementById("contactSend");

    function isCustomer() {
        var u = getCurrentUser();
        return !!u && u.role === "customer";
    }

    function fail(text) {
        err.textContent = text;
        err.hidden = false;
    }

    document.getElementById("signinNote").hidden = isCustomer();

    Api.support.availability().then(function (a) {
        document.getElementById("contactAvail").textContent = a.online
            ? "Our staff are online now and usually reply within minutes."
            : "Our staff are away right now. Leave your message and they will reply here as soon as they can.";
    }).catch(function () { /* the note is optional */ });

    msg.addEventListener("input", function () { err.hidden = true; });

    form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var text = msg.value.trim();
        if (!text) { fail("Please write a message."); msg.focus(); return; }
        if (!isCustomer()) { document.getElementById("signinNote").hidden = false; return; }

        var subject = form.querySelector("input[name=subject]:checked").value;
        send.disabled = true;
        try {
            await Api.support.create(subject + ": " + text, []);
            msg.value = "";
            UI.toast("Sent. Our staff will reply in your chat.");
        } catch (ex) {
            fail(ex.message || "Could not send your message. Please try again.");
        } finally {
            send.disabled = false;
        }
    });

})();
