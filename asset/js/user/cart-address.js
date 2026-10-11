// cart-address.js — "Deliver to" in the cart: the chosen address as a card, and a dialog to pick
// another or add a new one. CartAddress.selected() gives the id checkout sends.

var CartAddress = (function () {

    var esc = Api.escapeHtml;
    var box = document.getElementById("deliverTo");
    var list = [];
    var chosen = null;
    var dialog = null;

    function line(a) {
        return '<strong>' + esc(a.recipient) + "</strong>" + (a.label ? ' <span class="badge">' + esc(a.label) + "</span>" : "") +
            '<span class="muted">' + esc(a.phone) + "</span><span>" + esc(VNAddress.line(a)) + "</span>";
    }

    function render() {
        if (!box) return;
        var head = '<div class="deliver-head"><span class="label">Deliver to</span>';
        if (!chosen) {
            box.innerHTML = head + "</div>" +
                '<button type="button" class="deliver-empty" data-addr="add"><span class="ms">add</span><span><strong>Add a delivery address</strong><span class="muted">So the seller knows where to send it</span></span></button>';
        } else {
            box.innerHTML = head + '<button type="button" class="link-btn" data-addr="' + (list.length > 1 ? "pick" : "add") + '">' + (list.length > 1 ? "Change" : "Add another") + "</button></div>" +
                '<div class="deliver-card"><span class="ms">location_on</span><div>' + line(chosen) + "</div></div>";
        }
        var recap = document.getElementById("deliverRecap");
        if (recap && chosen) recap.innerHTML = "<strong>" + esc(chosen.recipient) + '</strong><span class="muted" title="' + esc(VNAddress.line(chosen)) + '">' + esc(VNAddress.line(chosen)) + "</span>";
    }

    // ---------- the dialog: a list to pick from, or the form

    function build() {
        dialog = document.createElement("dialog");
        dialog.className = "addr-dialog";
        dialog.setAttribute("aria-labelledby", "adTitle");
        dialog.innerHTML = '<form class="addr-dialog-form" id="adForm" novalidate>' +
            '<header class="addr-dialog-head"><h2 id="adTitle">Delivery address</h2>' +
            '<button type="button" class="icon-btn" data-addr="close" aria-label="Close"><span class="ms">close</span></button></header>' +
            '<div class="addr-dialog-body" id="adBody"></div>' +
            '<footer class="addr-dialog-foot" id="adFoot"></footer></form>';
        document.body.appendChild(dialog);
        dialog.addEventListener("click", onClick);
        dialog.addEventListener("submit", onSubmit);
        // a click on the dim area outside the box closes it
        dialog.addEventListener("mousedown", function (e) { if (e.target === dialog) dialog.close(); });
    }

    function open(mode) {
        if (!dialog) build();
        var body = dialog.querySelector("#adBody");
        var foot = dialog.querySelector("#adFoot");
        dialog.dataset.mode = mode;
        if (mode === "pick") {
            dialog.querySelector("#adTitle").textContent = "Choose an address";
            body.innerHTML = '<div class="deliver-list" role="radiogroup" aria-label="Your addresses">' + list.map(function (a) {
                return '<label class="deliver-option"><input type="radio" name="deliverAddr" value="' + a.id + '"' + (chosen && chosen.id === a.id ? " checked" : "") + "><div>" + line(a) + "</div></label>";
            }).join("") + "</div>" +
                (list.length < 10 ? '<button type="button" class="deliver-empty" data-addr="add"><span class="ms">add</span><span><strong>Add a new address</strong></span></button>' : "");
            foot.innerHTML = '<button type="button" class="btn btn-ghost" data-addr="close">Cancel</button><button type="submit" class="btn btn-primary">Deliver here</button>';
        } else {
            dialog.querySelector("#adTitle").textContent = "New address";
            body.innerHTML = VNAddress.html("ad") + '<p class="error" id="adError" role="alert" hidden></p>';
            var me = getCurrentUser();
            VNAddress.fill(dialog, "ad", null, me && me.name);
            foot.innerHTML = '<button type="button" class="btn btn-ghost" data-addr="' + (list.length > 1 ? "pick" : "close") + '">' + (list.length > 1 ? "Back" : "Cancel") + "</button>" +
                '<button type="submit" class="btn btn-primary">Save and use</button>';
        }
        if (!dialog.open) dialog.showModal();
        var first = dialog.querySelector(mode === "pick" ? "input:checked, input" : "#adRecipient");
        if (first) first.focus();
    }

    function onClick(e) {
        var b = e.target.closest("[data-addr]");
        if (!b) return;
        if (b.dataset.addr === "close") dialog.close(); else open(b.dataset.addr);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (dialog.dataset.mode === "pick") {
            var r = dialog.querySelector('[name="deliverAddr"]:checked');
            if (r) chosen = list.filter(function (a) { return a.id === Number(r.value); })[0];
            dialog.close();
            render();
            return;
        }
        var err = dialog.querySelector("#adError");
        err.hidden = true;
        var data = await VNAddress.read(dialog, "ad");
        if (!data) return;
        var btn = dialog.querySelector('[type="submit"]');
        btn.disabled = true;
        try {
            var added = await Api.account.addresses.add(data);
            list.push(added);
            chosen = added;
            dialog.close();
            render();
            UI.toast("Address saved");
        } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
        } finally {
            btn.disabled = false;
        }
    }

    async function load() {
        try { list = await Api.account.addresses.list(); } catch (e) { list = []; }
        chosen = list.filter(function (a) { return a.isDefault; })[0] || list[0] || null;
        render();
    }

    if (box) {
        box.addEventListener("click", function (e) {
            var b = e.target.closest("[data-addr]");
            if (b) open(b.dataset.addr);
        });
    }

    return {
        load: load,
        selected: function () { return chosen ? chosen.id : null; },
        // asks for an address when there is none yet
        require: function () {
            if (chosen) return true;
            open("add");
            return false;
        }
    };

})();
