// wallet.js — EC SHOP Wallet page: balance, history and the demo top-up flow (amount, method, confirm).

(function () {

    var esc = Api.escapeHtml;
    var selectedAmount  = 0;
    var selectedGateway = "";

    function fmt(n) {
        return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function fmtDate(iso) {
        return new Date(iso).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    function showStep(n) {
        document.querySelectorAll(".deposit-step").forEach(function (el) { el.classList.remove("active"); });
        document.getElementById("step" + n).classList.add("active");
    }

    // ── Render ────────────────────────────────────────────────

    var snapshot = { balance: 0, transactions: [] };

    async function refresh() {
        try {
            snapshot = await Api.wallet.get();
        } catch (e) {
            if (e.status === 401 || e.status === 403) { window.location.href = "login.html"; return; }
            UI.toast(e.message, "error");
        }
        document.getElementById("walletBalance").textContent = fmt(snapshot.balance);
        renderHistory();
    }

    var TX_ICON = { deposit: "arrow_downward", refund: "undo" };

    function renderHistory() {
        var list = document.getElementById("txList");
        var txs = snapshot.transactions;
        if (!txs || !txs.length) {
            list.innerHTML = '<div class="empty"><span class="ms">receipt_long</span>No transactions yet</div>';
            return;
        }
        list.innerHTML = txs.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); }).map(function (tx) {
            var credit = tx.type === "deposit" || tx.type === "refund";
            var tone = tx.type === "refund" ? "refund" : credit ? "credit" : "debit";
            return '<div class="tx-item">' +
                '<span class="tx-icon ' + tone + '"><span class="ms">' + (TX_ICON[tx.type] || "arrow_upward") + "</span></span>" +
                '<div><div class="tx-desc">' + esc(tx.description) + '</div><div class="tx-date">' + esc(fmtDate(tx.date)) + "</div></div>" +
                '<div class="tx-amount ' + (credit ? "credit" : "") + '">' + (credit ? "+" : "−") + fmt(tx.amount) + "</div></div>";
        }).join("");
    }

    // ── Amount ────────────────────────────────────────────────

    function setupPresets() {
        var presets = document.querySelectorAll(".preset-btn");
        var input = document.getElementById("topupAmount");
        var error = document.getElementById("topupError");

        function markPreset() {
            presets.forEach(function (b) { b.classList.toggle("active", Number(b.dataset.amount) === selectedAmount); });
        }
        function clearError() { input.classList.remove("error"); error.hidden = true; }

        presets.forEach(function (btn) {
            btn.addEventListener("click", function () {
                selectedAmount = Number(btn.dataset.amount);
                input.value = selectedAmount;
                markPreset();
                clearError();
            });
        });
        input.addEventListener("input", function () {
            selectedAmount = Number(input.value) || 0;
            markPreset();
            clearError();
        });
    }

    // ── Steps ─────────────────────────────────────────────────

    function setupNavigation() {
        document.getElementById("btnNext").addEventListener("click", function () {
            var input = document.getElementById("topupAmount");
            selectedAmount = Number(input.value);
            if (!selectedAmount || selectedAmount <= 0) {
                input.classList.add("error");
                document.getElementById("topupError").hidden = false;
                input.focus();
                return;
            }
            document.getElementById("displayAmount").textContent = fmt(selectedAmount);
            showStep(2);
        });

        document.querySelectorAll(".gateway-card").forEach(function (card) {
            card.addEventListener("click", function () {
                selectedGateway = card.dataset.gw;
                document.getElementById("qrGwHeader").textContent = card.dataset.label || card.dataset.gw;
                document.getElementById("qrAmount").textContent = fmt(selectedAmount);
                showStep(3);
            });
        });

        document.getElementById("back1").addEventListener("click", function () { showStep(1); });
        document.getElementById("btnCancelPay").addEventListener("click", resetDeposit);
    }

    function setupConfirm() {
        var btn = document.getElementById("btnConfirm");
        btn.addEventListener("click", async function () {
            if (!getCurrentUser()) return;
            btn.disabled = true;
            try {
                await Api.wallet.topUp(selectedAmount, selectedGateway);
            } catch (e) {
                UI.toast(e.message, "error");
                btn.disabled = false;
                return;
            }
            var added = selectedAmount;
            await refresh();
            resetDeposit();
            btn.disabled = false;
            UI.toast(fmt(added) + " added to your wallet");
        });
    }

    function resetDeposit() {
        selectedAmount = 0;
        selectedGateway = "";
        var input = document.getElementById("topupAmount");
        input.value = "";
        input.classList.remove("error");
        document.getElementById("topupError").hidden = true;
        document.querySelectorAll(".preset-btn").forEach(function (b) { b.classList.remove("active"); });
        showStep(1);
    }

    document.addEventListener("DOMContentLoaded", function () {
        if (!getCurrentUser()) {
            window.location.href = "login.html";
            return;
        }
        refresh();
        setupPresets();
        setupNavigation();
        setupConfirm();
    });

})();
