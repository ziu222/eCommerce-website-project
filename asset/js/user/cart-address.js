// cart-address.js — "Deliver to" in the cart: the customer's default address, a way to pick another
// and a short form to add one. CartAddress.selected() gives the id checkout sends.

var CartAddress = (function () {

    var esc = Api.escapeHtml;
    var box = document.getElementById("deliverTo");
    var list = [];
    var chosen = null;
    var mode = "view"; // view | pick | add

    function line(a) {
        return '<strong>' + esc(a.recipient) + "</strong>" + (a.label ? ' <span class="badge">' + esc(a.label) + "</span>" : "") +
            '<span class="muted">' + esc(a.phone) + "</span><span>" + esc(VNAddress.line(a)) + "</span>";
    }

    function render() {
        if (!box) return;
        var head = '<div class="deliver-head"><span class="label">Deliver to</span>';
        if (mode === "view") {
            if (!chosen) {
                box.innerHTML = head + "</div>" + '<p class="muted">Add an address so the seller knows where to send your order.</p>' +
                    '<button type="button" class="btn btn-ghost btn-sm" data-addr="add"><span class="ms">add</span>Add address</button>';
            } else {
                box.innerHTML = head + (list.length > 1 ? '<button type="button" class="link-btn" data-addr="pick">Change</button>' : '<button type="button" class="link-btn" data-addr="add">Add another</button>') + "</div>" +
                    '<div class="deliver-card"><span class="ms">location_on</span><div>' + line(chosen) + "</div></div>";
            }
        } else if (mode === "pick") {
            box.innerHTML = head + '<button type="button" class="link-btn" data-addr="add">Add new</button></div>' +
                '<div class="deliver-list" role="radiogroup" aria-label="Delivery address">' + list.map(function (a) {
                    return '<label class="deliver-option"><input type="radio" name="deliverAddr" value="' + a.id + '"' + (chosen && chosen.id === a.id ? " checked" : "") + "><div>" + line(a) + "</div></label>";
                }).join("") + "</div>";
        } else {
            box.innerHTML = head + "</div>" +
                '<form class="deliver-form" id="addrForm" novalidate>' +
                '<div class="field"><label for="adRecipient">Full name</label><input class="input" id="adRecipient" maxlength="100" autocomplete="name" placeholder="Nguyễn Văn A" required></div>' +
                VNAddress.html("ad") +
                '<p class="error" id="adError" role="alert" hidden></p>' +
                '<div class="deliver-actions"><button type="submit" class="btn btn-primary btn-sm">Save address</button>' +
                (list.length ? '<button type="button" class="btn btn-ghost btn-sm" data-addr="view">Cancel</button>' : "") + "</div></form>";
            VNAddress.fill(box, "ad", null);
            box.querySelector("#adRecipient").focus();
        }
    }

    async function load() {
        try { list = await Api.account.addresses.list(); } catch (e) { list = []; }
        chosen = list.filter(function (a) { return a.isDefault; })[0] || list[0] || null;
        mode = "view";
        render();
    }

    if (box) {
        box.addEventListener("click", function (e) {
            var b = e.target.closest("[data-addr]");
            if (!b) return;
            mode = b.dataset.addr;
            render();
        });
        box.addEventListener("change", function (e) {
            if (e.target.name !== "deliverAddr") return;
            chosen = list.filter(function (a) { return a.id === Number(e.target.value); })[0];
            mode = "view";
            render();
        });
        box.addEventListener("submit", async function (e) {
            e.preventDefault();
            var err = box.querySelector("#adError");
            err.hidden = true;
            var name = box.querySelector("#adRecipient").value.trim();
            var place = await VNAddress.read(box, "ad");
            if (!name) place = { error: "Enter the full name of who receives the order." };
            if (place.error) { err.textContent = place.error; err.hidden = false; return; }
            try {
                var added = await Api.account.addresses.add({ recipient: name, phone: place.phone, ward: place.ward, line1: place.line1, city: place.city });
                list.push(added);
                chosen = added;
                mode = "view";
                render();
            } catch (ex) {
                err.textContent = ex.message;
                err.hidden = false;
            }
        });
    }

    return {
        load: load,
        selected: function () { return chosen ? chosen.id : null; },
        // asks for an address when there is none yet
        require: function () {
            if (chosen) return true;
            mode = "add";
            render();
            box.scrollIntoView({ behavior: "smooth", block: "center" });
            return false;
        }
    };

})();
