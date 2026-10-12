// dashboard-nav.js: on phones the dashboard sidebar is a horizontal strip of links; scroll it so the
// current page's link is in view instead of hidden past the right edge.
(function () {
    var active = document.querySelector(".sidebar-nav .nav-item.active");
    if (!active) return;
    var strip = active.parentNode;
    if (strip.scrollWidth > strip.clientWidth) strip.scrollLeft = active.offsetLeft - 12;
})();
