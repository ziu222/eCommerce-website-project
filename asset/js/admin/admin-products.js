Store.seed();
Auth.requirePermission("products.view");

var ProductAdminPage = (function () {
    var state = {
        products: [],
        stats: null,
        filteredProducts: [],
        selectedProductId: null,
        activeTab: "queue",
        statusFilter: "all",
        categoryFilter: "all",
        shopFilter: "all",
        searchQuery: "",
        minPrice: "",
        maxPrice: "",
        page: 1,
        pageSize: 5
    };

    var reasonPromptContext = null;

    var els = {};

    function init() {
        cacheDom();
        if (!els.productsTableBody) return;
        bindEvents();
        hydrateCurrentUser();
        refresh();
    }

    function cacheDom() {
        els.topbarAvatar = document.getElementById("topbarAvatar");
        els.topbarUserName = document.getElementById("topbarUserName");
        els.statTotalProducts = document.getElementById("statTotalProducts");
        els.statPendingProducts = document.getElementById("statPendingProducts");
        els.statApprovedProducts = document.getElementById("statApprovedProducts");
        els.statSuspendedProducts = document.getElementById("statSuspendedProducts");
        els.statRejectedProducts = document.getElementById("statRejectedProducts");
        els.tabSwitchers = document.querySelectorAll(".tab-switch");
        els.queueBadge = document.getElementById("queueBadge");
        els.filterTabs = document.querySelectorAll(".filter-tab");
        els.categoryFilter = document.getElementById("categoryFilter");
        els.shopFilter = document.getElementById("shopFilter");
        els.minPriceInput = document.getElementById("minPriceInput");
        els.maxPriceInput = document.getElementById("maxPriceInput");
        els.productSearchInput = document.getElementById("productSearchInput");
        els.resetFiltersBtn = document.getElementById("resetFiltersBtn");
        els.productsTableBody = document.getElementById("productsTableBody");
        els.emptyState = document.getElementById("emptyState");
        els.paginationInfo = document.getElementById("paginationInfo");
        els.paginationPageLabel = document.getElementById("paginationPageLabel");
        els.prevPageBtn = document.getElementById("prevPageBtn");
        els.nextPageBtn = document.getElementById("nextPageBtn");
        els.previewSubtext = document.getElementById("previewSubtext");
        els.previewStatusBadge = document.getElementById("previewStatusBadge");
        els.previewHeroThumb = document.getElementById("previewHeroThumb");
        els.previewProductName = document.getElementById("previewProductName");
        els.previewProductMeta = document.getElementById("previewProductMeta");
        els.previewPrice = document.getElementById("previewPrice");
        els.previewStock = document.getElementById("previewStock");
        els.previewCategory = document.getElementById("previewCategory");
        els.previewUpdated = document.getElementById("previewUpdated");
        els.previewDescription = document.getElementById("previewDescription");
        els.previewViewBtn = document.getElementById("previewViewBtn");
        els.previewRejectBtn = document.getElementById("previewRejectBtn");
        els.previewApproveBtn = document.getElementById("previewApproveBtn");
        els.productModal = document.getElementById("productModal");
        els.productModalTitle = document.getElementById("productModalTitle");
        els.productModalBody = document.getElementById("productModalBody");
        els.productModalFooter = document.getElementById("productModalFooter");
        els.statusNoticeModal = document.getElementById("statusNoticeModal");
        els.statusNoticePanel = document.getElementById("statusNoticePanel");
        els.statusNoticeIcon = document.getElementById("statusNoticeIcon");
        els.statusNoticeTitle = document.getElementById("statusNoticeTitle");
        els.statusNoticeMessage = document.getElementById("statusNoticeMessage");
        els.statusNoticeNote = document.getElementById("statusNoticeNote");
        els.statusNoticeCloseBtn = document.getElementById("statusNoticeCloseBtn");
        els.reasonPromptModal = document.getElementById("reasonPromptModal");
        els.reasonPromptTitle = document.getElementById("reasonPromptTitle");
        els.reasonPromptDescription = document.getElementById("reasonPromptDescription");
        els.reasonPromptLabel = document.getElementById("reasonPromptLabel");
        els.reasonPromptInput = document.getElementById("reasonPromptInput");
        els.reasonPromptError = document.getElementById("reasonPromptError");
        els.reasonPromptCloseBtn = document.getElementById("reasonPromptCloseBtn");
        els.reasonPromptCancelBtn = document.getElementById("reasonPromptCancelBtn");
        els.reasonPromptConfirmBtn = document.getElementById("reasonPromptConfirmBtn");
    }

    function bindEvents() {
        for (var i = 0; i < els.tabSwitchers.length; i++) {
            els.tabSwitchers[i].addEventListener("click", onTabSwitch);
        }
        
        for (var i = 0; i < els.filterTabs.length; i++) {
            els.filterTabs[i].addEventListener("click", onFilterTabClick);
        }

        if (els.categoryFilter) els.categoryFilter.addEventListener("change", onFormFiltersChange);
        if (els.shopFilter) els.shopFilter.addEventListener("change", onFormFiltersChange);
        if (els.minPriceInput) els.minPriceInput.addEventListener("input", onFormFiltersChange);
        if (els.maxPriceInput) els.maxPriceInput.addEventListener("input", onFormFiltersChange);
        if (els.productSearchInput) els.productSearchInput.addEventListener("input", onFormFiltersChange);
        if (els.resetFiltersBtn) els.resetFiltersBtn.addEventListener("click", resetFilters);

        if (els.prevPageBtn) {
            els.prevPageBtn.addEventListener("click", function () {
                if (state.page > 1) {
                    state.page--;
                    renderTable();
                }
            });
        }

        if (els.nextPageBtn) {
            els.nextPageBtn.addEventListener("click", function () {
                var totalPages = Math.max(1, Math.ceil(state.filteredProducts.length / state.pageSize));
                if (state.page < totalPages) {
                    state.page++;
                    renderTable();
                }
            });
        }

        if (els.productsTableBody) {
            els.productsTableBody.addEventListener("click", onTableClick);
        }

        if (els.previewViewBtn) {
            els.previewViewBtn.addEventListener("click", function () {
                var product = getSelectedProduct();
                if (product) openProductModal(product.id);
            });
        }

        if (els.previewApproveBtn) {
            els.previewApproveBtn.addEventListener("click", function () {
                var product = getSelectedProduct();
                if (product) handleApprove(product.id);
            });
        }

        if (els.previewRejectBtn) {
            els.previewRejectBtn.addEventListener("click", function () {
                var product = getSelectedProduct();
                if (product) handleReject(product.id);
            });
        }

        if (els.productModal) {
            els.productModal.addEventListener("click", function (event) {
                if (event.target === els.productModal) {
                    closeProductModal();
                }
            });
        }

        if (els.statusNoticeCloseBtn) {
            els.statusNoticeCloseBtn.addEventListener("click", closeStatusNoticeModal);
        }

        if (els.statusNoticeModal) {
            els.statusNoticeModal.addEventListener("click", function (event) {
                if (event.target === els.statusNoticeModal) {
                    closeStatusNoticeModal();
                }
            });
        }

        if (els.reasonPromptCloseBtn) {
            els.reasonPromptCloseBtn.addEventListener("click", closeReasonPromptModal);
        }

        if (els.reasonPromptCancelBtn) {
            els.reasonPromptCancelBtn.addEventListener("click", closeReasonPromptModal);
        }

        if (els.reasonPromptConfirmBtn) {
            els.reasonPromptConfirmBtn.addEventListener("click", submitReasonPrompt);
        }

        if (els.reasonPromptModal) {
            els.reasonPromptModal.addEventListener("click", function (event) {
                if (event.target === els.reasonPromptModal) {
                    closeReasonPromptModal();
                }
            });
        }
    }

    function hydrateCurrentUser() {
        var user = Auth.getCurrentUser();
        if (!user) return;

        if (els.topbarUserName) {
            els.topbarUserName.textContent = user.name || "Admin";
        }

        if (els.topbarAvatar) {
            var source = (user.name || "A").trim();
            els.topbarAvatar.textContent = source ? source.charAt(0).toUpperCase() : "A";
        }
    }

    function shopNameOf(product) {
        return (product.shop && product.shop.shopName) || ("Shop #" + product.shopId);
    }

    async function refresh() {
        try {
            var loaded = await Promise.all([Api.adminProducts.listAll(), Api.adminProducts.stats()]);
            state.products = loaded[0];
            state.stats = loaded[1];
        } catch (e) {
            AdminModal.alert("Could not load products: " + e.message, "error");
            return;
        }
        populateFilterOptions();
        renderStats();
        applyFilters();
    }

    function populateFilterOptions() {
        populateCategoryOptions();
        populateShopOptions();
    }

    function populateCategoryOptions() {
        if (!els.categoryFilter) return;

        var map = {};
        for (var i = 0; i < state.products.length; i++) {
            map[state.products[i].category] = true;
        }

        var keys = Object.keys(map).sort();
        var html = '<option value="all">All Categories</option>';
        for (var j = 0; j < keys.length; j++) {
            html += '<option value="' + escapeHtml(keys[j]) + '">' + escapeHtml(capitalize(keys[j])) + '</option>';
        }

        els.categoryFilter.innerHTML = html;
        els.categoryFilter.value = state.categoryFilter;
    }

    function populateShopOptions() {
        if (!els.shopFilter) return;

        var shops = {};
        for (var i = 0; i < state.products.length; i++) {
            var product = state.products[i];
            shops[product.shopId] = shopNameOf(product);
        }

        var html = '<option value="all">All Shops</option>';
        var shopIds = Object.keys(shops).sort(function (a, b) { return Number(a) - Number(b); });
        for (var j = 0; j < shopIds.length; j++) {
            html += '<option value="' + shopIds[j] + '">' + escapeHtml(shops[shopIds[j]]) + '</option>';
        }

        els.shopFilter.innerHTML = html;
        els.shopFilter.value = state.shopFilter;
    }

    function renderStats() {
        var stats = state.stats || { total: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 };
        if (els.statTotalProducts) els.statTotalProducts.textContent = stats.total || 0;
        if (els.statPendingProducts) els.statPendingProducts.textContent = stats.pending || 0;
        if (els.statApprovedProducts) els.statApprovedProducts.textContent = stats.approved || 0;
        if (els.statSuspendedProducts) els.statSuspendedProducts.textContent = stats.suspended || 0;
        if (els.statRejectedProducts) els.statRejectedProducts.textContent = stats.rejected || 0;
    }

    function applyFilters() {
        var result = [];
        var search = (state.searchQuery || "").toLowerCase().trim();
        var minPrice = state.minPrice === "" ? null : Number(state.minPrice);
        var maxPrice = state.maxPrice === "" ? null : Number(state.maxPrice);

        for (var i = 0; i < state.products.length; i++) {
            var product = state.products[i];
            var match = true;

            // Tab 1: Only pending products
            if (state.activeTab === "queue") {
                if (product.adminStatus !== "pending") continue;
            }

            // Tab 2: All except pending, with status filters
            if (state.activeTab === "all") {
                if (product.adminStatus === "pending") continue;
                // Apply status filter only in "all" tab
                if (state.statusFilter !== "all" && product.adminStatus !== state.statusFilter) match = false;
            }

            // Common filters for both tabs
            var shopName = shopNameOf(product);

            if (match && state.categoryFilter !== "all" && product.category !== state.categoryFilter) match = false;
            if (match && state.shopFilter !== "all" && String(product.shopId) !== String(state.shopFilter)) match = false;
            if (match && minPrice !== null && Number(product.price) < minPrice) match = false;
            if (match && maxPrice !== null && Number(product.price) > maxPrice) match = false;

            if (match && search) {
                var haystack = [product.name, product.category, shopName, String(product.id)].join(" ").toLowerCase();
                if (haystack.indexOf(search) === -1) match = false;
            }

            if (match) result.push(product);
        }

        state.filteredProducts = result;
        updateQueueBadge();

        var isSelectedInFiltered = false;
        for (var j = 0; j < state.filteredProducts.length; j++) {
            if (state.filteredProducts[j].id === state.selectedProductId) {
                isSelectedInFiltered = true;
                break;
            }
        }

        if (!isSelectedInFiltered) {
            state.selectedProductId = state.filteredProducts.length ? state.filteredProducts[0].id : null;
        }

        var totalPages = Math.max(1, Math.ceil(state.filteredProducts.length / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;
        if (state.page < 1) state.page = 1;

        renderTable();
        renderPreview();
    }

    function renderTable() {
        if (!els.productsTableBody) return;

        if (!state.filteredProducts.length) {
            els.productsTableBody.innerHTML = "";
            if (els.emptyState) els.emptyState.style.display = "block";
            updatePagination(0, 0, 0);
            return;
        }

        if (els.emptyState) els.emptyState.style.display = "none";

        var start = (state.page - 1) * state.pageSize;
        var end = Math.min(start + state.pageSize, state.filteredProducts.length);
        var items = state.filteredProducts.slice(start, end);
        var html = "";

        for (var i = 0; i < items.length; i++) {
            var product = items[i];
            var shopName = shopNameOf(product);
            var isPending = product.adminStatus === "pending";

            html += '' +
                '<tr data-id="' + product.id + '">' +
                    '<td>#' + product.id + '</td>' +
                    '<td>' +
                        '<div style="display:flex; align-items:center; gap:10px;">' +
                            renderThumb(product.image) +
                            '<div>' +
                                '<div style="font-weight:700; color:#191c1e;">' + escapeHtml(product.name) + '</div>' +
                                '<div style="font-size:12px; color:#7b8190;">' + escapeHtml(trimText(product.description, 48)) + '</div>' +
                            '</div>' +
                        '</div>' +
                    '</td>' +
                    '<td>' + escapeHtml(shopName) + '</td>' +
                    '<td>' + escapeHtml(capitalize(product.category)) + '</td>' +
                    '<td>$' + formatPrice(product.price) + '</td>' +
                    '<td>' + product.stock + '</td>' +
                    '<td><span class="badge ' + getStatusClass(product.adminStatus) + '">' + escapeHtml(capitalize(product.adminStatus)) + '</span></td>' +
                    '<td>' + escapeHtml(formatDateLabel(product.updatedAt || product.submittedAt)) + '</td>' +
                    '<td>' +
                        '<div class="icon-btn-group">' +
                            '<button class="icon-btn icon-btn-view" type="button" title="View" data-action="view" data-id="' + product.id + '"><i class="fa-solid fa-eye"></i></button>' +
                            (isPending ? '<button class="icon-btn icon-btn-approve" type="button" title="Approve" data-action="approve" data-id="' + product.id + '"><i class="fa-solid fa-circle-check"></i></button>' : '') +
                            (isPending ? '<button class="icon-btn icon-btn-reject" type="button" title="Reject" data-action="reject" data-id="' + product.id + '"><i class="fa-solid fa-circle-xmark"></i></button>' : '') +
                            (product.adminStatus === 'approved' ? '<button class="icon-btn icon-btn-suspend" type="button" title="Suspend" data-action="suspend" data-id="' + product.id + '"><i class="fa-solid fa-ban"></i></button>' : '') +
                            (product.adminStatus === 'suspended' ? '<button class="icon-btn icon-btn-restore" type="button" title="Restore" data-action="restore" data-id="' + product.id + '"><i class="fa-solid fa-rotate-left"></i></button>' : '') +
                        '</div>' +
                    '</td>' +
                '</tr>';
        }

        els.productsTableBody.innerHTML = html;
        updatePagination(start + 1, end, state.filteredProducts.length);
    }

    function renderPreview() {
        var product = getSelectedProduct();
        if (!product) {
            if (els.previewSubtext) els.previewSubtext.textContent = "No product selected yet.";
            if (els.previewProductName) els.previewProductName.textContent = "Choose a product";
            if (els.previewProductMeta) els.previewProductMeta.textContent = "Select a row to inspect its review details.";
            if (els.previewPrice) els.previewPrice.textContent = "$0";
            if (els.previewStock) els.previewStock.textContent = "-";
            if (els.previewCategory) els.previewCategory.textContent = "-";
            if (els.previewUpdated) els.previewUpdated.textContent = "-";
            if (els.previewDescription) els.previewDescription.textContent = "Product notes and description will appear here once a row is selected.";
            if (els.previewStatusBadge) {
                els.previewStatusBadge.className = "badge badge-pending-review";
                els.previewStatusBadge.textContent = "Pending";
            }
            if (els.previewHeroThumb) {
                els.previewHeroThumb.style.backgroundImage = "none";
                els.previewHeroThumb.innerHTML = '<i class="fa-solid fa-box"></i>';
            }
            setPreviewActionState(false);
            return;
        }

        var shopName = shopNameOf(product);

        if (els.previewSubtext) els.previewSubtext.textContent = "Product #" + product.id + " from " + shopName;
        if (els.previewProductName) els.previewProductName.textContent = product.name;
        if (els.previewProductMeta) els.previewProductMeta.textContent = shopName + " • " + capitalize(product.category) + " • " + product.reviews + " reviews";
        if (els.previewPrice) els.previewPrice.textContent = "$" + formatPrice(product.price);
        if (els.previewStock) els.previewStock.textContent = product.stock;
        if (els.previewCategory) els.previewCategory.textContent = capitalize(product.category);
        if (els.previewUpdated) els.previewUpdated.textContent = formatDateLabel(product.updatedAt || product.submittedAt);
        if (els.previewDescription) {
            els.previewDescription.textContent = product.description || (product.adminNote ? ("Admin note: " + product.adminNote) : "No description yet.");
        }
        if (els.previewStatusBadge) {
            els.previewStatusBadge.className = "badge " + getStatusClass(product.adminStatus);
            els.previewStatusBadge.textContent = capitalize(product.adminStatus);
        }
        if (els.previewHeroThumb) {
            if (product.image) {
                els.previewHeroThumb.innerHTML = "";
                els.previewHeroThumb.style.backgroundImage = 'url("' + product.image + '")';
                els.previewHeroThumb.style.backgroundSize = "cover";
                els.previewHeroThumb.style.backgroundPosition = "center";
            } else {
                els.previewHeroThumb.style.backgroundImage = "none";
                els.previewHeroThumb.innerHTML = '<i class="fa-solid fa-box"></i>';
            }
        }

        setPreviewActionState(product.adminStatus === "pending");
    }

    function setPreviewActionState(canReview) {
        if (els.previewApproveBtn) {
            els.previewApproveBtn.disabled = !canReview;
            els.previewApproveBtn.style.opacity = canReview ? "1" : "0.55";
        }
        if (els.previewRejectBtn) {
            els.previewRejectBtn.disabled = !canReview;
            els.previewRejectBtn.style.opacity = canReview ? "1" : "0.55";
        }
    }

    function updatePagination(start, end, total) {
        var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
        if (els.paginationInfo) {
            els.paginationInfo.textContent = total ? ("Showing " + start + "-" + end + " of " + total + " products") : "Showing 0-0 of 0 products";
        }
        if (els.paginationPageLabel) {
            els.paginationPageLabel.textContent = "Page " + state.page + " / " + totalPages;
        }
        if (els.prevPageBtn) els.prevPageBtn.disabled = state.page <= 1;
        if (els.nextPageBtn) els.nextPageBtn.disabled = state.page >= totalPages;
    }

    function onFilterTabClick(event) {
        var tab = event.currentTarget;
        state.statusFilter = tab.getAttribute("data-filter") || "all";
        state.page = 1;

        for (var i = 0; i < els.filterTabs.length; i++) {
            els.filterTabs[i].classList.remove("active");
        }
        tab.classList.add("active");
        applyFilters();
    }

    function onTabSwitch(event) {
        var tab = event.currentTarget;
        state.activeTab = tab.getAttribute("data-tab") || "queue";
        state.statusFilter = "all";
        state.page = 1;

        for (var i = 0; i < els.tabSwitchers.length; i++) {
            els.tabSwitchers[i].classList.remove("active");
        }
        tab.classList.add("active");

        // Reset filter tabs to "all" when switching main tabs
        for (var j = 0; j < els.filterTabs.length; j++) {
            els.filterTabs[j].classList.toggle("active", els.filterTabs[j].getAttribute("data-filter") === "all");
        }

        // Hide status filter tabs when in Review Queue
        var filterTabsContainer = document.getElementById("filterTabsContainer");
        if (filterTabsContainer) {
            filterTabsContainer.style.display = state.activeTab === "queue" ? "none" : "flex";
        }

        applyFilters();
    }

    function updateQueueBadge() {
        if (!els.queueBadge) return;
        var pendingCount = 0;
        for (var i = 0; i < state.products.length; i++) {
            if (state.products[i].adminStatus === "pending") pendingCount++;
        }
        els.queueBadge.textContent = pendingCount;
        els.queueBadge.style.display = pendingCount > 0 ? "inline-flex" : "none";
    }

    function onFormFiltersChange() {
        state.categoryFilter = els.categoryFilter ? els.categoryFilter.value : "all";
        state.shopFilter = els.shopFilter ? els.shopFilter.value : "all";
        state.searchQuery = els.productSearchInput ? els.productSearchInput.value : "";
        state.minPrice = els.minPriceInput ? els.minPriceInput.value : "";
        state.maxPrice = els.maxPriceInput ? els.maxPriceInput.value : "";
        state.page = 1;
        applyFilters();
    }

    function resetFilters() {
        state.statusFilter = "all";
        state.categoryFilter = "all";
        state.shopFilter = "all";
        state.searchQuery = "";
        state.minPrice = "";
        state.maxPrice = "";
        state.page = 1;

        if (els.categoryFilter) els.categoryFilter.value = "all";
        if (els.shopFilter) els.shopFilter.value = "all";
        if (els.productSearchInput) els.productSearchInput.value = "";
        if (els.minPriceInput) els.minPriceInput.value = "";
        if (els.maxPriceInput) els.maxPriceInput.value = "";

        for (var i = 0; i < els.filterTabs.length; i++) {
            els.filterTabs[i].classList.toggle("active", els.filterTabs[i].getAttribute("data-filter") === "all");
        }

        applyFilters();
    }

    function onTableClick(event) {
        var actionButton = event.target.closest("[data-action]");
        if (actionButton) {
            var action = actionButton.getAttribute("data-action");
            var productId = Number(actionButton.getAttribute("data-id"));
            state.selectedProductId = productId;
            renderPreview();

            if (action === "view") openProductModal(productId);
            if (action === "approve") handleApprove(productId);
            if (action === "reject") handleReject(productId);
            if (action === "suspend") handleSuspend(productId);
            if (action === "restore") handleRestore(productId);
            return;
        }

        var row = event.target.closest("tr[data-id]");
        if (row) {
            state.selectedProductId = Number(row.getAttribute("data-id"));
            renderPreview();
        }
    }

    function handleApprove(productId) {
        var product = findProductById(productId);
        if (!product) return;

        AdminModal.confirm('Approve "' + product.name + '"?', async function () {
            var result = await Api.adminProducts.review(productId, "approved");
            if (!result || !result.success) {
                AdminModal.alert(result && result.error ? result.error : "Unable to approve this product.", "error");
                return;
            }
            AdminModal.alert("Product approved successfully.", "success");
            refresh();
        });
    }

    function handleReject(productId) {
        var product = findProductById(productId);
        if (!product) return;

        openReasonPromptModal({
            title: "Reject Product",
            description: 'Provide a rejection reason for "' + product.name + '".',
            label: "Rejection reason",
            placeholder: "Explain what needs to be fixed before approval...",
            defaultValue: product.adminNote || "",
            required: true,
            errorMessage: "A rejection reason is required.",
            confirmLabel: "Reject"
        }, async function (note) {
            var result = await Api.adminProducts.review(productId, "rejected", note);
            if (!result || !result.success) {
                AdminModal.alert(result && result.error ? result.error : "Unable to reject this product.", "error");
                return;
            }
            AdminModal.alert("Product rejected successfully.", "success");
            refresh();
        });
    }

    function handleSuspend(productId) {
        var product = findProductById(productId);
        if (!product) return;

        openReasonPromptModal({
            title: "Suspend Product",
            description: 'Enter a suspension reason for "' + product.name + '".',
            label: "Suspension reason",
            placeholder: "Reason for suspending this product...",
            defaultValue: "",
            required: true,
            errorMessage: "A suspension reason is required.",
            confirmLabel: "Continue"
        }, function (note) {
            AdminModal.confirm('Suspend "' + product.name + '"?' + (note ? ' Reason: ' + note : ''), async function () {
                var result = await Api.adminProducts.suspend(productId, note);
                if (!result || !result.success) {
                    AdminModal.alert(result && result.error ? result.error : "Unable to suspend this product.", "error");
                    return;
                }
                showStatusNotice("suspend", product.name, note);
                refresh();
            });
        });
    }

    function handleRestore(productId) {
        var product = findProductById(productId);
        if (!product) return;

        AdminModal.confirm('Restore "' + product.name + '"?', async function () {
            var result = await Api.adminProducts.restore(productId);
            if (!result || !result.success) {
                AdminModal.alert(result && result.error ? result.error : "Unable to restore this product.", "error");
                return;
            }
            showStatusNotice("restore", product.name);
            refresh();
        });
    }

    function openProductModal(productId) {
        var product = findProductById(productId);
        if (!product || !els.productModal) return;

        var shopName = shopNameOf(product);

        if (els.productModalTitle) {
            els.productModalTitle.textContent = "Product #" + product.id + " details";
        }

        if (els.productModalBody) {
            els.productModalBody.innerHTML = '' +
                '<div style="display:grid; gap:12px;">' +
                    '<div style="display:flex; gap:16px; align-items:flex-start;">' +
                        renderLargeThumb(product.image) +
                        '<div style="flex:1;">' +
                            '<h4 style="margin:0 0 6px; font-size:18px; font-weight:800; color:#191c1e;">' + escapeHtml(product.name) + '</h4>' +
                            '<div style="color:#7b8190; margin-bottom:8px;">' + escapeHtml(shopName) + '</div>' +
                            '<span class="badge ' + getStatusClass(product.adminStatus) + '">' + escapeHtml(capitalize(product.adminStatus)) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-detail-row"><span>Category</span><strong>' + escapeHtml(capitalize(product.category)) + '</strong></div>' +
                    '<div class="modal-detail-row"><span>Price</span><strong>$' + formatPrice(product.price) + '</strong></div>' +
                    '<div class="modal-detail-row"><span>Stock</span><strong>' + product.stock + '</strong></div>' +
                    '<div class="modal-detail-row"><span>Submitted</span><strong>' + escapeHtml(formatDateLabel(product.submittedAt || product.createdAt)) + '</strong></div>' +
                    '<div class="modal-detail-row"><span>Reviewed by</span><strong>' + escapeHtml(product.reviewedBy || "-") + '</strong></div>' +
                    '<div class="modal-detail-row">' +
                        '<span>Admin Note</span>' +
                        '<strong style="color:' + (product.adminNote ? '#f87272' : '#9ca3af') + ';">' +
                            escapeHtml(product.adminNote || "—") +
                        '</strong>' +
                    '</div>' +
                    '<div style="padding-top:8px; color:#475467; line-height:1.6;">' + escapeHtml(product.description || "No description.") + '</div>' +
                '</div>';
        }

        if (els.productModalFooter) {
            var footerHtml = '<button class="modal-btn close" type="button" id="productModalCloseBtn">Close</button>';

            if (product.adminStatus === "pending") {
                footerHtml += '<button class="modal-btn reject"  type="button" id="productModalRejectBtn">Reject</button>';
                footerHtml += '<button class="modal-btn approve" type="button" id="productModalApproveBtn">Approve</button>';
            }

            if (product.adminStatus === "approved") {
                footerHtml += '<button class="modal-btn suspend" type="button" id="productModalSuspendBtn">Suspend</button>';
            }

            if (product.adminStatus === "suspended") {
                footerHtml += '<button class="modal-btn restore" type="button" id="productModalRestoreBtn">Restore</button>';
            }

            // rejected → only has Close, no additional buttons

            els.productModalFooter.innerHTML = footerHtml;

            // Bind events
            var closeBtn   = document.getElementById("productModalCloseBtn");
            var rejectBtn  = document.getElementById("productModalRejectBtn");
            var approveBtn = document.getElementById("productModalApproveBtn");
            var suspendBtn = document.getElementById("productModalSuspendBtn");
            var restoreBtn = document.getElementById("productModalRestoreBtn");

            if (closeBtn)   closeBtn.addEventListener("click", closeProductModal);
            if (rejectBtn)  rejectBtn.addEventListener("click",  function () { closeProductModal(); handleReject(product.id); });
            if (approveBtn) approveBtn.addEventListener("click", function () { closeProductModal(); handleApprove(product.id); });
            if (suspendBtn) suspendBtn.addEventListener("click", function () { closeProductModal(); handleSuspend(product.id); });
            if (restoreBtn) restoreBtn.addEventListener("click", function () { closeProductModal(); handleRestore(product.id); });
        }

        els.productModal.classList.add("show");
    }

    function closeProductModal() {
        if (els.productModal) {
            els.productModal.classList.remove("show");
        }
    }

    function showStatusNotice(type, productName, note) {
        if (!els.statusNoticeModal || !els.statusNoticePanel) return;

        var safeName = productName || "This product";
        var isSuspend = type === "suspend";

        els.statusNoticePanel.classList.toggle("suspend", isSuspend);
        els.statusNoticePanel.classList.toggle("restore", !isSuspend);

        if (els.statusNoticeIcon) {
            els.statusNoticeIcon.innerHTML = isSuspend
                ? '<i class="fa-solid fa-triangle-exclamation"></i>'
                : '<i class="fa-solid fa-arrow-rotate-left"></i>';
        }

        if (els.statusNoticeTitle) {
            els.statusNoticeTitle.textContent = isSuspend ? "Product Suspended" : "Product Restored";
        }

        if (els.statusNoticeMessage) {
            els.statusNoticeMessage.textContent = isSuspend
                ? '"' + safeName + '" has been suspended and is now hidden from customer view.'
                : '"' + safeName + '" has been restored and is active in the marketplace again.';
        }

        if (els.statusNoticeNote) {
            if (isSuspend && note) {
                els.statusNoticeNote.style.display = "block";
                els.statusNoticeNote.innerHTML = "<strong>Suspension reason:</strong> " + escapeHtml(note);
            } else {
                els.statusNoticeNote.style.display = "none";
                els.statusNoticeNote.innerHTML = "";
            }
        }

        els.statusNoticeModal.classList.add("show");
    }

    function closeStatusNoticeModal() {
        if (els.statusNoticeModal) {
            els.statusNoticeModal.classList.remove("show");
        }
    }

    function openReasonPromptModal(config, onConfirm) {
        if (!els.reasonPromptModal || !els.reasonPromptInput) return;

        reasonPromptContext = {
            required: !!config.required,
            errorMessage: config.errorMessage || "This field is required.",
            onConfirm: onConfirm
        };

        if (els.reasonPromptTitle) {
            els.reasonPromptTitle.textContent = config.title || "Provide a reason";
        }
        if (els.reasonPromptDescription) {
            els.reasonPromptDescription.textContent = config.description || "Please provide a note before continuing.";
        }
        if (els.reasonPromptLabel) {
            els.reasonPromptLabel.textContent = config.label || "Reason";
        }
        if (els.reasonPromptInput) {
            els.reasonPromptInput.value = config.defaultValue || "";
            els.reasonPromptInput.placeholder = config.placeholder || "Type here...";
        }
        if (els.reasonPromptConfirmBtn) {
            els.reasonPromptConfirmBtn.textContent = config.confirmLabel || "Confirm";
        }
        if (els.reasonPromptError) {
            els.reasonPromptError.style.display = "none";
            els.reasonPromptError.textContent = "";
        }

        els.reasonPromptModal.classList.add("show");
        els.reasonPromptInput.focus();
        els.reasonPromptInput.select();
    }

    function submitReasonPrompt() {
        if (!reasonPromptContext || !els.reasonPromptInput) return;

        var value = els.reasonPromptInput.value.trim();
        if (reasonPromptContext.required && !value) {
            if (els.reasonPromptError) {
                els.reasonPromptError.textContent = reasonPromptContext.errorMessage;
                els.reasonPromptError.style.display = "block";
            }
            els.reasonPromptInput.focus();
            return;
        }

        if (els.reasonPromptError) {
            els.reasonPromptError.style.display = "none";
            els.reasonPromptError.textContent = "";
        }

        var callback = reasonPromptContext.onConfirm;
        closeReasonPromptModal();
        if (typeof callback === "function") {
            callback(value);
        }
    }

    function closeReasonPromptModal() {
        if (els.reasonPromptModal) {
            els.reasonPromptModal.classList.remove("show");
        }
        reasonPromptContext = null;
    }

    function getSelectedProduct() {
        return findProductById(state.selectedProductId);
    }

    function findProductById(productId) {
        for (var i = 0; i < state.products.length; i++) {
            if (state.products[i].id === productId) return state.products[i];
        }
        return null;
    }

    function formatPrice(value) {
        return Number(value || 0).toLocaleString("en-US");
    }

    function formatDateLabel(value) {
        if (!value) return "-";
        return String(value).split("T")[0];
    }

    function trimText(text, maxLength) {
        if (!text) return "";
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength - 3) + "...";
    }

    function capitalize(value) {
        if (!value) return "-";
        var words = String(value).replace(/[-_]+/g, " ").split(" ");
        for (var i = 0; i < words.length; i++) {
            if (words[i]) {
                words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
            }
        }
        return words.join(" ");
    }

    function getStatusClass(status) {
        if (status === "approved") return "badge-approved";
        if (status === "suspended") return "badge-suspended";
        if (status === "rejected") return "badge-rejected";
        return "badge-pending-review";
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderThumb(image) {
        if (image) {
            return '<div style="width:44px; height:44px; border-radius:10px; overflow:hidden; background:#f5f5f5; flex-shrink:0;"><img src="' + image + '" alt="Product" style="width:100%; height:100%; object-fit:cover;"></div>';
        }
        return '<div style="width:44px; height:44px; border-radius:10px; background:#eef2ff; display:flex; align-items:center; justify-content:center; color:#4f46e5; flex-shrink:0;"><i class="fa-solid fa-box"></i></div>';
    }

    function renderLargeThumb(image) {
        if (image) {
            return '<div style="width:90px; height:90px; border-radius:14px; overflow:hidden; background:#f5f5f5; flex-shrink:0;"><img src="' + image + '" alt="Product" style="width:100%; height:100%; object-fit:cover;"></div>';
        }
        return '<div style="width:90px; height:90px; border-radius:14px; background:#eef2ff; display:flex; align-items:center; justify-content:center; color:#4f46e5; flex-shrink:0;"><i class="fa-solid fa-box-open"></i></div>';
    }

    return {
        init: init,
        closeProductModal: closeProductModal
    };
})();

window.closeProductModal = ProductAdminPage.closeProductModal;

document.addEventListener("DOMContentLoaded", function () {
    ProductAdminPage.init();
});