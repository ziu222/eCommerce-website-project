// vn-address.js — the Vietnamese part of an address form: country, +84 phone, and province / ward
// boxes that suggest real names (34 provinces, 3,321 wards after the July 2025 reorganisation).
// Typing without accents still finds a match: "sai gon" suggests "Phường Sài Gòn".
// asset/data/vn-divisions.json comes from the v2 API of provinces.open-api.vn (MIT), which follows
// the General Statistics Office of Vietnam.

var VNAddress = (function () {

    var esc = Api.escapeHtml;
    var data = null; // [[province, [ward, ...]], ...]
    var loading = null;

    function load() {
        if (!loading) loading = fetch("../asset/data/vn-divisions.json").then(function (r) { return r.json(); }).then(function (d) { data = d; return d; });
        return loading;
    }

    // lower case, no accents, đ as d
    function fold(s) {
        return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
    }

    // the official spelling of a name typed with or without accents, or null
    function match(name, list) {
        var f = fold(name);
        if (!f) return null;
        var exact = list.filter(function (x) { return fold(x) === f; });
        if (exact.length) return exact[0];
        // "ha noi" is enough for "Thành phố Hà Nội" when nothing else contains it
        var part = list.filter(function (x) { return fold(x).indexOf(f) !== -1; });
        return part.length === 1 ? part[0] : null;
    }

    function wardsOf(province) {
        var name = match(province, (data || []).map(function (x) { return x[0]; }));
        var p = (data || []).filter(function (x) { return x[0] === name; })[0];
        return p ? p[1] : [];
    }

    function options(kind, input) {
        if (!data) return [];
        if (kind === "province") return data.map(function (p) { return p[0]; });
        var form = input.closest("form");
        return wardsOf(form.querySelector('[data-combo="province"]').value.trim());
    }

    // ---------- phone: the box holds the local part, the address stores "+84 912 345 678"

    function phoneOut(local) {
        var d = String(local).replace(/\D/g, "").replace(/^84(?=\d{9,10}$)/, "").replace(/^0/, "");
        // mobile numbers are 9 digits after +84, landlines 10 starting with 2
        if (!/^[35789]\d{8}$/.test(d) && !/^2\d{9}$/.test(d)) return null;
        return "+84 " + d.replace(/^(\d{3})(\d{3})(\d+)$/, "$1 $2 $3");
    }

    function phoneIn(stored) {
        return String(stored || "").replace(/^\+84\s?/, "").replace(/^0/, "");
    }

    // ---------- markup shared by the account page and the cart dialog

    var LABELS = ["Home", "Office"];

    function field(p, key, label, input, wide) {
        return '<div class="field' + (wide ? " field--wide" : "") + '"><label for="' + p + key + '">' + label + "</label>" + input +
            '<p class="field-msg" id="' + p + key + 'Msg" hidden></p></div>';
    }

    function combo(p, key, label, kind, example, auto) {
        var id = p + key;
        return '<div class="field combo"><label for="' + id + '">' + label + "</label>" +
            '<input class="input" id="' + id + '" data-combo="' + kind + '" maxlength="100" autocomplete="' + auto + '" placeholder="' + example + '"' +
            ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + 'List" aria-describedby="' + id + 'Msg">' +
            '<ul class="combo-list" id="' + id + 'List" role="listbox" hidden></ul><p class="field-msg" id="' + id + 'Msg" hidden></p></div>';
    }

    function html(p) {
        var pills = LABELS.concat("Other").map(function (l) {
            return '<label class="pill"><input type="radio" name="' + p + 'LabelPick" value="' + l + '"><span>' + l + "</span></label>";
        }).join("");
        return '<div class="addr-fields">' +
            '<fieldset class="addr-group"><legend><span class="ms">person</span>Who receives it</legend><div class="addr-row">' +
            field(p, "Recipient", "Full name", '<input class="input" id="' + p + 'Recipient" maxlength="100" autocomplete="name" placeholder="e.g. Nguyễn Văn A" aria-describedby="' + p + 'RecipientMsg">') +
            field(p, "Phone", "Phone", '<div class="phone-box"><span class="phone-code" aria-hidden="true">+84</span><input class="input" id="' + p + 'Phone" maxlength="14" autocomplete="tel-national" inputmode="tel" placeholder="e.g. 912 345 678" aria-describedby="' + p + 'PhoneMsg"></div>') +
            "</div></fieldset>" +
            '<fieldset class="addr-group"><legend><span class="ms">location_on</span>Where in Vietnam<span class="legend-note">We deliver within Vietnam only</span></legend><div class="addr-row">' +
            combo(p, "Province", "Province or city", "province", "e.g. Thành phố Hồ Chí Minh", "address-level1") +
            combo(p, "Ward", "Ward or commune", "ward", "e.g. Phường Sài Gòn", "address-level2") +
            field(p, "Line", "House number and street", '<input class="input" id="' + p + 'Line" maxlength="200" autocomplete="address-line1" placeholder="e.g. 12 Nguyễn Huệ" aria-describedby="' + p + 'LineMsg">', true) +
            "</div></fieldset>" +
            '<fieldset class="addr-group"><legend><span class="ms">local_offer</span>Label <span class="legend-note">optional</span></legend>' +
            '<div class="pills" role="radiogroup" aria-label="Address label">' + pills + "</div>" +
            '<input class="input" id="' + p + 'Label" maxlength="40" placeholder="e.g. Grandma\'s house" aria-label="Your own label" hidden>' +
            "</fieldset></div>";
    }

    function setLabel(root, p, label) {
        // "hOME" counts as Home
        var known = LABELS.filter(function (l) { return l.toLowerCase() === String(label || "").trim().toLowerCase(); })[0];
        var pick = known || (label ? "Other" : "");
        root.querySelectorAll('[name="' + p + 'LabelPick"]').forEach(function (r) { r.checked = r.value === pick; });
        var own = root.querySelector("#" + p + "Label");
        own.hidden = pick !== "Other";
        own.value = pick === "Other" ? label : "";
    }

    function clearErrors(root) {
        root.querySelectorAll(".field-msg").forEach(function (m) { m.hidden = true; });
        root.querySelectorAll("[aria-invalid]").forEach(function (i) { i.removeAttribute("aria-invalid"); });
    }

    // a = an existing address to edit, or null for a new one with the account's name filled in
    function fill(root, p, a, name) {
        clearErrors(root);
        root.querySelector("#" + p + "Recipient").value = a ? a.recipient : name || "";
        root.querySelector("#" + p + "Phone").value = a ? phoneIn(a.phone) : "";
        root.querySelector("#" + p + "Province").value = a ? a.city : "";
        root.querySelector("#" + p + "Ward").value = a ? a.ward || "" : "";
        root.querySelector("#" + p + "Line").value = a ? a.line1 : "";
        setLabel(root, p, a ? a.label : "");
        load();
    }

    // Resolves to { recipient, label, phone, city, ward, line1 }, or null after marking the first wrong field.
    async function read(root, p) {
        await load();
        clearErrors(root);
        var v = function (s) { return root.querySelector("#" + p + s).value.trim(); };
        var city = match(v("Province"), data.map(function (x) { return x[0]; }));
        var ward = city && match(v("Ward"), wardsOf(city));
        var problems = [
            ["Recipient", !v("Recipient") && "Enter who receives the order."],
            ["Phone", !v("Phone") ? "Enter a phone number." : !phoneOut(v("Phone")) && "Use a Vietnamese number, for example 912 345 678."],
            ["Province", !city && "Pick a province or city from the list."],
            ["Ward", city && !ward && "Pick a ward or commune of " + city + "."],
            ["Line", !v("Line") && "Enter the house number and street."]
        ].filter(function (x) { return x[1]; });
        problems.forEach(function (x) {
            var msg = root.querySelector("#" + p + x[0] + "Msg");
            msg.textContent = x[1];
            msg.hidden = false;
            root.querySelector("#" + p + x[0]).setAttribute("aria-invalid", "true");
        });
        if (problems.length) { root.querySelector("#" + p + problems[0][0]).focus(); return null; }
        var pick = root.querySelector('[name="' + p + 'LabelPick"]:checked');
        return {
            recipient: v("Recipient"),
            label: pick ? (pick.value === "Other" ? v("Label") : pick.value) : "",
            phone: phoneOut(v("Phone")), city: city, ward: ward, line1: v("Line")
        };
    }

    // "Other" shows the box for a label of your own
    document.addEventListener("change", function (e) {
        var r = e.target;
        if (!r.name || !/LabelPick$/.test(r.name)) return;
        var own = r.closest("form").querySelector("#" + r.name.replace(/Pick$/, ""));
        own.hidden = r.value !== "Other";
        if (!own.hidden) own.focus();
    });

    function line(a) {
        return [a.line1, a.ward, a.city].filter(Boolean).join(", ");
    }

    // ---------- suggestion list, one handler for every combo box on the page

    function listOf(input) { return document.getElementById(input.getAttribute("aria-controls")); }

    function close(input) {
        listOf(input).hidden = true;
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }

    function open(input) {
        var q = fold(input.value);
        var all = options(input.dataset.combo, input);
        var hits = all.filter(function (o) { return fold(o).indexOf(q) !== -1; }).slice(0, 8);
        var list = listOf(input);
        if (!hits.length) {
            list.innerHTML = '<li class="combo-empty">' + (input.dataset.combo === "ward" && !all.length ? "Pick a province first" : "No match") + "</li>";
        } else {
            list.innerHTML = hits.map(function (o, i) {
                return '<li role="option" id="' + input.id + "Opt" + i + '" data-value="' + esc(o) + '">' + esc(o) + "</li>";
            }).join("");
        }
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
    }

    function pick(input, value) {
        if (input.value !== value && input.dataset.combo === "province") input.closest("form").querySelector('[data-combo="ward"]').value = "";
        input.value = value;
        close(input);
        if (input.dataset.combo === "province") input.closest("form").querySelector('[data-combo="ward"]').focus();
    }

    function move(input, step) {
        var opts = Array.prototype.slice.call(listOf(input).querySelectorAll("[role=option]"));
        if (!opts.length) return;
        var at = opts.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
        opts.forEach(function (o) { o.removeAttribute("aria-selected"); });
        var next = opts[(at + step + opts.length) % opts.length];
        next.setAttribute("aria-selected", "true");
        next.scrollIntoView({ block: "nearest" });
        input.setAttribute("aria-activedescendant", next.id);
    }

    document.addEventListener("focusin", function (e) {
        if (e.target.matches && e.target.matches("[data-combo]")) load().then(function () { if (document.activeElement === e.target) open(e.target); });
    });
    document.addEventListener("input", function (e) {
        if (e.target.matches && e.target.matches("[data-combo]")) open(e.target);
    });
    document.addEventListener("focusout", function (e) {
        if (e.target.matches && e.target.matches("[data-combo]")) setTimeout(function () { close(e.target); }, 120);
    });
    document.addEventListener("keydown", function (e) {
        var input = e.target;
        if (!input.matches || !input.matches("[data-combo]")) return;
        var list = listOf(input);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (list.hidden) open(input);
            move(input, e.key === "ArrowDown" ? 1 : -1);
        } else if (e.key === "Enter" && !list.hidden) {
            var sel = list.querySelector('[aria-selected="true"]') || list.querySelector("[role=option]");
            if (sel) { e.preventDefault(); pick(input, sel.dataset.value); }
        } else if (e.key === "Escape" && !list.hidden) {
            e.preventDefault();
            close(input);
        }
    });
    // mousedown keeps focus in the box so focusout does not close the list first
    document.addEventListener("mousedown", function (e) {
        var li = e.target.closest && e.target.closest(".combo-list [role=option]");
        if (!li) return;
        e.preventDefault();
        pick(li.closest(".combo").querySelector("[data-combo]"), li.dataset.value);
    });

    return { html: html, fill: fill, read: read, line: line };

})();
