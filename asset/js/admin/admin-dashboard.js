// ============================================================
// admin-dashboard.js — Dashboard Stats & Rendering

(function () {

    var financeState = {
        timeRange: "week",
        shopFilter: "all",
        dateFrom: null,
        dateTo: null,
        page: 1,
        pageSize: 10,
        shopsLoaded: false,
        _cachedOrders: []
    };

    var dash = null; // overview + reports numbers from /api/admin/dashboard

    var revenueChartInstance = null;
    var trendChartInstance = null;


    function formatCurrency(amount) {
        return "$" + amount.toLocaleString("en-US");
    }

    function formatDate(dateStr) {
        var d = new Date(dateStr);
        var day = String(d.getDate()).padStart(2, "0");
        var month = String(d.getMonth() + 1).padStart(2, "0");
        var year = d.getFullYear();
        return day + "/" + month + "/" + year;
    }

    function getTodayKey() {
        var now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    }

    function getDateRange(range) {
        var now = new Date();
        var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (range === "today") {
            return { dateFrom: today.toISOString(), dateTo: now.toISOString() };
        }

        if (range === "week") {
            var weekAgo = new Date(today);
            weekAgo.setDate(today.getDate() - 7);
            return { dateFrom: weekAgo.toISOString(), dateTo: now.toISOString() };
        }

        if (range === "month") {
            var monthAgo = new Date(today);
            monthAgo.setMonth(today.getMonth() - 1);
            return { dateFrom: monthAgo.toISOString(), dateTo: now.toISOString() };
        }

        if (range === "year") {
            var yearAgo = new Date(today);
            yearAgo.setFullYear(today.getFullYear() - 1);
            return { dateFrom: yearAgo.toISOString(), dateTo: now.toISOString() };
        }

        return { dateFrom: null, dateTo: null };
    }

    function syncFinanceDateRange() {
        var range = getDateRange(financeState.timeRange);
        financeState.dateFrom = range.dateFrom;
        financeState.dateTo = range.dateTo;
    }

    function getFinanceFilters() {
        return {
            shopId: financeState.shopFilter,
            dateFrom: financeState.dateFrom,
            dateTo: financeState.dateTo
        };
    }


    function renderStatCards() {
        document.getElementById("statShops").textContent = dash.shops;
        document.getElementById("statProducts").textContent = dash.products;
        document.getElementById("statOrders").textContent = dash.orders;
        document.getElementById("statRevenue").textContent = formatCurrency(dash.revenue);
        document.getElementById("statCustomers").textContent = dash.customers;
        document.getElementById("statPending").textContent = dash.statusCounts.pending;
    }


    //Order status stats

    function renderOrderStatus() {
        var counts = dash.statusCounts;
        var total  = dash.orders;
        var container = document.getElementById("orderStatusList");
        var statuses = ["pending", "confirmed", "shipped", "delivered", "cancelled"];
        var html = "";

        for (var i = 0; i < statuses.length; i++) {
            var s = statuses[i];
            var count = counts[s] || 0;
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;

            html += '<div class="status-item">'
                  +   '<span class="status-dot ' + s + '"></span>'
                  +   '<span class="status-label">' + s + '</span>'
                  +   '<div class="status-bar-track">'
                  +     '<div class="status-bar-fill ' + s + '" style="width:' + pct + '%"></div>'
                  +   '</div>'
                  +   '<span class="status-count">' + count + '</span>'
                  + '</div>';
        }

        container.innerHTML = html;
    }


    // top products

    function renderTopProducts() {
        var topItems = dash.topProducts;
        var container = document.getElementById("topProductsList");
        var html = "";

        if (topItems.length === 0) {
            container.innerHTML = '<p style="color:#999;font-size:14px;">No sales data yet.</p>';
            return;
        }

        for (var i = 0; i < topItems.length; i++) {
            var item = topItems[i];
            var rankClass = i === 0 ? "gold" : (i === 1 ? "silver" : (i === 2 ? "bronze" : ""));

            html += '<div class="top-product-item">'
                  +   '<span class="top-product-rank ' + rankClass + '">' + (i + 1) + '</span>'
                  +   '<div class="top-product-info">'
                  +     '<div class="top-product-name">' + escapeHtml(item.product.name) + '</div>'
                  +     '<div class="top-product-category">' + escapeHtml(item.product.category) + '</div>'
                  +   '</div>'
                  +   '<span class="top-product-sold">' + item.sold + ' sold</span>'
                  + '</div>';
        }

        container.innerHTML = html;
    }


    //Product category stats

    function renderCategoryBreakdown() {
        var counts = dash.categoryCounts;
        var container = document.getElementById("categoryList");
        var total = dash.products;

        var categoryIcons = {
            smartphone: "fa-mobile-screen",
            wearables:  "fa-clock",
            laptops:    "fa-laptop",
            audio:      "fa-headphones",
            cameras:    "fa-camera",
            laptop:     "fa-laptop",
            tablet:     "fa-tablet-screen-button",
            headphone:  "fa-headphones",
            watch:      "fa-clock",
            camera:     "fa-camera",
            speaker:    "fa-volume-high",
            gaming:     "fa-gamepad",
            accessory:  "fa-plug"
        };

        var keys = Object.keys(counts);
        var html = "";

        for (var i = 0; i < keys.length; i++) {
            var cat = keys[i];
            var count = counts[cat];
            var pct = total > 0 ? Math.round((count / total) * 100) : 0;
            var icon = categoryIcons[cat] || "fa-box";

            html += '<div class="category-item">'
                  +   '<div class="category-icon"><i class="fa-solid ' + icon + '"></i></div>'
                  +   '<span class="category-name">' + escapeHtml(cat) + '</span>'
                  +   '<div class="category-bar-track">'
                  +     '<div class="category-bar-fill" style="width:' + pct + '%"></div>'
                  +   '</div>'
                  +   '<span class="category-count">' + count + '</span>'
                  + '</div>';
        }

        container.innerHTML = html;
    }


    // Order table 

    function renderRecentOrders() {
        var tbody  = document.getElementById("recentOrdersBody");
        var recent = dash.recentOrders;

        var html = "";

        for (var i = 0; i < recent.length; i++) {
            var o = recent[i];
            var customerName = o.customer ? escapeHtml(o.customer.name) : "Unknown";
            var shopName = o.shop ? escapeHtml(o.shop.shopName || "Unknown") : "Unknown";

            html += '<tr>'
                  +   '<td><span class="order-id">#' + o.id + '</span></td>'
                  +   '<td>' + customerName + '</td>'
                  +   '<td>' + shopName + '</td>'
                  +   '<td>' + formatCurrency(o.total) + '</td>'
                  +   '<td><span class="badge badge-' + o.status + '">' + o.status + '</span></td>'
                  +   '<td>' + formatDate(o.createdAt) + '</td>'
                  + '</tr>';
        }

        tbody.innerHTML = html;
    }

    function renderFinanceStats(summary) {
        document.getElementById("financeTotalRevenue").textContent = formatCurrency(summary.totalRevenue);
        document.getElementById("financePaidOrders").textContent = summary.paidOrders;
        document.getElementById("financeAvgOrder").textContent = formatCurrency(summary.avgOrderValue);
        document.getElementById("financeActiveShops").textContent = summary.activeShops;
    }

    function groupOrdersByPeriod(orders, range) {
        var totals = {};

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            var date = new Date(order.createdAt);
            var key;

            if (range === "year" || range === "all") {
                key = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
            } else {
                key = date.toISOString().slice(0, 10);
            }

            totals[key] = (totals[key] || 0) + (Number(order.total) || 0);
        }

        var labels = Object.keys(totals).sort();
        return {
            labels: labels,
            values: labels.map(function (label) {
                return totals[label];
            })
        };
    }

    function renderTrendChart(orders, timeRange) {
        var canvas = document.getElementById("revenueTrendChart");
        if (!canvas || typeof Chart === "undefined") return;

        if (trendChartInstance) {
            trendChartInstance.destroy();
        }

        var grouped = groupOrdersByPeriod(orders, timeRange);

        trendChartInstance = new Chart(canvas.getContext("2d"), {
            type: "line",
            data: {
                labels: grouped.labels,
                datasets: [{
                    label: "Revenue",
                    data: grouped.values,
                    borderColor: "rgba(0, 76, 76, 1)",
                    backgroundColor: "rgba(0, 76, 76, 0.1)",
                    tension: 0.35,
                    fill: true,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: {
                            callback: function (value) {
                                return "$" + Number(value).toLocaleString("en-US");
                            }
                        }
                    }
                }
            }
        });
    }

    function renderRevenueChart(data) {
        var canvas = document.getElementById("revenueByShopChart");
        if (!canvas || typeof Chart === "undefined") return;

        if (revenueChartInstance) {
            revenueChartInstance.destroy();
        }

        revenueChartInstance = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels: data.map(function (item) { return item.shopName; }),
                datasets: [{
                    data: data.map(function (item) { return item.revenue; }),
                    backgroundColor: "rgba(0, 76, 76, 0.75)",
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: "y",
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: {
                            callback: function (value) {
                                return "$" + Number(value).toLocaleString("en-US");
                            }
                        }
                    }
                }
            }
        });
    }

    function renderRevenueByShop(rows) {
        var tbody = document.getElementById("financeRevenueBody");

        if (!tbody) return;

        if (rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No delivered revenue found for the selected filters.</td></tr>';
            renderRevenueChart([]);
            return;
        }

        var html = "";
        for (var i = 0; i < rows.length; i++) {
            html += "<tr>"
                + '<td>' + escapeHtml(rows[i].shopName || "Unknown") + '</td>'
                + '<td>' + rows[i].orderCount + '</td>'
                + '<td>' + formatCurrency(rows[i].revenue) + '</td>'
                + '<td>' + rows[i].percentage.toFixed(1) + '%</td>'
                + "</tr>";
        }

        tbody.innerHTML = html;
        renderRevenueChart(rows);
    }

    function renderTransactions(orders, filters) {
        var tbody = document.getElementById("financeTransactionsBody");
        var info = document.getElementById("financePaginationInfo");
        var pageLabel = document.getElementById("financePaginationPage");
        var prevBtn = document.getElementById("financePrevPage");
        var nextBtn = document.getElementById("financeNextPage");
        var totalPages = Math.max(1, Math.ceil(orders.length / financeState.pageSize));

        if (financeState.page > totalPages) {
            financeState.page = totalPages;
        }

        var start = (financeState.page - 1) * financeState.pageSize;
        var pageOrders = orders.slice(start, start + financeState.pageSize);

        if (pageOrders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No transactions found for the selected filters.</td></tr>';
        } else {
            var html = "";
            for (var i = 0; i < pageOrders.length; i++) {
                var order = pageOrders[i];
                html += "<tr>"
                    + '<td><span class="order-id">#' + order.id + '</span></td>'
                    + '<td>' + escapeHtml(order.customer ? order.customer.name : "Unknown") + '</td>'
                    + '<td>' + escapeHtml(order.shop ? (order.shop.shopName || "Unknown") : "Unknown") + '</td>'
                    + '<td>' + (order.itemCount || 0) + '</td>'
                    + '<td>' + formatCurrency(Number(order.total) || 0) + '</td>'
                    + '<td>' + formatDate(order.createdAt) + '</td>'
                    + "</tr>";
            }
            tbody.innerHTML = html;
        }

        if (orders.length === 0) {
            info.textContent = "Showing 0-0 of 0";
        } else {
            info.textContent = "Showing " + (start + 1) + "-" + (start + pageOrders.length) + " of " + orders.length;
        }

        pageLabel.textContent = "Page " + financeState.page + " / " + totalPages;
        prevBtn.disabled = financeState.page <= 1;
        nextBtn.disabled = financeState.page >= totalPages;
    }

    function exportFinanceCsv(orders) {
        var header = ["Order ID", "Customer", "Shop", "Items", "Total", "Status", "Date"];
        var rows = [];

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            rows.push([
                "#" + order.id,
                order.customer ? order.customer.name : "Unknown",
                order.shop ? (order.shop.shopName || "Unknown") : "Unknown",
                order.itemCount || 0,
                "$" + (Number(order.total) || 0),
                order.status,
                order.createdAt ? order.createdAt.split("T")[0] : ""
            ]);
        }

        var allRows = [header].concat(rows);
        var csvLines = [];

        for (var j = 0; j < allRows.length; j++) {
            var cells = [];
            for (var k = 0; k < allRows[j].length; k++) {
                cells.push('"' + String(allRows[j][k]).replace(/"/g, '""') + '"');
            }
            csvLines.push(cells.join(","));
        }

        var blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "transactions-" + new Date().toISOString().split("T")[0] + ".csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    async function populateFinanceShopFilter() {
        var select = document.getElementById("financeShopFilter");
        var revenueRows = [];
        try {
            revenueRows = (await Api.adminStats.finance({ shopId: "all" })).revenueByShop;
        } catch (e) {
            revenueRows = [];
        }
        var options = ['<option value="all">All Shops</option>'];

        for (var i = 0; i < revenueRows.length; i++) {
            options.push('<option value="' + revenueRows[i].shopId + '">' + escapeHtml(revenueRows[i].shopName) + '</option>');
        }

        select.innerHTML = options.join("");
        select.value = financeState.shopFilter;
        financeState.shopsLoaded = true;
    }

    async function refreshFinance() {
        var filters = getFinanceFilters();
        var finance;
        try {
            finance = await Api.adminStats.finance(filters);
        } catch (e) {
            alert("Could not load finance data: " + e.message);
            return;
        }
        var orders = finance.transactions;
        financeState._cachedOrders = orders;
        renderFinanceStats(finance.summary);
        renderRevenueByShop(finance.revenueByShop);
        renderTrendChart(orders, financeState.timeRange);
        renderTransactions(orders, filters);
    }

    function bindFinanceEvents() {
        var timeRange = document.getElementById("financeTimeRange");
        var shopFilter = document.getElementById("financeShopFilter");
        var exportBtn = document.getElementById("btnExportFinanceCsv");
        var prevBtn = document.getElementById("financePrevPage");
        var nextBtn = document.getElementById("financeNextPage");

        syncFinanceDateRange();
        timeRange.value = financeState.timeRange;

        timeRange.addEventListener("change", function () {
            financeState.timeRange = this.value;
            financeState.page = 1;
            syncFinanceDateRange();
            refreshFinance();
        });

        shopFilter.addEventListener("change", function () {
            financeState.shopFilter = this.value;
            financeState.page = 1;
            refreshFinance();
        });

        exportBtn.addEventListener("click", function () {
            exportFinanceCsv(financeState._cachedOrders || []);
        });

        prevBtn.addEventListener("click", function () {
            if (financeState.page <= 1) return;
            financeState.page -= 1;
            renderTransactions(financeState._cachedOrders, getFinanceFilters());
        });

        nextBtn.addEventListener("click", function () {
            var totalPages = Math.max(1, Math.ceil(
                (financeState._cachedOrders || []).length / financeState.pageSize
            ));
            if (financeState.page >= totalPages) return;
            financeState.page += 1;
            renderTransactions(financeState._cachedOrders, getFinanceFilters());
        });
    }

    function renderReportsTab() {
        var statusCounts = dash.statusCounts;
        var summaryBody = document.getElementById("reportSummaryBody");

        var metrics = [
            { label: "Total Customers", value: dash.customers },
            { label: "Total Shops", value: dash.shops },
            { label: "Total Products", value: dash.products },
            { label: "Total Orders", value: dash.orders },
            { label: "Pending Orders", value: statusCounts.pending || 0 },
            { label: "Delivered Orders", value: statusCounts.delivered || 0 },
            { label: "Cancelled Orders", value: statusCounts.cancelled || 0 },
            { label: "Total Revenue", value: formatCurrency(dash.revenue) }
        ];

        var html = "";
        for (var i = 0; i < metrics.length; i++) {
            html += "<tr>"
                + '<td>' + escapeHtml(String(metrics[i].label)) + '</td>'
                + '<td>' + escapeHtml(String(metrics[i].value)) + '</td>'
                + "</tr>";
        }
        summaryBody.innerHTML = html;
    }

    async function exportOrdersCsv() {
        var orders;
        try {
            orders = await Api.orders.adminList();
        } catch (e) {
            alert("Could not export orders: " + e.message);
            return;
        }
        var rows = [["Order ID", "Customer", "Shop", "Total", "Status", "Created At"]];

        for (var i = 0; i < orders.length; i++) {
            var order = orders[i];
            rows.push([
                order.id,
                order.customer ? order.customer.name : "Unknown",
                order.shop ? order.shop.shopName : "Unknown",
                order.total,
                order.status,
                formatDate(order.createdAt)
            ]);
        }

        var csvContent = "";
        for (var j = 0; j < rows.length; j++) {
            var csvRow = [];
            for (var k = 0; k < rows[j].length; k++) {
                var cell = String(rows[j][k]).replace(/"/g, '""');
                csvRow.push('"' + cell + '"');
            }
            csvContent += csvRow.join(",") + "\n";
        }

        var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        var link = document.createElement("a");
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "orders-report.csv");
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function bindReportActions() {
        var exportBtn = document.getElementById("btnExportCsv");
        var printBtn = document.getElementById("btnPrintReport");

        if (exportBtn) {
            exportBtn.addEventListener("click", exportOrdersCsv);
        }

        if (printBtn) {
            printBtn.addEventListener("click", function () {
                window.print();
            });
        }
    }

    function bindDashboardTabs() {
        var buttons = document.querySelectorAll(".dashboard-tab-btn");
        var panels = {
            overview: document.getElementById("tabOverview"),
            finance: document.getElementById("tabFinance"),
            reports: document.getElementById("tabReports")
        };

        function activateTab(tab) {
            for (var key in panels) {
                if (Object.prototype.hasOwnProperty.call(panels, key)) {
                    var panel = panels[key];
                    if (!panel) continue;
                    panel.classList.toggle("active", key === tab);
                }
            }

            for (var i = 0; i < buttons.length; i++) {
                var button = buttons[i];
                button.classList.toggle("active", button.getAttribute("data-tab") === tab);
            }

            if (tab === "finance") {
                if (!financeState.shopsLoaded) {
                    populateFinanceShopFilter();
                }
                refreshFinance();
            }

            if (tab === "reports") {
                renderReportsTab();
            }
        }

        for (var i = 0; i < buttons.length; i++) {
            buttons[i].addEventListener("click", function () {
                activateTab(this.getAttribute("data-tab"));
            });
        }

        activateTab("overview");
    }


    //Nav bar user info

    function renderTopbarUser() {
        var user = Auth.getCurrentUser();
        if (!user) return;

        var nameEl = document.getElementById("topbarUserName");
        var avatarEl = document.getElementById("topbarAvatar");

        nameEl.textContent = user.name;
        avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }

    function escapeHtml(str) {
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }


    // khoi tao

    async function init() {
        renderTopbarUser();
        try {
            dash = await Api.adminStats.dashboard();
        } catch (e) {
            alert("Could not load the dashboard: " + e.message);
            return;
        }
        renderStatCards();
        renderOrderStatus();
        renderTopProducts();
        renderCategoryBreakdown();
        renderRecentOrders();
        renderReportsTab();
        bindDashboardTabs();
        bindFinanceEvents();
        bindReportActions();
    }

    init();

})();
